/**
 * Fake Acme Corp bookings for the /ui D3 chart gallery. Seeded so the gallery
 * (and its screenshots) look the same on every load. Not real data.
 */
import type { ChartConfig, ChartField } from '@smallwebco/tinypivot-core'

const COUNTRIES = [
  ['United States', 'North America'],
  ['Canada', 'North America'],
  ['Mexico', 'Latin America'],
  ['Brazil', 'Latin America'],
  ['Argentina', 'Latin America'],
  ['Chile', 'Latin America'],
  ['United Kingdom', 'EMEA'],
  ['Germany', 'EMEA'],
  ['France', 'EMEA'],
  ['Spain', 'EMEA'],
  ['Sweden', 'EMEA'],
  ['South Africa', 'EMEA'],
  ['United Arab Emirates', 'EMEA'],
  ['India', 'APAC'],
  ['Japan', 'APAC'],
  ['Australia', 'APAC'],
  ['Singapore', 'APAC'],
  ['South Korea', 'APAC'],
] as const

const STATES = ['CA', 'TX', 'NY', 'FL', 'WA', 'IL', 'MA', 'CO', 'GA', 'AZ', 'OR', 'NC', 'MN', 'OH', 'PA', 'UT']
const PRODUCTS = [
  ['Acme Rocket Skates', 'Hardware'],
  ['Acme Anvil', 'Hardware'],
  ['Acme Giant Magnet', 'Hardware'],
  ['Acme Portable Hole', 'Software'],
  ['Acme Earthquake Pills', 'Software'],
  ['Acme Batman Outfit', 'Services'],
  ['Acme Jet Bike', 'Services'],
  ['Acme Bird Seed', 'Supplies'],
  ['Acme Dehydrated Boulders', 'Supplies'],
] as const
/** 2026 vs 2025 growth per product, so the slope chart has winners and losers. */
const PRODUCT_GROWTH = [1.38, 0.82, 1.12, 1.05, 0.67, 1.24, 0.94, 1.51, 1.02]
const REPS = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Harper', 'Jordan']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** mulberry32: tiny seeded PRNG, so the gallery is stable between loads. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateAcmeBookings(count = 1200): Record<string, unknown>[] {
  const rand = seeded(42)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
  return Array.from({ length: count }, (_, i) => {
    const [country, salesRegion] = pick(COUNTRIES)
    const productIndex = Math.floor(rand() * PRODUCTS.length)
    const [product, category] = PRODUCTS[productIndex]
    const monthIndex = Math.floor(rand() * 12)
    // A summer peak so the radial area has a visible season.
    const season = 1 + 0.6 * Math.sin(((monthIndex - 3) / 12) * 2 * Math.PI)
    const year = rand() > 0.5 ? 2025 : 2026
    const growth = year === 2026 ? PRODUCT_GROWTH[productIndex] : 1
    const bookings = Math.round((800 + rand() * 4200) * season * growth)
    const rep = REPS[i % REPS.length]
    return {
      id: i + 1,
      account: `Acme ${pick(['North', 'South', 'Metro', 'Coastal', 'Valley'])} ${i % 40}`,
      country,
      salesRegion,
      state: pick(STATES),
      product,
      category,
      rep,
      month: MONTHS[monthIndex],
      year,
      bookings,
      // Quota per row; reps differ in how far they land from it.
      quota: Math.round(bookings * (0.75 + (REPS.indexOf(rep) / REPS.length) * 0.6)),
    }
  })
}

const MONTH_KM_GOAL = [80, 80, 100, 110, 120, 130, 130, 130, 120, 110, 90, 80]

/**
 * A made-up personal running log: one row per run over two years. Shows the
 * same charts working for personal stats, not only company data.
 */
export function generateRunningLog(): Record<string, unknown>[] {
  const rand = seeded(7)
  const rows: Record<string, unknown>[] = []
  for (const year of [2025, 2026]) {
    MONTHS.forEach((month, m) => {
      // Fewer runs in winter, more in summer; 2026 is the more consistent year.
      const runs = Math.round((year === 2026 ? 12 : 9) + 6 * Math.sin(((m - 3) / 12) * 2 * Math.PI))
      for (let r = 0; r < runs; r++) {
        rows.push({
          year,
          month,
          weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.floor(rand() * 7)],
          km: Math.round((4 + rand() * 9) * 10) / 10,
          goalKm: Math.round((MONTH_KM_GOAL[m] / runs) * 10) / 10,
        })
      }
    })
  }
  return rows
}

const dim = (field: string, label: string): ChartField => ({ field, label, role: 'dimension' })
const sum = (field: string, label: string): ChartField => ({ field, label, role: 'measure', aggregation: 'sum' })

export interface GalleryChart {
  id: string
  label: string
  /** Which fake dataset the chart reads */
  data: 'acme' | 'running'
  config: Partial<ChartConfig>
}

const ACME_SOURCE = { source: 'acme-bookings.csv (fictional data)', valueFormat: 'currency' as const }
const RUN_SOURCE = { source: 'running-log.csv (fictional data)' }

export const galleryCharts: GalleryChart[] = [
  { id: 'world', label: 'World map', data: 'acme', config: { type: 'choropleth', xAxis: dim('country', 'Country'), yAxis: sum('bookings', 'Bookings'), options: ACME_SOURCE } },
  { id: 'regions', label: 'Sales regions', data: 'acme', config: { type: 'choropleth', xAxis: dim('salesRegion', 'Sales region'), yAxis: sum('bookings', 'Bookings'), options: ACME_SOURCE } },
  { id: 'states', label: 'US states', data: 'acme', config: { type: 'choropleth', xAxis: dim('state', 'State'), yAxis: sum('bookings', 'Bookings'), options: ACME_SOURCE } },
  { id: 'bullet', label: 'Bullet', data: 'acme', config: { type: 'bullet', xAxis: dim('rep', 'Rep'), yAxis: sum('bookings', 'Bookings'), targetField: sum('quota', 'Quota'), options: ACME_SOURCE } },
  { id: 'radialBar', label: 'Radial bar', data: 'acme', config: { type: 'radialBar', xAxis: dim('product', 'Product'), yAxis: sum('bookings', 'Bookings'), seriesField: dim('year', 'Year'), options: ACME_SOURCE } },
  { id: 'radialArea', label: 'Radial area', data: 'acme', config: { type: 'radialArea', xAxis: dim('month', 'Month'), yAxis: sum('bookings', 'Bookings'), seriesField: dim('year', 'Year'), options: ACME_SOURCE } },
  { id: 'slope', label: 'Slope', data: 'acme', config: { type: 'slope', xAxis: dim('product', 'Product'), yAxis: sum('bookings', 'Bookings'), seriesField: dim('year', 'Year'), options: ACME_SOURCE } },
  { id: 'treemap', label: 'Treemap', data: 'acme', config: { type: 'treemap', xAxis: dim('product', 'Product'), yAxis: sum('bookings', 'Bookings'), seriesField: dim('category', 'Category'), options: ACME_SOURCE } },
  { id: 'sunburst', label: 'Sunburst', data: 'acme', config: { type: 'sunburst', xAxis: dim('product', 'Product'), yAxis: sum('bookings', 'Bookings'), seriesField: dim('category', 'Category'), options: ACME_SOURCE } },
  { id: 'runGoal', label: 'Running vs goal', data: 'running', config: { type: 'bullet', xAxis: dim('month', 'Month'), yAxis: sum('km', 'Distance (km)'), targetField: sum('goalKm', 'Goal'), options: { ...RUN_SOURCE, sortOrder: 'label-asc' } } },
  { id: 'runYear', label: 'Running year', data: 'running', config: { type: 'radialArea', xAxis: dim('month', 'Month'), yAxis: sum('km', 'Distance (km)'), seriesField: dim('year', 'Year'), options: RUN_SOURCE } },
]
