// @vitest-environment node
import type { WarehouseConnector } from '../../packages/mcp/src/warehouse'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { warehousesFromEnv } from '../../packages/mcp/src/server'
import { QueryRefused } from '../../packages/mcp/src/warehouse'

/**
 * Live checks against real warehouses: `pnpm test:live`.
 *
 * Reads ~/.config/tinypivot-test/live.json (never committed), one entry per warehouse:
 *   { "snowflake": { "env": { TINYPIVOT_SNOWFLAKE_*… }, "total": { "sql": "…", "expect": { "TOTAL": 1 } }, "bigTable": "ACME.SALES.ORDERS" } }
 * A warehouse missing from the file is skipped. Credentials stay in that file, the key files it
 * points to, or the CLI sign-ins they name.
 */
interface LiveTarget {
  env: Record<string, string>
  total?: { sql: string, expect: Record<string, unknown> }
  bigTable?: string
}

const CONFIG = path.join(os.homedir(), '.config', 'tinypivot-test', 'live.json')
const enabled = process.env.TINYPIVOT_LIVE === '1' && fs.existsSync(CONFIG)
const targets: Record<string, LiveTarget> = enabled ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : {}

function connectorFor(id: string, target: LiveTarget): WarehouseConnector {
  const connector = warehousesFromEnv(target.env).find(w => w.id === id)
  if (!connector)
    throw new Error(`live.json settings for ${id} did not configure a connector`)
  return connector
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
  })
}

describe.skipIf(enabled)('live warehouse tests', () => {
  it('are off: run `pnpm test:live` with ~/.config/tinypivot-test/live.json', () => {})
})
