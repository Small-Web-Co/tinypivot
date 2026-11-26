import type { ChartConfig, ChartThemePreset } from '@smallwebco/tinypivot-core'
import type { StepLineage } from './lineage.js'
import type { Claim, TraceStep } from './studio-protocol.js'
import type { Studio } from './studio.js'
import { buildStepLineage } from './lineage.js'
import { groupRuns } from './runs.js'

/**
 * Builds a single-file, zero-dependency offline HTML notebook report for ONE isolated Studio session.
 * Contains ONLY that session's turns, SQL, verified answers, inline SVG charts, and searchable tables.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n))
    return ''
  if (Math.abs(n) >= 1000)
    return Math.round(n).toLocaleString('en-US')
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function aggregateSeries(rows: Record<string, unknown>[], chart?: Partial<ChartConfig>): Array<{ label: string, value: number }> {
  const xField = chart?.xAxis?.field ?? Object.keys(rows[0] ?? {})[0]
  const yField = chart?.yAxis?.field
    ?? Object.keys(rows[0] ?? {}).find(k => typeof rows[0]?.[k] === 'number')
  if (!xField || !yField)
    return []

  const agg = chart?.yAxis?.aggregation ?? 'sum'
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const label = String(row[xField] ?? '—')
    const raw = Number(row[yField])
    if (!Number.isFinite(raw))
      continue
    const list = buckets.get(label)
    if (list)
      list.push(raw)
    else
      buckets.set(label, [raw])
  }

  const out: Array<{ label: string, value: number }> = []
  for (const [label, vals] of buckets.entries()) {
    let value = 0
    if (agg === 'count')
      value = vals.length
    else if (agg === 'avg')
      value = vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
    else if (agg === 'min')
      value = Math.min(...vals)
    else if (agg === 'max')
      value = Math.max(...vals)
    else
      value = vals.reduce((s, v) => s + v, 0)
    out.push({ label, value })
  }

  const sortOrder = chart?.options?.sortOrder ?? 'value-desc'
  if (sortOrder === 'value-desc')
    out.sort((a, b) => b.value - a.value)
  else if (sortOrder === 'value-asc')
    out.sort((a, b) => a.value - b.value)
  else if (sortOrder === 'label-asc')
    out.sort((a, b) => a.label.localeCompare(b.label))

  return out.slice(0, 24)
}

function renderSvgChart(rows: Record<string, unknown>[], chart?: Partial<ChartConfig>): string {
  if (rows.length === 0)
    return ''
  const points = aggregateSeries(rows, chart)
  if (points.length === 0)
    return ''

  const width = 760
  const height = 240
  const padL = 70
  const padR = 24
  const padT = 26
  const padB = 42
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const maxVal = Math.max(...points.map(p => p.value), 1)
  const title = chart?.options?.title ? `<text x="${padL}" y="16" class="svg-title">${escapeHtml(chart.options.title)}</text>` : ''

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = padT + innerH * (1 - t)
    const val = formatNumber(maxVal * t)
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" class="svg-grid" />
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-axis">${escapeHtml(val)}</text>`
  }).join('')

  const isLine = chart?.type === 'line' || chart?.type === 'area'
  let marks = ''
  if (isLine) {
    const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW / 2
    const coords = points.map((p, i) => ({
      x: padL + (points.length > 1 ? i * stepX : innerW / 2),
      y: padT + innerH * (1 - Math.max(0, p.value) / maxVal),
      ...p,
    }))
    const poly = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    const dots = coords.map(c =>
      `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" class="svg-mark"><title>${escapeHtml(`${c.label}: ${formatNumber(c.value)}`)}</title></circle>
       <text x="${c.x.toFixed(1)}" y="${height - 14}" text-anchor="middle" class="svg-axis">${escapeHtml(c.label.slice(0, 14))}</text>`,
    ).join('')
    marks = `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${poly}" />${dots}`
  }
  else {
    const slot = innerW / points.length
    const barW = Math.min(54, Math.max(12, slot * 0.62))
    marks = points.map((p, i) => {
      const x = padL + i * slot + (slot - barW) / 2
      const barH = Math.max(2, (Math.max(0, p.value) / maxVal) * innerH)
      const y = padT + innerH - barH
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2" class="svg-mark"><title>${escapeHtml(`${p.label}: ${formatNumber(p.value)}`)}</title></rect>
        <text x="${(x + barW / 2).toFixed(1)}" y="${height - 14}" text-anchor="middle" class="svg-axis">${escapeHtml(p.label.slice(0, 14))}</text>`
    }).join('')
  }

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="${escapeHtml(chart?.options?.title ?? 'Chart')}">${title}${gridLines}${marks}</svg>`
}

function renderDataTable(rows: Record<string, unknown>[], cellId: string, label?: string): string {
  if (rows.length === 0)
    return ''
  const cols = Object.keys(rows[0])
  const preview = rows.slice(0, 200)
  const ths = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')
  const trs = preview.map((row) => {
    const tds = cols.map((c) => {
      const v = row[c]
      const text = v === null || v === undefined ? '' : typeof v === 'number' ? formatNumber(v) : String(v)
      return `<td${typeof v === 'number' ? ' class="num"' : ''}>${escapeHtml(text)}</td>`
    }).join('')
    return `<tr>${tds}</tr>`
  }).join('')
  const note = rows.length > preview.length ? `<div class="table-note">Showing first ${preview.length} of ${rows.length.toLocaleString('en-US')} rows</div>` : ''
  const heading = label ?? `Data Frame (${rows.length.toLocaleString('en-US')} rows × ${cols.length} cols)`
  return `<details class="data-details">
    <summary>${escapeHtml(heading)}</summary>
    <div class="table-tools"><input type="search" placeholder="Filter rows…" oninput="filterTable('${cellId}', this.value)" /></div>
    <div class="table-wrap"><table id="${cellId}"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
    ${note}
  </details>`
}

function renderLineageHtml(lineage: StepLineage): string {
  const pills = lineage.nodes.map((node, i) => {
    const tip = node.details.length ? ` title="${escapeHtml(node.details.join(' | '))}"` : ''
    const arrow = i > 0 ? '<span class="lin-arrow">→</span>' : ''
    return `${arrow}<span class="lin-node lin-${node.stage}"${tip}><span class="lin-lbl">${escapeHtml(node.label)}</span><span class="lin-val">${escapeHtml(node.summary)}</span></span>`
  }).join('')
  const detailLines = lineage.nodes.flatMap(n => n.details.map(d => `<li><strong>${escapeHtml(n.label)}:</strong> ${escapeHtml(d)}</li>`))
  return `<div class="lineage-box">
    <div class="lineage-chain">${pills}</div>
    ${detailLines.length ? `<details class="lineage-more"><summary>Proof of work &amp; aggregation details</summary><ul>${detailLines.join('')}</ul></details>` : ''}
  </div>`
}

function renderClaimBadge(claims?: Claim[]): string {
  if (!claims?.length)
    return ''
  const checked = claims.filter(c => c.status !== 'unchecked')
  if (checked.length === 0)
    return ''
  const found = checked.filter(c => c.status === 'found').length
  const ok = found === checked.length
  return `<span class="badge ${ok ? 'ok' : 'warn'}">${found}/${checked.length} numbers verified in data</span>`
}

export async function buildStandaloneHtmlReport(
  studio: Studio,
  options: { theme?: ChartThemePreset, showBranding?: boolean } = {},
): Promise<string> {
  const isLight = options.theme === 'paper' || options.theme === 'greenbar' || options.theme === 'onebit'
  const steps = studio.recentSteps()
  const runs = groupRuns(steps)
  const title = runs.find(r => r.prompt)?.prompt ?? `TinyPivot Session ${studio.sessionId}`

  const outlineItems: string[] = []
  const turnBlocks: string[] = []
  let outIndex = 0

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    const heading = run.prompt ?? run.steps.find(s => s.datasetName)?.datasetName ?? `Turn ${i + 1}`
    const anchor = `turn-${i + 1}`
    outlineItems.push(`<li><a href="#${anchor}"><span class="num">#${i + 1}</span><span>${escapeHtml(heading)}</span></a></li>`)

    const outputs = run.steps.filter((s: TraceStep) => s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile' && Boolean(s.datasetId))
    const cellHtmls: string[] = []
    for (const step of outputs) {
      outIndex += 1
      let rows: Record<string, unknown>[] = []
      let chartCfg = step.chartConfig
      let pivotCfg = step.pivotConfig
      try {
        const { dataset } = await studio.getStepDataset(step.id)
        rows = dataset.rows
        chartCfg = step.chartConfig ?? dataset.chartConfig
        pivotCfg = step.pivotConfig ?? dataset.pivotConfig
      }
      catch {}

      const lineage = buildStepLineage(step, steps, {
        datasetName: step.datasetName,
        rowCount: rows.length || step.rows,
        columnCount: rows[0] ? Object.keys(rows[0]).length : step.columns?.length,
        viewMode: step.viewMode,
        chartConfig: chartCfg,
        pivotConfig: pivotCfg,
      })

      // Include underlying source rows when this step aggregates an earlier table in the same session.
      let underlyingTableHtml = ''
      if (lineage.upstreamSteps.length > 0) {
        const up = lineage.upstreamSteps[0]
        try {
          const { dataset: upDs } = await studio.getStepDataset(up.id)
          if (upDs.rows.length > 0) {
            underlyingTableHtml = renderDataTable(
              upDs.rows,
              `tbl-src-${outIndex}`,
              `Underlying Source Rows — ${up.datasetName ?? up.datasetId} (${upDs.rows.length.toLocaleString('en-US')} rows × ${upDs.columns.length} cols)`,
            )
          }
        }
        catch {}
      }

      const sqlHtml = step.sql
        ? `<details class="sql-details"><summary>SQL${step.editedAt ? ' (edited)' : ''}</summary><pre><code>${escapeHtml(step.sql)}</code></pre></details>`
        : ''
      const svg = renderSvgChart(rows, chartCfg)
      const table = renderDataTable(rows, `tbl-${outIndex}`, `Aggregated / Output Data Frame (${rows.length.toLocaleString('en-US')} rows × ${rows[0] ? Object.keys(rows[0]).length : 0} cols)`)
      cellHtmls.push(`<article class="cell">
        <header class="cell-head">
          <span class="cell-idx">Out [${outIndex}]</span>
          <strong>${escapeHtml(step.datasetName ?? step.why ?? 'View')}</strong>
          <span class="meta">${rows.length.toLocaleString('en-US')} rows${step.view ? ` · ${escapeHtml(step.view)}` : ''}</span>
        </header>
        ${renderLineageHtml(lineage)}
        ${sqlHtml}
        ${svg ? `<div class="chart-wrap">${svg}</div>` : ''}
        ${table}
        ${underlyingTableHtml}
      </article>`)
    }

    const answer = [...run.steps].reverse().find(s => s.tool === 'reply')
    const answerHtml = answer?.why
      ? `<div class="narrative"><p>${renderInlineHtml(answer.why)}</p>${renderClaimBadge(answer.claims)}</div>`
      : ''

    turnBlocks.push(`<section class="turn" id="${anchor}">
      <div class="turn-head">
        <span class="turn-num">${i + 1}</span>
        <div>
          <h2>${renderInlineHtml(heading)}</h2>
          <div class="meta">${escapeHtml(new Date(run.at).toLocaleString())}</div>
        </div>
      </div>
      ${cellHtmls.join('\n')}
      ${answerHtml}
    </section>`)
  }

  const palette = isLight
    ? '--bg:#f4f0e6;--panel:#ece7dc;--text:#111111;--muted:#4a463f;--border:rgba(17,17,17,0.16);--accent:#e8502a;--ok:#0f7a4f;--warn:#b45309;'
    : '--bg:#0b101b;--panel:#111827;--text:#e2e8f0;--muted:#94a3b8;--border:rgba(148,163,184,0.2);--accent:#38bdf8;--ok:#34d399;--warn:#f59e0b;'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} — TinyPivot Studio Notebook</title>
<style>
:root{${palette}--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,sans-serif;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 var(--sans);display:flex;min-height:100vh}
aside{width:260px;flex:0 0 260px;padding:18px 14px;border-right:1px solid var(--border);background:var(--panel);position:sticky;top:0;height:100vh;overflow:auto}
aside h1{margin:0 0 4px;font:700 12px/1.3 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
aside .sub{font:11px/1.4 var(--mono);color:var(--muted);margin-bottom:14px}
aside ol{list-style:none;padding:0;margin:0;display:grid;gap:6px}
aside a{display:flex;gap:8px;padding:6px 8px;border-radius:5px;color:inherit;text-decoration:none;font-size:12.5px}
aside a:hover{background:color-mix(in srgb,var(--accent) 14%,transparent)}
aside .num{font:700 11px var(--mono);color:var(--accent)}
main{flex:1;min-width:0;padding:24px 28px 60px;max-width:1040px;margin:0 auto}
.turn{margin-bottom:28px;display:grid;gap:12px}
.turn-head{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px}
.turn-num{width:24px;height:24px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font:700 11px var(--mono);color:var(--accent);border:1px solid var(--accent);flex:none}
.turn-head h2{margin:0;font-size:15px}
.meta{font:11px/1.3 var(--mono);color:var(--muted)}
.cell{border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--bg)}
.cell-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--border);font-size:12.5px}
.cell-idx{font:700 11px var(--mono);color:var(--accent)}
.lineage-box{padding:8px 12px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 65%,var(--bg))}
.lineage-chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.lin-node{display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border:1px solid var(--border);border-radius:4px;background:var(--bg);font:11px/1.3 var(--mono)}
.lin-node.lin-proof{border-color:var(--ok);color:var(--ok)}
.lin-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.lin-val{font-weight:600}
.lin-arrow{color:var(--accent);font:700 11px var(--mono)}
.lineage-more{border:0;margin-top:6px}
.lineage-more summary{padding:2px 0;background:none;font-size:10.5px}
.lineage-more ul{margin:6px 0 2px;padding-left:16px;font:11.5px/1.5 var(--mono);color:var(--muted)}
details{border-bottom:1px solid var(--border)}
summary{padding:7px 12px;cursor:pointer;font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);background:var(--panel)}
pre{margin:0;padding:12px;overflow:auto;font:12px/1.5 var(--mono);background:var(--bg)}
.chart-wrap{padding:12px 14px;border-bottom:1px solid var(--border)}
.chart-svg{width:100%;max-width:860px;height:auto;display:block}
.svg-title{fill:var(--text);font:600 13px var(--sans)}
.svg-axis{fill:var(--muted);font:10.5px var(--mono)}
.svg-grid{stroke:var(--border);stroke-dasharray:3 3}
.svg-mark{fill:var(--accent)}
.table-tools{padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--border)}
.table-tools input{width:240px;max-width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font:12px var(--mono)}
.table-wrap{overflow:auto;max-height:340px}
table{width:100%;border-collapse:collapse;font:12px/1.4 var(--mono)}
th,td{padding:6px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
th{position:sticky;top:0;background:var(--panel);color:var(--muted);font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.table-note{padding:6px 12px;font:11px var(--mono);color:var(--muted)}
.narrative{padding:12px 14px;background:var(--panel);border:1px solid var(--border);border-radius:6px;display:grid;gap:8px}
.narrative p{margin:0;white-space:pre-wrap}
.narrative strong{color:var(--accent)}
.narrative code{padding:1px 4px;border-radius:4px;background:color-mix(in srgb,var(--muted) 15%,transparent);font:0.9em var(--mono)}
.badge{justify-self:start;padding:2px 7px;border-radius:4px;border:1px solid currentColor;font:600 10.5px var(--mono)}
.badge.ok{color:var(--ok)}
.badge.warn{color:var(--warn)}
@media (max-width:820px){body{display:block}aside{width:100%;height:auto;position:static;border-right:0;border-bottom:1px solid var(--border)}}
</style>
</head>
<body>
<aside>
  <h1>TinyPivot Notebook</h1>
  <div class="sub">Session ${escapeHtml(studio.sessionId)} · ${runs.length} turn${runs.length === 1 ? '' : 's'}</div>
  <ol>${outlineItems.join('')}</ol>
  ${options.showBranding ? '<div class="sub" style="margin-top:18px;padding-top:10px;border-top:1px solid var(--border)">Exported with <a href="https://tiny-pivot.com" style="display:inline;padding:0;color:var(--accent)">TinyPivot</a></div>' : ''}
</aside>
<main>
  ${turnBlocks.join('\n') || '<p class="meta">No recorded turns in this session.</p>'}
</main>
<script>
function filterTable(id, query) {
  var q = (query || '').trim().toLowerCase();
  var rows = document.querySelectorAll('#' + id + ' tbody tr');
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.display = !q || rows[i].textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
  }
}
</script>
</body>
</html>`
}
