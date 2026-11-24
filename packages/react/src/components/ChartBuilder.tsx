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
 * TinyPivot React - Chart Builder Component
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
} from '@smallwebco/tinypivot-core'
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

const CHART_THEME_LIST = Object.entries(CHART_THEME_PRESETS) as Array<[ChartThemePreset, (typeof CHART_THEME_PRESETS)[ChartThemePreset]]>

const SORT_CYCLE: Array<{ value: ChartSortOrder, label: string, title: string }> = [
  { value: 'value-desc', label: '↓ Desc', title: 'Sorted highest to lowest value — click to switch to ascending' },
  { value: 'value-asc', label: '↑ Asc', title: 'Sorted lowest to highest value — click to switch to A–Z' },
  { value: 'label-asc', label: 'A–Z', title: 'Sorted alphabetically / chronologically — click to follow Data Grid sort' },
  { value: 'data', label: 'Grid', title: 'Following Data Grid sort order — click to switch to descending' },
]

// Lazy load ApexCharts to avoid SSR issues (window not defined in Node.js)
const Chart = React.lazy(() => import('react-apexcharts'))

interface ChartBuilderProps {
  data: Record<string, unknown>[]
  theme?: ResolvedTheme
  chartTheme?: ChartThemePreset
  fieldRoleOverrides?: Record<string, import('@smallwebco/tinypivot-core').FieldRole>
  initialConfig?: Partial<ChartConfig>
  onConfigChange?: (config: ChartConfig) => void
  onChartThemeChange?: (preset: ChartThemePreset) => void
}

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

export function ChartBuilder({
  data,
  theme = 'light',
  chartTheme,
  fieldRoleOverrides,
  initialConfig,
  onConfigChange,
  onChartThemeChange,
}: ChartBuilderProps) {
  // Chart configuration state
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => mergeChartConfig(initialConfig))
  const [localChartTheme, setLocalChartTheme] = useState<ChartThemePreset>(
    () => chartTheme ?? initialConfig?.options?.chartTheme ?? 'code',
  )

  useEffect(() => {
    if (initialConfig) {
      setChartConfig(mergeChartConfig(initialConfig))
    }
  }, [initialConfig])

  useEffect(() => {
    if (chartTheme) {
      setLocalChartTheme(chartTheme)
    }
  }, [chartTheme])

  const activeChartTheme: ChartThemePreset = chartTheme ?? localChartTheme

  const selectChartTheme = useCallback((preset: ChartThemePreset) => {
    setLocalChartTheme(preset)
    setChartConfig((prev) => {
      const next: ChartConfig = {
        ...prev,
        options: {
          ...prev.options,
          chartTheme: preset,
        },
      }
      onConfigChange?.(next)
      return next
    })
    onChartThemeChange?.(preset)
  }, [onChartThemeChange, onConfigChange])

  const activeSortOrder: ChartSortOrder = chartConfig.options?.sortOrder ?? 'value-desc'
  const activeSortMeta = SORT_CYCLE.find(s => s.value === activeSortOrder) ?? SORT_CYCLE[0]

  // Drag state
  const [draggingField, setDraggingField] = useState<ChartFieldInfo | null>(null)
  const [dragOverZone, setDragOverZone] = useState<string | null>(null)

  // Field analysis (applies consumer overrides when provided)
  const fieldInfos = useMemo(() => analyzeFieldsForChart(data, fieldRoleOverrides), [data, fieldRoleOverrides])

  // Separate fields by role
  const dimensions = useMemo(
    () => fieldInfos.filter(f => f.role === 'dimension' || f.role === 'temporal'),
    [fieldInfos],
  )
  const measures = useMemo(
    () => fieldInfos.filter(f => f.role === 'measure'),
    [fieldInfos],
  )

  // Current guidance message
  const guidance = useMemo(() => getChartGuidance(chartConfig), [chartConfig])

  // Check if chart is ready to render
  const chartIsValid = useMemo(() => isChartConfigValid(chartConfig), [chartConfig])

  // Get currently selected chart type info
  const selectedChartType = useMemo(
    () => CHART_TYPES.find(ct => ct.type === chartConfig.type),
    [chartConfig.type],
  )

  // Check if scatter/bubble needs numeric fields
  const isScatterType = useMemo(
    () => ['scatter', 'bubble'].includes(chartConfig.type),
    [chartConfig.type],
  )
  const isHeatmapType = useMemo(
    () => chartConfig.type === 'heatmap',
    [chartConfig.type],
  )

  // Dynamic zone labels based on chart type
  const zoneLabels = useMemo(() => {
    const type = chartConfig.type
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
  }, [chartConfig.type])

  // Drag handlers
  const handleDragStart = useCallback((field: ChartFieldInfo, event: React.DragEvent) => {
    setDraggingField(field)
    event.dataTransfer?.setData('text/plain', field.field)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingField(null)
    setDragOverZone(null)
  }, [])

  const handleDragOver = useCallback((zone: string, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverZone(zone)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverZone(null)
  }, [])

  const handleDrop = useCallback((zone: string, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverZone(null)

    if (!draggingField)
      return

    const field = draggingField
    const chartField = {
      field: field.field,
      label: field.label,
      role: field.role,
      aggregation: field.role === 'measure' ? 'sum' as ChartAggregation : undefined,
    }

    let newConfig = { ...chartConfig }
    switch (zone) {
      case 'xAxis':
        newConfig = { ...newConfig, xAxis: chartField }
        break
      case 'yAxis':
        newConfig = { ...newConfig, yAxis: chartField }
        break
      case 'series':
        newConfig = { ...newConfig, seriesField: chartField }
        break
      case 'size':
        newConfig = { ...newConfig, sizeField: chartField }
        break
      case 'color':
        newConfig = { ...newConfig, colorField: chartField }
        break
    }

    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, draggingField, onConfigChange])

  const removeField = useCallback((zone: string) => {
    let newConfig = { ...chartConfig }
    switch (zone) {
      case 'xAxis':
        newConfig = { ...newConfig, xAxis: undefined }
        break
      case 'yAxis':
        newConfig = { ...newConfig, yAxis: undefined }
        break
      case 'series':
        newConfig = { ...newConfig, seriesField: undefined }
        break
      case 'size':
        newConfig = { ...newConfig, sizeField: undefined }
        break
      case 'color':
        newConfig = { ...newConfig, colorField: undefined }
        break
    }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  const selectChartType = useCallback((type: ChartType) => {
    const newConfig = { ...chartConfig, type }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  const updateAggregation = useCallback((zone: string, aggregation: ChartAggregation) => {
    let field
    switch (zone) {
      case 'xAxis':
        field = chartConfig.xAxis
        break
      case 'yAxis':
        field = chartConfig.yAxis
        break
      case 'size':
        field = chartConfig.sizeField
        break
      case 'color':
        field = chartConfig.colorField
        break
      default:
        return
    }
    if (!field)
      return

    const updated = { ...field, aggregation }
    let newConfig = { ...chartConfig }
    switch (zone) {
      case 'xAxis':
        newConfig = { ...newConfig, xAxis: updated }
        break
      case 'yAxis':
        newConfig = { ...newConfig, yAxis: updated }
        break
      case 'size':
        newConfig = { ...newConfig, sizeField: updated }
        break
      case 'color':
        newConfig = { ...newConfig, colorField: updated }
        break
    }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  // Chart rendering helpers
  type ApexChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radar' | 'scatter' | 'heatmap' | 'bubble'

  const getApexChartType = useCallback((type: ChartType): ApexChartType => {
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
  }, [])

  const formatValue = useCallback((val: unknown, format?: string, decimals?: number): string => {
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
  }, [])

  // Chart options — high-craft code-style defaults (monospace numerals, subtle dashed hairlines, crisp geometry)
  const chartOptions = useMemo<ApexOptions>(() => {
    const isDark = theme === 'dark' || (typeof theme === 'string' && theme.endsWith('-dark'))
    const config = chartConfig
    const options = config.options || {}
    const activePreset = activeChartTheme ?? options.chartTheme ?? 'code'
    const resolvedColors = options.colors && options.colors.length > 0
      ? options.colors
      : getChartThemeColors(activePreset)
    const monoFont = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
    const sansFont = 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif)'
    const mutedColor = isDark ? '#94a3b8' : '#64748b'
    const hairlineColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(100, 116, 139, 0.16)'
    const isLineOrArea = config.type === 'line' || config.type === 'area'
    const isBarLike = config.type === 'bar' || config.type === 'stackedBar'
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const animationsEnabled = (options.animated ?? true) && !prefersReducedMotion

    const baseOptions: ApexOptions = {
      chart: {
        type: getApexChartType(config.type),
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
        },
        itemMargin: { horizontal: 10, vertical: 4 },
      },
      dataLabels: {
        enabled: options.showDataLabels ?? false,
        style: {
          fontFamily: monoFont,
          fontSize: '11px',
          fontWeight: 500,
        },
      },
      tooltip: {
        theme: isDark ? 'dark' : 'light',
        style: {
          fontSize: '12px',
          fontFamily: monoFont,
        },
        marker: { show: true },
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
            opacity: isBarLike ? 0.92 : 1,
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
          fontWeight: '600',
          fontFamily: sansFont,
          color: isDark ? '#f1f5f9' : '#0f172a',
        },
      }
    }

    // Stacking — forced on for stackedBar, optional for bar/area
    if (config.type === 'stackedBar' || (options.stacked && ['bar', 'area'].includes(config.type))) {
      baseOptions.chart!.stacked = true
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
  }, [chartConfig, theme, activeChartTheme, getApexChartType, formatValue])

  const chartSeries = useMemo(() => {
    const config = chartConfig

    if (!chartIsValid)
      return []

    // Process based on chart type
    if (config.type === 'pie' || config.type === 'donut') {
      const chartData = processChartDataForPie(data, config)
      return chartData.series[0]?.data || []
    }

    if (config.type === 'scatter' || config.type === 'bubble') {
      const scatterData = processChartDataForScatter(data, config)
      return scatterData.series
    }

    if (config.type === 'heatmap') {
      const heatmapData = processChartDataForHeatmap(data, config)
      return heatmapData.series
    }

    // Standard charts (bar, line, area, etc.)
    const chartData = processChartData(data, config)
    return chartData.series
  }, [data, chartConfig, chartIsValid])

  const chartLabels = useMemo(() => {
    const config = chartConfig

    if (!chartIsValid)
      return []

    if (config.type === 'pie' || config.type === 'donut') {
      const chartData = processChartDataForPie(data, config)
      return chartData.categories
    }

    const chartData = processChartData(data, config)
    return chartData.categories
  }, [data, chartConfig, chartIsValid])

  // Update xaxis categories in options
  const chartOptionsWithCategories = useMemo<ApexOptions>(() => {
    const options = { ...chartOptions }
    const config = chartConfig

    // Heatmap, scatter, bubble have x values in data itself
    if (!['pie', 'donut', 'scatter', 'bubble', 'heatmap'].includes(config.type)) {
      options.xaxis = {
        ...options.xaxis,
        categories: chartLabels,
      }
    }

    if (config.type === 'pie' || config.type === 'donut') {
      options.labels = chartLabels
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
      options.colors = [getChartThemeColors(activeChartTheme)[0]]
      // Disable legend for heatmap (color scale is self-explanatory)
      options.legend = { show: false }
    }

    return options
  }, [chartOptions, chartConfig, chartLabels, activeChartTheme])

  // Icons for chart types (inline SVG paths)
  const getChartIcon = useCallback((type: ChartType): string => {
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
  }, [])

  // Emit initial config on mount
  useEffect(() => {
    onConfigChange?.(chartConfig)
    // Only run on mount - intentionally not including dependencies
  }, [])

  return (
    <div className="vpg-chart-builder">
      {/* Chart Type Selector */}
      <div className="vpg-chart-type-bar">
        {CHART_TYPES.map(ct => (
          <button
            key={ct.type}
            className={`vpg-chart-type-btn ${chartConfig.type === ct.type ? 'active' : ''}`}
            title={ct.description}
            onClick={() => selectChartType(ct.type)}
          >
            <svg className="vpg-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d={getChartIcon(ct.type)} />
            </svg>
            <span className="vpg-chart-type-label">{ct.label.replace(' Chart', '')}</span>
          </button>
        ))}

        {/* Direct 1-click sort dropdown & theme palette controls */}
        <div className="vpg-chart-theme-strip" role="radiogroup" aria-label="Chart visual theme">
          <select
            className="vpg-chart-theme-swatch"
            aria-label="Sort chart bars"
            title={activeSortMeta.title}
            value={activeSortOrder}
            onChange={(e) => {
              const nextOrder = e.target.value as ChartSortOrder
              setChartConfig((prev) => {
                const next: ChartConfig = { ...prev, options: { ...prev.options, sortOrder: nextOrder } }
                onConfigChange?.(next)
                return next
              })
            }}
          >
            {SORT_CYCLE.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {CHART_THEME_LIST.map(([presetId, presetMeta]) => {
            const isActive = activeChartTheme === presetId
            return (
              <button
                key={presetId}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`vpg-chart-theme-swatch ${isActive ? 'active' : ''}`}
                title={`${presetMeta.label} — ${presetMeta.description}`}
                onClick={() => selectChartTheme(presetId)}
              >
                <span className="vpg-chart-theme-dots" aria-hidden="true">
                  <span className="vpg-chart-theme-dot" style={{ backgroundColor: presetMeta.colors[0] }} />
                  <span className="vpg-chart-theme-dot" style={{ backgroundColor: presetMeta.colors[1] }} />
                </span>
                {isActive && <span className="vpg-chart-theme-name">{presetMeta.label}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="vpg-chart-builder-content">
        {/* Field Lists */}
        <div className="vpg-chart-fields-panel">
          <div className="vpg-chart-fields-section">
            <h4 className="vpg-chart-fields-title">
              <svg className="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h10M4 18h6" />
              </svg>
              Dimensions
              <span className="vpg-chart-fields-hint">(text/date)</span>
            </h4>
            <div className="vpg-chart-fields-list">
              {dimensions.map(field => (
                <div
                  key={field.field}
                  className="vpg-chart-field-chip vpg-field-dimension"
                  draggable
                  onDragStart={e => handleDragStart(field, e)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="vpg-field-name">{field.label}</span>
                  <span className="vpg-field-type">{field.role === 'temporal' ? 'date' : 'text'}</span>
                </div>
              ))}
              {dimensions.length === 0 && (
                <div className="vpg-chart-fields-empty">
                  No dimension fields detected
                </div>
              )}
            </div>
          </div>

          <div className="vpg-chart-fields-section">
            <h4 className="vpg-chart-fields-title">
              <svg className="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 8v8M12 11v5M8 14v2M4 4v16h16" />
              </svg>
              Measures
              <span className="vpg-chart-fields-hint">(numbers)</span>
            </h4>
            <div className="vpg-chart-fields-list">
              {measures.map(field => (
                <div
                  key={field.field}
                  className="vpg-chart-field-chip vpg-field-measure"
                  draggable
                  onDragStart={e => handleDragStart(field, e)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="vpg-field-name">{field.label}</span>
                  <span className="vpg-field-type">#</span>
                </div>
              ))}
              {measures.length === 0 && (
                <div className="vpg-chart-fields-empty">
                  No numeric fields detected
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drop Zones */}
        <div className="vpg-chart-config-panel">
          {/* X-Axis */}
          <div className="vpg-chart-drop-zone-wrapper">
            <label className="vpg-chart-zone-label">{zoneLabels.xAxis}</label>
            <div
              className={`vpg-chart-drop-zone ${dragOverZone === 'xAxis' ? 'drag-over' : ''} ${chartConfig.xAxis ? 'has-field' : ''}`}
              onDragOver={e => handleDragOver('xAxis', e)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop('xAxis', e)}
            >
              {chartConfig.xAxis
                ? (
                    <>
                      <span className="vpg-zone-field-name">{chartConfig.xAxis.label}</span>
                      {isScatterType && chartConfig.xAxis.role === 'measure' && (
                        <select
                          className="vpg-zone-aggregation"
                          value={chartConfig.xAxis.aggregation || 'sum'}
                          onChange={e => updateAggregation('xAxis', e.target.value as ChartAggregation)}
                        >
                          {CHART_AGGREGATIONS.map(agg => (
                            <option key={agg.value} value={agg.value}>
                              {agg.symbol}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="vpg-zone-remove-btn" onClick={() => removeField('xAxis')}>
                        <svg className="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )
                : (
                    <span className="vpg-zone-placeholder">{zoneLabels.xAxisPlaceholder}</span>
                  )}
            </div>
          </div>

          {/* Y-Axis */}
          <div className="vpg-chart-drop-zone-wrapper">
            <label className="vpg-chart-zone-label">{zoneLabels.yAxis}</label>
            <div
              className={`vpg-chart-drop-zone ${dragOverZone === 'yAxis' ? 'drag-over' : ''} ${chartConfig.yAxis ? 'has-field' : ''}`}
              onDragOver={e => handleDragOver('yAxis', e)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop('yAxis', e)}
            >
              {chartConfig.yAxis
                ? (
                    <>
                      <span className="vpg-zone-field-name">{chartConfig.yAxis.label}</span>
                      {chartConfig.yAxis.role === 'measure' && !isHeatmapType && (
                        <select
                          className="vpg-zone-aggregation"
                          value={chartConfig.yAxis.aggregation || 'sum'}
                          onChange={e => updateAggregation('yAxis', e.target.value as ChartAggregation)}
                        >
                          {CHART_AGGREGATIONS.map(agg => (
                            <option key={agg.value} value={agg.value}>
                              {agg.symbol}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="vpg-zone-remove-btn" onClick={() => removeField('yAxis')}>
                        <svg className="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )
                : (
                    <span className="vpg-zone-placeholder">{zoneLabels.yAxisPlaceholder}</span>
                  )}
            </div>
          </div>

          {/* Series / Color (conditional) */}
          {zoneLabels.showSeries && (
            <div className="vpg-chart-drop-zone-wrapper">
              <label className="vpg-chart-zone-label">{zoneLabels.series}</label>
              <div
                className={`vpg-chart-drop-zone vpg-zone-optional ${dragOverZone === 'series' ? 'drag-over' : ''} ${(isHeatmapType ? chartConfig.colorField : chartConfig.seriesField) ? 'has-field' : ''}`}
                onDragOver={e => handleDragOver(isHeatmapType ? 'color' : 'series', e)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(isHeatmapType ? 'color' : 'series', e)}
              >
                {(isHeatmapType ? chartConfig.colorField : chartConfig.seriesField)
                  ? (
                      <>
                        <span className="vpg-zone-field-name">
                          {isHeatmapType ? chartConfig.colorField?.label : chartConfig.seriesField?.label}
                        </span>
                        {isHeatmapType && chartConfig.colorField?.role === 'measure' && (
                          <select
                            className="vpg-zone-aggregation"
                            value={chartConfig.colorField?.aggregation || 'sum'}
                            onChange={e => updateAggregation('color', e.target.value as ChartAggregation)}
                          >
                            {CHART_AGGREGATIONS.map(agg => (
                              <option key={agg.value} value={agg.value}>
                                {agg.symbol}
                              </option>
                            ))}
                          </select>
                        )}
                        <button className="vpg-zone-remove-btn" onClick={() => removeField(isHeatmapType ? 'color' : 'series')}>
                          <svg className="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )
                  : (
                      <span className="vpg-zone-placeholder">{zoneLabels.seriesPlaceholder}</span>
                    )}
              </div>
            </div>
          )}

          {/* Size (for bubble charts) */}
          {zoneLabels.showSize && (
            <div className="vpg-chart-drop-zone-wrapper">
              <label className="vpg-chart-zone-label">Size (number)</label>
              <div
                className={`vpg-chart-drop-zone vpg-zone-optional ${dragOverZone === 'size' ? 'drag-over' : ''} ${chartConfig.sizeField ? 'has-field' : ''}`}
                onDragOver={e => handleDragOver('size', e)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop('size', e)}
              >
                {chartConfig.sizeField
                  ? (
                      <>
                        <span className="vpg-zone-field-name">{chartConfig.sizeField.label}</span>
                        {chartConfig.sizeField.role === 'measure' && (
                          <select
                            className="vpg-zone-aggregation"
                            value={chartConfig.sizeField.aggregation || 'sum'}
                            onChange={e => updateAggregation('size', e.target.value as ChartAggregation)}
                          >
                            {CHART_AGGREGATIONS.map(agg => (
                              <option key={agg.value} value={agg.value}>
                                {agg.symbol}
                              </option>
                            ))}
                          </select>
                        )}
                        <button className="vpg-zone-remove-btn" onClick={() => removeField('size')}>
                          <svg className="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )
                  : (
                      <span className="vpg-zone-placeholder">Drop a number for bubble size</span>
                    )}
              </div>
            </div>
          )}

          {/* Guidance */}
          <div className="vpg-chart-guidance">
            <svg className="vpg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>{guidance}</span>
          </div>
        </div>

        {/* Chart Preview */}
        <div className="vpg-chart-preview-panel">
          {chartIsValid
            ? (
                <div className="vpg-chart-container">
                  <Suspense fallback={(
                    <div className="vpg-chart-loading">
                      <div className="vpg-chart-spinner" />
                      <span>Loading chart...</span>
                    </div>
                  )}
                  >
                    <Chart
                      key={`${chartConfig.type}-${JSON.stringify(chartConfig.xAxis)}-${JSON.stringify(chartConfig.yAxis)}`}
                      type={getApexChartType(chartConfig.type)}
                      options={chartOptionsWithCategories}
                      series={chartSeries}
                      height="100%"
                    />
                  </Suspense>
                </div>
              )
            : (
                <div className="vpg-chart-empty-state">
                  <svg className="vpg-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d={getChartIcon(chartConfig.type)} />
                  </svg>
                  <h3>Build your chart</h3>
                  <p>Drag fields from the left panel to configure your visualization</p>
                  <div className="vpg-chart-hint">
                    <strong>{selectedChartType?.label}</strong>
                    :
                    {' '}
                    {selectedChartType?.description}
                  </div>
                </div>
              )}
        </div>
      </div>
    </div>
  )
}
