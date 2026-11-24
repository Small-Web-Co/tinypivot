import type { ChartConfig, ChartThemePreset, ChartType, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { computePivotResult, processChartData } from '@smallwebco/tinypivot-core'
import { padEndVisual, padStartVisual, truncateVisual, visualWidth } from './summary.js'

interface TuiPayload {
  datasetId: string
  name: string
  source: string
  totalRows: number
  sourceTotalRows?: number
  truncatedForFreeTier?: boolean
  tier?: 'free' | 'pro'
  rows?: Record<string, unknown>[]
  columns?: Array<{ name: string, type: string }>
  viewMode?: DataGridViewMode
  pivotConfig?: Partial<PivotConfig> | null
  chartConfig?: Partial<ChartConfig> | null
  chartTheme?: ChartThemePreset
  tokenStats?: {
    turnTokensSaved: number
    turnUsdSaved: number
    session: {
      model: { name: string }
      tokensSaved: number
      usdSaved: number
    }
  }
}

interface Palette {
  label: string
  accent: [number, number, number]
  accent2: [number, number, number]
  series: Array<[number, number, number]>
  muted: [number, number, number]
  border: [number, number, number]
  text: [number, number, number]
}

const PALETTES: Record<ChartThemePreset, Palette> = {
  code: {
    label: 'Code',
    accent: [56, 189, 248],
    accent2: [52, 211, 153],
    series: [[56, 189, 248], [52, 211, 153], [129, 140, 248], [245, 158, 11]],
    muted: [148, 163, 184],
    border: [71, 85, 105],
    text: [226, 232, 240],
  },
  phosphor: {
    label: 'Phosphor',
    accent: [34, 197, 94],
    accent2: [52, 211, 153],
    series: [[34, 197, 94], [16, 185, 129], [163, 230, 53], [45, 212, 191]],
    muted: [134, 239, 172],
    border: [34, 94, 58],
    text: [220, 252, 231],
  },
  nord: {
    label: 'Nord',
    accent: [136, 192, 208],
    accent2: [163, 190, 140],
    series: [[136, 192, 208], [163, 190, 140], [129, 161, 193], [235, 203, 139]],
    muted: [147, 161, 177],
    border: [76, 86, 106],
    text: [236, 239, 244],
  },
  thermal: {
    label: 'Thermal',
    accent: [249, 115, 22],
    accent2: [244, 63, 94],
    series: [[249, 115, 22], [244, 63, 94], [250, 204, 21], [168, 85, 247]],
    muted: [253, 186, 116],
    border: [124, 45, 18],
    text: [255, 247, 237],
  },
  mono: {
    label: 'Mono',
    accent: [129, 140, 248],
    accent2: [148, 163, 184],
    series: [[226, 232, 240], [148, 163, 184], [129, 140, 248], [100, 116, 139]],
    muted: [148, 163, 184],
    border: [71, 85, 105],
    text: [241, 245, 249],
  },
}

const THEME_ORDER: ChartThemePreset[] = ['code', 'phosphor', 'nord', 'thermal', 'mono']
const CHART_CYCLE: ChartType[] = ['bar', 'stackedBar', 'line', 'area']
const SUB_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

const RESET = '\x1B[0m'
const BOLD = '\x1B[1m'
const DIM = '\x1B[2m'

function fg(rgb: [number, number, number], text: string): string {
  return `\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET}`
}

function fgBold(rgb: [number, number, number], text: string): string {
  return `${BOLD}\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET}`
}

function fmtNum(val: number): string {
  if (!Number.isFinite(val))
    return '0'
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000)
    return `${sign}${(abs / 1000).toFixed(1)}k`
  if (abs >= 1000)
    return `${sign}${Math.round(abs).toLocaleString('en-US')}`
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}

function sparkline(vals: number[]): string {
  if (!vals.length)
    return ''
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min
  return vals.map((v) => {
    if (!Number.isFinite(v))
      return ' '
    if (span <= 0)
      return SPARK_CHARS[3]
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(((v - min) / span) * (SPARK_CHARS.length - 1))))
    return SPARK_CHARS[idx]
  }).join('')
}

function preciseBar(ratio: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (clamped <= 0)
    return ''
  const totalEighths = Math.round(clamped * width * 8)
  if (totalEighths === 0)
    return '▏'
  const full = Math.floor(totalEighths / 8)
  const rem = totalEighths % 8
  return `${'█'.repeat(full)}${SUB_BLOCKS[rem]}`
}

export function getCompanionSessionFile(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'tinypivot', 'companion.json')
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0)
    return false
  try {
    process.kill(pid, 0)
    return true
  }
  catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

export async function resolveCompanionUrl(explicit?: string): Promise<string | null> {
  if (explicit?.trim())
    return explicit.trim().replace(/\/$/, '')
  const sessionFile = getCompanionSessionFile()
  try {
    const raw = await fs.readFile(sessionFile, 'utf8')
    const parsed = JSON.parse(raw) as { url?: string, pid?: number }
    if (typeof parsed.pid === 'number' && !isProcessAlive(parsed.pid)) {
      // Stale session left by a killed/crashed process — clean it up and ignore
      await fs.unlink(sessionFile).catch(() => {})
      return null
    }
    if (parsed.url)
      return parsed.url.replace(/\/$/, '')
  }
  catch {
    // No active companion session file yet
  }
  return null
}

function renderChartView(
  payload: TuiPayload,
  pal: Palette,
  innerWidth: number,
  height: number,
  overrideChartType?: ChartType,
): string[] {
  const rows = payload.rows ?? []
  const cfg = payload.chartConfig
  if (!cfg?.xAxis || !cfg?.yAxis || rows.length === 0) {
    return [fg(pal.muted, 'No chart configured yet — ask your AI agent to chart or load a dataset.')]
  }

  const effectiveType = overrideChartType ?? cfg.type ?? 'bar'
  const fullCfg: ChartConfig = {
    type: effectiveType,
    xAxis: cfg.xAxis,
    yAxis: cfg.yAxis,
    seriesField: cfg.seriesField,
    options: cfg.options,
  }
  const processed = processChartData(rows, fullCfg)
  if (!processed.categories.length || !processed.series.length) {
    return [fg(pal.muted, 'No chartable data points.')]
  }

  const totals = processed.categories.map((_, idx) =>
    processed.series.reduce((sum, s) => sum + (Number(s.data[idx]) || 0), 0),
  )
  const grandTotal = totals.reduce((a, b) => a + b, 0)
  let peakIdx = 0
  let lowIdx = 0
  for (let i = 1; i < totals.length; i++) {
    if (totals[i] > totals[peakIdx])
      peakIdx = i
    if (totals[i] < totals[lowIdx])
      lowIdx = i
  }

  const lines: string[] = []
  const title = cfg.options?.title || `${payload.name} · ${cfg.yAxis.field} by ${cfg.xAxis.field}`
  const delta = totals.length >= 2 && totals[0] > 0
    ? ` · ${totals[totals.length - 1] >= totals[0] ? '+' : ''}${(((totals[totals.length - 1] - totals[0]) / totals[0]) * 100).toFixed(1)}%`
    : ''
  const kpiPlain = `Total ${fmtNum(grandTotal)}${effectiveType === 'line' || effectiveType === 'area' ? delta : ''}`
  const safeTitle = truncateVisual(title, Math.max(16, innerWidth - visualWidth(kpiPlain) - 4))
  const headerGap = Math.max(2, innerWidth - visualWidth(safeTitle) - visualWidth(kpiPlain))
  lines.push(`${fgBold(pal.text, safeTitle)}${' '.repeat(headerGap)}${fgBold(pal.accent2, kpiPlain)}`)
  lines.push('')

  if ((fullCfg.type === 'line' || fullCfg.type === 'area') && processed.categories.length >= 3) {
    const chartCols = Math.max(24, Math.min(76, innerWidth - 12))
    const chartRows = Math.max(6, Math.min(14, height - 13))
    const pxW = chartCols * 2
    const pxH = chartRows * 4
    const grid: number[][] = Array.from({ length: chartRows }, () => Array.from<number>({ length: chartCols }).fill(0))

    const rawMin = Math.min(...totals)
    const rawMax = Math.max(...totals)
    const minVal = rawMin > 0 && rawMax > rawMin && (rawMax - rawMin) / rawMax < 0.65
      ? Math.max(0, rawMin - (rawMax - rawMin) * 0.15)
      : Math.min(0, rawMin)
    const maxVal = Math.max(rawMax, minVal + 1e-9)
    const span = Math.max(maxVal - minVal, 1e-9)

    const curveY = Array.from<number>({ length: pxW }).fill(pxH)
    const setPx = (x: number, y: number, trackCurve = false) => {
      const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
      const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
      grid[Math.floor(cy / 4)][Math.floor(cx / 2)] |= BRAILLE_BITS[cy % 4][cx % 2]
      if (trackCurve && cy < curveY[cx])
        curveY[cx] = cy
    }

    const pts = totals.map((v, i) => ({
      x: (i / (totals.length - 1)) * (pxW - 1),
      y: (pxH - 1) - ((v - minVal) / span) * (pxH - 1),
    }))
    for (let i = 0; i < pts.length; i++) {
      setPx(pts[i].x, pts[i].y, true)
      if (i > 0) {
        const a = pts[i - 1]
        const b = pts[i]
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 1.5))
        for (let s = 1; s < steps; s++) {
          const t = s / steps
          setPx(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, true)
        }
      }
    }

    if (fullCfg.type === 'area') {
      for (let cx = 0; cx < pxW; cx += 2) {
        const topY = curveY[cx]
        if (topY < pxH) {
          for (let cy = topY + 2; cy < pxH; cy += 2) {
            setPx(cx, cy, false)
          }
        }
      }
    }

    const topL = fmtNum(maxVal)
    const midL = fmtNum(minVal + span / 2)
    const botL = fmtNum(minVal)
    const yW = Math.max(visualWidth(topL), visualWidth(midL), visualWidth(botL), 6)
    const midR = Math.floor(chartRows / 2)

    for (let r = 0; r < chartRows; r++) {
      const isTick = r === 0 || r === midR || r === chartRows - 1
      const tick = r === 0 ? topL : r === midR ? midL : r === chartRows - 1 ? botL : ''
      const braille = grid[r].map(m => String.fromCharCode(0x2800 + m)).join('')
      lines.push(`${fg(pal.muted, padStartVisual(tick, yW))} ${fg(pal.border, isTick ? '┤' : '│')}${fg(pal.accent, braille)}`)
    }
    const midCol = Math.floor(chartCols / 2)
    lines.push(`${' '.repeat(yW)} ${fg(pal.border, `└${'─'.repeat(midCol)}┴${'─'.repeat(Math.max(1, chartCols - midCol - 1))}`)}`)

    const firstX = truncateVisual(String(processed.categories[0] ?? ''), 12)
    const midX = truncateVisual(String(processed.categories[Math.floor(processed.categories.length / 2)] ?? ''), 12)
    const lastX = truncateVisual(String(processed.categories[processed.categories.length - 1] ?? ''), 12)
    const leftGap = Math.max(1, Math.floor((chartCols - visualWidth(midX)) / 2) - visualWidth(firstX))
    const rightGap = Math.max(1, chartCols - visualWidth(firstX) - leftGap - visualWidth(midX) - visualWidth(lastX))
    lines.push(`${' '.repeat(yW + 2)}${fg(pal.muted, `${firstX}${' '.repeat(leftGap)}${midX}${' '.repeat(rightGap)}${lastX}`)}`)
    lines.push('')
    lines.push(
      `${fg(pal.accent2, '▲')} ${fg(pal.muted, 'Peak:')} ${fgBold(pal.accent2, `${processed.categories[peakIdx]} (${fmtNum(totals[peakIdx])})`)}`
      + `   ${fg(pal.muted, '▼ Low:')} ${fg(pal.text, `${processed.categories[lowIdx]} (${fmtNum(totals[lowIdx])})`)}`
      + `   ${fg(pal.muted, '◆ Avg:')} ${fg(pal.text, fmtNum(grandTotal / totals.length))}`,
    )
    return lines
  }

  // Colored precision bar / stacked bar view
  const maxEntries = Math.max(6, Math.min(18, height - 12))
  const entries = processed.categories.slice(0, maxEntries).map((cat, idx) => ({
    label: String(cat),
    total: totals[idx],
    segs: processed.series.map(s => Math.max(0, Number(s.data[idx]) || 0)),
  }))

  const isStacked = processed.series.length > 1 && (fullCfg.type === 'stackedBar' || fullCfg.type === 'bar')
  if (isStacked) {
    const legend = processed.series
      .slice(0, pal.series.length)
      .map((s, i) => `${fg(pal.series[i], '■')} ${fg(pal.text, truncateVisual(s.name, 14))}`)
      .join('   ')
    lines.push(legend)
    lines.push('')
  }

  const maxVal = Math.max(...entries.map(e => Math.abs(e.total)), 1)
  const labelW = Math.min(22, Math.max(...entries.map(e => visualWidth(e.label)), 8))
  const valW = Math.max(...entries.map(e => visualWidth(fmtNum(e.total))), 6)
  const barW = Math.max(14, Math.min(48, innerWidth - labelW - valW - 14))

  for (const e of entries) {
    const label = fg(pal.text, padEndVisual(truncateVisual(e.label, labelW), labelW))
    let barOut = ''
    if (isStacked) {
      const totalChars = e.total === 0 ? 0 : Math.max(1, Math.round((Math.abs(e.total) / maxVal) * barW))
      const segSum = e.segs.reduce((a, b) => a + b, 0) || 1
      let used = 0
      for (let i = 0; i < e.segs.length && used < totalChars; i++) {
        const len = i === e.segs.length - 1
          ? Math.max(0, totalChars - used)
          : Math.round((e.segs[i] / segSum) * totalChars)
        if (len > 0) {
          barOut += fg(pal.series[i % pal.series.length], '█'.repeat(len))
          used += len
        }
      }
      barOut += ' '.repeat(Math.max(0, barW - used))
    }
    else {
      const rawBar = preciseBar(Math.abs(e.total) / maxVal, barW)
      barOut = fg(pal.accent, rawBar) + ' '.repeat(Math.max(0, barW - visualWidth(rawBar)))
    }
    const valStr = fgBold(pal.text, padStartVisual(fmtNum(e.total), valW))
    const pct = grandTotal > 0 ? fg(pal.muted, `${((e.total / grandTotal) * 100).toFixed(1).padStart(5)}%`) : ''
    lines.push(`${label} ${fg(pal.border, '│')} ${barOut} ${valStr}  ${pct}`)
  }

  if (processed.categories.length > entries.length) {
    lines.push(fg(pal.muted, `… +${processed.categories.length - entries.length} more categories`))
  }
  lines.push('')
  lines.push(
    `${fg(pal.accent2, '▲')} ${fg(pal.muted, 'Peak:')} ${fgBold(pal.accent2, `${processed.categories[peakIdx]} (${fmtNum(totals[peakIdx])})`)}`
    + `   ${fg(pal.muted, '▼ Low:')} ${fg(pal.text, `${processed.categories[lowIdx]} (${fmtNum(totals[lowIdx])})`)}`
    + `   ${fg(pal.muted, '◆ Avg:')} ${fg(pal.text, fmtNum(grandTotal / totals.length))}`,
  )
  return lines
}

function renderPivotView(payload: TuiPayload, pal: Palette, innerWidth: number, height: number): string[] {
  const rows = payload.rows ?? []
  const cfg = payload.pivotConfig
  if (!cfg?.valueFields?.length || rows.length === 0) {
    return [fg(pal.muted, 'No pivot configured yet — press [1] for Chart or [3] for Data.')]
  }
  const fullPivot: PivotConfig = {
    rowFields: cfg.rowFields ?? [],
    columnFields: cfg.columnFields ?? [],
    valueFields: cfg.valueFields,
    showRowTotals: cfg.showRowTotals ?? true,
    showColumnTotals: cfg.showColumnTotals ?? true,
  }
  const result = computePivotResult(rows, fullPivot)
  if (!result || result.rowHeaders.length === 0) {
    return [fg(pal.muted, 'Pivot returned no rows.')]
  }

  const maxCols = Math.max(2, Math.min(6, Math.floor((innerWidth - 32) / 12)))
  const visibleCols = Math.min(result.data[0]?.length ?? 0, maxCols)
  const includeSpark = visibleCols >= 3
  const maxRows = Math.max(5, Math.min(18, height - 13))

  const colHeaders: string[] = []
  for (let c = 0; c < visibleCols; c++) {
    const parts = result.headers.map(l => l[c]).filter(Boolean)
    colHeaders.push(truncateVisual(parts.join(' · ') || `Col ${c + 1}`, 11))
  }
  const headers = [
    truncateVisual(fullPivot.rowFields.join(' / ') || 'Row', 18),
    ...colHeaders,
    ...(includeSpark ? ['Trend'] : []),
    ...(fullPivot.showRowTotals ? ['Total'] : []),
  ]

  const dataRows: string[][] = []
  for (let r = 0; r < Math.min(result.rowHeaders.length, maxRows); r++) {
    const slice = result.data[r].slice(0, visibleCols)
    dataRows.push([
      truncateVisual(result.rowHeaders[r].join(' / '), 18),
      ...slice.map(c => c.formattedValue || '—'),
      ...(includeSpark ? [sparkline(slice.map(c => Number(c.value ?? 0)))] : []),
      ...(fullPivot.showRowTotals && result.rowTotals[r] ? [result.rowTotals[r].formattedValue] : []),
    ])
  }

  let totalRow: string[] | null = null
  if (fullPivot.showColumnTotals && result.grandTotal) {
    const colTots = result.columnTotals.slice(0, visibleCols).map(c => c.formattedValue || '—')
    totalRow = [
      'Total',
      ...colTots,
      ...(includeSpark ? [sparkline(result.columnTotals.slice(0, visibleCols).map(c => Number(c.value ?? 0)))] : []),
      ...(fullPivot.showRowTotals ? [result.grandTotal.formattedValue] : []),
    ]
  }

  const widths = headers.map((h, i) => {
    const m = Math.max(
      ...dataRows.map(r => visualWidth(r[i] ?? '')),
      totalRow ? visualWidth(totalRow[i] ?? '') : 0,
    )
    return Math.max(visualWidth(h), m, i === 0 ? 6 : 5)
  })

  const topRule = fg(pal.border, `╭─${widths.map(w => '─'.repeat(w)).join('─┬─')}─╮`)
  const midRule = fg(pal.border, `├─${widths.map(w => '─'.repeat(w)).join('─┼─')}─┤`)
  const botRule = fg(pal.border, `╰─${widths.map(w => '─'.repeat(w)).join('─┴─')}─╯`)

  const formatRow = (cells: string[], isHeader = false, isTotal = false) => {
    const rendered = cells.map((cell, i) => {
      const padded = i === 0 ? padEndVisual(cell, widths[i]) : padStartVisual(cell, widths[i])
      if (isHeader)
        return fgBold(pal.accent, padded)
      if (isTotal)
        return fgBold(pal.accent2, padded)
      if (includeSpark && i === visibleCols + 1)
        return fg(pal.accent, padded)
      return fg(pal.text, padded)
    })
    const sep = fg(pal.border, ' │ ')
    return `${fg(pal.border, '│ ')}${rendered.join(sep)}${fg(pal.border, ' │')}`
  }

  const out = [topRule, formatRow(headers, true), midRule, ...dataRows.map(r => formatRow(r))]
  if (totalRow)
    out.push(midRule, formatRow(totalRow, false, true))
  out.push(botRule)
  return out
}

function renderGridView(payload: TuiPayload, pal: Palette, innerWidth: number, height: number): string[] {
  const rows = payload.rows ?? []
  const cols = (payload.columns ?? Object.keys(rows[0] ?? {}).map(name => ({ name, type: 'string' }))).slice(0, 6)
  if (!rows.length || !cols.length) {
    return [fg(pal.muted, 'No rows loaded.')]
  }
  const maxRows = Math.max(6, Math.min(20, height - 13))
  const colW = Math.max(8, Math.min(18, Math.floor((innerWidth - 6) / cols.length) - 3))
  const top = fg(pal.border, `╭─${cols.map(() => '─'.repeat(colW)).join('─┬─')}─╮`)
  const mid = fg(pal.border, `├─${cols.map(() => '─'.repeat(colW)).join('─┼─')}─┤`)
  const bot = fg(pal.border, `╰─${cols.map(() => '─'.repeat(colW)).join('─┴─')}─╯`)
  const sep = fg(pal.border, ' │ ')

  const headerLine = `${fg(pal.border, '│ ')}${cols.map(c => fgBold(pal.accent, padEndVisual(truncateVisual(c.name, colW), colW))).join(sep)}${fg(pal.border, ' │')}`
  const bodyLines = rows.slice(0, maxRows).map(row =>
    `${fg(pal.border, '│ ')}${cols.map((c) => {
      const v = row[c.name]
      const str = v === null || v === undefined ? '' : typeof v === 'number' ? fmtNum(v) : String(v)
      const clipped = truncateVisual(str, colW)
      return fg(pal.text, c.type === 'number' ? padStartVisual(clipped, colW) : padEndVisual(clipped, colW))
    }).join(sep)}${fg(pal.border, ' │')}`,
  )
  return [top, headerLine, mid, ...bodyLines, bot, fg(pal.muted, `Showing ${Math.min(maxRows, rows.length)} of ${payload.totalRows.toLocaleString()} rows`)]
}

function frameTuiLine(content: string, innerWidth: number, pal: Palette): string {
  const visW = visualWidth(content)
  const pad = Math.max(0, innerWidth - visW)
  return `${fg(pal.border, '│')} ${content}${' '.repeat(pad)} ${fg(pal.border, '│')}`
}

export async function runTuiCommand(args: string[]): Promise<void> {
  const explicitUrl = args.find(a => a.startsWith('http://') || a.startsWith('https://'))
  const baseUrl = await resolveCompanionUrl(explicitUrl)
  if (!baseUrl) {
    console.error('TinyPivot TUI: No active TinyPivot Companion session found.')
    console.error('Start an AI session using TinyPivot MCP (or pipe data with `--open`), or pass a URL: npx @smallwebco/tinypivot-mcp tui http://127.0.0.1:<port>')
    process.exit(1)
  }

  let payload: TuiPayload | null = null
  let activeView: DataGridViewMode = 'chart'
  let themeIdx = 0
  let overrideChartType: ChartType | undefined

  const fetchState = async () => {
    const res = await fetch(`${baseUrl}/api/state`)
    if (res.ok) {
      payload = await res.json() as TuiPayload
      activeView = payload.viewMode ?? 'chart'
      overrideChartType = undefined
      if (payload.chartTheme) {
        const idx = THEME_ORDER.indexOf(payload.chartTheme)
        if (idx >= 0)
          themeIdx = idx
      }
    }
  }

  const render = () => {
    const termWidth = Math.max(64, process.stdout.columns || 96)
    const height = Math.max(20, process.stdout.rows || 32)
    const panelWidth = Math.min(108, termWidth - 2)
    const innerWidth = panelWidth - 4
    const pal = PALETTES[THEME_ORDER[themeIdx]]

    process.stdout.write('\x1B[2J\x1B[H')
    const tab = (key: string, label: string, active: boolean) =>
      active ? fgBold(pal.accent, `[${key}:${label}]`) : fg(pal.muted, ` ${key}:${label} `)

    const saved = payload?.tokenStats?.session && payload.tokenStats.session.tokensSaved > 0
      ? fgBold(pal.accent2, `Saved ${fmtNum(payload.tokenStats.session.tokensSaved)}/$${payload.tokenStats.session.usdSaved.toFixed(2)}`)
      : ''

    const titlePlain = `● LIVE ${truncateVisual(payload?.name ?? 'TinyPivot', 30)}`
    const badgePlain = payload ? `${payload.totalRows.toLocaleString()} rows · ${pal.label}` : pal.label
    const topDashes = Math.max(1, innerWidth - 4 - visualWidth(titlePlain) - visualWidth(badgePlain))
    const topBorder = `${fg(pal.border, '╭─')} ${fgBold(pal.accent2, '● LIVE')} ${fgBold(pal.text, truncateVisual(payload?.name ?? 'TinyPivot', 30))} ${fg(pal.border, '─'.repeat(topDashes))} ${fg(pal.muted, badgePlain)} ${fg(pal.border, '─╮')}`
    const divider = fg(pal.border, `├${'─'.repeat(innerWidth + 2)}┤`)

    const navLeft = `${tab('1', 'Chart', activeView === 'chart')} ${tab('2', 'Pivot', activeView === 'pivot')} ${tab('3', 'Data', activeView === 'grid')}`
    const navGap = Math.max(1, innerWidth - visualWidth(navLeft) - visualWidth(saved))
    const navLine = `${navLeft}${' '.repeat(navGap)}${saved}`

    const lines: string[] = [topBorder, frameTuiLine(navLine, innerWidth, pal), divider]
    if (payload?.truncatedForFreeTier && payload.sourceTotalRows) {
      const warn = fgBold([251, 191, 36], truncateVisual(`⚠ Free tier limit: showing ${payload.totalRows.toLocaleString()} of ${payload.sourceTotalRows.toLocaleString()} rows — tiny-pivot.com/pricing`, innerWidth))
      lines.push(frameTuiLine(warn, innerWidth, pal), divider)
    }

    let contentLines: string[]
    if (!payload) {
      contentLines = [fg(pal.muted, `Connected to ${baseUrl} — waiting for data from your AI agent…`)]
    }
    else if (activeView === 'chart') {
      contentLines = renderChartView(payload, pal, innerWidth, height, overrideChartType)
    }
    else if (activeView === 'pivot') {
      contentLines = renderPivotView(payload, pal, innerWidth, height)
    }
    else {
      contentLines = renderGridView(payload, pal, innerWidth, height)
    }

    lines.push(frameTuiLine('', innerWidth, pal))
    for (const c of contentLines)
      lines.push(frameTuiLine(c, innerWidth, pal))
    lines.push(frameTuiLine('', innerWidth, pal))

    const keysText = '[1] Chart  [2] Pivot  [3] Data  [c] Type  [t] Theme  [r] Sync  [q] Quit'
    const brandText = payload?.tier === 'pro' ? 'TinyPivot Pro' : 'tiny-pivot.com'
    const safeKeys = truncateVisual(keysText, Math.max(16, innerWidth - visualWidth(brandText) - 5))
    const botDashes = Math.max(1, innerWidth - 4 - visualWidth(safeKeys) - visualWidth(brandText))
    const botBorder = `${fg(pal.border, '╰─')} ${DIM}${fg(pal.muted, safeKeys)}${RESET} ${fg(pal.border, '─'.repeat(botDashes))} ${fg(pal.accent, brandText)} ${fg(pal.border, '─╯')}`
    lines.push(botBorder)

    process.stdout.write(`${lines.map(l => ` ${l}`).join('\n')}\n`)
  }

  // Initial state fetch
  try {
    await fetchState()
  }
  catch (err) {
    console.error(`TinyPivot TUI: Could not connect to ${baseUrl}:`, err instanceof Error ? err.message : err)
    process.exit(1)
  }

  // Enter alternate screen + hide cursor
  process.stdout.write('\x1B[?1049h\x1B[?25l')
  render()

  const controller = new AbortController()
  const cleanup = () => {
    controller.abort()
    if (process.stdin.isTTY)
      process.stdin.setRawMode(false)
    process.stdout.write('\x1B[?25h\x1B[?1049l')
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.stdout.on('resize', render)

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (key: string) => {
      if (key === 'q' || key === '\u0003') {
        cleanup()
        return
      }
      if (key === '1') {
        activeView = 'chart'
      }
      else if (key === '2') {
        activeView = 'pivot'
      }
      else if (key === '3') {
        activeView = 'grid'
      }
      else if (key === 't') {
        themeIdx = (themeIdx + 1) % THEME_ORDER.length
      }
      else if (key === 'c') {
        activeView = 'chart'
        const current = overrideChartType ?? payload?.chartConfig?.type ?? 'bar'
        const idx = CHART_CYCLE.indexOf(current)
        overrideChartType = CHART_CYCLE[(idx + 1) % CHART_CYCLE.length]
      }
      else if (key === 'r') {
        void fetchState().then(render).catch(() => {})
        return
      }
      render()
    })
  }

  // Live SSE loop so Ghostty split pane updates automatically on every agent turn!
  const connectSse = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/events`, { signal: controller.signal })
      if (!res.body)
        return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const chunk of events) {
          const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine)
            continue
          try {
            payload = JSON.parse(dataLine.slice(6)) as TuiPayload
            overrideChartType = undefined
            if (payload.viewMode)
              activeView = payload.viewMode
            render()
          }
          catch {}
        }
      }
    }
    catch {
      // Connection closed or aborted on quit
    }
  }
  await connectSse()
}
