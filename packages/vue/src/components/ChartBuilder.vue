<script setup lang="ts">
import type {
  ChartAggregation,
  ChartConfig,
  ChartField,
  ChartFieldInfo,
  ChartMarkers,
  ChartSortOrder,
  ChartThemePreset,
  ChartType,
  ResolvedTheme,
} from '@smallwebco/tinypivot-core'
import type { D3ChartSpec } from '@smallwebco/tinypivot-core/d3'
/**
 * TinyPivot - Chart Builder Component
 * Drag-and-drop chart configuration with ApexCharts rendering
 */
import type { ApexOptions } from 'apexcharts'
import {
  analyzeFieldsForChart,
  CHART_AGGREGATIONS,
  CHART_MARKER_OPTIONS,
  CHART_THEME_PRESETS,
  CHART_TYPES,
  chartGlowApplies,
  chartMarkers,
  chartPatternFill,
  createDefaultChartConfig,
  formatChartValue,
  formatFieldLabel,
  getChartGuidance,
  getChartLook,
  getChartThemeColors,
  getChartTypeInfo,
  getChartZoneLabels,
  getD3ChartTheme,
  isChartConfigValid,
  isD3ChartType,
  processChartData,
  processChartDataForHeatmap,
  processChartDataForPie,
  processChartDataForScatter,
  resolveChartSortOrder,
  resolveChartTheme,
} from '@smallwebco/tinypivot-core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import D3Chart from './D3Chart.vue'

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

/** Pattern fills are assigned per series index; this covers any realistic series count. */
const MAX_PATTERNED_SERIES = 12

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

/** ChartConfig keys a drop zone can hold. */
type ZoneKey = 'xAxis' | 'yAxis' | 'seriesField' | 'colorField' | 'sizeField' | 'targetField'

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
// Null until a preset is chosen, so the default keeps following the grid theme.
const localChartTheme = ref<ChartThemePreset | null>(props.chartTheme ?? props.initialConfig?.options?.chartTheme ?? null)

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

const activeChartTheme = computed<ChartThemePreset>(() => resolveChartTheme(props.theme, props.chartTheme ?? localChartTheme.value))

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

function updateChartOptions(patch: Partial<NonNullable<ChartConfig['options']>>) {
  chartConfig.value = {
    ...chartConfig.value,
    options: { ...chartConfig.value.options, ...patch },
  }
  emit('configChange', chartConfig.value)
}

function selectSortOrder(sortOrder: ChartSortOrder) {
  updateChartOptions({ sortOrder })
}

// Field analysis (applies consumer overrides when provided)
const fieldInfos = computed(() => analyzeFieldsForChart(props.data, props.fieldRoleOverrides))

// Separate fields by role
const dimensions = computed(() => fieldInfos.value.filter(f => f.role === 'dimension' || f.role === 'temporal'))
const measures = computed(() => fieldInfos.value.filter(f => f.role === 'measure'))

// Drag state
const draggingField = ref<ChartFieldInfo | null>(null)
const dragOverZone = ref<ZoneKey | null>(null)

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

// Drop-zone labels and slots come from the chart type registry
const zoneLabels = computed(() => getChartZoneLabels(chartConfig.value.type))
const isScatterType = computed(() => chartConfig.value.type === 'scatter' || chartConfig.value.type === 'bubble')
const isD3Type = computed(() => isD3ChartType(chartConfig.value.type))

// X and Y always; then the type's optional grouping and numeric zones
const dropZones = computed(() => {
  const labels = zoneLabels.value
  const zones: Array<{ key: ZoneKey, label: string, placeholder: string, optional: boolean, showAggregation: boolean }> = [
    { key: 'xAxis', label: labels.xAxis, placeholder: labels.xAxisPlaceholder, optional: false, showAggregation: isScatterType.value },
    { key: 'yAxis', label: labels.yAxis, placeholder: labels.yAxisPlaceholder, optional: false, showAggregation: chartConfig.value.type !== 'heatmap' },
  ]
  if (labels.extra)
    zones.push({ key: labels.extra.slot, label: labels.extra.label, placeholder: labels.extra.placeholder, optional: true, showAggregation: labels.extra.slot === 'colorField' })
  if (labels.size)
    zones.push({ key: labels.size.slot, label: labels.size.label, placeholder: labels.size.placeholder, optional: true, showAggregation: true })
  return zones
})

// Drag handlers
function handleDragStart(field: ChartFieldInfo, event: DragEvent) {
  draggingField.value = field
  event.dataTransfer?.setData('text/plain', field.field)
}

function handleDragEnd() {
  draggingField.value = null
  dragOverZone.value = null
}

function handleDragOver(zone: ZoneKey, event: DragEvent) {
  event.preventDefault()
  dragOverZone.value = zone
}

function handleDragLeave() {
  dragOverZone.value = null
}

function handleDrop(zone: ZoneKey, event: DragEvent) {
  event.preventDefault()
  dragOverZone.value = null

  if (!draggingField.value)
    return

  const field = draggingField.value
  const chartField: ChartField = {
    field: field.field,
    label: field.label,
    role: field.role,
    aggregation: field.role === 'measure' ? 'sum' as ChartAggregation : undefined,
  }
  chartConfig.value = { ...chartConfig.value, [zone]: chartField }
  emit('configChange', chartConfig.value)
}

function removeField(zone: ZoneKey) {
  chartConfig.value = { ...chartConfig.value, [zone]: undefined }
  emit('configChange', chartConfig.value)
}

function selectChartType(type: ChartType) {
  chartConfig.value = { ...chartConfig.value, type }
  showChartTypeSelector.value = false
  emit('configChange', chartConfig.value)
}

function updateAggregation(zone: ZoneKey, aggregation: ChartAggregation) {
  const field = chartConfig.value[zone]
  if (!field)
    return
  chartConfig.value = { ...chartConfig.value, [zone]: { ...field, aggregation } }
  emit('configChange', chartConfig.value)
}

// Chart rendering
const chartOptions = computed<ApexOptions>(() => {
  const config = chartConfig.value
  const options = config.options || {}

  const activePreset = activeChartTheme.value ?? options.chartTheme ?? 'code'
  const resolvedColors = options.colors && options.colors.length > 0
    ? options.colors
    : getChartThemeColors(activePreset)
  const monoFont = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
  const sansFont = 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif)'
  // Surface colours follow the grid theme; fills, radii, curves and glow follow the chart preset.
  const look = getChartLook(props.theme, activePreset)
  const isDark = look.isDark
  const mutedColor = look.mutedColor
  const hairlineColor = look.hairlineColor
  const patternFill = chartPatternFill(look, MAX_PATTERNED_SERIES)
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
      foreColor: look.foreColor,
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
      dropShadow: look.glow && chartGlowApplies(look, config.type)
        ? {
            enabled: true,
            top: look.glow.lineOnly ? 4 : 0,
            left: 0,
            blur: look.glow.blur,
            opacity: look.glow.opacity,
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
      strokeDashArray: look.gridDash,
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
        return formatChartValue(val, options.valueFormat, options.decimals)
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
        formatter: (val: number) => formatChartValue(val, options.valueFormat, options.decimals),
      },
    },
    stroke: {
      curve: look.curve,
      width: config.type === 'line' ? look.lineWidth : config.type === 'area' ? 2 : isBarLike ? look.markStrokeWidth : 1.5,
      ...(config.type === 'pie' || config.type === 'donut'
        ? { colors: [look.surfaceColor] }
        : isBarLike
          ? { colors: [look.markStrokeWidth > 0 ? look.foreColor : 'transparent'] }
          : {}),
      ...(isLineOrArea && look.lineDashes.length > 0 ? { dashArray: look.lineDashes } : {}),
    },
    fill: patternFill && config.type !== 'line'
      ? {
          type: patternFill.types,
          opacity: 1,
          pattern: { style: patternFill.styles, width: 6, height: 6, strokeWidth: 2 },
        }
      : config.type === 'area'
        ? {
            type: 'gradient',
            gradient: {
              shadeIntensity: 1,
              opacityFrom: look.areaOpacityFrom,
              opacityTo: 0.02,
              stops: [0, 95, 100],
            },
          }
        : {
            opacity: isStacked ? 1 : isBarLike ? look.barOpacity : 1,
          },
    ...(isBarLike
      ? {
          plotOptions: {
            bar: {
              borderRadius: look.barRadius,
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
        formatter: (val: number) => formatChartValue(val, options.valueFormat, options.decimals),
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
        color: look.titleColor,
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
                return formatChartValue(total, options.valueFormat, options.decimals)
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
          fill: { colors: look.radarFill },
        },
      },
    }
  }

  return baseOptions
})

const processedChartData = computed(() => {
  const config = chartConfig.value
  // D3 types shape their own data inside the lazy renderer
  if (!chartIsValid.value || isD3Type.value)
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

const d3Spec = computed<D3ChartSpec | null>(() => {
  if (!isD3Type.value)
    return null
  const look = getChartLook(props.theme, activeChartTheme.value)
  return {
    config: chartConfig.value,
    data: props.data,
    theme: getD3ChartTheme(look, activeChartTheme.value, chartConfig.value.options?.colors),
    animate: chartConfig.value.options?.animated ?? true,
  }
})

const chartSeries = computed(() => processedChartData.value.series)
const chartLabels = computed(() => processedChartData.value.categories)

const activeSortOrder = computed<ChartSortOrder>(() => resolveChartSortOrder(chartConfig.value, chartLabels.value))
const activeSortMeta = computed(() => SORT_CYCLE.find(s => s.value === activeSortOrder.value) ?? SORT_CYCLE[0])

// Update xaxis categories in options
const chartOptionsWithCategories = computed<ApexOptions>(() => {
  const options = { ...chartOptions.value }
  const config = chartConfig.value
  options.markers = chartMarkers(config.type, chartLabels.value.length, config.options?.markers, getChartLook(props.theme, activeChartTheme.value).surfaceColor)

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

function getApexChartType(type: ChartType) {
  return getChartTypeInfo(type)?.apexType ?? 'bar'
}

/** Configs from the MCP server carry field names only; show a readable label either way. */
function zoneFieldLabel(field?: ChartField): string {
  return field ? field.label || formatFieldLabel(field.field) : ''
}

function getChartIcon(type: ChartType): string {
  return (getChartTypeInfo(type) ?? CHART_TYPES[0]).icon
}

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
        <select
          v-if="chartConfig.type === 'line' || chartConfig.type === 'area'"
          class="vpg-chart-theme-swatch"
          aria-label="Points on the line"
          :value="chartConfig.options?.markers ?? 'auto'"
          @change="updateChartOptions({ markers: ($event.target as HTMLSelectElement).value as ChartMarkers })"
        >
          <option v-for="opt in CHART_MARKER_OPTIONS" :key="opt.value" :value="opt.value">
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
        <div v-for="zone in dropZones" :key="zone.key" class="vpg-chart-drop-zone-wrapper">
          <label class="vpg-chart-zone-label">{{ zone.label }}</label>
          <div
            class="vpg-chart-drop-zone"
            :class="{ 'vpg-zone-optional': zone.optional, 'drag-over': dragOverZone === zone.key, 'has-field': chartConfig[zone.key] }"
            @dragover="handleDragOver(zone.key, $event)"
            @dragleave="handleDragLeave"
            @drop="handleDrop(zone.key, $event)"
          >
            <template v-if="chartConfig[zone.key]">
              <span class="vpg-zone-field-name">{{ zoneFieldLabel(chartConfig[zone.key]) }}</span>
              <select
                v-if="zone.showAggregation && chartConfig[zone.key]?.role === 'measure'"
                class="vpg-zone-aggregation"
                :value="chartConfig[zone.key]?.aggregation || 'sum'"
                @change="updateAggregation(zone.key, ($event.target as HTMLSelectElement).value as ChartAggregation)"
              >
                <option v-for="agg in CHART_AGGREGATIONS" :key="agg.value" :value="agg.value">
                  {{ agg.symbol }}
                </option>
              </select>
              <button class="vpg-zone-remove-btn" :aria-label="`Remove ${zone.label}`" @click="removeField(zone.key)">
                <svg class="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </template>
            <template v-else>
              <span class="vpg-zone-placeholder">{{ zone.placeholder }}</span>
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
          <D3Chart v-if="d3Spec" :spec="d3Spec" />
          <Suspense v-else>
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
