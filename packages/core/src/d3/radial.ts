/**
 * Radial bar (bars around a circle, stacked by series) and radial area
 * (a closed filled line around a circle, one ring per series).
 */
import type { ChartData } from '../types'
import type { DrawContext, Group } from './context'
import { scaleBand, scaleLinear, scaleRadial } from 'd3-scale'
import { arc, areaRadial, curveCatmullRomClosed, curveLinearClosed, lineRadial, stack } from 'd3-shape'
import { compareLabels, processChartData } from '../chart/index'
import { applyGlow, bindTooltip, compact, emphasisFill, formatValue, haloText, isCallout, labelTrimmer, seriesFill, styleText, TRANSITION_MS, truncate } from './context'

/** Most categories a radial chart draws before labels collide. */
export const RADIAL_MAX_CATEGORIES = 60

interface Layout {
  center: Group
  outer: number
  inner: number
}

function layout(ctx: DrawContext, innerRatio: number, labelSpace: number): Layout {
  const room = Math.min(ctx.width, ctx.height) / 2
  // In short panels the rings keep at least 60% of the room; long labels then use the margin.
  const outer = Math.max(20, room - labelSpace, room * 0.6)
  const center = ctx.svg.append('g').attr('transform', `translate(${ctx.width / 2}, ${ctx.height / 2})`)
  return { center, outer, inner: outer * innerRatio }
}

/** Longest line a wrapped label may have, in characters. */
const WRAP_CHARS = 11

/** Split a label into at most two lines at a space; a single long word is truncated instead. */
export function wrapLabel(label: string, maxChars = WRAP_CHARS): string[] {
  if (label.length <= maxChars)
    return [label]
  const words = label.split(' ')
  let first = ''
  while (words.length > 1 && `${first} ${words[0]}`.trim().length <= maxChars)
    first = `${first} ${words.shift()}`.trim()
  if (!first)
    return [truncate(label, maxChars * 6.6, 11)]
  const rest = words.join(' ')
  return [first, rest.length > maxChars ? `${rest.slice(0, maxChars - 1)}…` : rest]
}

interface AngleLabels {
  lines: string[][]
  size: number
  /** Pixels the labels need outside the outermost ring */
  space: number
}

/** Prepare category labels: drop a shared prefix, wrap long names, size down when crowded. */
function angleLabels(labels: string[]): AngleLabels {
  const short = labelTrimmer(labels)
  const size = labels.length > 24 ? 9 : labels.length > 14 ? 10 : 11
  const lines = labels.map(l => wrapLabel(short(l)))
  const widest = Math.max(...lines.flat().map(l => l.length)) * size * 0.58
  return { lines, size, space: Math.min(96, widest + 14) }
}

function limitCategories(ctx: DrawContext, chart: ChartData): ChartData {
  if (chart.categories.length <= RADIAL_MAX_CATEGORIES)
    return chart
  ctx.notes.push(`Showing ${RADIAL_MAX_CATEGORIES} of ${chart.categories.length} categories; filter the grid to see the rest.`)
  return {
    categories: chart.categories.slice(0, RADIAL_MAX_CATEGORIES),
    series: chart.series.map(s => ({ ...s, data: s.data.slice(0, RADIAL_MAX_CATEGORIES) })),
  }
}

/** Concentric gridlines; tick labels sit along `labelAngle` (radians from 12 o'clock) to stay clear of spokes. */
function drawRings(ctx: DrawContext, g: Group, radius: (v: number) => number, ticks: number[], labelAngle = 0): void {
  const rings = g.append('g').attr('class', 'vpg-d3-axis')
  for (const tick of ticks) {
    if (radius(tick) < 28)
      continue
    rings.append('circle')
      .attr('r', radius(tick))
      .attr('fill', 'none')
      .attr('stroke', ctx.theme.grid)
      .attr('stroke-dasharray', ctx.theme.gridDash)
    const a = labelAngle - Math.PI / 2
    haloText(rings, ctx, Math.cos(a) * radius(tick) + 2, Math.sin(a) * radius(tick) - 5, compact(ctx, tick), { size: 9, mono: true, weight: 400, color: ctx.theme.muted })
  }
}

/** Category labels around the circle, rotated to read outward; long names wrap to two lines. */
function drawAngleLabels(ctx: DrawContext, g: Group, labels: string[], prepared: AngleLabels, angleOf: (i: number) => number, radius: number): void {
  labels.forEach((label, i) => {
    const deg = (angleOf(i) * 180) / Math.PI - 90
    const flip = deg > 90 && deg < 270
    const lines = prepared.lines[i]
    const text = styleText(g.append('text'), ctx, { size: prepared.size, color: ctx.theme.ink, weight: isCallout(ctx, label) ? 700 : 400 })
      .attr('transform', `rotate(${deg}) translate(${radius + 6}, 0)${flip ? ' rotate(180)' : ''}`)
      .attr('text-anchor', flip ? 'end' : 'start')
      .attr('dominant-baseline', 'central')
    lines.forEach((line, k) => {
      text.append('tspan')
        .attr('x', 0)
        .attr('dy', k === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em')
        .text(line)
    })
  })
}

/** Series swatches for the header key; only stacked bars need one. */
function seriesKey(ctx: DrawContext, names: string[], fillFor: (i: number) => string): void {
  if (names.length < 2)
    return
  ctx.key.push(...names.slice(0, 8).map((label, i) => ({ label, fill: fillFor(i) })))
}

/** In the house style the latest period (last in label order) is lit; the others are context. */
function litSeriesIndex(names: string[]): number {
  const latest = [...names].sort(compareLabels).at(-1)
  return Math.max(0, names.indexOf(latest ?? ''))
}

interface StackPoint {
  category: string
  series: string
  seriesIndex: number
  value: number
  y0: number
  y1: number
}

function stackPoints(chart: ChartData): StackPoint[] {
  const rows = chart.categories.map((category, ci) => {
    const row: Record<string, number | string> = { category }
    chart.series.forEach((s, si) => {
      row[si] = Math.max(0, s.data[ci] ?? 0)
    })
    return row
  })
  const stacked = stack<Record<string, number | string>>().keys(chart.series.map((_, si) => String(si)))(rows)
  return stacked.flatMap((layer, si) => layer.map((pt, ci) => ({
    category: chart.categories[ci],
    series: chart.series[si].name,
    seriesIndex: si,
    value: chart.series[si].data[ci] ?? 0,
    y0: pt[0],
    y1: pt[1],
  })))
}

export function drawRadialBar(ctx: DrawContext): void {
  const chart = limitCategories(ctx, processChartData(ctx.data, ctx.config))
  if (chart.categories.length === 0)
    return
  const prepared = angleLabels(chart.categories)
  const { center, outer, inner } = layout(ctx, 0.28, prepared.space)
  const points = stackPoints(chart)
  const max = Math.max(1, ...points.map(p => p.y1))
  const angle = scaleBand().domain(chart.categories).range([0, 2 * Math.PI]).paddingInner(0.12)
  const radius = scaleRadial().domain([0, max]).range([inner, outer]).nice()
  drawRings(ctx, center, radius, radius.ticks(3).filter(t => t > 0))

  const shape = arc<StackPoint>()
    .startAngle(d => angle(d.category)!)
    .endAngle(d => angle(d.category)! + angle.bandwidth())
    .innerRadius(d => radius(d.y0))
    .padAngle(0.01)
    .padRadius(inner)
    .cornerRadius(ctx.theme.radius)
  const final = (d: StackPoint): string => shape.outerRadius(radius(d.y1))(d) ?? ''
  const marks = applyGlow(ctx, center.append('g')).selectAll('path').data(points).join('path').attr('class', 'vpg-d3-mark').attr('fill', d => emphasisFill(ctx, d.category, d.seriesIndex)).attr('stroke', ctx.theme.markStrokeWidth > 0 ? ctx.theme.ink : ctx.theme.surface).attr('stroke-width', Math.max(0.5, ctx.theme.markStrokeWidth)).attr('d', final)
  if (ctx.animate) {
    // Grow each bar outward by tweening its radius; interpolating path strings breaks on corner arcs.
    marks.transition().duration(TRANSITION_MS).delay((_, i) => Math.min(i, 40) * 10).attrTween('d', (d) => {
      const r0 = radius(d.y0)
      const r1 = radius(d.y1)
      return t => shape.outerRadius(r0 + (r1 - r0) * t)(d) ?? ''
    })
  }
  bindTooltip(marks, ctx, d => ({ title: d.category, lines: [`${d.series}: ${formatValue(ctx, d.value)}`] }), d => d.category)

  // Total at the tip of each called-out bar.
  for (const category of chart.categories.filter(c => isCallout(ctx, c))) {
    const top = Math.max(...points.filter(p => p.category === category).map(p => p.y1))
    const mid = angle(category)! + angle.bandwidth() / 2 - Math.PI / 2
    const r = radius(top) - 14
    haloText(center, ctx, Math.cos(mid) * r, Math.sin(mid) * r, compact(ctx, top), { anchor: 'middle', size: 11, mono: true, weight: 700 })
  }

  drawAngleLabels(ctx, center, chart.categories, prepared, i => angle(chart.categories[i])! + angle.bandwidth() / 2, outer)
  seriesKey(ctx, chart.series.map(s => s.name), i => emphasisFill(ctx, '', i))
}

/**
 * Name a series on its own line instead of a legend: at the series' widest
 * point, nudged off the dot. Skipped for a single series (the kicker names it).
 */
/**
 * Where to name each series: the spoke where the lines sit furthest apart,
 * away from the peak callout. The larger series is named just outside its line,
 * the others just inside, so the names never stack.
 */
export function seriesLabelSpoke(series: Array<{ data: number[] }>, avoid: number): number {
  const n = series[0]?.data.length ?? 0
  let best = 0
  let bestGap = -1
  for (let i = 0; i < n; i++) {
    const values = series.map(s => s.data[i] ?? 0)
    const gap = Math.max(...values) - Math.min(...values)
    const near = Math.min(Math.abs(i - avoid), n - Math.abs(i - avoid)) <= 1
    if (!near && gap > bestGap) {
      best = i
      bestGap = gap
    }
  }
  return best
}

function labelSeries(ctx: DrawContext, g: Group, chart: ChartData, at: number, angleOf: (i: number) => number, radius: (v: number) => number, outer: number, colorOf: (si: number) => string): void {
  if (!ctx.config.seriesField || chart.series.length < 2)
    return
  const a = angleOf(at) - Math.PI / 2
  const radii = chart.series.map(s => radius(Math.max(0, s.data[at] ?? 0)))
  const big = Math.max(...radii)
  const small = Math.min(...radii)
  chart.series.forEach((series, si) => {
    let r = radii[si] - 14
    if (radii[si] === big && big !== small) {
      // Between the lines when they are far enough apart, else outside if that clears the month labels.
      if (big - small >= 26)
        r = (big + small) / 2
      else if (big + 16 < outer - 10)
        r = big + 14
      else
        r = small - 30
    }
    haloText(g, ctx, Math.cos(a) * r, Math.sin(a) * r, series.name, { anchor: 'middle', size: 11, weight: 700, color: colorOf(si) })
  })
}

/** Peak and trough callouts on the outermost series, pointing outward from the centre. */
function annotatePeaks(ctx: DrawContext, g: Group, chart: ChartData, angleOf: (i: number) => number, radius: (v: number) => number): void {
  const [peak, trough] = ctx.story?.callouts ?? []
  // Position at the outermost series; label with the combined total, as the headline counts it.
  const outerMost = chart.categories.map((_, i) => Math.max(...chart.series.map(s => s.data[i] ?? 0)))
  const totals = chart.categories.map((_, i) => chart.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0))
  const notes: Array<[string | undefined, string]> = [[peak, 'Peak'], [trough, 'Low']]
  for (const [label, word] of notes) {
    const i = label === undefined ? -1 : chart.categories.indexOf(label)
    const r0 = i < 0 ? 0 : radius(Math.max(0, outerMost[i]))
    // A low point near the centre has no room for a callout; the headline already names it.
    if (r0 < 60)
      continue
    const a = angleOf(i) - Math.PI / 2
    const r = r0 - 22
    haloText(g, ctx, Math.cos(a) * r, Math.sin(a) * r - 6, word, { anchor: 'middle', size: 10, weight: 700 })
    haloText(g, ctx, Math.cos(a) * r, Math.sin(a) * r + 7, compact(ctx, totals[i]), { anchor: 'middle', size: 11, mono: true, weight: 700 })
  }
}

export function drawRadialArea(ctx: DrawContext): void {
  const processed = limitCategories(ctx, processChartData(ctx.data, ctx.config))
  // A closed shape has no gaps: a month with no rows sits at the centre.
  const chart = { ...processed, series: processed.series.map(s => ({ ...s, data: s.data.map(v => v ?? 0) })) }
  const n = chart.categories.length
  if (n < 3) {
    ctx.notes.push('A radial area needs at least 3 categories; try Bar or Line for fewer.')
    return
  }
  const prepared = angleLabels(chart.categories)
  const { center, outer, inner } = layout(ctx, 0.08, prepared.space)
  const max = Math.max(1, ...chart.series.flatMap(s => s.data))
  const radius = scaleLinear().domain([0, max]).range([inner, outer]).nice()
  const angleOf = (i: number): number => (i / n) * 2 * Math.PI
  drawRings(ctx, center, radius, radius.ticks(3).filter(t => t > 0), Math.PI / n)
  const spokes = center.append('g')
  for (let i = 0; i < n; i++) {
    const a = angleOf(i) - Math.PI / 2
    spokes.append('line').attr('x2', Math.cos(a) * outer).attr('y2', Math.sin(a) * outer).attr('stroke', ctx.theme.grid)
  }

  const curve = ctx.theme.curve === 'step' ? curveLinearClosed : curveCatmullRomClosed
  const area = areaRadial<number>().angle((_, i) => angleOf(i)).innerRadius(inner).outerRadius(v => radius(Math.max(0, v))).curve(curve)
  const line = lineRadial<number>().angle((_, i) => angleOf(i)).radius(v => radius(Math.max(0, v))).curve(curve)
  const flat = areaRadial<number>().angle((_, i) => angleOf(i)).innerRadius(inner).outerRadius(inner).curve(curve)
  const layer = applyGlow(ctx, center.append('g'))
  const highlight = (ctx.config.options?.emphasis ?? 'highlight') === 'highlight'
  const lit = litSeriesIndex(chart.series.map(s => s.name))
  // Context series first, so the lit one draws on top.
  const order = chart.series.map((_, i) => i).sort((a, b) => Number(a === lit) - Number(b === lit))
  for (const si of order) {
    const series = chart.series[si]
    const isLit = !highlight || si === lit
    const fill = highlight ? (isLit ? seriesFill(ctx, 0) : ctx.theme.fillMode === 'pattern' ? `url(#${ctx.uid}-d0)` : ctx.theme.quiet[2]) : seriesFill(ctx, si)
    const stroke = ctx.theme.fillMode === 'pattern' ? ctx.theme.ink : highlight ? (isLit ? ctx.theme.accent : ctx.theme.quiet[0]) : ctx.theme.palette[si % ctx.theme.palette.length]
    const path = layer.append('path')
      .attr('fill', fill)
      .attr('fill-opacity', isLit || ctx.theme.fillMode === 'pattern' ? ctx.theme.areaOpacity : ctx.theme.areaOpacity * 0.7)
      .attr('d', ctx.animate ? flat(series.data) : area(series.data))
    if (ctx.animate)
      path.transition().duration(TRANSITION_MS).attr('d', area(series.data))
    const dash = ctx.theme.lineDashes[si % Math.max(1, ctx.theme.lineDashes.length)]
    layer.append('path')
      .attr('fill', 'none')
      .attr('stroke', stroke)
      .attr('stroke-width', ctx.theme.lineWidth)
      .attr('stroke-dasharray', dash ? `${dash} ${dash / 2 + 2}` : null)
      .attr('d', line(series.data))
    const dots = layer.append('g').selectAll('circle').data(series.data.map((value, i) => ({ value, i }))).join('circle').attr('class', 'vpg-d3-mark').attr('r', 3.5).attr('cx', d => Math.cos(angleOf(d.i) - Math.PI / 2) * radius(Math.max(0, d.value))).attr('cy', d => Math.sin(angleOf(d.i) - Math.PI / 2) * radius(Math.max(0, d.value))).attr('fill', stroke).attr('stroke', ctx.theme.surface).attr('stroke-width', 1.5)
    bindTooltip(dots, ctx, d => ({ title: chart.categories[d.i], lines: [`${series.name}: ${formatValue(ctx, d.value)}`] }))
  }
  annotatePeaks(ctx, center, chart, angleOf, radius)
  const peakIndex = chart.categories.indexOf(ctx.story?.callouts[0] ?? '')
  const seriesColour = (si: number): string => (ctx.theme.fillMode === 'pattern' || si === lit || !highlight ? ctx.theme.ink : ctx.theme.muted)
  labelSeries(ctx, center, chart, seriesLabelSpoke(chart.series, peakIndex), angleOf, radius, outer, si => (si === lit && highlight && ctx.theme.fillMode !== 'pattern' ? ctx.theme.accent : seriesColour(si)))
  drawAngleLabels(ctx, center, chart.categories, prepared, angleOf, outer)
}
