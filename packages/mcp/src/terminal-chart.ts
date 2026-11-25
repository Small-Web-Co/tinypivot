import type { ChartConfig, TerminalPalette } from '@smallwebco/tinypivot-core'
import type { TerminalFormatOptions } from './card.js'
import type { StoredDataset } from './store.js'
import { processChartData, processChartDataForScatter } from '@smallwebco/tinypivot-core'
import { ansiFg, ansiFgBold, BRAILLE_BITS, CARD_DIVIDER, formatCompactNumber, padEndVisual, padStartVisual, renderPreciseBar, resolveTerminalPalette, SERIES_GLYPHS, truncateVisual, visualWidth, wrapInCard } from './card.js'

/**
 * Charts drawn in text for terminals: braille lines and areas, bars, and the other chart kinds,
 * framed as a card the agent can show verbatim.
 */

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

const LINE_SERIES_STYLES = ['━━', '┄┄', '··', '──'] as const
const NON_ADDITIVE_FIELD_RE = /(?:^|[^a-z])(?:share|pct|percent|percentage|rate|margin|ratio|bps|yield|arpu|aov|ltv|cac|roas|ctr|cvr|nps|avg|mean|median|index)(?:$|[^a-z])|%/i

export function isNonAdditiveMeasure(field?: string, aggregation?: string): boolean {
  if (
    aggregation === 'avg'
    || aggregation === 'median'
    || aggregation === 'min'
    || aggregation === 'max'
    || aggregation === 'stdDev'
    || aggregation === 'percentOfTotal'
  ) {
    return true
  }
  if (!field)
    return false
  const normalized = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return NON_ADDITIVE_FIELD_RE.test(normalized)
}

interface BrailleSeries {
  name: string
  values: Array<number | null>
}

/** A braille plot: its text lines, where the plot rows start, and which series drew each cell (-1 for none). */
interface BraillePlot {
  lines: string[]
  plotStart: number
  owners: number[][]
}

function renderBrailleLineBody(
  categories: string[],
  seriesList: BrailleSeries[],
  filledArea = false,
  nonAdditive = false,
): BraillePlot {
  const chartCols = 58
  const chartRows = 8
  const pxW = chartCols * 2
  const pxH = chartRows * 4

  const grid: number[][] = Array.from({ length: chartRows }, () => Array.from<number>({ length: chartCols }).fill(0))
  const owners: number[][] = Array.from({ length: chartRows }, () => Array.from<number>({ length: chartCols }).fill(-1))
  let drawing = 0
  const allFinite = seriesList.flatMap(s => s.values.filter((v): v is number => v !== null && Number.isFinite(v)))
  if (allFinite.length === 0)
    return { lines: [], plotStart: 0, owners }
  const { minVal, maxVal, span } = computeBrailleYBounds(allFinite)

  const setPixel = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
    const cellCol = Math.floor(cx / 2)
    const cellRow = Math.floor(cy / 4)
    grid[cellRow][cellCol] |= BRAILLE_BITS[cy % 4][cx % 2]
    owners[cellRow][cellCol] = drawing
  }

  // Track topmost y per x column for optional subtle area stipple fill (single-series area)
  const curveY = Array.from<number>({ length: pxW }).fill(pxH)
  const plotPoint = (x: number, y: number, trackCurve: boolean) => {
    const cx = Math.max(0, Math.min(pxW - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(pxH - 1, Math.round(y)))
    setPixel(cx, cy)
    if (trackCurve && cy < curveY[cx])
      curveY[cx] = cy
  }

  const shouldPlotStep = (seriesIdx: number, stepIdx: number): boolean => {
    if (seriesIdx === 0)
      return true
    if (seriesIdx === 1)
      return (stepIdx % 7) < 4
    return (stepIdx % 6) < 2
  }

  const count = categories.length
  for (let sIdx = 0; sIdx < seriesList.length; sIdx++) {
    const series = seriesList[sIdx]
    drawing = sIdx
    const trackCurve = filledArea && sIdx === 0 && seriesList.length === 1
    let prev: { x: number, y: number } | null = null
    let dashCounter = 0

    for (let i = 0; i < count; i++) {
      const val = series.values[i]
      if (val === null || !Number.isFinite(val)) {
        prev = null
        continue
      }
      const pt = {
        x: count === 1 ? pxW / 2 : (i / (count - 1)) * (pxW - 1),
        y: (pxH - 1) - ((val - minVal) / span) * (pxH - 1),
      }
      plotPoint(pt.x, pt.y, trackCurve)
      if (prev) {
        const steps = Math.max(1, Math.ceil(Math.hypot(pt.x - prev.x, pt.y - prev.y) * 1.5))
        for (let s = 1; s < steps; s++) {
          dashCounter++
          if (shouldPlotStep(sIdx, dashCounter)) {
            const t = s / steps
            plotPoint(prev.x + (pt.x - prev.x) * t, prev.y + (pt.y - prev.y) * t, trackCurve)
          }
        }
      }
      prev = pt
    }
  }

  if (filledArea && seriesList.length === 1) {
    drawing = 0
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
  if (seriesList.length > 1) {
    const legendItems = seriesList.slice(0, LINE_SERIES_STYLES.length).map((s, idx) => {
      const finite = s.values.filter((v): v is number => v !== null && Number.isFinite(v))
      const seriesSum = finite.reduce<number>((acc, v) => acc + v, 0)
      const statLabel = nonAdditive && finite.length > 0
        ? `avg ${formatCompactNumber(seriesSum / finite.length)}`
        : formatCompactNumber(seriesSum)
      return `${LINE_SERIES_STYLES[idx]} ${truncateVisual(s.name, 14)} (${statLabel})`
    })
    if (seriesList.length > LINE_SERIES_STYLES.length)
      legendItems.push(`+${seriesList.length - LINE_SERIES_STYLES.length} more`)
    lines.push(legendItems.join('   '))
    lines.push('')
  }

  const plotStart = lines.length
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

  return { lines, plotStart, owners }
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

/** Everything the chart kinds share: the data, the frame text and the colours. */
interface ChartContext {
  dataset: StoredDataset
  config: ChartConfig
  processed: ReturnType<typeof processChartData>
  title: string
  nonAdditive: boolean
  totalsPerCat: number[]
  grandTotal: number
  pal?: TerminalPalette
  liveRow: string | null
  statsLine: string
  footerLeft: string
  raw?: boolean
}

function paint(ctx: ChartContext, rgb: keyof Omit<TerminalPalette, 'label' | 'series'>, text: string): string {
  return ctx.pal ? ansiFg(ctx.pal[rgb], text) : text
}
function paintSeries(ctx: ChartContext, index: number, text: string): string {
  return ctx.pal ? ansiFg(ctx.pal.series[index % ctx.pal.series.length], text) : text
}

function frame(ctx: ChartContext, badge: string, body: string[], kind: string, stats = ctx.statsLine): string {
  body.push(CARD_DIVIDER, paint(ctx, 'muted', stats))
  if (ctx.liveRow)
    body.push(ctx.liveRow)
  const footerRight = `${ctx.dataset.rows.length.toLocaleString()} rows · ${kind}`
  return wrapInCard(ctx.title, badge, body, ctx.footerLeft, footerRight, 66, { palette: ctx.pal, raw: ctx.raw })
}

function totalBadge(ctx: ChartContext): string {
  const avg = ctx.grandTotal / Math.max(1, ctx.totalsPerCat.length)
  return ctx.nonAdditive
    ? `Avg ${formatCompactNumber(avg)} · ${ctx.processed.categories.length} pts`
    : `Total ${formatCompactNumber(ctx.grandTotal)}`
}

/** One braille plot row with each cell in the colour of the series that drew it. */
function paintPlotRow(ctx: ChartContext, row: string, owners: number[], multiSeries: boolean): string {
  const axisAt = Math.max(row.indexOf('┤'), row.indexOf('│'))
  const cells = [...row.slice(axisAt + 1)]
  let out = `${paint(ctx, 'muted', row.slice(0, axisAt))}${paint(ctx, 'border', row[axisAt])}`
  let start = 0
  for (let i = 1; i <= cells.length; i++) {
    if (i < cells.length && owners[i] === owners[start])
      continue
    const run = cells.slice(start, i).join('')
    out += owners[start] < 0 ? run : multiSeries ? paintSeries(ctx, owners[start], run) : paint(ctx, 'accent', run)
    start = i
  }
  return out
}

function lineBadge(ctx: ChartContext, series: BrailleSeries[]): string {
  if (!ctx.nonAdditive)
    return series.length === 1 && formatTrendDelta(ctx.totalsPerCat) ? `${totalBadge(ctx)} · ${formatTrendDelta(ctx.totalsPerCat)}` : totalBadge(ctx)
  const points = series.flatMap(s => s.values.filter((v): v is number => v !== null))
  if (series.length === 1)
    return `Avg ${formatCompactNumber(points.reduce((a, b) => a + b, 0) / Math.max(1, points.length))} · ${ctx.processed.categories.length} pts`
  return `Range ${formatCompactNumber(Math.min(...points))}–${formatCompactNumber(Math.max(...points))} · ${ctx.processed.categories.length} pts`
}

function seriesPeaks(series: BrailleSeries[], categories: string[]): string {
  const peaks = series.slice(0, 3).map((s) => {
    let best = -1
    s.values.forEach((v, i) => {
      if (v !== null && (best < 0 || v > (s.values[best] ?? Number.NEGATIVE_INFINITY)))
        best = i
    })
    return best >= 0
      ? `${truncateVisual(s.name, 10)} peak: ${truncateVisual(categories[best], 8)} (${formatCompactNumber(s.values[best]!)})`
      : `${truncateVisual(s.name, 10)}: —`
  })
  return `▲ ${peaks.join('  ·  ')}`
}

/** Braille lines and areas: each series in its own colour wherever the card is drawn in colour. */
function lineCard(ctx: ChartContext): string {
  const categories = ctx.processed.categories.map(String)
  // A series with no rows at a category comes back as null, so its line breaks there.
  const series: BrailleSeries[] = ctx.processed.series.map(s => ({
    name: s.name,
    values: s.data.map(val => (val !== null && Number.isFinite(val) ? val : null)),
  }))
  const multi = series.length > 1
  const plot = renderBrailleLineBody(categories, series, ctx.config.type === 'area', ctx.nonAdditive)
  const body = plot.lines.map((row, i) => {
    if (!ctx.pal)
      return row
    const plotRow = i - plot.plotStart
    if (plotRow >= 0 && plotRow < plot.owners.length)
      return paintPlotRow(ctx, row, plot.owners[plotRow], multi)
    if (multi && i === 0)
      return row.split('   ').map((item, s) => paintSeries(ctx, s, item)).join('   ')
    return paint(ctx, row.includes('└') ? 'border' : 'muted', row)
  })
  const stats = multi ? seriesPeaks(series, categories) : ctx.statsLine
  return frame(ctx, lineBadge(ctx, series), body, ctx.config.type === 'area' ? 'Area' : 'Line', stats)
}

const MAX_BAR_ENTRIES = 14
const BAR_WIDTH = 34

function barRow(ctx: ChartContext, label: string, labelWidth: number, bar: string, barPlainWidth: number, value: number, valWidth: number, pct?: number): string {
  const labelText = paint(ctx, 'text', padEndVisual(truncateVisual(label, labelWidth), labelWidth))
  const valueText = padStartVisual(formatCompactNumber(value), valWidth)
  const pctText = pct === undefined ? '' : `  ${paint(ctx, 'muted', `${pct.toFixed(1).padStart(5)}%`)}`
  return `${labelText} ${paint(ctx, 'border', '│')} ${bar}${' '.repeat(Math.max(0, BAR_WIDTH - barPlainWidth))} ${ctx.pal ? ansiFgBold(ctx.pal.text, valueText) : valueText}${pctText}`
}

function seriesLegend(ctx: ChartContext): string {
  const shown = ctx.processed.series.slice(0, SERIES_GLYPHS.length)
    .map((s, i) => `${paintSeries(ctx, i, SERIES_GLYPHS[i])} ${paint(ctx, 'text', truncateVisual(s.name, 14))}`)
  const more = ctx.processed.series.length - SERIES_GLYPHS.length
  return [...shown, ...(more > 0 ? [paint(ctx, 'muted', `+${more} more`)] : [])].join('  ')
}

function moreCategoriesNote(ctx: ChartContext, shown: number): string[] {
  const more = ctx.processed.categories.length - shown
  return more > 0 ? [paint(ctx, 'muted', `… +${more} more categories (all interactive in TinyPivot)`)] : []
}

/** Stacked bars: one bar per category, split into its series. */
function stackedCard(ctx: ChartContext): string {
  const entries = ctx.processed.categories.slice(0, MAX_BAR_ENTRIES).map((cat, idx) => ({
    label: String(cat),
    total: ctx.totalsPerCat[idx],
    segments: ctx.processed.series.map(s => Math.max(0, Number(s.data[idx]) || 0)),
  }))
  const maxVal = Math.max(...entries.map(e => Math.abs(e.total)), 1)
  const labelWidth = Math.min(20, Math.max(...entries.map(e => visualWidth(e.label)), 6))
  const valWidth = Math.max(...entries.map(e => visualWidth(formatCompactNumber(e.total))), 5)
  const body = [seriesLegend(ctx), '']
  for (const entry of entries) {
    const width = entry.total === 0 ? 0 : Math.max(1, Math.round((Math.abs(entry.total) / maxVal) * BAR_WIDTH))
    const sum = entry.segments.reduce((a, b) => a + b, 0) || 1
    let used = 0
    let bar = ''
    entry.segments.forEach((segment, i) => {
      const len = i === entry.segments.length - 1 ? Math.max(0, width - used) : Math.min(width - used, Math.round((segment / sum) * width))
      if (len > 0) {
        bar += paintSeries(ctx, i, SERIES_GLYPHS[i % SERIES_GLYPHS.length].repeat(len))
        used += len
      }
    })
    const pct = !ctx.nonAdditive && ctx.grandTotal > 0 ? (entry.total / ctx.grandTotal) * 100 : undefined
    body.push(barRow(ctx, entry.label, labelWidth, bar, used, entry.total, valWidth, pct))
  }
  body.push(...moreCategoriesNote(ctx, entries.length))
  return frame(ctx, totalBadge(ctx), body, 'Stacked Bar')
}

const MAX_GROUPED_CATEGORIES = 8

/** Grouped bars: under each category, one bar per series, so the series compare side by side. */
function groupedCard(ctx: ChartContext): string {
  const series = ctx.processed.series.slice(0, SERIES_GLYPHS.length)
  const categories = ctx.processed.categories.slice(0, MAX_GROUPED_CATEGORIES)
  const values = categories.flatMap((_, idx) => series.map(s => Math.abs(Number(s.data[idx]) || 0)))
  const maxVal = Math.max(...values, 1)
  const labelWidth = Math.min(18, Math.max(...series.map(s => visualWidth(s.name)), 6))
  const valWidth = Math.max(...values.map(v => visualWidth(formatCompactNumber(v))), 5)
  const body = [seriesLegend(ctx), '']
  categories.forEach((cat, idx) => {
    body.push(paint(ctx, 'text', truncateVisual(String(cat), 40)))
    series.forEach((s, i) => {
      const value = Number(s.data[idx]) || 0
      const plain = renderPreciseBar(Math.abs(value) / maxVal, BAR_WIDTH).replace(/[█▏▎▍▌▋▊▉]/g, m => (m === '█' ? SERIES_GLYPHS[i] : m))
      body.push(`  ${barRow(ctx, s.name, labelWidth, paintSeries(ctx, i, plain), visualWidth(plain), value, valWidth)}`)
    })
  })
  body.push(...moreCategoriesNote(ctx, categories.length))
  return frame(ctx, totalBadge(ctx), body, 'Grouped Bar')
}

/** Plain bars: one per category, longest first by value. */
function barCard(ctx: ChartContext): string {
  const entries = ctx.processed.categories.slice(0, MAX_BAR_ENTRIES).map((cat, idx) => ({ label: String(cat), total: ctx.totalsPerCat[idx] }))
  const maxVal = Math.max(...entries.map(e => Math.abs(e.total)), 1)
  const labelWidth = Math.min(20, Math.max(...entries.map(e => visualWidth(e.label)), 6))
  const valWidth = Math.max(...entries.map(e => visualWidth(formatCompactNumber(e.total))), 5)
  const body = entries.map((entry) => {
    const plain = renderPreciseBar(Math.abs(entry.total) / maxVal, BAR_WIDTH)
    const pct = !ctx.nonAdditive && ctx.grandTotal > 0 ? (entry.total / ctx.grandTotal) * 100 : undefined
    return barRow(ctx, entry.label, labelWidth, paint(ctx, 'accent', plain), visualWidth(plain), entry.total, valWidth, pct)
  })
  body.push(...moreCategoriesNote(ctx, entries.length))
  return frame(ctx, totalBadge(ctx), body, 'Bar')
}

const MAX_SHARE_SLICES = 9

/** Pie and donut: each category's share of the whole, largest first, the rest folded into "Other". */
function shareCard(ctx: ChartContext): string {
  const slices = ctx.processed.categories
    .map((cat, idx) => ({ label: String(cat), value: Math.max(0, ctx.totalsPerCat[idx]) }))
    .sort((a, b) => b.value - a.value)
  const shown = slices.slice(0, MAX_SHARE_SLICES)
  const rest = slices.slice(MAX_SHARE_SLICES).reduce((sum, s) => sum + s.value, 0)
  if (rest > 0)
    shown.push({ label: `Other (${slices.length - MAX_SHARE_SLICES})`, value: rest })
  const total = shown.reduce((sum, s) => sum + s.value, 0) || 1
  const labelWidth = Math.min(20, Math.max(...shown.map(s => visualWidth(s.label)), 6))
  const valWidth = Math.max(...shown.map(s => visualWidth(formatCompactNumber(s.value))), 5)
  const body = shown.map((slice, i) => {
    const plain = renderPreciseBar(slice.value / total, BAR_WIDTH)
    return barRow(ctx, slice.label, labelWidth, paintSeries(ctx, i, plain), visualWidth(plain), slice.value, valWidth, (slice.value / total) * 100)
  })
  const top = shown[0]
  const stats = `● Largest: ${truncateVisual(top.label, 16)} (${((top.value / total) * 100).toFixed(1)}%)  ·  ${slices.length} slices`
  return frame(ctx, `Total ${formatCompactNumber(total)}`, body, ctx.config.type === 'donut' ? 'Donut' : 'Pie', stats)
}

const HEAT_SHADES = ['·', '░', '▒', '▓', '█']
const MAX_HEAT_ROWS = 14
const MAX_HEAT_COLUMNS = 8
const HEAT_CELL = 7

/** Heatmap: categories down, series across, each cell shaded by its value. */
function heatmapCard(ctx: ChartContext): string {
  const rows = ctx.processed.categories.slice(0, MAX_HEAT_ROWS).map(String)
  const cols = ctx.processed.series.slice(0, MAX_HEAT_COLUMNS)
  const values = cols.flatMap(c => rows.map((_, r) => Number(c.data[r]) || 0))
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const labelWidth = Math.min(18, Math.max(...rows.map(r => visualWidth(r)), 6))
  const header = `${' '.repeat(labelWidth)} ${cols.map(c => padEndVisual(truncateVisual(c.name, HEAT_CELL - 1), HEAT_CELL)).join('')}`
  const body = [paint(ctx, 'muted', header)]
  rows.forEach((row, r) => {
    const cells = cols.map((c) => {
      const level = Math.round(((Number(c.data[r]) || 0) - min) / span * (HEAT_SHADES.length - 1))
      return `${paint(ctx, 'accent', HEAT_SHADES[level].repeat(HEAT_CELL - 1))} `
    })
    body.push(`${paint(ctx, 'text', padEndVisual(truncateVisual(row, labelWidth), labelWidth))} ${cells.join('')}`)
  })
  body.push('', paint(ctx, 'muted', `· low ${formatCompactNumber(min)}   █ high ${formatCompactNumber(min + span)}`))
  return frame(ctx, totalBadge(ctx), body, 'Heatmap')
}

/** Scatter and bubble: one braille point per row, each series in its own colour. */
function scatterCard(ctx: ChartContext): string | null {
  const data = processChartDataForScatter(ctx.dataset.rows, ctx.config)
  const points = data.series.flatMap((s, i) => s.data.map(p => ({ ...p, series: i })))
  if (points.length === 0)
    return null
  const cols = 58
  const rows = 10
  const grid = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0))
  const owners = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(-1))
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const [xMin, xMax, yMin, yMax] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  for (const p of points) {
    const px = Math.round(((p.x - xMin) / (xMax - xMin || 1)) * (cols * 2 - 1))
    const py = Math.round((1 - (p.y - yMin) / (yMax - yMin || 1)) * (rows * 4 - 1))
    const [r, c] = [Math.floor(py / 4), Math.floor(px / 2)]
    grid[r][c] |= BRAILLE_BITS[py % 4][px % 2]
    owners[r][c] = p.series
  }
  const yWidth = Math.max(visualWidth(formatCompactNumber(yMax)), visualWidth(formatCompactNumber(yMin)), 6)
  const multi = data.series.length > 1
  const body = multi ? [data.series.slice(0, 4).map((s, i) => paintSeries(ctx, i, `● ${truncateVisual(s.name, 14)}`)).join('   '), ''] : []
  grid.forEach((cells, r) => {
    const tick = r === 0 ? formatCompactNumber(yMax) : r === rows - 1 ? formatCompactNumber(yMin) : ''
    const row = `${padStartVisual(tick, yWidth)} ┤${cells.map(mask => String.fromCharCode(0x2800 + mask)).join('')}`
    body.push(ctx.pal ? paintPlotRow(ctx, row, owners[r], multi) : row)
  })
  body.push(paint(ctx, 'border', `${' '.repeat(yWidth)} └${'─'.repeat(cols)}`))
  const xMinLabel = formatCompactNumber(xMin)
  const xMaxLabel = formatCompactNumber(xMax)
  body.push(paint(ctx, 'muted', `${' '.repeat(yWidth + 2)}${xMinLabel}${' '.repeat(Math.max(1, cols - visualWidth(xMinLabel) - visualWidth(xMaxLabel)))}${xMaxLabel}`))
  const stats = `${points.length.toLocaleString()} points  ·  ${ctx.config.xAxis?.field} ${formatCompactNumber(xMin)}–${formatCompactNumber(xMax)}  ·  ${ctx.config.yAxis?.field} ${formatCompactNumber(yMin)}–${formatCompactNumber(yMax)}`
  return frame(ctx, `${points.length.toLocaleString()} pts`, body, ctx.config.type === 'bubble' ? 'Bubble' : 'Scatter', stats)
}

/** Picks the card for the chart type, falling back to bars where a kind cannot be drawn in text. */
function chartCard(ctx: ChartContext): string {
  const type = ctx.config.type
  const multi = ctx.processed.series.length > 1
  if ((type === 'line' || type === 'area') && ctx.processed.categories.length >= 3)
    return lineCard(ctx)
  if (type === 'pie' || type === 'donut')
    return shareCard(ctx)
  if (type === 'scatter' || type === 'bubble')
    return scatterCard(ctx) ?? barCard(ctx)
  if (type === 'heatmap' && multi)
    return heatmapCard(ctx)
  if (type === 'bar' && multi)
    return groupedCard(ctx)
  return multi ? stackedCard(ctx) : barCard(ctx)
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
  const config: ChartConfig = {
    type: chartConfig.type ?? 'bar',
    xAxis: chartConfig.xAxis,
    yAxis: chartConfig.yAxis,
    seriesField: chartConfig.seriesField,
    sizeField: chartConfig.sizeField,
    options: chartConfig.options,
  }
  const processed = processChartData(dataset.rows, config)
  if (!processed.categories.length || !processed.series.length)
    return ''

  const totalsPerCat = processed.categories.map((_, idx) =>
    processed.series.reduce((sum, s) => sum + (Number(s.data[idx]) || 0), 0),
  )
  const grandTotal = totalsPerCat.reduce((sum, v) => sum + v, 0)
  let peak = 0
  let low = 0
  totalsPerCat.forEach((v, i) => {
    if (v > totalsPerCat[peak])
      peak = i
    if (v < totalsPerCat[low])
      low = i
  })
  const pal = resolveTerminalPalette(options.colorTheme)
  const live = options.companionUrl ? `↗ Live: ${options.companionUrl}` : null
  const ctx: ChartContext = {
    dataset,
    config,
    processed,
    title: chartConfig.options?.title || `${dataset.name} · ${chartConfig.yAxis.field} by ${chartConfig.xAxis.field}`,
    nonAdditive: isNonAdditiveMeasure(chartConfig.yAxis.field, chartConfig.yAxis.aggregation),
    totalsPerCat,
    grandTotal,
    pal,
    liveRow: live && pal ? ansiFg(pal.accent, live) : live,
    statsLine: `▲ Peak: ${truncateVisual(String(processed.categories[peak]), 14)} (${formatCompactNumber(totalsPerCat[peak])})`
      + `  ·  ▼ Low: ${truncateVisual(String(processed.categories[low]), 14)} (${formatCompactNumber(totalsPerCat[low])})`
      + `  ·  ◆ Avg: ${formatCompactNumber(grandTotal / totalsPerCat.length)}`,
    footerLeft: options.showBranding !== false ? 'tiny-pivot.com' : '',
    raw: options.raw,
  }
  return chartCard(ctx)
}

export function detectNonAdditiveSumWarning(
  dataset: StoredDataset,
  chartConfig?: Partial<ChartConfig>,
): string | null {
  const xField = chartConfig?.xAxis?.field
  const yField = chartConfig?.yAxis?.field
  if (!xField || !yField || dataset.rows.length < 2)
    return null
  const agg = chartConfig?.yAxis?.aggregation ?? 'sum'
  if (agg !== 'sum' || !isNonAdditiveMeasure(yField))
    return null

  const sField = chartConfig?.seriesField?.field
  const counts = new Map<string, number>()
  let collisions = 0
  for (const row of dataset.rows) {
    const xKey = row[xField] === null || row[xField] === undefined ? '(blank)' : String(row[xField])
    const sKey = sField ? (row[sField] === null || row[sField] === undefined ? '(blank)' : String(row[sField])) : ''
    const key = sField ? `${xKey}\u0000${sKey}` : xKey
    const next = (counts.get(key) ?? 0) + 1
    counts.set(key, next)
    if (next === 2)
      collisions++
  }
  if (collisions === 0)
    return null

  const grain = sField ? `\`(${xField}, ${sField})\`` : `\`${xField}\``
  return `> **Data Integrity Warning:** \`${yField}\` appears to be a non-additive percentage/ratio, and **${collisions}** ${grain} bucket${collisions === 1 ? '' : 's'} contain multiple rows that were summed (\`aggregation: "sum"\`). Re-aggregate in SQL or Python to strictly 1 row per ${grain} using \`SUM(numerator) / SUM(denominator)\` before passing to TinyPivot.`
}
