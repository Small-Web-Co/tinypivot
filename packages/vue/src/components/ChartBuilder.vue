<script setup lang="ts">
import type {
  ChartAggregation,
  ChartConfig,
  ChartFieldInfo,
  ChartSortOrder,
  ChartThemePreset,
  ChartType,
  ResolvedTheme,
} from '@smallwebco/tinypivot-core'
/**
 * TinyPivot - Chart Builder Component
 * Drag-and-drop chart configuration with ApexCharts rendering
 */
import type { ApexOptions } from 'apexcharts'
import {
  analyzeFieldsForChart,
  CHART_AGGREGATIONS,
  CHART_THEME_PRESETS,
  CHART_TYPES,
  createDefaultChartConfig,
  getChartGuidance,
  getChartThemeColors,
  isChartConfigValid,
  processChartData,
  processChartDataForHeatmap,
  processChartDataForPie,
  processChartDataForScatter,
  resolveChartSortOrder,
} from '@smallwebco/tinypivot-core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  data: Record<string, unknown>[]
  theme?: ResolvedTheme
  chartTheme?: ChartThemePreset
  fieldRoleOverrides?: Record<string, import('@smallwebco/tinypivot-core').FieldRole>
  initialConfig?: Partial<ChartConfig>
}>()

const emit = defineEmits<{
  (e: 'configChange', config: ChartConfig): void
  (e: 'chartThemeChange', preset: ChartThemePreset): void
}>()

const CHART_THEME_LIST = Object.entries(CHART_THEME_PRESETS) as Array<[ChartThemePreset, (typeof CHART_THEME_PRESETS)[ChartThemePreset]]>

const SORT_CYCLE: Array<{ value: ChartSortOrder, label: string, title: string }> = [
  { value: 'value-desc', label: '↓ Desc', title: 'Sorted highest to lowest value — click to switch to ascending' },
  { value: 'value-asc', label: '↑ Asc', title: 'Sorted lowest to highest value — click to switch to A–Z' },
  { value: 'label-asc', label: 'A–Z', title: 'Sorted alphabetically / chronologically — click to follow Data Grid sort' },
  { value: 'data', label: 'Grid', title: 'Following Data Grid sort order — click to switch to descending' },
]

// Lazy load ApexCharts only on client side to avoid SSR issues
const VueApexCharts = defineAsyncComponent(() =>
  import('vue3-apexcharts').then(m => m.default),
)

function mergeChartConfig(partial?: Partial<ChartConfig>): ChartConfig {
  const defaults = createDefaultChartConfig()
  if (!partial)
    return defaults
  return {
    ...defaults,
    ...partial,
    options: {
      ...defaults.options,
      ...(partial.options ?? {}),
    },
  }
}

// Chart configuration state
const chartConfig = ref<ChartConfig>(mergeChartConfig(props.initialConfig))
const localChartTheme = ref<ChartThemePreset>(props.chartTheme ?? props.initialConfig?.options?.chartTheme ?? 'code')

watch(() => props.initialConfig, (next) => {
  if (next) {
    chartConfig.value = mergeChartConfig(next)
  }
}, { deep: true })

watch(() => props.chartTheme, (next) => {
  if (next) {
    localChartTheme.value = next
  }
})

const activeChartTheme = computed<ChartThemePreset>(() => props.chartTheme ?? localChartTheme.value)

function selectChartTheme(preset: ChartThemePreset) {
  localChartTheme.value = preset
  chartConfig.value = {
    ...chartConfig.value,
    options: {
      ...chartConfig.value.options,
      chartTheme: preset,
    },
  }
  emit('configChange', chartConfig.value)
  emit('chartThemeChange', preset)
}

function selectSortOrder(nextOrder: ChartSortOrder) {
  chartConfig.value = {
    ...chartConfig.value,
    options: {
      ...chartConfig.value.options,
      sortOrder: nextOrder,
    },
  }
  emit('configChange', chartConfig.value)
}

// Field analysis (applies consumer overrides when provided)
const fieldInfos = computed(() => analyzeFieldsForChart(props.data, props.fieldRoleOverrides))

// Separate fields by role
const dimensions = computed(() => fieldInfos.value.filter(f => f.role === 'dimension' || f.role === 'temporal'))
const measures = computed(() => fieldInfos.value.filter(f => f.role === 'measure'))

// Drag state
const draggingField = ref<ChartFieldInfo | null>(null)
const dragOverZone = ref<string | null>(null)

// UI state
const showChartTypeSelector = ref(false)

// Current guidance message
const guidance = computed(() => getChartGuidance(chartConfig.value))

// Check if chart is ready to render
const chartIsValid = computed(() => isChartConfigValid(chartConfig.value))

// Get currently selected chart type info
const selectedChartType = computed(() =>
  CHART_TYPES.find(ct => ct.type === chartConfig.value.type),
)

// Dynamic zone labels based on chart type
const zoneLabels = computed(() => {
  const type = chartConfig.value.type
  switch (type) {
    case 'scatter':
    case 'bubble':
      return {
        xAxis: 'X-Axis (measure)',
        xAxisPlaceholder: 'Drop a measure',
        yAxis: 'Y-Axis (measure)',
        yAxisPlaceholder: 'Drop a measure',
        series: 'Color by (optional)',
        seriesPlaceholder: 'Group points by dimension',
        showSize: type === 'bubble',
        showSeries: true,
      }
    case 'heatmap':
      return {
        xAxis: 'X-Axis (dimension)',
        xAxisPlaceholder: 'Drop a dimension',
        yAxis: 'Y-Axis (dimension)',
        yAxisPlaceholder: 'Drop a dimension',
        series: 'Value / Intensity',
        seriesPlaceholder: 'Drop a measure for color intensity',
        showSize: false,
        showSeries: true,
      }
    case 'pie':
    case 'donut':
      return {
        xAxis: 'Slices (dimension)',
        xAxisPlaceholder: 'Drop a dimension',
        yAxis: 'Values (measure)',
        yAxisPlaceholder: 'Drop a measure',
        series: '',
        seriesPlaceholder: '',
        showSize: false,
        showSeries: false,
      }
    case 'radar':
      return {
        xAxis: 'Axes (dimension)',
        xAxisPlaceholder: 'Drop a dimension',
        yAxis: 'Values (measure)',
        yAxisPlaceholder: 'Drop a measure',
        series: 'Compare by (optional)',
        seriesPlaceholder: 'Group by dimension',
        showSize: false,
        showSeries: true,
      }
    case 'stackedBar':
      return {
        xAxis: 'X-Axis (dimension)',
        xAxisPlaceholder: 'Drop a dimension',
        yAxis: 'Y-Axis (measure)',
        yAxisPlaceholder: 'Drop a measure',
        series: 'Series (stacking field)',
        seriesPlaceholder: 'Drop a dimension to stack by',
        showSize: false,
        showSeries: true,
      }
    default: // bar, line, area
      return {
        xAxis: 'X-Axis (dimension)',
        xAxisPlaceholder: 'Drop a dimension',
        yAxis: 'Y-Axis (measure)',
        yAxisPlaceholder: 'Drop a measure',
        series: 'Color / Series (optional)',
        seriesPlaceholder: 'Group by dimension',
        showSize: false,
        showSeries: true,
      }
  }
})

// Check if scatter/bubble needs numeric fields
const isScatterType = computed(() => ['scatter', 'bubble'].includes(chartConfig.value.type))
const isHeatmapType = computed(() => chartConfig.value.type === 'heatmap')

// Drag handlers
function handleDragStart(field: ChartFieldInfo, event: DragEvent) {
  draggingField.value = field
  event.dataTransfer?.setData('text/plain', field.field)
}

function handleDragEnd() {
  draggingField.value = null
  dragOverZone.value = null
}

function handleDragOver(zone: string, event: DragEvent) {
  event.preventDefault()
  dragOverZone.value = zone
}

function handleDragLeave() {
  dragOverZone.value = null
}

function handleDrop(zone: string, event: DragEvent) {
  event.preventDefault()
  dragOverZone.value = null

  if (!draggingField.value)
    return

  const field = draggingField.value
  const chartField = {
    field: field.field,
    label: field.label,
    role: field.role,
    aggregation: field.role === 'measure' ? 'sum' as ChartAggregation : undefined,
  }

  switch (zone) {
    case 'xAxis':
      chartConfig.value = { ...chartConfig.value, xAxis: chartField }
      break
    case 'yAxis':
      chartConfig.value = { ...chartConfig.value, yAxis: chartField }
      break
    case 'series':
      chartConfig.value = { ...chartConfig.value, seriesField: chartField }
      break
    case 'size':
      chartConfig.value = { ...chartConfig.value, sizeField: chartField }
      break
    case 'color':
      chartConfig.value = { ...chartConfig.value, colorField: chartField }
      break
  }

  emit('configChange', chartConfig.value)
}

function removeField(zone: string) {
  switch (zone) {
    case 'xAxis':
      chartConfig.value = { ...chartConfig.value, xAxis: undefined }
      break
    case 'yAxis':
      chartConfig.value = { ...chartConfig.value, yAxis: undefined }
      break
    case 'series':
      chartConfig.value = { ...chartConfig.value, seriesField: undefined }
      break
    case 'size':
      chartConfig.value = { ...chartConfig.value, sizeField: undefined }
      break
    case 'color':
      chartConfig.value = { ...chartConfig.value, colorField: undefined }
      break
  }
  emit('configChange', chartConfig.value)
}

function selectChartType(type: ChartType) {
  chartConfig.value = { ...chartConfig.value, type }
  showChartTypeSelector.value = false
  emit('configChange', chartConfig.value)
}

function updateAggregation(zone: string, aggregation: ChartAggregation) {
  let field
  switch (zone) {
    case 'xAxis':
      field = chartConfig.value.xAxis
      break
    case 'yAxis':
      field = chartConfig.value.yAxis
      break
    case 'size':
      field = chartConfig.value.sizeField
      break
    case 'color':
      field = chartConfig.value.colorField
      break
    default:
      return
  }
  if (!field)
    return

  const updated = { ...field, aggregation }
  switch (zone) {
    case 'xAxis':
      chartConfig.value = { ...chartConfig.value, xAxis: updated }
      break
    case 'yAxis':
      chartConfig.value = { ...chartConfig.value, yAxis: updated }
      break
    case 'size':
      chartConfig.value = { ...chartConfig.value, sizeField: updated }
      break
    case 'color':
      chartConfig.value = { ...chartConfig.value, colorField: updated }
      break
  }
  emit('configChange', chartConfig.value)
}

// Chart rendering
const chartOptions = computed<ApexOptions>(() => {
  const isDark = props.theme === 'dark' || (typeof props.theme === 'string' && props.theme.endsWith('-dark'))
  const config = chartConfig.value
  const options = config.options || {}

  const activePreset = activeChartTheme.value ?? options.chartTheme ?? 'code'
  const resolvedColors = options.colors && options.colors.length > 0
    ? options.colors
    : getChartThemeColors(activePreset)
  const monoFont = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
  const sansFont = 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif)'
  const mutedColor = isDark ? '#94a3b8' : '#64748b'
  const hairlineColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(100, 116, 139, 0.16)'
  const isLineOrArea = config.type === 'line' || config.type === 'area'
  const isBarLike = config.type === 'bar' || config.type === 'stackedBar'
  const isStacked = config.type === 'stackedBar' || (Boolean(options.stacked) && ['bar', 'area'].includes(config.type))
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const animationsEnabled = (options.animated ?? true) && !prefersReducedMotion

  const baseOptions: ApexOptions = {
    chart: {
      type: getApexChartType(config.type),
      stacked: isStacked,
      background: 'transparent',
      foreColor: isDark ? '#e2e8f0' : '#1e293b',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: options.enableZoom ?? false,
          zoomin: options.enableZoom ?? false,
          zoomout: options.enableZoom ?? false,
          pan: false,
          reset: options.enableZoom ?? false,
        },
        export: {
          csv: { filename: 'chart-data' },
          svg: { filename: 'chart' },
          png: { filename: 'chart' },
        },
      },
      animations: {
        enabled: animationsEnabled,
        speed: isLineOrArea ? 560 : isBarLike ? 520 : 480,
        animateGradually: {
          enabled: animationsEnabled,
          delay: isBarLike ? 48 : isLineOrArea ? 65 : 55,
        },
        dynamicAnimation: {
          enabled: animationsEnabled,
          speed: 320,
        },
      },
      dropShadow: isLineOrArea && isDark
        ? {
            enabled: true,
            top: 4,
            left: 0,
            blur: 8,
            opacity: 0.22,
            color: resolvedColors[0],
          }
        : { enabled: false },
      fontFamily: sansFont,
    },
    colors: resolvedColors,
    theme: {
      mode: isDark ? 'dark' : 'light',
    },
    grid: {
      show: options.showGrid ?? true,
      borderColor: hairlineColor,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 4, right: 12, bottom: 10, left: 6 },
    },
    legend: {
      show: options.showLegend ?? true,
      position: options.legendPosition || 'top',
      horizontalAlign: 'left',
      fontFamily: monoFont,
      fontSize: '11px',
      markers: {
        size: 5,
        shape: 'square',
        strokeWidth: 0,
        offsetX: -4,
      },
      itemMargin: { horizontal: 12, vertical: 4 },
    },
    dataLabels: {
      enabled: options.showDataLabels ?? false,
      style: {
        fontFamily: monoFont,
        fontSize: '11px',
        fontWeight: 500,
      },
      formatter: (val: unknown) => {
        if (isStacked && val === 0)
          return ''
        return formatValue(val, options.valueFormat, options.decimals)
      },
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      ...(isStacked ? { shared: true, intersect: false } : {}),
      style: {
        fontSize: '12px',
        fontFamily: monoFont,
      },
      cssClass: isDark ? '' : 'apexcharts-tooltip-light',
      marker: { show: true },
      y: {
        formatter: (val: number) => formatValue(val, options.valueFormat, options.decimals),
      },
    },
    markers: isLineOrArea
      ? {
          size: 3,
          strokeWidth: 2,
          strokeColors: isDark ? '#0f172a' : '#ffffff',
          hover: { size: 6 },
        }
      : { size: 0 },
    stroke: {
      curve: 'monotoneCubic',
      width: config.type === 'line' ? 2.5 : config.type === 'area' ? 2 : isBarLike ? 0 : 1.5,
      ...(config.type === 'pie' || config.type === 'donut'
        ? { colors: [isDark ? '#0f172a' : '#ffffff'] }
        : isBarLike
          ? { colors: ['transparent'] }
          : {}),
    },
    fill: config.type === 'area'
      ? {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: isDark ? 0.42 : 0.34,
            opacityTo: 0.02,
            stops: [0, 95, 100],
          },
        }
      : {
          opacity: isStacked ? 1 : isBarLike ? 0.92 : 1,
        },
    ...(isBarLike
      ? {
          plotOptions: {
            bar: {
              borderRadius: 4,
              borderRadiusApplication: 'end',
              borderRadiusWhenStacked: 'last',
              columnWidth: '54%',
            },
          },
        }
      : {}),
    states: {
      hover: {
        filter: { type: 'lighten' },
      },
    },
  }

  // Add axis titles with monospace tabular numerals
  if (config.xAxis) {
    baseOptions.xaxis = {
      ...baseOptions.xaxis,
      axisBorder: { show: true, color: hairlineColor },
      axisTicks: { show: false },
      title: {
        text: options.xAxisTitle || config.xAxis.label,
        style: {
          color: mutedColor,
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: monoFont,
        },
      },
      labels: {
        style: {
          colors: mutedColor,
          fontSize: '11px',
          fontFamily: monoFont,
        },
      },
    }
  }

  if (config.yAxis && !['pie', 'donut', 'radar'].includes(config.type)) {
    baseOptions.yaxis = {
      title: {
        text: options.yAxisTitle || config.yAxis.label,
        style: {
          color: mutedColor,
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: monoFont,
        },
      },
      labels: {
        style: {
          colors: mutedColor,
          fontSize: '11px',
          fontFamily: monoFont,
        },
        formatter: (val: number) => formatValue(val, options.valueFormat, options.decimals),
      },
    }
  }

  // Chart title
  if (options.title) {
    baseOptions.title = {
      text: options.title,
      align: 'left',
      margin: 8,
      style: {
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: sansFont,
        color: isDark ? '#f1f5f9' : '#0f172a',
      },
    }
  }

  // Pie/Donut specific
  if (config.type === 'pie' || config.type === 'donut') {
    baseOptions.plotOptions = {
      pie: {
        donut: {
          size: config.type === 'donut' ? '62%' : '0%',
          labels: {
            show: config.type === 'donut',
            value: { fontFamily: monoFont, fontWeight: 700 },
            total: {
              show: true,
              label: 'TOTAL',
              fontFamily: monoFont,
              fontSize: '11px',
              formatter: (w) => {
                const total = w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)
                return formatValue(total, options.valueFormat, options.decimals)
              },
            },
          },
        },
      },
    }
  }

  // Radar specific
  if (config.type === 'radar') {
    baseOptions.plotOptions = {
      radar: {
        polygons: {
          strokeColors: hairlineColor,
          fill: { colors: isDark ? ['rgba(30,41,59,0.45)', 'transparent'] : ['rgba(241,245,249,0.7)', 'transparent'] },
        },
      },
    }
  }

  return baseOptions
})

const processedChartData = computed(() => {
  const config = chartConfig.value
  if (!chartIsValid.value)
    return { categories: [] as string[], series: [] as ApexAxisChartSeries | ApexNonAxisChartSeries }

  if (config.type === 'pie' || config.type === 'donut') {
    const data = processChartDataForPie(props.data, config)
    return {
      categories: data.categories,
      series: data.series[0]?.data || [],
    }
  }

  if (config.type === 'scatter' || config.type === 'bubble') {
    const scatterData = processChartDataForScatter(props.data, config)
    return {
      categories: [] as string[],
      series: scatterData.series,
    }
  }

  if (config.type === 'heatmap') {
    const heatmapData = processChartDataForHeatmap(props.data, config)
    return {
      categories: [] as string[],
      series: heatmapData.series,
    }
  }

  // Standard charts (bar, stackedBar, line, area, radar)
  return processChartData(props.data, config)
})

const chartSeries = computed(() => processedChartData.value.series)
const chartLabels = computed(() => processedChartData.value.categories)

const activeSortOrder = computed<ChartSortOrder>(() => resolveChartSortOrder(chartConfig.value, chartLabels.value))
const activeSortMeta = computed(() => SORT_CYCLE.find(s => s.value === activeSortOrder.value) ?? SORT_CYCLE[0])

// Update xaxis categories in options
const chartOptionsWithCategories = computed<ApexOptions>(() => {
  const options = { ...chartOptions.value }
  const config = chartConfig.value

  // Heatmap, scatter, bubble have x values in data itself
  if (!['pie', 'donut', 'scatter', 'bubble', 'heatmap'].includes(config.type)) {
    options.xaxis = {
      ...options.xaxis,
      categories: chartLabels.value,
    }
  }

  if (config.type === 'pie' || config.type === 'donut') {
    options.labels = chartLabels.value
  }

  // Heatmap specific options
  if (config.type === 'heatmap') {
    options.chart = {
      ...options.chart,
      type: 'heatmap',
    }
    options.xaxis = {
      ...options.xaxis,
      type: 'category',
    }
    options.dataLabels = {
      enabled: true,
      style: {
        colors: ['#fff'],
        fontSize: '10px',
      },
      formatter: (val: unknown) => {
        if (val === null || val === undefined)
          return ''
        if (typeof val !== 'number')
          return String(val)
        if (val >= 1000000)
          return `${(val / 1000000).toFixed(1)}M`
        if (val >= 1000)
          return `${(val / 1000).toFixed(0)}K`
        return Math.round(val).toLocaleString()
      },
    }
    options.plotOptions = {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 2,
        enableShades: true,
        colorScale: {
          inverse: false,
        },
      },
    }
    // Use primary accent color from the active visual theme preset
    options.colors = [getChartThemeColors(activeChartTheme.value)[0]]
    // Disable legend for heatmap (color scale is self-explanatory)
    options.legend = { show: false }
  }

  return options
})

type ApexChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radar' | 'scatter' | 'heatmap' | 'bubble'

function getApexChartType(type: ChartType): ApexChartType {
  const mapping: Record<ChartType, ApexChartType> = {
    bar: 'bar',
    stackedBar: 'bar',
    line: 'line',
    area: 'area',
    pie: 'pie',
    donut: 'donut',
    radar: 'radar',
    scatter: 'scatter',
    bubble: 'bubble',
    heatmap: 'heatmap',
  }
  return mapping[type] || 'bar'
}

function formatValue(val: unknown, format?: string, decimals?: number): string {
  // Handle non-number values (ApexCharts sometimes passes strings or undefined)
  if (val === null || val === undefined)
    return ''
  if (typeof val !== 'number')
    return String(val)
  if (Number.isNaN(val))
    return ''

  const dec = decimals ?? 0
  if (format === 'percent') {
    return `${val.toFixed(dec)}%`
  }
  if (format === 'currency') {
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
  }
  if (Math.abs(val) >= 1000) {
    return val.toLocaleString(undefined, { maximumFractionDigits: dec })
  }
  return val.toFixed(dec)
}

// Icons for chart types (inline SVG paths)
function getChartIcon(type: ChartType): string {
  const icons: Record<ChartType, string> = {
    bar: 'M3 3v18h18V3H3zm4 14H5v-6h2v6zm4 0H9V7h2v10zm4 0h-2V9h2v8zm4 0h-2v-4h2v4z',
    stackedBar: 'M3 3v18h18V3H3zm4 14H5v-3h2v3zm0-4H5v-3h2v3zm4 4H9v-5h2v5zm0-6H9v-4h2v4zm4 6h-2v-3h2v3zm0-4h-2v-5h2v5zm4 4h-2v-2h2v2zm0-3h-2v-2h2v2z',
    line: 'M3.5 18.5l6-6 4 4 8-8M14.5 8.5h6v6',
    area: 'M3 17l6-6 4 4 8-8v10H3z',
    pie: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8v8l5.66 5.66C14.28 19.04 13.18 20 12 20z',
    donut: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
    scatter: 'M7 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    bubble: 'M7 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm5-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm5 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    heatmap: 'M3 3h4v4H3V3zm6 0h4v4H9V3zm6 0h4v4h-4V3zM3 9h4v4H3V9zm6 0h4v4H9V9zm6 0h4v4h-4V9zM3 15h4v4H3v-4zm6 0h4v4H9v-4zm6 0h4v4h-4v-4z',
    radar: 'M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4zm0 3.18l6 3v5.09c0 4.08-2.76 7.91-6 9.14V5.18z',
  }
  return icons[type] || icons.bar
}

// Watch for data changes
watch(() => props.data, () => {
  // Fields might have changed, could reset config if needed
}, { deep: true })

// Emit initial config
onMounted(() => {
  emit('configChange', chartConfig.value)
})
</script>

<template>
  <div class="vpg-chart-builder">
    <!-- Chart Type Selector -->
    <div class="vpg-chart-type-bar">
      <button
        v-for="ct in CHART_TYPES"
        :key="ct.type"
        class="vpg-chart-type-btn"
        :class="{ active: chartConfig.type === ct.type }"
        :title="ct.description"
        @click="selectChartType(ct.type)"
      >
        <svg class="vpg-icon" viewBox="0 0 24 24" fill="currentColor">
          <path :d="getChartIcon(ct.type)" />
        </svg>
        <span class="vpg-chart-type-label">{{ ct.label.replace(' Chart', '') }}</span>
      </button>

      <!-- Direct 1-click sort dropdown & theme palette controls -->
      <div class="vpg-chart-theme-strip" role="radiogroup" aria-label="Chart visual theme">
        <select
          class="vpg-chart-theme-swatch"
          aria-label="Sort chart bars"
          :title="activeSortMeta.title"
          :value="activeSortOrder"
          @change="selectSortOrder(($event.target as HTMLSelectElement).value as ChartSortOrder)"
        >
          <option v-for="opt in SORT_CYCLE" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <button
          v-for="[presetId, presetMeta] in CHART_THEME_LIST"
          :key="presetId"
          type="button"
          role="radio"
          :aria-checked="activeChartTheme === presetId"
          class="vpg-chart-theme-swatch"
          :class="{ active: activeChartTheme === presetId }"
          :title="`${presetMeta.label} — ${presetMeta.description}`"
          @click="selectChartTheme(presetId)"
        >
          <span class="vpg-chart-theme-dots" aria-hidden="true">
            <span class="vpg-chart-theme-dot" :style="{ backgroundColor: presetMeta.colors[0] }" />
            <span class="vpg-chart-theme-dot" :style="{ backgroundColor: presetMeta.colors[1] }" />
          </span>
          <span v-if="activeChartTheme === presetId" class="vpg-chart-theme-name">{{ presetMeta.label }}</span>
        </button>
      </div>
    </div>

    <div class="vpg-chart-builder-content">
      <!-- Field Lists -->
      <div class="vpg-chart-fields-panel">
        <div class="vpg-chart-fields-section">
          <h4 class="vpg-chart-fields-title">
            <svg class="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h10M4 18h6" />
            </svg>
            Dimensions
            <span class="vpg-chart-fields-hint">(text/date)</span>
          </h4>
          <div class="vpg-chart-fields-list">
            <div
              v-for="field in dimensions"
              :key="field.field"
              class="vpg-chart-field-chip vpg-field-dimension"
              draggable="true"
              @dragstart="handleDragStart(field, $event)"
              @dragend="handleDragEnd"
            >
              <span class="vpg-field-name">{{ field.label }}</span>
              <span class="vpg-field-type">{{ field.role === 'temporal' ? 'date' : 'text' }}</span>
            </div>
            <div v-if="dimensions.length === 0" class="vpg-chart-fields-empty">
              No dimension fields detected
            </div>
          </div>
        </div>

        <div class="vpg-chart-fields-section">
          <h4 class="vpg-chart-fields-title">
            <svg class="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 8v8M12 11v5M8 14v2M4 4v16h16" />
            </svg>
            Measures
            <span class="vpg-chart-fields-hint">(numbers)</span>
          </h4>
          <div class="vpg-chart-fields-list">
            <div
              v-for="field in measures"
              :key="field.field"
              class="vpg-chart-field-chip vpg-field-measure"
              draggable="true"
              @dragstart="handleDragStart(field, $event)"
              @dragend="handleDragEnd"
            >
              <span class="vpg-field-name">{{ field.label }}</span>
              <span class="vpg-field-type">#</span>
            </div>
            <div v-if="measures.length === 0" class="vpg-chart-fields-empty">
              No numeric fields detected
            </div>
          </div>
        </div>
      </div>

      <!-- Drop Zones -->
      <div class="vpg-chart-config-panel">
        <!-- X-Axis -->
        <div class="vpg-chart-drop-zone-wrapper">
          <label class="vpg-chart-zone-label">{{ zoneLabels.xAxis }}</label>
          <div
            class="vpg-chart-drop-zone"
            :class="{ 'drag-over': dragOverZone === 'xAxis', 'has-field': chartConfig.xAxis }"
            @dragover="handleDragOver('xAxis', $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop('xAxis', $event)"
          >
            <template v-if="chartConfig.xAxis">
              <span class="vpg-zone-field-name">{{ chartConfig.xAxis.label }}</span>
              <select
                v-if="isScatterType && chartConfig.xAxis.role === 'measure'"
                class="vpg-zone-aggregation"
                :value="chartConfig.xAxis.aggregation || 'sum'"
                @change="updateAggregation('xAxis', ($event.target as HTMLSelectElement).value as ChartAggregation)"
              >
                <option v-for="agg in CHART_AGGREGATIONS" :key="agg.value" :value="agg.value">
                  {{ agg.symbol }}
                </option>
              </select>
              <button class="vpg-zone-remove-btn" @click="removeField('xAxis')">
                <svg class="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="vpg-zone-placeholder">{{ zoneLabels.xAxisPlaceholder }}</span>
            </template>
          </div>
        </div>

        <!-- Y-Axis -->
        <div class="vpg-chart-drop-zone-wrapper">
          <label class="vpg-chart-zone-label">{{ zoneLabels.yAxis }}</label>
          <div
            class="vpg-chart-drop-zone"
            :class="{ 'drag-over': dragOverZone === 'yAxis', 'has-field': chartConfig.yAxis }"
            @dragover="handleDragOver('yAxis', $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop('yAxis', $event)"
          >
            <template v-if="chartConfig.yAxis">
              <span class="vpg-zone-field-name">{{ chartConfig.yAxis.label }}</span>
              <select
                v-if="chartConfig.yAxis.role === 'measure' && !isHeatmapType"
                class="vpg-zone-aggregation"
                :value="chartConfig.yAxis.aggregation || 'sum'"
                @change="updateAggregation('yAxis', ($event.target as HTMLSelectElement).value as ChartAggregation)"
              >
                <option v-for="agg in CHART_AGGREGATIONS" :key="agg.value" :value="agg.value">
                  {{ agg.symbol }}
                </option>
              </select>
              <button class="vpg-zone-remove-btn" @click="removeField('yAxis')">
                <svg class="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="vpg-zone-placeholder">{{ zoneLabels.yAxisPlaceholder }}</span>
            </template>
          </div>
        </div>

        <!-- Series / Color (conditional) -->
        <div v-if="zoneLabels.showSeries" class="vpg-chart-drop-zone-wrapper">
          <label class="vpg-chart-zone-label">{{ zoneLabels.series }}</label>
          <div
            class="vpg-chart-drop-zone vpg-zone-optional"
            :class="{ 'drag-over': dragOverZone === 'series', 'has-field': chartConfig.seriesField || (isHeatmapType && chartConfig.colorField) }"
            @dragover="handleDragOver(isHeatmapType ? 'color' : 'series', $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(isHeatmapType ? 'color' : 'series', $event)"
          >
            <template v-if="isHeatmapType ? chartConfig.colorField : chartConfig.seriesField">
              <span class="vpg-zone-field-name">{{ isHeatmapType ? chartConfig.colorField?.label : chartConfig.seriesField?.label }}</span>
              <select
                v-if="isHeatmapType && chartConfig.colorField?.role === 'measure'"
                class="vpg-zone-aggregation"
                :value="chartConfig.colorField?.aggregation || 'sum'"
                @change="updateAggregation('color', ($event.target as HTMLSelectElement).value as ChartAggregation)"
              >
                <option v-for="agg in CHART_AGGREGATIONS" :key="agg.value" :value="agg.value">
                  {{ agg.symbol }}
                </option>
              </select>
              <button class="vpg-zone-remove-btn" @click="removeField(isHeatmapType ? 'color' : 'series')">
                <svg class="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="vpg-zone-placeholder">{{ zoneLabels.seriesPlaceholder }}</span>
            </template>
          </div>
        </div>

        <!-- Size (for bubble charts) -->
        <div v-if="zoneLabels.showSize" class="vpg-chart-drop-zone-wrapper">
          <label class="vpg-chart-zone-label">Size (number)</label>
          <div
            class="vpg-chart-drop-zone vpg-zone-optional"
            :class="{ 'drag-over': dragOverZone === 'size', 'has-field': chartConfig.sizeField }"
            @dragover="handleDragOver('size', $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop('size', $event)"
          >
            <template v-if="chartConfig.sizeField">
              <span class="vpg-zone-field-name">{{ chartConfig.sizeField.label }}</span>
              <select
                v-if="chartConfig.sizeField.role === 'measure'"
                class="vpg-zone-aggregation"
                :value="chartConfig.sizeField.aggregation || 'sum'"
                @change="updateAggregation('size', ($event.target as HTMLSelectElement).value as ChartAggregation)"
              >
                <option v-for="agg in CHART_AGGREGATIONS" :key="agg.value" :value="agg.value">
                  {{ agg.symbol }}
                </option>
              </select>
              <button class="vpg-zone-remove-btn" @click="removeField('size')">
                <svg class="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="vpg-zone-placeholder">Drop a number for bubble size</span>
            </template>
          </div>
        </div>

        <!-- Guidance -->
        <div class="vpg-chart-guidance">
          <svg class="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>{{ guidance }}</span>
        </div>
      </div>

      <!-- Chart Preview -->
      <div class="vpg-chart-preview-panel">
        <div v-if="chartIsValid" class="vpg-chart-container">
          <Suspense>
            <VueApexCharts
              :key="`${chartConfig.type}-${Boolean(chartOptions.chart?.stacked)}-${props.theme ?? 'light'}-${activeChartTheme}-${JSON.stringify(chartConfig.xAxis)}-${JSON.stringify(chartConfig.yAxis)}-${JSON.stringify(chartConfig.seriesField)}`"
              :type="getApexChartType(chartConfig.type)"
              :options="chartOptionsWithCategories"
              :series="chartSeries"
              height="100%"
            />
            <template #fallback>
              <div class="vpg-chart-loading">
                <div class="vpg-chart-spinner" />
                <span>Loading chart...</span>
              </div>
            </template>
          </Suspense>
        </div>
        <div v-else class="vpg-chart-empty-state">
          <svg class="vpg-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path :d="getChartIcon(chartConfig.type)" />
          </svg>
          <h3>Build your chart</h3>
          <p>Drag fields from the left panel to configure your visualization</p>
          <div class="vpg-chart-hint">
            <strong>{{ selectedChartType?.label }}</strong>: {{ selectedChartType?.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
