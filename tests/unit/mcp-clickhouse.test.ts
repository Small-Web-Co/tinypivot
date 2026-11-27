import type { ClickHouseClientLike, ClickHouseConfig, ClickHouseQueryParams } from '../../packages/mcp/src/clickhouse'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  baseType,
  clickHouseConfigFromEnv,
  clickHouseConnector,
  clickHouseTextError,
  parseClickHouseClientConfig,
  querySettings,
  readProfile,
  refusalFromError,
  rowsFromCompact,
  toClickHouseValue,
} from '../../packages/mcp/src/clickhouse'
import { QueryRefused } from '../../packages/mcp/src/warehouse'

const CONFIG: ClickHouseConfig = {
  url: 'https://ch.example.test:8443',
  username: 'analyst',
  password: 'test-password',
  database: 'acme',
  maxBytes: 10_000_000_000,
  maxRows: 3,
}

type Table = [string[], string[], ...unknown[][]]

const PROFILE_TYPES = ['UInt64', 'String', 'String']

function profileTable(readonly: number, overflow = 'throw'): Table {
  return [['readonly', 'read_overflow_mode', 'timeout_overflow_mode'], PROFILE_TYPES, [String(readonly), overflow, overflow]]
}

const ORDERS: Table = [['region', 'mrr'], ['String', 'Decimal(18, 2)'], ['EMEA', 120.5]]

/**
 * A stand-in for the official client: answers the profile probe, then every other query with
 * `table`, in batches of two rows; records each request and how far its stream was read.
 */
function fakeClient(options: { readonly?: number, overflow?: string, table?: Table, fail?: Error } = {}) {
  const sent: ClickHouseQueryParams[] = []
  const read: number[] = []
  let closed = 0
  const client: ClickHouseClientLike = {
    async query(params) {
      sent.push(params)
      const probe = params.query.startsWith('SELECT getSetting(\'readonly\')')
      if (options.fail && !probe)
        throw options.fail
      const lines = probe ? profileTable(options.readonly ?? 0, options.overflow) : options.table ?? ORDERS
      const index = read.push(0) - 1
      return {
        async* stream() {
          for (let i = 0; i < lines.length; i += 2) {
            read[index] = Math.min(i + 2, lines.length)
            yield lines.slice(i, i + 2).map(line => ({ json: () => line }))
          }
        },
        close() {},
      }
    },
    async close() {
      closed += 1
    },
  }
  const queries = () => sent.filter(p => !p.query.startsWith('SELECT getSetting'))
  return { client, sent, queries, read, closed: () => closed }
}

describe('clickhouse query checks', () => {
  it('refuses SETTINGS, FORMAT and INTO OUTFILE, but not those words in names or strings', () => {
    expect(clickHouseTextError('SELECT * FROM t SETTINGS max_bytes_to_read = 0')).toContain('SETTINGS clause')
    expect(clickHouseTextError('SELECT * FROM t FORMAT CSV')).toContain('FORMAT clause')
    expect(clickHouseTextError('SELECT * FROM t INTO OUTFILE \'x.csv\'')).toContain('INTO OUTFILE')
    expect(clickHouseTextError('SELECT name, value FROM system.settings WHERE name = \'readonly\'')).toBeUndefined()
    expect(clickHouseTextError('SELECT \'SETTINGS a = 1 FORMAT CSV\' AS note, "format" FROM t')).toBeUndefined()
  })

  it('turns ClickHouse limit errors into refusals with a plain reason', () => {
    const tooMuch = Object.assign(new Error('Limit for (uncompressed) bytes to read exceeded'), { code: '307' })
    expect(refusalFromError(tooMuch, CONFIG)?.message).toContain('read more than 10 GB (TINYPIVOT_CLICKHOUSE_MAX_GB)')
    expect(refusalFromError(Object.assign(new Error('Timeout exceeded'), { code: '159' }), CONFIG)).toBeInstanceOf(QueryRefused)
    expect(refusalFromError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), CONFIG)).toBeUndefined()
    expect(refusalFromError(new Error('boom'), CONFIG)).toBeUndefined()
  })
})

describe('clickhouse settings', () => {
  it('sends readonly=1 with the limits for a user without a read-only profile', () => {
    expect(querySettings(CONFIG, 0)).toEqual({
      readonly: '1',
      max_execution_time: 60,
      timeout_overflow_mode: 'throw',
      max_bytes_to_read: '10000000000',
      read_overflow_mode: 'throw',
      cancel_http_readonly_queries_on_client_close: 1,
      log_comment: 'tinypivot',
    })
  })

  it('sends the limits without readonly at readonly=2, and nothing at readonly=1, which refuses every setting', () => {
    expect(querySettings(CONFIG, 2)).not.toHaveProperty('readonly')
    expect(querySettings(CONFIG, 2)).toMatchObject({ max_bytes_to_read: '10000000000', max_execution_time: 60 })
    expect(querySettings(CONFIG, 1)).toBeUndefined()
  })

  it('reads the profile probe, noting overflow modes set to break', () => {
    expect(readProfile({ readonly: 1, read_overflow_mode: 'break', timeout_overflow_mode: 'throw' })).toEqual({ readonly: 1, breakModes: ['read_overflow_mode'] })
    expect(readProfile(undefined)).toEqual({ readonly: 0, breakModes: [] })
  })
})

describe('clickhouse values', () => {
  it('unwraps Nullable and LowCardinality', () => {
    expect(baseType('Nullable(LowCardinality(String))')).toBe('String')
    expect(baseType('DateTime64(3, \'UTC\')')).toBe('DateTime64(3, \'UTC\')')
  })

  it('converts quoted 64-bit integers only when exact, and decimals, dates and nested values', () => {
    expect(toClickHouseValue('42', 'UInt64')).toBe(42)
    expect(toClickHouseValue('18446744073709551615', 'UInt64')).toBe('18446744073709551615')
    expect(toClickHouseValue('-7', 'Nullable(Int128)')).toBe(-7)
    expect(toClickHouseValue('12.50', 'Decimal(18, 2)')).toBe(12.5)
    expect(toClickHouseValue(12.5, 'Decimal(18, 2)')).toBe(12.5)
    expect(toClickHouseValue('2026-03-01', 'Date')).toBe('2026-03-01')
    expect(toClickHouseValue('2026-03-01 12:30:00', 'DateTime(\'UTC\')')).toBe('2026-03-01T12:30:00')
    expect(toClickHouseValue('2026-03-01 12:30:00.250', 'DateTime64(3)')).toBe('2026-03-01T12:30:00.250')
    expect(toClickHouseValue(['a', 'b'], 'Array(String)')).toBe('["a","b"]')
    expect(toClickHouseValue({ k: 1 }, 'Map(String, UInt8)')).toBe('{"k":1}')
    expect(toClickHouseValue(null, 'Nullable(String)')).toBeNull()
    expect(toClickHouseValue('0042', 'String')).toBe('0042')
  })

  it('builds rows from the names and types lines', () => {
    expect(rowsFromCompact([['id', 'day'], ['UInt64', 'Date'], ['9', '2026-03-01']])).toEqual([{ id: 9, day: '2026-03-01' }])
  })
})

describe('clickhouse connector', () => {
  it('probes the profile once, then runs each query with its settings, a query id and the compact format', async () => {
    const fake = fakeClient()
    const connector = clickHouseConnector(CONFIG, async () => fake.client)
    const result = await connector.query('SELECT region, SUM(mrr) AS mrr FROM orders GROUP BY region;')
    await connector.query('SELECT 1')
    expect(fake.sent).toHaveLength(3)
    expect(fake.sent[0].clickhouse_settings).toBeUndefined()
    const [first] = fake.queries()
    expect(first.query).toBe('SELECT region, SUM(mrr) AS mrr FROM orders GROUP BY region')
    expect(first.format).toBe('JSONCompactEachRowWithNamesAndTypes')
    expect(first.query_id).toMatch(/^tinypivot-[0-9a-f-]{36}$/)
    expect(first.clickhouse_settings).toEqual(querySettings(CONFIG, 0))
    expect(result).toEqual({
      rows: [{ region: 'EMEA', mrr: 120.5 }],
      truncated: false,
      note: 'ClickHouse ran this read-only (readonly=1) and stops any query that reads over 10 GB or runs over 60 s.',
    })
  })

  it('sends no settings for a readonly=1 user and warns when its profile breaks on limits', async () => {
    const fake = fakeClient({ readonly: 1, overflow: 'break' })
    const result = await clickHouseConnector(CONFIG, async () => fake.client).query('SELECT 1')
    expect(fake.queries()[0].clickhouse_settings).toBeUndefined()
    expect(result.note).toContain('readonly=1')
    expect(result.note).toContain('partial totals')
  })

  it('never sends a refused query to ClickHouse and keeps the client', async () => {
    const fake = fakeClient()
    const connector = clickHouseConnector(CONFIG, async () => fake.client)
    await expect(connector.query('INSERT INTO orders VALUES (1)')).rejects.toThrow('Only a read-only SELECT')
    await expect(connector.query('SELECT 1; DROP TABLE orders')).rejects.toThrow('one statement')
    await expect(connector.query('SELECT * FROM orders SETTINGS readonly = 0')).rejects.toThrow(QueryRefused)
    expect(fake.queries()).toEqual([])
    expect(fake.closed()).toBe(0)
  })

  it('marks a cut result as truncated and stops reading the stream past the cap', async () => {
    const table: Table = [['id'], ['UInt32'], ...Array.from({ length: 20 }, (_, i) => [i])]
    const fake = fakeClient({ table })
    const result = await clickHouseConnector(CONFIG, async () => fake.client).query('SELECT id FROM orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }])
    expect(fake.read.at(-1)).toBe(6)
  })

  it('keeps the client after ClickHouse refuses a query over its limits', async () => {
    const fake = fakeClient({ fail: Object.assign(new Error('Limit for (uncompressed) bytes to read exceeded'), { code: '307' }) })
    let opened = 0
    const connector = clickHouseConnector(CONFIG, async () => {
      opened += 1
      return fake.client
    })
    await expect(connector.query('SELECT * FROM events')).rejects.toThrow(QueryRefused)
    await expect(connector.query('SELECT * FROM events')).rejects.toThrow('TINYPIVOT_CLICKHOUSE_MAX_GB')
    expect(opened).toBe(1)
    expect(fake.closed()).toBe(0)
  })

  it('replaces the client after a connection error', async () => {
    const fake = fakeClient({ fail: new Error('socket hang up') })
    let opened = 0
    const connector = clickHouseConnector(CONFIG, async () => {
      opened += 1
      return fake.client
    })
    await expect(connector.query('SELECT 1')).rejects.toThrow('socket hang up')
    await expect(connector.query('SELECT 1')).rejects.toThrow('socket hang up')
    expect(opened).toBe(2)
    expect(fake.closed()).toBe(2)
  })

  it('lists tables of the configured database, or of every non-system database', async () => {
    const fake = fakeClient({ table: [['name'], ['String'], ['acme.orders'], ['acme.refunds']] })
    expect(await clickHouseConnector(CONFIG, async () => fake.client).listTables()).toEqual(['acme.orders', 'acme.refunds'])
    expect(fake.queries().at(-1)?.query).toContain('FROM system.tables WHERE database = \'acme\' AND NOT is_temporary')
    expect(fake.queries().at(-1)?.clickhouse_settings).toMatchObject({ readonly: '1' })
    await clickHouseConnector({ ...CONFIG, database: undefined }, async () => fake.client).listTables()
    expect(fake.queries().at(-1)?.query).toContain('database NOT IN (\'system\', \'INFORMATION_SCHEMA\', \'information_schema\')')
  })

  it('describes itself as a preview ClickHouse tool', () => {
    const connector = clickHouseConnector(CONFIG, async () => fakeClient().client)
    expect(connector).toMatchObject({ id: 'clickhouse', label: 'ClickHouse', toolName: 'query_clickhouse', preview: true, maxRows: 3 })
    expect(connector.sqlHint).toContain('resolve in acme')
  })
})

describe('clickhouse configuration', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true })
  })
  function homeWithClientConfig(xml: string): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ch-'))
    dirs.push(home)
    fs.mkdirSync(path.join(home, '.clickhouse-client'))
    fs.writeFileSync(path.join(home, '.clickhouse-client', 'config.xml'), xml)
    return home
  }

  it('is configured by TINYPIVOT_CLICKHOUSE_URL, with the database from the URL path unless set', () => {
    expect(clickHouseConfigFromEnv({})).toBeUndefined()
    const base = { TINYPIVOT_CLICKHOUSE_URL: 'https://ch.example.test:8443/acme' }
    expect(clickHouseConfigFromEnv(base)).toEqual({ url: base.TINYPIVOT_CLICKHOUSE_URL, username: undefined, password: undefined, passwordFile: undefined, database: 'acme', maxBytes: 50e9, maxRows: 5000 })
    expect(clickHouseConfigFromEnv({ ...base, TINYPIVOT_CLICKHOUSE_USER: 'analyst', TINYPIVOT_CLICKHOUSE_PASSWORD: 'p', TINYPIVOT_CLICKHOUSE_DATABASE: 'sales', TINYPIVOT_CLICKHOUSE_MAX_GB: '2' }))
      .toMatchObject({ username: 'analyst', password: 'p', database: 'sales', maxBytes: 2e9 })
  })

  it('reuses clickhouse-client\'s config.xml only when asked, reading the password later', () => {
    const home = homeWithClientConfig(`<config>
      <!-- <host>commented.example.test</host> -->
      <host>abc.eu-west-1.aws.clickhouse.cloud</host>
      <port>9440</port>
      <user>analyst</user>
      <password>s3cr&amp;t</password>
      <connections_credentials><connection><name>other</name><user>admin</user></connection></connections_credentials>
    </config>`)
    expect(clickHouseConfigFromEnv({}, home)).toBeUndefined()
    const config = clickHouseConfigFromEnv({ TINYPIVOT_CLICKHOUSE_USE_CLIENT_CONFIG: '1' }, home)
    expect(config).toMatchObject({ url: 'https://abc.eu-west-1.aws.clickhouse.cloud:8443', username: 'analyst', passwordFile: path.join(home, '.clickhouse-client', 'config.xml') })
    expect(config?.password).toBeUndefined()
    expect(clickHouseConfigFromEnv({ TINYPIVOT_CLICKHOUSE_USE_CLIENT_CONFIG: '1' }, os.tmpdir())).toBeUndefined()
  })

  it('parses the client config tags, ignoring named connections', () => {
    expect(parseClickHouseClientConfig('<clickhouse><host>db.internal</host><secure>false</secure><password><![CDATA[a<b]]></password><database>web</database></clickhouse>'))
      .toEqual({ host: 'db.internal', user: undefined, password: 'a<b', database: 'web', secure: false })
    expect(parseClickHouseClientConfig('<config><connections_credentials><connection><user>admin</user></connection></connections_credentials></config>').user).toBeUndefined()
  })
})

describe('clickhouse wiring', () => {
  it('is offered as query_clickhouse when a URL is set', async () => {
    const { warehousesFromEnv } = await import('../../packages/mcp/src/server')
    expect(warehousesFromEnv({ TINYPIVOT_CLICKHOUSE_URL: 'https://x:8443' }).map(w => w.toolName)).toEqual(['query_clickhouse'])
  })
})
