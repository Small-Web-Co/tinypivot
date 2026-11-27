import type { MysqlConfig, MysqlSessionLike } from '../../packages/mcp/src/mysql'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  castMysqlField,
  isAllowedMysqlObject,
  mysqlConfigFromEnv,
  mysqlConnectionOptions,
  mysqlConnector,
  mysqlPlainValue,
  mysqlSettingsFromOptionFile,
  mysqlSettingsFromUrl,
  mysqlSslOptions,
  mysqlStatementError,
  resolveMysqlSettings,
  timeoutStatement,
} from '../../packages/mcp/src/mysql'

const CONFIG: MysqlConfig = {
  source: { kind: 'url', url: 'mysql://reader:secret@db.example.com/shop' },
  database: 'shop',
  maxRows: 3,
}

const SETUP = ['SELECT VERSION() AS version', 'SET SESSION time_zone = \'+00:00\'', 'SET SESSION MAX_EXECUTION_TIME = 60000']

interface FakeOptions {
  version?: string
  rows?: Record<string, unknown>[]
  /** Answers TinyPivot's own statements; return undefined for no rows. Throw to fail one. */
  answer?: (sql: string, values?: unknown[]) => Record<string, unknown>[] | undefined
  /** Fails the model's query. */
  fail?: Error
}

/** Records every statement; answers VERSION() with `version` and the model's query with `rows`. */
function fakeSession(options: FakeOptions = {}) {
  const ran: string[] = []
  const values: unknown[][] = []
  let closed = 0
  const session: MysqlSessionLike = {
    async query(sql, params) {
      ran.push(sql)
      if (params)
        values.push(params)
      if (sql === 'SELECT VERSION() AS version')
        return [{ version: options.version ?? '8.4.2' }]
      return options.answer?.(sql, params) ?? []
    },
    async stream(sql, maxRows) {
      ran.push(sql)
      if (options.fail)
        throw options.fail
      const rows = options.rows ?? []
      return { rows: rows.slice(0, maxRows), truncated: rows.length > maxRows }
    },
    async close() {
      closed += 1
    },
  }
  return { session, ran, values, closed: () => closed }
}

describe('mysql statement check', () => {
  it('allows SELECTs with MySQL comments, quoted names and doubled quotes', () => {
    expect(mysqlStatementError('SELECT region, SUM(amount) FROM orders # by region\nGROUP BY 1')).toBeUndefined()
    expect(mysqlStatementError('SELECT `select`, \'it\'\'s\', "x" FROM `shop`.`orders` -- note')).toBeUndefined()
    expect(mysqlStatementError('SELECT 1--1')).toBeUndefined()
    expect(mysqlStatementError('SELECT name FROM t WHERE name LIKE \'a\\_b\'')).toBeUndefined()
  })

  it('reads # comments as MySQL does, so a quote in one cannot hide what follows', () => {
    expect(mysqlStatementError('SELECT a FROM t # don\'t\nINTO OUTFILE \'/tmp/x\'')).toContain('INTO')
    expect(mysqlStatementError('SELECT 1 # \'\n; DROP TABLE t -- \'')).toBe('Send one statement at a time.')
  })

  it('refuses backslash-escaped quotes, whose meaning depends on sql_mode', () => {
    expect(mysqlStatementError('SELECT \'a\\\' INTO OUTFILE \'/tmp/x\' -- \'')).toContain('doubling it')
  })

  it('refuses executable comments, optimizer hints, file access and locking reads', () => {
    expect(mysqlStatementError('SELECT 1 /*!50000 INTO OUTFILE \'/tmp/x\' */')).toContain('Executable comments')
    expect(mysqlStatementError('SELECT 1 /*M! , 2 */')).toContain('Executable comments')
    expect(mysqlStatementError('SELECT /*+ MAX_EXECUTION_TIME(999999999) */ 1')).toContain('Optimizer hints')
    expect(mysqlStatementError('SELECT LOAD_FILE(\'/etc/passwd\')')).toContain('LOAD_FILE')
    expect(mysqlStatementError('SELECT * FROM t INTO @x')).toContain('INTO')
    expect(mysqlStatementError('SELECT * FROM t FOR UPDATE')).toContain('UPDATE is not allowed')
    expect(mysqlStatementError('SELECT * FROM t FOR SHARE')).toContain('Locking reads')
    expect(mysqlStatementError('SELECT * FROM t LOCK IN SHARE MODE')).toContain('Locking reads')
  })
})

describe('mysql connector', () => {
  it('sets the time limit once, then runs each query in a read-only transaction and rolls it back', async () => {
    const fake = fakeSession({ rows: [{ region: 'EMEA', amount: 120 }] })
    const connector = mysqlConnector(CONFIG, async () => fake.session)
    const result = await connector.query('SELECT region, SUM(amount) AS amount FROM orders GROUP BY 1;')
    await connector.query('SELECT 1')
    expect(fake.ran).toEqual([
      ...SETUP,
      'START TRANSACTION READ ONLY',
      'SELECT region, SUM(amount) AS amount FROM orders GROUP BY 1',
      'ROLLBACK',
      'START TRANSACTION READ ONLY',
      'SELECT 1',
      'ROLLBACK',
    ])
    expect(result).toEqual({ rows: [{ region: 'EMEA', amount: 120 }], truncated: false, note: 'Ran in a read-only transaction on MySQL 8.4.2, 60-second limit.' })
    expect(connector).toMatchObject({ id: 'mysql', toolName: 'query_mysql', label: 'MySQL', maxRows: 3 })
  })

  it('uses max_statement_time (seconds) on MariaDB', async () => {
    const fake = fakeSession({ version: '10.11.6-MariaDB-1:10.11.6+maria~ubu2204' })
    const result = await mysqlConnector(CONFIG, async () => fake.session).query('SELECT 1')
    expect(fake.ran.slice(0, 3)).toEqual(['SELECT VERSION() AS version', 'SET SESSION time_zone = \'+00:00\'', 'SET SESSION max_statement_time = 60'])
    expect(result.note).toBe('Ran in a read-only transaction on MariaDB 10.11.6, 60-second limit.')
    expect(timeoutStatement('mysql')).toBe('SET SESSION MAX_EXECUTION_TIME = 60000')
  })

  it('falls back to the other variable, then to no server limit, when the server lacks one', async () => {
    const unknown = (name: string) => (sql: string) => {
      if (sql.includes(name))
        throw new Error(`Unknown system variable '${name}'`)
      return undefined
    }
    const proxied = fakeSession({ answer: unknown('MAX_EXECUTION_TIME') })
    await mysqlConnector(CONFIG, async () => proxied.session).query('SELECT 1')
    expect(proxied.ran.slice(2, 4)).toEqual(['SET SESSION MAX_EXECUTION_TIME = 60000', 'SET SESSION max_statement_time = 60'])

    const old = fakeSession({ version: '5.6.51', answer: sql => (sql.startsWith('SET SESSION M') || sql.startsWith('SET SESSION m') ? unknown('time')(sql.toLowerCase()) : undefined) })
    const result = await mysqlConnector(CONFIG, async () => old.session).query('SELECT 1')
    expect(result.note).toBe('Ran in a read-only transaction on MySQL 5.6.51, no server time limit (TinyPivot stops waiting after 75 s).')
    expect(old.ran).toContain('START TRANSACTION READ ONLY')
  })

  it('never sends a refused query to the database and keeps the session open', async () => {
    const fake = fakeSession()
    const connector = mysqlConnector(CONFIG, async () => fake.session)
    await expect(connector.query('UPDATE orders SET amount = 0')).rejects.toThrow('Only a read-only SELECT')
    await expect(connector.query('SELECT * FROM orders INTO OUTFILE \'/tmp/o\'')).rejects.toThrow('INTO')
    await expect(connector.query('SELECT 1; DELETE FROM orders')).rejects.toThrow('one statement')
    expect(fake.ran).toEqual(SETUP)
    expect(fake.closed()).toBe(0)
  })

  it('runs a SELECT whose # comment mentions a write word', async () => {
    const fake = fakeSession({ rows: [{ x: 1 }] })
    const connector = mysqlConnector(CONFIG, async () => fake.session)
    const result = await connector.query('SELECT 1 AS x # not an insert into orders\n')
    expect(result.rows).toEqual([{ x: 1 }])
    expect(fake.ran).toContain('SELECT 1 AS x # not an insert into orders')
  })

  it('marks a cut result as truncated and replaces the dropped connection', async () => {
    const fake = fakeSession({ rows: Array.from({ length: 5 }, (_, id) => ({ id })) })
    let opened = 0
    const connector = mysqlConnector(CONFIG, async () => {
      opened += 1
      return fake.session
    })
    const result = await connector.query('SELECT id FROM orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(3)
    // The truncated read dropped the connection, so there is no ROLLBACK to send.
    expect(fake.ran.at(-1)).toBe('SELECT id FROM orders')
    expect(fake.closed()).toBe(1)
    await connector.query('SELECT 1')
    expect(opened).toBe(2)
  })

  it('replaces the session after a database error', async () => {
    const fake = fakeSession({ fail: new Error('Lost connection to MySQL server during query') })
    let opened = 0
    const connector = mysqlConnector(CONFIG, async () => {
      opened += 1
      return fake.session
    })
    await expect(connector.query('SELECT 1')).rejects.toThrow('Lost connection')
    await expect(connector.query('SELECT 1')).rejects.toThrow('Lost connection')
    expect(opened).toBe(2)
    expect(fake.closed()).toBe(2)
  })

  it('converts values: dates to ISO text, zero dates to null, binary to hex, BIGINT kept exact', async () => {
    const fake = fakeSession({ rows: [{
      day: new Date('2026-03-01T00:00:00Z'),
      at: new Date('2026-03-01T10:30:00Z'),
      zero: new Date(Number.NaN),
      big: '9007199254740993',
      raw: Buffer.from([0xCA, 0xFE]),
      doc: '{"a":1}',
    }] })
    const { rows } = await mysqlConnector(CONFIG, async () => fake.session).query('SELECT * FROM t')
    expect(rows[0]).toEqual({ day: '2026-03-01', at: '2026-03-01T10:30:00.000Z', zero: null, big: '9007199254740993', raw: '0xcafe', doc: '{"a":1}' })
    expect(mysqlPlainValue(12n)).toBe(12)
  })

  it('casts DECIMAL to numbers when finite and BIT to numbers', () => {
    const field = (type: string, text: string | null, bytes?: number[]) => ({ type, string: () => text, buffer: () => (bytes ? Buffer.from(bytes) : null) })
    const next = () => 'default'
    expect(castMysqlField(field('NEWDECIMAL', '1234.50'), next)).toBe(1234.5)
    expect(castMysqlField(field('NEWDECIMAL', null), next)).toBeNull()
    expect(castMysqlField(field('BIT', null, [1]), next)).toBe(1)
    expect(castMysqlField(field('BIT', null, [1, 0]), next)).toBe(256)
    expect(castMysqlField(field('LONGLONG', '1'), next)).toBe('default')
  })

  it('lists tables from the allowlist, or from the database\'s information schema', async () => {
    const fake = fakeSession({ answer: sql => (sql.includes('CONCAT') ? [{ name: 'shop.orders' }, { name: 'shop.refunds' }] : undefined) })
    expect(await mysqlConnector({ ...CONFIG, allowed: ['shop.orders'] }, async () => fake.session).listTables()).toEqual(['shop.orders'])
    expect(await mysqlConnector(CONFIG, async () => fake.session).listTables()).toEqual(['shop.orders', 'shop.refunds'])
    expect(fake.ran.at(-1)).toContain('FROM information_schema.tables WHERE table_schema IN (?)')
    expect(fake.values.at(-1)).toEqual([['shop']])
    await mysqlConnector({ ...CONFIG, database: undefined }, async () => fake.session).listTables()
    expect(fake.ran.at(-1)).toContain('table_schema NOT IN (?)')
    expect(fake.values.at(-1)).toEqual([['information_schema', 'mysql', 'performance_schema', 'sys']])
  })
})

describe('mysql allowlist', () => {
  /** A database with shop.orders, shop.customers, hr.salaries and a stored function shop.total_for. */
  const catalog = (sql: string, values?: unknown[]) => {
    const names = new Set((values?.[0] as string[]) ?? [])
    const objects = sql.includes('information_schema.routines')
      ? [['shop', 'total_for']]
      : [['shop', 'orders'], ['shop', 'customers'], ['hr', 'salaries']]
    return objects.filter(([, name]) => names.has(name)).map(([db, name]) => ({ db, name }))
  }
  const allowed = { ...CONFIG, allowed: ['shop.orders'] }

  it('runs a query that names only allowed tables', async () => {
    const fake = fakeSession({ answer: catalog })
    await mysqlConnector(allowed, async () => fake.session).query('SELECT o.id FROM orders AS o WHERE o.status = \'customers\'')
    expect(fake.ran).toContain('ROLLBACK')
  })

  it('refuses tables outside it, however they are written', async () => {
    const queries = [
      'SELECT * FROM customers',
      'SELECT * FROM `shop`.`Customers`',
      'SELECT * FROM hr . salaries',
      'SELECT * FROM hr /* x */ .salaries',
      'SELECT * FROM .customers',
      'SELECT * FROM orders o JOIN (SELECT * FROM hr.salaries) s ON TRUE',
      'WITH c AS (SELECT * FROM customers) SELECT * FROM c',
    ]
    for (const sql of queries) {
      const fake = fakeSession({ answer: catalog })
      await expect(mysqlConnector(allowed, async () => fake.session).query(sql), sql).rejects.toThrow('not in TINYPIVOT_MYSQL_ALLOWED')
      expect(fake.ran).not.toContain('START TRANSACTION READ ONLY')
      expect(fake.closed()).toBe(0)
    }
  })

  it('refuses stored functions outside it', async () => {
    const fake = fakeSession({ answer: catalog })
    await expect(mysqlConnector(allowed, async () => fake.session).query('SELECT total_for(id) FROM orders')).rejects.toThrow('Stored function `shop.total_for`')
  })

  it('matches entries by database or table, ignoring case and backticks', () => {
    expect(isAllowedMysqlObject(['shop', 'orders'], undefined)).toBe(true)
    expect(isAllowedMysqlObject(['Shop', 'Orders'], ['shop'])).toBe(true)
    expect(isAllowedMysqlObject(['shop', 'orders'], ['`shop`.`orders`'])).toBe(true)
    expect(isAllowedMysqlObject(['shop', 'customers'], ['shop.orders'])).toBe(false)
  })
})

describe('mysql configuration', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-mysql-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('is configured only by a URL or a database, never by an option file alone', () => {
    expect(mysqlConfigFromEnv({}, dir)).toBeUndefined()
    expect(mysqlConfigFromEnv({ TINYPIVOT_MYSQL_URL: 'mysql://r:p@h/shop', TINYPIVOT_MYSQL_ALLOWED: 'shop.orders, shop.refunds' }, dir))
      .toEqual({ source: { kind: 'url', url: 'mysql://r:p@h/shop' }, database: 'shop', allowed: ['shop.orders', 'shop.refunds'], maxRows: 5000 })
    expect(mysqlConfigFromEnv({ TINYPIVOT_MYSQL_DATABASE: 'shop' }, dir)?.source).toEqual({ kind: 'option-file', file: path.join(dir, '.my.cnf') })
    expect(mysqlConfigFromEnv({ TINYPIVOT_MYSQL_DATABASE: 'shop', TINYPIVOT_MYSQL_OPTION_FILE: '~/db/reader.cnf' }, dir)?.source).toEqual({ kind: 'option-file', file: path.join(dir, 'db', 'reader.cnf') })
  })

  it('reads a URL with encoded credentials and TLS parameters', () => {
    expect(mysqlSettingsFromUrl('mysql://read%40er:p%3Ass@db.example.com:3307/shop?ssl-mode=VERIFY_IDENTITY&ssl-ca=/etc/ca.pem')).toEqual({
      host: 'db.example.com',
      port: 3307,
      socketPath: undefined,
      user: 'read@er',
      password: 'p:ss',
      database: 'shop',
      tls: { mode: 'verify-identity', ca: '/etc/ca.pem' },
    })
    expect(mysqlSettingsFromUrl('mariadb://r@localhost/shop?socket=/tmp/mysql.sock')).toMatchObject({ socketPath: '/tmp/mysql.sock', tls: undefined, port: 3306 })
    expect(mysqlSettingsFromUrl('mysql://r:p@aws.connect.psdb.cloud/shop?ssl={"rejectUnauthorized":true}').tls).toEqual({ mode: 'verify-ca' })
    expect(() => mysqlSettingsFromUrl('postgres://r:topsecret@h/db')).toThrow('mysql://')
    expect(() => mysqlSettingsFromUrl('not a url topsecret')).toThrow(/^((?!topsecret).)*$/)
  })

  it('reads [client] and [mysql] from a MySQL option file at connect, later groups winning', async () => {
    const file = path.join(dir, 'my.cnf')
    await fs.writeFile(file, '[mysqld]\nport = 1\n[client]\nuser = reader\npassword = "s3cret"\nhost = db.internal\nport = 3310\nssl_ca = /etc/ca.pem\n[mysql]\nuser = analyst\n')
    expect(mysqlSettingsFromOptionFile(file)).toEqual({
      host: 'db.internal',
      port: 3310,
      socketPath: undefined,
      user: 'analyst',
      password: 's3cret',
      database: undefined,
      tls: { mode: 'verify-ca', ca: '/etc/ca.pem' },
    })
    const config = mysqlConfigFromEnv({ TINYPIVOT_MYSQL_DATABASE: 'shop', TINYPIVOT_MYSQL_OPTION_FILE: file }, dir)!
    expect(resolveMysqlSettings(config)).toMatchObject({ user: 'analyst', database: 'shop' })
    expect(() => mysqlSettingsFromOptionFile(path.join(dir, 'missing.cnf'))).toThrow('Could not read the MySQL option file')
  })

  it('maps MariaDB TLS flags and ssl-mode values', async () => {
    const tlsOf = async (text: string) => {
      const file = path.join(dir, 'tls.cnf')
      await fs.writeFile(file, `[client]\nuser = r\n${text}\n`)
      return mysqlSettingsFromOptionFile(file).tls
    }
    expect(await tlsOf('ssl')).toEqual({ mode: 'required' })
    expect(await tlsOf('ssl\nssl-verify-server-cert')).toEqual({ mode: 'verify-identity' })
    expect(await tlsOf('ssl-mode = REQUIRED\nssl-ca = /ca.pem')).toEqual({ mode: 'required', ca: '/ca.pem' })
    expect(await tlsOf('ssl-mode = DISABLED\nssl-ca = /ca.pem')).toBeUndefined()
    expect(await tlsOf('skip-ssl')).toBeUndefined()
    await expect(tlsOf('ssl-mode = SOMETIMES')).rejects.toThrow('Unknown ssl-mode')
  })

  it('builds locked-down driver options, reading TLS files at connect', async () => {
    const ca = path.join(dir, 'ca.pem')
    await fs.writeFile(ca, 'PEM')
    const options = mysqlConnectionOptions({ host: 'h', port: 3306, user: 'r', database: 'shop', tls: { mode: 'verify-ca', ca } })
    expect(options).toMatchObject({
      host: 'h',
      multipleStatements: false,
      flags: ['-LOCAL_FILES'],
      timezone: 'Z',
      supportBigNumbers: true,
      bigNumberStrings: false,
      jsonStrings: true,
      ssl: { ca: 'PEM', rejectUnauthorized: true, verifyIdentity: false },
    })
    expect(mysqlSslOptions({ mode: 'required' })).toEqual({ rejectUnauthorized: false, verifyIdentity: false })
    expect(mysqlConnectionOptions({ host: 'localhost', port: 3306, user: 'r', socketPath: '/tmp/s' })).toMatchObject({ socketPath: '/tmp/s' })
    expect(mysqlConnectionOptions({ host: 'localhost', port: 3306, user: 'r', socketPath: '/tmp/s' })).not.toHaveProperty('host')
  })
})

describe('mysql wiring', () => {
  it('is offered as query_mysql when a URL is set', async () => {
    const { warehousesFromEnv } = await import('../../packages/mcp/src/server')
    expect(warehousesFromEnv({ TINYPIVOT_MYSQL_URL: 'mysql://reader@localhost/acme' }).map(w => w.toolName)).toEqual(['query_mysql'])
  })
})
