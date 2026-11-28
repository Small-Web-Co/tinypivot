/**
 * Daily growth snapshots (npm downloads by package + GitHub repo stats) persisted to Neon.
 *
 * Separating npm publish-window days from normal weekdays lets us track organic UI & MCP
 * adoption without registry mirror/scanner spikes polluting the trend.
 */

import { getSqlClient } from './telemetry-store.js'

export const NPM_PACKAGES = [
  '@smallwebco/tinypivot-core',
  '@smallwebco/tinypivot-react',
  '@smallwebco/tinypivot-vue',
  '@smallwebco/tinypivot-server',
  '@smallwebco/tinypivot-mcp',
] as const

export const GITHUB_REPOS = [
  'Small-Web-Co/tinypivot',
  'Small-Web-Co/tinypivot-plugin',
] as const

export const GROWTH_SCHEMA_STATEMENTS = [
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
] as const

export interface GrowthRow {
  day: string
  source: 'npm' | 'github'
  metric: string
  value: number
  meta: Record<string, unknown>
}

export function nextUtcDay(isoDay: string): string {
  const dt = new Date(`${isoDay}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

export function buildPublishWindowMap(times: Record<string, string>): {
  publishWindowDays: Set<string>
  versionsByDay: Map<string, number>
} {
  const publishWindowDays = new Set<string>()
  const versionsByDay = new Map<string, number>()

  for (const [ver, ts] of Object.entries(times)) {
    if (ver === 'created' || ver === 'modified' || typeof ts !== 'string' || ts.length < 10)
      continue
    const day = ts.slice(0, 10)
    versionsByDay.set(day, (versionsByDay.get(day) ?? 0) + 1)
    publishWindowDays.add(day)
    publishWindowDays.add(nextUtcDay(day))
  }

  return { publishWindowDays, versionsByDay }
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tinypivot-growth-snapshot', ...headers },
    signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(10_000) : undefined,
  })
  if (!res.ok)
    throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.json() as T
}

async function collectNpmPackageRows(pkg: string, startDay: string, endDay: string): Promise<GrowthRow[]> {
  const encoded = encodeURIComponent(pkg)
  const [meta, range, versions] = await Promise.all([
    fetchJson<{ time?: Record<string, string> }>(`https://registry.npmjs.org/${encoded}`),
    fetchJson<{ downloads?: Array<{ day: string, downloads: number }> }>(`https://api.npmjs.org/downloads/range/${startDay}:${endDay}/${encoded}`),
    fetchJson<{ downloads?: Record<string, number> }>(`https://api.npmjs.org/versions/${encoded}/last-week`).catch(() => ({ downloads: undefined })),
  ])

  const { publishWindowDays, versionsByDay } = buildPublishWindowMap(meta.time ?? {})
  const topVersions = versions.downloads
    ? Object.fromEntries(
        Object.entries(versions.downloads)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8),
      )
    : undefined

  const downloads = range.downloads ?? []
  const latestNonZeroDay = [...downloads].reverse().find(d => d.downloads > 0)?.day

  return downloads.map(d => ({
    day: d.day,
    source: 'npm' as const,
    metric: pkg,
    value: d.downloads,
    meta: {
      isPublishWindow: publishWindowDays.has(d.day),
      versionsPublished: versionsByDay.get(d.day) ?? 0,
      ...(d.day === latestNonZeroDay && topVersions ? { topVersions } : {}),
    },
  }))
}

async function collectGithubRepoRow(repo: string, todayUtc: string, githubToken?: string): Promise<GrowthRow> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (githubToken)
    headers.Authorization = `Bearer ${githubToken}`

  const info = await fetchJson<{
    stargazers_count?: number
    forks_count?: number
    open_issues_count?: number
  }>(`https://api.github.com/repos/${repo}`, headers)

  const meta: Record<string, unknown> = {
    forks: info.forks_count ?? 0,
    openIssues: info.open_issues_count ?? 0,
  }

  if (githubToken) {
    const [views, clones] = await Promise.all([
      fetchJson<{ count?: number, uniques?: number }>(`https://api.github.com/repos/${repo}/traffic/views`, headers).catch(() => null),
      fetchJson<{ count?: number, uniques?: number }>(`https://api.github.com/repos/${repo}/traffic/clones`, headers).catch(() => null),
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

  return {
    day: todayUtc,
    source: 'github',
    metric: repo,
    value: info.stargazers_count ?? 0,
    meta,
  }
}

export async function collectGrowthSnapshot(options: {
  days?: number
  now?: Date
  githubToken?: string
} = {}): Promise<{ rows: GrowthRow[], warnings: string[] }> {
  const days = Math.max(1, Math.min(365, options.days ?? 14))
  const now = options.now ?? new Date()
  const todayUtc = now.toISOString().slice(0, 10)
  const start = new Date(now.getTime() - days * 86_400_000)
  const startDay = start.toISOString().slice(0, 10)
  const githubToken = options.githubToken ?? process.env.GITHUB_TOKEN?.trim()

  const rows: GrowthRow[] = []
  const warnings: string[] = []

  const npmResults = await Promise.allSettled(
    NPM_PACKAGES.map(pkg => collectNpmPackageRows(pkg, startDay, todayUtc)),
  )
  for (let i = 0; i < npmResults.length; i++) {
    const res = npmResults[i]
    if (res.status === 'fulfilled')
      rows.push(...res.value)
    else
      warnings.push(`npm ${NPM_PACKAGES[i]}: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`)
  }

  const ghResults = await Promise.allSettled(
    GITHUB_REPOS.map(repo => collectGithubRepoRow(repo, todayUtc, githubToken)),
  )
  for (let i = 0; i < ghResults.length; i++) {
    const res = ghResults[i]
    if (res.status === 'fulfilled')
      rows.push(res.value)
    else
      warnings.push(`github ${GITHUB_REPOS[i]}: ${res.reason instanceof Error ? res.reason.message : String(res.reason)}`)
  }

  return { rows, warnings }
}

export async function upsertGrowthRows(rows: GrowthRow[], databaseUrl?: string): Promise<number> {
  if (rows.length === 0)
    return 0
  const sql = getSqlClient(databaseUrl)
  if (!sql)
    throw new Error('DATABASE_URL is not configured')

  let upserted = 0
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
    upserted++
  }
  return upserted
}
