/**
 * TinyPivot unified themes.
 *
 * A unified theme is one name that styles every surface together: the data grid
 * and pivot table (CSS tokens in themes.css), charts (colours plus the rendering
 * "look" below), the MCP widget and terminal output.
 *
 * Older themes are untouched: grid themes without a unified counterpart keep the
 * legacy chart look, and the original chart presets keep their colours.
 */
import type { ChartThemePreset, ChartType, ResolvedTheme, Theme } from '../types'

/** Themes that exist as both a grid `Theme` and a `ChartThemePreset`. */
export const UNIFIED_THEME_IDS = ['paper', 'greenbar', 'onebit', 'crt-amber', 'crt-green'] as const
export type UnifiedThemeId = typeof UNIFIED_THEME_IDS[number]

const UNIFIED_THEME_SET: ReadonlySet<string> = new Set(UNIFIED_THEME_IDS)
const DARK_UNIFIED_THEMES: ReadonlySet<string> = new Set<UnifiedThemeId>(['crt-amber', 'crt-green'])

export function isUnifiedTheme(value: unknown): value is UnifiedThemeId {
  return typeof value === 'string' && UNIFIED_THEME_SET.has(value)
}

/** Whether a grid theme renders on a dark surface. `'auto'` must be resolved by the caller first. */
export function isDarkTheme(theme: Theme | ResolvedTheme | undefined): boolean {
  if (!theme)
    return false
  return theme === 'dark' || theme.endsWith('-dark') || DARK_UNIFIED_THEMES.has(theme)
}

/**
 * Chart preset to use for a grid theme. An explicit preset always wins; a unified
 * grid theme brings its matching chart preset; every other theme keeps `'code'`.
 */
export function resolveChartTheme(
  gridTheme: Theme | ResolvedTheme | undefined,
  explicit?: ChartThemePreset | null,
): ChartThemePreset {
  if (explicit)
    return explicit
  return isUnifiedTheme(gridTheme) ? gridTheme : 'code'
}

/** How bars, pie slices and other filled marks are painted. */
export type ChartFillMode = 'solid' | 'pattern'

/** ApexCharts pattern names, cycled per series by the 1-bit look. */
export type ChartPatternStyle = 'verticalLines' | 'horizontalLines' | 'slantedLines' | 'squares' | 'circles'

export interface ChartGlow {
  blur: number
  opacity: number
}

/** Resolved rendering tokens for one chart. Framework components map these onto ApexCharts options. */
export interface ChartLook {
  isDark: boolean
  // Surface: follows the grid theme so the chart sits correctly on its background.
  foreColor: string
  mutedColor: string
  hairlineColor: string
  titleColor: string
  /** Colour behind the marks: marker rings and pie-slice separators. */
  surfaceColor: string
  radarFill: [string, string]
  // Style: follows the chart preset.
  fillMode: ChartFillMode
  /** Series index → fill type, for looks that keep the first series solid. Empty unless `fillMode` is `'pattern'`. */
  patternStyles: ChartPatternStyle[]
  barRadius: number
  barOpacity: number
  /** Outline drawn around filled marks (1-bit); `0` for none. */
  markStrokeWidth: number
  curve: 'monotoneCubic' | 'stepline'
  lineWidth: number
  /** Dash length per series so same-coloured lines stay distinguishable; empty for solid lines. */
  lineDashes: number[]
  areaOpacityFrom: number
  gridDash: number
  /** Soft bloom around marks (CRT looks). `lineOnly` reproduces the legacy dark-mode shadow. */
  glow: (ChartGlow & { lineOnly: boolean }) | null
}

interface ChartSurface {
  foreColor: string
  mutedColor: string
  hairlineColor: string
  titleColor: string
  surfaceColor: string
  radarFill: [string, string]
}

type ChartStyle = Omit<ChartLook, keyof ChartSurface | 'isDark'>

const LEGACY_SURFACE: Record<'light' | 'dark', ChartSurface> = {
  light: {
    foreColor: '#1e293b',
    mutedColor: '#64748b',
    hairlineColor: 'rgba(100, 116, 139, 0.16)',
    titleColor: '#0f172a',
    surfaceColor: '#ffffff',
    radarFill: ['rgba(241,245,249,0.7)', 'transparent'],
  },
  dark: {
    foreColor: '#e2e8f0',
    mutedColor: '#94a3b8',
    hairlineColor: 'rgba(148, 163, 184, 0.14)',
    titleColor: '#f1f5f9',
    surfaceColor: '#0f172a',
    radarFill: ['rgba(30,41,59,0.45)', 'transparent'],
  },
}

const UNIFIED_SURFACE: Record<UnifiedThemeId, ChartSurface> = {
  'paper': {
    foreColor: '#111111',
    mutedColor: '#7d776c',
    hairlineColor: 'rgba(17, 17, 17, 0.14)',
    titleColor: '#111111',
    surfaceColor: '#f4f0e6',
    radarFill: ['rgba(17,17,17,0.05)', 'transparent'],
  },
  'greenbar': {
    foreColor: '#17201a',
    mutedColor: '#6c7a70',
    hairlineColor: 'rgba(23, 32, 26, 0.16)',
    titleColor: '#17201a',
    surfaceColor: '#f6f3ea',
    radarFill: ['rgba(15,122,79,0.08)', 'transparent'],
  },
  'onebit': {
    foreColor: '#111111',
    mutedColor: '#4a463f',
    hairlineColor: 'rgba(17, 17, 17, 0.4)',
    titleColor: '#111111',
    surfaceColor: '#ece7dc',
    radarFill: ['transparent', 'transparent'],
  },
  'crt-amber': {
    foreColor: '#ffc457',
    mutedColor: '#a8771a',
    hairlineColor: 'rgba(255, 176, 0, 0.16)',
    titleColor: '#ffe2a6',
    surfaceColor: '#140e06',
    radarFill: ['rgba(255,176,0,0.08)', 'transparent'],
  },
  'crt-green': {
    foreColor: '#b7f5cf',
    mutedColor: '#4f9a70',
    hairlineColor: 'rgba(53, 214, 137, 0.16)',
    titleColor: '#d8ffe7',
    surfaceColor: '#07110b',
    radarFill: ['rgba(53,214,137,0.08)', 'transparent'],
  },
}

/** The look every chart had before unified themes. Must stay exactly as shipped. */
function legacyStyle(isDark: boolean): ChartStyle {
  return {
    fillMode: 'solid',
    patternStyles: [],
    barRadius: 4,
    barOpacity: 0.92,
    markStrokeWidth: 0,
    curve: 'monotoneCubic',
    lineWidth: 2.5,
    lineDashes: [],
    areaOpacityFrom: isDark ? 0.42 : 0.34,
    gridDash: 3,
    glow: isDark ? { blur: 8, opacity: 0.22, lineOnly: true } : null,
  }
}

/** Flat, square marks at full opacity: the shared base for the unified themes. */
const FLAT_STYLE: ChartStyle = {
  fillMode: 'solid',
  patternStyles: [],
  barRadius: 0,
  barOpacity: 1,
  markStrokeWidth: 0,
  curve: 'monotoneCubic',
  lineWidth: 2.75,
  lineDashes: [],
  areaOpacityFrom: 0.38,
  gridDash: 3,
  glow: null,
}

const CRT_STYLE: ChartStyle = {
  ...FLAT_STYLE,
  areaOpacityFrom: 0.5,
  gridDash: 2,
  glow: { blur: 10, opacity: 0.55, lineOnly: false },
}

const UNIFIED_STYLE: Record<UnifiedThemeId, ChartStyle> = {
  'paper': FLAT_STYLE,
  'greenbar': { ...FLAT_STYLE, gridDash: 2 },
  'onebit': {
    fillMode: 'pattern',
    // The first series stays solid ink; later series cycle through these.
    patternStyles: ['squares', 'horizontalLines', 'circles', 'slantedLines', 'verticalLines'],
    barRadius: 0,
    barOpacity: 1,
    markStrokeWidth: 1.5,
    curve: 'stepline',
    lineWidth: 2.5,
    lineDashes: [0, 6, 2, 10, 4],
    areaOpacityFrom: 1,
    gridDash: 1,
    glow: null,
  },
  'crt-amber': CRT_STYLE,
  'crt-green': CRT_STYLE,
}

/**
 * Rendering tokens for a chart. The surface half follows the grid theme; the
 * style half follows the chart preset (see `resolveChartTheme` for the default).
 */
export function getChartLook(
  gridTheme: Theme | ResolvedTheme | undefined,
  chartTheme: ChartThemePreset,
): ChartLook {
  const isDark = isDarkTheme(gridTheme)
  const surface = isUnifiedTheme(gridTheme) ? UNIFIED_SURFACE[gridTheme] : LEGACY_SURFACE[isDark ? 'dark' : 'light']
  const style = isUnifiedTheme(chartTheme) ? UNIFIED_STYLE[chartTheme] : legacyStyle(isDark)
  return { isDark, ...surface, ...style }
}

/** Whether the glow applies to this chart type under the given look. */
export function chartGlowApplies(look: ChartLook, type: ChartType): boolean {
  if (!look.glow)
    return false
  return look.glow.lineOnly ? type === 'line' || type === 'area' : true
}

/**
 * Per-series fill types for pattern looks: series 0 solid, the rest patterned.
 * Returns `null` when the look does not use patterns.
 */
export function chartPatternFill(look: ChartLook, seriesCount: number): { types: Array<'solid' | 'pattern'>, styles: ChartPatternStyle[] } | null {
  if (look.fillMode !== 'pattern' || look.patternStyles.length === 0)
    return null
  const count = Math.max(1, seriesCount)
  const types = Array.from({ length: count }, (_, i) => (i === 0 ? 'solid' as const : 'pattern' as const))
  // ApexCharts reads pattern styles by series index, so index 0 is a placeholder under the solid fill.
  const styles = Array.from({ length: count }, (_, i) => look.patternStyles[Math.max(0, i - 1) % look.patternStyles.length])
  return { types, styles }
}

/** 24-bit colours for terminal renderers. */
export type Rgb = [number, number, number]

export interface TerminalPalette {
  label: string
  accent: Rgb
  accent2: Rgb
  series: Rgb[]
  muted: Rgb
  border: Rgb
  text: Rgb
}

export const TERMINAL_PALETTES: Record<ChartThemePreset, TerminalPalette> = {
  'code': {
    label: 'Code',
    accent: [56, 189, 248],
    accent2: [52, 211, 153],
    series: [[56, 189, 248], [52, 211, 153], [129, 140, 248], [245, 158, 11]],
    muted: [148, 163, 184],
    border: [71, 85, 105],
    text: [226, 232, 240],
  },
  'phosphor': {
    label: 'Phosphor',
    accent: [34, 197, 94],
    accent2: [52, 211, 153],
    series: [[34, 197, 94], [16, 185, 129], [163, 230, 53], [45, 212, 191]],
    muted: [134, 239, 172],
    border: [34, 94, 58],
    text: [220, 252, 231],
  },
  'nord': {
    label: 'Nord',
    accent: [136, 192, 208],
    accent2: [163, 190, 140],
    series: [[136, 192, 208], [163, 190, 140], [129, 161, 193], [235, 203, 139]],
    muted: [147, 161, 177],
    border: [76, 86, 106],
    text: [236, 239, 244],
  },
  'thermal': {
    label: 'Thermal',
    accent: [249, 115, 22],
    accent2: [244, 63, 94],
    series: [[249, 115, 22], [244, 63, 94], [250, 204, 21], [168, 85, 247]],
    muted: [253, 186, 116],
    border: [124, 45, 18],
    text: [255, 247, 237],
  },
  'mono': {
    label: 'Mono',
    accent: [129, 140, 248],
    accent2: [148, 163, 184],
    series: [[226, 232, 240], [148, 163, 184], [129, 140, 248], [100, 116, 139]],
    muted: [148, 163, 184],
    border: [71, 85, 105],
    text: [241, 245, 249],
  },
  'paper': {
    label: 'Paper',
    accent: [255, 122, 77],
    accent2: [157, 184, 168],
    series: [[255, 122, 77], [236, 231, 220], [157, 184, 168], [201, 194, 179]],
    muted: [154, 149, 138],
    border: [74, 70, 63],
    text: [236, 231, 220],
  },
  'greenbar': {
    label: 'Greenbar',
    accent: [53, 214, 137],
    accent2: [207, 233, 216],
    series: [[53, 214, 137], [207, 233, 216], [31, 143, 92], [134, 197, 162]],
    muted: [108, 150, 124],
    border: [31, 58, 43],
    text: [207, 233, 216],
  },
  'onebit': {
    label: '1-Bit',
    accent: [236, 231, 220],
    accent2: [236, 231, 220],
    series: [[236, 231, 220], [236, 231, 220], [236, 231, 220], [236, 231, 220]],
    muted: [154, 149, 138],
    border: [236, 231, 220],
    text: [236, 231, 220],
  },
  'crt-amber': {
    label: 'Amber CRT',
    accent: [255, 176, 0],
    accent2: [255, 122, 26],
    series: [[255, 176, 0], [255, 122, 26], [255, 240, 201], [200, 150, 40]],
    muted: [168, 119, 26],
    border: [122, 86, 11],
    text: [255, 196, 87],
  },
  'crt-green': {
    label: 'Green CRT',
    accent: [53, 214, 137],
    accent2: [163, 230, 53],
    series: [[53, 214, 137], [163, 230, 53], [45, 212, 191], [16, 185, 129]],
    muted: [79, 154, 112],
    border: [47, 106, 73],
    text: [183, 245, 207],
  },
}
