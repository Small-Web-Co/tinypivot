import type { BigQueryClientLike, BigQueryConfig } from '../../packages/mcp/src/bigquery'
import type { StoredDataset } from '../../packages/mcp/src/store'
import type { WarehouseConnector, WarehouseTableSchema } from '../../packages/mcp/src/warehouse'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bigQueryConnector } from '../../packages/mcp/src/bigquery'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { backtickName, plainName } from '../../packages/mcp/src/warehouse'
import { auditWarehouseQuery } from '../../packages/mcp/src/warehouse-audit'
import { formatWarehouseSqlRepairHint } from '../../packages/mcp/src/warehouse-hints'
import { createWarehouseSessionCache, profileWarehouse } from '../../packages/mcp/src/warehouse-profile'
import { installTestLicenseKeypair } from '../helpers/license'

const ACME_SCHEMAS: WarehouseTableSchema[] = [
  {
    name: 'wh_bench.orders',
    rowCount: 2_736_525,
    columns: [
      { name: 'order_id', type: 'STRING' },
      { name: 'customer_id', type: 'STRING' },
      { name: 'order_date', type: 'DATE' },
      { name: 'status', type: 'STRING' },
      { name: 'promo_code', type: 'STRING' },
      { name: 'currency', type: 'STRING' },
      { name: 'amount', type: 'NUMERIC' },
    ],
  },
  {
    name: 'wh_bench.shipments',
    rowCount: 3_062_608,
    columns: [
      { name: 'shipment_id', type: 'STRING' },
      { name: 'order_id', type: 'STRING' },
      { name: 'carrier', type: 'STRING' },
      { name: 'shipped_date', type: 'DATE' },
    ],
  },
  {
    name: 'wh_bench.customers',
    rowCount: 400_000,
    columns: [
      { name: 'customer_id', type: 'STRING' },
      { name: 'segment', type: 'STRING' },
      { name: 'region', type: 'STRING' },
    ],
  },
  {
    name: 'wh_bench.campaign_daily',
    rowCount: 34_760,
    columns: [
      { name: 'date', type: 'DATE' },
      { name: 'channel', type: 'STRING' },
      { name: 'sessions', type: 'INT64' },
      { name: 'conversions', type: 'INT64' },
      { name: 'spend', type: 'NUMERIC' },
      { name: 'conversion_rate_pct', type: 'FLOAT64' },
    ],
  },
  {
    name: 'wh_bench.fx_rates',
    rowCount: 69,
    columns: [
      { name: 'month', type: 'DATE' },
      { name: 'currency', type: 'STRING' },
      { name: 'usd_per_unit', type: 'NUMERIC' },
    ],
  },
]

function makeFakeWarehouse(
  onQuery: (sql: string) => Record<string, unknown>[],
  overrides: Partial<WarehouseConnector> = {},
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
      median: expr => `APPROX_QUANTILES(${expr}, 2)[OFFSET(1)]`,
      sampleDistinct: (expr, limit) => `STRING_AGG(DISTINCT CAST(${expr} AS STRING), ', ' LIMIT ${limit})`,
    },
    listTables: async () => ACME_SCHEMAS.map(s => s.name),
    describeTables: async () => ACME_SCHEMAS,
    query: async (sql) => {
      queries.push(sql)
      return { rows: onQuery(sql), truncated: false }
    },
    ...overrides,
  }
  return { connector, queries }
}

function makeDataset(rows: Record<string, unknown>[]): StoredDataset {
  return {
    id: 'acme',
    name: 'Acme',
    source: 'BigQuery',
    ingestionMode: 'direct',
    rawBytes: 0,
    estimatedDatasetTokens: 0,
    rows,
    columns: Object.keys(rows[0] ?? {}).map(name => ({ name, type: 'string' as const, sampleValues: [], distinctCount: 0 })),
    sourceTotalRows: rows.length,
    truncatedForFreeTier: false,
    viewMode: 'grid',
    loadedAt: new Date().toISOString(),
  }
}

describe('warehouse 1-call profiler & session cache', () => {
  it('surfaces schemas, join fan-out, partial trailing month, high NULLs, mixed currencies and non-additive rates in 1 call', async () => {
    const { connector, queries } = makeFakeWarehouse((sql) => {
      if (sql.includes('`wh_bench`.`orders`')) {
        return [{
          _n: 2_736_525,
          _kc_0: 2_736_525,
          _kd_0: 2_736_525,
          _kc_1: 2_736_525,
          _kd_1: 399_000,
          _dmin_0: '2025-01-01',
          _dmax_0: '2026-11-12',
          _null_0: 0,
          _dist_0: 3,
          _vals_0: 'completed, refunded, cancelled',
          _null_1: 1_970_000,
          _dist_1: 3,
          _vals_1: 'SAVE10, WELCOME, VIP',
          _null_2: 0,
          _dist_2: 3,
          _vals_2: 'USD, EUR, GBP',
        }]
      }
      if (sql.includes('`wh_bench`.`shipments`')) {
        return [{
          _n: 3_062_608,
          _kc_0: 3_062_608,
          _kd_0: 3_062_608,
          _kc_1: 3_062_608,
          _kd_1: 2_490_000,
          _dmin_0: '2025-01-02',
          _dmax_0: '2026-11-15',
          _null_0: 0,
          _dist_0: 3,
          _vals_0: 'Bluejay Freight, Parcelwise, Orbit Post',
        }]
      }
      if (sql.includes('`wh_bench`.`customers`')) {
        return [{
          _n: 400_000,
          _kc_0: 400_000,
          _kd_0: 400_000,
          _null_0: 0,
          _dist_0: 3,
          _vals_0: 'SMB, Mid-Market, Enterprise',
          _null_1: 0,
          _dist_1: 4,
          _vals_1: 'North America, EMEA, APAC, LATAM',
        }]
      }
      if (sql.includes('`wh_bench`.`campaign_daily`')) {
        return [{
          _n: 34_760,
          _dmin_0: '2026-01-01',
          _dmax_0: '2026-11-12',
          _null_0: 0,
          _dist_0: 4,
          _vals_0: 'Search, Social, Email, Affiliate',
        }]
      }
      if (sql.includes('`wh_bench`.`fx_rates`')) {
        return [{
          _n: 69,
          _dmin_0: '2025-01-01',
          _dmax_0: '2026-11-01',
          _null_0: 0,
          _dist_0: 3,
          _vals_0: 'USD, EUR, GBP',
        }]
      }
      return []
    })

    const cache = createWarehouseSessionCache()
    const brief = await profileWarehouse(connector, { isPro: true, cache })

    expect(queries).toHaveLength(5)
    expect(brief).toContain('`wh_bench.orders` (2,736,525 rows)')
    expect(brief).toContain('order_date: 2025-01-01..2026-11-12')
    expect(brief).toContain('Join `wh_bench.orders.order_id` ↔ `wh_bench.shipments.order_id`: 1:N ⚠️')
    expect(brief).toContain('trailing month `2026-11` stops at 2026-11-12')
    expect(brief).not.toContain('fx_rates.month')
    expect(brief).toContain('NULL values in `wh_bench.orders.promo_code` (72% NULL)')
    expect(brief).toContain('Mixed currencies in `wh_bench.orders.currency` (USD, EUR, GBP)')
    expect(brief).toContain('Non-additive rate column(s) in `wh_bench.campaign_daily` (`conversion_rate_pct`)')

    // Subsequent audits hit the session cache with 0 additional warehouse queries!
    const beforeAudit = queries.length
    const warnings = await auditWarehouseQuery({
      sql: 'SELECT c.region, SUM(o.amount) AS rev FROM wh_bench.orders o JOIN wh_bench.customers c ON o.customer_id = c.customer_id JOIN wh_bench.shipments s ON o.order_id = s.order_id WHERE promo_code != \'SAVE10\' GROUP BY 1',
      dataset: makeDataset([{ region: 'North America', rev: 100 }]),
      warehouse: connector,
      deep: true,
      cache,
    })
    const kinds = warnings.map(w => w.kind)
    expect(kinds).toContain('join_fanout')
    expect(kinds).toContain('null_exclusion')
    expect(kinds).toContain('mixed_currency')
    // Only outlierProbe (not populated by profile) may run; grain, null, currency were 0-query cache hits.
    expect(queries.length - beforeAudit).toBeLessThanOrEqual(1)
  })
})

describe('warehouse audit upgrades & caching', () => {
  it('does not trigger false-positive join_fanout warnings from APPROX_COUNT_DISTINCT HLL noise on unique keys', async () => {
    const { connector, queries } = makeFakeWarehouse(() => [{
      _n: 400_000,
      _kc_0: 400_000,
      // HLL ~0.8% undercount on a unique primary key
      _kd_0: 396_747,
    }], {
      dialect: {
        quoteName: backtickName,
        approxCountDistinct: expr => `APPROX_COUNT_DISTINCT(${expr})`,
      },
      describeTables: async () => [ACME_SCHEMAS[2]],
    })
    const cache = createWarehouseSessionCache()
    await profileWarehouse(connector, { isPro: true, cache })
    const before = queries.length
    const warnings = await auditWarehouseQuery({
      sql: 'SELECT c.region, SUM(o.amount) AS rev FROM wh_bench.orders o JOIN wh_bench.customers c ON o.customer_id = c.customer_id GROUP BY 1',
      dataset: makeDataset([{ region: 'North America', rev: 100 }]),
      warehouse: connector,
      deep: true,
      cache,
    })
    expect(warnings.map(w => w.kind)).not.toContain('join_fanout')
    expect(queries.length).toBe(before)
  })

  it('skips deep probes on INFORMATION_SCHEMA and plain LIMIT previews', async () => {
    const { connector, queries } = makeFakeWarehouse(() => [{ total_rows: 100, distinct_keys: 50 }])
    await auditWarehouseQuery({
      sql: 'SELECT table_name, column_name FROM wh_bench.INFORMATION_SCHEMA.COLUMNS',
      dataset: makeDataset([{ table_name: 'orders', column_name: 'amount' }]),
      warehouse: connector,
      deep: true,
    })
    await auditWarehouseQuery({
      sql: 'SELECT * FROM wh_bench.orders LIMIT 5',
      dataset: makeDataset([{ order_id: 'O1', amount: 10 }]),
      warehouse: connector,
      deep: true,
    })
    expect(queries).toHaveLength(0)
  })

  it('caches probe results across repeated queries in the same session', async () => {
    const { connector, queries } = makeFakeWarehouse(() => [{ n: 500, med: 100, total_sum: 80_000, extreme_count: 0, extreme_sum: 0 }])
    const cache = createWarehouseSessionCache()
    const sql = 'SELECT region, SUM(amount) AS rev FROM wh_bench.orders GROUP BY 1'
    await auditWarehouseQuery({ sql, dataset: makeDataset([{ region: 'NA', rev: 100 }]), warehouse: connector, deep: true, cache })
    const afterFirst = queries.length
    expect(afterFirst).toBe(1)
    await auditWarehouseQuery({ sql, dataset: makeDataset([{ region: 'NA', rev: 100 }]), warehouse: connector, deep: true, cache })
    expect(queries).toHaveLength(afterFirst)
  })

  it('emits empty_filter warning with sample values when an equality filter returns 0 rows', async () => {
    const { connector } = makeFakeWarehouse(() => [{ vals: 'North America, EMEA, APAC, LATAM' }])
    const warnings = await auditWarehouseQuery({
      sql: 'SELECT COUNT(*) AS n FROM wh_bench.customers WHERE region = \'north america\'',
      dataset: makeDataset([]),
      warehouse: connector,
      deep: true,
    })
    expect(warnings.map(w => w.kind)).toContain('empty_filter')
    expect(warnings[0].detail).toContain('\'North America\'')
  })

  it('emits duplicate_ids warning when cached schema has an order_id column with duplicates', async () => {
    const { connector } = makeFakeWarehouse(() => [{ total_rows: 2000, distinct_keys: 1000 }])
    const cache = createWarehouseSessionCache()
    cache.schemas.set('wh_bench.orders', ACME_SCHEMAS[0])
    const warnings = await auditWarehouseQuery({
      sql: 'SELECT SUM(amount) AS total FROM wh_bench.orders',
      dataset: makeDataset([{ total: 1000 }]),
      warehouse: connector,
      deep: true,
      cache,
    })
    expect(warnings.map(w => w.kind)).toContain('duplicate_ids')
  })
})

describe('warehouse SQL repair hints', () => {
  it('returns the full 0-scan metadata catalog when multiple datasets exceed the probe cap and no tables filter was passed', async () => {
    const manySchemas: WarehouseTableSchema[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `other_ds.t${i}`, rowCount: 100, columns: [{ name: 'id', type: 'STRING' }] })),
      ...ACME_SCHEMAS,
    ]
    const { connector, queries } = makeFakeWarehouse(() => [], { describeTables: async () => manySchemas })
    const out = await profileWarehouse(connector, { isPro: true, cache: createWarehouseSessionCache() })
    expect(queries).toHaveLength(0)
    expect(out).toContain('Catalog of **BigQuery** (11 tables across 2 datasets')
    expect(out).toContain('`wh_bench.orders`')
    expect(out).toContain('Pass `tables: ["<dataset>"]`')
  })

  it('gives targeted BigQuery fixes for MEDIAN, mixed aggregate/window errors, LIMIT, COUNTIF, missing tables, and fuzzy column names', () => {
    const med = formatWarehouseSqlRepairHint('bigquery', 'Function not found: MEDIAN at [1:23]', 'SELECT MEDIAN(amount) FROM t')
    expect(med).toContain('APPROX_QUANTILES')

    const grp = formatWarehouseSqlRepairHint('bigquery', 'SELECT list expression references column rev which is neither grouped nor aggregated', 'SELECT COUNT(*), PERCENTILE_CONT(rev, 0.99) OVER () FROM na')
    expect(grp).toContain('CTE')
    expect(grp).toContain('ANY_VALUE')

    const lim = formatWarehouseSqlRepairHint('bigquery', 'LIMIT expects an integer literal or parameter', 'SELECT * FROM t LIMIT CEIL(n * 0.01)')
    expect(lim).toContain('ROW_NUMBER()')

    const cif = formatWarehouseSqlRepairHint('bigquery', 'No matching signature for aggregate function COUNTIF Argument types: INT64', 'SELECT COUNTIF(has_q3) FROM t')
    expect(cif).toContain('BOOL')

    const tbl = formatWarehouseSqlRepairHint('bigquery', 'Not found: Table tinypivot-bq-test:acme.customers was not found', 'SELECT * FROM acme.customers', ACME_SCHEMAS)
    expect(tbl).toContain('`wh_bench.customers`')

    const col = formatWarehouseSqlRepairHint('bigquery', 'Name order_amount not found inside o at [3:22]', 'SELECT o.order_amount FROM orders o', ACME_SCHEMAS)
    expect(col).toContain('`amount`')
    expect(col).toContain('`wh_bench.orders`')
  })

  it('gives dialect hints for Snowflake, Postgres and MySQL', () => {
    expect(formatWarehouseSqlRepairHint('postgres', 'function countif does not exist', 'SELECT COUNTIF(x > 0) FROM t')).toContain('FILTER (WHERE')
    expect(formatWarehouseSqlRepairHint('snowflake', 'Unknown function SAFE_DIVIDE', 'SELECT SAFE_DIVIDE(a, b) FROM t')).toContain('DIV0NULL')
    expect(formatWarehouseSqlRepairHint('mysql', 'FUNCTION db.DATE_TRUNC does not exist', 'SELECT DATE_TRUNC(d, MONTH) FROM t')).toContain('DATE_FORMAT')
  })
})

describe('mCP server warehouse profile & batch queries[] integration', () => {
  let signer: ReturnType<typeof installTestLicenseKeypair>

  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    signer = installTestLicenseKeypair()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    signer.restore()
  })

  function fakeBqClient(): BigQueryClientLike {
    return {
      async createQueryJob(options) {
        const sql = String(options.query)
        if (sql.includes('order_amount'))
          throw new Error('Name order_amount not found inside o at [1:8]')
        const rows = sql.includes('AS _n')
          ? [{ _n: 100, _kc_0: 100, _kd_0: 100, _dmin_0: '2026-01-01', _dmax_0: '2026-11-12', _null_0: 70, _dist_0: 2, _vals_0: 'SAVE10, VIP' }]
          : [{ region: 'North America', total: 500 }]
        return [{
          metadata: options.dryRun ? { statistics: { query: { statementType: 'SELECT', totalBytesProcessed: '1000', referencedTables: [] } } } : {},
          getQueryResults: async () => [rows],
        }]
      },
      getDatasets: async () => [[{ id: 'wh_bench' }]],
      dataset: () => ({
        getTables: async () => [[{ id: 'orders' }]],
        table: () => ({
          getMetadata: async () => [{
            numRows: '100',
            schema: {
              fields: [
                { name: 'order_id', type: 'STRING' },
                { name: 'order_date', type: 'DATE' },
                { name: 'promo_code', type: 'STRING' },
                { name: 'amount', type: 'NUMERIC' },
              ],
            },
          }],
        }),
      }),
    }
  }

  async function connectServer(licenseKey?: string) {
    const config: BigQueryConfig = { projectId: 'acme-analytics', maxBytes: 1e10, maxRows: 100, timeoutMs: 5000 }
    const { server } = createTinyPivotMcpServer({
      licenseKey,
      warehouses: [bigQueryConnector(config, async () => fakeBqClient())],
    })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: {} })
    await server.connect(st)
    await client.connect(ct)
    return client
  }

  it('supports profile(warehouse="bigquery"), batched query_bigquery(queries[]), and column-name repair hints on error', async () => {
    const client = await connectServer(signer.signLicense('MCPP'))
    expect(client.getInstructions()).toContain('profile(warehouse="bigquery"')

    const prof = await client.callTool({ name: 'profile', arguments: { warehouse: 'bigquery' } })
    const profText = (prof.content as Array<{ text: string }>).map(p => p.text).join('\n')
    expect(prof.isError).toBeFalsy()
    expect(profText).toContain('`wh_bench.orders` (100 rows)')
    expect(profText).toContain('promo_code')

    const batch = await client.callTool({
      name: 'query_bigquery',
      arguments: {
        queries: [
          'SELECT COUNT(*) AS n FROM wh_bench.orders',
          'SELECT region, SUM(amount) AS total FROM wh_bench.orders GROUP BY 1',
        ],
        why: 'Batch summary',
      },
    })
    const batchText = (batch.content as Array<{ text: string }>).map(p => p.text).join('\n')
    expect(batch.isError).toBeFalsy()
    expect(batchText).toContain('Batch Query 1/2')

    const bad = await client.callTool({
      name: 'query_bigquery',
      arguments: { sql: 'SELECT o.order_amount FROM wh_bench.orders o', why: 'Bad column' },
    })
    const badText = (bad.content as Array<{ text: string }>).map(p => p.text).join('\n')
    expect(bad.isError).toBe(true)
    expect(badText).toContain('SQL repair hint:')
    expect(badText).toContain('`amount`')
  })

  it('runs sequential probes safely on single-session connectors like Snowflake', async () => {
    let active = 0
    let maxActive = 0
    const { connector } = makeFakeWarehouse(() => [{ _n: 10 }], {
      id: 'snowflake',
      label: 'Snowflake',
      toolName: 'query_snowflake',
      concurrent: false,
      dialect: { quoteName: plainName },
      query: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 10))
        active--
        return { rows: [{ _n: 10 }], truncated: false }
      },
    })
    await profileWarehouse(connector, { isPro: true, cache: createWarehouseSessionCache() })
    expect(maxActive).toBe(1)
  })
})
