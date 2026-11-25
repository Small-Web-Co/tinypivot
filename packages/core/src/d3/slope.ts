/**
 * Slope chart: each category is a line from its first-period value (left) to
 * its last-period value (right). Rising lines take the accent; the story's
 * biggest riser and faller are drawn heavier and labelled with their change.
 */
import type { SlopeRow } from '../chart/d3-data'
import type { DrawContext, Group } from './context'
import { scaleLinear } from 'd3-scale'
import { processChartDataForSlope } from '../chart/d3-data'
import { applyGlow, bindTooltip, compact, formatValue, isCallout, labelTrimmer, styleText, TRANSITION_MS, truncate } from './context'

const MARGIN = { top: 26, bottom: 12 }
const MIN_LABEL_GAP = 15
const MAX_LINES = 40

export interface LabelSlot {
  /** Where the label wants to sit (its point) */
  y: number
  /** Higher places first; ties keep input order */
  priority: number
  /** How far the label may move off its point */
  reach: number
}

/**
 * Greedy label placement: the most important labels take their own spot
 * first; each later label takes the nearest free spot within its reach, or is
 * dropped (`null`) rather than crowding the others. The line stays, and its
 * tooltip still names it.
 */
export function placeLabels(slots: LabelSlot[], gap: number, min: number, max: number): Array<number | null> {
  const order = slots.map((slot, i) => ({ ...slot, i })).sort((a, b) => b.priority - a.priority || a.i - b.i)
  const taken: number[] = []
  const out: Array<number | null> = slots.map(() => null)
  const free = (y: number): boolean => y >= min && y <= max && taken.every(t => Math.abs(t - y) >= gap)
  for (const slot of order) {
    for (let d = 0; d <= slot.reach; d += 1) {
      const candidate = [slot.y + d, slot.y - d].find(free)
      if (candidate !== undefined) {
        taken.push(candidate)
        out[slot.i] = candidate
        break
      }
    }
  }
  return out
}

function changeText(row: SlopeRow): string {
  if (row.change === null)
    return 'new'
  const pct = Math.round(row.change * 100)
  return `${pct >= 0 ? '+' : ''}${pct}%`
}

function lineColour(ctx: DrawContext, row: SlopeRow): string {
  if (ctx.theme.fillMode === 'pattern')
    return ctx.theme.ink
  const called = isCallout(ctx, row.label)
  // House style: only the story's riser (accent) and faller (ink) carry colour; the rest is context.
  if ((ctx.config.options?.emphasis ?? 'highlight') === 'highlight')
    return called ? (row.end >= row.start ? ctx.theme.accent : ctx.theme.ink) : ctx.theme.quiet[1]
  if (row.end >= row.start)
    return ctx.theme.accent
  return called ? ctx.theme.ink : ctx.theme.muted
}

function drawSide(ctx: DrawContext, g: Group, rows: SlopeRow[], side: 'left' | 'right', x: number, y: (v: number) => number, short: (l: string) => string, labelWidth: number): void {
  const values = rows.map(r => (side === 'left' ? r.start : r.end))
  // Called-out lines always get a label (and may move further); the rest by size, until space runs out.
  const slots = rows.map((row, i) => isCallout(ctx, row.label)
    ? { y: y(values[i]), priority: Number.MAX_SAFE_INTEGER, reach: MIN_LABEL_GAP * 4 }
    : { y: y(values[i]), priority: values[i], reach: MIN_LABEL_GAP * 0.75 })
  const ys = placeLabels(slots, MIN_LABEL_GAP, MARGIN.top, ctx.height - MARGIN.bottom)
  const dir = side === 'left' ? -1 : 1
  rows.forEach((row, i) => {
    const labelY = ys[i]
    if (labelY === null)
      return
    const called = isCallout(ctx, row.label)
    const pointY = y(values[i])
    // A leader from the point when the label had to move.
    if (Math.abs(labelY - pointY) > 2) {
      g.append('path')
        .attr('d', `M${x + dir * 4},${pointY} L${x + dir * 10},${labelY}`)
        .attr('fill', 'none')
        .attr('stroke', ctx.theme.muted)
        .attr('stroke-width', 0.75)
    }
    const text = side === 'left'
      ? `${truncate(short(row.label), labelWidth)}  ${compact(ctx, row.start)}`
      : `${compact(ctx, row.end)}  ${truncate(short(row.label), labelWidth)}${called ? `  ${changeText(row)}` : ''}`
    styleText(g.append('text'), ctx, { size: called ? 12 : 11, color: called ? lineColour(ctx, row) : ctx.theme.ink, weight: called ? 700 : 400 })
      .attr('x', x + dir * 12)
      .attr('y', labelY)
      .attr('text-anchor', side === 'left' ? 'end' : 'start')
      .attr('dominant-baseline', 'central')
      .text(text)
  })
}

export function drawSlope(ctx: DrawContext): void {
  const slope = processChartDataForSlope(ctx.data, ctx.config)
  if (!slope) {
    ctx.notes.push('A slope chart needs a period field (e.g. year) with at least two values in Periods.')
    return
  }
  if (slope.rows.length > MAX_LINES)
    ctx.notes.push(`Showing the ${MAX_LINES} largest of ${slope.rows.length} lines.`)
  const rows = slope.rows.slice(0, MAX_LINES)
  const short = labelTrimmer(rows.map(r => r.label))
  const labelWidth = Math.min(150, Math.max(40, ...rows.map(r => short(r.label).length * 6.6)))
  const left = Math.min(ctx.width * 0.35, labelWidth + 64)
  const right = Math.max(ctx.width * 0.65, ctx.width - labelWidth - 110)
  // Fit the data, not zero: a slope chart reads angles, and a zero baseline flattens them.
  const values = rows.flatMap(r => [r.start, r.end])
  const y = scaleLinear().domain([Math.min(...values), Math.max(...values)]).range([ctx.height - MARGIN.bottom, MARGIN.top]).nice()

  for (const [x, label] of [[left, slope.from], [right, slope.to]] as const) {
    ctx.svg.append('line').attr('x1', x).attr('x2', x).attr('y1', MARGIN.top - 6).attr('y2', ctx.height - MARGIN.bottom).attr('stroke', ctx.theme.grid)
    styleText(ctx.svg.append('text'), ctx, { mono: true, size: 11, color: ctx.theme.title, weight: 700 })
      .attr('x', x)
      .attr('y', 10)
      .attr('text-anchor', 'middle')
      .text(label)
  }

  // Quiet lines first, called-out lines on top.
  const ordered = [...rows].sort((a, b) => Number(isCallout(ctx, a.label)) - Number(isCallout(ctx, b.label)))
  const layer = applyGlow(ctx, ctx.svg.append('g'))
  const lines = layer.selectAll('line').data(ordered).join('line').attr('class', 'vpg-d3-mark').attr('x1', left).attr('x2', right).attr('y1', d => y(d.start)).attr('y2', d => (ctx.animate ? y(d.start) : y(d.end))).attr('stroke', d => lineColour(ctx, d)).attr('stroke-width', d => (isCallout(ctx, d.label) ? ctx.theme.lineWidth + 1.5 : Math.max(1.25, ctx.theme.lineWidth - 1))).attr('stroke-opacity', d => (isCallout(ctx, d.label) || ordered.length <= 8 ? 1 : 0.55)).attr('stroke-dasharray', d => (ctx.theme.fillMode === 'pattern' && d.end < d.start ? '4 3' : null)).attr('stroke-linecap', 'round')
  if (ctx.animate)
    lines.transition().duration(TRANSITION_MS).delay((_, i) => Math.min(i, 30) * 15).attr('y2', d => y(d.end))
  bindTooltip(lines, ctx, d => ({
    title: d.label,
    lines: [`${slope.from}: ${formatValue(ctx, d.start)}`, `${slope.to}: ${formatValue(ctx, d.end)}`, `Change: ${changeText(d)}`],
  }), d => d.label)

  for (const [x, key] of [[left, 'start'], [right, 'end']] as const) {
    layer.append('g').selectAll('circle').data(ordered).join('circle').attr('cx', x).attr('cy', d => y(d[key])).attr('r', d => (isCallout(ctx, d.label) ? 4 : 2.5)).attr('fill', d => lineColour(ctx, d)).attr('stroke', ctx.theme.surface).attr('stroke-width', 1).attr('pointer-events', 'none')
  }
  drawSide(ctx, ctx.svg.append('g'), rows, 'left', left, y, short, labelWidth)
  drawSide(ctx, ctx.svg.append('g'), rows, 'right', right, y, short, labelWidth)
}
