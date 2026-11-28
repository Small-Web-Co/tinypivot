import type { WarehouseConnector, WarehouseTableSchema } from '../../packages/mcp/src/warehouse'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { backtickName } from '../../packages/mcp/src/warehouse'
import { runWarehouseAnalysis } from '../../packages/mcp/src/warehouse-analyze'
import { createWarehouseSessionCache } from '../../packages/mcp/src/warehouse-profile'
import { installTestLicenseKeypair } from '../helpers/license'

const TEST_SCHEMAS: WarehouseTableSchema[] = [
  {
    name: 'acme.daily_orders',
    rowCount: 1_200_000,
    columns: [
      { name: 'order_date', type: 'DATE' },
      { name: 'customer_id', type: 'STRING' },
      { name: 'revenue', type: 'NUMERIC' },
    ],
  },
  {
    name: 'acme.campaign_daily',
    rowCount: 80_000,
    columns: [
      { name: 'date', type: 'DATE' },
      { name: 'channel', type: 'STRING' },
      { name: 'sessions', type: 'INT64' },
      { name: 'conversions', type: 'INT64' },
      { name: 'spend', type: 'NUMERIC' },
    ],
  },
  {
    name: 'acme.ab_agg',
    rowCount: 10,
    columns: [
      { name: 'variant', type: 'STRING' },
      { name: 'country', type: 'STRING' },
      { name: 'conversions', type: 'INT64' },
      { name: 'users', type: 'INT64' },
    ],
  },
  {
    name: 'acme.ab_users',
    rowCount: 50_000,
    columns: [
      { name: 'variant', type: 'STRING' },
      { name: 'segment', type: 'STRING' },
      { name: 'revenue', type: 'FLOAT64' },
    ],
  },
  {
    name: 'acme.accounts',
    rowCount: 100_000,
    columns: [
      { name: 'account_id', type: 'STRING' },
      { name: 'discount_pct', type: 'FLOAT64' },
      { name: 'enterprise_score', type: 'FLOAT64' },
      { name: 'renewed_val', type: 'FLOAT64' },
    ],
  },
]

function makeWarehouse(
  onQuery: (sql: string) => Record<string, unknown>[],
): { connector: WarehouseConnector, queries: string[] } {
  const queries: string[] = []
  const connector: WarehouseConnector = {
    id: 'bigquery',
    label: 'BigQuery',
    toolName: 'query_bigquery',
    sqlHint: 'GoogleSQL',
    freeAlternative: 'export with bq',
    maxRows: 5000,
    concurrent: true,
    dialect: {
      quoteName: backtickName,
      yearMonth: expr => `FORMAT_DATE('%Y-%m', CAST(${expr} AS DATE))`,
    },
    listTables: async () => TEST_SCHEMAS.map(s => s.name),
    describeTables: async requested =>
      requested?.length
        ? TEST_SCHEMAS.filter(s => requested.some(r => s.name.toLowerCase().includes(r.toLowerCase())))
        : TEST_SCHEMAS,
    query: async (sql) => {
      queries.push(sql)
      return { rows: onQuery(sql), truncated: false }
    },
  }
  return { connector, queries }
}

describe('warehouse SQL-pushed analyze engine', () => {
  it('runs anomalies via 1 daily aggregate query and detects a sharp drop', async () => {
    const start = Date.UTC(2026, 0, 1)
    const dailyRows = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start + i * 86_400_000)
      const iso = d.toISOString().slice(0, 10)
      const dow = d.getUTCDay()
      const base = (dow === 0 || dow === 6 ? 70 : 100) + ((i % 5) - 2)
      const val = i === 30 ? 45 : base
      return { _day: iso, _val: val }
    })
    const { connector, queries } = makeWarehouse(() => dailyRows)
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.daily_orders',
      input: { method: 'anomalies', dateField: 'order_date', metric: 'revenue' },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('GROUP BY CAST(`order_date` AS DATE)')
    expect(res.method).toBe('anomalies')
    expect(res.summaryText).toContain('2026-01-31')
    expect(res.flags).toContain('point_anomalies')
  })

  it('runs right-censored cohort_retention via 1 SQL CTE without pulling raw rows', async () => {
    const counts = [
      { cohort: '2026-01', active_month: '2026-01', active_entities: 1000 },
      { cohort: '2026-01', active_month: '2026-02', active_entities: 500 },
      { cohort: '2026-01', active_month: '2026-03', active_entities: 400 },
      { cohort: '2026-02', active_month: '2026-02', active_entities: 1200 },
      { cohort: '2026-02', active_month: '2026-03', active_entities: 600 },
      { cohort: '2026-03', active_month: '2026-03', active_entities: 1500 },
    ]
    const { connector, queries } = makeWarehouse(() => counts)
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.daily_orders',
      input: { method: 'cohort_retention', entityField: 'customer_id', dateField: 'order_date' },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('FORMAT_DATE(\'%Y-%m\', CAST(`order_date` AS DATE))')
    expect(res.method).toBe('cohort_retention')
    expect(res.flags).toContain('right_censored_cohorts')
    const feb = res.rows.find(r => r.cohort === '2026-02')
    expect(feb?.M1).toBe(50)
    expect(feb?.M2).toBeNull() // right-censored immature cell
  })

  it('runs explain_change via 1 SQL GROUP BY and computes Kitagawa mix vs rate decomposition', async () => {
    const grouped = [
      { _period: '2026-01', channel: 'Organic', conversions: 800, sessions: 8000 },
      { _period: '2026-01', channel: 'Paid', conversions: 40, sessions: 2000 },
      { _period: '2026-02', channel: 'Organic', conversions: 210, sessions: 2000 },
      { _period: '2026-02', channel: 'Paid', conversions: 200, sessions: 8000 },
    ]
    const { connector, queries } = makeWarehouse(() => grouped)
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.campaign_daily',
      input: { method: 'explain_change', periodField: 'date', numerator: 'conversions', denominator: 'sessions', dimensions: ['channel'] },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('SUM(`conversions`)')
    expect(queries[0]).toContain('SUM(`sessions`)')
    expect(res.method).toBe('explain_change')
    expect(res.flags).toContain('simpsons_paradox')
  })

  it('runs ab_test on aggregated binomial columns with SRM and Holm-Bonferroni guards', async () => {
    const rows = [
      { variant: 'control', country: 'US', conversions: 400, users: 4000 },
      { variant: 'treatment', country: 'US', conversions: 520, users: 4800 },
      { variant: 'control', country: 'EU', conversions: 100, users: 1000 },
      { variant: 'treatment', country: 'EU', conversions: 105, users: 1000 },
    ]
    const { connector, queries } = makeWarehouse(() => rows)
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.ab_agg',
      input: { method: 'ab_test', variantField: 'variant', segmentField: 'country', successField: 'conversions', trialsField: 'users' },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(res.method).toBe('ab_test')
    expect(res.flags).toContain('srm_detected')
  })

  it('runs ab_test on row-level continuous metric via exact SQL moments (n, sum, sum2)', async () => {
    const momentRows = [
      { variant: 'control', segment: 'SMB', _n: 1000, _sum: 50_000, _sum2: 2_600_000, _non_bin: 1000 },
      { variant: 'treatment', segment: 'SMB', _n: 1000, _sum: 55_000, _sum2: 3_125_000, _non_bin: 1000 },
      { variant: 'control', segment: 'Ent', _n: 1000, _sum: 100_000, _sum2: 10_200_000, _non_bin: 1000 },
      { variant: 'treatment', segment: 'Ent', _n: 1000, _sum: 101_000, _sum2: 10_401_000, _non_bin: 1000 },
    ]
    const { connector, queries } = makeWarehouse(() => momentRows)
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.ab_users',
      input: { method: 'ab_test', variantField: 'variant', segmentField: 'segment', metric: 'revenue' },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('SUM(1.0 * `revenue` * `revenue`) AS _sum2')
    expect(res.method).toBe('ab_test')
    expect(res.summaryText).toContain('Warehouse SQL')
    expect(res.summaryText).toContain('SRM Check (Pro)')
    expect(res.rows.some(r => r.segment === 'Overall' && Number(r.abs_lift) > 2.5)).toBe(true)
  })

  it('runs controlled multivariate regression via 1-row SQL sufficient stats and catches confounding sign reversal', async () => {
    // True DGP: y = 10 - 2 * x1 + 5 * x2, where x1 and x2 are strongly positively correlated
    // so naive slope of y on x1 is POSITIVE, while controlled slope on x1 is NEGATIVE (-2).
    const samples: Array<{ x1: number, x2: number, y: number }> = []
    for (let i = 0; i < 200; i++) {
      const x2 = (i % 20) + 1
      const x1 = x2 * 1.2 + ((i % 5) - 2) * 0.4
      const y = 10 - 2 * x1 + 5 * x2 + ((i % 7) - 3) * 0.05
      samples.push({ x1, x2, y })
    }
    const statsRow = {
      _n: samples.length,
      _sy: samples.reduce((s, r) => s + r.y, 0),
      _syy: samples.reduce((s, r) => s + r.y * r.y, 0),
      _sx_0: samples.reduce((s, r) => s + r.x1, 0),
      _sxy_0: samples.reduce((s, r) => s + r.x1 * r.y, 0),
      _sxx_0_0: samples.reduce((s, r) => s + r.x1 * r.x1, 0),
      _sxx_0_1: samples.reduce((s, r) => s + r.x1 * r.x2, 0),
      _sx_1: samples.reduce((s, r) => s + r.x2, 0),
      _sxy_1: samples.reduce((s, r) => s + r.x2 * r.y, 0),
      _sxx_1_1: samples.reduce((s, r) => s + r.x2 * r.x2, 0),
    }

    const { connector, queries } = makeWarehouse(() => [statsRow])
    const res = await runWarehouseAnalysis({
      warehouse: connector,
      table: 'acme.accounts',
      input: { method: 'regression', target: 'renewed_val', features: ['discount_pct'], controls: ['enterprise_score'] },
      cache: createWarehouseSessionCache(),
      proGuards: true,
    })

    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('SUM(1.0 * `discount_pct` * `enterprise_score`) AS _sxx_0_1')
    expect(res.method).toBe('regression')
    expect(res.flags).toContain('confounding_sign_reversal')
    const x1Row = res.rows.find(r => r.predictor === 'discount_pct')
    expect(Number(x1Row?.coefficient)).toBeCloseTo(-2, 1)
  })
})

describe('server analyze(warehouse, table) wiring & Pro gating', () => {
  let signLicense: ReturnType<typeof installTestLicenseKeypair>['signLicense']
  let cleanupKeys: () => void

  beforeEach(() => {
    const installed = installTestLicenseKeypair()
    signLicense = installed.signLicense
    cleanupKeys = installed.restore
  })

  afterEach(() => {
    cleanupKeys()
  })

  it('runs analyze directly on a configured warehouse on Pro and blocks it on Free', async () => {
    const counts = [
      { cohort: '2026-01', active_month: '2026-01', active_entities: 500 },
      { cohort: '2026-01', active_month: '2026-02', active_entities: 250 },
      { cohort: '2026-02', active_month: '2026-02', active_entities: 600 },
    ]
    const { connector } = makeWarehouse(() => counts)

    // Pro succeeds
    const { server: proServer } = createTinyPivotMcpServer({
      licenseKey: signLicense('MCPP'),
      warehouses: [connector],
    })
    const [ct1, st1] = InMemoryTransport.createLinkedPair()
    await proServer.connect(st1)
    const proClient = new Client({ name: 'test-pro', version: '1.0.0' })
    await proClient.connect(ct1)

    const proRes = await proClient.callTool({
      name: 'analyze',
      arguments: {
        method: 'cohort_retention',
        warehouse: 'bigquery',
        table: 'acme.daily_orders',
        params: { entityField: 'customer_id', dateField: 'order_date' },
      },
    })
    expect(proRes.isError).toBeFalsy()
    const proText = (proRes.content as Array<{ text?: string }>).map(c => c.text ?? '').join('\n')
    expect(proText).toContain('Cohort Retention')
    await proClient.close()

    // Free is gated cleanly on warehouse analyze
    const { server: freeServer } = createTinyPivotMcpServer({
      warehouses: [connector],
    })
    const [ct2, st2] = InMemoryTransport.createLinkedPair()
    await freeServer.connect(st2)
    const freeClient = new Client({ name: 'test-free', version: '1.0.0' })
    await freeClient.connect(ct2)

    const freeRes = await freeClient.callTool({
      name: 'analyze',
      arguments: {
        method: 'explain_change',
        warehouse: 'bigquery',
        table: 'acme.campaign_daily',
      },
    })
    expect(freeRes.isError).toBe(true)
    const freeText = (freeRes.content as Array<{ text?: string }>).map(c => c.text ?? '').join('\n')
    expect(freeText).toContain('requires TinyPivot Pro')
    await freeClient.close()
  })
})
