import type { IniFile } from './config-files.js'
import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseQueryResult } from './warehouse.js'
import fs from 'node:fs'
import os from 'node:os'
import { expandHome, mysqlOptionFile, readIniFile } from './config-files.js'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage } from './runtime-package.js'
import { listFromEnv, QueryRefused, readOnlyStatementError } from './warehouse.js'

/**
 * Read-only MySQL and MariaDB, through the pure-JS mysql2 driver. Each query passes a text check
 * (one SELECT, no write words, no server-side file access, read with MySQL's own quoting and comment
 * rules), then an optional allowlist check against information_schema. It runs alone
 * (multipleStatements off) inside `START TRANSACTION READ ONLY`, which the engine enforces, with
 * the server's statement time limit set on the session, and is rolled back. A user with SELECT-only
 * grants is still the strongest guard, and the docs recommend one.
 */

export const MYSQL_RUNTIME: RuntimePackage = {
  name: 'mysql2',
  version: '3.24.6',
  cacheName: 'mysql2-3.24.6',
  purpose: 'MySQL queries',
}

const DEFAULT_MAX_ROWS = 5000
const DEFAULT_PORT = 3306
const STATEMENT_TIMEOUT_S = 60
/** The driver stops waiting a little after the server's own limit, for servers without one. */
const CLIENT_TIMEOUT_MS = 75_000
const CONNECT_TIMEOUT_MS = 15_000
const MAX_LISTED_TABLES = 200
const SYSTEM_SCHEMAS = ['information_schema', 'mysql', 'performance_schema', 'sys']

/* Configuration */

/** Where the sign-in comes from: a connection URL, or the MySQL client's option file, read at first connect. */
export type MysqlSource = { kind: 'url', url: string } | { kind: 'option-file', file: string }

export interface MysqlConfig {
  source: MysqlSource
  /** The default database: unqualified table names resolve in it. */
  database?: string
  /** `db` or `db.table` entries; empty means whatever the user's grants allow. */
  allowed?: string[]
  maxRows: number
}

export type MysqlTlsMode = 'required' | 'verify-ca' | 'verify-identity'

export interface MysqlTls {
  mode: MysqlTlsMode
  /** PEM file paths, read at connect. */
  ca?: string
  cert?: string
  key?: string
}

export interface MysqlConnectionSettings {
  host: string
  port: number
  socketPath?: string
  user: string
  password?: string
  database?: string
  tls?: MysqlTls
}

function databaseFromUrl(url: string): string | undefined {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1)) || undefined
  }
  catch {
    return undefined
  }
}

/**
 * MySQL settings from TINYPIVOT_MYSQL_*, or undefined when neither a URL nor a database is set.
 * `TINYPIVOT_MYSQL_URL` carries everything; otherwise `TINYPIVOT_MYSQL_DATABASE` switches the tool
 * on and the sign-in comes from the option file the `mysql` client already uses.
 */
export function mysqlConfigFromEnv(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): MysqlConfig | undefined {
  const url = env.TINYPIVOT_MYSQL_URL?.trim()
  const database = env.TINYPIVOT_MYSQL_DATABASE?.trim() || undefined
  if (!url && !database)
    return undefined
  const optionFile = env.TINYPIVOT_MYSQL_OPTION_FILE?.trim()
  const source: MysqlSource = url
    ? { kind: 'url', url }
    : { kind: 'option-file', file: optionFile ? expandHome(optionFile, home) : mysqlOptionFile(env, home) }
  return {
    source,
    database: database ?? (url ? databaseFromUrl(url) : undefined),
    allowed: listFromEnv(env.TINYPIVOT_MYSQL_ALLOWED),
    maxRows: DEFAULT_MAX_ROWS,
  }
}

type OptionGetter = (name: string) => string | undefined

const SSL_MODES: Record<string, MysqlTlsMode | undefined> = {
  DISABLED: undefined,
  // mysql2 cannot fall back to plain text, so "encrypt if possible" connects without TLS.
  PREFERRED: undefined,
  REQUIRED: 'required',
  VERIFY_CA: 'verify-ca',
  VERIFY_IDENTITY: 'verify-identity',
}

const isOn = (value: string | undefined) => value !== undefined && ['', '1', 'on', 'true', 'yes'].includes(value.toLowerCase())

/** The `ssl` switch: MariaDB's option-file flag, or mysql2's URL style (`ssl=true`, `ssl={"rejectUnauthorized":true}`). */
function sslSwitchMode(value: string | undefined, hasCa: boolean): MysqlTlsMode | undefined {
  if (value?.trim().startsWith('{')) {
    const options = JSON.parse(value) as { rejectUnauthorized?: boolean }
    return options.rejectUnauthorized === false ? 'required' : 'verify-ca'
  }
  if (isOn(value))
    return hasCa ? 'verify-ca' : 'required'
  return undefined
}

function tlsMode(get: OptionGetter, hasCa: boolean): MysqlTlsMode | undefined {
  const explicit = get('ssl-mode')?.toUpperCase()
  if (explicit) {
    if (!(explicit in SSL_MODES))
      throw new Error(`Unknown ssl-mode "${explicit}"; use DISABLED, REQUIRED, VERIFY_CA or VERIFY_IDENTITY.`)
    return SSL_MODES[explicit]
  }
  if (get('skip-ssl') !== undefined || ['0', 'off', 'false', 'no'].includes(get('ssl')?.toLowerCase() ?? ''))
    return undefined
  if (isOn(get('ssl-verify-server-cert')))
    return 'verify-identity'
  // As in the mysql client, a CA file without an ssl-mode means VERIFY_CA.
  return sslSwitchMode(get('ssl'), hasCa) ?? (hasCa ? 'verify-ca' : undefined)
}

/** TLS from option-file or URL names: ssl-mode, ssl-ca, ssl-cert, ssl-key, and MariaDB's ssl / ssl-verify-server-cert. */
export function tlsFromOptions(get: OptionGetter): MysqlTls | undefined {
  const files = { ca: get('ssl-ca') || undefined, cert: get('ssl-cert') || undefined, key: get('ssl-key') || undefined }
  const mode = tlsMode(get, Boolean(files.ca))
  if (!mode)
    return undefined
  return { mode, ...Object.fromEntries(Object.entries(files).filter(([, v]) => v)) }
}

/** Reads `mysql://user:pass@host:port/db?ssl-mode=VERIFY_IDENTITY&ssl-ca=/path/ca.pem` (or `mariadb://`). */
export function mysqlSettingsFromUrl(raw: string): Omit<MysqlConnectionSettings, 'user'> & { user?: string } {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    // Never echo the URL: it holds the password.
    throw new Error('TINYPIVOT_MYSQL_URL is not a valid URL; use mysql://user:password@host:3306/database.')
  }
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:')
    throw new Error('TINYPIVOT_MYSQL_URL must start with mysql:// or mariadb://.')
  const params = url.searchParams
  const get: OptionGetter = name => params.get(name) ?? params.get(name.replace(/-/g, '_')) ?? undefined
  const host = decodeURIComponent(url.hostname.replace(/^\[(.*)\]$/, '$1')) || 'localhost'
  return {
    host,
    port: Number(url.port) || DEFAULT_PORT,
    socketPath: host === 'localhost' ? get('socket') : undefined,
    user: decodeURIComponent(url.username) || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: decodeURIComponent(url.pathname.slice(1)) || undefined,
    tls: tlsFromOptions(get),
  }
}

/** Option groups the mysql and mariadb clients read, in order; later groups win. */
const OPTION_GROUPS = ['client-server', 'client', 'client-mariadb', 'mysql', 'mariadb-client']

function mergeOptionGroups(ini: IniFile): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const group of OPTION_GROUPS) {
    // Option names may use dashes or underscores interchangeably.
    for (const [key, value] of Object.entries(ini[group] ?? {}))
      merged[key.toLowerCase().replace(/_/g, '-')] = value
  }
  return merged
}

/** Reads the `[client]` (and `[mysql]`, MariaDB's client groups) sections of a MySQL option file such as ~/.my.cnf. */
export function mysqlSettingsFromOptionFile(file: string): Omit<MysqlConnectionSettings, 'user'> & { user?: string } {
  const ini = readIniFile(file)
  if (!ini)
    throw new Error(`Could not read the MySQL option file ${file}. Set TINYPIVOT_MYSQL_URL, or point TINYPIVOT_MYSQL_OPTION_FILE at your option file.`)
  const options = mergeOptionGroups(ini)
  const get: OptionGetter = name => options[name]
  const host = get('host') || 'localhost'
  return {
    host,
    port: Number(get('port')) || DEFAULT_PORT,
    // As in the mysql client, a socket is used only for localhost.
    socketPath: host === 'localhost' ? get('socket') || undefined : undefined,
    user: get('user') || undefined,
    password: get('password') || undefined,
    database: get('database') || undefined,
    tls: tlsFromOptions(get),
  }
}

/** The settings to connect with, read from the URL or option file now (at first connect), never earlier. */
export function resolveMysqlSettings(config: MysqlConfig): MysqlConnectionSettings {
  const settings = config.source.kind === 'url'
    ? mysqlSettingsFromUrl(config.source.url)
    : mysqlSettingsFromOptionFile(config.source.file)
  // Like the mysql client, the user defaults to the login name.
  return { ...settings, user: settings.user ?? os.userInfo().username, database: config.database ?? settings.database }
}

/* Reading SQL the way MySQL does */

type SegmentKind = 'code' | 'string' | 'quoted' | 'comment' | 'executable' | 'hint'
interface Segment { kind: SegmentKind, text: string }
interface Lexing { single: boolean, double: boolean }

/**
 * Whether a backslash escapes the next character inside '…' and "…" depends on the server's
 * sql_mode (NO_BACKSLASH_ESCAPES, ANSI_QUOTES), which TinyPivot does not control. The SQL is read
 * every way the server might read it, and refused when the readings differ.
 */
const LEXINGS: Lexing[] = [
  { single: true, double: true },
  { single: false, double: false },
  { single: true, double: false },
]

function quoteEnd(sql: string, start: number, quote: string, backslash: boolean): number {
  let i = start + 1
  while (i < sql.length) {
    const ch = sql[i]
    if (backslash && ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (sql[i + 1] !== quote)
        return i + 1
      i += 1
    }
    i += 1
  }
  return sql.length
}

function lineEnd(sql: string, start: number): number {
  const end = sql.indexOf('\n', start)
  return end === -1 ? sql.length : end
}

function blockEnd(sql: string, start: number): number {
  const end = sql.indexOf('*/', start + 2)
  return end === -1 ? sql.length : end + 2
}

/** Where the quoted name, string or comment opened by `token` ends, or undefined when `token` opens none. */
function specialEnd(sql: string, start: number, token: string, lexing: Lexing): number | undefined {
  switch (token) {
    case '\'': return quoteEnd(sql, start, token, lexing.single)
    case '"': return quoteEnd(sql, start, token, lexing.double)
    case '`': return quoteEnd(sql, start, token, false)
    case '#': return lineEnd(sql, start)
    case '/*': return blockEnd(sql, start)
    default: {
      // `--` starts a comment only when followed by whitespace or a control character.
      const next = sql.charCodeAt(start + 2)
      return Number.isNaN(next) || next <= 32 ? lineEnd(sql, start) : undefined
    }
  }
}

function specialKind(sql: string, start: number, token: string): SegmentKind {
  if (token === '\'')
    return 'string'
  if (token === '"' || token === '`')
    return 'quoted'
  if (token !== '/*')
    return 'comment'
  if (/^\/\*(?:!|M!)/i.test(sql.slice(start, start + 4)))
    return 'executable'
  return sql[start + 2] === '+' ? 'hint' : 'comment'
}

function segmentSql(sql: string, lexing: Lexing): Segment[] {
  const segments: Segment[] = []
  const special = /['"`#]|--|\/\*/g
  let last = 0
  for (let match = special.exec(sql); match; match = special.exec(sql)) {
    const start = match.index
    const end = specialEnd(sql, start, match[0], lexing)
    if (end === undefined) {
      special.lastIndex = start + 1
      continue
    }
    if (start > last)
      segments.push({ kind: 'code', text: sql.slice(last, start) })
    segments.push({ kind: specialKind(sql, start, match[0]), text: sql.slice(start, end) })
    last = end
    special.lastIndex = end
  }
  if (last < sql.length)
    segments.push({ kind: 'code', text: sql.slice(last) })
  return segments
}

/** The SQL split into code, strings, quoted names and comments, or why it cannot be read unambiguously. */
function lexMysql(sql: string): Segment[] | string {
  const [first, ...others] = LEXINGS.map(lexing => segmentSql(sql, lexing))
  const shape = JSON.stringify(first)
  if (others.some(segments => JSON.stringify(segments) !== shape))
    return 'Write a quote inside a string by doubling it (\'it\'\'s\'), not with a backslash: how MySQL reads backslashes depends on the server\'s sql_mode.'
  return first
}

const MASKED: Record<SegmentKind, string | undefined> = { code: undefined, string: '\'\'', quoted: '``', comment: ' ', executable: ' ', hint: ' ' }

function maskSegments(segments: Segment[]): string {
  return segments.map(s => MASKED[s.kind] ?? s.text).join('')
}

const MYSQL_REFUSALS: Array<{ pattern: RegExp, reason: string }> = [
  { pattern: /\bINTO\b/i, reason: 'SELECT … INTO (OUTFILE, DUMPFILE or variables) is not allowed: this connection only reads.' },
  { pattern: /\bLOAD_FILE\s*\(/i, reason: 'LOAD_FILE() is not allowed: it reads files on the database server.' },
  { pattern: /\bFOR\s+(?:UPDATE|SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i, reason: 'Locking reads (FOR UPDATE, FOR SHARE, LOCK IN SHARE MODE) are not allowed.' },
]

/**
 * MySQL's own reasons to refuse SQL that passed the shared check: the shared check does not know
 * `#` comments, executable comments or MySQL's backslash escapes, so its word checks are repeated
 * on the SQL as MySQL reads it, plus MySQL-only ways to write files or take locks.
 */
export function mysqlStatementError(sql: string): string | undefined {
  const segments = lexMysql(sql)
  if (typeof segments === 'string')
    return segments
  if (segments.some(s => s.kind === 'executable'))
    return 'Executable comments (/*! … */) are not allowed: MySQL runs what is inside them.'
  if (segments.some(s => s.kind === 'hint'))
    return 'Optimizer hints (/*+ … */) are not allowed here: they can lift the time limit.'
  const masked = maskSegments(segments).trim().replace(/;\s*$/, '')
  return readOnlyStatementError(masked) ?? MYSQL_REFUSALS.find(r => r.pattern.test(masked))?.reason
}

/* Allowlist */

interface NameRef {
  /** Lowercased name parts: `acme.orders.id` is ['acme', 'orders', 'id']. */
  parts: string[]
  /** Followed by `(`: a function call. */
  call: boolean
}

type Token = { type: 'word', text: string } | { type: '.' | '(' | 'other' }

function unquoteName(text: string): string {
  const quote = text[0]
  const closed = text.length > 1 && text.endsWith(quote)
  return text.slice(1, closed ? -1 : undefined).split(quote + quote).join(quote)
}

function segmentTokens(segment: Segment): Token[] {
  if (segment.kind === 'quoted')
    return [{ type: 'word', text: unquoteName(segment.text) }]
  // Comments read as whitespace, so `acme /* x */ . orders` is still one name.
  if (segment.kind === 'comment')
    return []
  if (segment.kind !== 'code')
    return [{ type: 'other' }]
  return [...segment.text.matchAll(/[\p{L}\p{N}_$]+|\S/gu)].map(([text]): Token => {
    if (text === '.' || text === '(')
      return { type: text }
    return /^[\p{L}\p{N}_$]/u.test(text) ? { type: 'word', text } : { type: 'other' }
  })
}

function wordAt(tokens: Token[], index: number): string | undefined {
  const token = tokens[index]
  return token?.type === 'word' ? token.text.toLowerCase() : undefined
}

/**
 * Every dotted name in the SQL (outside strings), quoted or not. A word after a lone dot starts a
 * name too: MySQL reads `.orders` as the default database's orders.
 */
function referencedNames(segments: Segment[]): NameRef[] {
  const tokens = segments.flatMap(segmentTokens)
  const refs: NameRef[] = []
  for (let i = 0; i < tokens.length; i++) {
    const first = wordAt(tokens, i)
    if (first === undefined)
      continue
    const parts = [first]
    for (let next = wordAt(tokens, i + 2); next !== undefined && tokens[i + 1].type === '.'; next = wordAt(tokens, i + 2)) {
      parts.push(next)
      i += 2
    }
    // A number such as 1.5 is not a name.
    if (!/^\d+$/.test(first))
      refs.push({ parts, call: tokens[i + 1]?.type === '(' })
  }
  return refs
}

type ObjectName = [db: string, name: string]

const objectKey = ([db, name]: ObjectName) => JSON.stringify([db.toLowerCase(), name.toLowerCase()])

/**
 * The objects a reference could mean: `a.b` may be database a's b, and `a` the default database's a.
 * Every position counts, not just the first, so a keyword glued to a name (`FROM.orders`) is still
 * checked.
 */
function candidates(refs: NameRef[], database: string | undefined): ObjectName[] {
  const all = refs.flatMap(ref => ref.parts.flatMap((part, i): ObjectName[] => [
    ...(i + 1 < ref.parts.length ? [[part, ref.parts[i + 1]] as ObjectName] : []),
    ...(database ? [[database.toLowerCase(), part] as ObjectName] : []),
  ]))
  return [...new Map(all.map(object => [objectKey(object), object])).values()]
}

/** Whether `db.name` is covered by an allowlist entry (`db` or `db.table`, any case, backticks optional). */
export function isAllowedMysqlObject([db, name]: ObjectName, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0)
    return true
  const parts = [db.toLowerCase(), name.toLowerCase()]
  return allowed.some((entry) => {
    const want = entry.replace(/`/g, '').toLowerCase().split('.')
    return want.length <= 2 && want.every((part, i) => parts[i] === part)
  })
}

const TABLE_LOOKUP = 'SELECT table_schema AS db, table_name AS name FROM information_schema.tables WHERE LOWER(table_name) IN (?)'
const FUNCTION_LOOKUP = 'SELECT routine_schema AS db, routine_name AS name FROM information_schema.routines WHERE routine_type = \'FUNCTION\' AND LOWER(routine_name) IN (?)'

/** The first candidate that exists (per `lookup`) and is not allowed. */
async function firstBlocked(session: MysqlSessionLike, lookup: string, objects: ObjectName[], allowed: string[]): Promise<string | undefined> {
  const suspects = objects.filter(object => !isAllowedMysqlObject(object, allowed))
  if (suspects.length === 0)
    return undefined
  const rows = await session.query(lookup, [[...new Set(suspects.map(([, name]) => name))]])
  const existing = new Set(rows.map(row => objectKey([String(row.db), String(row.name)])))
  const blocked = suspects.find(object => existing.has(objectKey(object)))
  return blocked && blocked.join('.')
}

/**
 * Refuses SQL that names a table, view or stored function outside TINYPIVOT_MYSQL_ALLOWED. Every
 * name in the SQL is looked up in information_schema, which lists exactly the objects this user can
 * read, so no table is reached without being named and checked. Over-matching (an alias or column
 * that shares a table's name) only refuses more.
 */
async function checkAllowlist(session: MysqlSessionLike, database: string | undefined, allowed: string[], segments: Segment[]): Promise<void> {
  const refs = referencedNames(segments)
  const table = await firstBlocked(session, TABLE_LOOKUP, candidates(refs, database), allowed)
  if (table)
    throw new QueryRefused(`Table \`${table}\` is not in TINYPIVOT_MYSQL_ALLOWED. (Every name in the SQL is checked against the tables you can read, so a column or alias with the same name counts too.)`)
  const fn = await firstBlocked(session, FUNCTION_LOOKUP, candidates(refs.filter(ref => ref.call), database), allowed)
  if (fn)
    throw new QueryRefused(`Stored function \`${fn}\` is not in TINYPIVOT_MYSQL_ALLOWED; it could read other tables.`)
}

/* Values */

interface Mysql2Field {
  type: string
  string: () => string | null
  buffer: () => Buffer | null
}

/** mysql2 typeCast: DECIMAL to a number when finite (else its exact text), BIT to a number. */
export function castMysqlField(field: Mysql2Field, next: () => unknown): unknown {
  if (field.type === 'NEWDECIMAL' || field.type === 'DECIMAL') {
    const text = field.string()
    if (text === null)
      return null
    const value = Number(text)
    return Number.isFinite(value) ? value : text
  }
  if (field.type === 'BIT') {
    const bits = field.buffer()
    if (!bits)
      return null
    return bits.length <= 6 ? bits.readUIntBE(0, bits.length) : `0x${bits.toString('hex')}`
  }
  return next()
}

/** A driver value as plain JSON: zero dates (0000-00-00) become null, binary becomes 0x… hex. */
export function mysqlPlainValue(value: unknown): unknown {
  if (value instanceof Date && Number.isNaN(value.getTime()))
    return null
  if (Buffer.isBuffer(value))
    return `0x${value.toString('hex')}`
  return toPlainValue(value)
}

/* Sessions */

/** One open connection. */
export interface MysqlSessionLike {
  /** Runs one of TinyPivot's own statements, with `?` placeholders, and returns all its rows. */
  query: (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>
  /** Runs the model's SELECT, reading at most `maxRows` rows. A truncated read stops mid-result and drops the connection. */
  stream: (sql: string, maxRows: number) => Promise<{ rows: Record<string, unknown>[], truncated: boolean }>
  close: () => Promise<void>
}

export type MysqlSessionFactory = (config: MysqlConfig) => Promise<MysqlSessionLike>

export type MysqlFlavor = 'mysql' | 'mariadb'

/** The statement that caps how long one statement may run: MySQL counts milliseconds, MariaDB seconds. */
export function timeoutStatement(flavor: MysqlFlavor): string {
  return flavor === 'mariadb'
    ? `SET SESSION max_statement_time = ${STATEMENT_TIMEOUT_S}`
    : `SET SESSION MAX_EXECUTION_TIME = ${STATEMENT_TIMEOUT_S * 1000}`
}

interface PreparedSession {
  session: MysqlSessionLike
  version: string
  flavor: MysqlFlavor
  timeLimit: boolean
}

/** Sets the time limit, trying the other server's variable too (a proxy can report another version); false when neither works. */
async function setTimeLimit(session: MysqlSessionLike, flavor: MysqlFlavor): Promise<boolean> {
  const order: MysqlFlavor[] = flavor === 'mariadb' ? ['mariadb', 'mysql'] : ['mysql', 'mariadb']
  for (const candidate of order) {
    try {
      await session.query(timeoutStatement(candidate))
      return true
    }
    catch {
      // Too old for this variable (MySQL before 5.7.8, MariaDB before 10.1); try the next.
    }
  }
  return false
}

async function prepareSession(session: MysqlSessionLike): Promise<PreparedSession> {
  const [row] = await session.query('SELECT VERSION() AS version')
  const version = String(row?.version ?? '')
  const flavor: MysqlFlavor = /mariadb/i.test(version) ? 'mariadb' : 'mysql'
  // TIMESTAMP values come back in UTC, matching the driver's timezone: 'Z'.
  await session.query('SET SESSION time_zone = \'+00:00\'')
  return { session, version, flavor, timeLimit: await setTimeLimit(session, flavor) }
}

/* The mysql2 driver, wrapped as a MysqlSessionLike. */

interface Mysql2Readable {
  on: (event: string, listener: (arg: never) => void) => Mysql2Readable
  pause: () => void
}
interface Mysql2Connection {
  connect: (cb: (err: Error | null) => void) => void
  query: (options: { sql: string, values?: unknown[], timeout?: number }, cb?: (err: Error | null, rows: unknown) => void) => { stream: () => Mysql2Readable }
  destroy: () => void
  on: (event: 'error', listener: (err: Error) => void) => void
  /** The socket, destroyed outright so the server stops sending a result we no longer read. */
  stream?: { destroy?: () => void }
}
interface Mysql2Module {
  createConnection: (options: Record<string, unknown>) => Mysql2Connection
}

/** mysql2 `ssl` options for a TLS mode, reading the PEM files now. */
export function mysqlSslOptions(tls: MysqlTls | undefined): Record<string, unknown> | undefined {
  if (!tls)
    return undefined
  const read = (file: string | undefined) => (file ? fs.readFileSync(expandHome(file), 'utf8') : undefined)
  const files = Object.entries({ ca: read(tls.ca), cert: read(tls.cert), key: read(tls.key) }).filter(([, v]) => v)
  return {
    ...Object.fromEntries(files),
    rejectUnauthorized: tls.mode !== 'required',
    verifyIdentity: tls.mode === 'verify-identity',
  }
}

/** Connection options: one statement per query, no LOCAL INFILE, dates in UTC, exact big integers, JSON as text. */
export function mysqlConnectionOptions(settings: MysqlConnectionSettings): Record<string, unknown> {
  return {
    ...(settings.socketPath ? { socketPath: settings.socketPath } : { host: settings.host, port: settings.port }),
    user: settings.user,
    password: settings.password,
    database: settings.database,
    ssl: mysqlSslOptions(settings.tls),
    multipleStatements: false,
    flags: ['-LOCAL_FILES'],
    connectTimeout: CONNECT_TIMEOUT_MS,
    connectAttributes: { program_name: 'TinyPivot' },
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    jsonStrings: true,
    typeCast: castMysqlField,
  }
}

function streamRows(connection: Mysql2Connection, sql: string, maxRows: number): Promise<{ rows: Record<string, unknown>[], truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = []
    let done = false
    const stream = connection.query({ sql, timeout: CLIENT_TIMEOUT_MS }).stream()
    stream.on('data', (row: Record<string, unknown>) => {
      if (done)
        return
      if (rows.length < maxRows) {
        rows.push(row)
        return
      }
      // One row past the cap: stop reading and drop the connection, so the rest is never sent.
      done = true
      resolve({ rows, truncated: true })
      stream.pause()
      connection.destroy()
      connection.stream?.destroy?.()
    })
    stream.on('error', (error: Error) => {
      if (!done)
        reject(error)
      done = true
    })
    stream.on('end', () => {
      if (!done)
        resolve({ rows, truncated: false })
      done = true
    })
  })
}

async function loadMysql2(): Promise<Mysql2Module> {
  const loaded = await loadRuntimePackage<Mysql2Module & { default?: Mysql2Module }>(MYSQL_RUNTIME)
  return typeof loaded.createConnection === 'function' ? loaded : loaded.default!
}

const officialSession: MysqlSessionFactory = async (config) => {
  const mysql = await loadMysql2()
  const connection = mysql.createConnection(mysqlConnectionOptions(resolveMysqlSettings(config)))
  // A dropped connection fails its next query rather than crashing the server with an unhandled event.
  connection.on('error', () => {})
  const close = async () => {
    connection.destroy()
    connection.stream?.destroy?.()
  }
  try {
    await new Promise<void>((resolve, reject) => connection.connect(err => (err ? reject(err) : resolve())))
  }
  catch (error) {
    await close()
    throw error
  }
  return {
    query: (sql, values) => new Promise((resolve, reject) => {
      connection.query({ sql, values, timeout: CLIENT_TIMEOUT_MS }, (err, rows) => (err ? reject(err) : resolve(Array.isArray(rows) ? rows : [])))
    }),
    stream: (sql, maxRows) => streamRows(connection, sql, maxRows),
    close,
  }
}

/* The connector */

async function listedSchemaTables(session: MysqlSessionLike, schemas: string[] | undefined): Promise<string[]> {
  const where = schemas ? 'table_schema IN (?)' : 'table_schema NOT IN (?)'
  const rows = await session.query(
    `SELECT CONCAT(table_schema, '.', table_name) AS name FROM information_schema.tables WHERE ${where} ORDER BY 1 LIMIT ${MAX_LISTED_TABLES}`,
    [schemas ?? SYSTEM_SCHEMAS],
  )
  return rows.map(row => String(row.name))
}

async function listTables(session: MysqlSessionLike, config: MysqlConfig): Promise<string[]> {
  if (!config.allowed)
    return listedSchemaTables(session, config.database ? [config.database] : undefined)
  const fullNames = config.allowed.filter(entry => entry.includes('.'))
  const databases = config.allowed.filter(entry => !entry.includes('.'))
  const inDatabases = databases.length > 0 ? await listedSchemaTables(session, databases) : []
  return [...fullNames, ...inDatabases].slice(0, MAX_LISTED_TABLES)
}

function runNote(prepared: PreparedSession): string {
  const server = `${prepared.flavor === 'mariadb' ? 'MariaDB' : 'MySQL'} ${prepared.version.split('-')[0]}`
  const limit = prepared.timeLimit
    ? `${STATEMENT_TIMEOUT_S}-second limit`
    : `no server time limit (TinyPivot stops waiting after ${CLIENT_TIMEOUT_MS / 1000} s)`
  return `Ran in a read-only transaction on ${server}, ${limit}.`
}

async function runQuery(prepared: PreparedSession, config: MysqlConfig, sql: string): Promise<WarehouseQueryResult> {
  const cleaned = sql.trim().replace(/;+\s*$/, '')
  const textError = readOnlyStatementError(cleaned) ?? mysqlStatementError(cleaned)
  if (textError)
    throw new QueryRefused(textError)
  const { session } = prepared
  if (config.allowed)
    await checkAllowlist(session, config.database, config.allowed, lexMysql(cleaned) as Segment[])

  await session.query('START TRANSACTION READ ONLY')
  const { rows, truncated } = await session.stream(cleaned, config.maxRows)
  // A truncated read dropped the connection, which rolls the transaction back on the server.
  if (!truncated)
    await session.query('ROLLBACK')
  return {
    rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, mysqlPlainValue(value)]))),
    truncated,
    note: runNote(prepared),
  }
}

export function mysqlConnector(config: MysqlConfig, createSession: MysqlSessionFactory = officialSession): WarehouseConnector {
  let current: Promise<PreparedSession> | undefined
  const open = async () => {
    const session = await createSession(config)
    try {
      return await prepareSession(session)
    }
    catch (error) {
      await session.close().catch(() => {})
      throw error
    }
  }
  const getSession = () => {
    current ??= open()
    current.catch(() => {
      current = undefined
    })
    return current
  }
  const retire = async (prepared: PreparedSession) => {
    current = undefined
    await prepared.session.close().catch(() => {})
  }
  /** A session that hit an error is closed and replaced on the next call, never reused. */
  const withSession = async <T>(work: (prepared: PreparedSession) => Promise<T>): Promise<T> => {
    const prepared = await getSession()
    try {
      return await work(prepared)
    }
    catch (error) {
      // A refused query leaves the session healthy; anything else may have broken it.
      if (!(error instanceof QueryRefused))
        await retire(prepared)
      throw error
    }
  }
  return {
    id: 'mysql',
    label: 'MySQL',
    toolName: 'query_mysql',
    sqlHint: `MySQL or MariaDB SQL, one read-only SELECT${config.database ? `; unqualified tables resolve in ${config.database}` : '; name tables database.table'}; quote names with backticks.`,
    freeAlternative: 'export with `mysql --batch -e "SELECT …" > result.tsv` and pass the file to `load_file`',
    maxRows: config.maxRows,
    preview: true,
    listTables: () => withSession(prepared => listTables(prepared.session, config)),
    query: sql => withSession(async (prepared) => {
      const result = await runQuery(prepared, config, sql)
      if (result.truncated)
        await retire(prepared)
      return result
    }),
  }
}
