#!/usr/bin/env node
/**
 * Initialize or query the Neon Postgres `telemetry_events` table.
 *
 * Usage:
 *   node scripts/telemetry-stats.mjs --init          # create table & indexes (idempotent)
 *   node scripts/telemetry-stats.mjs                 # last 30d stats (excluding local dev/bench)
 *   node scripts/telemetry-stats.mjs --days 7        # last 7d stats
 *   node scripts/telemetry-stats.mjs --include-self  # include local anonId & *-local bench clients
 *
 * Resolves DATABASE_URL from the environment, or pulls it temporarily from Vercel
 * into an ephemeral temp file that is removed immediately after reading.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { neon } from '@neondatabase/serverless'

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
    version    TEXT,
    os         TEXT,
    anon_id    TEXT,
    country    TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_ts ON telemetry_events (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_anon_ts ON telemetry_events (anon_id, ts DESC)`,
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
  const includeSelf = argv.includes('--include-self')
  const daysIdx = argv.indexOf('--days')
  const days = daysIdx !== -1 && argv[daysIdx + 1] ? Math.max(1, Number.parseInt(argv[daysIdx + 1], 10) || 30) : 30
  return { init, includeSelf, days }
}

async function runInit(sql) {
  for (const stmt of SCHEMA_STATEMENTS)
    await sql.query(stmt)
  console.log('Schema ready: telemetry_events + indexes verified.')
}

async function runStats(sql, { days, includeSelf }) {
  const selfAnonId = includeSelf ? null : readLocalAnonId()
  const excludeLocal = !includeSelf

  const [totals] = await sql`
    SELECT
      COUNT(*)::int AS total_events,
      COUNT(DISTINCT anon_id)::int AS unique_anons,
      COUNT(*) FILTER (WHERE event = 'server_start')::int AS starts,
      COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls,
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
      COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls
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
      COUNT(*)::int AS calls
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

  const scopeLabel = includeSelf ? 'ALL (including local dev/bench)' : 'EXTERNAL ONLY (excluding local anonId & *-local)'
  console.log(`\nTinyPivot MCP Telemetry — Last ${days}d [${scopeLabel}]`)
  console.log(`Totals: ${totals.unique_anons} unique anonIds (${totals.pro_anons} pro) | ${totals.total_events} events (${totals.starts} starts, ${totals.tool_calls} tool calls)`)

  if (daily.length > 0) {
    console.log('\nDaily (UTC):')
    for (const r of daily)
      console.log(`  ${r.day}  anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}  tools=${String(r.tool_calls).padStart(5)}`)
  }
  if (byClient.length > 0) {
    console.log('\nBy Client:')
    for (const r of byClient)
      console.log(`  ${r.client.padEnd(24)} anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}`)
  }
  if (byTool.length > 0) {
    console.log('\nTop Tools:')
    for (const r of byTool)
      console.log(`  ${r.tool.padEnd(24)} anons=${String(r.anons).padStart(4)}  calls=${String(r.calls).padStart(5)}`)
  }
  if (byCountry.length > 0) {
    console.log('\nBy Country:')
    for (const r of byCountry)
      console.log(`  ${r.country.padEnd(10)} anons=${String(r.anons).padStart(4)}  events=${String(r.events).padStart(5)}`)
  }
}

const opts = parseArgs(process.argv.slice(2))
const dbUrl = resolveDatabaseUrl(opts.init)
const sql = neon(dbUrl)

if (opts.init)
  await runInit(sql)
else
  await runStats(sql, opts)
