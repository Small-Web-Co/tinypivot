import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseQueryResult } from './warehouse.js'
import crypto from 'node:crypto'
import os from 'node:os'
import { formatBytes } from './bigquery.js'
import { clickHouseClientConfigFile, readTextFile } from './config-files.js'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage } from './runtime-package.js'
import { maskSql, QueryRefused, readOnlyStatementError } from './warehouse.js'

/**
 * Read-only ClickHouse over HTTP, through ClickHouse's official Node client. ClickHouse enforces the
 * limits itself: each query is sent with `readonly = 1` (no writes, no setting changes from the SQL,
 * no table functions that reach outside the server), a read cap, a timeout and a `log_comment`. A
 * text check refuses anything but one SELECT before it is sent. Rows are streamed and the stream is
 * dropped after the row cap, so a large result is cut without being downloaded.
 *
 * A user whose profile is already `readonly = 1` cannot receive any per-query setting (ClickHouse
 * refuses them all), so for that user only the profile's own limits apply; the first query of each
 * client reads the profile's level to know which settings it may send.
 */

export const CLICKHOUSE_RUNTIME: RuntimePackage = {
  name: '@clickhouse/client',
  version: '1.25.0',
  cacheName: 'clickhouse-client-1.25.0',
  purpose: 'ClickHouse queries',
}

const GB = 1_000_000_000
const DEFAULT_MAX_GB = 50
const DEFAULT_MAX_ROWS = 5000
const MAX_EXECUTION_TIME_S = 60
/** Above the server's own timeout, so ClickHouse reports the timeout rather than the client. */
const REQUEST_TIMEOUT_MS = 75_000
const MAX_LISTED_TABLES = 200
const LOG_COMMENT = 'tinypivot'
/** Names, then types, then one JSON array per row: the types let 64-bit integers, decimals and dates convert safely. */
const FORMAT = 'JSONCompactEachRowWithNamesAndTypes'
/** Settings whose `break` mode would return partial results without an error. */
const OVERFLOW_SETTINGS = ['read_overflow_mode', 'timeout_overflow_mode'] as const

export interface ClickHouseConfig {
  /** HTTP(S) endpoint, e.g. `https://host:8443`; it may also carry the user, password and database. */
  url: string
  username?: string
  password?: string
  /** clickhouse-client config file the password is read from when connecting, not before. */
  passwordFile?: string
  database?: string
  maxBytes: number
  maxRows: number
}

/* clickhouse-client's config.xml: only its top-level connection tags, never its named connections. */

export interface ClickHouseClientFile {
  host?: string
  user?: string
  password?: string
  database?: string
  secure?: boolean
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' }

function xmlText(raw: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw.trim())
  if (cdata)
    return cdata[1]
  return raw.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name])
}

/** Reads `host`, `user`, `password`, `database` and `secure` from a clickhouse-client config.xml. */
export function parseClickHouseClientConfig(xml: string): ClickHouseClientFile {
  const top = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<connections_credentials>[\s\S]*?<\/connections_credentials>/g, '')
  const tag = (name: string): string | undefined => {
    const match = new RegExp(`<${name}>(<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|[^<]*)</${name}>`).exec(top)
    return match ? xmlText(match[1]) : undefined
  }
  const secure = tag('secure')
  return {
    host: tag('host') || undefined,
    user: tag('user') || undefined,
    password: tag('password'),
    database: tag('database') || undefined,
    secure: secure === undefined ? undefined : /^(?:1|true|yes)$/i.test(secure),
  }
}

type Endpoint = Pick<ClickHouseConfig, 'url' | 'username' | 'password' | 'database' | 'passwordFile'>

/**
 * The URL's user, password and database (its path) moved into their own settings, so that
 * TINYPIVOT_CLICKHOUSE_USER, _PASSWORD and _DATABASE override them: the official client lets a URL
 * part win over the matching option, and warns on the console when both are given.
 */
export function endpointFromUrl(raw: string): Endpoint {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    // Left for the client to reject, without echoing a URL that may hold the password.
    return { url: raw }
  }
  const database = url.pathname.replace(/^\/+|\/+$/g, '')
  return {
    url: `${url.origin}${url.search}`,
    username: decodeURIComponent(url.username) || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: database ? decodeURIComponent(database) : undefined,
  }
}

/** clickhouse-client speaks the native protocol, so its `port` is not used: HTTPS is 8443, HTTP 8123. */
function endpointFromClientConfig(file: string): Endpoint | undefined {
  const text = readTextFile(file)
  if (text === undefined)
    return undefined
  const parsed = parseClickHouseClientConfig(text)
  const host = parsed.host ?? 'localhost'
  const secure = parsed.secure ?? host.endsWith('.clickhouse.cloud')
  const hostname = host.includes(':') ? `[${host}]` : host
  return {
    url: `${secure ? 'https' : 'http'}://${hostname}:${secure ? 8443 : 8123}`,
    username: parsed.user,
    database: parsed.database,
    passwordFile: file,
  }
}

function endpointFromEnv(env: NodeJS.ProcessEnv, home: string): Endpoint | undefined {
  const url = env.TINYPIVOT_CLICKHOUSE_URL?.trim()
  if (url)
    return endpointFromUrl(url)
  if (env.TINYPIVOT_CLICKHOUSE_USE_CLIENT_CONFIG?.trim() !== '1')
    return undefined
  return endpointFromClientConfig(clickHouseClientConfigFile(env, home))
}

/** ClickHouse settings from TINYPIVOT_CLICKHOUSE_*, or clickhouse-client's config when asked; undefined when neither is set. */
export function clickHouseConfigFromEnv(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): ClickHouseConfig | undefined {
  const endpoint = endpointFromEnv(env, home)
  if (!endpoint)
    return undefined
  const password = env.TINYPIVOT_CLICKHOUSE_PASSWORD || endpoint.password
  const maxGb = Number(env.TINYPIVOT_CLICKHOUSE_MAX_GB)
  return {
    url: endpoint.url,
    username: env.TINYPIVOT_CLICKHOUSE_USER?.trim() || endpoint.username,
    password,
    passwordFile: password ? undefined : endpoint.passwordFile,
    database: env.TINYPIVOT_CLICKHOUSE_DATABASE?.trim() || endpoint.database,
    maxBytes: (Number.isFinite(maxGb) && maxGb > 0 ? maxGb : DEFAULT_MAX_GB) * GB,
    maxRows: DEFAULT_MAX_ROWS,
  }
}

/* The parts of the official client TinyPivot uses. */

export type ClickHouseQuerySettings = Record<string, string | number>

export interface ClickHouseQueryParams {
  query: string
  format: typeof FORMAT
  query_id: string
  clickhouse_settings?: ClickHouseQuerySettings
}

export interface ClickHouseResultSetLike {
  /** Batches of rows; each row's `text` is one JSON array of the compact format. */
  stream: () => AsyncIterable<Array<{ text: string }>>
  close: () => void
}

export interface ClickHouseClientLike {
  query: (params: ClickHouseQueryParams) => Promise<ClickHouseResultSetLike>
  close: () => Promise<void>
}

export type ClickHouseClientFactory = (config: ClickHouseConfig) => Promise<ClickHouseClientLike>

interface ClientModule {
  createClient: (options: Record<string, unknown>) => ClickHouseClientLike
  ClickHouseLogLevel: { OFF: number }
}

const officialClient: ClickHouseClientFactory = async (config) => {
  const mod = await loadRuntimePackage<ClientModule>(CLICKHOUSE_RUNTIME)
  const fileText = config.password === undefined && config.passwordFile ? readTextFile(config.passwordFile) : undefined
  const password = config.password ?? (fileText === undefined ? undefined : parseClickHouseClientConfig(fileText).password)
  return mod.createClient({
    url: config.url,
    ...(config.username ? { username: config.username } : {}),
    ...(password === undefined ? {} : { password }),
    ...(config.database ? { database: config.database } : {}),
    application: 'TinyPivot',
    request_timeout: REQUEST_TIMEOUT_MS,
    // The MCP server talks over stdout, so the client must never log to the console.
    log: { level: mod.ClickHouseLogLevel.OFF },
  })
}

/* Values: the compact format's types say how to read each one. */

const WRAPPER_TYPE = /^(?:Nullable|LowCardinality)\((.*)\)$/

/** `Nullable(LowCardinality(String))` → `String`. */
export function baseType(type: string): string {
  const inner = WRAPPER_TYPE.exec(type.trim())?.[1]
  return inner === undefined ? type.trim() : baseType(inner)
}

/**
 * A ClickHouse JSON value as a number or string TinyPivot can store. 64-bit and wider integers come
 * quoted and become numbers only when exact; decimals become numbers; DateTime becomes ISO
 * (`2026-03-01T12:00:00`, wall time in the column's time zone); arrays, maps and tuples become JSON text.
 */
export function toClickHouseValue(value: unknown, type: string): unknown {
  if (typeof value !== 'string')
    return toPlainValue(value)
  const base = baseType(type)
  if (/^U?Int\d+$/.test(base)) {
    const number = Number(value)
    return Number.isSafeInteger(number) ? number : value
  }
  if (/^(?:Float|BFloat|Decimal)/.test(base)) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  if (base.startsWith('DateTime'))
    return value.replace(' ', 'T')
  return value
}

/** A JSON string, or a whole JSON number: strings are matched first, so no number is found inside one. */
const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi

/**
 * One line of the compact format, with integers too long for a JS number kept as exact text.
 * ClickHouse 25.8 writes 64-bit integers unquoted by default (output_format_json_quote_64bit_integers
 * = 0), which JSON.parse would round, and a readonly=1 user cannot change that setting.
 */
export function parseCompactLine(text: string): unknown[] {
  const exact = text.replace(JSON_TOKEN, token => (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? `"${token}"` : token))
  return JSON.parse(exact) as unknown[]
}

/** Rows of the compact format: the first line names the columns, the second gives their types. */
export function rowsFromCompact(lines: unknown[][]): Record<string, unknown>[] {
  const [names = [], types = [], ...data] = lines
  return data.map(values => Object.fromEntries(names.map((name, i) => [String(name), toClickHouseValue(values[i], String(types[i] ?? ''))])))
}

/* Settings ClickHouse enforces on each query. */

/**
 * What to send with each query, by the user's own `readonly` level. At 0, `readonly = 1` is sent with
 * the limits: ClickHouse checks a request's settings together against the user's profile, so the
 * limits apply, and the SQL itself can then change no setting. At 2, ClickHouse refuses a change to
 * `readonly` but takes the limits. At 1, it refuses every setting, so nothing is sent.
 */
export function querySettings(config: Pick<ClickHouseConfig, 'maxBytes'>, readonlyLevel: number): ClickHouseQuerySettings | undefined {
  if (readonlyLevel === 1)
    return undefined
  const limits: ClickHouseQuerySettings = {
    max_execution_time: MAX_EXECUTION_TIME_S,
    timeout_overflow_mode: 'throw',
    max_bytes_to_read: String(config.maxBytes),
    read_overflow_mode: 'throw',
    cancel_http_readonly_queries_on_client_close: 1,
    log_comment: LOG_COMMENT,
  }
  return readonlyLevel === 0 ? { readonly: '1', ...limits } : limits
}

/** ClickHouse's own refusals of the SQL, as messages for the model; the connection is fine. */
function limitMessage(code: string, config: Pick<ClickHouseConfig, 'maxBytes'>): string | undefined {
  switch (code) {
    case '307': return `This query read more than ${formatBytes(config.maxBytes)} (TINYPIVOT_CLICKHOUSE_MAX_GB), so ClickHouse stopped it. Filter on the table's partition or primary key columns, or select fewer columns.`
    case '159': return `ClickHouse stopped this query after ${MAX_EXECUTION_TIME_S} s. Filter on the partition or primary key columns, or aggregate over less data.`
    case '164': return 'ClickHouse refused this in read-only mode: this connection only reads.'
    case '497': return 'The ClickHouse user may not read this.'
    default: return undefined
  }
}

/** A ClickHouse error that refuses the query itself, as a QueryRefused; undefined for anything else. */
export function refusalFromError(error: unknown, config: Pick<ClickHouseConfig, 'maxBytes'>): QueryRefused | undefined {
  const code = (error as { code?: unknown } | null)?.code
  const message = typeof code === 'string' ? limitMessage(code, config) : undefined
  if (!message)
    return undefined
  const detail = error instanceof Error ? error.message.split('\n')[0].slice(0, 240) : ''
  return new QueryRefused(detail ? `${message} (ClickHouse: ${detail})` : message)
}

/** ClickHouse reads `# ` and `#!` to the end of the line as a comment (a `#` before anything else is a syntax error). */
const HASH_COMMENT = /#[ !][^\n]*/

/** ClickHouse syntax the shared read-only check does not cover. */
export function clickHouseTextError(sql: string): string | undefined {
  const masked = maskSql(sql, HASH_COMMENT).trim()
  if (/\bSETTINGS\s+[a-z_]\w*\s*=/i.test(masked))
    return 'A SETTINGS clause is not allowed: TinyPivot sets the read-only limits of each query.'
  if (/\bINTO\s+OUTFILE\b/i.test(masked))
    return 'INTO OUTFILE is not allowed: this connection only reads.'
  if (/\bFORMAT\s+[a-z]\w*$/i.test(masked))
    return 'Leave out the FORMAT clause: TinyPivot picks the result format.'
  return undefined
}

/* Running queries. */

/** Streams the result and stops reading once it has more than `maxRows` rows, so a large result is never downloaded whole. */
async function fetchRows(client: ClickHouseClientLike, query: string, settings: ClickHouseQuerySettings | undefined, maxRows: number) {
  const result = await client.query({
    query,
    format: FORMAT,
    query_id: `tinypivot-${crypto.randomUUID()}`,
    ...(settings ? { clickhouse_settings: settings } : {}),
  })
  const lines: unknown[][] = []
  try {
    for await (const batch of result.stream()) {
      lines.push(...batch.map(row => parseCompactLine(row.text)))
      // Two header lines, then one row past the cap is enough to know the result was cut.
      if (lines.length > maxRows + 2)
        break
    }
  }
  finally {
    result.close()
  }
  const rows = rowsFromCompact(lines)
  return { rows: rows.slice(0, maxRows), truncated: rows.length > maxRows }
}

export interface ClickHouseProfile {
  /** The user's own `readonly` level: 0, 1 (no setting changes) or 2. */
  readonly: number
  /** Overflow settings the profile sets to `break`. */
  breakModes: string[]
}

const PROFILE_SQL = `SELECT getSetting('readonly') AS readonly, ${OVERFLOW_SETTINGS.map(name => `getSetting('${name}') AS ${name}`).join(', ')}`

export function readProfile(row: Record<string, unknown> | undefined): ClickHouseProfile {
  const level = Number(row?.readonly ?? 0)
  return {
    readonly: Number.isFinite(level) ? level : 0,
    breakModes: OVERFLOW_SETTINGS.filter(name => row?.[name] === 'break'),
  }
}

interface ClickHouseSession {
  client: ClickHouseClientLike
  profile: ClickHouseProfile
}

async function openSession(config: ClickHouseConfig, createClient: ClickHouseClientFactory): Promise<ClickHouseSession> {
  const client = await createClient(config)
  try {
    const { rows } = await fetchRows(client, PROFILE_SQL, undefined, 1)
    return { client, profile: readProfile(rows[0]) }
  }
  catch (error) {
    await client.close().catch(() => {})
    throw error
  }
}

/** One line on how the query was limited, for the reply. */
export function runNote(config: Pick<ClickHouseConfig, 'maxBytes'>, profile: ClickHouseProfile): string {
  const limits = `reads over ${formatBytes(config.maxBytes)} or runs over ${MAX_EXECUTION_TIME_S} s`
  if (profile.readonly === 0)
    return `ClickHouse ran this read-only (readonly=1) and stops any query that ${limits}.`
  if (profile.readonly !== 1)
    return `This ClickHouse user is readonly=${profile.readonly}, so writes are blocked; ClickHouse stops any query that ${limits}.`
  const partial = profile.breakModes.length > 0
    ? ` It sets ${profile.breakModes.join(' and ')} to 'break', so a query that hits a limit returns partial totals without an error.`
    : ''
  return `This ClickHouse user is readonly=1, so ClickHouse refuses per-query limits and the user's settings profile sets them.${partial}`
}

async function runQuery(session: ClickHouseSession, config: ClickHouseConfig, sql: string): Promise<WarehouseQueryResult> {
  const cleaned = sql.trim().replace(/;+\s*$/, '')
  const textError = readOnlyStatementError(cleaned, HASH_COMMENT) ?? clickHouseTextError(cleaned)
  if (textError)
    throw new QueryRefused(textError)
  const result = await fetchRows(session.client, cleaned, querySettings(config, session.profile.readonly), config.maxRows)
  return { ...result, note: runNote(config, session.profile) }
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

async function listTables(session: ClickHouseSession, config: ClickHouseConfig): Promise<string[]> {
  const where = config.database
    ? `database = ${sqlString(config.database)}`
    : `database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')`
  const { rows } = await fetchRows(
    session.client,
    `SELECT concat(database, '.', name) AS name FROM system.tables WHERE ${where} AND NOT is_temporary ORDER BY name LIMIT ${MAX_LISTED_TABLES}`,
    querySettings(config, session.profile.readonly),
    MAX_LISTED_TABLES,
  )
  return rows.map(row => String(row.name))
}

export function clickHouseConnector(config: ClickHouseConfig, createClient: ClickHouseClientFactory = officialClient): WarehouseConnector {
  let session: Promise<ClickHouseSession> | undefined
  const getSession = () => {
    if (!session) {
      const opening = openSession(config, createClient)
      opening.catch(() => {
        if (session === opening)
          session = undefined
      })
      session = opening
    }
    return session
  }
  /** A client that hit an error is closed and replaced on the next call, never reused. */
  const withSession = async <T>(work: (s: ClickHouseSession) => Promise<T>): Promise<T> => {
    const current = await getSession()
    try {
      return await work(current)
    }
    catch (error) {
      // A refused query, by TinyPivot or by ClickHouse's limits, leaves the client healthy; anything else may have broken it.
      const refusal = error instanceof QueryRefused ? error : refusalFromError(error, config)
      if (refusal)
        throw refusal
      session = undefined
      await current.client.close().catch(() => {})
      throw error
    }
  }
  return {
    id: 'clickhouse',
    label: 'ClickHouse',
    toolName: 'query_clickhouse',
    sqlHint: `ClickHouse SQL, one read-only SELECT without SETTINGS or FORMAT${config.database ? `; unqualified tables resolve in ${config.database}` : '; name tables database.table'}. Names are case-sensitive.`,
    freeAlternative: 'export with `clickhouse client --query "SELECT …" --format CSVWithNames > result.csv` and pass the file to `load_file`',
    maxRows: config.maxRows,
    listTables: () => withSession(s => listTables(s, config)),
    query: sql => withSession(s => runQuery(s, config, sql)),
  }
}
