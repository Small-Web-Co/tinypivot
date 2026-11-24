import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { StoredDataset } from './store.js'
import { computePivotResult, processChartData } from '@smallwebco/tinypivot-core'

const SUB_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const SERIES_GLYPHS = ['█', '▓', '▒', '░']
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const CARD_DIVIDER = '__TINYPIVOT_CARD_DIVIDER__'

// Braille dot bitmasks for a 2x4 cell (col 0..1, row 0..3)
const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1B\[[0-9;]*m/g

export interface TerminalFormatOptions {
  /** Show subtle tiny-pivot.com card signature (true on Free tier, false on Pro) */
  showBranding?: boolean
}

function codePointDisplayWidth(cp: number): number {
  if (cp < 0x20 || (cp >= 0x7F && cp < 0xA0))
    return 0
  // Combining marks, zero-width spaces/joiners, variation selectors
  if (
    (cp >= 0x0300 && cp <= 0x036F)
    || (cp >= 0x1AB0 && cp <= 0x1AFF)
    || (cp >= 0x1DC0 && cp <= 0x1DFF)
    || (cp >= 0x200B && cp <= 0x200F)
    || (cp >= 0x2028 && cp <= 0x202F)
    || (cp >= 0x20D0 && cp <= 0x20FF)
    || (cp >= 0xFE00 && cp <= 0xFE0F)
    || (cp >= 0xFE20 && cp <= 0xFE2F)
    || (cp >= 0xE0100 && cp <= 0xE01EF)
  ) {
    return 0
  }
  // East Asian Wide / Fullwidth and common wide emoji blocks
  if (
    (cp >= 0x1100 && cp <= 0x115F)
    || cp === 0x2329
    || cp === 0x232A
    || (cp >= 0x2E80 && cp <= 0x303E)
    || (cp >= 0x3040 && cp <= 0xA4CF)
    || (cp >= 0xAC00 && cp <= 0xD7A3)
    || (cp >= 0xF900 && cp <= 0xFAFF)
    || (cp >= 0xFE10 && cp <= 0xFE19)
    || (cp >= 0xFE30 && cp <= 0xFE6F)
    || (cp >= 0xFF00 && cp <= 0xFF60)
    || (cp >= 0xFFE0 && cp <= 0xFFE6)
    || (cp >= 0x1F300 && cp <= 0x1FAFF)
    || (cp >= 0x20000 && cp <= 0x3FFFD)
  ) {
    return 2
  }
  return 1
}

export function visualWidth(text: string): number {
  const clean = text.replace(ANSI_ESCAPE_RE, '')
  let width = 0
  for (const ch of clean) {
    const cp = ch.codePointAt(0)
    if (cp !== undefined)
      width += codePointDisplayWidth(cp)
  }
  return width
}

export function truncateVisual(text: string, maxWidth: number): string {
  if (maxWidth <= 0)
    return ''
  if (visualWidth(text) <= maxWidth)
    return text
  if (maxWidth === 1)
    return '…'

  const target = maxWidth - 1
  let out = ''
  let used = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    const w = cp !== undefined ? codePointDisplayWidth(cp) : 0
    if (used + w > target)
      break
    out += ch
    used += w
  }
  return `${out}…`
}

export function padEndVisual(text: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visualWidth(text))
  return pad > 0 ? `${text}${' '.repeat(pad)}` : text
}

export function padStartVisual(text: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visualWidth(text))
  return pad > 0 ? `${' '.repeat(pad)}${text}` : text
}

function formatCompactNumber(val: number): string {
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

function renderPreciseBar(ratio: number, width: number): string {
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

function renderSparkline(values: number[]): string {
  if (values.length === 0)
    return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  return values.map((v) => {
    if (!Number.isFinite(v))
      return ' '
    if (span <= 0)
      return SPARK_CHARS[3]
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(((v - min) / span) * (SPARK_CHARS.length - 1))))
    return SPARK_CHARS[idx]
  }).join('')
}

function buildTopBorder(title: string, rightBadge: string, innerWidth: number): string {
  // Exact card width is innerWidth + 4
  if (rightBadge) {
    const safeRight = truncateVisual(rightBadge, Math.max(8, Math.floor(innerWidth * 0.44)))
    const rightW = visualWidth(safeRight)
    const maxTitleW = Math.max(1, innerWidth - 5 - rightW)
    const safeTitle = truncateVisual(title, maxTitleW)
    const dashCount = Math.max(1, innerWidth - 4 - visualWidth(safeTitle) - rightW)
    return `╭─ ${safeTitle} ${'─'.repeat(dashCount)} ${safeRight} ─╮`
  }
  const safeTitle = truncateVisual(title, Math.max(1, innerWidth - 3))
  const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeTitle))
  return `╭─ ${safeTitle} ${'─'.repeat(dashCount)}─╮`
}

function buildBottomBorder(footerLeft: string, footerRight: string, innerWidth: number): string {
  // Exact card width is innerWidth + 4
  if (footerLeft && footerRight) {
    const safeLeft = truncateVisual(footerLeft, Math.max(8, Math.floor(innerWidth * 0.45)))
    const leftW = visualWidth(safeLeft)
    const maxRightW = innerWidth - 5 - leftW
    if (maxRightW >= 4) {
      const safeRight = truncateVisual(footerRight, maxRightW)
      const rightW = visualWidth(safeRight)
      const dashCount = Math.max(1, innerWidth - 4 - leftW - rightW)
      return `╰─ ${safeLeft} ${'─'.repeat(dashCount)} ${safeRight} ─╯`
    }
    const dashCount = Math.max(1, innerWidth - 2 - leftW)
    return `╰─ ${safeLeft} ${'─'.repeat(dashCount)}─╯`
  }
  if (footerLeft) {
    const safeLeft = truncateVisual(footerLeft, Math.max(1, innerWidth - 3))
    const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeLeft))
    return `╰─ ${safeLeft} ${'─'.repeat(dashCount)}─╯`
  }
  if (footerRight) {
    const safeRight = truncateVisual(footerRight, Math.max(1, innerWidth - 3))
    const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeRight))
    return `╰─${'─'.repeat(dashCount)} ${safeRight} ─╯`
  }
  return `╰${'─'.repeat(innerWidth + 2)}╯`
}

function wrapInCard(
  title: string,
  rightBadge: string,
  bodyLines: string[],
  footerLeft: string,
  footerRight: string,
  minWidth = 66,
): string {
  const contentLines = bodyLines.filter(l => l !== CARD_DIVIDER)
  const longestBody = Math.max(...contentLines.map(l => visualWidth(l)), 0)
  const desiredHeader = visualWidth(title) + visualWidth(rightBadge) + (rightBadge ? 6 : 4)
  const desiredFooter = visualWidth(footerLeft) + visualWidth(footerRight) + (footerLeft && footerRight ? 6 : 4)
  const innerWidth = Math.min(82, Math.max(minWidth, longestBody, Math.min(desiredHeader, 82), Math.min(desiredFooter, 82)))

  const topBorder = buildTopBorder(title, rightBadge, innerWidth)
  const dividerLine = `├${'─'.repeat(innerWidth + 2)}┤`

  const paddedBody = bodyLines.map((line) => {
    if (line === CARD_DIVIDER)
      return dividerLine
    const clipped = visualWidth(line) > innerWidth ? truncateVisual(line, innerWidth) : line
    return `│ ${padEndVisual(clipped, innerWidth)} │`
  })

  const bottomBorder = buildBottomBorder(footerLeft, footerRight, innerWidth)
  return ['```text', topBorder, ...paddedBody, bottomBorder, '```'].join('\n')
}

function computeBrailleYBounds(values: number[]): { minVal: number, maxVal: number, span: number } {
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  if (rawMax === rawMin) {
    const base = rawMin > 0 ? 0 : rawMin - 1
    const top = rawMax > 0 ? rawMax : rawMax + 1
    return { minVal: base, maxVal: top, span: Math.max(top - base, 1e-9) }
  }
  // Keep tight visual dynamic range for positive series whose variation sits well above zero
  const minVal = rawMin > 0 && (rawMax - rawMin) / rawMax < 0.65
    ? Math.max(0, rawMin - (rawMax - rawMin) * 0.15)
    : Math.min(0, rawMin)
  const maxVal = rawMax
  return { minVal, maxVal, span: Math.max(maxVal - minVal, 1e-9) }
}

function renderBrailleLineBody(
  categories: string[],
  values: number[],
  filledArea = false,
): string[] {
  const chartCols = 58
  const chartRows = 8
  const pxW = chartCols * 2
  const pxH = chartRows * 4

  const grid: number[][] = Array.from({ length: chartRows }, () => Array.from<number>({ length: chartCols }).fill(0))
  const { minVal, maxVal, span } = computeBrailleYBounds(values)

  const setPixel = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
    const cellCol = Math.floor(cx / 2)
    const cellRow = Math.floor(cy / 4)
    grid[cellRow][cellCol] |= BRAILLE_BITS[cy % 4][cx % 2]
  }

  const pts = values.map((v, i) => ({
    x: values.length === 1 ? pxW / 2 : (i / (values.length - 1)) * (pxW - 1),
    y: (pxH - 1) - ((v - minVal) / span) * (pxH - 1),
  }))

  // Track topmost y per x column for optional subtle area stipple fill
  const curveY = Array.from<number>({ length: pxW }).fill(pxH)
  const plotPoint = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
    setPixel(cx, cy)
    if (cy < curveY[cx])
      curveY[cx] = cy
  }

  // Connect consecutive points smoothly using fine linear interpolation
  for (let i = 0; i < pts.length; i++) {
    plotPoint(pts[i].x, pts[i].y)
    if (i > 0) {
      const a = pts[i - 1]
      const b = pts[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 1.5))
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        plotPoint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      }
    }
  }

  if (filledArea) {
    for (let cx = 0; cx < pxW; cx += 2) {
      const topY = curveY[cx]
      if (topY < pxH) {
        for (let cy = topY + 2; cy < pxH; cy += 2) {
          setPixel(cx, cy)
        }
      }
    }
  }

  const topLabel = formatCompactNumber(maxVal)
  const midLabel = formatCompactNumber(minVal + span / 2)
  const botLabel = formatCompactNumber(minVal)
  const yWidth = Math.max(visualWidth(topLabel), visualWidth(midLabel), visualWidth(botLabel), 6)
  const midRow = Math.floor(chartRows / 2)

  const lines: string[] = []
  for (let r = 0; r < chartRows; r++) {
    let yTick = ''
    let axisChar = '│'
    if (r === 0) {
      yTick = topLabel
      axisChar = '┤'
    }
    else if (r === midRow) {
      yTick = midLabel
      axisChar = '┤'
    }
    else if (r === chartRows - 1) {
      yTick = botLabel
      axisChar = '┤'
    }
    const brailleRow = grid[r].map(mask => String.fromCharCode(0x2800 + mask)).join('')
    lines.push(`${padStartVisual(yTick, yWidth)} ${axisChar}${brailleRow}`)
  }

  // Crisp X-axis rule with subtle midpoint tick
  const midCol = Math.floor(chartCols / 2)
  const xRule = categories.length >= 3
    ? `└${'─'.repeat(midCol)}┴${'─'.repeat(Math.max(1, chartCols - midCol - 1))}`
    : `└${'─'.repeat(chartCols)}`
  lines.push(`${' '.repeat(yWidth)} ${xRule}`)

  // X-axis start / mid / end labels
  const firstX = truncateVisual(categories[0] ?? '', 12)
  const midX = categories.length >= 3 ? truncateVisual(categories[Math.floor(categories.length / 2)] ?? '', 12) : ''
  const lastX = categories.length >= 2 ? truncateVisual(categories[categories.length - 1] ?? '', 12) : ''
  const axisPad = ' '.repeat(yWidth + 2)
  const firstW = visualWidth(firstX)
  const midW = visualWidth(midX)
  const lastW = visualWidth(lastX)
  if (midX && chartCols >= firstW + midW + lastW + 4) {
    const leftGap = Math.max(1, Math.floor((chartCols - midW) / 2) - firstW)
    const rightGap = Math.max(1, chartCols - firstW - leftGap - midW - lastW)
    lines.push(`${axisPad}${firstX}${' '.repeat(leftGap)}${midX}${' '.repeat(rightGap)}${lastX}`)
  }
  else {
    const gap = Math.max(1, chartCols - firstW - lastW)
    lines.push(`${axisPad}${firstX}${' '.repeat(gap)}${lastX}`)
  }

  return lines
}

function formatTrendDelta(values: number[]): string {
  if (values.length < 2)
    return ''
  const first = values[0]
  const last = values[values.length - 1]
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0)
    return ''
  const pct = ((last - first) / first) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/**
 * Render a screenshot-ready framed Unicode/Braille chart card directly in terminal output
 * so CLI harnesses (Claude Code, OpenCode, pi, Codex, Ghostty) get an immediate, shareable visual.
 */
export function formatTerminalChart(
  dataset: StoredDataset,
  chartConfig?: Partial<ChartConfig>,
  options: TerminalFormatOptions = {},
): string {
  if (!chartConfig?.xAxis || !chartConfig?.yAxis || dataset.rows.length === 0)
    return ''

  const fullConfig: ChartConfig = {
    type: chartConfig.type ?? 'bar',
    xAxis: chartConfig.xAxis,
    yAxis: chartConfig.yAxis,
    seriesField: chartConfig.seriesField,
    options: chartConfig.options,
  }

  const processed = processChartData(dataset.rows, fullConfig)
  if (!processed.categories.length || !processed.series.length)
    return ''

  const title = chartConfig.options?.title || `${dataset.name} · ${chartConfig.yAxis.field} by ${chartConfig.xAxis.field}`
  const totalsPerCat = processed.categories.map((_, idx) =>
    processed.series.reduce((sum, s) => sum + (Number(s.data[idx]) || 0), 0),
  )
  const grandTotal = totalsPerCat.reduce((sum, v) => sum + v, 0)
  const avgVal = grandTotal / totalsPerCat.length

  let peakIdx = 0
  let lowIdx = 0
  for (let i = 1; i < totalsPerCat.length; i++) {
    if (totalsPerCat[i] > totalsPerCat[peakIdx])
      peakIdx = i
    if (totalsPerCat[i] < totalsPerCat[lowIdx])
      lowIdx = i
  }

  const showBranding = options.showBranding !== false
  const peakCat = truncateVisual(String(processed.categories[peakIdx]), 14)
  const lowCat = truncateVisual(String(processed.categories[lowIdx]), 14)
  const statsLine = `▲ Peak: ${peakCat} (${formatCompactNumber(totalsPerCat[peakIdx])})`
    + `  ·  ▼ Low: ${lowCat} (${formatCompactNumber(totalsPerCat[lowIdx])})`
    + `  ·  ◆ Avg: ${formatCompactNumber(avgVal)}`

  // High-res 2x4 Braille line / area chart for time-series with >= 3 points
  if ((fullConfig.type === 'line' || fullConfig.type === 'area') && processed.categories.length >= 3) {
    const body = renderBrailleLineBody(processed.categories.map(String), totalsPerCat, fullConfig.type === 'area')
    body.push(CARD_DIVIDER, statsLine)
    const delta = formatTrendDelta(totalsPerCat)
    const badge = delta ? `Total ${formatCompactNumber(grandTotal)} · ${delta}` : `Total ${formatCompactNumber(grandTotal)}`
    const chartKind = fullConfig.type === 'area' ? 'Area' : 'Line'
    const footerLeft = showBranding ? 'tiny-pivot.com' : ''
    const footerRight = `${dataset.rows.length.toLocaleString()} rows · ${chartKind}`
    return wrapInCard(title, badge, body, footerLeft, footerRight)
  }

  // Horizontal precision bar / multi-series stacked bar card
  const maxEntries = 14
  const entries = processed.categories.slice(0, maxEntries).map((cat, idx) => ({
    label: String(cat),
    total: totalsPerCat[idx],
    segments: processed.series.map(s => Math.max(0, Number(s.data[idx]) || 0)),
  }))

  const maxVal = Math.max(...entries.map(e => Math.abs(e.total)), 1)
  const labelWidth = Math.min(20, Math.max(...entries.map(e => visualWidth(e.label)), 6))
  const valWidth = Math.max(...entries.map(e => visualWidth(formatCompactNumber(e.total))), 5)
  const barWidth = 34
  const isMultiSeries = processed.series.length > 1 && (fullConfig.type === 'stackedBar' || fullConfig.type === 'bar')

  const body: string[] = []
  if (isMultiSeries) {
    const visibleLegend = processed.series
      .slice(0, SERIES_GLYPHS.length)
      .map((s, i) => `${SERIES_GLYPHS[i]} ${truncateVisual(s.name, 14)}`)
    if (processed.series.length > SERIES_GLYPHS.length)
      visibleLegend.push(`+${processed.series.length - SERIES_GLYPHS.length} more`)
    body.push(visibleLegend.join('  '))
    body.push('')
  }

  for (const entry of entries) {
    const label = padEndVisual(truncateVisual(entry.label, labelWidth), labelWidth)
    let bar: string
    if (isMultiSeries) {
      const totalWidth = entry.total === 0 ? 0 : Math.max(1, Math.round((Math.abs(entry.total) / maxVal) * barWidth))
      const segSum = entry.segments.reduce((a, b) => a + b, 0) || 1
      let built = ''
      for (let i = 0; i < entry.segments.length && built.length < totalWidth; i++) {
        const segLen = i === entry.segments.length - 1
          ? Math.max(0, totalWidth - built.length)
          : Math.round((entry.segments[i] / segSum) * totalWidth)
        built += SERIES_GLYPHS[i % SERIES_GLYPHS.length].repeat(segLen)
      }
      bar = padEndVisual(built, barWidth)
    }
    else {
      bar = padEndVisual(renderPreciseBar(Math.abs(entry.total) / maxVal, barWidth), barWidth)
    }
    const valStr = padStartVisual(formatCompactNumber(entry.total), valWidth)
    const pctStr = grandTotal > 0 ? `${((entry.total / grandTotal) * 100).toFixed(1).padStart(5)}%` : ''
    body.push(`${label} │ ${bar} ${valStr}${pctStr ? `  ${pctStr}` : ''}`)
  }

  if (processed.categories.length > entries.length) {
    body.push(`… +${processed.categories.length - entries.length} more categories (all interactive in TinyPivot)`)
  }

  body.push(CARD_DIVIDER, statsLine)

  const footerLeft = showBranding ? 'tiny-pivot.com' : ''
  const chartKind = isMultiSeries ? 'Stacked Bar' : 'Bar'
  const footerRight = `${dataset.rows.length.toLocaleString()} rows · ${chartKind}`

  return wrapInCard(title, `Total ${formatCompactNumber(grandTotal)}`, body, footerLeft, footerRight)
}

export function formatDatasetSummary(
  dataset: StoredDataset,
  companionUrl?: string,
  options: TerminalFormatOptions = {},
): string {
  const cols = dataset.columns
    .map(c => `- \`${c.name}\` (${c.type}, ${c.distinctCount} distinct; e.g. ${c.sampleValues.slice(0, 3).join(', ')})`)
    .join('\n')

  const chartBlock = formatTerminalChart(dataset, dataset.chartConfig, options)
  const rowHeadline = dataset.truncatedForFreeTier
    ? `**${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows (Free tier limit)**`
    : `**${dataset.rows.length.toLocaleString()} rows**`
  const parts = [
    `Loaded dataset **${dataset.name}** (\`${dataset.id}\`) — ${rowHeadline}, ${dataset.columns.length} columns.`,
    `Source: ${dataset.source}`,
  ]

  if (dataset.truncatedForFreeTier) {
    parts.push(
      '',
      `> **Notice (Free tier row limit):** Showing the first **${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows**. Charts, pivots, and totals reflect this ${dataset.rows.length.toLocaleString()}-row subset only. Set \`TINYPIVOT_LICENSE_KEY\` for full unlimited rows: https://tiny-pivot.com/pricing`,
    )
  }

  if (chartBlock) {
    parts.push(
      '',
      chartBlock,
      '',
      '_Display the fenced TinyPivot card above verbatim when replying in a terminal harness._',
    )
  }

  parts.push('', 'Columns:', cols || '(no columns)')

  if (companionUrl) {
    parts.push('', `Interactive Data IDE (live-updating): ${companionUrl}`)
  }

  return parts.join('\n')
}

export function formatPivotSummary(
  dataset: StoredDataset,
  config: PivotConfig,
  companionUrl?: string,
  options: TerminalFormatOptions = {},
): string {
  const result = computePivotResult(dataset.rows, config)
  if (!result || result.rowHeaders.length === 0) {
    return `Configured pivot on **${dataset.name}**, but no rows matched.`
  }

  const maxRows = 16
  const maxCols = 6
  const rowFieldHeader = config.rowFields.join(' / ') || 'Row'
  const totalCols = result.data[0]?.length ?? 0
  const visibleCols = Math.min(totalCols, maxCols)
  const includeSparkline = visibleCols >= 3

  const colHeaders: string[] = []
  for (let c = 0; c < visibleCols; c++) {
    const parts = result.headers.map(level => level[c]).filter(Boolean)
    colHeaders.push(truncateVisual(parts.join(' · ') || `Col ${c + 1}`, 12))
  }

  const headers = [
    truncateVisual(rowFieldHeader, 20),
    ...colHeaders,
    ...(includeSparkline ? ['Trend'] : []),
    ...(config.showRowTotals ? ['Total'] : []),
  ]

  const visibleRows = Math.min(result.rowHeaders.length, maxRows)
  const dataRows: string[][] = []
  for (let r = 0; r < visibleRows; r++) {
    const label = truncateVisual(result.rowHeaders[r].join(' / '), 20)
    const slice = result.data[r].slice(0, visibleCols)
    const vals = slice.map(cell => cell.formattedValue || '—')
    const spark = includeSparkline
      ? [renderSparkline(slice.map(c => Number(c.value ?? 0)))]
      : []
    const total = config.showRowTotals && result.rowTotals[r]
      ? [result.rowTotals[r].formattedValue]
      : []
    dataRows.push([label, ...vals, ...spark, ...total])
  }

  let totalRow: string[] | null = null
  if (config.showColumnTotals && result.grandTotal) {
    const colTots = result.columnTotals.slice(0, visibleCols).map(c => c.formattedValue || '—')
    totalRow = [
      'Total',
      ...colTots,
      ...(includeSparkline ? [renderSparkline(result.columnTotals.slice(0, visibleCols).map(c => Number(c.value ?? 0)))] : []),
      ...(config.showRowTotals ? [result.grandTotal.formattedValue] : []),
    ]
  }

  // Compute exact visual column widths for rock-solid box-drawn alignment
  const widths = headers.map((h, i) => {
    const rowMax = Math.max(
      ...dataRows.map(r => visualWidth(r[i] ?? '')),
      totalRow ? visualWidth(totalRow[i] ?? '') : 0,
    )
    return Math.max(visualWidth(h), rowMax, i === 0 ? 8 : 5)
  })

  // Ensure card inner width is wide enough for title + badge + footer cleanly
  const computeInnerWidth = () =>
    widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * 3

  const minInner = 48
  const deficit = minInner - computeInnerWidth()
  if (deficit > 0) {
    widths[0] += deficit
  }

  const innerWidth = computeInnerWidth()
  const primaryVal = config.valueFields[0]
  const pivotTitle = primaryVal
    ? `${dataset.name} · ${primaryVal.aggregation}(${primaryVal.field})`
    : `${dataset.name} · Pivot`
  const rightBadge = result.grandTotal ? `Total ${result.grandTotal.formattedValue}` : `${dataset.rows.length.toLocaleString()} rows`

  const topTitleBorder = buildTopBorder(pivotTitle, rightBadge, innerWidth)
  const topColsRule = `├─${widths.map(w => '─'.repeat(w)).join('─┬─')}─┤`
  const midRule = `├─${widths.map(w => '─'.repeat(w)).join('─┼─')}─┤`
  const botColsRule = `├─${widths.map(w => '─'.repeat(w)).join('─┴─')}─┤`

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => (i === 0 ? padEndVisual(c, widths[i]) : padStartVisual(c, widths[i]))).join(' │ ')} │`

  const showBranding = options.showBranding !== false
  const metaRight = `${dataset.rows.length.toLocaleString()} rows · ${result.rowHeaders.length} groups`
  const metaLeft = showBranding ? 'tiny-pivot.com' : ''
  const footerLine = buildBottomBorder(metaLeft, metaRight, innerWidth)

  const tableLines = [
    '```text',
    topTitleBorder,
    topColsRule,
    formatRow(headers),
    midRule,
    ...dataRows.map(formatRow),
  ]
  if (totalRow) {
    tableLines.push(midRule, formatRow(totalRow))
  }
  tableLines.push(botColsRule)
  // Put subtle compact status line only if clipped, otherwise close directly with footer border!
  if (result.rowHeaders.length > maxRows || totalCols > maxCols) {
    const clipNotes: string[] = []
    if (result.rowHeaders.length > maxRows)
      clipNotes.push(`+${result.rowHeaders.length - maxRows} more rows`)
    if (totalCols > maxCols)
      clipNotes.push(`+${totalCols - maxCols} more cols`)
    const clipMsg = truncateVisual(`… ${clipNotes.join(', ')} (all interactive in TinyPivot)`, innerWidth)
    tableLines.push(`│ ${padEndVisual(clipMsg, innerWidth)} │`)
    tableLines.push(footerLine)
  }
  else {
    // Replace botColsRule with clean direct bottom border when no clip line, or render integrated footer bar
    tableLines.pop()
    if (showBranding) {
      tableLines.push(botColsRule)
      const leftTxt = 'tiny-pivot.com'
      const rightTxt = truncateVisual(metaRight, Math.max(4, innerWidth - visualWidth(leftTxt) - 2))
      const gap = Math.max(1, innerWidth - visualWidth(leftTxt) - visualWidth(rightTxt))
      tableLines.push(`│ ${leftTxt}${' '.repeat(gap)}${rightTxt} │`)
      tableLines.push(`╰${'─'.repeat(innerWidth + 2)}╯`)
    }
    else {
      tableLines.push(`╰─${widths.map(w => '─'.repeat(w)).join('─┴─')}─╯`)
    }
  }
  tableLines.push('```')

  const headline = dataset.truncatedForFreeTier
    ? `Pivot on **${dataset.name}** (**first ${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows — Free tier subset**):`
    : `Pivot on **${dataset.name}** (${dataset.rows.length.toLocaleString()} source rows):`

  const out = [
    headline,
    '',
    tableLines.join('\n'),
    '',
    '_Display the fenced TinyPivot table above verbatim when replying in a terminal harness._',
  ]

  if (result.rowHeaders.length > maxRows) {
    out.push(`_…and ${result.rowHeaders.length - maxRows} more rows visible interactively in TinyPivot._`)
  }
  if (companionUrl) {
    out.push('', `Interactive Data IDE (live-updating): ${companionUrl}`)
  }

  return out.join('\n')
}
