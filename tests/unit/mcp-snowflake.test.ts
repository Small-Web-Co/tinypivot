import type { SnowflakeConfig, SnowflakeSessionLike } from '../../packages/mcp/src/snowflake'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { warehousesFromEnv } from '../../packages/mcp/src/server'
import {
  checkPlan,
  isAllowedObject,
  parseExplain,
  readPrivateKey,
  snowflakeConfigFromEnv,
  snowflakeConnector,
} from '../../packages/mcp/src/snowflake'
import { maskSql, readOnlyStatementError } from '../../packages/mcp/src/warehouse'

const CONFIG: SnowflakeConfig = {
  account: 'acme-xy12345',
  username: 'ANALYST',
  auth: { kind: 'token', token: 'test-token' },
  database: 'ACME',
  schema: 'SALES',
  maxBytes: 10_000_000_000,
  maxRows: 3,
}

function plan(operations: Array<{ operation: string, objects?: string[] }>, bytes = 4_200_000) {
  return JSON.stringify({ GlobalStats: { partitionsTotal: 10, partitionsAssigned: 4, bytesAssigned: bytes }, Operations: [operations.map((op, id) => ({ id, ...op }))] })
}

const READ_PLAN = plan([{ operation: 'Result' }, { operation: 'Aggregate' }, { operation: 'TableScan', objects: ['ACME.SALES.ORDERS'] }])

/** Answers EXPLAIN with `explain` and every other statement with `rows`; records what ran. */
function fakeSession(options: { explain?: string, rows?: Record<string, unknown>[], fail?: Error } = {}) {
  const ran: string[] = []
  let closed = 0
  const session: SnowflakeSessionLike = {
    async run(sql, maxRows) {
      ran.push(sql)
      if (options.fail)
        throw options.fail
      if (sql.startsWith('EXPLAIN'))
        return { rows: [{ content: options.explain ?? READ_PLAN }], totalRows: 1 }
      const rows = options.rows ?? []
      return { rows: rows.slice(0, maxRows), totalRows: rows.length }
    },
    async close() {
      closed += 1
    },
  }
  return { session, ran, closed: () => closed }
}

describe('read-only statement check', () => {
  it('allows one SELECT or WITH, with comments, strings and quoted names masked', () => {
    expect(readOnlyStatementError('SELECT region, SUM(mrr) FROM orders GROUP BY 1;')).toBeUndefined()
    expect(readOnlyStatementError('WITH m AS (SELECT * FROM orders) SELECT * FROM m')).toBeUndefined()
    expect(readOnlyStatementError('(SELECT 1) UNION ALL (SELECT 2)')).toBeUndefined()
    expect(readOnlyStatementError('SELECT \'please delete; drop\' AS note, "update" FROM t -- insert')).toBeUndefined()
    expect(readOnlyStatementError('SELECT created_at, is_deleted, GET(payload, \'k\') FROM t')).toBeUndefined()
    expect(maskSql('SELECT \'a;b\', "c;d" /* ; */')).not.toContain(';')
  })

  it('refuses writes, several statements and system functions', () => {
    expect(readOnlyStatementError('DELETE FROM orders')).toContain('Only a read-only SELECT')
    expect(readOnlyStatementError('SELECT 1; DROP TABLE orders')).toBe('Send one statement at a time.')
    expect(readOnlyStatementError('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toContain('INSERT is not allowed')
    expect(readOnlyStatementError('SELECT SYSTEM$CANCEL_ALL_QUERIES(1)')).toContain('System functions')
    // A comment marker inside a string does not hide what follows the string.
    expect(readOnlyStatementError('SELECT \'--\', 1; DELETE FROM t')).toBe('Send one statement at a time.')
    expect(readOnlyStatementError('SELECT \'/*\' AS a; DELETE FROM t -- */')).toBe('Send one statement at a time.')
    expect(maskSql('SELECT \'--\' AS a, "x--y" AS b -- c', /#[^\n]*/)).toBe('SELECT \'\' AS a, "" AS b  ')
    expect(readOnlyStatementError('  ')).toBe('The SQL is empty.')
  })
})

describe('snowflake plan checks', () => {
  it('reads operations, scanned tables and bytes from EXPLAIN USING JSON', () => {
    expect(parseExplain(READ_PLAN)).toEqual({ operations: ['Result', 'Aggregate', 'TableScan'], tables: ['ACME.SALES.ORDERS'], bytes: 4_200_000 })
  })

  it('refuses a plan with a write step, a table outside the allowlist, or too large a scan', () => {
    expect(() => checkPlan(parseExplain(plan([{ operation: 'Insert' }])), CONFIG)).toThrow('includes a Insert step')
    expect(() => checkPlan(parseExplain(READ_PLAN), { ...CONFIG, allowed: ['ACME.MARKETING'] })).toThrow('ACME.SALES.ORDERS')
    expect(() => checkPlan(parseExplain(plan([{ operation: 'TableScan' }], 12e9)), CONFIG)).toThrow('may scan 12 GB, over the 10 GB limit')
  })

  it('matches allowlist entries by database, schema or table, ignoring case and quotes', () => {
    expect(isAllowedObject('ACME.SALES.ORDERS', undefined)).toBe(true)
    expect(isAllowedObject('ACME.SALES.ORDERS', ['acme'])).toBe(true)
    expect(isAllowedObject('"ACME"."SALES"."ORDERS"', ['acme.sales'])).toBe(true)
    expect(isAllowedObject('ACME.SALES.ORDERS', ['acme.sales.orders'])).toBe(true)
    expect(isAllowedObject('ACME.SALES.ORDERS', ['acme.hr'])).toBe(false)
  })
})

describe('snowflake connector', () => {
  it('explains the query first, then runs it and reports the planned scan', async () => {
    const fake = fakeSession({ rows: [{ REGION: 'EMEA', MRR: 120, DAY: new Date('2026-03-01T00:00:00Z') }] })
    const result = await snowflakeConnector(CONFIG, async () => fake.session).query('SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3;')
    expect(fake.ran).toEqual(['EXPLAIN USING JSON SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3', 'SELECT region, SUM(mrr) AS mrr, day FROM orders GROUP BY 1, 3'])
    expect(result).toEqual({ rows: [{ REGION: 'EMEA', MRR: 120, DAY: '2026-03-01' }], truncated: false, note: 'Snowflake planned to scan up to 4.2 MB (limit 10 GB).' })
  })

  it('never sends a refused query to Snowflake and keeps the session open', async () => {
    const fake = fakeSession()
    const connector = snowflakeConnector(CONFIG, async () => fake.session)
    await expect(connector.query('UPDATE orders SET mrr = 0')).rejects.toThrow('Only a read-only SELECT')
    expect(fake.ran).toEqual([])
    expect(fake.closed()).toBe(0)
  })

  it('stops at the plan when it shows a write step', async () => {
    const fake = fakeSession({ explain: plan([{ operation: 'Delete' }]) })
    await expect(snowflakeConnector(CONFIG, async () => fake.session).query('SELECT 1')).rejects.toThrow('Delete step')
    expect(fake.ran).toHaveLength(1)
  })

  it('marks a cut result as truncated', async () => {
    const fake = fakeSession({ rows: Array.from({ length: 5 }, (_, i) => ({ ID: i })) })
    const result = await snowflakeConnector(CONFIG, async () => fake.session).query('SELECT id FROM orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(3)
  })

  it('replaces the session after a connection error', async () => {
    const fake = fakeSession({ fail: new Error('session expired') })
    let opened = 0
    const connector = snowflakeConnector(CONFIG, async () => {
      opened += 1
      return fake.session
    })
    await expect(connector.query('SELECT 1')).rejects.toThrow('session expired')
    await expect(connector.query('SELECT 1')).rejects.toThrow('session expired')
    expect(opened).toBe(2)
    expect(fake.closed()).toBe(2)
  })

  it('lists tables from the allowlist, or from the database\'s information schema', async () => {
    const fake = fakeSession({ rows: [{ NAME: 'ACME.SALES.ORDERS' }, { NAME: 'ACME.SALES.REFUNDS' }] })
    expect(await snowflakeConnector({ ...CONFIG, allowed: ['ACME.SALES.ORDERS'] }, async () => fake.session).listTables()).toEqual(['ACME.SALES.ORDERS'])
    expect(await snowflakeConnector(CONFIG, async () => fake.session).listTables()).toEqual(['ACME.SALES.ORDERS', 'ACME.SALES.REFUNDS'])
    expect(fake.ran.at(-1)).toContain('FROM "ACME".information_schema.tables')
    expect(fake.ran.at(-1)).toContain('table_schema = \'SALES\'')
  })
})

describe('snowflake configuration', () => {
  it('is configured only with an account and a user, picking key pair, token, password, then browser', () => {
    expect(snowflakeConfigFromEnv({ TINYPIVOT_SNOWFLAKE_ACCOUNT: 'acme' })).toBeUndefined()
    const base = { TINYPIVOT_SNOWFLAKE_ACCOUNT: 'acme', TINYPIVOT_SNOWFLAKE_USER: 'ANALYST' }
    expect(snowflakeConfigFromEnv(base)?.auth).toEqual({ kind: 'browser' })
    expect(snowflakeConfigFromEnv({ ...base, TINYPIVOT_SNOWFLAKE_PASSWORD: 'p' })?.auth.kind).toBe('password')
    expect(snowflakeConfigFromEnv({ ...base, TINYPIVOT_SNOWFLAKE_PASSWORD: 'p', TINYPIVOT_SNOWFLAKE_TOKEN: 't' })?.auth.kind).toBe('token')
    expect(snowflakeConfigFromEnv({ ...base, TINYPIVOT_SNOWFLAKE_TOKEN: 't', TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PATH: '/k.p8' })?.auth.kind).toBe('keypair')
    expect(snowflakeConfigFromEnv({ ...base, TINYPIVOT_SNOWFLAKE_MAX_GB: '2', TINYPIVOT_SNOWFLAKE_ALLOWED: 'acme.sales' }))
      .toMatchObject({ maxBytes: 2_000_000_000, allowed: ['acme.sales'] })
    expect(warehousesFromEnv(base).map(w => w.toolName)).toEqual(['query_snowflake'])
  })

  it('reads a key from an env var with escaped newlines, decrypting it with its passphrase', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'secret' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })
    const escaped = privateKey.replace(/\n/g, '\\n')
    const pem = readPrivateKey({ pem: escaped, passphrase: 'secret' })
    expect(pem).toContain('-----BEGIN PRIVATE KEY-----')
    expect(() => readPrivateKey({ pem: escaped, passphrase: 'wrong' })).toThrow()
  })
})

describe('reusing a Snowflake CLI connection', () => {
  function withConnectionsFile(toml: string, config = '') {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sf-home-'))
    fs.mkdirSync(path.join(home, '.snowflake'))
    fs.writeFileSync(path.join(home, '.snowflake', 'connections.toml'), toml)
    if (config)
      fs.writeFileSync(path.join(home, '.snowflake', 'config.toml'), config)
    return home
  }

  const TOML = `
[default]
account = "acme-xy12345"
user = "ANALYST"
authenticator = "SNOWFLAKE_JWT"
private_key_file = "~/keys/rsa.p8"
warehouse = "ANALYTICS_WH"
role = "READER"

[sso]
account = "acme-xy12345"
user = "brice@example.com"
authenticator = "externalbrowser"
password = "unused"
`

  it('reads the named connection, with TINYPIVOT_SNOWFLAKE_* overriding it', () => {
    const home = withConnectionsFile(TOML)
    const config = snowflakeConfigFromEnv({ TINYPIVOT_SNOWFLAKE_CONNECTION: 'default', TINYPIVOT_SNOWFLAKE_ROLE: 'ANALYST_RO' }, home)
    expect(config).toMatchObject({ account: 'acme-xy12345', username: 'ANALYST', warehouse: 'ANALYTICS_WH', role: 'ANALYST_RO' })
    expect(config?.auth).toEqual({ kind: 'keypair', pem: undefined, path: path.join(home, 'keys/rsa.p8'), passphrase: undefined })
  })

  it('honours the connection\'s own authenticator, and config.toml\'s default connection', () => {
    const home = withConnectionsFile(TOML, 'default_connection_name = "sso"\n')
    expect(snowflakeConfigFromEnv({ TINYPIVOT_SNOWFLAKE_CONNECTION: 'default' }, home)?.auth).toEqual({ kind: 'browser' })
  })

  it('stays off when the named connection does not exist', () => {
    const home = withConnectionsFile(TOML)
    expect(snowflakeConfigFromEnv({ TINYPIVOT_SNOWFLAKE_CONNECTION: 'missing' }, home)).toBeUndefined()
  })
})
