import type {
  ChartAggregation,
  ChartConfig,
  ChartField,
  ChartFieldInfo,
  ChartSortOrder,
  ChartThemePreset,
  ChartType,
  ResolvedTheme,
} from '@smallwebco/tinypivot-core'
import type { D3ChartSpec } from '@smallwebco/tinypivot-core/d3'
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
  chartGlowApplies,
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
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { D3Chart } from './D3Chart'

const CHART_THEME_LIST = Object.entries(CHART_THEME_PRESETS) as Array<[ChartThemePreset, (typeof CHART_THEME_PRESETS)[ChartThemePreset]]>

/** Pattern fills are assigned per series index; this covers any realistic series count. */
const MAX_PATTERNED_SERIES = 12

const SORT_CYCLE: Array<{ value: ChartSortOrder, label: string, title: string }> = [
  { value: 'value-desc', label: '↓ Desc', title: 'Sorted highest to lowest value — click to switch to ascending' },
  { value: 'value-asc', label: '↑ Asc', title: 'Sorted lowest to highest value — click to switch to A–Z' },
  { value: 'label-asc', label: 'A–Z', title: 'Sorted alphabetically / chronologically — click to follow Data Grid sort' },
  { value: 'data', label: 'Grid', title: 'Following Data Grid sort order — click to switch to descending' },
]

// Lazy load ApexCharts to avoid SSR issues (window not defined in Node.js)
const Chart = React.lazy(() => import('react-apexcharts'))

/** ChartConfig keys a drop zone can hold. */
type ZoneKey = 'xAxis' | 'yAxis' | 'seriesField' | 'colorField' | 'sizeField' | 'targetField'

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
  // Null until a preset is chosen, so the default keeps following the grid theme.
  const [localChartTheme, setLocalChartTheme] = useState<ChartThemePreset | null>(
    () => chartTheme ?? initialConfig?.options?.chartTheme ?? null,
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

  const activeChartTheme: ChartThemePreset = resolveChartTheme(theme, chartTheme ?? localChartTheme)

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

  // Drag state
  const [draggingField, setDraggingField] = useState<ChartFieldInfo | null>(null)
  const [dragOverZone, setDragOverZone] = useState<ZoneKey | null>(null)

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
  const isScatterType = chartConfig.type === 'scatter' || chartConfig.type === 'bubble'

  // Drop-zone labels and slots come from the chart type registry
  const zoneLabels = useMemo(() => getChartZoneLabels(chartConfig.type), [chartConfig.type])
  const isD3Type = isD3ChartType(chartConfig.type)

  // X and Y always; then the type's optional grouping and numeric zones
  const dropZones = useMemo(() => {
    const zones: Array<{ key: ZoneKey, label: string, placeholder: string, optional: boolean, showAggregation: boolean }> = [
      { key: 'xAxis', label: zoneLabels.xAxis, placeholder: zoneLabels.xAxisPlaceholder, optional: false, showAggregation: isScatterType },
      { key: 'yAxis', label: zoneLabels.yAxis, placeholder: zoneLabels.yAxisPlaceholder, optional: false, showAggregation: chartConfig.type !== 'heatmap' },
    ]
    if (zoneLabels.extra)
      zones.push({ key: zoneLabels.extra.slot, label: zoneLabels.extra.label, placeholder: zoneLabels.extra.placeholder, optional: true, showAggregation: zoneLabels.extra.slot === 'colorField' })
    if (zoneLabels.size)
      zones.push({ key: zoneLabels.size.slot, label: zoneLabels.size.label, placeholder: zoneLabels.size.placeholder, optional: true, showAggregation: true })
    return zones
  }, [zoneLabels, isScatterType, chartConfig.type])

  // Drag handlers
  const handleDragStart = useCallback((field: ChartFieldInfo, event: React.DragEvent) => {
    setDraggingField(field)
    event.dataTransfer?.setData('text/plain', field.field)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingField(null)
    setDragOverZone(null)
  }, [])

  const handleDragOver = useCallback((zone: ZoneKey, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverZone(zone)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverZone(null)
  }, [])

  const handleDrop = useCallback((zone: ZoneKey, event: React.DragEvent) => {
    event.preventDefault()
    setDragOverZone(null)

    if (!draggingField)
      return

    const field = draggingField
    const chartField: ChartField = {
      field: field.field,
      label: field.label,
      role: field.role,
      aggregation: field.role === 'measure' ? 'sum' as ChartAggregation : undefined,
    }
    const newConfig: ChartConfig = { ...chartConfig, [zone]: chartField }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, draggingField, onConfigChange])

  const removeField = useCallback((zone: ZoneKey) => {
    const newConfig: ChartConfig = { ...chartConfig, [zone]: undefined }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  const selectChartType = useCallback((type: ChartType) => {
    const newConfig = { ...chartConfig, type }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  const updateAggregation = useCallback((zone: ZoneKey, aggregation: ChartAggregation) => {
    const field = chartConfig[zone]
    if (!field)
      return
    const newConfig: ChartConfig = { ...chartConfig, [zone]: { ...field, aggregation } }
    setChartConfig(newConfig)
    onConfigChange?.(newConfig)
  }, [chartConfig, onConfigChange])

  // Chart options — high-craft code-style defaults (monospace numerals, subtle dashed hairlines, crisp geometry)
  const chartOptions = useMemo<ApexOptions>(() => {
    const config = chartConfig
    const options = config.options || {}
    const activePreset = activeChartTheme ?? options.chartTheme ?? 'code'
    const resolvedColors = options.colors && options.colors.length > 0
      ? options.colors
      : getChartThemeColors(activePreset)
    const monoFont = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
    const sansFont = 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif)'
    // Surface colours follow the grid theme; fills, radii, curves and glow follow the chart preset.
    const look = getChartLook(theme, activePreset)
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
      markers: isLineOrArea
        ? {
            size: 3,
            strokeWidth: 2,
            strokeColors: look.surfaceColor,
            hover: { size: 6 },
          }
        : { size: 0 },
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
          fontWeight: '600',
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
  }, [chartConfig, theme, activeChartTheme])

  const processedChartData = useMemo(() => {
    const config = chartConfig
    // D3 types shape their own data inside the lazy renderer
    if (!chartIsValid || isD3Type)
      return { categories: [] as string[], series: [] as ApexAxisChartSeries | ApexNonAxisChartSeries }

    if (config.type === 'pie' || config.type === 'donut') {
      const chartData = processChartDataForPie(data, config)
      return {
        categories: chartData.categories,
        series: chartData.series[0]?.data || [],
      }
    }

    if (config.type === 'scatter' || config.type === 'bubble') {
      const scatterData = processChartDataForScatter(data, config)
      return {
        categories: [] as string[],
        series: scatterData.series,
      }
    }

    if (config.type === 'heatmap') {
      const heatmapData = processChartDataForHeatmap(data, config)
      return {
        categories: [] as string[],
        series: heatmapData.series,
      }
    }

    // Standard charts (bar, stackedBar, line, area, radar)
    return processChartData(data, config)
  }, [data, chartConfig, chartIsValid, isD3Type])

  const d3Spec = useMemo<D3ChartSpec | null>(() => {
    if (!isD3Type)
      return null
    const look = getChartLook(theme, activeChartTheme)
    return {
      config: chartConfig,
      data,
      theme: getD3ChartTheme(look, activeChartTheme, chartConfig.options?.colors),
      animate: chartConfig.options?.animated ?? true,
    }
  }, [isD3Type, chartConfig, data, theme, activeChartTheme])

  const chartSeries = processedChartData.series
  const chartLabels = processedChartData.categories

  const activeSortOrder: ChartSortOrder = useMemo(
    () => resolveChartSortOrder(chartConfig, chartLabels),
    [chartConfig, chartLabels],
  )
  const activeSortMeta = SORT_CYCLE.find(s => s.value === activeSortOrder) ?? SORT_CYCLE[0]

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
          {dropZones.map(zone => (
            <div key={zone.key} className="vpg-chart-drop-zone-wrapper">
              <label className="vpg-chart-zone-label">{zone.label}</label>
              <div
                className={`vpg-chart-drop-zone ${zone.optional ? 'vpg-zone-optional' : ''} ${dragOverZone === zone.key ? 'drag-over' : ''} ${chartConfig[zone.key] ? 'has-field' : ''}`}
                onDragOver={e => handleDragOver(zone.key, e)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(zone.key, e)}
              >
                {chartConfig[zone.key]
                  ? (
                      <>
                        <span className="vpg-zone-field-name">{zoneFieldLabel(chartConfig[zone.key])}</span>
                        {zone.showAggregation && chartConfig[zone.key]?.role === 'measure' && (
                          <select
                            className="vpg-zone-aggregation"
                            value={chartConfig[zone.key]?.aggregation || 'sum'}
                            onChange={e => updateAggregation(zone.key, e.target.value as ChartAggregation)}
                          >
                            {CHART_AGGREGATIONS.map(agg => (
                              <option key={agg.value} value={agg.value}>
                                {agg.symbol}
                              </option>
                            ))}
                          </select>
                        )}
                        <button className="vpg-zone-remove-btn" aria-label={`Remove ${zone.label}`} onClick={() => removeField(zone.key)}>
                          <svg className="vpg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )
                  : (
                      <span className="vpg-zone-placeholder">{zone.placeholder}</span>
                    )}
              </div>
            </div>
          ))}

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
                  {d3Spec
                    ? <D3Chart spec={d3Spec} />
                    : (
                        <Suspense fallback={(
                          <div className="vpg-chart-loading">
                            <div className="vpg-chart-spinner" />
                            <span>Loading chart...</span>
                          </div>
                        )}
                        >
                          <Chart
                            key={`${chartConfig.type}-${Boolean(chartOptions.chart?.stacked)}-${theme}-${activeChartTheme}-${JSON.stringify(chartConfig.xAxis)}-${JSON.stringify(chartConfig.yAxis)}-${JSON.stringify(chartConfig.seriesField)}`}
                            type={getApexChartType(chartConfig.type)}
                            options={chartOptionsWithCategories}
                            series={chartSeries}
                            height="100%"
                          />
                        </Suspense>
                      )}
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
