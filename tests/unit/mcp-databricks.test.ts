import type { DatabricksConfig, DatabricksSessionLike, FetchLike } from '../../packages/mcp/src/databricks'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  checkPlan,
  databricksConfigFromEnv,
  databricksConnector,
  findWarehousePath,
  normalizeHost,
  resolveDatabricksConnection,
  toDatabricksPlainValue,
  warehousePath,
} from '../../packages/mcp/src/databricks'

const CONFIG: DatabricksConfig = {
  host: 'dbc-1234.cloud.databricks.com',
  token: 'dapi-test',
  configFile: '/nonexistent/.databrickscfg',
  catalog: 'main',
  schema: 'sales',
  maxRows: 3,
  timeoutS: 60,
}

const READ_PLAN = `== Parsed Logical Plan ==
'Aggregate ['region], ['region, unresolvedalias('sum('mrr))]
+- 'UnresolvedRelation [orders], [], false

== Analyzed Logical Plan ==
region: string, sum(mrr): bigint
Aggregate [region#1], [region#1, sum(mrr#2) AS sum(mrr)#3L]
+- SubqueryAlias main.sales.orders
   +- Relation main.sales.orders[region#1,mrr#2] parquet

== Physical Plan ==
AdaptiveSparkPlan isFinalPlan=false
+- *(2) HashAggregate(keys=[region#1], functions=[sum(mrr#2)])
   +- Exchange hashpartitioning(region#1, 200)
      +- *(1) ColumnarToRow
         +- PhotonScan parquet main.sales.orders[region#1,mrr#2] DataFilters: [], ReadSchema: struct<region:string,mrr:bigint>`

const WRITE_PLAN = `== Analyzed Logical Plan ==
AppendData RelationV2[id#1] main.sales.orders, true
+- Project [1 AS id#1]
   +- OneRowRelation

== Physical Plan ==
AppendData org.apache.spark.sql.execution.datasources.v2.DataSourceV2Strategy$$Lambda
+- *(1) Project [1 AS id#1]`

/** Answers EXPLAIN with `explain` and every other statement with `rows`; records what ran. */
function fakeSession(options: { explain?: string, rows?: Record<string, unknown>[], fail?: Error } = {}) {
  const ran: string[] = []
  let closed = 0
  const session: DatabricksSessionLike = {
    warehouse: '/sql/1.0/warehouses/abc123',
    async run(sql, limit) {
      ran.push(sql)
      if (options.fail)
        throw options.fail
      if (sql.startsWith('EXPLAIN'))
        return [{ plan: options.explain ?? READ_PLAN }]
      return (options.rows ?? []).slice(0, limit)
    },
    async close() {
      closed += 1
    },
  }
  return { session, ran, closed: () => closed }
}

describe('databricks plan check', () => {
  it('accepts a read plan, even with write words in names', () => {
    expect(() => checkPlan(READ_PLAN)).not.toThrow()
    expect(() => checkPlan('== Physical Plan ==\n*(1) Project [insert_date#1, write_count#2]\n+- FileScan parquet main.logs.write_log[insert_date#1]')).not.toThrow()
  })

  it('refuses plans with write, DDL or command steps', () => {
    expect(() => checkPlan(WRITE_PLAN)).toThrow('includes a AppendData step')
    expect(() => checkPlan('== Physical Plan ==\nExecute InsertIntoHadoopFsRelationCommand file:/tmp, false')).toThrow('Execute InsertIntoHadoopFsRelationCommand')
    expect(() => checkPlan('== Parsed Logical Plan ==\n\'CreateTableAsSelect [main, sales, copy]')).toThrow('CreateTableAsSelect')
    expect(() => checkPlan('+- MergeIntoTable (id#1 = id#2)')).toThrow('MergeIntoTable')
    expect(() => checkPlan(':  +- WriteFiles')).toThrow('WriteFiles')
    expect(() => checkPlan('DeleteFromTable (id#1 = 1)')).toThrow('DeleteFromTable')
  })

  it('reports a planning error without running the query', () => {
    expect(() => checkPlan('== Physical Plan ==\nError occurred during query planning: \n[TABLE_OR_VIEW_NOT_FOUND] The table `nope` cannot be found.')).toThrow('could not plan this query: [TABLE_OR_VIEW_NOT_FOUND]')
  })
})

describe('databricks connector', () => {
  it('explains the query first, then runs it asking for one row past the cap', async () => {
    const fake = fakeSession({ rows: [{ region: 'EMEA', mrr: 120, day: new Date('2026-03-01T00:00:00Z') }] })
    const result = await databricksConnector(CONFIG, async () => fake.session).query('SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3;')
    expect(fake.ran).toEqual(['EXPLAIN EXTENDED SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3', 'SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3'])
    expect(result).toEqual({
      rows: [{ region: 'EMEA', mrr: 120, day: '2026-03-01' }],
      truncated: false,
      note: 'Databricks planned it as a read and ran it on SQL warehouse abc123 (60s timeout).',
    })
  })

  it('never sends a refused query to Databricks and keeps the session open', async () => {
    const fake = fakeSession()
    const connector = databricksConnector(CONFIG, async () => fake.session)
    await expect(connector.query('UPDATE orders SET mrr = 0')).rejects.toThrow('Only a read-only SELECT')
    await expect(connector.query('SELECT 1; DROP TABLE orders')).rejects.toThrow('one statement at a time')
    await expect(connector.query('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).rejects.toThrow('INSERT is not allowed')
    expect(fake.ran).toEqual([])
    expect(fake.closed()).toBe(0)
  })

  it('stops at the plan when it shows a write step, keeping the session', async () => {
    const fake = fakeSession({ explain: WRITE_PLAN })
    await expect(databricksConnector(CONFIG, async () => fake.session).query('SELECT 1')).rejects.toThrow('AppendData step')
    expect(fake.ran).toHaveLength(1)
    expect(fake.closed()).toBe(0)
  })

  it('refuses when no plan comes back', async () => {
    const fake = fakeSession({ explain: 42 as unknown as string })
    await expect(databricksConnector(CONFIG, async () => fake.session).query('SELECT 1')).rejects.toThrow('did not return a plan')
  })

  it('marks a cut result as truncated', async () => {
    const fake = fakeSession({ rows: Array.from({ length: 5 }, (_, i) => ({ id: i })) })
    const result = await databricksConnector(CONFIG, async () => fake.session).query('SELECT id FROM orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }])
  })

  it('does not mark a result of exactly the cap as truncated', async () => {
    const fake = fakeSession({ rows: Array.from({ length: 3 }, (_, i) => ({ id: i })) })
    const result = await databricksConnector(CONFIG, async () => fake.session).query('SELECT id FROM orders')
    expect(result.truncated).toBe(false)
    expect(result.rows).toHaveLength(3)
  })

  it('replaces the session after a connection error', async () => {
    const fake = fakeSession({ fail: new Error('session expired') })
    let opened = 0
    const connector = databricksConnector(CONFIG, async () => {
      opened += 1
      return fake.session
    })
    await expect(connector.query('SELECT 1')).rejects.toThrow('session expired')
    await expect(connector.query('SELECT 1')).rejects.toThrow('session expired')
    expect(opened).toBe(2)
    expect(fake.closed()).toBe(2)
  })

  it('retries opening a session that failed to connect', async () => {
    let opened = 0
    const fake = fakeSession({ rows: [{ id: 1 }] })
    const connector = databricksConnector(CONFIG, async () => {
      opened += 1
      if (opened === 1)
        throw new Error('warehouse unreachable')
      return fake.session
    })
    await expect(connector.query('SELECT 1')).rejects.toThrow('warehouse unreachable')
    expect((await connector.query('SELECT id FROM t')).rows).toEqual([{ id: 1 }])
  })

  it('lists tables from the catalog\'s information schema, filtered to the schema', async () => {
    const fake = fakeSession({ rows: [{ name: 'main.sales.orders' }, { name: 'main.sales.refunds' }] })
    expect(await databricksConnector(CONFIG, async () => fake.session).listTables()).toEqual(['main.sales.orders', 'main.sales.refunds'])
    expect(fake.ran.at(-1)).toContain('FROM `main`.information_schema.tables')
    expect(fake.ran.at(-1)).toContain('table_schema = \'sales\'')
    expect(fake.ran.at(-1)).toContain('LIMIT 200')
    await databricksConnector({ ...CONFIG, catalog: undefined, schema: undefined }, async () => fake.session).listTables()
    expect(fake.ran.at(-1)).toContain('FROM information_schema.tables WHERE')
    expect(fake.ran.at(-1)).not.toContain('table_schema =')
  })

  it('describes itself as a preview Databricks connector', () => {
    const connector = databricksConnector(CONFIG, async () => fakeSession().session)
    expect(connector).toMatchObject({ id: 'databricks', toolName: 'query_databricks', label: 'Databricks', preview: true, maxRows: 3 })
    expect(connector.sqlHint).toContain('main.sales')
  })
})

describe('databricks values', () => {
  it('turns dates, bigints, binary, structs and arrays into plain values', () => {
    expect(toDatabricksPlainValue(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01')
    expect(toDatabricksPlainValue(new Date('2026-03-01T10:30:00Z'))).toBe('2026-03-01T10:30:00.000Z')
    expect(toDatabricksPlainValue(42n)).toBe(42)
    expect(toDatabricksPlainValue(2n ** 70n)).toBe('1180591620717411303424')
    expect(toDatabricksPlainValue(Buffer.from('hi'))).toBe('aGk=')
    expect(toDatabricksPlainValue({ a: 1, b: [2n, 'x'] })).toBe('{"a":1,"b":["2","x"]}')
    expect(toDatabricksPlainValue([1, 2])).toBe('[1,2]')
    expect(toDatabricksPlainValue('12.50')).toBe('12.50')
    expect(toDatabricksPlainValue(12.5)).toBe(12.5)
    expect(toDatabricksPlainValue(true)).toBe(true)
    expect(toDatabricksPlainValue(undefined)).toBeNull()
    expect(toDatabricksPlainValue(null)).toBeNull()
  })
})

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-databricks-'))
const cfgFile = path.join(tempHome, '.databrickscfg')
fs.writeFileSync(cfgFile, `[DEFAULT]
host = https://dbc-1234.cloud.databricks.com/
token = dapi-from-file

[sp]
host = https://adb-55.11.azuredatabricks.net
client_id = sp-id
client_secret = sp-secret
warehouse_id = wh42

[cli]
host = https://dbc-9.cloud.databricks.com
auth_type = databricks-cli

[azure]
host = https://adb-66.azuredatabricks.net
auth_type = azure-cli

[broken]
host = https://dbc-7.cloud.databricks.com
auth_type = pat
`)
afterAll(() => fs.rmSync(tempHome, { recursive: true, force: true }))

describe('databricks configuration', () => {
  it('is configured only with a host or a profile', () => {
    expect(databricksConfigFromEnv({}, tempHome)).toBeUndefined()
    expect(databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_TOKEN: 't' }, tempHome)).toBeUndefined()
    expect(databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_PROFILE: 'sp' }, tempHome)).toMatchObject({ profile: 'sp', configFile: cfgFile, maxRows: 5000, timeoutS: 60 })
    expect(databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_HOST: 'h', DATABRICKS_CONFIG_FILE: '/x/cfg' }, tempHome)?.configFile).toBe('/x/cfg')
    expect(databricksConfigFromEnv({
      TINYPIVOT_DATABRICKS_HOST: 'h',
      TINYPIVOT_DATABRICKS_WAREHOUSE: 'abc',
      TINYPIVOT_DATABRICKS_CATALOG: 'main',
      TINYPIVOT_DATABRICKS_SCHEMA: 'sales',
    }, tempHome)).toMatchObject({ warehouse: 'abc', catalog: 'main', schema: 'sales' })
  })

  it('reads the profile only at connect, so a bad one fails the query and not startup', () => {
    const config = databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_PROFILE: 'missing' }, tempHome)!
    expect(config).toBeDefined()
    expect(() => resolveDatabricksConnection(config)).toThrow('Profile `missing` was not found')
  })

  it('picks a token, then a service principal, then browser sign-in from the environment', () => {
    const base = { TINYPIVOT_DATABRICKS_HOST: 'https://dbc-5.cloud.databricks.com', DATABRICKS_CONFIG_FILE: '/nonexistent' }
    const resolve = (env: NodeJS.ProcessEnv) => resolveDatabricksConnection(databricksConfigFromEnv({ ...base, ...env }, tempHome)!)
    expect(resolve({})).toEqual({ host: 'dbc-5.cloud.databricks.com', auth: { kind: 'browser' }, httpPath: undefined })
    expect(resolve({ TINYPIVOT_DATABRICKS_CLIENT_ID: 'c', TINYPIVOT_DATABRICKS_CLIENT_SECRET: 's' }).auth).toEqual({ kind: 'm2m', clientId: 'c', clientSecret: 's' })
    expect(resolve({ TINYPIVOT_DATABRICKS_TOKEN: 't', TINYPIVOT_DATABRICKS_CLIENT_ID: 'c', TINYPIVOT_DATABRICKS_CLIENT_SECRET: 's' }).auth).toEqual({ kind: 'token', token: 't' })
    expect(resolve({ TINYPIVOT_DATABRICKS_WAREHOUSE: '/sql/1.0/warehouses/xyz' }).httpPath).toBe('/sql/1.0/warehouses/xyz')
  })

  it('reuses a ~/.databrickscfg profile: token, service principal, CLI sign-in', () => {
    const resolve = (env: NodeJS.ProcessEnv) => resolveDatabricksConnection(databricksConfigFromEnv(env, tempHome)!)
    expect(resolve({ TINYPIVOT_DATABRICKS_PROFILE: 'DEFAULT' })).toEqual({ host: 'dbc-1234.cloud.databricks.com', auth: { kind: 'token', token: 'dapi-from-file' }, httpPath: undefined })
    expect(resolve({ TINYPIVOT_DATABRICKS_PROFILE: 'sp' })).toEqual({
      host: 'adb-55.11.azuredatabricks.net',
      auth: { kind: 'm2m', clientId: 'sp-id', clientSecret: 'sp-secret' },
      httpPath: '/sql/1.0/warehouses/wh42',
    })
    expect(resolve({ TINYPIVOT_DATABRICKS_PROFILE: 'cli' }).auth).toEqual({ kind: 'browser' })
    expect(() => resolve({ TINYPIVOT_DATABRICKS_PROFILE: 'azure' })).toThrow('auth_type `azure-cli` is not supported')
    expect(() => resolve({ TINYPIVOT_DATABRICKS_PROFILE: 'broken' })).toThrow('has no token')
  })

  it('lets environment values override the profile', () => {
    const config = databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_PROFILE: 'cli', TINYPIVOT_DATABRICKS_TOKEN: 'env-token', TINYPIVOT_DATABRICKS_WAREHOUSE: 'w1' }, tempHome)!
    expect(resolveDatabricksConnection(config)).toEqual({ host: 'dbc-9.cloud.databricks.com', auth: { kind: 'token', token: 'env-token' }, httpPath: '/sql/1.0/warehouses/w1' })
  })

  it('finds the profile for a host when only the host is set', () => {
    const config = databricksConfigFromEnv({ TINYPIVOT_DATABRICKS_HOST: 'dbc-1234.cloud.databricks.com' }, tempHome)!
    expect(resolveDatabricksConnection(config).auth).toEqual({ kind: 'token', token: 'dapi-from-file' })
  })

  it('normalizes hosts and warehouse ids', () => {
    expect(normalizeHost('https://DBC-1.cloud.databricks.com/?o=1')).toBe('dbc-1.cloud.databricks.com')
    expect(warehousePath('abc123')).toBe('/sql/1.0/warehouses/abc123')
    expect(warehousePath('/sql/1.0/warehouses/abc123')).toBe('/sql/1.0/warehouses/abc123')
    expect(() => warehousePath('abc 123')).toThrow('SQL warehouse id')
  })
})

describe('databricks warehouse lookup', () => {
  function fakeFetch(responses: Record<string, unknown>) {
    const calls: Array<{ url: string, init: Parameters<FetchLike>[1] }> = []
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init })
      const body = responses[new URL(url).pathname]
      return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body, text: async () => 'not found' }
    }
    return { fetchImpl, calls }
  }

  const warehouses = { warehouses: [
    { id: 'stopped1', state: 'STOPPED', odbc_params: { path: '/sql/1.0/warehouses/stopped1' } },
    { id: 'running2', state: 'RUNNING', odbc_params: { path: '/sql/1.0/warehouses/running2' } },
  ] }

  it('prefers a running warehouse, using the token as the bearer', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/api/2.0/sql/warehouses': warehouses })
    const found = await findWarehousePath({ host: 'dbc-1.cloud.databricks.com', auth: { kind: 'token', token: 'dapi' } }, fetchImpl)
    expect(found).toBe('/sql/1.0/warehouses/running2')
    expect(calls[0].url).toBe('https://dbc-1.cloud.databricks.com/api/2.0/sql/warehouses')
    expect(calls[0].init.headers.Authorization).toBe('Bearer dapi')
  })

  it('falls back to the first warehouse, and mints a token for a service principal', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/oidc/v1/token': { access_token: 'minted' },
      '/api/2.0/sql/warehouses': { warehouses: [{ id: 'only1', state: 'STOPPED' }] },
    })
    const found = await findWarehousePath({ host: 'dbc-1.cloud.databricks.com', auth: { kind: 'm2m', clientId: 'id', clientSecret: 'secret' } }, fetchImpl)
    expect(found).toBe('/sql/1.0/warehouses/only1')
    expect(calls[0].init).toMatchObject({ method: 'POST', body: 'grant_type=client_credentials&scope=all-apis' })
    expect(calls[0].init.headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`)
    expect(calls[1].init.headers.Authorization).toBe('Bearer minted')
  })

  it('asks for a warehouse with browser sign-in, or when none is visible', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/api/2.0/sql/warehouses': { warehouses: [] } })
    await expect(findWarehousePath({ host: 'h', auth: { kind: 'browser' } }, fetchImpl)).rejects.toThrow('Set TINYPIVOT_DATABRICKS_WAREHOUSE')
    expect(calls).toEqual([])
    await expect(findWarehousePath({ host: 'h', auth: { kind: 'token', token: 't' } }, fetchImpl)).rejects.toThrow('No SQL warehouse is visible')
  })

  it('reports an HTTP error', async () => {
    const { fetchImpl } = fakeFetch({})
    await expect(findWarehousePath({ host: 'h.cloud.databricks.com', auth: { kind: 'token', token: 't' } }, fetchImpl)).rejects.toThrow('HTTP 404 for /api/2.0/sql/warehouses')
  })

  it('names the host when it cannot be reached', async () => {
    const unreachable: FetchLike = async () => {
      throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND h.cloud.databricks.com') })
    }
    await expect(findWarehousePath({ host: 'h.cloud.databricks.com', auth: { kind: 'token', token: 't' } }, unreachable)).rejects.toThrow('Could not reach Databricks at h.cloud.databricks.com: getaddrinfo ENOTFOUND')
  })
})

describe('databricks wiring', () => {
  it('is offered as query_databricks when a profile is named', async () => {
    const { warehousesFromEnv } = await import('../../packages/mcp/src/server')
    expect(warehousesFromEnv({ TINYPIVOT_DATABRICKS_PROFILE: 'DEFAULT' }).map(w => w.toolName)).toEqual(['query_databricks'])
  })
})
