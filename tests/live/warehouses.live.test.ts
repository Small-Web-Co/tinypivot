// @vitest-environment node
import type { StoredDataset } from '../../packages/mcp/src/store'
import type { WarehouseConnector } from '../../packages/mcp/src/warehouse'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { warehousesFromEnv } from '../../packages/mcp/src/server'
import { inferColumns } from '../../packages/mcp/src/store'
import { QueryRefused } from '../../packages/mcp/src/warehouse'
import { runWarehouseAnalysis } from '../../packages/mcp/src/warehouse-analyze'
import { auditWarehouseQuery } from '../../packages/mcp/src/warehouse-audit'
import { formatWarehouseSqlRepairHint } from '../../packages/mcp/src/warehouse-hints'
import { createWarehouseSessionCache, listCachedSchemas, profileWarehouse } from '../../packages/mcp/src/warehouse-profile'

/**
 * Live checks against real warehouses: `pnpm test:live`.
 *
 * Reads targets from:
 *   1) ~/.config/tinypivot-test/live.json (never committed), one entry per warehouse
 *   2) CI / local container env vars:
 *      TINYPIVOT_LIVE_PG_URL, TINYPIVOT_LIVE_MYSQL_URL, TINYPIVOT_LIVE_CH_URL
 *      (seeded by `node scripts/seed-warehouse-fixtures.mjs`)
 */
interface LiveTarget {
  env: Record<string, string>
  total?: { sql: string, expect: Record<string, unknown> }
  bigTable?: string
  profileTables?: string[]
  /** Set true when seeded by scripts/seed-warehouse-fixtures.mjs (enables full trap & 5-method analyze contract). */
  seeded?: boolean
  tablePrefix?: string
}

const CONFIG = path.join(os.homedir(), '.config', 'tinypivot-test', 'live.json')
const fileTargets: Record<string, LiveTarget> = process.env.TINYPIVOT_LIVE === '1' && fs.existsSync(CONFIG)
  ? JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  : {}

const envTargets: Record<string, LiveTarget> = {}
if (process.env.TINYPIVOT_LIVE === '1') {
  if (process.env.TINYPIVOT_LIVE_PG_URL) {
    envTargets.postgres = {
      env: { DATABASE_URL: process.env.TINYPIVOT_LIVE_PG_URL },
      profileTables: ['orders', 'shipments', 'campaign_daily', 'ab_users', 'accounts'],
      seeded: true,
      tablePrefix: '',
    }
  }
  if (process.env.TINYPIVOT_LIVE_MYSQL_URL) {
    const db = new URL(process.env.TINYPIVOT_LIVE_MYSQL_URL).pathname.replace(/^\//, '') || 'acme'
    envTargets.mysql = {
      env: { TINYPIVOT_MYSQL_URL: process.env.TINYPIVOT_LIVE_MYSQL_URL },
      profileTables: [`${db}.orders`, `${db}.shipments`, `${db}.campaign_daily`, `${db}.ab_users`, `${db}.accounts`],
      seeded: true,
      tablePrefix: `${db}.`,
    }
  }
  if (process.env.TINYPIVOT_LIVE_CH_URL) {
    const db = new URL(process.env.TINYPIVOT_LIVE_CH_URL).pathname.replace(/^\//, '') || 'acme'
    envTargets.clickhouse = {
      env: { TINYPIVOT_CLICKHOUSE_URL: process.env.TINYPIVOT_LIVE_CH_URL },
      profileTables: [`${db}.orders`, `${db}.shipments`, `${db}.campaign_daily`, `${db}.ab_users`, `${db}.accounts`],
      seeded: true,
      tablePrefix: `${db}.`,
    }
  }
}

const targets: Record<string, LiveTarget> = { ...fileTargets, ...envTargets }
const enabled = process.env.TINYPIVOT_LIVE === '1' && Object.keys(targets).length > 0

function connectorFor(id: string, target: LiveTarget): WarehouseConnector {
  const connector = warehousesFromEnv(target.env).find(w => w.id === id)
  if (!connector)
    throw new Error(`live settings for ${id} did not configure a connector`)
  return connector
}

function synthDataset(rows: Record<string, unknown>[]): StoredDataset {
  return {
    id: 'live',
    name: 'live',
    source: 'warehouse',
    ingestionMode: 'direct',
    rawBytes: 0,
    estimatedDatasetTokens: 0,
    rows,
    columns: inferColumns(rows),
    sourceTotalRows: rows.length,
    truncatedForFreeTier: false,
    viewMode: 'grid',
    loadedAt: new Date().toISOString(),
  }
}

const WRITES = ['DELETE FROM acme_orders', 'CREATE TABLE tp_live_x AS SELECT 1 AS a', 'SELECT 1; DROP TABLE acme_orders', 'SELECT \'--\', 1; DELETE FROM acme_orders']

for (const id of ['bigquery', 'snowflake', 'databricks', 'clickhouse', 'mysql', 'postgres']) {
  const target = targets[id]
  describe.skipIf(!target)(`${id} (live)`, () => {
    const warehouse = () => connectorFor(id, target!)

    it('runs a SELECT and lists tables', async () => {
      const result = await warehouse().query('SELECT 1 AS n')
      expect(Object.values(result.rows[0])).toEqual([1])
      expect(Array.isArray(await warehouse().listTables())).toBe(true)
    }, 120_000)

    it.skipIf(!target?.total)('returns exact totals', async () => {
      const result = await warehouse().query(target!.total!.sql)
      expect(result.rows[0]).toMatchObject(target!.total!.expect)
    }, 120_000)

    it.skipIf(!target?.bigTable)('cuts a large result at the row cap', async () => {
      const connector = warehouse()
      const result = await connector.query(`SELECT * FROM ${target!.bigTable}`)
      expect(result.rows.length).toBe(connector.maxRows)
      expect(result.truncated).toBe(true)
    }, 120_000)

    it('refuses writes and stacked statements before they reach the warehouse', async () => {
      for (const sql of WRITES)
        await expect(warehouse().query(sql), sql).rejects.toBeInstanceOf(QueryRefused)
    }, 120_000)

    it('describes and profiles tables in 1 call', async () => {
      const w = warehouse()
      const cache = createWarehouseSessionCache()
      const requested = target!.profileTables ?? (target!.bigTable ? [target!.bigTable.replace(/`/g, '')] : undefined)
      const schemas = await w.describeTables!(requested)
      expect(schemas.length).toBeGreaterThan(0)
      const prof = await profileWarehouse(w, { isPro: true, tables: requested, cache })
      expect(prof).toContain(w.label)
      expect(listCachedSchemas(cache).length).toBeGreaterThan(0)
    }, 120_000)

    it.skipIf(!target?.seeded)('runs Pro audits, all 5 SQL-pushed analyze methods, and column repair hints', async () => {
      const w = warehouse()
      const pfx = target!.tablePrefix ?? ''
      const cache = createWarehouseSessionCache()
      const orders = `${pfx}orders`
      const shipments = `${pfx}shipments`
      const campaign = `${pfx}campaign_daily`
      const abUsers = `${pfx}ab_users`
      const accounts = `${pfx}accounts`

      await profileWarehouse(w, { isPro: true, tables: [orders, shipments, campaign, abUsers, accounts], cache })

      // 1) Pro audit: catches join fan-out & mixed currency
      const fanSql = `SELECT o.status, SUM(o.amount) AS rev FROM ${orders} o JOIN ${shipments} s ON o.order_id = s.order_id GROUP BY o.status`
      const fanRes = await w.query(fanSql)
      const warnings = await auditWarehouseQuery({ warehouse: w, sql: fanSql, dataset: synthDataset(fanRes.rows), deep: true, cache })
      const kinds = warnings.map(x => x.kind)
      expect(kinds).toContain('join_fanout')
      expect(kinds).toContain('mixed_currency')

      // 2) All 5 SQL-pushed analyze methods
      const anom = await runWarehouseAnalysis({ warehouse: w, table: campaign, input: { method: 'anomalies', dateField: 'date', metric: 'conversions' }, cache, proGuards: true })
      expect(anom.flags.length).toBeGreaterThan(0)

      const cohort = await runWarehouseAnalysis({ warehouse: w, table: orders, input: { method: 'cohort_retention', entityField: 'customer_id', dateField: 'order_date' }, cache, proGuards: true })
      expect(cohort.flags).toContain('right_censored_cohorts')

      const explain = await runWarehouseAnalysis({ warehouse: w, table: campaign, input: { method: 'explain_change', periodField: 'date', numerator: 'conversions', denominator: 'sessions', dimensions: ['channel'] }, cache, proGuards: true })
      expect(explain.rows.length).toBeGreaterThan(0)

      const ab = await runWarehouseAnalysis({ warehouse: w, table: abUsers, input: { method: 'ab_test', variantField: 'variant', segmentField: 'segment', metric: 'revenue' }, cache, proGuards: true })
      expect(ab.flags).toContain('srm_detected')

      const reg = await runWarehouseAnalysis({ warehouse: w, table: accounts, input: { method: 'regression', target: 'renewed_val', features: ['discount_pct'], controls: ['enterprise_score'] }, cache, proGuards: true })
      expect(reg.flags).toContain('confounding_sign_reversal')

      // 3) Real-engine SQL repair hint
      const badSql = `SELECT order_amount FROM ${orders} LIMIT 1`
      let errMsg = ''
      try {
        await w.query(badSql)
      }
      catch (err) {
        errMsg = err instanceof Error ? err.message : String(err)
      }
      const hint = formatWarehouseSqlRepairHint(w.id, errMsg, badSql, listCachedSchemas(cache))
      expect(hint).toContain('`amount`')
    }, 120_000)
  })
}

describe.skipIf(enabled)('live warehouse tests', () => {
  it('are off: run `pnpm test:live` with ~/.config/tinypivot-test/live.json or TINYPIVOT_LIVE_*_URL', () => {})
})
