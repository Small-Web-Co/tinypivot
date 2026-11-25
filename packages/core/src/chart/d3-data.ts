/**
 * Data shaping for the D3-rendered chart types. Pure functions over raw rows,
 * so they run in tests, on the MCP server and in the browser alike; the D3
 * renderer only draws what these return.
 */
import type { ChartConfig } from '../types'
import type { MatchedRegion, RegionMatchResult } from './geo'
import { matchRegions } from './geo'
import { aggregateByCategory, compareLabels, formatFieldLabel, processChartData, sortCategoryEntries } from './index'
import { getEffectiveChartOptions } from './registry'

// ---------------------------------------------------------------------------
// Bullet
// ---------------------------------------------------------------------------

/** Share of target that counts as "near" in bullet bands and status. */
export const BULLET_NEAR_RATIO = 0.8
/** Most rows a bullet chart draws; the rest are reported as truncated. */
export const BULLET_MAX_ROWS = 40

export type BulletStatus = 'met' | 'near' | 'below'

export interface BulletRow {
  label: string
  value: number
  target: number | null
  /** Upper edges of the poor / fair / good bands, ascending */
  bands: [number, number, number]
  status: BulletStatus | null
}

export interface BulletData {
  rows: BulletRow[]
  /** Shared axis maximum for every row */
  max: number
  hasTarget: boolean
  /** Rows beyond `BULLET_MAX_ROWS` that were left out */
  truncated: number
}

function bulletStatus(value: number, target: number | null): BulletStatus | null {
  if (target === null || target <= 0)
    return null
  if (value >= target)
    return 'met'
  return value >= target * BULLET_NEAR_RATIO ? 'near' : 'below'
}

/** The value at fraction `p` of a sorted list (linear interpolation). */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0)
    return 0
  const pos = (sorted.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Actual vs target per category. With a target, bands mark below 80% of target,
 * 80–100%, and above; without one they mark the terciles of all actuals.
 */
export function processChartDataForBullet(data: Record<string, unknown>[], config: ChartConfig): BulletData {
  const empty: BulletData = { rows: [], max: 0, hasTarget: false, truncated: 0 }
  if (!config.xAxis || !config.yAxis || data.length === 0)
    return empty
  const actuals = sortCategoryEntries(config, aggregateByCategory(data, config.xAxis.field, config.yAxis.field, config.yAxis.aggregation))
  const targetField = config.targetField
  const targets = targetField
    ? new Map(aggregateByCategory(data, config.xAxis.field, targetField.field, targetField.aggregation).map(e => [e.category, e.value]))
    : null
  const kept = actuals.slice(0, BULLET_MAX_ROWS)
  const max = Math.max(0, ...kept.map(e => Math.max(e.value, targets?.get(e.category) ?? 0))) * 1.05
  const sorted = kept.map(e => e.value).sort((a, b) => a - b)
  const terciles: [number, number, number] = [quantile(sorted, 1 / 3), quantile(sorted, 2 / 3), max]
  const rows = kept.map((entry): BulletRow => {
    const target = targets?.get(entry.category) ?? null
    const bands: [number, number, number] = target !== null && target > 0
      ? [target * BULLET_NEAR_RATIO, target, max]
      : terciles
    return { label: entry.category, value: entry.value, target, bands, status: bulletStatus(entry.value, target) }
  })
  return { rows, max, hasTarget: targets !== null, truncated: actuals.length - kept.length }
}

// ---------------------------------------------------------------------------
// Hierarchy (treemap, sunburst)
// ---------------------------------------------------------------------------

/** Most leaves a treemap or sunburst draws; smaller ones fold into "Other". */
export const HIERARCHY_MAX_LEAVES = 300

export interface HierarchyNode {
  name: string
  value?: number
  children?: HierarchyNode[]
}

export interface HierarchyData {
  root: HierarchyNode
  /** Categories left out because their value was zero or negative */
  dropped: string[]
  /** Leaves folded into "Other" nodes to stay under `HIERARCHY_MAX_LEAVES` */
  folded: number
}

interface Leaf {
  parent: string
  category: string
  value: number
}

function collectLeaves(data: Record<string, unknown>[], config: ChartConfig): Leaf[] {
  const parentField = config.seriesField?.field
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of data) {
    const parent = parentField ? String(row[parentField] ?? '(blank)') : ''
    const bucket = groups.get(parent)
    if (bucket)
      bucket.push(row)
    else
      groups.set(parent, [row])
  }
  const leaves: Leaf[] = []
  for (const [parent, rows] of groups) {
    for (const entry of aggregateByCategory(rows, config.xAxis!.field, config.yAxis!.field, config.yAxis!.aggregation))
      leaves.push({ parent, ...entry })
  }
  return leaves
}

/** Keep the largest leaves; fold the rest into one "Other" leaf per parent. */
function foldSmallLeaves(leaves: Leaf[]): { kept: Leaf[], folded: number } {
  if (leaves.length <= HIERARCHY_MAX_LEAVES)
    return { kept: leaves, folded: 0 }
  const ranked = [...leaves].sort((a, b) => b.value - a.value)
  const kept = ranked.slice(0, HIERARCHY_MAX_LEAVES - 1)
  const other = new Map<string, { value: number, count: number }>()
  for (const leaf of ranked.slice(HIERARCHY_MAX_LEAVES - 1)) {
    const acc = other.get(leaf.parent) ?? { value: 0, count: 0 }
    acc.value += leaf.value
    acc.count++
    other.set(leaf.parent, acc)
  }
  for (const [parent, acc] of other)
    kept.push({ parent, category: `Other (${acc.count})`, value: acc.value })
  return { kept, folded: ranked.length - (HIERARCHY_MAX_LEAVES - 1) }
}

/**
 * Two-level hierarchy: the series field (when set) is the parent, the X field
 * the leaf, the Y measure its size. Only positive values can be drawn as area.
 */
export function processChartDataForHierarchy(data: Record<string, unknown>[], config: ChartConfig): HierarchyData {
  const rootName = config.yAxis ? formatFieldLabel(config.yAxis.field) : 'Total'
  if (!config.xAxis || !config.yAxis || data.length === 0)
    return { root: { name: rootName, children: [] }, dropped: [], folded: 0 }
  const all = collectLeaves(data, config)
  const dropped = all.filter(l => !(l.value > 0)).map(l => (l.parent ? `${l.parent} / ${l.category}` : l.category))
  const { kept, folded } = foldSmallLeaves(all.filter(l => l.value > 0))
  const byParent = new Map<string, HierarchyNode[]>()
  for (const leaf of kept) {
    const node = { name: leaf.category, value: leaf.value }
    const siblings = byParent.get(leaf.parent)
    if (siblings)
      siblings.push(node)
    else
      byParent.set(leaf.parent, [node])
  }
  const children = config.seriesField
    ? Array.from(byParent, ([name, leaves]) => ({ name, children: leaves }))
    : byParent.get('') ?? []
  return { root: { name: rootName, children }, dropped, folded }
}

// ---------------------------------------------------------------------------
// Choropleth
// ---------------------------------------------------------------------------

export interface ChoroplethData extends RegionMatchResult<number> {
  min: number
  max: number
}

/** Aggregate the measure per region label and match the labels onto a map. */
export function processChartDataForChoropleth(data: Record<string, unknown>[], config: ChartConfig): ChoroplethData {
  const geography = getEffectiveChartOptions(config).geography ?? 'auto'
  const entries = config.xAxis && config.yAxis
    ? aggregateByCategory(data, config.xAxis.field, config.yAxis.field, config.yAxis.aggregation)
    : []
  const result = matchRegions(entries.map(e => ({ label: e.category, value: e.value })), geography)
  const values = result.regions.map((r: MatchedRegion<number>) => r.value)
  return {
    ...result,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  }
}

/** A short, human sentence about labels a choropleth could not place, or `null`. */
export function describeUnmatchedRegions(result: Pick<ChoroplethData, 'unmatched' | 'geography'>, limit = 5): string | null {
  const { unmatched, geography } = result
  if (unmatched.length === 0)
    return null
  const map = geography === 'us-states' ? 'US states map' : 'world map'
  const shown = unmatched.slice(0, limit).map(l => `"${l}"`).join(', ')
  const more = unmatched.length > limit ? ` and ${unmatched.length - limit} more` : ''
  const noun = unmatched.length === 1 ? 'label' : 'labels'
  return `${unmatched.length} ${noun} not found on the ${map}: ${shown}${more}. Use country or state names, ISO / postal codes, or regions like EMEA, APAC, LATAM.`
}

// ---------------------------------------------------------------------------
// Slope
// ---------------------------------------------------------------------------

export interface SlopeRow {
  label: string
  start: number
  end: number
  /** end / start - 1, or `null` when the start is zero */
  change: number | null
}

export interface SlopeData {
  from: string
  to: string
  rows: SlopeRow[]
  /** Periods between the first and last that the chart leaves out */
  skippedPeriods: string[]
}

/**
 * First vs last period per category. Periods are the series values in label
 * order (years, quarters and months sort chronologically).
 */
export function processChartDataForSlope(data: Record<string, unknown>[], config: ChartConfig): SlopeData | null {
  if (!config.xAxis || !config.yAxis || !config.seriesField)
    return null
  const chart = processChartData(data, { ...config, options: { ...config.options, sortOrder: 'label-asc' } })
  const periods = chart.series.map(s => s.name).sort(compareLabels)
  if (periods.length < 2)
    return null
  const first = chart.series.find(s => s.name === periods[0])!
  const last = chart.series.find(s => s.name === periods.at(-1))!
  const rows = chart.categories
    .map((label, i): SlopeRow => {
      const start = first.data[i] ?? 0
      const end = last.data[i] ?? 0
      return { label, start, end, change: start !== 0 ? end / start - 1 : null }
    })
    .filter(r => r.start !== 0 || r.end !== 0)
    .sort((a, b) => b.end - a.end)
  return { from: first.name, to: last.name, rows, skippedPeriods: periods.slice(1, -1) }
}
