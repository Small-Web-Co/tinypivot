/**
 * TinyPivot Core - Chart Utilities
 * Framework-agnostic chart data processing and configuration
 */
import type {
  ChartAggregation,
  ChartConfig,
  ChartData,
  ChartFieldInfo,
  ChartMarkers,
  ChartSeries,
  ChartSortOrder,
  ChartThemePreset,
  ChartType,
  FieldRole,
  FieldRoleOverrides,
} from '../types'
import { looksLikeDate } from '../utils'
import { getChartTypeInfo } from './registry'

export * from './d3-data'
export * from './d3-theme'
export {
  detectGeography,
  matchRegion,
  matchRegions,
  normalizeRegionName,
  regionDisplayName,
  US_STATE_ROWS,
} from './geo'
export type { MatchedRegion, RegionKind, RegionMatch, RegionMatchResult, ResolvedGeography } from './geo'
export {
  CHART_TYPE_IDS,
  CHART_TYPES,
  getChartRenderer,
  getChartTypeInfo,
  getChartZoneLabels,
  getEffectiveChartOptions,
  isD3ChartType,
  resolveChartType,
} from './registry'
export { buildChartStory, categoryNoun, chartFootnote, chartKicker, commonLabelPrefix } from './story'

export type { ChartStory } from './story'

/**
 * Aggregation options for measures
 */
export const CHART_AGGREGATIONS: Array<{ value: ChartAggregation, label: string, symbol: string }> = [
  { value: 'sum', label: 'Sum', symbol: 'SUM' },
  { value: 'count', label: 'Count', symbol: 'COUNT' },
  { value: 'avg', label: 'Average', symbol: 'AVG' },
  { value: 'min', label: 'Minimum', symbol: 'MIN' },
  { value: 'max', label: 'Maximum', symbol: 'MAX' },
  { value: 'countDistinct', label: 'Count Distinct', symbol: 'DISTINCT' },
]

/**
 * Curated code-style & quantitative color palettes for charts and MCP views.
 */
export const CHART_THEME_PRESETS: Record<ChartThemePreset, { label: string, description: string, colors: string[] }> = {
  'code': {
    label: 'Code',
    description: 'Crisp IDE cyan, emerald, violet, and amber accents',
    colors: ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#22d3ee', '#818cf8', '#f97316'],
  },
  'phosphor': {
    label: 'Phosphor',
    description: 'Terminal emerald and teal monochrome-accent ramp',
    colors: ['#22c55e', '#34d399', '#2dd4bf', '#a3e635', '#06b6d4', '#10b981', '#84cc16', '#4ade80'],
  },
  'nord': {
    label: 'Nord',
    description: 'Calm frost, glacier, and aurora editorial palette',
    colors: ['#88c0d0', '#81a1c1', '#a3be8c', '#ebcb8b', '#d08770', '#b48ead', '#5e81ac', '#bf616a'],
  },
  'thermal': {
    label: 'Thermal',
    description: 'High-contrast quantitative coral, rose, gold, and sky',
    colors: ['#f97316', '#f43f5e', '#eab308', '#d946ef', '#38bdf8', '#10b981', '#ef4444', '#fb923c'],
  },
  'mono': {
    label: 'Mono',
    description: 'Minimal print ink ramp with a single electric accent',
    colors: ['#6366f1', '#94a3b8', '#64748b', '#cbd5e1', '#475569', '#a5b4fc', '#334155', '#e2e8f0'],
  },
  'paper': {
    label: 'Paper',
    description: 'Warm paper, black ink and one orange accent',
    colors: ['#e8502a', '#1c1c1c', '#8fae9a', '#c98a1a', '#5f7f9e', '#b35a6b', '#7d776c', '#d9c9a3'],
  },
  'greenbar': {
    label: 'Greenbar',
    description: 'Ledger-paper greens with ink and brass accents',
    colors: ['#0f7a4f', '#17201a', '#86c5a2', '#b58a1a', '#3f7f8f', '#a8371a', '#6c7a70', '#cfe6d2'],
  },
  'onebit': {
    label: '1-Bit',
    description: 'One ink, told apart by pattern instead of colour',
    colors: ['#111111', '#111111', '#111111', '#111111', '#111111', '#111111', '#111111', '#111111'],
  },
  'crt-amber': {
    label: 'Amber CRT',
    description: 'Glowing amber phosphor on a dark screen',
    colors: ['#ffb000', '#ff7a1a', '#fff0c9', '#c89628', '#ff5a3c', '#ffd27a', '#b37a00', '#ffe2a6'],
  },
  'crt-green': {
    label: 'Green CRT',
    description: 'Glowing green phosphor on a dark screen',
    colors: ['#35d689', '#a3e635', '#2dd4bf', '#8ff0bd', '#e6e66a', '#10b981', '#5fe0d4', '#c8e66a'],
  },
}

/** Every chart preset id, in menu order. */
export const CHART_THEME_IDS = Object.keys(CHART_THEME_PRESETS) as ChartThemePreset[]

/**
 * Resolve palette colors for a named chart theme preset (defaults to 'code').
 */
export function getChartThemeColors(preset: ChartThemePreset = 'code'): string[] {
  return CHART_THEME_PRESETS[preset]?.colors ?? CHART_THEME_PRESETS.code.colors
}

/**
 * Default color palette for charts (Code IDE preset — works in light and dark mode)
 */
export const CHART_COLORS = CHART_THEME_PRESETS.code.colors

/** Longest series that still gets a point on every value when markers are `auto`. */
export const AUTO_MARKER_MAX_POINTS = 12

export const CHART_MARKER_OPTIONS: Array<{ value: ChartMarkers, label: string }> = [
  { value: 'auto', label: 'Points: auto' },
  { value: 'none', label: 'Points: off' },
  { value: 'all', label: 'Points: on' },
]

/** ApexCharts `markers` for a chart: points on line and area charts per the `markers` setting. */
export function chartMarkers(
  type: ChartType,
  pointCount: number,
  setting: ChartMarkers = 'auto',
  surfaceColor = '#ffffff',
): { size: number, strokeWidth?: number, strokeColors?: string, hover?: { size: number } } {
  if (type !== 'line' && type !== 'area')
    return { size: 0 }
  const show = setting === 'all' || (setting === 'auto' && pointCount <= AUTO_MARKER_MAX_POINTS)
  return {
    size: show ? 3 : 0,
    strokeWidth: 2,
    strokeColors: surfaceColor,
    hover: { size: setting === 'none' ? 0 : 5 },
  }
}

/**
 * Detect the role of a field based on its data.
 *
 * When values are native JS `number` types (not numeric strings), they are
 * treated as measures regardless of cardinality — the consumer has already
 * signaled intent by providing typed numeric data.
 *
 * Pass `overrides` to explicitly set a field's role, bypassing auto-detection.
 */
export function detectFieldRole(
  data: Record<string, unknown>[],
  field: string,
  overrides?: FieldRoleOverrides,
): FieldRole {
  // Explicit override takes priority over any heuristic
  if (overrides?.[field]) {
    return overrides[field]
  }

  if (data.length === 0)
    return 'dimension'

  const sample = data.slice(0, 100)
  const values = sample.map(row => row[field]).filter(v => v !== null && v !== undefined)

  if (values.length === 0)
    return 'dimension'

  // Check if numeric
  let numericCount = 0
  let jsNumberCount = 0
  let dateCount = 0

  for (const val of values) {
    if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '' && typeof val !== 'boolean')) {
      numericCount++
      if (typeof val === 'number') {
        jsNumberCount++
      }
    }
    if (looksLikeDate(val)) {
      dateCount++
    }
  }

  const threshold = values.length * 0.8

  // Temporal detection (date fields)
  if (dateCount >= threshold) {
    return 'temporal'
  }

  // Measure detection (numeric with sufficient cardinality OR native JS numbers)
  if (numericCount >= threshold) {
    // If every numeric value is a native JS number, the consumer has already
    // typed the data — trust it as a measure regardless of cardinality.
    const allJSNumbers = jsNumberCount >= numericCount
    if (allJSNumbers) {
      return 'measure'
    }

    const uniqueCount = new Set(values.map(String)).size
    // If high cardinality relative to count, it's a measure
    // If low cardinality (like "1, 2, 3" categories), treat as dimension
    if (uniqueCount > Math.min(values.length * 0.3, 20)) {
      return 'measure'
    }
  }

  return 'dimension'
}

/**
 * Analyze all fields in a dataset for chart building.
 *
 * Pass `overrides` to explicitly set field roles, bypassing auto-detection
 * for specific columns.
 */
export function analyzeFieldsForChart(
  data: Record<string, unknown>[],
  overrides?: FieldRoleOverrides,
): ChartFieldInfo[] {
  if (data.length === 0)
    return []

  const fields = Object.keys(data[0])
  const result: ChartFieldInfo[] = []

  for (const field of fields) {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined)
    const role = detectFieldRole(data, field, overrides)
    const uniqueSet = new Set(values.map(String))

    let dataType: 'string' | 'number' | 'date' | 'boolean' = 'string'
    let min: number | undefined
    let max: number | undefined

    if (role === 'measure') {
      dataType = 'number'
      const nums = values.map(v => Number(v)).filter(n => !Number.isNaN(n))
      if (nums.length > 0) {
        min = Math.min(...nums)
        max = Math.max(...nums)
      }
    }
    else if (role === 'temporal') {
      dataType = 'date'
    }
    else {
      // Check for boolean
      const boolCount = values.filter(v => typeof v === 'boolean' || v === 'true' || v === 'false').length
      if (boolCount >= values.length * 0.8) {
        dataType = 'boolean'
      }
    }

    result.push({
      field,
      label: formatFieldLabel(field),
      role,
      dataType,
      uniqueCount: uniqueSet.size,
      sampleValues: Array.from(uniqueSet).slice(0, 5),
      min,
      max,
    })
  }

  return result
}

/**
 * Format field name as label
 */
export function formatFieldLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Check if a chart configuration is valid/complete
 */
export function isChartConfigValid(config: ChartConfig): boolean {
  if (!getChartTypeInfo(config.type))
    return false
  if (!config.xAxis || !config.yAxis)
    return false
  // Heatmap needs a measure for colour intensity; a slope chart needs periods to compare
  if (config.type === 'heatmap')
    return !!config.colorField
  if (config.type === 'slope')
    return !!config.seriesField
  return true
}

/**
 * Get guidance message for current chart state
 */
export function getChartGuidance(config: ChartConfig): string {
  const typeInfo = getChartTypeInfo(config.type)
  if (!typeInfo)
    return 'Select a chart type to begin'

  if (!config.xAxis && !config.yAxis) {
    return typeInfo.guidance
  }

  switch (config.type) {
    case 'bar':
    case 'line':
    case 'area':
      if (!config.xAxis)
        return 'Drag a category field to the X-axis'
      if (!config.yAxis)
        return 'Drag a number field to the Y-axis'
      if (!config.seriesField)
        return 'Optionally add a field to Color for grouped series'
      return 'Chart is ready! Adjust options as needed.'

    case 'stackedBar':
      if (!config.xAxis)
        return 'Drag a category field to the X-axis'
      if (!config.yAxis)
        return 'Drag a number field to the Y-axis'
      if (!config.seriesField)
        return 'Add a field to Series to define stacked segments'
      return 'Chart is ready! Each series is stacked within the bar.'

    case 'pie':
    case 'donut':
      if (!config.xAxis)
        return 'Drag a category field (slices)'
      if (!config.yAxis)
        return 'Drag a number field (values)'
      return 'Chart is ready!'

    case 'radar':
      if (!config.xAxis)
        return 'Drag a category field for axes'
      if (!config.yAxis)
        return 'Drag a number field for values'
      return 'Chart is ready!'

    case 'scatter':
      if (!config.xAxis)
        return 'Drag a number field to X-axis'
      if (!config.yAxis)
        return 'Drag a number field to Y-axis'
      if (!config.seriesField)
        return 'Optionally add a category to color points by group'
      return 'Tip: Filter data first for clearer visualizations'

    case 'bubble':
      if (!config.xAxis)
        return 'Drag a number field to X-axis'
      if (!config.yAxis)
        return 'Drag a number field to Y-axis'
      if (!config.sizeField)
        return 'Drag a number field to Size for bubble size'
      return 'Tip: Filter to fewer records for readable bubbles'

    case 'heatmap':
      if (!config.xAxis)
        return 'Drag a category field to X-axis'
      if (!config.yAxis)
        return 'Drag a category field to Y-axis'
      if (!config.colorField)
        return 'Drag a number field to Value for color intensity'
      return 'Chart is ready!'

    default:
      return getZoneGuidance(config)
  }
}

/** Chart types drawn as connected lines, where a missing value is a gap rather than a zero. */
const GAPPED_CHART_TYPES: ReadonlySet<ChartType> = new Set<ChartType>(['line', 'area'])

/**
 * Reads the number a row contributes to a measure. Counting works on any column, so text is
 * kept: a plain count only needs a placeholder, and a distinct count gets one id per value.
 * Every other aggregation needs a real number, and text reads as NaN so the row is skipped.
 */
export function createMeasureReader(aggregation: ChartAggregation): (raw: unknown) => number {
  if (aggregation === 'count')
    return () => 1
  if (aggregation === 'countDistinct') {
    const ids = new Map<string, number>()
    return (raw) => {
      const key = String(raw)
      if (!ids.has(key))
        ids.set(key, ids.size)
      return ids.get(key) as number
    }
  }
  return raw => Number(raw)
}

/** Guidance from the type's drop-zone labels, for types without a hand-written script. */
function getZoneGuidance(config: ChartConfig): string {
  const info = getChartTypeInfo(config.type)!
  if (!config.xAxis)
    return `Drag a field to ${info.zones.xAxis}`
  if (!config.yAxis)
    return `Drag a field to ${info.zones.yAxis}`
  const size = info.zones.size
  if (size && !config[size.slot])
    return `Optionally drag a field to ${size.label}`
  const extra = info.zones.extra
  if (extra && !config[extra.slot])
    return `Optionally drag a field to ${extra.label}`
  return 'Chart is ready!'
}

/**
 * Apply aggregation to values
 */
export function aggregateValues(values: number[], aggregation: ChartAggregation): number {
  if (values.length === 0)
    return 0

  switch (aggregation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'count':
      return values.length
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    case 'countDistinct':
      return new Set(values).size
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

const TEMPORAL_CATEGORY_RE = /^(?:\d{4}(?:-\d{2}(?:-\d{2})?)?|Q[1-4](?:\s*\d{4})?|\d{4}\s*Q[1-4]|FY\d{2,4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i

function isTemporalCategories(config: ChartConfig, categories: string[]): boolean {
  if (config.xAxis?.role === 'temporal')
    return true
  if (categories.length === 0)
    return false
  const matches = categories.filter(c => TEMPORAL_CATEGORY_RE.test(c.trim())).length
  return matches / categories.length >= 0.7
}

export function resolveChartSortOrder(config: ChartConfig, categories: string[]): ChartSortOrder {
  if (config.options?.sortOrder)
    return config.options.sortOrder
  if (isTemporalCategories(config, categories))
    return 'label-asc'
  return getChartTypeInfo(config.type)?.defaults?.sortOrder ?? 'label-asc'
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function parseTemporalSortKey(label: string): number | null {
  const trimmed = label.trim()

  // Quarter formats: "Q1", "Q2 2026", "2026 Q3", "2026-Q4"
  const qFirst = /^Q([1-4])(?:\s*[-/]?\s*(\d{4}))?$/i.exec(trimmed)
  if (qFirst) {
    const year = qFirst[2] ? Number.parseInt(qFirst[2], 10) : 0
    return year * 10 + Number.parseInt(qFirst[1], 10)
  }
  const yFirst = /^(\d{4})\s*[-/]?\s*Q([1-4])$/i.exec(trimmed)
  if (yFirst) {
    return Number.parseInt(yFirst[1], 10) * 10 + Number.parseInt(yFirst[2], 10)
  }

  // Month formats: "Jan", "January", "Jan 2026", "2026 Jan"
  const mFirst = /^([a-z]+)(?:\s+(\d{4}))?$/i.exec(trimmed)
  if (mFirst) {
    const mIdx = MONTH_INDEX[mFirst[1].toLowerCase()]
    if (mIdx !== undefined) {
      const year = mFirst[2] ? Number.parseInt(mFirst[2], 10) : 0
      return year * 100 + mIdx
    }
  }
  const ymMatch = /^(\d{4})\s+([a-z]+)$/i.exec(trimmed)
  if (ymMatch) {
    const mIdx = MONTH_INDEX[ymMatch[2].toLowerCase()]
    if (mIdx !== undefined) {
      return Number.parseInt(ymMatch[1], 10) * 100 + mIdx
    }
  }

  return null
}

export function compareLabels(a: string, b: string): number {
  const numA = Number.parseFloat(a)
  const numB = Number.parseFloat(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && String(numA) === a.trim() && String(numB) === b.trim()) {
    return numA - numB
  }
  const tempA = parseTemporalSortKey(a)
  const tempB = parseTemporalSortKey(b)
  if (tempA !== null && tempB !== null) {
    return tempA - tempB
  }
  return a.localeCompare(b)
}

/**
 * Process raw data into chart-ready format
 */
export function processChartData(
  data: Record<string, unknown>[],
  config: ChartConfig,
): ChartData {
  if (!config.xAxis || !config.yAxis || data.length === 0) {
    return { categories: [], series: [] }
  }

  const xField = config.xAxis.field
  const yField = config.yAxis.field
  const yAggregation = config.yAxis.aggregation || 'sum'
  const readMeasure = createMeasureReader(yAggregation)
  const seriesField = config.seriesField?.field

  // Group data by x-axis values (preserving Map insertion order for 'data' sort mode)
  const grouped = new Map<string, Map<string, number[]>>()

  for (const row of data) {
    const rawY = row[yField]
    if (rawY === null || rawY === undefined || rawY === '')
      continue

    const xValue = String(row[xField] ?? '(blank)')
    const yValue = readMeasure(rawY)
    const seriesValue = seriesField ? String(row[seriesField] ?? '(blank)') : '_default'

    if (Number.isNaN(yValue))
      continue

    if (!grouped.has(xValue)) {
      grouped.set(xValue, new Map())
    }
    const xGroup = grouped.get(xValue)!

    if (!xGroup.has(seriesValue)) {
      xGroup.set(seriesValue, [])
    }
    xGroup.get(seriesValue)!.push(yValue)
  }

  // Get all series names
  const seriesNames = new Set<string>()
  for (const xGroup of grouped.values()) {
    for (const seriesName of xGroup.keys()) {
      seriesNames.add(seriesName)
    }
  }

  // Determine effective category order (value-desc, value-asc, label-asc, label-desc, or data/grid order)
  const rawCategories = Array.from(grouped.keys())
  const sortOrder = resolveChartSortOrder(config, rawCategories)

  let categories: string[]
  if (sortOrder === 'data') {
    categories = rawCategories
  }
  else if (sortOrder === 'value-desc' || sortOrder === 'value-asc') {
    const totals = new Map<string, number>()
    for (const category of rawCategories) {
      const xGroup = grouped.get(category)!
      let sum = 0
      for (const seriesName of seriesNames) {
        const values = xGroup.get(seriesName) || []
        sum += aggregateValues(values, yAggregation)
      }
      totals.set(category, sum)
    }
    const dir = sortOrder === 'value-desc' ? -1 : 1
    categories = [...rawCategories].sort((a, b) => {
      const diff = ((totals.get(a) ?? 0) - (totals.get(b) ?? 0)) * dir
      return diff !== 0 ? diff : compareLabels(a, b)
    })
  }
  else {
    const dir = sortOrder === 'label-desc' ? -1 : 1
    categories = [...rawCategories].sort((a, b) => compareLabels(a, b) * dir)
  }

  // Build series data
  const series: ChartSeries[] = []

  // A line has no value where a series has no rows, so it breaks there instead of dropping to
  // zero. Bars stay zero-filled: an empty bar and a zero bar look the same, and stacked totals
  // need a number in every slot.
  const missingValue = GAPPED_CHART_TYPES.has(config.type) ? null : 0

  for (const seriesName of seriesNames) {
    const seriesData = categories.map((category) => {
      const values = grouped.get(category)?.get(seriesName)
      return values ? aggregateValues(values, yAggregation) : missingValue
    })

    series.push({
      name: seriesName === '_default'
        ? formatFieldLabel(yField)
        : seriesName,
      data: seriesData,
    })
  }

  return { categories, series }
}

/** One aggregated value per category, in first-seen order. */
export interface CategoryEntry {
  category: string
  value: number
}

/**
 * Aggregate a measure per category value, skipping blank measures and, except
 * for counts, non-numeric ones. Categories keep first-seen order (the grid's order).
 */
export function aggregateByCategory(
  data: Record<string, unknown>[],
  categoryField: string,
  measureField: string,
  aggregation: ChartAggregation = 'sum',
): CategoryEntry[] {
  const readMeasure = createMeasureReader(aggregation)
  const grouped = new Map<string, number[]>()
  for (const row of data) {
    const raw = row[measureField]
    if (raw === null || raw === undefined || raw === '')
      continue
    const value = readMeasure(raw)
    if (Number.isNaN(value))
      continue
    const category = String(row[categoryField] ?? '(blank)')
    const bucket = grouped.get(category)
    if (bucket)
      bucket.push(value)
    else
      grouped.set(category, [value])
  }
  return Array.from(grouped, ([category, values]) => ({ category, value: aggregateValues(values, aggregation) }))
}

/** Order entries by the chart's effective sort order. */
export function sortCategoryEntries<T extends CategoryEntry>(config: ChartConfig, entries: T[]): T[] {
  const sortOrder = resolveChartSortOrder(config, entries.map(e => e.category))
  switch (sortOrder) {
    case 'value-desc':
      return [...entries].sort((a, b) => b.value - a.value || compareLabels(a.category, b.category))
    case 'value-asc':
      return [...entries].sort((a, b) => a.value - b.value || compareLabels(a.category, b.category))
    case 'label-asc':
      return [...entries].sort((a, b) => compareLabels(a.category, b.category))
    case 'label-desc':
      return [...entries].sort((a, b) => compareLabels(b.category, a.category))
    default:
      return entries
  }
}

/**
 * Process data for pie/donut charts
 */
export function processChartDataForPie(
  data: Record<string, unknown>[],
  config: ChartConfig,
): ChartData<number> {
  if (!config.xAxis || !config.yAxis || data.length === 0) {
    return { categories: [], series: [] }
  }
  const entries = sortCategoryEntries(config, aggregateByCategory(data, config.xAxis.field, config.yAxis.field, config.yAxis.aggregation))
  return {
    categories: entries.map(e => e.category),
    series: [{
      name: formatFieldLabel(config.yAxis.field),
      data: entries.map(e => e.value),
    }],
  }
}

/** Point data for scatter/bubble charts */
export interface ScatterPoint {
  x: number
  y: number
  z?: number
  label?: string
}

/** Grouped scatter data with multiple series */
export interface ScatterSeriesData {
  series: Array<{
    name: string
    data: ScatterPoint[]
  }>
}

/**
 * Process data for scatter/bubble charts
 * Returns grouped series when seriesField is provided for color-coding
 */
export function processChartDataForScatter(
  data: Record<string, unknown>[],
  config: ChartConfig,
): ScatterSeriesData {
  if (!config.xAxis || !config.yAxis || data.length === 0) {
    return { series: [] }
  }

  const xField = config.xAxis.field
  const yField = config.yAxis.field
  const sizeField = config.sizeField?.field
  const seriesField = config.seriesField?.field

  // Group by series field if provided
  const grouped = new Map<string, ScatterPoint[]>()

  for (const row of data) {
    const x = Number(row[xField])
    const y = Number(row[yField])

    if (Number.isNaN(x) || Number.isNaN(y))
      continue

    const point: ScatterPoint = { x, y }

    if (sizeField) {
      const z = Number(row[sizeField])
      if (!Number.isNaN(z)) {
        point.z = z
      }
    }

    // Group by series field or use default
    const seriesName = seriesField
      ? String(row[seriesField] ?? '(blank)')
      : '_default'

    if (!grouped.has(seriesName)) {
      grouped.set(seriesName, [])
    }
    grouped.get(seriesName)!.push(point)
  }

  // Convert to series array
  const series = Array.from(grouped.entries()).map(([name, points]) => ({
    name: name === '_default' ? (config.yAxis?.label || 'Data') : name,
    data: points,
  }))

  return { series }
}

/** Heatmap series data format for ApexCharts */
export interface HeatmapSeriesData {
  series: Array<{
    name: string
    data: Array<{ x: string, y: number }>
  }>
}

/**
 * Process data for heatmap charts
 * ApexCharts heatmaps need: series[] where each series is a Y category
 * containing data[] of {x: X category, y: value}
 */
export function processChartDataForHeatmap(
  data: Record<string, unknown>[],
  config: ChartConfig,
): HeatmapSeriesData {
  if (!config.xAxis || !config.yAxis || !config.colorField || data.length === 0) {
    return { series: [] }
  }

  const xField = config.xAxis.field
  const yField = config.yAxis.field
  const colorField = config.colorField.field
  const colorAggregation = config.colorField.aggregation || 'sum'

  // Group data by Y category, then by X category
  // Structure: Map<yValue, Map<xValue, number[]>>
  const grouped = new Map<string, Map<string, number[]>>()
  const allXCategories = new Set<string>()

  for (const row of data) {
    const xValue = String(row[xField] ?? '(blank)')
    const yValue = String(row[yField] ?? '(blank)')
    const colorValue = Number(row[colorField])

    if (Number.isNaN(colorValue))
      continue

    allXCategories.add(xValue)

    if (!grouped.has(yValue)) {
      grouped.set(yValue, new Map())
    }
    const yGroup = grouped.get(yValue)!

    if (!yGroup.has(xValue)) {
      yGroup.set(xValue, [])
    }
    yGroup.get(xValue)!.push(colorValue)
  }

  // Sort X categories
  const sortedXCategories = Array.from(allXCategories).sort((a, b) => {
    const numA = Number.parseFloat(a)
    const numB = Number.parseFloat(b)
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })

  // Sort Y categories (series names)
  const sortedYCategories = Array.from(grouped.keys()).sort((a, b) => {
    const numA = Number.parseFloat(a)
    const numB = Number.parseFloat(b)
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })

  // Build series - each Y category becomes a series
  const series = sortedYCategories.map((yCategory) => {
    const yGroup = grouped.get(yCategory)!
    const seriesData = sortedXCategories.map((xCategory) => {
      const values = yGroup.get(xCategory) || []
      const aggregatedValue = values.length > 0 ? aggregateValues(values, colorAggregation) : 0
      return { x: xCategory, y: aggregatedValue }
    })

    return {
      name: yCategory,
      data: seriesData,
    }
  })

  return { series }
}

/**
 * Create a default chart config
 */
export function createDefaultChartConfig(): ChartConfig {
  return {
    type: 'bar',
    options: {
      chartTheme: 'code',
      showDataLabels: false,
      showLegend: true,
      legendPosition: 'top',
      animated: true,
      showGrid: true,
      enableZoom: false,
      stacked: false,
    },
  }
}

/**
 * Storage key for chart config
 */
export function generateChartStorageKey(prefix = 'tinypivot'): string {
  return `${prefix}_chart_config`
}

/**
 * Save chart config to localStorage
 */
export function saveChartConfig(config: ChartConfig, key?: string): void {
  try {
    localStorage.setItem(key || generateChartStorageKey(), JSON.stringify(config))
  }
  catch {
    // localStorage might be unavailable
  }
}

/**
 * Load chart config from localStorage
 */
export function loadChartConfig(key?: string): ChartConfig | null {
  try {
    const stored = localStorage.getItem(key || generateChartStorageKey())
    if (stored) {
      return JSON.parse(stored)
    }
  }
  catch {
    // localStorage might be unavailable or invalid JSON
  }
  return null
}
