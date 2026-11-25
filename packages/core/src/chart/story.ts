/**
 * Editorial layer for the D3 charts: a one-line takeaway headline, a dek that
 * says how to read the chart, and the marks worth calling out. Everything is
 * computed from the same aggregates the chart draws, so the words can be
 * checked against the picture (and the grid) — no model writes them.
 */
import type { ChartConfig } from '../types'
import { processChartDataForBullet, processChartDataForChoropleth, processChartDataForHierarchy, processChartDataForSlope } from './d3-data'
import { formatCompactChartValue } from './d3-theme'
import { regionDisplayName } from './geo'
import { formatFieldLabel, processChartData } from './index'

export interface ChartStory {
  /** Small label above the headline naming what is measured: "Bookings by country" */
  kicker: string
  headline: string
  dek: string
  /** How the numbers were computed, for the footnote: "Bookings: sum of bookings" */
  footnote: string
  /** Category / region labels the chart should annotate, most important first */
  callouts: string[]
}

/** Lowercase measure noun for sentences: "bookings", "revenue". */
function measureNoun(config: ChartConfig): string {
  const field = config.yAxis
  if (!field)
    return 'value'
  return (field.label || formatFieldLabel(field.field)).toLowerCase()
}

/** "products", "countries", "categories": the X field as a plural noun for counts in headlines. */
export function categoryNoun(config: ChartConfig, count: number): string {
  const field = config.xAxis
  const word = field ? (field.label || formatFieldLabel(field.field)).toLowerCase() : 'item'
  if (count === 1 || word.endsWith('s'))
    return word
  if (/[^aeiou]y$/.test(word))
    return `${word.slice(0, -1)}ies`
  return /(?:x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%'
}

/** Compact numbers in the chart's own value format, so the headline matches the labels. */
function compact(config: ChartConfig, value: number): string {
  return formatCompactChartValue(value, config.options?.valueFormat)
}

/**
 * A shared leading word ("Acme ") that every label repeats, so charts can drop it
 * from tight labels. Needs 3+ labels and leaves every label non-empty.
 */
export function commonLabelPrefix(labels: string[]): string {
  if (labels.length < 3)
    return ''
  let prefix = labels[0]
  for (const label of labels.slice(1)) {
    while (prefix && !label.startsWith(prefix))
      prefix = prefix.slice(0, -1)
  }
  const cut = prefix.lastIndexOf(' ')
  if (cut <= 0)
    return ''
  const wordPrefix = prefix.slice(0, cut + 1)
  return labels.every(l => l.length > wordPrefix.length) ? wordPrefix : ''
}

/** Ranked category totals across series. */
function rankedTotals(data: Record<string, unknown>[], config: ChartConfig): Array<{ label: string, value: number }> {
  const chart = processChartData(data, config)
  return chart.categories
    .map((label, i) => ({ label, value: chart.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0) }))
    .sort((a, b) => b.value - a.value)
}

function choroplethStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const map = processChartDataForChoropleth(data, config)
  const ranked = [...map.regions].sort((a, b) => b.value - a.value)
  if (ranked.length === 0)
    return null
  const noun = measureNoun(config)
  const [top] = ranked
  const low = ranked.at(-1)!
  const topName = regionDisplayName(top)
  const total = ranked.reduce((sum, r) => sum + r.value, 0)
  const headline = ranked.length === 1
    ? `${topName}: ${compact(config, top.value)} ${noun}`
    : low.value > 0 && top.value / low.value >= 1.5
      ? `${topName} leads with ${compact(config, top.value)} ${noun}, ${(top.value / low.value).toFixed(1)}× ${regionDisplayName(low)}`
      : `${topName} leads with ${compact(config, top.value)} ${noun}, ${pct(top.value, total)} of the total`
  const place = map.geography === 'us-states' ? 'states' : ranked.some(r => r.kind === 'region') ? 'regions' : 'countries'
  return {
    headline,
    dek: `${ranked.length} ${place} shaded by ${noun}; darker means more.`,
    callouts: ranked.slice(0, 3).map(r => r.label),
  }
}

function bulletStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const bullet = processChartDataForBullet(data, config)
  if (bullet.rows.length === 0)
    return null
  const noun = measureNoun(config)
  const withTarget = bullet.rows.filter(r => r.target !== null && r.target > 0)
  if (withTarget.length === 0) {
    const [top] = bullet.rows
    return {
      headline: `${top.label} leads with ${compact(config, top.value)} ${noun}`,
      dek: 'Bands mark the bottom, middle and top thirds of all rows.',
      callouts: [top.label],
    }
  }
  const attainment = withTarget
    .map(r => ({ label: r.label, ratio: r.value / r.target! }))
    .sort((a, b) => b.ratio - a.ratio)
  const met = attainment.filter(a => a.ratio >= 1).length
  const best = attainment[0]
  const worst = attainment.at(-1)!
  const head = `${met} of ${attainment.length} beat target`
  const detail = attainment.length > 1
    ? `${best.label} leads at ${pct(best.ratio, 1)}; ${worst.label} trails at ${pct(worst.ratio, 1)}`
    : `${best.label} is at ${pct(best.ratio, 1)}`
  return {
    headline: `${head}. ${detail}`,
    dek: `Bars show ${noun}, ticks the target; bands mark under 80%, 80–100% and over target.`,
    callouts: attainment.length > 1 ? [best.label, worst.label] : [best.label],
  }
}

function radialBarStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const ranked = rankedTotals(data, config)
  if (ranked.length === 0)
    return null
  const total = ranked.reduce((sum, r) => sum + r.value, 0)
  const [top] = ranked
  return {
    headline: `${top.label} leads: ${pct(top.value, total)} of ${measureNoun(config)} across ${ranked.length} ${categoryNoun(config, ranked.length)}`,
    dek: config.seriesField ? `Each bar stacks ${formatFieldLabel(config.seriesField.field).toLowerCase()}; longer is more.` : 'Longer bars are larger; sorted clockwise from the top.',
    callouts: [top.label],
  }
}

function radialAreaStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const chart = processChartData(data, config)
  if (chart.categories.length < 3)
    return null
  const totals = chart.categories.map((label, i) => ({ label, value: chart.series.reduce((sum, s) => sum + (s.data[i] ?? 0), 0) }))
  const peak = totals.reduce((a, b) => (b.value > a.value ? b : a))
  const trough = totals.reduce((a, b) => (b.value < a.value ? b : a))
  const noun = measureNoun(config)
  const drop = peak.value > 0 ? Math.round((1 - trough.value / peak.value) * 100) : 0
  let dek = `Each spoke is a ${formatFieldLabel(config.xAxis!.field).toLowerCase()}; distance from the centre is ${noun}.`
  if (chart.series.length > 1)
    dek += ' Peak and low are for all series combined.'
  if (chart.series.length === 2) {
    const [a, b] = chart.series.map(s => s.data.reduce<number>((x, y) => x + (y ?? 0), 0))
    const change = b > 0 ? Math.round(((a - b) / b) * 100) : 0
    dek += ` ${chart.series[0].name} vs ${chart.series[1].name}: ${change >= 0 ? '+' : ''}${change}% overall.`
  }
  return {
    headline: `${formatFieldLabel(noun)} peak in ${peak.label} and bottom out in ${trough.label}, ${drop}% lower`,
    dek,
    callouts: [peak.label, trough.label],
  }
}

function hierarchyStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const { root } = processChartDataForHierarchy(data, config)
  const branches = root.children ?? []
  if (branches.length === 0)
    return null
  const noun = measureNoun(config)
  const sizeOf = (n: typeof branches[number]): number => n.value ?? (n.children ?? []).reduce((s, c) => s + (c.value ?? 0), 0)
  const total = branches.reduce((s, b) => s + sizeOf(b), 0)
  if (config.seriesField) {
    const top = [...branches].sort((a, b) => sizeOf(b) - sizeOf(a))[0]
    const leaf = [...(top.children ?? [])].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0]
    return {
      headline: `${top.name} is ${pct(sizeOf(top), total)} of ${noun}${leaf ? `; ${leaf.name} alone is ${pct(leaf.value ?? 0, total)}` : ''}`,
      dek: `Area is ${noun}, grouped by ${formatFieldLabel(config.seriesField.field).toLowerCase()}.`,
      callouts: [top.name, ...(leaf ? [leaf.name] : [])],
    }
  }
  const ranked = [...branches].sort((a, b) => sizeOf(b) - sizeOf(a))
  const topN = Math.min(3, ranked.length)
  const share = pct(ranked.slice(0, topN).reduce((s, b) => s + sizeOf(b), 0), total)
  return {
    headline: `The top ${topN} of ${ranked.length} ${categoryNoun(config, ranked.length)} make up ${share} of ${noun}`,
    dek: `Area is ${noun}.`,
    callouts: ranked.slice(0, topN).map(b => b.name),
  }
}

function signedPct(change: number): string {
  const rounded = Math.round(change * 100)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

function slopeStory(data: Record<string, unknown>[], config: ChartConfig): StoryBody | null {
  const slope = processChartDataForSlope(data, config)
  if (!slope || slope.rows.length === 0)
    return null
  const comparable = slope.rows.filter(r => r.change !== null)
  const grew = slope.rows.filter(r => r.end > r.start).length
  const ranked = [...comparable].sort((a, b) => b.change! - a.change!)
  const best = ranked[0]
  const worst = ranked.at(-1)
  let headline = `${grew} of ${slope.rows.length} grew from ${slope.from} to ${slope.to}`
  if (best && best.change! > 0)
    headline += `; ${best.label} rose most (${signedPct(best.change!)})`
  if (worst && worst !== best && worst.change! < 0)
    headline += `, ${worst.label} fell most (${signedPct(worst.change!)})`
  const skipped = slope.skippedPeriods.length ? ` ${slope.skippedPeriods.length} periods in between are not shown.` : ''
  return {
    headline,
    dek: `${formatFieldLabel(measureNoun(config))} in ${slope.from} (left) and ${slope.to} (right); rising lines are highlighted.${skipped}`,
    callouts: [...new Set([best?.label, worst?.label].filter((l): l is string => Boolean(l)))],
  }
}

const STORIES: Partial<Record<ChartConfig['type'], (data: Record<string, unknown>[], config: ChartConfig) => StoryBody | null>> = {
  choropleth: choroplethStory,
  bullet: bulletStory,
  radialBar: radialBarStory,
  radialArea: radialAreaStory,
  treemap: hierarchyStory,
  sunburst: hierarchyStory,
  slope: slopeStory,
}

type StoryBody = Omit<ChartStory, 'kicker' | 'footnote'>

const fieldName = (field: ChartConfig['xAxis']): string => (field ? field.label || formatFieldLabel(field.field) : '')

/** "Bookings by product", "Bookings vs quota by rep", "Bookings by category and product". */
export function chartKicker(config: ChartConfig): string {
  const measure = fieldName(config.yAxis)
  const dimension = fieldName(config.xAxis).toLowerCase()
  if (config.type === 'bullet' && config.targetField)
    return `${measure} vs ${fieldName(config.targetField).toLowerCase()} by ${dimension}`
  if ((config.type === 'treemap' || config.type === 'sunburst') && config.seriesField)
    return `${measure} by ${fieldName(config.seriesField).toLowerCase()} and ${dimension}`
  return `${measure} by ${dimension}`
}

/** How the numbers were computed, in one line: "Bookings: sum of bookings · Quota: sum of quota". */
export function chartFootnote(config: ChartConfig): string {
  const parts: string[] = []
  const describe = (field: ChartConfig['yAxis']): string => `${fieldName(field)}: ${field!.aggregation ?? 'sum'} of ${field!.field}`
  parts.push(describe(config.yAxis))
  if (config.targetField)
    parts.push(describe(config.targetField))
  return parts.join(' · ')
}

/**
 * The takeaway for a chart, or `null` when the type has no story or there is
 * nothing to say. A user-set title replaces the computed headline (an action
 * title in deck terms); the kicker and footnote stay computed.
 */
export function buildChartStory(data: Record<string, unknown>[], config: ChartConfig): ChartStory | null {
  if (!config.xAxis || !config.yAxis || data.length === 0)
    return null
  const body = STORIES[config.type]?.(data, config) ?? null
  if (!body)
    return null
  return {
    ...body,
    headline: config.options?.title || body.headline,
    kicker: chartKicker(config),
    footnote: chartFootnote(config),
  }
}
