/**
 * Chart type registry: one entry per chart type with its renderer, drop-zone
 * labels, loose aliases, defaults and terminal fallback. Everything that needs
 * to know about chart types (Chart Builder, MCP tools, terminal cards) reads
 * from here, so adding a type is one entry.
 */
import type { ChartConfig, ChartRenderer, ChartType, ChartTypeInfo, ChartZoneLabels } from '../types'

const DIMENSION_X = { xAxis: 'X-Axis (dimension)', xAxisPlaceholder: 'Drop a dimension' }
const MEASURE_Y = { yAxis: 'Y-Axis (measure)', yAxisPlaceholder: 'Drop a measure' }
const GROUP_SERIES = { slot: 'seriesField', label: 'Color / Series (optional)', placeholder: 'Group by dimension' } as const

export const CHART_TYPES: ChartTypeInfo[] = [
  {
    type: 'bar',
    defaults: { sortOrder: 'value-desc' },
    label: 'Bar Chart',
    icon: 'M3 3v18h18V3H3zm4 14H5v-6h2v6zm4 0H9V7h2v10zm4 0h-2V9h2v8zm4 0h-2v-4h2v4z',
    description: 'Compare values across categories',
    renderer: 'apex',
    apexType: 'bar',
    aliases: ['bars', 'column', 'columns', 'column chart', 'histogram', 'ranking'],
    zones: { ...DIMENSION_X, ...MEASURE_Y, extra: GROUP_SERIES },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category to X-axis and a number to Y-axis',
    bestFor: ['Comparing categories', 'Ranking', 'Part-to-whole'],
  },
  {
    type: 'stackedBar',
    defaults: { sortOrder: 'value-desc' },
    label: 'Stacked Bar',
    icon: 'M3 3v18h18V3H3zm4 14H5v-3h2v3zm0-4H5v-3h2v3zm4 4H9v-5h2v5zm0-6H9v-4h2v4zm4 6h-2v-3h2v3zm0-4h-2v-5h2v5zm4 4h-2v-2h2v2zm0-3h-2v-2h2v2z',
    description: 'Compare composition across categories',
    renderer: 'apex',
    apexType: 'bar',
    aliases: ['stacked', 'stacked column', 'stacked bars', 'composition'],
    zones: { ...DIMENSION_X, ...MEASURE_Y, extra: { slot: 'seriesField', label: 'Series (stacking field)', placeholder: 'Drop a dimension to stack by' } },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category to X-axis, a number to Y-axis, and a grouping field to Series',
    bestFor: ['Part-to-whole comparison', 'Composition over categories', 'Cumulative totals'],
  },
  {
    type: 'line',
    label: 'Line Chart',
    icon: 'M3.5 18.5l6-6 4 4 8-8M14.5 8.5h6v6',
    description: 'Show trends over time or sequence',
    renderer: 'apex',
    apexType: 'line',
    aliases: ['trend', 'time series', 'timeseries', 'lines', 'sparkline'],
    zones: { ...DIMENSION_X, ...MEASURE_Y, extra: GROUP_SERIES },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Best with time/date on X-axis and numbers on Y-axis',
    bestFor: ['Trends over time', 'Continuous data', 'Multiple series'],
  },
  {
    type: 'area',
    label: 'Area Chart',
    icon: 'M3 17l6-6 4 4 8-8v10H3z',
    description: 'Show magnitude and trends',
    renderer: 'apex',
    apexType: 'area',
    aliases: ['filled line', 'mountain', 'stacked area'],
    zones: { ...DIMENSION_X, ...MEASURE_Y, extra: GROUP_SERIES },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Like line charts but emphasizes volume. Great for stacked comparisons.',
    bestFor: ['Cumulative totals', 'Part-to-whole over time', 'Volume trends'],
  },
  {
    type: 'pie',
    defaults: { sortOrder: 'value-desc' },
    label: 'Pie Chart',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8v8l5.66 5.66C14.28 19.04 13.18 20 12 20z',
    description: 'Show proportions of a whole',
    renderer: 'apex',
    apexType: 'pie',
    aliases: ['share', 'proportion'],
    zones: { xAxis: 'Slices (dimension)', xAxisPlaceholder: 'Drop a dimension', yAxis: 'Values (measure)', yAxisPlaceholder: 'Drop a measure' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: [],
    guidance: 'Drag a category and a number. Best with 2-6 categories.',
    bestFor: ['Part-to-whole', 'Proportions', 'Simple distributions'],
  },
  {
    type: 'donut',
    defaults: { sortOrder: 'value-desc' },
    label: 'Donut Chart',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
    description: 'Proportions with center space for metrics',
    renderer: 'apex',
    apexType: 'donut',
    aliases: ['doughnut', 'ring'],
    zones: { xAxis: 'Slices (dimension)', xAxisPlaceholder: 'Drop a dimension', yAxis: 'Values (measure)', yAxisPlaceholder: 'Drop a measure' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: [],
    guidance: 'Like pie but allows showing a total in the center',
    bestFor: ['Part-to-whole', 'Showing total', 'Dashboard KPIs'],
  },
  {
    type: 'scatter',
    label: 'Scatter Plot',
    icon: 'M7 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    description: 'Show relationships between two variables',
    renderer: 'apex',
    apexType: 'scatter',
    aliases: ['scatterplot', 'scatter plot', 'xy', 'correlation', 'dot plot', 'points'],
    zones: {
      xAxis: 'X-Axis (measure)',
      xAxisPlaceholder: 'Drop a measure',
      ...MEASURE_Y,
      extra: { slot: 'seriesField', label: 'Color by (optional)', placeholder: 'Group points by dimension' },
    },
    requiredFields: ['measure', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a number to X-axis and another number to Y-axis',
    bestFor: ['Correlation', 'Outlier detection', 'Distribution'],
  },
  {
    type: 'bubble',
    label: 'Bubble Chart',
    icon: 'M7 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm5-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    description: 'Three-dimensional comparison',
    renderer: 'apex',
    apexType: 'bubble',
    aliases: ['bubbles'],
    zones: {
      xAxis: 'X-Axis (measure)',
      xAxisPlaceholder: 'Drop a measure',
      ...MEASURE_Y,
      extra: { slot: 'seriesField', label: 'Color by (optional)', placeholder: 'Group points by dimension' },
      size: { slot: 'sizeField', label: 'Size (number)', placeholder: 'Drop a number for bubble size' },
    },
    requiredFields: ['measure', 'measure'],
    optionalFields: ['measure', 'dimension'],
    guidance: 'Like scatter, plus drag a third number to Size for bubble size',
    bestFor: ['Multi-variable comparison', 'Weighted relationships'],
  },
  {
    type: 'heatmap',
    label: 'Heatmap',
    icon: 'M3 3h4v4H3V3zm6 0h4v4H9V3zm6 0h4v4h-4V3zM3 9h4v4H3V9zm6 0h4v4H9V9zm6 0h4v4h-4V9zM3 15h4v4H3v-4zm6 0h4v4H9v-4zm6 0h4v4h-4v-4z',
    description: 'Visualize density or intensity',
    renderer: 'apex',
    apexType: 'heatmap',
    aliases: ['heat map', 'matrix', 'cross tab', 'crosstab', 'grid'],
    zones: {
      ...DIMENSION_X,
      yAxis: 'Y-Axis (dimension)',
      yAxisPlaceholder: 'Drop a dimension',
      extra: { slot: 'colorField', label: 'Value / Intensity', placeholder: 'Drop a measure for color intensity' },
    },
    requiredFields: ['dimension', 'dimension', 'measure'],
    optionalFields: [],
    guidance: 'Drag two categories (X and Y) and a number to Color',
    bestFor: ['Patterns', 'Density', 'Cross-tabulation'],
  },
  {
    type: 'radar',
    label: 'Radar Chart',
    icon: 'M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4zm0 3.18l6 3v5.09c0 4.08-2.76 7.91-6 9.14V5.18z',
    description: 'Compare multiple variables',
    renderer: 'apex',
    apexType: 'radar',
    aliases: ['spider', 'web', 'star', 'spider web'],
    zones: {
      xAxis: 'Axes (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Values (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Compare by (optional)', placeholder: 'Group by dimension' },
    },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Best for comparing items across multiple metrics',
    bestFor: ['Multi-metric comparison', 'Performance profiles', 'Balanced scorecards'],
  },
  {
    type: 'choropleth',
    label: 'Map',
    icon: 'M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5zm7 .9v8.8l4 1.6V9z',
    description: 'Shade countries, US states or sales regions by value',
    renderer: 'd3',
    aliases: ['map', 'maps', 'geo', 'geomap', 'filled map', 'region map', 'world map', 'us map', 'state map', 'country map'],
    zones: {
      xAxis: 'Region (country, state or region)',
      xAxisPlaceholder: 'Drop a name or ISO / postal code',
      yAxis: 'Value (measure)',
      yAxisPlaceholder: 'Drop a measure',
    },
    defaults: { geography: 'auto', showLegend: true },
    terminalFallback: { as: 'bar', note: 'Map drawn in TinyPivot; this text card ranks the regions instead.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: [],
    guidance: 'Drag a country, US state or region (e.g. EMEA, APAC) and a number',
    bestFor: ['Regional comparison', 'Geographic spread', 'Territory performance'],
  },
  {
    type: 'bullet',
    label: 'Bullet',
    icon: 'M3 5h14v4H3V5zm0 10h10v4H3v-4zm16-11h2v6h-2V4zm-4 10h2v6h-2v-6z',
    description: 'Actual against target with qualitative bands',
    renderer: 'd3',
    aliases: ['bullets', 'target', 'actual vs target', 'vs target', 'kpi', 'progress', 'goal', 'quota'],
    zones: {
      xAxis: 'Rows (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Actual (measure)',
      yAxisPlaceholder: 'Drop a measure',
      size: { slot: 'targetField', label: 'Target (measure, optional)', placeholder: 'Drop a target measure' },
    },
    defaults: { sortOrder: 'value-desc' },
    terminalFallback: { as: 'bar', note: 'Bullet chart drawn in TinyPivot; this text card shows actuals as bars.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['measure'],
    guidance: 'Drag a category and an actual; add a target measure for the marker',
    bestFor: ['Actual vs target', 'Quota attainment', 'KPI scorecards'],
  },
  {
    type: 'radialBar',
    label: 'Radial Bar',
    icon: 'M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2zm0 5a5 5 0 0 1 5 5h-3a2 2 0 0 0-2-2V7zM2 12h3a7 7 0 0 0 7 7v3A10 10 0 0 1 2 12z',
    description: 'Bars wrapped around a circle',
    renderer: 'd3',
    aliases: ['radial', 'radial bars', 'circular bar', 'circular bars', 'polar bar', 'gauge', 'rose', 'nightingale', 'wind rose'],
    zones: {
      xAxis: 'Bars (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Length (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Stack by (optional)', placeholder: 'Group by dimension' },
    },
    defaults: { sortOrder: 'value-desc' },
    terminalFallback: { as: 'bar', note: 'Radial bars drawn in TinyPivot; this text card shows them as straight bars.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category and a number; add a series to stack',
    bestFor: ['Cyclical categories', 'Ranking at a glance', 'Compact dashboards'],
  },
  {
    type: 'radialArea',
    label: 'Radial Area',
    icon: 'M12 2l3 7 7 1-5 5 2 7-7-4-7 4 2-7-5-5 7-1z',
    description: 'A filled line around a circle, for cycles like months or hours',
    renderer: 'd3',
    aliases: ['polar area', 'radial line', 'circular area', 'radial area chart', 'seasonality', 'clock'],
    zones: {
      xAxis: 'Angle (dimension, e.g. month)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Radius (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Compare by (optional)', placeholder: 'Group by dimension' },
    },
    defaults: { sortOrder: 'label-asc' },
    terminalFallback: { as: 'line', note: 'Radial area drawn in TinyPivot; this text card unrolls it into a line.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Best with an ordered cycle (months, weekdays, hours) and a number',
    bestFor: ['Seasonality', 'Cyclical patterns', 'Year-over-year cycles'],
  },
  {
    type: 'treemap',
    label: 'Treemap',
    icon: 'M3 3h10v10H3V3zm12 0h6v6h-6V3zm0 8h6v10h-6V11zM3 15h10v6H3v-6z',
    description: 'Nested rectangles sized by value',
    renderer: 'd3',
    aliases: ['tree map', 'tiles', 'mosaic', 'hierarchy', 'blocks'],
    zones: {
      xAxis: 'Tiles (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Size (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Group by (optional parent)', placeholder: 'Drop a parent dimension' },
    },
    defaults: { sortOrder: 'value-desc' },
    terminalFallback: { as: 'bar', note: 'Treemap drawn in TinyPivot; this text card ranks the tiles instead.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category and a number; add a parent group to nest tiles',
    bestFor: ['Part-to-whole with many items', 'Nested breakdowns', 'Spotting the big few'],
  },
  {
    type: 'sunburst',
    label: 'Sunburst',
    icon: 'M12 2a10 10 0 1 0 10 10h-4a6 6 0 1 1-6-6V2zm0 6a4 4 0 1 0 4 4h-4V8z',
    description: 'Rings of a hierarchy, parent inside, children outside',
    renderer: 'd3',
    aliases: ['sun burst', 'multi-level pie', 'multilevel pie', 'nested donut', 'radial tree'],
    zones: {
      xAxis: 'Outer ring (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Size (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Inner ring (optional parent)', placeholder: 'Drop a parent dimension' },
    },
    defaults: { sortOrder: 'value-desc' },
    terminalFallback: { as: 'bar', note: 'Sunburst drawn in TinyPivot; this text card ranks the outer ring instead.' },
    requiredFields: ['dimension', 'measure'],
    optionalFields: ['dimension'],
    guidance: 'Drag a category and a number; add a parent for the inner ring',
    bestFor: ['Two-level part-to-whole', 'Category → subcategory mix'],
  },
  {
    type: 'slope',
    label: 'Slope',
    icon: 'M4 4v16M20 4v16M4 15l16-9M4 8l16 6M4 18l16-2',
    description: 'Who grew and who shrank between two periods',
    renderer: 'd3',
    aliases: ['slopegraph', 'slope graph', 'slope chart', 'before after', 'before and after', 'change', 'period comparison', 'yoy', 'year over year'],
    zones: {
      xAxis: 'Lines (dimension)',
      xAxisPlaceholder: 'Drop a dimension',
      yAxis: 'Value (measure)',
      yAxisPlaceholder: 'Drop a measure',
      extra: { slot: 'seriesField', label: 'Periods (first vs last, e.g. year)', placeholder: 'Drop a period dimension' },
    },
    defaults: { sortOrder: 'value-desc' },
    terminalFallback: { as: 'bar', note: 'Slope chart drawn in TinyPivot; this text card shows totals as bars.' },
    requiredFields: ['dimension', 'measure', 'dimension'],
    optionalFields: [],
    guidance: 'Drag a category, a number, and a period field (e.g. year) to compare first vs last',
    bestFor: ['Year-over-year change', 'Before and after', 'Rank shifts'],
  },
]

const TYPE_BY_ID = new Map<ChartType, ChartTypeInfo>(CHART_TYPES.map(t => [t.type, t]))

/** Lowercase and drop spaces, dashes and underscores so 'Radial-Bar' and 'radial bar' match. */
function normalizeTypeName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]+/g, '')
}

const TYPE_BY_NAME = new Map<string, ChartType>()
for (const info of CHART_TYPES) {
  for (const name of [info.type, info.label, ...info.aliases])
    TYPE_BY_NAME.set(normalizeTypeName(name), info.type)
}

/** Every chart type id, in menu order. */
export const CHART_TYPE_IDS = CHART_TYPES.map(t => t.type)

/**
 * Resolve a loose chart name ('map', 'Radial Bar', 'gauge', 'stacked column')
 * to a chart type, or `null` when nothing matches.
 */
export function resolveChartType(name: string | null | undefined): ChartType | null {
  if (!name)
    return null
  return TYPE_BY_NAME.get(normalizeTypeName(name)) ?? null
}

/** Get chart type info by type */
export function getChartTypeInfo(type: ChartType): ChartTypeInfo | undefined {
  return TYPE_BY_ID.get(type)
}

export function getChartRenderer(type: ChartType): ChartRenderer {
  return TYPE_BY_ID.get(type)?.renderer ?? 'apex'
}

export function isD3ChartType(type: ChartType): boolean {
  return getChartRenderer(type) === 'd3'
}

export function getChartZoneLabels(type: ChartType): ChartZoneLabels {
  return (TYPE_BY_ID.get(type) ?? CHART_TYPES[0]).zones
}

/**
 * Options with the chart type's defaults filled in under anything the user set.
 * Defaults are applied at read time, so switching types never leaves one type's
 * defaults behind on another.
 */
export function getEffectiveChartOptions(config: ChartConfig): NonNullable<ChartConfig['options']> {
  const defaults = TYPE_BY_ID.get(config.type)?.defaults ?? {}
  const options: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(config.options ?? {})) {
    if (value !== undefined)
      options[key] = value
  }
  return options as NonNullable<ChartConfig['options']>
}
