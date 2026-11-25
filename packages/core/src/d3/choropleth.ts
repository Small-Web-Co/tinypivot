/**
 * Choropleth on the bundled maps: world countries (world-atlas 110m, Natural
 * Earth) and US states (us-atlas, pre-projected Albers USA). Both are ISC
 * licensed and load on first use, so apps that never draw a map never fetch them.
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { ChoroplethData } from '../chart/d3-data'
import type { MatchedRegion, ResolvedGeography } from '../chart/geo'
import type { DrawContext } from './context'
import { geoEqualEarth, geoIdentity, geoPath } from 'd3-geo'
import { scaleQuantize } from 'd3-scale'
import { feature, mesh } from 'topojson-client'
import { describeUnmatchedRegions, processChartDataForChoropleth } from '../chart/d3-data'
import { mixColor } from '../chart/d3-theme'
import { regionDisplayName, usStateShapeCode, worldShapeCode } from '../chart/geo'
import { applyGlow, bindTooltip, compact, formatValue, haloText, measureLabel, sequentialFill, styleText, TRANSITION_MS } from './context'

interface MapShapes {
  topology: Topology
  object: GeometryCollection<{ name?: string }>
  features: Array<Feature<Geometry, { name?: string }>>
  /** Shape code (ISO alpha-2 or USPS) for each feature, by index */
  codes: Array<string | null>
  /** Shape code for each TopoJSON geometry, for drawing region borders */
  geometryCodes: Map<object, string | null>
}

const shapeCache = new Map<ResolvedGeography, Promise<MapShapes>>()

async function loadTopology(geography: ResolvedGeography): Promise<{ topology: Topology, key: string }> {
  if (geography === 'us-states') {
    const mod = await import('us-atlas/states-albers-10m.json')
    return { topology: (mod.default ?? mod) as unknown as Topology, key: 'states' }
  }
  const mod = await import('world-atlas/countries-110m.json')
  return { topology: (mod.default ?? mod) as unknown as Topology, key: 'countries' }
}

/** Load and decode a map once per page. */
export function loadMapShapes(geography: ResolvedGeography): Promise<MapShapes> {
  let pending = shapeCache.get(geography)
  if (!pending) {
    pending = loadTopology(geography).then(({ topology, key }) => {
      const object = topology.objects[key] as GeometryCollection<{ name?: string }>
      const collection = feature(topology, object) as FeatureCollection<Geometry, { name?: string }>
      // Antarctica takes a fifth of a world map and never carries business data.
      const features = collection.features.filter(f => f.properties?.name !== 'Antarctica')
      const codeOf = (id: string | number | undefined, name: string | undefined): string | null =>
        geography === 'us-states' ? usStateShapeCode(id) : worldShapeCode(id, name)
      const codes = features.map(f => codeOf(f.id, f.properties?.name))
      const geometryCodes = new Map<object, string | null>(object.geometries.map(g => [g, codeOf(g.id, (g.properties as { name?: string } | undefined)?.name)]))
      return { topology, object, features, codes, geometryCodes }
    })
    pending.catch(() => shapeCache.delete(geography))
    shapeCache.set(geography, pending)
  }
  return pending
}

const LEGEND_HEIGHT = 30

/** Five classes; diverging around zero when values cross it. */
function colourScale(ctx: DrawContext, data: ChoroplethData): { fill: (v: number) => string, thresholds: number[], diverging: boolean } {
  const diverging = data.min < 0 && data.max > 0
  const extent = Math.max(Math.abs(data.min), Math.abs(data.max))
  const domain: [number, number] = diverging ? [-extent, extent] : [Math.min(0, data.min), data.max || 1]
  const scale = scaleQuantize<number>().domain(domain).range([0, 1, 2, 3, 4])
  const negative = ctx.theme.palette.find(c => c !== ctx.theme.accent) ?? ctx.theme.ink
  const fill = (v: number): string => {
    const step = scale(v)
    if (!diverging || ctx.theme.fillMode === 'pattern')
      return sequentialFill(ctx, step)
    // Diverging: negative colour → surface → accent.
    const t = Math.abs(step - 2) / 2
    return step < 2 ? mixColor(ctx.theme.surface, negative, 0.2 + t * 0.8) : step === 2 ? ctx.theme.noData : ctx.theme.sequential[Math.round(t * 4)]
  }
  return { fill, thresholds: scale.thresholds(), diverging }
}

function drawLegend(ctx: DrawContext, data: ChoroplethData, scale: ReturnType<typeof colourScale>): void {
  const options = ctx.config.options ?? {}
  if (options.showLegend === false)
    return
  const legend = ctx.svg.append('g').attr('transform', `translate(8, ${ctx.height - LEGEND_HEIGHT + 6})`)
  const swatch = 42
  const edges = [scale.diverging ? -Math.max(Math.abs(data.min), data.max) : Math.min(0, data.min), ...scale.thresholds]
  edges.forEach((edge, i) => {
    legend.append('rect')
      .attr('x', i * swatch)
      .attr('width', swatch - 2)
      .attr('height', 9)
      .attr('fill', scale.fill(edge + 1e-9))
      .attr('stroke', ctx.theme.grid)
    styleText(legend.append('text'), ctx, { mono: true, size: 9 })
      .attr('x', i * swatch)
      .attr('y', 20)
      .text(compact(ctx, edge))
  })
  const noDataX = edges.length * swatch + 12
  legend.append('rect').attr('x', noDataX).attr('width', 14).attr('height', 9).attr('fill', ctx.theme.noData).attr('stroke', ctx.theme.grid)
  styleText(legend.append('text'), ctx, { size: 10 }).attr('x', noDataX + 18).attr('y', 8).text('No data')
  styleText(legend.append('text'), ctx, { size: 10, color: ctx.theme.ink })
    .attr('x', noDataX + 74)
    .attr('y', 8)
    .text(measureLabel(ctx.config.yAxis))
}

function regionLines(ctx: DrawContext, region: MatchedRegion<number>): string[] {
  const lines = [`${measureLabel(ctx.config.yAxis)}: ${formatValue(ctx, region.value)}`]
  if (region.kind === 'region')
    lines.push(`Region of ${region.codes.length} countries`)
  return lines
}

function draw(ctx: DrawContext, data: ChoroplethData, shapes: MapShapes): void {
  const height = ctx.height - LEGEND_HEIGHT
  const collection: FeatureCollection = { type: 'FeatureCollection', features: shapes.features }
  const projection = data.geography === 'us-states'
    ? geoIdentity().fitSize([ctx.width, height], collection)
    : geoEqualEarth().fitSize([ctx.width, height], collection)
  const path = geoPath(projection)
  const scale = colourScale(ctx, data)
  const items = shapes.features.map((f, i) => ({ feature: f, region: shapes.codes[i] ? data.byCode.get(shapes.codes[i]!) : undefined }))

  const layer = applyGlow(ctx, ctx.svg.append('g'))
  const marks = layer.selectAll('path').data(items).join('path').attr('class', d => (d.region ? 'vpg-d3-mark' : 'vpg-d3-empty')).attr('d', d => path(d.feature)).attr('fill', d => (d.region ? scale.fill(d.region.value) : ctx.theme.noData)).attr('stroke', ctx.theme.surface).attr('stroke-width', 0.5)
  if (ctx.animate)
    marks.attr('opacity', 0).transition().duration(TRANSITION_MS).attr('opacity', 1)
  bindTooltip(marks.filter(d => Boolean(d.region)), ctx, d => ({ title: regionDisplayName(d.region!), lines: regionLines(ctx, d.region!) }), d => d.region!.label)

  // Region outlines: borders between shapes coloured by different rows (shapes with no data share one "row").
  const regionOf = (geometry: object): string => {
    const code = shapes.geometryCodes.get(geometry)
    return (code && data.byCode.get(code)?.label) ?? ''
  }
  const borders = mesh(shapes.topology, shapes.object, (a, b) => a !== b && regionOf(a) !== regionOf(b))
  ctx.svg.append('path')
    .attr('d', path(borders))
    .attr('fill', 'none')
    .attr('stroke', ctx.theme.ink)
    .attr('stroke-opacity', ctx.theme.fillMode === 'pattern' ? 1 : 0.45)
    .attr('stroke-width', ctx.theme.fillMode === 'pattern' ? 1 : 0.7)
    .attr('pointer-events', 'none')
  drawLegend(ctx, data, scale)
  drawCallouts(ctx, items, path)
}

/** Label the story's top regions in place, on their largest shape. */
function drawCallouts(ctx: DrawContext, items: Array<{ feature: Feature, region?: MatchedRegion<number> }>, path: ReturnType<typeof geoPath>): void {
  const labels = ctx.story?.callouts ?? []
  const layer = ctx.svg.append('g').attr('class', 'vpg-d3-callouts')
  const placed: Array<[number, number, number, number]> = []
  labels.forEach((label, rank) => {
    const shapes = items.filter(d => d.region?.label === label)
    if (shapes.length === 0)
      return
    const largest = shapes.reduce((a, b) => (path.area(b.feature) > path.area(a.feature) ? b : a))
    const [x, y] = path.centroid(largest.feature)
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return
    const name = `${rank + 1}. ${regionDisplayName(largest.region!)}`
    const box: [number, number, number, number] = [x, y - 14, x + 10 + name.length * 6.6, y + 12]
    // Skip a callout that would sit on one already placed; the tooltip still has it.
    if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
      return
    placed.push(box)
    layer.append('circle').attr('cx', x).attr('cy', y).attr('r', 3).attr('fill', ctx.theme.ink).attr('stroke', ctx.theme.surface).attr('stroke-width', 1.5)
    haloText(layer, ctx, x + 6, y - 7, name, { size: 11, weight: 700 })
    haloText(layer, ctx, x + 6, y + 6, compact(ctx, largest.region!.value), { size: 10, mono: true, weight: 500 })
  })
}

export async function drawChoropleth(ctx: DrawContext): Promise<void> {
  const data = processChartDataForChoropleth(ctx.data, ctx.config)
  const unmatched = describeUnmatchedRegions(data)
  if (unmatched)
    ctx.notes.push(unmatched)
  const loading = styleText(ctx.svg.append('text'), ctx, { size: 11 })
    .attr('x', ctx.width / 2)
    .attr('y', ctx.height / 2)
    .attr('text-anchor', 'middle')
    .text('Loading map…')
  const shapes = await loadMapShapes(data.geography)
  if (ctx.isStale())
    return
  loading.remove()
  draw(ctx, data, shapes)
}
