/**
 * Bullet chart (Stephen Few): one row per category with qualitative bands,
 * the actual as a bar, and the target as a tick.
 */
import type { BulletRow } from '../chart/d3-data'
import type { DrawContext, Group } from './context'
import { scaleLinear } from 'd3-scale'
import { processChartDataForBullet } from '../chart/d3-data'
import { formatCompactChartValue } from '../chart/d3-theme'
import { applyGlow, bindTooltip, formatValue, isCallout, labelTrimmer, measureLabel, seriesFill, styleText, TRANSITION_MS, truncate } from './context'

const MARGIN = { top: 8, right: 92, bottom: 26, left: 12 }
const MAX_ROW_HEIGHT = 44

const STATUS_TEXT = { met: 'Target met', near: 'Within 20% of target', below: 'More than 20% below target' } as const

function rowLines(ctx: DrawContext, row: BulletRow): string[] {
  const lines = [`${measureLabel(ctx.config.yAxis)}: ${formatValue(ctx, row.value)}`]
  if (row.target !== null) {
    lines.push(`Target: ${formatValue(ctx, row.target)}`)
    if (row.target > 0)
      lines.push(`${Math.round((row.value / row.target) * 100)}% of target`)
  }
  if (row.status)
    lines.push(STATUS_TEXT[row.status])
  return lines
}

function drawAxis(ctx: DrawContext, x: ReturnType<typeof scaleLinear<number, number>>, top: number, bottom: number): void {
  const axis = ctx.svg.append('g').attr('class', 'vpg-d3-axis')
  for (const tick of x.ticks(5)) {
    axis.append('line')
      .attr('x1', x(tick))
      .attr('x2', x(tick))
      .attr('y1', top)
      .attr('y2', bottom)
      .attr('stroke', ctx.theme.grid)
      .attr('stroke-dasharray', ctx.theme.gridDash)
    styleText(axis.append('text'), ctx, { mono: true, size: 10 })
      .attr('x', x(tick))
      .attr('y', bottom + 14)
      .attr('text-anchor', 'middle')
      .text(formatCompactChartValue(tick))
  }
}

function drawRow(ctx: DrawContext, g: Group, row: BulletRow, x: (v: number) => number, rowHeight: number): void {
  const { theme } = ctx
  const bandHeight = rowHeight * 0.62
  const bandY = (rowHeight - bandHeight) / 2
  // Widest band first so narrower, stronger bands sit on top.
  for (const i of [2, 1, 0]) {
    g.append('rect')
      .attr('x', x(0))
      .attr('y', bandY)
      .attr('width', Math.max(0, x(row.bands[i]) - x(0)))
      .attr('height', bandHeight)
      .attr('fill', theme.bands[i])
  }
  const barHeight = bandHeight / 3
  const bar = applyGlow(ctx, g.append('g')).append('rect').attr('class', 'vpg-d3-mark').attr('x', x(0)).attr('y', (rowHeight - barHeight) / 2).attr('height', barHeight).attr('fill', seriesFill(ctx, 0)).attr('stroke', theme.markStrokeWidth > 0 ? theme.ink : 'none').attr('stroke-width', theme.markStrokeWidth).attr('width', ctx.animate ? 0 : Math.max(0, x(row.value) - x(0)))
  if (ctx.animate)
    bar.transition().duration(TRANSITION_MS).attr('width', Math.max(0, x(row.value) - x(0)))
  if (row.target !== null) {
    g.append('line')
      .attr('x1', x(row.target))
      .attr('x2', x(row.target))
      .attr('y1', rowHeight * 0.14)
      .attr('y2', rowHeight * 0.86)
      .attr('stroke', theme.ink)
      .attr('stroke-width', 2.5)
  }
  // Value, then attainment, in a right-hand column; the status colours the attainment.
  const value = styleText(g.append('text'), ctx, { mono: true, size: 11, color: theme.ink, weight: 600 })
    .attr('x', x(row.bands[2]) + 6)
    .attr('y', rowHeight / 2)
    .attr('dominant-baseline', 'central')
    .text(formatCompactChartValue(row.value))
  if (row.target !== null && row.target > 0) {
    value.append('tspan')
      .attr('fill', row.status === 'met' ? theme.accent : theme.muted)
      .attr('font-weight', row.status === 'met' ? 700 : 400)
      .text(` ${Math.round((row.value / row.target) * 100)}%`)
  }
}

export function drawBullet(ctx: DrawContext): void {
  const bullet = processChartDataForBullet(ctx.data, ctx.config)
  if (bullet.rows.length === 0)
    return
  if (bullet.truncated > 0)
    ctx.notes.push(`Showing the first ${bullet.rows.length} rows; ${bullet.truncated} more are in the grid.`)
  const short = labelTrimmer(bullet.rows.map(r => r.label))
  const labelWidth = Math.min(180, Math.max(48, ...bullet.rows.map(r => short(r.label).length * 6.6)))
  const left = MARGIN.left + labelWidth
  const plotHeight = ctx.height - MARGIN.top - MARGIN.bottom
  const rowHeight = Math.min(MAX_ROW_HEIGHT, plotHeight / bullet.rows.length)
  const x = scaleLinear().domain([0, bullet.max || 1]).range([left, ctx.width - MARGIN.right]).nice()
  drawAxis(ctx, x, MARGIN.top, MARGIN.top + rowHeight * bullet.rows.length)

  bullet.rows.forEach((row, i) => {
    const g = ctx.svg.append('g').attr('transform', `translate(0, ${MARGIN.top + i * rowHeight})`)
    const called = isCallout(ctx, row.label)
    styleText(g.append('text'), ctx, { size: 11, color: ctx.theme.ink, weight: called ? 700 : 400 })
      .attr('x', left - 8)
      .attr('y', rowHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .text(truncate(short(row.label), labelWidth))
    drawRow(ctx, g, row, x, rowHeight)
    const hit = g.append('rect')
      .attr('x', left)
      .attr('width', ctx.width - MARGIN.right - left)
      .attr('height', rowHeight)
      .attr('fill', 'transparent')
      .datum(row)
    bindTooltip(hit, ctx, d => ({ title: d.label, lines: rowLines(ctx, d) }))
    if (!called)
      return
    // A hairline rule under the called-out rows, like a highlighted line in a printed table.
    g.append('line')
      .attr('x1', MARGIN.left)
      .attr('x2', ctx.width - 4)
      .attr('y1', rowHeight - 0.5)
      .attr('y2', rowHeight - 0.5)
      .attr('stroke', ctx.theme.ink)
      .attr('stroke-opacity', 0.35)
  })
}
