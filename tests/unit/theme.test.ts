import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHART_THEME_IDS,
  CHART_THEME_PRESETS,
  chartGlowApplies,
  chartPatternFill,
  getChartLook,
  isDarkTheme,
  isUnifiedTheme,
  resolveChartTheme,
  TERMINAL_PALETTES,
  UNIFIED_THEME_IDS,
} from '../../packages/core/src'

const ORIGINAL_PRESETS = ['code', 'phosphor', 'nord', 'thermal', 'mono'] as const

describe('existing themes are preserved', () => {
  it('keeps the original chart preset colours', () => {
    expect(CHART_THEME_PRESETS.code.colors).toEqual(['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#22d3ee', '#818cf8', '#f97316'])
    expect(CHART_THEME_PRESETS.phosphor.colors[0]).toBe('#22c55e')
    expect(CHART_THEME_PRESETS.nord.colors[0]).toBe('#88c0d0')
    expect(CHART_THEME_PRESETS.thermal.colors[0]).toBe('#f97316')
    expect(CHART_THEME_PRESETS.mono.colors[0]).toBe('#6366f1')
  })

  it('lists the original presets first, in their original order', () => {
    expect(CHART_THEME_IDS.slice(0, 5)).toEqual([...ORIGINAL_PRESETS])
  })

  it('keeps the legacy light chart look for non-unified grid themes', () => {
    for (const theme of ['light', 'slate', 'rose', 'mono'] as const) {
      expect(getChartLook(theme, 'code')).toEqual({
        isDark: false,
        foreColor: '#1e293b',
        mutedColor: '#64748b',
        hairlineColor: 'rgba(100, 116, 139, 0.16)',
        titleColor: '#0f172a',
        surfaceColor: '#ffffff',
        radarFill: ['rgba(241,245,249,0.7)', 'transparent'],
        fillMode: 'solid',
        patternStyles: [],
        barRadius: 4,
        barOpacity: 0.92,
        markStrokeWidth: 0,
        curve: 'monotoneCubic',
        lineWidth: 2.5,
        lineDashes: [],
        areaOpacityFrom: 0.34,
        gridDash: 3,
        glow: null,
      })
    }
  })

  it('keeps the legacy dark chart look, including the line-only shadow', () => {
    for (const theme of ['dark', 'slate-dark', 'emerald-dark'] as const) {
      const look = getChartLook(theme, 'nord')
      expect(look.isDark).toBe(true)
      expect(look.foreColor).toBe('#e2e8f0')
      expect(look.surfaceColor).toBe('#0f172a')
      expect(look.areaOpacityFrom).toBe(0.42)
      expect(look.glow).toEqual({ blur: 8, opacity: 0.22, lineOnly: true })
      expect(chartGlowApplies(look, 'line')).toBe(true)
      expect(chartGlowApplies(look, 'bar')).toBe(false)
    }
  })

  it('defaults non-unified grid themes to the code preset', () => {
    expect(resolveChartTheme('light')).toBe('code')
    expect(resolveChartTheme('violet-dark')).toBe('code')
    expect(resolveChartTheme(undefined)).toBe('code')
  })
})

describe('unified themes', () => {
  it('exist as chart presets with eight colours and a terminal palette', () => {
    for (const id of UNIFIED_THEME_IDS) {
      expect(isUnifiedTheme(id)).toBe(true)
      expect(CHART_THEME_PRESETS[id].colors).toHaveLength(8)
      expect(TERMINAL_PALETTES[id].series.length).toBeGreaterThanOrEqual(4)
    }
    expect(isUnifiedTheme('slate')).toBe(false)
  })

  it('has a terminal palette for every chart preset', () => {
    expect(Object.keys(TERMINAL_PALETTES).sort()).toEqual([...CHART_THEME_IDS].sort())
  })

  it('brings the matching chart preset unless one is set explicitly', () => {
    expect(resolveChartTheme('crt-amber')).toBe('crt-amber')
    expect(resolveChartTheme('paper', null)).toBe('paper')
    expect(resolveChartTheme('paper', 'nord')).toBe('nord')
  })

  it('treats only the CRT themes as dark', () => {
    expect(isDarkTheme('crt-amber')).toBe(true)
    expect(isDarkTheme('crt-green')).toBe(true)
    expect(isDarkTheme('paper')).toBe(false)
    expect(isDarkTheme('greenbar')).toBe(false)
    expect(isDarkTheme('onebit')).toBe(false)
  })

  it('glows on every chart type for CRT looks', () => {
    const look = getChartLook('crt-green', 'crt-green')
    expect(look.fillMode).toBe('gradient')
    expect(chartGlowApplies(look, 'bar')).toBe(true)
    expect(chartGlowApplies(look, 'pie')).toBe(true)
  })

  it('takes the surface from the grid theme and the style from the chart preset', () => {
    const look = getChartLook('slate', 'paper')
    expect(look.surfaceColor).toBe('#ffffff')
    expect(look.fillMode).toBe('gradient')
    expect(look.barRadius).toBe(6)
  })
})

describe('chartPatternFill', () => {
  it('returns null for looks without patterns', () => {
    expect(chartPatternFill(getChartLook('light', 'code'), 3)).toBeNull()
  })

  it('keeps the first series solid and patterns the rest', () => {
    const fill = chartPatternFill(getChartLook('onebit', 'onebit'), 4)
    expect(fill?.types).toEqual(['solid', 'pattern', 'pattern', 'pattern'])
    expect(fill?.styles.slice(1)).toEqual(['squares', 'horizontalLines', 'circles'])
  })

  it('cycles patterns when there are more series than patterns', () => {
    const fill = chartPatternFill(getChartLook('onebit', 'onebit'), 8)
    expect(fill?.styles[6]).toBe('squares')
    expect(fill?.types).toHaveLength(8)
  })
})

describe('theme stylesheets', () => {
  const read = (pkg: string) => readFileSync(resolve(__dirname, `../../packages/${pkg}/src/themes.css`), 'utf-8')

  it('are identical in the Vue and React packages', () => {
    expect(read('react')).toBe(read('vue'))
  })

  it('define every unified theme', () => {
    const css = read('vue')
    for (const id of UNIFIED_THEME_IDS)
      expect(css).toContain(`.vpg-data-grid.vpg-theme-${id}`)
  })
})
