import type { ChartConfig, ChartThemePreset, PivotConfig, Theme } from '@smallwebco/tinypivot-core'
import { CHART_THEME_PRESETS, UNIFIED_THEME_IDS } from '@smallwebco/tinypivot-core'

/** Fictional sample data for the homepage theme showcase: Acme revenue by month, tier and region. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] as const
const TIERS: Record<string, readonly number[]> = {
  'Enterprise': [22.4, 25.1, 27.8, 31.6, 34.9, 39.3],
  'Growth': [12.6, 13.9, 15.3, 16.8, 18.7, 20.2],
  'Self-Serve': [5.8, 6.4, 7.1, 7.9, 8.6, 9.2],
}
const REGION_SHARE = { NA: 0.5, EU: 0.3, APAC: 0.2 } as const

export const showcaseRows = MONTHS.flatMap((month, m) =>
  Object.entries(TIERS).flatMap(([tier, byMonth]) =>
    Object.entries(REGION_SHARE).map(([region, share]) => ({
      month,
      quarter: m < 3 ? 'Q1' : 'Q2',
      tier,
      region,
      revenue: Math.round(byMonth[m] * 1000 * share),
    })),
  ),
)

export const showcaseChart: Partial<ChartConfig> = {
  type: 'stackedBar',
  xAxis: { field: 'month', label: 'Month', role: 'dimension' },
  yAxis: { field: 'revenue', label: 'Revenue', role: 'measure', aggregation: 'sum' },
  seriesField: { field: 'tier', label: 'Tier', role: 'dimension' },
  options: { sortOrder: 'data', title: 'Acme revenue by month' },
}

export const showcasePivot: Partial<PivotConfig> = {
  rowFields: ['tier'],
  columnFields: ['quarter'],
  valueFields: [{ field: 'revenue', aggregation: 'sum' }],
  showRowTotals: true,
  showColumnTotals: true,
}

export interface ShowcaseTheme {
  id: string
  label: string
  grid: Theme
  chart: ChartThemePreset
  isNew: boolean
}

/** The five unified themes, then two long-standing ones to show they still work as before. */
export const showcaseThemes: ShowcaseTheme[] = [
  ...UNIFIED_THEME_IDS.map(id => ({ id, label: CHART_THEME_PRESETS[id].label, grid: id as Theme, chart: id as ChartThemePreset, isNew: true })),
  { id: 'dark-code', label: 'Dark · Code', grid: 'dark', chart: 'code', isNew: false },
  { id: 'slate-nord', label: 'Slate · Nord', grid: 'slate', chart: 'nord', isNew: false },
]
