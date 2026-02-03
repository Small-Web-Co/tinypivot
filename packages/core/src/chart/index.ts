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
  ChartType,
  ChartTypeInfo,
  FieldRole,
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
 * Default color palette for charts (works in light and dark mode)
 */
export const CHART_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#3b82f6', // blue
]

/**
 * Detect the role of a field based on its data
 */
export function detectFieldRole(
  data: Record<string, unknown>[],
  field: string,
): FieldRole {
  if (data.length === 0)
    return 'dimension'

  const sample = data.slice(0, 100)
  const values = sample.map(row => row[field]).filter(v => v !== null && v !== undefined)

  if (values.length === 0)
    return 'dimension'

  // Check if numeric
  let numericCount = 0
  let dateCount = 0

  for (const val of values) {
    if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '' && typeof val !== 'boolean')) {
      numericCount++
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

  // Measure detection (numeric with low cardinality ratio)
  if (numericCount >= threshold) {
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
 * Analyze all fields in a dataset for chart building
 */
export function analyzeFieldsForChart(
  data: Record<string, unknown>[],
): ChartFieldInfo[] {
  if (data.length === 0)
    return []

  const fields = Object.keys(data[0])
  const result: ChartFieldInfo[] = []

  for (const field of fields) {
    const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined)
    const role = detectFieldRole(data, field)
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
 * Handles camelCase, snake_case, kebab-case, and ALL_CAPS
 */
export function formatFieldLabel(field: string): string {
  return field
    // Only add space before uppercase if preceded by lowercase (camelCase)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

  // Group data by x-axis values
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

  // Get sorted categories
  const categories = Array.from(grouped.keys()).sort((a, b) => {
    const numA = Number.parseFloat(a)
    const numB = Number.parseFloat(b)
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })

  // Get all series names
  const seriesNames = new Set<string>()
  for (const xGroup of grouped.values()) {
    for (const seriesName of xGroup.keys()) {
      seriesNames.add(seriesName)
    }
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

  // Sort by aggregated value descending
  const entries = Array.from(grouped.entries())
    .map(([category, values]) => ({
      category,
      value: aggregateValues(values, yAggregation),
    }))
    .sort((a, b) => b.value - a.value)

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
      showDataLabels: false,
      showLegend: true,
      legendPosition: 'top',
      animated: true,
      colors: CHART_COLORS,
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
