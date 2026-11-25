import type { AIAnalystConfig, AIDataSource, AITableSchema, ChartConfig, QueryExecutorResult, Theme } from '@smallwebco/tinypivot-core'
import { CHART_THEME_PRESETS, UNIFIED_THEME_IDS } from '@smallwebco/tinypivot-core'
import { onMounted, ref } from 'vue'
import { DATASETS, getDataset } from '../datasets'
import { executeQuery, initDuckDB, loadData } from '../utils/duckdb'

const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'Northeast', 'Southeast', 'Northwest', 'Southwest']
const PRODUCTS = ['Widget A', 'Widget B', 'Widget C', 'Gadget X', 'Gadget Y', 'Device Pro', 'Device Lite', 'Tool Plus']
const CATEGORIES = ['Electronics', 'Hardware', 'Software', 'Services', 'Accessories']
const YEARS = [2022, 2023, 2024]
const REPS = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack']
const STATUSES = ['Completed', 'Pending', 'Processing', 'Shipped', 'Delivered']

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

export function generateSalesRows(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const price = Math.floor(Math.random() * 500) + 50
    const units = Math.floor(Math.random() * 200) + 10
    const year = pick(YEARS)
    const month = Math.floor(Math.random() * 12)
    const day = Math.floor(Math.random() * 28) + 1
    return {
      id: i + 1,
      region: pick(REGIONS),
      product: pick(PRODUCTS),
      category: pick(CATEGORIES),
      sales: price * units,
      units,
      price,
      quarter: `Q${Math.floor(month / 3) + 1}`,
      year,
      rep: pick(REPS),
      status: pick(STATUSES),
      margin: Math.round((Math.random() * 30 + 10) * 100) / 100,
      date: new Date(year, month, day).toISOString().split('T')[0],
    }
  })
}

const BRANDS = ['slate', 'zinc', 'indigo', 'violet', 'emerald', 'sky', 'rose', 'amber', 'solar', 'mono'] as const

export const themeChoices: { value: Theme, label: string }[] = [
  // Unified themes style the grid and its charts together.
  ...UNIFIED_THEME_IDS.map(id => ({ value: id as Theme, label: CHART_THEME_PRESETS[id].label })),
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto (system)' },
  ...BRANDS.flatMap(brand => [
    { value: brand as Theme, label: brand[0].toUpperCase() + brand.slice(1) },
    { value: `${brand}-dark` as Theme, label: `${brand[0].toUpperCase() + brand.slice(1)} dark` },
  ]),
]

export const numberFormats = [
  { value: 'us', label: '1,000.00' },
  { value: 'eu', label: '1.000,00' },
  { value: 'plain', label: '1000' },
] as const

/** So the Chart view opens on a real chart instead of an empty builder. */
export const demoChartConfig: Partial<ChartConfig> = {
  type: 'stackedBar',
  xAxis: { field: 'quarter', label: 'Quarter', role: 'dimension' },
  yAxis: { field: 'sales', label: 'Sales', role: 'measure', aggregation: 'sum' },
  seriesField: { field: 'category', label: 'Category', role: 'dimension' },
}

export const dateFormats = [
  { value: 'iso', label: '2024-01-15' },
  { value: 'us', label: '01/15/2024' },
  { value: 'eu', label: '15/01/2024' },
] as const

const loadedTables = new Set<string>()

async function loadDataSource(id: string): Promise<{ data: Record<string, unknown>[], schema?: AITableSchema }> {
  const dataset = getDataset(id)
  if (!dataset)
    throw new Error(`Dataset ${id} not found`)
  await initDuckDB()
  if (!loadedTables.has(id)) {
    await loadData(dataset.tableName, dataset.generate())
    loadedTables.add(id)
  }
  const preview = await executeQuery(`SELECT * FROM ${dataset.tableName} LIMIT 100`)
  return { data: preview.rows, schema: dataset.schema }
}

async function queryExecutor(sql: string): Promise<QueryExecutorResult> {
  try {
    const result = await executeQuery(sql)
    return { data: result.rows, rowCount: result.rows.length, truncated: false }
  }
  catch (err) {
    return { data: [], rowCount: 0, error: err instanceof Error ? err.message : 'Query failed' }
  }
}

const dataSources: AIDataSource[] = DATASETS.map(d => ({
  id: d.id,
  table: d.tableName,
  name: d.name,
  description: d.description,
}))

/** AI chat goes through /api/ai-proxy; SQL runs client-side in DuckDB WASM. */
export const aiAnalystConfig: AIAnalystConfig = {
  enabled: true,
  endpoint: '/api/ai-proxy',
  dataSources,
  dataSourceLoader: loadDataSource,
  queryExecutor,
  persistToLocalStorage: true,
  aiModelName: __AI_MODEL__,
}

/**
 * Client-only state for the /ui live demo. Rows are generated after mount so
 * the prerendered HTML stays small; phones get a smaller page size.
 */
export function useLiveDemo(rowCount = 10_000) {
  const isMounted = ref(false)
  const rows = ref<ReturnType<typeof generateSalesRows>>([])
  const pageSize = ref(1000)
  const theme = ref<Theme>('dark')
  const numberFormat = ref<(typeof numberFormats)[number]['value']>('us')
  const dateFormat = ref<(typeof dateFormats)[number]['value']>('iso')

  onMounted(() => {
    rows.value = generateSalesRows(rowCount)
    pageSize.value = window.matchMedia('(max-width: 767px)').matches ? 50 : 1000
    isMounted.value = true
  })

  return { isMounted, rows, pageSize, theme, numberFormat, dateFormat }
}
