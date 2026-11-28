#!/usr/bin/env node
/**
 * Initialize, snapshot, or query TinyPivot telemetry & growth tables in Neon Postgres.
 *
 * Usage:
 *   node scripts/telemetry-stats.mjs --init            # create/migrate telemetry_events + growth_daily
 *   node scripts/telemetry-stats.mjs --snapshot        # snapshot last 14d npm + today's GitHub stats
 *   node scripts/telemetry-stats.mjs --backfill 90     # backfill 90d of npm history + GitHub stats
 *   node scripts/telemetry-stats.mjs                   # 30d report (external MCP + UI/npm + GitHub)
 *   node scripts/telemetry-stats.mjs --days 7          # 7d report
 *   node scripts/telemetry-stats.mjs --include-self    # include local anonId & *-local bench clients
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { neon } from '@neondatabase/serverless'

const NPM_PACKAGES = [
  '@smallwebco/tinypivot-core',
  '@smallwebco/tinypivot-react',
  '@smallwebco/tinypivot-vue',
  '@smallwebco/tinypivot-server',
  '@smallwebco/tinypivot-mcp',
]

const GITHUB_REPOS = [
  'Small-Web-Co/tinypivot',
  'Small-Web-Co/tinypivot-plugin',
]

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS telemetry_events (
    id         BIGSERIAL PRIMARY KEY,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
    event      TEXT NOT NULL,
    tier       TEXT NOT NULL,
    tool       TEXT,
    row_bucket TEXT,
    client     TEXT,
    truncated  BOOLEAN,
    outcome    TEXT,
    error_code TEXT,
    feature    TEXT,
    version    TEXT,
    os         TEXT,
    anon_id    TEXT,
    country    TEXT
  )`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS outcome TEXT`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS error_code TEXT`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS feature TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_ts ON telemetry_events (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_anon_ts ON telemetry_events (anon_id, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_ts ON telemetry_events (event, ts DESC)`,
  `CREATE TABLE IF NOT EXISTS growth_daily (
    day        DATE NOT NULL,
    source     TEXT NOT NULL,
    metric     TEXT NOT NULL,
    value      INTEGER NOT NULL,
    meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (day, source, metric)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_growth_daily_source_day ON growth_daily (source, metric, day DESC)`,
]

function readLocalAnonId() {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  const prefPath = path.join(base, 'tinypivot', 'preferences.json')
  try {
    const parsed = JSON.parse(fs.readFileSync(prefPath, 'utf8'))
    return typeof parsed.anonId === 'string' ? parsed.anonId : null
  }
  catch {
    return null
  }
}

function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN?.trim())
    return process.env.GITHUB_TOKEN.trim()
  try {
    const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return token || undefined
  }
  catch {
    return undefined
  }
}

function parseEnvFileValue(content, keys) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eq = trimmed.indexOf('=')
    if (eq === -1)
      continue
    const k = trimmed.slice(0, eq).trim()
    if (!keys.includes(k))
      continue
    let v = trimmed.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\'')))
      v = v.slice(1, -1)
    if (v)
      return v
  }
  return null
}

function resolveDatabaseUrl(preferUnpooled) {
  const keys = preferUnpooled
    ? ['DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'POSTGRES_URL']
    : ['DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED']

  for (const k of keys) {
    if (process.env[k]?.trim())
      return process.env[k].trim()
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-vercel-env-'))
  const tmpEnv = path.join(tmpDir, '.env.pulled')
  try {
    execFileSync('vercel', ['env', 'pull', tmpEnv, '--environment', 'production', '--yes'], {
      stdio: 'ignore',
    })
    const content = fs.readFileSync(tmpEnv, 'utf8')
    const url = parseEnvFileValue(content, keys)
    if (!url)
      throw new Error('DATABASE_URL not found in Vercel production env.')
    return url
  }
  finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function parseArgs(argv) {
  const init = argv.includes('--init')
  const snapshot = argv.includes('--snapshot')
  const includeSelf = argv.includes('--include-self')
  const daysIdx = argv.indexOf('--days')
  const days = daysIdx !== -1 && argv[daysIdx + 1] ? Math.max(1, Number.parseInt(argv[daysIdx + 1], 10) || 30) : 30
  const backfillIdx = argv.indexOf('--backfill')
  const backfillDays = backfillIdx !== -1
    ? Math.max(1, Math.min(365, Number.parseInt(argv[backfillIdx + 1] || '90', 10) || 90))
    : null
  return { init, snapshot, backfillDays, includeSelf, days }
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tinypivot-growth-snapshot', ...headers },
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined,
  })
  if (!res.ok)
    throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.json()
}

function nextUtcDay(isoDay) {
  const dt = new Date(`${isoDay}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

async function runInit(sql) {
  for (const stmt of SCHEMA_STATEMENTS)
    await sql.query(stmt)
  console.log('Schema ready: telemetry_events + growth_daily verified.')
}

async function runSnapshot(sql, lookbackDays) {
  const now = new Date()
  const todayUtc = now.toISOString().slice(0, 10)
  const startDay = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10)
  const ghToken = resolveGithubToken()
  const rows = []

  for (const pkg of NPM_PACKAGES) {
    const encoded = encodeURIComponent(pkg)
    const [meta, range, versions] = await Promise.all([
      fetchJson(`https://registry.npmjs.org/${encoded}`),
      fetchJson(`https://api.npmjs.org/downloads/range/${startDay}:${todayUtc}/${encoded}`),
      fetchJson(`https://api.npmjs.org/versions/${encoded}/last-week`).catch(() => ({ downloads: undefined })),
    ])
    const publishWindow = new Set()
    const versionsByDay = new Map()
    for (const [ver, ts] of Object.entries(meta.time ?? {})) {
      if (ver === 'created' || ver === 'modified' || typeof ts !== 'string' || ts.length < 10)
        continue
      const day = ts.slice(0, 10)
      versionsByDay.set(day, (versionsByDay.get(day) ?? 0) + 1)
      publishWindow.add(day)
      publishWindow.add(nextUtcDay(day))
    }
    const topVersions = versions.downloads
      ? Object.fromEntries(Object.entries(versions.downloads).sort((a, b) => b[1] - a[1]).slice(0, 8))
      : undefined
    const dls = range.downloads ?? []
    const latestNonZero = [...dls].reverse().find(d => d.downloads > 0)?.day
    for (const d of dls) {
      rows.push({
        day: d.day,
        source: 'npm',
        metric: pkg,
        value: d.downloads,
        meta: {
          isPublishWindow: publishWindow.has(d.day),
          versionsPublished: versionsByDay.get(d.day) ?? 0,
          ...(d.day === latestNonZero && topVersions ? { topVersions } : {}),
        },
      })
    }
  }

  for (const repo of GITHUB_REPOS) {
    const headers = { Accept: 'application/vnd.github+json', ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}) }
    const info = await fetchJson(`https://api.github.com/repos/${repo}`, headers)
    const meta = { forks: info.forks_count ?? 0, openIssues: info.open_issues_count ?? 0 }
    if (ghToken) {
      const [views, clones] = await Promise.all([
        fetchJson(`https://api.github.com/repos/${repo}/traffic/views`, headers).catch(() => null),
        fetchJson(`https://api.github.com/repos/${repo}/traffic/clones`, headers).catch(() => null),
      ])
      if (views) {
        meta.views14d = views.count ?? 0
        meta.uniqueViews14d = views.uniques ?? 0
      }
      if (clones) {
        meta.clones14d = clones.count ?? 0
        meta.uniqueClones14d = clones.uniques ?? 0
      }
    }
    rows.push({ day: todayUtc, source: 'github', metric: repo, value: info.stargazers_count ?? 0, meta })
  }

  for (const row of rows) {
    await sql`
      INSERT INTO growth_daily (day, source, metric, value, meta, updated_at)
      VALUES (${row.day}::date, ${row.source}, ${row.metric}, ${row.value}, ${JSON.stringify(row.meta)}::jsonb, now())
      ON CONFLICT (day, source, metric) DO UPDATE SET
        value = EXCLUDED.value,
        meta = CASE
          WHEN EXCLUDED.meta ? 'topVersions' THEN EXCLUDED.meta
          WHEN growth_daily.meta ? 'topVersions' THEN EXCLUDED.meta || jsonb_build_object('topVersions', growth_daily.meta->'topVersions')
          ELSE EXCLUDED.meta
        END,
        updated_at = now()
    `
  }

  console.log(`Growth snapshot complete: upserted ${rows.length} rows (${lookbackDays}d npm + GitHub).`)
}

async function runStats(sql, { days, includeSelf }) {
  const selfAnonId = includeSelf ? null : readLocalAnonId()
  const excludeLocal = !includeSelf

  const [totals] = await sql`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT anon_id)::int AS unique_anons,
      COUNT(*) FILTER (WHERE event = 'init')::int AS inits,
      COUNT(*) FILTER (WHERE event = 'server_start')::int AS starts,
      COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls,
      COUNT(*) FILTER (WHERE event = 'tool_call' AND outcome = 'error')::int AS tool_errors,
      COUNT(*) FILTER (WHERE event = 'gate_hit')::int AS gate_hits,
      COUNT(DISTINCT anon_id) FILTER (WHERE tier = 'pro')::int AS pro_anons
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
  `

  const daily = await sql`
    SELECT
      to_char(date_trunc('day', ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(DISTINCT anon_id)::int AS anons,
      COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls,
      COUNT(*) FILTER (WHERE event = 'gate_hit')::int AS gates
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 30
  `

  const byClient = await sql`
    SELECT
      COALESCE(client, '(unknown)') AS client,
      COUNT(DISTINCT anon_id)::int AS anons,
      COUNT(*)::int AS events
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1
    ORDER BY anons DESC, events DESC
    LIMIT 15
  `

  const byTool = await sql`
    SELECT
      tool,
      COUNT(DISTINCT anon_id)::int AS anons,
      COUNT(*)::int AS calls,
      COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND event = 'tool_call'
      AND tool IS NOT NULL
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1
    ORDER BY calls DESC
    LIMIT 15
  `

  const byError = await sql`
    SELECT
      error_code,
      COALESCE(tool, '(none)') AS tool,
      COUNT(*)::int AS hits
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND error_code IS NOT NULL
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1, 2
    ORDER BY hits DESC
    LIMIT 10
  `

  const byGate = await sql`
    SELECT
      COALESCE(feature, '(unknown)') AS feature,
      COUNT(DISTINCT anon_id)::int AS anons,
      COUNT(*)::int AS hits
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND event = 'gate_hit'
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1
    ORDER BY hits DESC
    LIMIT 10
  `

  const byCountry = await sql`
    SELECT
      COALESCE(country, '(unknown)') AS country,
      COUNT(DISTINCT anon_id)::int AS anons,
      COUNT(*)::int AS events
    FROM telemetry_events
    WHERE ts >= now() - (${days}::int * INTERVAL '1 day')
      AND (${excludeLocal} = false OR (
        COALESCE(anon_id, '') <> COALESCE(${selfAnonId}, '')
        AND COALESCE(client, '') NOT LIKE '%-local'
      ))
    GROUP BY 1
    ORDER BY anons DESC, events DESC
    LIMIT 15
  `

  const npmTrend = await sql`
    SELECT
      metric,
      ROUND(AVG(value) FILTER (
        WHERE day >= CURRENT_DATE - 30
          AND EXTRACT(ISODOW FROM day) < 6
          AND COALESCE((meta->>'isPublishWindow')::boolean, false) = false
          AND value > 0
      ), 1) AS cur_wkday_avg,
      ROUND(AVG(value) FILTER (
        WHERE day >= CURRENT_DATE - 60 AND day < CURRENT_DATE - 30
          AND EXTRACT(ISODOW FROM day) < 6
          AND COALESCE((meta->>'isPublishWindow')::boolean, false) = false
          AND value > 0
      ), 1) AS prev_wkday_avg,
      SUM(value) FILTER (WHERE day >= CURRENT_DATE - 30)::int AS raw_30d
    FROM growth_daily
    WHERE source = 'npm'
    GROUP BY metric
    ORDER BY metric
  `.catch(() => [])

  const ghLatest = await sql`
    SELECT DISTINCT ON (metric)
      metric,
      to_char(day, 'YYYY-MM-DD') AS day,
      value AS stars,
      meta
    FROM growth_daily
    WHERE source = 'github'
    ORDER BY metric, day DESC
  `.catch(() => [])

  const scopeLabel = includeSelf ? 'ALL (including local dev/bench)' : 'EXTERNAL ONLY (excluding local anonId & *-local)'
  console.log(`\nTinyPivot MCP Telemetry — Last ${days}d [${scopeLabel}]`)
  console.log(`Totals: ${totals.unique_anons} unique anonIds (${totals.pro_anons} pro) | ${totals.total_events} events (${totals.inits} inits, ${totals.starts} starts, ${totals.tool_calls} tools [${totals.tool_errors} err], ${totals.gate_hits} gates)`)

  if (daily.length > 0) {
    console.log('\nDaily (UTC):')
    for (const r of daily)
      console.log(`  ${r.day}  anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}  tools=${String(r.tool_calls).padStart(5)}  gates=${String(r.gates).padStart(4)}`)
  }
  if (byClient.length > 0) {
    console.log('\nBy Client:')
    for (const r of byClient)
      console.log(`  ${r.client.padEnd(24)} anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}`)
  }
  if (byTool.length > 0) {
    console.log('\nTop Tools:')
    for (const r of byTool)
      console.log(`  ${r.tool.padEnd(24)} anons=${String(r.anons).padStart(4)}  calls=${String(r.calls).padStart(5)}  errors=${String(r.errors).padStart(4)}`)
  }
  if (byError.length > 0) {
    console.log('\nErrors (enum-only):')
    for (const r of byError)
      console.log(`  ${r.error_code.padEnd(20)} tool=${r.tool.padEnd(18)} hits=${String(r.hits).padStart(4)}`)
  }
  if (byGate.length > 0) {
    console.log('\nPro Gate Hits:')
    for (const r of byGate)
      console.log(`  ${r.feature.padEnd(24)} anons=${String(r.anons).padStart(4)}  hits=${String(r.hits).padStart(5)}`)
  }
  if (byCountry.length > 0) {
    console.log('\nBy Country:')
    for (const r of byCountry)
      console.log(`  ${r.country.padEnd(10)} anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}`)
  }
  if (npmTrend.length > 0) {
    console.log('\nnpm Clean Weekday Avg (excluding publish-day mirrors):')
    for (const r of npmTrend)
      console.log(`  ${r.metric.padEnd(30)} last30d=${String(r.cur_wkday_avg ?? '-').padStart(6)}/wkday  prev30d=${String(r.prev_wkday_avg ?? '-').padStart(6)}/wkday  raw30d=${String(r.raw_30d ?? 0).padStart(6)}`)
  }
  if (ghLatest.length > 0) {
    console.log('\nGitHub Latest Snapshot:')
    for (const r of ghLatest) {
      const m = r.meta ?? {}
      const traffic = m.uniqueViews14d !== undefined ? `  views14d=${m.views14d} (${m.uniqueViews14d} uniq)` : ''
      console.log(`  ${r.metric.padEnd(30)} stars=${String(r.stars).padStart(4)}  forks=${String(m.forks ?? 0).padStart(3)}${traffic}  (${r.day})`)
    }
  }
}

const opts = parseArgs(process.argv.slice(2))
const dbUrl = resolveDatabaseUrl(opts.init)
const sql = neon(dbUrl)

if (opts.init)
  await runInit(sql)
else if (opts.backfillDays)
  await runSnapshot(sql, opts.backfillDays)
else if (opts.snapshot)
  await runSnapshot(sql, 14)
else
  await runStats(sql, opts)
