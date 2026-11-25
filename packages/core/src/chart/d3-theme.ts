/**
 * Theme tokens for the D3-rendered charts. Built from the same `ChartLook`
 * (surface from the grid theme, style from the chart preset) and palette that
 * drive the ApexCharts types, so both renderers read as one system.
 */
import type { ChartLook, ChartPatternStyle } from '../theme'
import type { ChartThemePreset } from '../types'
import { getChartThemeColors } from './index'

export const CHART_FONT_MONO = 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace'
export const CHART_FONT_SANS = 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif)'
export const CHART_FONT_SERIF = '"Iowan Old Style", "Charter", "Source Serif Pro", Georgia, "Times New Roman", serif'

/** Print looks set headlines in a serif, like a newspaper graphic; screens keep their own face. */
const SERIF_DISPLAY_PRESETS: ReadonlySet<ChartThemePreset> = new Set(['paper', 'onebit'])

/** Presets whose labels are set in the monospace face, like their grids. */
const MONO_LABEL_PRESETS: ReadonlySet<ChartThemePreset> = new Set(['greenbar', 'onebit', 'crt-amber', 'crt-green'])

export interface D3ChartTheme {
  isDark: boolean
  /** Font for numbers and axis ticks */
  fontMono: string
  /** Font for category labels */
  fontLabel: string
  /** Font for the headline above the chart */
  fontDisplay: string
  ink: string
  muted: string
  title: string
  grid: string
  gridDash: number
  surface: string
  palette: string[]
  accent: string
  /** Five steps, light to strong, for sequential colour scales */
  sequential: string[]
  /** Fill for shapes with no data */
  noData: string
  /** Bullet bands, poor → good (strongest first, as in Few's design) */
  bands: [string, string, string]
  fillMode: ChartLook['fillMode']
  /** Pattern per series index from 1 (series 0 stays solid); empty unless `fillMode` is `'pattern'` */
  patternStyles: ChartPatternStyle[]
  markStroke: string
  markStrokeWidth: number
  radius: number
  curve: 'monotone' | 'step'
  lineWidth: number
  lineDashes: number[]
  areaOpacity: number
  glow: { blur: number, opacity: number } | null
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex))
    return null
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** Mix two hex colours: `t = 0` gives `from`, `t = 1` gives `to`. Non-hex input returns `to`. */
export function mixColor(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b)
    return to
  const clamped = Math.min(1, Math.max(0, t))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * clamped).toString(16).padStart(2, '0')).join('')}`
}

const SEQUENTIAL_STEPS = [0.14, 0.34, 0.55, 0.77, 1]

/**
 * Resolve D3 tokens for a chart. `colors` overrides the preset palette
 * (`ChartOptions.colors`), as it does for ApexCharts.
 */
export function getD3ChartTheme(look: ChartLook, preset: ChartThemePreset, colors?: string[]): D3ChartTheme {
  const palette = colors && colors.length > 0 ? colors : getChartThemeColors(preset)
  const accent = palette[0]
  const surface = look.surfaceColor
  const ink = look.foreColor
  return {
    isDark: look.isDark,
    fontMono: CHART_FONT_MONO,
    fontLabel: MONO_LABEL_PRESETS.has(preset) ? CHART_FONT_MONO : CHART_FONT_SANS,
    fontDisplay: SERIF_DISPLAY_PRESETS.has(preset) ? CHART_FONT_SERIF : MONO_LABEL_PRESETS.has(preset) ? CHART_FONT_MONO : CHART_FONT_SANS,
    ink,
    muted: look.mutedColor,
    title: look.titleColor,
    grid: look.hairlineColor,
    gridDash: look.gridDash,
    surface,
    palette,
    accent,
    sequential: SEQUENTIAL_STEPS.map(t => mixColor(surface, accent, t)),
    noData: mixColor(surface, ink, 0.08),
    bands: [mixColor(surface, ink, 0.22), mixColor(surface, ink, 0.13), mixColor(surface, ink, 0.06)],
    fillMode: look.fillMode,
    patternStyles: look.patternStyles,
    markStroke: look.markStrokeWidth > 0 ? ink : surface,
    markStrokeWidth: look.markStrokeWidth,
    radius: look.barRadius,
    curve: look.curve === 'stepline' ? 'step' : 'monotone',
    lineWidth: look.lineWidth,
    lineDashes: look.lineDashes,
    // A 1-bit look has no translucency: areas are solid ink or pattern.
    areaOpacity: look.fillMode === 'pattern' ? 1 : Math.min(0.6, look.areaOpacityFrom + 0.1),
    // Legacy dark looks glow on lines only; D3 marks are fills, so only the CRT bloom carries over.
    glow: look.glow && !look.glow.lineOnly ? { blur: look.glow.blur, opacity: look.glow.opacity } : null,
  }
}

/** Format a chart value the same way in every renderer. */
export function formatChartValue(val: unknown, format?: 'number' | 'percent' | 'currency', decimals?: number): string {
  if (val === null || val === undefined)
    return ''
  if (typeof val !== 'number')
    return String(val)
  if (Number.isNaN(val))
    return ''
  const dec = decimals ?? 0
  if (format === 'percent')
    return `${val.toFixed(dec)}%`
  if (format === 'currency')
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
  if (Math.abs(val) >= 1000)
    return val.toLocaleString(undefined, { maximumFractionDigits: dec })
  return val.toFixed(dec)
}

/** Compact value for tight labels: 1.2M, 34K, 950. */
export function formatCompactChartValue(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1e9)
    return `${(val / 1e9).toFixed(1)}B`
  if (abs >= 1e6)
    return `${(val / 1e6).toFixed(1)}M`
  if (abs >= 1e3)
    return `${(val / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}
