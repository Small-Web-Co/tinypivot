import type { ChartConfig, ChartData } from '../types'
import { processChartData } from './index'

/**
 * A check of a chart against data-visualization practice (after Duke University Libraries'
 * "Chart Dos and Don'ts"): the problems a reader would hit, each with what to do instead. TinyPivot
 * already draws bars from zero, uses no 3D or exploded slices, and shades maps in one hue; these
 * are the rules that depend on the data, so the agent is told and can fix the chart.
 */

export type ChartAdviceRule = 'too-many-colors' | 'pie-slices' | 'pie-close-slices' | 'missing-periods' | 'too-many-bars'

export interface ChartAdvice {
  rule: ChartAdviceRule
  message: string
}

/** More colours than this and a reader cannot tell the series apart. */
const MAX_COLORS = 6
/** Bars past this many are read one by one rather than at a glance. */
const MAX_BARS = 30
/** Wedges closer than this (relative) cannot be compared by eye. */
const CLOSE_SLICES = 0.05

const SERIES_CHARTS = new Set(['bar', 'stackedBar', 'line', 'area', 'radar', 'scatter', 'bubble'])
const PERIOD_CHARTS = new Set(['bar', 'stackedBar', 'line', 'area'])
const PIE_CHARTS = new Set(['pie', 'donut'])

const MONTH_RE = /^(\d{4})-(\d{2})$/
const QUARTER_RE = /^(\d{4})[-\s]?Q([1-4])$/i

/** A period label as a running index (months or quarters since year 0), or null. */
function periodIndex(label: string): { kind: 'month' | 'quarter', index: number } | null {
  const month = MONTH_RE.exec(label)
  if (month)
    return { kind: 'month', index: Number(month[1]) * 12 + Number(month[2]) - 1 }
  const quarter = QUARTER_RE.exec(label)
  return quarter ? { kind: 'quarter', index: Number(quarter[1]) * 4 + Number(quarter[2]) - 1 } : null
}

function periodLabel(kind: 'month' | 'quarter', index: number): string {
  const year = Math.floor(index / (kind === 'month' ? 12 : 4))
  const part = index % (kind === 'month' ? 12 : 4) + 1
  return kind === 'month' ? `${year}-${String(part).padStart(2, '0')}` : `${year} Q${part}`
}

/** Months or quarters missing between the first and last on the axis. */
export function missingPeriods(categories: string[]): string[] {
  const periods = categories.map(periodIndex)
  if (periods.length < 3 || periods.some(period => !period || period.kind !== periods[0]!.kind))
    return []
  const kind = periods[0]!.kind
  const present = new Set(periods.map(period => period!.index))
  const indexes = [...present].sort((a, b) => a - b)
  const missing: string[] = []
  for (let index = indexes[0]; index <= indexes.at(-1)!; index++) {
    if (!present.has(index))
      missing.push(periodLabel(kind, index))
  }
  return missing
}

function listed(labels: string[], limit = 3): string {
  const shown = labels.slice(0, limit).join(', ')
  return labels.length > limit ? `${shown} and ${labels.length - limit} more` : shown
}

/** The two wedges closest in size, when they are too close to compare by eye. */
function closestSlices(chart: ChartData): [string, string, number] | null {
  const values = chart.series[0]?.data ?? []
  const slices = chart.categories
    .map((label, index) => ({ label, value: Number(values[index] ?? 0) }))
    .filter(slice => slice.value > 0)
    .sort((a, b) => b.value - a.value)
  let best: [string, string, number] | null = null
  for (let i = 1; i < slices.length; i++) {
    const gap = (slices[i - 1].value - slices[i].value) / slices[i - 1].value
    if (gap < CLOSE_SLICES && (!best || gap < best[2]))
      best = [slices[i - 1].label, slices[i].label, gap]
  }
  return best
}

function pieAdvice(chart: ChartData): ChartAdvice[] {
  if (chart.categories.length > MAX_COLORS)
    return [{ rule: 'pie-slices', message: `${chart.categories.length} slices are too many to compare as wedges: use a bar chart, or keep the top ${MAX_COLORS - 1} and group the rest as Other.` }]
  const close = closestSlices(chart)
  return close
    ? [{ rule: 'pie-close-slices', message: `${close[0]} and ${close[1]} differ by ${(close[2] * 100).toFixed(1)}%, too little to see between two wedges: use a bar chart, or state the numbers.` }]
    : []
}

/** What a reader would struggle with in this chart of these rows, and what to do instead. */
export function reviewChart(data: Record<string, unknown>[], config: ChartConfig): ChartAdvice[] {
  if (!config.xAxis || !config.yAxis)
    return []
  const chart = processChartData(data, config)
  if (PIE_CHARTS.has(config.type))
    return pieAdvice(chart)
  const advice: ChartAdvice[] = []
  if (SERIES_CHARTS.has(config.type) && chart.series.length > MAX_COLORS)
    advice.push({ rule: 'too-many-colors', message: `${chart.series.length} series need more colours than a reader can tell apart (${MAX_COLORS} at most): keep the top ${MAX_COLORS - 1} and group the rest as Other, or split the chart.` })
  if ((config.type === 'bar' || config.type === 'stackedBar') && chart.categories.length > MAX_BARS)
    advice.push({ rule: 'too-many-bars', message: `${chart.categories.length} bars are read one by one: show the top 15, group the rest, or chart a coarser grain.` })
  if (PERIOD_CHARTS.has(config.type)) {
    const missing = missingPeriods(chart.categories)
    if (missing.length > 0)
      advice.push({ rule: 'missing-periods', message: `No rows for ${listed(missing)}, so the axis skips ${missing.length === 1 ? 'that period' : 'those periods'} and the spacing misleads: add ${missing.length === 1 ? 'it' : 'them'} with zero values.` })
  }
  return advice
}
