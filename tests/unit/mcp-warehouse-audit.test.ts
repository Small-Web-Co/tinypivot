import type { BigQueryClientLike, BigQueryConfig } from '../../packages/mcp/src/bigquery'
import type { StoredDataset } from '../../packages/mcp/src/store'
import type { SqlDialect } from '../../packages/mcp/src/warehouse'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keyGrainSql } from '../../packages/mcp/src/audit'
import { bigQueryConnector } from '../../packages/mcp/src/bigquery'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { postgresConnector } from '../../packages/mcp/src/postgres'
import { backtickName, plainName } from '../../packages/mcp/src/warehouse'
import { auditWarehouseQuery, bucketDateColumn } from '../../packages/mcp/src/warehouse-audit'
import { installTestLicenseKeypair } from '../helpers/license'

type Answer = Record<string, unknown> | Error | 'hang' | undefined

const BACKTICKS: SqlDialect = { quoteName: backtickName, median: expr => `MEDIAN(${expr})` }

/** A warehouse that answers each probe from `answer`, and records the SQL it was sent. */
function fakeWarehouse(answer: (sql: string) => Answer, dialect: SqlDialect = BACKTICKS) {
  const probes: string[] = []
  const warehouse = {
    dialect,
    query: async (sql: string) => {
      probes.push(sql)
      const reply = answer(sql)
      if (reply === 'hang')
        return new Promise<never>(() => {})
      if (reply instanceof Error)
        throw reply
      return { rows: reply ? [reply] : [], truncated: false }
    },
  }
  return { warehouse, probes }
}

function result(rows: Record<string, unknown>[]): StoredDataset {
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

const REGION_ROWS = [{ region: 'EMEA', revenue: 1200 }, { region: 'APAC', revenue: 800 }]
const MONTH_ROWS = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map((month, i) => ({ month, revenue: 30_000 - i }))
const JOIN_SQL = 'SELECT o.region, SUM(o.revenue) AS revenue FROM sales.orders o JOIN sales.reps r ON o.account_id = r.account_id GROUP BY 1'
const PERIOD_SQL = 'SELECT DATE_TRUNC(order_date, MONTH) AS month, SUM(revenue) AS revenue FROM sales.orders GROUP BY 1 ORDER BY 1'

/** Month stats for Jan–Apr 2026; April has `aprilDays` active days. */
function monthDays(aprilDays: number, upper = false): Record<string, unknown> {
  const days = [31, 28, 31, aprilDays]
  const row = Object.fromEntries(days.flatMap((d, i) => [
    [`days_${i}`, d],
    [`max_day_${i}`, `2026-0${i + 1}-${String(d).padStart(2, '0')}`],
    [`metric_${i}`, d * 1000],
  ]))
  return upper ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toUpperCase(), v])) : row
}

const kinds = (warnings: Array<{ kind: string }>) => warnings.map(w => w.kind)

describe('warehouse join fan-out audit', () => {
  it('flags a joined table that is not unique on its join key, probing it as the query named it', async () => {
    const { warehouse, probes } = fakeWarehouse(sql => (sql.includes('key_grain') ? { total_rows: 1200, distinct_keys: 600 } : undefined))
    const warnings = await auditWarehouseQuery({ sql: JOIN_SQL, dataset: result(REGION_ROWS), warehouse, deep: true })

    expect(kinds(warnings)).toEqual(['join_fanout'])
    expect(warnings[0].detail).toContain('Joined table `sales.reps` is NOT unique on `account_id` (1,200 rows for 600 distinct keys — 2.00×')
    expect(probes[0]).toBe(keyGrainSql('sales.reps', ['`account_id`']))
  })

  it('stays quiet when the joined table has one row per key', async () => {
    const { warehouse } = fakeWarehouse(sql => (sql.includes('key_grain') ? { total_rows: 600, distinct_keys: 600 } : undefined))
    expect(await auditWarehouseQuery({ sql: JOIN_SQL, dataset: result(REGION_ROWS), warehouse, deep: true })).toEqual([])
  })

  it('keeps a backticked project.dataset.table reference verbatim', async () => {
    const { warehouse, probes } = fakeWarehouse(() => undefined)
    const sql = 'SELECT o.region, COUNT(*) AS n FROM `acme-analytics.sales.orders` o LEFT JOIN `acme-analytics.sales.reps` AS r USING (account_id) GROUP BY 1'
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(probes).toEqual([keyGrainSql('`acme-analytics.sales.reps`', ['`account_id`'])])
  })
})

describe('warehouse partial-period audit', () => {
  it('flags a trailing month with far fewer active days, reading the date column from the bucketing expression', async () => {
    const { warehouse, probes } = fakeWarehouse(sql => (sql.includes('days_0') ? monthDays(6) : undefined))
    const warnings = await auditWarehouseQuery({ sql: PERIOD_SQL, dataset: result(MONTH_ROWS), warehouse, deep: true })

    expect(kinds(warnings)).toEqual(['partial_period'])
    expect(warnings[0].detail).toContain('Latest period `2026-04` only spans 6 active days (through 2026-04-06')
    expect(warnings[0].detail).toContain('Daily run-rate (revenue/day)')
    expect(warnings[0].suggestion).toContain('WHERE order_date < \'2026-04-01\'')
    const period = probes.find(sql => sql.includes('days_0'))!
    expect(period).toContain('`order_date` >= \'2026-04-01\' AND `order_date` < \'2026-05-01\'')
    expect(period).toMatch(/FROM sales\.orders WHERE `order_date` >= '2026-01-01' AND `order_date` < '2026-05-01'$/)
  })

  it('stays quiet when the trailing month is complete', async () => {
    const { warehouse } = fakeWarehouse(sql => (sql.includes('days_0') ? monthDays(30) : undefined))
    expect(await auditWarehouseQuery({ sql: PERIOD_SQL, dataset: result(MONTH_ROWS), warehouse, deep: true })).toEqual([])
  })

  it('reads Snowflake-style upper-cased result and probe columns', async () => {
    const { warehouse, probes } = fakeWarehouse(sql => (sql.includes('days_0') ? monthDays(6, true) : undefined), { quoteName: plainName })
    const rows = MONTH_ROWS.map(r => ({ MONTH: `${r.month} 00:00:00.000`, REVENUE: r.revenue }))
    const sql = 'SELECT DATE_TRUNC(\'MONTH\', order_date) AS month, SUM(revenue) AS revenue FROM acme.sales.orders GROUP BY 1'
    const warnings = await auditWarehouseQuery({ sql, dataset: result(rows), warehouse, deep: true })
    expect(kinds(warnings)).toEqual(['partial_period'])
    expect(probes[0]).toContain('order_date >= \'2026-04-01\'')
  })

  it('finds the date column in each dialect\'s month bucketing', () => {
    expect(bucketDateColumn('SELECT DATE_TRUNC(order_date, MONTH) AS month FROM t', 'month')).toBe('order_date')
    expect(bucketDateColumn('SELECT DATE_TRUNC(\'month\', o.order_date)::date AS m, SUM(x) FROM t o', 'm')).toBe('order_date')
    expect(bucketDateColumn('SELECT region, toStartOfMonth(created_at) AS month FROM t', 'month')).toBe('created_at')
    expect(bucketDateColumn('SELECT DATE_FORMAT(`order_date`, \'%Y-%m\') AS ym FROM t', 'ym')).toBe('order_date')
    expect(bucketDateColumn('SELECT FORMAT_DATE(\'%Y-%m\', DATE(created_at, \'UTC\')) AS ym FROM t', 'ym')).toBe('created_at')
    expect(bucketDateColumn('SELECT month, SUM(x) FROM t GROUP BY 1', 'month')).toBeUndefined()
  })
})

describe('warehouse NULL-exclusion audit', () => {
  const sql = 'SELECT region, SUM(revenue) AS revenue FROM sales.orders WHERE discount_code != \'PROMO20\' GROUP BY 1'

  it('flags a != filter that silently drops NULL rows', async () => {
    const { warehouse, probes } = fakeWarehouse(probe => (probe.includes('null_rows') ? { total_rows: 1000, null_rows: 250 } : undefined))
    const warnings = await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(kinds(warnings)).toEqual(['null_exclusion'])
    expect(warnings[0].detail).toContain('silently excludes 250 NULL rows (25% of `sales.orders`)')
    expect(probes).toContain('SELECT COUNT(*) AS total_rows, SUM(CASE WHEN `discount_code` IS NULL THEN 1 ELSE 0 END) AS null_rows FROM sales.orders')
  })

  it('stays quiet, without probing, when the filter keeps NULLs', async () => {
    const { warehouse, probes } = fakeWarehouse(() => ({ total_rows: 1000, null_rows: 250 }))
    const safe = 'SELECT region, SUM(revenue) AS revenue FROM sales.orders WHERE discount_code IS DISTINCT FROM \'PROMO20\' GROUP BY 1'
    await auditWarehouseQuery({ sql: safe, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(probes.some(probe => probe.includes('null_rows'))).toBe(false)
  })
})

describe('warehouse outlier audit', () => {
  const sql = 'SELECT region, SUM(revenue) AS revenue FROM sales.orders GROUP BY 1'

  it('flags a few extreme rows that carry a large share of the total', async () => {
    const { warehouse } = fakeWarehouse(probe => (probe.includes('src_stats') ? { n: 500, med: 100, total_sum: 80_000, extreme_count: 2, extreme_sum: 30_000 } : undefined))
    const warnings = await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(kinds(warnings)).toEqual(['outlier_distortion'])
    expect(warnings[0].detail).toBe('2 extreme rows in `sales.orders.revenue` (median magnitude 100) contribute 30,000 to `SUM(revenue)` (excluding them: 50,000).')
  })

  it('stays quiet when no row is extreme', async () => {
    const { warehouse } = fakeWarehouse(probe => (probe.includes('src_stats') ? { n: 500, med: 100, total_sum: 80_000, extreme_count: 0, extreme_sum: 0 } : undefined))
    expect(await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })).toEqual([])
  })

  it('uses each database\'s own median, and skips the check where there is none (MySQL)', async () => {
    const pg = fakeWarehouse(() => undefined, postgresConnector({ connectionString: 'postgres://acme@localhost/acme' }).dialect)
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse: pg.warehouse, deep: true })
    expect(pg.probes[0]).toContain('PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(revenue))')

    const config: BigQueryConfig = { projectId: 'acme-analytics', maxBytes: 1e9, maxRows: 10, timeoutMs: 1000 }
    const bq = fakeWarehouse(() => undefined, bigQueryConnector(config, async () => ({}) as BigQueryClientLike).dialect)
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse: bq.warehouse, deep: true })
    expect(bq.probes[0]).toContain('APPROX_QUANTILES(ABS(`revenue`), 2)[OFFSET(1)]')

    const mysql = fakeWarehouse(() => undefined, { quoteName: backtickName })
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse: mysql.warehouse, deep: true })
    expect(mysql.probes).toEqual([])
  })
})

describe('warehouse audit budget', () => {
  it('never probes an unqualified column of a joined query against the first table', async () => {
    const { warehouse, probes } = fakeWarehouse(() => undefined)
    const sql = 'SELECT region, SUM(revenue) AS revenue FROM sales.orders o JOIN sales.reps r ON o.account_id = r.account_id WHERE discount_code != \'X\' GROUP BY 1'
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(probes).toEqual([keyGrainSql('sales.reps', ['`account_id`'])])
  })

  it('sends at most 3 probes, however many checks apply', async () => {
    const { warehouse, probes } = fakeWarehouse(() => undefined)
    const sql = `SELECT o.region, SUM(o.revenue) AS revenue FROM sales.orders o
      JOIN sales.reps r ON o.account_id = r.account_id
      JOIN sales.regions g ON o.region_id = g.region_id
      JOIN sales.plans p ON o.plan_id = p.plan_id
      WHERE o.discount_code != 'X' GROUP BY 1`
    await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(probes).toHaveLength(3)
  })

  it('keeps the static audits and adds no warning when a probe fails', async () => {
    const { warehouse, probes } = fakeWarehouse(() => new Error('Query refused: over the scan limit'))
    const sql = 'SELECT region, SUM(conversion_rate) AS conv FROM sales.orders o JOIN sales.reps r ON o.account_id = r.account_id GROUP BY 1'
    const warnings = await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true })
    expect(probes.length).toBeGreaterThan(0)
    expect(kinds(warnings)).toEqual(['non_additive_sql'])
  })

  it('gives up on a probe that outlasts the time budget, keeping the ones that answered', async () => {
    const { warehouse } = fakeWarehouse(sql => (sql.includes('key_grain') ? 'hang' : { total_rows: 1000, null_rows: 250 }))
    const sql = 'SELECT o.region, COUNT(*) AS n FROM sales.orders o JOIN sales.reps r ON o.account_id = r.account_id WHERE o.discount_code != \'X\' GROUP BY 1'
    const started = Date.now()
    const warnings = await auditWarehouseQuery({ sql, dataset: result(REGION_ROWS), warehouse, deep: true, timeoutMs: 30 })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(kinds(warnings)).toEqual(['null_exclusion'])
  })

  it('runs only the static audits without the deep (Pro) audits', async () => {
    const { warehouse, probes } = fakeWarehouse(() => ({ total_rows: 1200, distinct_keys: 600 }))
    const warnings = await auditWarehouseQuery({ sql: JOIN_SQL, dataset: result(REGION_ROWS), warehouse, deep: false })
    expect(warnings).toEqual([])
    expect(probes).toEqual([])
  })
})

describe('query_bigquery audits', () => {
  let signer: ReturnType<typeof installTestLicenseKeypair>

  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    signer = installTestLicenseKeypair()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    signer.restore()
  })

  /** A BigQuery client whose probe jobs answer with `probe`, or fail when it is an Error. */
  function probingClient(probe: Record<string, unknown> | Error): BigQueryClientLike {
    return {
      async createQueryJob(options) {
        const query = String(options.query)
        if (query.includes('key_grain') && probe instanceof Error)
          throw probe
        const rows = query.includes('key_grain') ? [probe] : REGION_ROWS
        return [{
          metadata: options.dryRun ? { statistics: { query: { statementType: 'SELECT', totalBytesProcessed: '1000000', referencedTables: [] } } } : {},
          getQueryResults: async () => [rows],
        }]
      },
      getDatasets: async () => [[]],
      dataset: () => ({ getTables: async () => [[]] }),
    }
  }

  async function callBigQuery(probe: Record<string, unknown> | Error) {
    const config: BigQueryConfig = { projectId: 'acme-analytics', maxBytes: 1e10, maxRows: 100, timeoutMs: 1000 }
    const { server } = createTinyPivotMcpServer({
      licenseKey: signer.signLicense('MCPP'),
      warehouses: [bigQueryConnector(config, async () => probingClient(probe))],
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const res = await client.callTool({ name: 'query_bigquery', arguments: { sql: 'SELECT o.region, COUNT(*) AS revenue FROM sales.orders o JOIN sales.reps r ON o.account_id = r.account_id GROUP BY 1', why: 'Acme revenue by region' } })
    return { isError: res.isError, text: (res.content as Array<{ text: string }>).map(part => part.text).join('\n') }
  }

  it('adds the Pro [AUDIT] warning to a fanned-out BigQuery join', async () => {
    const { isError, text } = await callBigQuery({ total_rows: 1200, distinct_keys: 600 })
    expect(isError).toBeFalsy()
    expect(text).toContain('[AUDIT — VERIFY BEFORE ANSWERING]')
    expect(text).toContain('JOIN FAN-OUT / DOUBLE-COUNTING RISK')
  })

  it('still returns the result when the probe fails', async () => {
    const { isError, text } = await callBigQuery(new Error('Access Denied: Table acme-analytics:sales.reps'))
    expect(isError).toBeFalsy()
    expect(text).toContain('BigQuery scanned 1.0 MB')
    expect(text).not.toContain('[AUDIT')
  })
})
