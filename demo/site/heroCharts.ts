import type { ChartConfig, D3ChartTheme, UnifiedThemeId } from '@smallwebco/tinypivot-core'
import type { Claim } from '../../packages/mcp/src/studio-protocol'
import { getChartLook, getD3ChartTheme } from '@smallwebco/tinypivot-core'
import { checkClaims } from '../../packages/mcp/src/claims'

/**
 * The hero's three questions, from the recorded pi + Studio session in the reel: what was asked,
 * the totals TinyPivot computed from Acme's 44,714 orders (fake data), the chart, and the agent's
 * answer. The numbers in each answer are checked against these rows by the Studio's own checker.
 */

export interface HeroSlide {
  id: string
  question: string
  /** Where the question was asked. */
  askedIn: string
  theme: UnifiedThemeId
  config: ChartConfig
  rows: Record<string, unknown>[]
  answer: string
}

const dimension = (field: string, label: string) => ({ field, label, role: 'dimension' as const })
const measure = (field: string, label: string) => ({ field, label, role: 'measure' as const, aggregation: 'sum' as const })

/** 2026 MRR by region; 2026 is booked through October, so these are also the Jan–Oct totals. */
const REGIONS_2026: Record<string, number> = { 'North America': 17_119_446, 'EMEA': 14_959_189, 'APAC': 10_774_591, 'LATAM': 5_336_244 }
const REGIONS_2025: Record<string, number> = { 'North America': 14_745_379, 'EMEA': 11_113_330, 'APAC': 7_513_678, 'LATAM': 4_300_464 }
/** MRR by plan, January to October of each year. */
const PLANS: Record<string, [number, number]> = { Enterprise: [27_774_169, 35_704_742], Business: [7_488_897, 9_373_438], Team: [2_082_729, 2_702_156], Starter: [327_056, 409_134] }

export const heroSlides: HeroSlide[] = [
  {
    id: 'map',
    question: 'Map 2026 MRR by region',
    askedIn: 'asked in pi',
    theme: 'crt-amber',
    config: { type: 'choropleth', xAxis: dimension('region', 'Region'), yAxis: measure('mrr', 'MRR'), options: { title: '2026 MRR by region', geography: 'world', source: 'acme-orders.csv' } },
    rows: Object.entries(REGIONS_2026).map(([region, mrr]) => ({ region, mrr })),
    answer: 'North America leads with $17.12M, 35.5% of the total; LATAM is smallest at $5.34M.',
  },
  {
    id: 'slope',
    question: 'Which plans grew, Jan–Oct like-for-like?',
    askedIn: 'asked in the Studio',
    theme: 'paper',
    config: { type: 'slope', xAxis: dimension('plan', 'Plan'), yAxis: measure('mrr', 'MRR'), seriesField: dimension('period', 'Period'), options: { title: 'MRR by plan, Jan–Oct', source: 'acme-orders.csv' } },
    rows: Object.entries(PLANS).flatMap(([plan, [before, after]]) => [
      { plan, period: '2025 Jan–Oct', mrr: before },
      { plan, period: '2026 Jan–Oct', mrr: after },
    ]),
    answer: 'All four grew. Team fastest at +29.7%; Enterprise added the most, +$7.93M.',
  },
  {
    id: 'bullet',
    question: 'Each region against its 2025 target',
    askedIn: 'asked in the Studio',
    theme: 'greenbar',
    config: { type: 'bullet', xAxis: dimension('region', 'Region'), yAxis: measure('mrr_2026', '2026 MRR'), targetField: measure('mrr_2025', '2025 MRR'), options: { title: '2026 MRR against 2025', variant: 'deck', source: 'acme-orders.csv' } },
    rows: Object.keys(REGIONS_2026).map(region => ({ region, mrr_2026: REGIONS_2026[region], mrr_2025: REGIONS_2025[region] })),
    answer: 'Every region beat 2025. APAC grew fastest, +43.4%, and North America added $2.37M.',
  },
]

/** The chart's colours in the slide's TinyPivot theme. */
export function slideTheme(slide: HeroSlide): D3ChartTheme {
  return getD3ChartTheme(getChartLook(slide.theme, slide.theme), slide.theme)
}

/** Each number in the slide's answer, checked against its rows as the Studio checks an answer. */
export function slideClaims(slide: HeroSlide): Claim[] {
  return checkClaims(slide.answer, [{ name: slide.question, rows: slide.rows, measures: [slide.config.yAxis.field] }])
}
