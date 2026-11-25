/**
 * Treemap and sunburst over the two-level hierarchy from
 * `processChartDataForHierarchy` (parent = series field, leaf = X field).
 */
import type { HierarchyRectangularNode } from 'd3-hierarchy'
import type { HierarchyNode as DataNode } from '../chart/d3-data'
import type { DrawContext } from './context'
import { hierarchy, partition, treemap, treemapSquarify } from 'd3-hierarchy'
import { arc } from 'd3-shape'
import { processChartDataForHierarchy } from '../chart/d3-data'
import { formatCompactChartValue } from '../chart/d3-theme'
import { applyGlow, bindTooltip, formatValue, labelColorOn, labelTrimmer, measureLabel, sequentialFill, seriesFill, shade, styleText, TRANSITION_MS, truncate } from './context'

type Node = HierarchyRectangularNode<DataNode>

function buildRoot(ctx: DrawContext): ReturnType<typeof hierarchy<DataNode>> | null {
  const { root, dropped, folded } = processChartDataForHierarchy(ctx.data, ctx.config)
  if (dropped.length > 0)
    ctx.notes.push(`${dropped.length} item${dropped.length === 1 ? '' : 's'} with zero or negative values left out (area cannot be negative).`)
  if (folded > 0)
    ctx.notes.push(`${folded} smallest items grouped into "Other".`)
  if (!root.children?.length)
    return null
  return hierarchy(root).sum(d => d.value ?? 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
}

/** Top-level branch index for a node (its depth-1 ancestor's position). */
function branchIndex(node: Node): number {
  const top = node.ancestors().find(a => a.depth === 1)
  return top?.parent?.children?.indexOf(top) ?? 0
}

/** Fill: nested trees colour by branch, shading leaves; flat trees shade by value. */
function nodeFill(ctx: DrawContext, node: Node, nested: boolean, maxLeaf: number): string {
  if (nested) {
    const base = seriesFill(ctx, branchIndex(node))
    if (node.depth === 1)
      return base
    const siblings = node.parent?.children?.length ?? 1
    const rank = node.parent?.children?.indexOf(node) ?? 0
    return shade(ctx, base, siblings > 1 ? (rank / siblings) * 0.45 : 0)
  }
  const step = maxLeaf > 0 ? Math.round(((node.value ?? 0) / maxLeaf) * 4) : 4
  return sequentialFill(ctx, Math.max(1, step))
}

function shareLine(node: Node): string {
  const total = node.ancestors().at(-1)?.value ?? 0
  return total > 0 ? `${(((node.value ?? 0) / total) * 100).toFixed(1)}% of total` : ''
}

/** Focus key: the top-level branch, so hovering lights a whole group. */
function branchKey(node: Node): string {
  return node.ancestors().find(a => a.depth === 1)?.data.name ?? node.data.name
}

function tooltipFor(ctx: DrawContext, node: Node): { title: string, lines: string[] } {
  const path = node.ancestors().reverse().slice(1).map(n => n.data.name)
  return {
    title: path.join(' / '),
    lines: [`${measureLabel(ctx.config.yAxis)}: ${formatValue(ctx, node.value ?? 0)}`, shareLine(node)].filter(Boolean),
  }
}

export function drawTreemap(ctx: DrawContext): void {
  const root = buildRoot(ctx)
  if (!root)
    return
  const nested = Boolean(ctx.config.seriesField)
  const laid = treemap<DataNode>()
    .tile(treemapSquarify.ratio(1.2))
    .size([ctx.width, ctx.height])
    .paddingInner(ctx.theme.markStrokeWidth > 0 ? 2 : 1)
    .paddingTop(d => (nested && d.depth === 1 ? 18 : 0))
    .round(true)(root)
  const leaves = laid.leaves()
  const short = labelTrimmer(leaves.map(l => l.data.name))
  const maxLeaf = Math.max(...leaves.map(l => l.value ?? 0))

  if (nested) {
    const parents = ctx.svg.append('g').selectAll('g').data(laid.children ?? []).join('g')
    parents.append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => shade(ctx, nodeFill(ctx, d, true, maxLeaf), 0.6))
    parents.filter(d => d.x1 - d.x0 > 40).append('text').call(sel => styleText(sel, ctx, { size: 11, color: ctx.theme.ink, weight: 600 })).attr('x', d => d.x0 + 4).attr('y', d => d.y0 + 13).text(d => truncate(`${d.data.name} · ${formatCompactChartValue(d.value ?? 0)}`, d.x1 - d.x0 - 8))
  }

  const tiles = applyGlow(ctx, ctx.svg.append('g')).selectAll('g').data(leaves).join('g').attr('transform', d => `translate(${d.x0}, ${d.y0})`)
  const rects = tiles.append('rect')
    .attr('class', 'vpg-d3-mark')
    .attr('width', d => d.x1 - d.x0)
    .attr('height', d => d.y1 - d.y0)
    .attr('fill', d => nodeFill(ctx, d, nested, maxLeaf))
    .attr('stroke', ctx.theme.markStrokeWidth > 0 ? ctx.theme.ink : 'none')
    .attr('stroke-width', ctx.theme.markStrokeWidth)
  if (ctx.animate)
    rects.attr('opacity', 0).transition().duration(TRANSITION_MS).delay((_, i) => Math.min(i, 30) * 12).attr('opacity', 1)
  bindTooltip(rects, ctx, d => tooltipFor(ctx, d), branchKey)

  const labelled = tiles.filter(d => d.x1 - d.x0 > 44 && d.y1 - d.y0 > 26)
  // Pattern tiles (1-bit) need a surface halo behind their labels to stay legible.
  const halo = ctx.theme.fillMode === 'pattern' ? ctx.theme.surface : 'none'
  labelled.append('text')
    .call(sel => styleText(sel, ctx, { size: 11, weight: 600 }))
    .attr('fill', d => labelColorOn(ctx, nodeFill(ctx, d, nested, maxLeaf)))
    .attr('x', 5)
    .attr('y', 15)
    .attr('stroke', halo)
    .attr('stroke-width', 3)
    .attr('paint-order', 'stroke')
    .attr('pointer-events', 'none')
    .text(d => truncate(short(d.data.name), d.x1 - d.x0 - 10))
  labelled.filter(d => d.y1 - d.y0 > 40).append('text').call(sel => styleText(sel, ctx, { mono: true, size: 10 })).attr('fill', d => labelColorOn(ctx, nodeFill(ctx, d, nested, maxLeaf))).attr('x', 5).attr('y', 29).attr('stroke', halo).attr('stroke-width', 3).attr('paint-order', 'stroke').attr('pointer-events', 'none').text(d => formatCompactChartValue(d.value ?? 0))
}

export function drawSunburst(ctx: DrawContext): void {
  const root = buildRoot(ctx)
  if (!root)
    return
  const nested = Boolean(ctx.config.seriesField)
  const radius = Math.max(30, Math.min(ctx.width, ctx.height) / 2 - 6)
  const depth = root.height
  const laid = partition<DataNode>().size([2 * Math.PI, depth + 1])(root)
  const ring = radius / (depth + 1)
  const center = ctx.svg.append('g').attr('transform', `translate(${ctx.width / 2}, ${ctx.height / 2})`)
  const shape = arc<Node>()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.004))
    .padRadius(radius / 2)
    .innerRadius(d => d.y0 * ring + (d.depth === 1 ? ring * 0.15 : 0))
    .outerRadius(d => d.y1 * ring - 1)
  const nodes = laid.descendants().filter(d => d.depth > 0)
  const short = labelTrimmer(laid.leaves().map(l => l.data.name))
  const maxLeaf = Math.max(...laid.leaves().map(l => l.value ?? 0))
  const fillOf = (d: Node): string => (nested ? nodeFill(ctx, d, true, maxLeaf) : seriesFill(ctx, d.parent?.children?.indexOf(d) ?? 0))
  const marks = applyGlow(ctx, center.append('g')).selectAll('path').data(nodes).join('path').attr('class', 'vpg-d3-mark').attr('d', shape).attr('fill', fillOf).attr('stroke', ctx.theme.markStrokeWidth > 0 ? ctx.theme.ink : ctx.theme.surface).attr('stroke-width', Math.max(1, ctx.theme.markStrokeWidth))
  if (ctx.animate)
    marks.attr('opacity', 0).transition().duration(TRANSITION_MS).delay(d => d.depth * 120).attr('opacity', 1)
  bindTooltip(marks, ctx, d => tooltipFor(ctx, d), branchKey)

  const labelled = nodes.filter(d => (d.x1 - d.x0) * (d.y0 + d.y1) * ring / 2 > 34 && ring > 28)
  center.append('g').attr('pointer-events', 'none').selectAll('text').data(labelled).join('text').call(sel => styleText(sel, ctx, { size: 10 })).attr('fill', d => labelColorOn(ctx, fillOf(d))).attr('stroke', ctx.theme.fillMode === 'pattern' ? ctx.theme.surface : 'none').attr('stroke-width', 3).attr('paint-order', 'stroke').attr('transform', (d) => {
    const angle = ((d.x0 + d.x1) / 2) * 180 / Math.PI
    const r = ((d.y0 + d.y1) / 2) * ring
    return `rotate(${angle - 90}) translate(${r}, 0) rotate(${angle < 180 ? 0 : 180})`
  }).attr('text-anchor', 'middle').attr('dominant-baseline', 'central').text(d => truncate(d.children ? d.data.name : short(d.data.name), ring - 8, 10))

  styleText(center.append('text'), ctx, { mono: true, size: 15, color: ctx.theme.title, weight: 700 })
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.1em')
    .text(formatCompactChartValue(root.value ?? 0))
  styleText(center.append('text'), ctx, { size: 10 })
    .attr('text-anchor', 'middle')
    .attr('dy', '1.4em')
    .text(truncate(measureLabel(ctx.config.yAxis), ring * 1.6, 10))
}
