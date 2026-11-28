/**
 * Daily TinyPivot usage & growth digest (Neon Postgres -> Resend email).
 *
 * Designed for comfortable reading on a phone screen: single-column layout,
 * concise lock-screen subject line, and strict separation of external humans
 * vs. local dev/benchmark traffic and automated MCP crawlers.
 */

import { getSqlClient } from './telemetry-store.js'

export interface McpSummary {
  uniqueAnons: number
  proAnons: number
  events: number
  inits: number
  starts: number
  toolCalls: number
  toolErrors: number
  gateHits: number
}

export interface NpmPackageDigest {
  pkg: string
  shortName: string
  latestDay: string | null
  latestDownloads: number
  latestIsPublishWindow: boolean
  curWkdayAvg: number | null
  prevWkdayAvg: number | null
  raw30d: number
}

export interface GithubRepoDigest {
  repo: string
  stars: number
  starDelta: number
  forks: number
  day: string | null
}

export interface ExternalUserActivity {
  anonPrefix: string
  client: string
  os: string
  country: string
  tier: string
  events: number
  toolCalls: number
}

export interface DailyDigestData {
  generatedAt: string
  mcp24h: McpSummary
  mcp7d: McpSummary
  crawlerHits24h: number
  recentExternalUsers24h: ExternalUserActivity[]
  topTools7d: Array<{ tool: string, calls: number, errors: number }>
  topGates7d: Array<{ feature: string, anons: number, hits: number }>
  topErrors7d: Array<{ errorCode: string, tool: string, hits: number }>
  npm: NpmPackageDigest[]
  github: GithubRepoDigest[]
}

const SHORT_NAMES: Record<string, string> = {
  '@smallwebco/tinypivot-react': 'react',
  '@smallwebco/tinypivot-core': 'core',
  '@smallwebco/tinypivot-vue': 'vue',
  '@smallwebco/tinypivot-server': 'server',
  '@smallwebco/tinypivot-mcp': 'mcp',
}

function parseExcludedAnons(raw = process.env.REPORT_EXCLUDE_ANONS): string[] {
  if (!raw)
    return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function esc(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtPctDelta(cur: number | null, prev: number | null): string {
  if (cur === null || prev === null || prev <= 0)
    return ''
  const pct = Math.round(((cur - prev) / prev) * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

export async function queryDailyDigest(options: {
  databaseUrl?: string
  excludedAnons?: string[]
  now?: Date
} = {}): Promise<DailyDigestData> {
  const sql = getSqlClient(options.databaseUrl)
  if (!sql)
    throw new Error('DATABASE_URL is not configured')

  const excluded = options.excludedAnons ?? parseExcludedAnons()
  const now = options.now ?? new Date()

  const queryMcpWindow = async (hours: number): Promise<McpSummary> => {
    const [row] = await sql`
      SELECT
        COUNT(DISTINCT anon_id)::int AS unique_anons,
        COUNT(DISTINCT anon_id) FILTER (WHERE tier = 'pro')::int AS pro_anons,
        COUNT(*)::int AS events,
        COUNT(*) FILTER (WHERE event = 'init')::int AS inits,
        COUNT(*) FILTER (WHERE event = 'server_start')::int AS starts,
        COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls,
        COUNT(*) FILTER (WHERE event = 'tool_call' AND outcome = 'error')::int AS tool_errors,
        COUNT(*) FILTER (WHERE event = 'gate_hit')::int AS gate_hits
      FROM telemetry_events
      WHERE ts >= now() - (${hours}::int * INTERVAL '1 hour')
        AND NOT (COALESCE(anon_id, '') = ANY(${excluded}::text[]))
        AND COALESCE(client, '') NOT LIKE '%-local'
        AND COALESCE(client, '') NOT LIKE '%-probe'
        AND COALESCE(client, '') NOT LIKE 'mcpwatch%'
    ` as Array<Record<string, number>>
    return {
      uniqueAnons: row?.unique_anons ?? 0,
      proAnons: row?.pro_anons ?? 0,
      events: row?.events ?? 0,
      inits: row?.inits ?? 0,
      starts: row?.starts ?? 0,
      toolCalls: row?.tool_calls ?? 0,
      toolErrors: row?.tool_errors ?? 0,
      gateHits: row?.gate_hits ?? 0,
    }
  }

  const [mcp24h, mcp7d, crawlerRow, recentUsers, topTools, topGates, topErrors, npmTrend, npmLatest, ghRows] = await Promise.all([
    queryMcpWindow(24),
    queryMcpWindow(168),
    sql`
      SELECT COUNT(*)::int AS hits
      FROM telemetry_events
      WHERE ts >= now() - INTERVAL '24 hours'
        AND (COALESCE(client, '') LIKE '%-probe' OR COALESCE(client, '') LIKE 'mcpwatch%')
    `,
    sql`
      SELECT
        left(COALESCE(anon_id, 'unknown'), 8) AS anon_prefix,
        COALESCE(MAX(client), '(unknown)') AS client,
        COALESCE(MAX(os), '?') AS os,
        COALESCE(MAX(country), '?') AS country,
        COALESCE(MAX(tier), 'free') AS tier,
        COUNT(*)::int AS events,
        COUNT(*) FILTER (WHERE event = 'tool_call')::int AS tool_calls
      FROM telemetry_events
      WHERE ts >= now() - INTERVAL '24 hours'
        AND NOT (COALESCE(anon_id, '') = ANY(${excluded}::text[]))
        AND COALESCE(client, '') NOT LIKE '%-local'
        AND COALESCE(client, '') NOT LIKE '%-probe'
        AND COALESCE(client, '') NOT LIKE 'mcpwatch%'
      GROUP BY 1
      ORDER BY tool_calls DESC, events DESC
      LIMIT 10
    `,
    sql`
      SELECT
        tool,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE outcome = 'error')::int AS errors
      FROM telemetry_events
      WHERE ts >= now() - INTERVAL '7 days'
        AND event = 'tool_call'
        AND tool IS NOT NULL
        AND NOT (COALESCE(anon_id, '') = ANY(${excluded}::text[]))
        AND COALESCE(client, '') NOT LIKE '%-local'
        AND COALESCE(client, '') NOT LIKE '%-probe'
      GROUP BY 1
      ORDER BY calls DESC
      LIMIT 8
    `,
    sql`
      SELECT
        COALESCE(feature, '(unknown)') AS feature,
        COUNT(DISTINCT anon_id)::int AS anons,
        COUNT(*)::int AS hits
      FROM telemetry_events
      WHERE ts >= now() - INTERVAL '7 days'
        AND event = 'gate_hit'
        AND NOT (COALESCE(anon_id, '') = ANY(${excluded}::text[]))
        AND COALESCE(client, '') NOT LIKE '%-local'
      GROUP BY 1
      ORDER BY hits DESC
      LIMIT 8
    `,
    sql`
      SELECT
        error_code,
        COALESCE(tool, '(none)') AS tool,
        COUNT(*)::int AS hits
      FROM telemetry_events
      WHERE ts >= now() - INTERVAL '7 days'
        AND error_code IS NOT NULL
        AND NOT (COALESCE(anon_id, '') = ANY(${excluded}::text[]))
        AND COALESCE(client, '') NOT LIKE '%-local'
      GROUP BY 1, 2
      ORDER BY hits DESC
      LIMIT 8
    `,
    sql`
      SELECT
        metric,
        ROUND(AVG(value) FILTER (
          WHERE day >= CURRENT_DATE - 30
            AND EXTRACT(ISODOW FROM day) < 6
            AND COALESCE((meta->>'isPublishWindow')::boolean, false) = false
            AND value > 0
        ), 1)::float AS cur_wkday_avg,
        ROUND(AVG(value) FILTER (
          WHERE day >= CURRENT_DATE - 60 AND day < CURRENT_DATE - 30
            AND EXTRACT(ISODOW FROM day) < 6
            AND COALESCE((meta->>'isPublishWindow')::boolean, false) = false
            AND value > 0
        ), 1)::float AS prev_wkday_avg,
        COALESCE(SUM(value) FILTER (WHERE day >= CURRENT_DATE - 30), 0)::int AS raw_30d
      FROM growth_daily
      WHERE source = 'npm'
      GROUP BY metric
    `,
    sql`
      SELECT DISTINCT ON (metric)
        metric,
        to_char(day, 'YYYY-MM-DD') AS day,
        value,
        COALESCE((meta->>'isPublishWindow')::boolean, false) AS is_publish_window
      FROM growth_daily
      WHERE source = 'npm' AND value > 0
      ORDER BY metric, day DESC
    `,
    sql`
      WITH ranked AS (
        SELECT
          metric,
          to_char(day, 'YYYY-MM-DD') AS day,
          value,
          COALESCE((meta->>'forks')::int, 0) AS forks,
          ROW_NUMBER() OVER (PARTITION BY metric ORDER BY day DESC) AS rn
        FROM growth_daily
        WHERE source = 'github'
      )
      SELECT
        cur.metric,
        cur.day,
        cur.value AS stars,
        cur.forks,
        COALESCE(cur.value - prev.value, 0)::int AS star_delta
      FROM ranked cur
      LEFT JOIN ranked prev ON prev.metric = cur.metric AND prev.rn = 2
      WHERE cur.rn = 1
      ORDER BY cur.metric
    `,
  ])

  const latestMap = new Map<string, { day: string, value: number, isPublishWindow: boolean }>()
  for (const r of npmLatest as Array<Record<string, unknown>>) {
    latestMap.set(String(r.metric), {
      day: String(r.day),
      value: Number(r.value ?? 0),
      isPublishWindow: Boolean(r.is_publish_window),
    })
  }

  const order = [
    '@smallwebco/tinypivot-react',
    '@smallwebco/tinypivot-vue',
    '@smallwebco/tinypivot-core',
    '@smallwebco/tinypivot-server',
    '@smallwebco/tinypivot-mcp',
  ]

  const trendMap = new Map<string, Record<string, unknown>>()
  for (const r of npmTrend as Array<Record<string, unknown>>)
    trendMap.set(String(r.metric), r)

  const npm: NpmPackageDigest[] = order
    .filter(pkg => trendMap.has(pkg) || latestMap.has(pkg))
    .map((pkg) => {
      const t = trendMap.get(pkg)
      const l = latestMap.get(pkg)
      return {
        pkg,
        shortName: SHORT_NAMES[pkg] ?? pkg,
        latestDay: l?.day ?? null,
        latestDownloads: l?.value ?? 0,
        latestIsPublishWindow: l?.isPublishWindow ?? false,
        curWkdayAvg: t?.cur_wkday_avg != null ? Number(t.cur_wkday_avg) : null,
        prevWkdayAvg: t?.prev_wkday_avg != null ? Number(t.prev_wkday_avg) : null,
        raw30d: Number(t?.raw_30d ?? 0),
      }
    })

  return {
    generatedAt: now.toISOString(),
    mcp24h,
    mcp7d,
    crawlerHits24h: Number((crawlerRow as Array<Record<string, unknown>>)[0]?.hits ?? 0),
    recentExternalUsers24h: (recentUsers as Array<Record<string, unknown>>).map(r => ({
      anonPrefix: String(r.anon_prefix),
      client: String(r.client),
      os: String(r.os),
      country: String(r.country),
      tier: String(r.tier),
      events: Number(r.events ?? 0),
      toolCalls: Number(r.tool_calls ?? 0),
    })),
    topTools7d: (topTools as Array<Record<string, unknown>>).map(r => ({
      tool: String(r.tool),
      calls: Number(r.calls ?? 0),
      errors: Number(r.errors ?? 0),
    })),
    topGates7d: (topGates as Array<Record<string, unknown>>).map(r => ({
      feature: String(r.feature),
      anons: Number(r.anons ?? 0),
      hits: Number(r.hits ?? 0),
    })),
    topErrors7d: (topErrors as Array<Record<string, unknown>>).map(r => ({
      errorCode: String(r.error_code),
      tool: String(r.tool),
      hits: Number(r.hits ?? 0),
    })),
    npm,
    github: (ghRows as Array<Record<string, unknown>>).map(r => ({
      repo: String(r.metric),
      stars: Number(r.stars ?? 0),
      starDelta: Number(r.star_delta ?? 0),
      forks: Number(r.forks ?? 0),
      day: r.day ? String(r.day) : null,
    })),
  }
}

export function buildDailyDigestEmail(data: DailyDigestData): {
  subject: string
  html: string
  text: string
} {
  const react = data.npm.find(p => p.shortName === 'react')
  const mainRepo = data.github.find(g => g.repo === 'Small-Web-Co/tinypivot')
  const reactPct = react ? fmtPctDelta(react.curWkdayAvg, react.prevWkdayAvg) : ''
  const reactPart = react?.curWkdayAvg != null
    ? `React ${react.curWkdayAvg}/wkday${reactPct ? ` (${reactPct})` : ''}`
    : 'React —'
  const mcpPart = `${data.mcp24h.uniqueAnons} MCP ext (24h)`
  const starPart = mainRepo
    ? `${mainRepo.stars}★${mainRepo.starDelta > 0 ? ` (+${mainRepo.starDelta})` : ''}`
    : ''

  const subject = `TinyPivot Daily: ${[reactPart, mcpPart, starPart].filter(Boolean).join(' · ')}`
  const dateLabel = data.generatedAt.slice(0, 10)

  const npmRowsHtml = data.npm.map((p) => {
    const delta = fmtPctDelta(p.curWkdayAvg, p.prevWkdayAvg)
    const wkdayStr = p.curWkdayAvg != null ? `${p.curWkdayAvg}/day` : '—'
    const deltaBadge = delta
      ? `<span style="color:${delta.startsWith('+') ? '#145a39' : '#8b3a2b'};font-weight:700;margin-left:4px;">${esc(delta)}</span>`
      : ''
    const latestTag = p.latestIsPublishWindow ? ' <span style="color:#8a6318;font-size:11px;">(pub)</span>' : ''
    return `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee9df;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:600;">${esc(p.shortName)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee9df;text-align:right;font-size:13px;">${p.latestDownloads.toLocaleString('en-US')}${latestTag}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee9df;text-align:right;font-size:13px;">${esc(wkdayStr)}${deltaBadge}</td>
      </tr>
    `
  }).join('')

  const recentUsersHtml = data.recentExternalUsers24h.length > 0
    ? data.recentExternalUsers24h.map(u => `
        <li style="margin:0 0 6px;font-size:13px;color:#1f1d1a;">
          <code style="background:#f2eee6;padding:1px 5px;border-radius:4px;">${esc(u.anonPrefix)}</code>
          <strong>${esc(u.country)}</strong> · ${esc(u.os)} · ${esc(u.client)} · ${u.events} ev${u.toolCalls > 0 ? ` (<strong>${u.toolCalls} tools</strong>)` : ''}
        </li>
      `).join('')
    : `<p style="margin:0;font-size:13px;color:#6d665a;">No external MCP activity in the last 24h.</p>`

  const toolsHtml = data.topTools7d.length > 0
    ? `<div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#524d44;margin-bottom:6px;">Top External Tools (7d)</div>
        <ul style="margin:0;padding-left:18px;">
          ${data.topTools7d.map(t => `<li style="margin:0 0 4px;font-size:13px;"><code>${esc(t.tool)}</code>: <strong>${t.calls}</strong>${t.errors > 0 ? ` <span style="color:#8b3a2b;">(${t.errors} err)</span>` : ''}</li>`).join('')}
        </ul>
      </div>`
    : ''

  const gatesHtml = data.topGates7d.length > 0
    ? `<div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#524d44;margin-bottom:6px;">Pro Gate Hits (7d)</div>
        <ul style="margin:0;padding-left:18px;">
          ${data.topGates7d.map(g => `<li style="margin:0 0 4px;font-size:13px;"><code>${esc(g.feature)}</code>: <strong>${g.hits}</strong> hits (${g.anons} users)</li>`).join('')}
        </ul>
      </div>`
    : ''

  const errorsHtml = data.topErrors7d.length > 0
    ? `<div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#8b3a2b;margin-bottom:6px;">External Errors (7d, enum-only)</div>
        <ul style="margin:0;padding-left:18px;">
          ${data.topErrors7d.map(e => `<li style="margin:0 0 4px;font-size:13px;"><code>${esc(e.errorCode)}</code> on <code>${esc(e.tool)}</code>: <strong>${e.hits}</strong></li>`).join('')}
        </ul>
      </div>`
    : ''

  const ghRowsHtml = data.github.map(g => `
    <li style="margin:0 0 4px;font-size:13px;">
      <strong>${esc(g.repo)}</strong>: ${g.stars}★${g.starDelta > 0 ? ` <span style="color:#145a39;font-weight:700;">(+${g.starDelta})</span>` : ''} · ${g.forks} forks
    </li>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:16px;background:#faf8f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#1f1d1a;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="border-bottom:2px solid #1f1d1a;padding-bottom:10px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d7a4f;font-family:ui-monospace,Menlo,monospace;">TinyPivot Daily Digest · ${esc(dateLabel)}</div>
      <h1 style="margin:4px 0 0;font-size:22px;line-height:1.2;color:#141311;">Usage &amp; Growth Summary</h1>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
      <tr>
        <td width="50%" style="padding:0 5px 8px 0;">
          <div style="background:#ffffff;border:1px solid #dfd9cd;border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#6d665a;font-weight:700;">MCP External (24h / 7d)</div>
            <div style="font-size:20px;font-weight:800;color:#141311;margin:2px 0;">${data.mcp24h.uniqueAnons} <span style="font-size:13px;font-weight:600;color:#6d665a;">/ ${data.mcp7d.uniqueAnons} anons</span></div>
            <div style="font-size:11px;color:#5e584e;">${data.mcp24h.inits} init · ${data.mcp24h.starts} start · ${data.mcp24h.toolCalls} tools</div>
          </div>
        </td>
        <td width="50%" style="padding:0 0 8px 5px;">
          <div style="background:#ffffff;border:1px solid #dfd9cd;border-radius:8px;padding:10px 12px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#6d665a;font-weight:700;">React Clean Wkday (30d)</div>
            <div style="font-size:20px;font-weight:800;color:#141311;margin:2px 0;">${react?.curWkdayAvg != null ? esc(react.curWkdayAvg) : '—'}<span style="font-size:13px;font-weight:600;color:#6d665a;">/day</span></div>
            <div style="font-size:11px;color:#145a39;font-weight:700;">${reactPct || 'steady'}${react?.prevWkdayAvg != null ? ` (prev ${react.prevWkdayAvg})` : ''}</div>
          </div>
        </td>
      </tr>
    </table>

    <div style="background:#ffffff;border:1px solid #dfd9cd;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#141311;">External MCP Activity (Last 24h)</div>
      ${data.recentExternalUsers24h.length > 0 ? `<ul style="margin:0;padding-left:18px;">${recentUsersHtml}</ul>` : recentUsersHtml}
      ${data.crawlerHits24h > 0 ? `<p style="margin:8px 0 0;font-size:11.5px;color:#6d665a;">Excluded ${data.crawlerHits24h} automated registry probe hit${data.crawlerHits24h === 1 ? '' : 's'} (e.g. mcpwatch-probe).</p>` : ''}
      ${toolsHtml}
      ${gatesHtml}
      ${errorsHtml}
    </div>

    <div style="background:#ffffff;border:1px solid #dfd9cd;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#141311;">npm Downloads (Clean 30d Wkday Avg)</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px;font-size:10.5px;text-transform:uppercase;color:#6d665a;border-bottom:1px solid #dfd9cd;">Package</th>
            <th style="text-align:right;padding:6px;font-size:10.5px;text-transform:uppercase;color:#6d665a;border-bottom:1px solid #dfd9cd;">Latest Day</th>
            <th style="text-align:right;padding:6px;font-size:10.5px;text-transform:uppercase;color:#6d665a;border-bottom:1px solid #dfd9cd;">30d Wkday</th>
          </tr>
        </thead>
        <tbody>${npmRowsHtml}</tbody>
      </table>
    </div>

    <div style="background:#ffffff;border:1px solid #dfd9cd;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#141311;">GitHub</div>
      <ul style="margin:0;padding-left:18px;">${ghRowsHtml}</ul>
    </div>

    <div style="font-size:11px;color:#777064;text-align:center;padding-top:6px;">
      TinyPivot Daily · tiny-pivot.com
    </div>
  </div>
</body>
</html>`

  const textLines = [
    `TinyPivot Daily Usage Summary (${dateLabel})`,
    '',
    `MCP External (24h): ${data.mcp24h.uniqueAnons} anons | ${data.mcp24h.inits} inits, ${data.mcp24h.starts} starts, ${data.mcp24h.toolCalls} tools, ${data.mcp24h.gateHits} gates`,
    `MCP External (7d):  ${data.mcp7d.uniqueAnons} anons | ${data.mcp7d.toolCalls} tools, ${data.mcp7d.gateHits} gates`,
    ...(data.crawlerHits24h > 0 ? [`Excluded crawlers (24h): ${data.crawlerHits24h}`] : []),
    '',
    'npm (latest day / 30d clean weekday avg):',
    ...data.npm.map(p => `  - ${p.shortName}: ${p.latestDownloads}${p.latestIsPublishWindow ? ' (pub)' : ''} | ${p.curWkdayAvg ?? '-'}/wkday ${fmtPctDelta(p.curWkdayAvg, p.prevWkdayAvg)}`.trimEnd()),
    '',
    'GitHub:',
    ...data.github.map(g => `  - ${g.repo}: ${g.stars} stars (${g.starDelta >= 0 ? `+${g.starDelta}` : g.starDelta}), ${g.forks} forks`),
  ]

  return { subject, html, text: textLines.join('\n') }
}

export async function sendDailyDigestEmail(
  data: DailyDigestData,
  options: {
    to?: string
    apiKey?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<{ sent: boolean, reason?: string, subject: string, id?: string }> {
  const { subject, html, text } = buildDailyDigestEmail(data)
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY?.trim()
  const to = options.to ?? process.env.REPORT_EMAIL?.trim()

  if (!apiKey)
    return { sent: false, reason: 'RESEND_API_KEY not configured', subject }
  if (!to)
    return { sent: false, reason: 'REPORT_EMAIL not configured', subject }

  const doFetch = options.fetchImpl ?? fetch
  const res = await doFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TinyPivot <license@tiny-pivot.com>',
      reply_to: 'support@tiny-pivot.com',
      to,
      subject,
      html,
      text,
    }),
  })

  const body = await res.json().catch(() => ({})) as { id?: string, message?: string }
  if (!res.ok)
    return { sent: false, reason: body.message || `Resend HTTP ${res.status}`, subject }

  return { sent: true, subject, id: body.id }
}
