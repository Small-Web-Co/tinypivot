/**
 * TinyPivot Core - Chart Utilities
 * Framework-agnostic chart data processing and configuration
 */
import type {
  ChartAggregation,
  ChartConfig,
  ChartData,
  ChartFieldInfo,
  ChartSeries,
  ChartSortOrder,
  ChartThemePreset,
  ChartType,
  ChartTypeInfo,
  FieldRole,
  FieldRoleOverrides,
} from '../types'

/**
 * Chart type definitions with metadata
 */
export const CHART_TYPES: ChartTypeInfo[] = [
  {
    type: 'bar',
    label: 'Bar Chart',
    icon: 'bar',
    description: 'Compare values across categories',
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category to X-axis and a number to Y-axis',
    bestFor: ['Comparing categories', 'Ranking', 'Part-to-whole'],
  },
  {
    type: 'stackedBar',
    label: 'Stacked Bar',
    icon: 'stackedBar',
    description: 'Compare composition across categories',
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category to X-axis, a number to Y-axis, and a grouping field to Series',
    bestFor: ['Part-to-whole comparison', 'Composition over categories', 'Cumulative totals'],
  },
  {
    type: 'line',
    label: 'Line Chart',
    icon: 'line',
    description: 'Show trends over time or sequence',
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Best with time/date on X-axis and numbers on Y-axis',
    bestFor: ['Trends over time', 'Continuous data', 'Multiple series'],
  },
  {
    type: 'area',
    label: 'Area Chart',
    icon: 'area',
    description: 'Show magnitude and trends',
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Like line charts but emphasizes volume. Great for stacked comparisons.',
    bestFor: ['Cumulative totals', 'Part-to-whole over time', 'Volume trends'],
  },
  {
    type: 'pie',
    label: 'Pie Chart',
    icon: 'pie',
    description: 'Show proportions of a whole',
    requiredFields: ['dimension', 'measure'],
    optionalFields: [],
    guidance: 'Drag a category and a number. Best with 2-6 categories.',
    bestFor: ['Part-to-whole', 'Proportions', 'Simple distributions'],
  },
  {
    type: 'donut',
    label: 'Donut Chart',
    icon: 'donut',
    description: 'Proportions with center space for metrics',
    requiredFields: ['dimension', 'measure'],
    optionalFields: [],
    guidance: 'Like pie but allows showing a total in the center',
    bestFor: ['Part-to-whole', 'Showing total', 'Dashboard KPIs'],
  },
  {
    type: 'scatter',
    label: 'Scatter Plot',
    icon: 'scatter',
    description: 'Show relationships between two variables',
    requiredFields: ['measure', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a number to X-axis and another number to Y-axis',
    bestFor: ['Correlation', 'Outlier detection', 'Distribution'],
  },
  {
    type: 'bubble',
    label: 'Bubble Chart',
    icon: 'bubble',
    description: 'Three-dimensional comparison',
    requiredFields: ['measure', 'measure'],
    optionalFields: ['measure', 'dimension'],
    guidance: 'Like scatter, plus drag a third number to Size for bubble size',
    bestFor: ['Multi-variable comparison', 'Weighted relationships'],
  },
  {
    type: 'heatmap',
    label: 'Heatmap',
    icon: 'heatmap',
    description: 'Visualize density or intensity',
    requiredFields: ['dimension', 'dimension', 'measure'],
    optionalFields: [],
    guidance: 'Drag two categories (X and Y) and a number to Color',
    bestFor: ['Patterns', 'Density', 'Cross-tabulation'],
  },
  {
    type: 'radar',
    label: 'Radar Chart',
    icon: 'radar',
    description: 'Compare multiple variables',
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Best for comparing items across multiple metrics',
    bestFor: ['Multi-metric comparison', 'Performance profiles', 'Balanced scorecards'],
  },
]

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
  code: {
    label: 'Code',
    description: 'Crisp IDE cyan, emerald, violet, and amber accents',
    colors: ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#22d3ee', '#818cf8', '#f97316'],
  },
  phosphor: {
    label: 'Phosphor',
    description: 'Terminal emerald and teal monochrome-accent ramp',
    colors: ['#22c55e', '#34d399', '#2dd4bf', '#a3e635', '#06b6d4', '#10b981', '#84cc16', '#4ade80'],
  },
  nord: {
    label: 'Nord',
    description: 'Calm frost, glacier, and aurora editorial palette',
    colors: ['#88c0d0', '#81a1c1', '#a3be8c', '#ebcb8b', '#d08770', '#b48ead', '#5e81ac', '#bf616a'],
  },
  thermal: {
    label: 'Thermal',
    description: 'High-contrast quantitative coral, rose, gold, and sky',
    colors: ['#f97316', '#f43f5e', '#eab308', '#d946ef', '#38bdf8', '#10b981', '#ef4444', '#fb923c'],
  },
  mono: {
    label: 'Mono',
    description: 'Minimal print ink ramp with a single electric accent',
    colors: ['#6366f1', '#94a3b8', '#64748b', '#cbd5e1', '#475569', '#a5b4fc', '#334155', '#e2e8f0'],
  },
}

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
    if (val instanceof Date || (typeof val === 'string' && !Number.isNaN(Date.parse(val)) && val.includes('-'))) {
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
 * Get chart type info by type
 */
export function getChartTypeInfo(type: ChartType): ChartTypeInfo | undefined {
  return CHART_TYPES.find(ct => ct.type === type)
}

/**
 * Check if a chart configuration is valid/complete
 */
export function isChartConfigValid(config: ChartConfig): boolean {
  const typeInfo = getChartTypeInfo(config.type)
  if (!typeInfo)
    return false

  // Check required fields based on chart type
  switch (config.type) {
    case 'bar':
    case 'stackedBar':
    case 'line':
    case 'area':
    case 'pie':
    case 'donut':
    case 'radar':
      return !!config.xAxis && !!config.yAxis

    case 'scatter':
      // Scatter needs two numeric fields (X and Y)
      return !!config.xAxis && !!config.yAxis

    case 'bubble':
      // Bubble needs two numeric fields (X and Y), size is optional
      return !!config.xAxis && !!config.yAxis

    case 'heatmap':
      // Heatmap needs two categories (X and Y) plus a measure for color intensity
      return !!config.xAxis && !!config.yAxis && !!config.colorField

    default:
      return false
  }
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
      return typeInfo.guidance
  }
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
  if (config.type === 'bar' || config.type === 'stackedBar' || config.type === 'pie' || config.type === 'donut')
    return 'value-desc'
  return 'label-asc'
}

function compareLabels(a: string, b: string): number {
  const numA = Number.parseFloat(a)
  const numB = Number.parseFloat(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && String(numA) === a.trim() && String(numB) === b.trim()) {
    return numA - numB
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
  const seriesField = config.seriesField?.field

  // Group data by x-axis values (preserving Map insertion order for 'data' sort mode)
  const grouped = new Map<string, Map<string, number[]>>()

  for (const row of data) {
    const xValue = String(row[xField] ?? '(blank)')
    const yValue = Number(row[yField])
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

  for (const seriesName of seriesNames) {
    const seriesData: number[] = []

    for (const category of categories) {
      const xGroup = grouped.get(category)
      const values = xGroup?.get(seriesName) || []
      seriesData.push(aggregateValues(values, yAggregation))
    }

    series.push({
      name: seriesName === '_default'
        ? formatFieldLabel(yField)
        : seriesName,
      data: seriesData,
    })
  }

  return { categories, series }
}

/**
 * Process data for pie/donut charts
 */
export function processChartDataForPie(
  data: Record<string, unknown>[],
  config: ChartConfig,
): ChartData {
  if (!config.xAxis || !config.yAxis || data.length === 0) {
    return { categories: [], series: [] }
  }

  const xField = config.xAxis.field
  const yField = config.yAxis.field
  const yAggregation = config.yAxis.aggregation || 'sum'

  // Group by category
  const grouped = new Map<string, number[]>()

  for (const row of data) {
    const xValue = String(row[xField] ?? '(blank)')
    const yValue = Number(row[yField])

    if (Number.isNaN(yValue))
      continue

    if (!grouped.has(xValue)) {
      grouped.set(xValue, [])
    }
    grouped.get(xValue)!.push(yValue)
  }

  const rawEntries = Array.from(grouped.entries()).map(([category, values]) => ({
    category,
    value: aggregateValues(values, yAggregation),
  }))

  const sortOrder = resolveChartSortOrder(config, rawEntries.map(e => e.category))
  let entries = rawEntries
  if (sortOrder === 'value-desc') {
    entries = [...rawEntries].sort((a, b) => b.value - a.value)
  }
  else if (sortOrder === 'value-asc') {
    entries = [...rawEntries].sort((a, b) => a.value - b.value)
  }
  else if (sortOrder === 'label-asc') {
    entries = [...rawEntries].sort((a, b) => compareLabels(a.category, b.category))
  }
  else if (sortOrder === 'label-desc') {
    entries = [...rawEntries].sort((a, b) => compareLabels(b.category, a.category))
  }

  return {
    categories: entries.map(e => e.category),
    series: [{
      name: formatFieldLabel(yField),
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
