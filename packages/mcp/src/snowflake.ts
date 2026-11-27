import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseQueryResult } from './warehouse.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { formatBytes } from './bigquery.js'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage, runtimePackageDir } from './runtime-package.js'
import { listFromEnv, QueryRefused, readOnlyStatementError } from './warehouse.js'

/**
 * Read-only Snowflake, through Snowflake's official Node driver. Each query passes three checks
 * before it runs: a text check (one SELECT, no write words), then EXPLAIN, which compiles it without
 * running it or using the warehouse: its plan must hold only read operations on allowed tables,
 * within the scan limit. It then runs as a single statement with a timeout and a query tag. A role
 * with read-only grants is still the strongest guard, and the docs recommend one.
 */

export const SNOWFLAKE_RUNTIME: RuntimePackage = {
  name: 'snowflake-sdk',
  version: '3.4.1',
  cacheName: 'snowflake-sdk-3.4.1',
  purpose: 'Snowflake queries',
}

const GB = 1_000_000_000
const DEFAULT_MAX_GB = 50
const DEFAULT_MAX_ROWS = 5000
const STATEMENT_TIMEOUT_S = 60
const CONNECT_TIMEOUT_MS = 15_000
const MAX_LISTED_TABLES = 200
const QUERY_TAG = 'tinypivot'

export type SnowflakeAuth
  = | { kind: 'keypair', pem?: string, path?: string, passphrase?: string }
    | { kind: 'token', token: string }
    | { kind: 'password', password: string }
    | { kind: 'browser' }

export interface SnowflakeConfig {
  account: string
  username: string
  auth: SnowflakeAuth
  role?: string
  warehouse?: string
  database?: string
  schema?: string
  /** `db`, `db.schema` or `db.schema.table` entries; empty means whatever the role can read. */
  allowed?: string[]
  maxBytes: number
  maxRows: number
}

/** A PEM key from an env var (with literal \n sequences) or a file, decrypted to PKCS8 when it has a passphrase. */
export function readPrivateKey(options: { pem?: string, path?: string, passphrase?: string }): string {
  const raw = options.pem ? options.pem.replace(/\\n/g, '\n') : fs.readFileSync(options.path!, 'utf8')
  const key = crypto.createPrivateKey({ key: raw, format: 'pem', ...(options.passphrase ? { passphrase: options.passphrase } : {}) })
  return key.export({ format: 'pem', type: 'pkcs8' }).toString()
}

/** Snowflake settings from TINYPIVOT_SNOWFLAKE_*, or undefined when no account is set. */
export function snowflakeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SnowflakeConfig | undefined {
  const account = env.TINYPIVOT_SNOWFLAKE_ACCOUNT?.trim()
  const username = env.TINYPIVOT_SNOWFLAKE_USER?.trim()
  if (!account || !username)
    return undefined
  const maxGb = Number(env.TINYPIVOT_SNOWFLAKE_MAX_GB)
  return {
    account,
    username,
    auth: snowflakeAuthFromEnv(env),
    role: env.TINYPIVOT_SNOWFLAKE_ROLE?.trim() || undefined,
    warehouse: env.TINYPIVOT_SNOWFLAKE_WAREHOUSE?.trim() || undefined,
    database: env.TINYPIVOT_SNOWFLAKE_DATABASE?.trim() || undefined,
    schema: env.TINYPIVOT_SNOWFLAKE_SCHEMA?.trim() || undefined,
    allowed: listFromEnv(env.TINYPIVOT_SNOWFLAKE_ALLOWED),
    maxBytes: (Number.isFinite(maxGb) && maxGb > 0 ? maxGb : DEFAULT_MAX_GB) * GB,
    maxRows: DEFAULT_MAX_ROWS,
  }
}

/** Key pair first, then a programmatic access token, then a password; browser sign-in when none is set. */
function snowflakeAuthFromEnv(env: NodeJS.ProcessEnv): SnowflakeAuth {
  if (env.TINYPIVOT_SNOWFLAKE_PRIVATE_KEY || env.TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PATH) {
    // Read on first connect, so a bad key fails that query rather than the whole server.
    return {
      kind: 'keypair',
      pem: env.TINYPIVOT_SNOWFLAKE_PRIVATE_KEY,
      path: env.TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PATH,
      passphrase: env.TINYPIVOT_SNOWFLAKE_PRIVATE_KEY_PASSPHRASE,
    }
  }
  if (env.TINYPIVOT_SNOWFLAKE_TOKEN)
    return { kind: 'token', token: env.TINYPIVOT_SNOWFLAKE_TOKEN }
  if (env.TINYPIVOT_SNOWFLAKE_PASSWORD)
    return { kind: 'password', password: env.TINYPIVOT_SNOWFLAKE_PASSWORD }
  return { kind: 'browser' }
}

/** One open Snowflake session: runs a statement and returns up to `maxRows` rows plus the full count. */
export interface SnowflakeSessionLike {
  run: (sql: string, maxRows: number) => Promise<{ rows: Record<string, unknown>[], totalRows: number }>
  close: () => Promise<void>
}

export type SnowflakeSessionFactory = (config: SnowflakeConfig) => Promise<SnowflakeSessionLike>

interface PlanStats {
  operations: string[]
  tables: string[]
  bytes: number
}

/** Reads EXPLAIN USING JSON: every operation name, the tables scanned and the bytes they may read. */
export function parseExplain(content: string): PlanStats {
  const plan = JSON.parse(content) as { GlobalStats?: { bytesAssigned?: number }, Operations?: unknown }
  const ops = [plan.Operations].flat(3).filter((op): op is { operation?: string, objects?: string[] } => typeof op === 'object' && op !== null)
  return {
    operations: ops.flatMap(op => (op.operation ? [op.operation] : [])),
    tables: ops.flatMap(op => op.objects ?? []),
    bytes: Number(plan.GlobalStats?.bytesAssigned ?? 0),
  }
}

const unquote = (name: string) => name.replace(/"/g, '').toLowerCase()

/** Whether a scanned object (`DB.SCHEMA.TABLE`) is covered by the allowlist. */
export function isAllowedObject(object: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0)
    return true
  const parts = unquote(object).split('.')
  return allowed.some((entry) => {
    const want = unquote(entry).split('.')
    return want.every((part, i) => parts[i] === part)
  })
}

const WRITE_OPERATION = /insert|update|delete|merge|create|drop|alter|copy|unload|truncate/i

/** Checks EXPLAIN's verdict: read operations only, on allowed tables, under the scan cap. */
export function checkPlan(stats: PlanStats, config: Pick<SnowflakeConfig, 'allowed' | 'maxBytes'>): void {
  const write = stats.operations.find(op => WRITE_OPERATION.test(op))
  if (write)
    throw new QueryRefused(`Snowflake's plan includes a ${write} step; only reads can run here.`)
  const blocked = stats.tables.find(t => !isAllowedObject(t, config.allowed))
  if (blocked)
    throw new QueryRefused(`Table \`${blocked}\` is not in TINYPIVOT_SNOWFLAKE_ALLOWED.`)
  if (stats.bytes > config.maxBytes)
    throw new QueryRefused(`This query may scan ${formatBytes(stats.bytes)}, over the ${formatBytes(config.maxBytes)} limit (TINYPIVOT_SNOWFLAKE_MAX_GB). Filter on a clustered or date column, or select fewer columns.`)
}

/* The official driver, wrapped as a SnowflakeSessionLike. */

interface SdkStatement { getNumRows: () => number, streamRows: (o: { start: number, end: number }) => NodeJS.ReadableStream }
interface SdkConnection {
  connect: (cb: (err: Error | undefined) => void) => void
  connectAsync: (cb: (err: Error | undefined) => void) => Promise<void>
  execute: (o: { sqlText: string, streamResult?: boolean, parameters?: Record<string, unknown>, complete: (err: Error | undefined, stmt: SdkStatement) => void }) => void
  destroy: (cb: (err: Error | undefined) => void) => void
}
interface SdkModule {
  configure: (o: Record<string, unknown>) => void
  createConnection: (o: Record<string, unknown>) => SdkConnection
}

function authOptions(auth: SnowflakeAuth): Record<string, unknown> {
  switch (auth.kind) {
    case 'keypair': return { authenticator: 'SNOWFLAKE_JWT', privateKey: readPrivateKey(auth) }
    case 'token': return { authenticator: 'PROGRAMMATIC_ACCESS_TOKEN', token: auth.token }
    case 'password': return { authenticator: 'SNOWFLAKE', password: auth.password }
    case 'browser': return { authenticator: 'EXTERNALBROWSER' }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

function execute(connection: SdkConnection, sqlText: string): Promise<SdkStatement> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      streamResult: true,
      parameters: { MULTI_STATEMENT_COUNT: 1 },
      complete: (err, stmt) => (err ? reject(err) : resolve(stmt)),
    })
  })
}

function readRows(stmt: SdkStatement, count: number): Promise<Record<string, unknown>[]> {
  if (count === 0)
    return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = []
    stmt.streamRows({ start: 0, end: count - 1 })
      .on('data', (row: Record<string, unknown>) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows))
  })
}

const officialSession: SnowflakeSessionFactory = async (config) => {
  const sdk = await loadRuntimePackage<SdkModule>(SNOWFLAKE_RUNTIME)
  // The MCP server talks over stdout, so the driver must never log to the console.
  const logDir = runtimePackageDir(SNOWFLAKE_RUNTIME)
  fs.mkdirSync(logDir, { recursive: true })
  sdk.configure({ logLevel: 'ERROR', logFilePath: path.join(logDir, 'snowflake.log'), additionalLogToConsole: false })

  const connection = sdk.createConnection({
    account: config.account,
    username: config.username,
    ...authOptions(config.auth),
    ...(config.role ? { role: config.role } : {}),
    ...(config.warehouse ? { warehouse: config.warehouse } : {}),
    ...(config.database ? { database: config.database } : {}),
    ...(config.schema ? { schema: config.schema } : {}),
    application: 'TinyPivot',
    queryTag: QUERY_TAG,
    clientSessionKeepAlive: true,
  })
  // Browser sign-in needs connectAsync; the other methods use connect.
  const connected = config.auth.kind === 'browser'
    ? connection.connectAsync(() => {})
    : new Promise<void>((resolve, reject) => connection.connect(err => (err ? reject(err) : resolve())))
  const timeoutMs = config.auth.kind === 'browser' ? 120_000 : CONNECT_TIMEOUT_MS
  try {
    await withTimeout(connected, timeoutMs, `Could not connect to Snowflake within ${timeoutMs / 1000}s.`)
    await execute(connection, `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${STATEMENT_TIMEOUT_S}`)
  }
  catch (error) {
    connection.destroy(() => {})
    throw error
  }

  return {
    run: async (sql, maxRows) => {
      const stmt = await execute(connection, sql)
      const totalRows = stmt.getNumRows()
      return { rows: await readRows(stmt, Math.min(totalRows, maxRows)), totalRows }
    },
    close: () => new Promise(resolve => connection.destroy(() => resolve())),
  }
}

async function listTables(session: SnowflakeSessionLike, config: SnowflakeConfig): Promise<string[]> {
  const fullNames = config.allowed?.filter(entry => entry.split('.').length === 3)
  if (fullNames?.length)
    return fullNames
  if (!config.database)
    return []
  const db = `"${config.database.replace(/"/g, '""')}"`
  const schemaFilter = config.schema ? ` AND table_schema = '${config.schema.replace(/'/g, '\'\'').toUpperCase()}'` : ''
  const { rows } = await session.run(
    `SELECT table_catalog || '.' || table_schema || '.' || table_name AS name FROM ${db}.information_schema.tables WHERE table_schema <> 'INFORMATION_SCHEMA'${schemaFilter} ORDER BY 1 LIMIT ${MAX_LISTED_TABLES}`,
    MAX_LISTED_TABLES,
  )
  return rows.map(row => String(row.NAME ?? row.name)).filter(name => isAllowedObject(name, config.allowed))
}

async function runQuery(session: SnowflakeSessionLike, config: SnowflakeConfig, sql: string): Promise<WarehouseQueryResult> {
  const cleaned = sql.trim().replace(/;+\s*$/, '')
  const textError = readOnlyStatementError(cleaned)
  if (textError)
    throw new QueryRefused(textError)
  const explained = await session.run(`EXPLAIN USING JSON ${cleaned}`, 1)
  const content = explained.rows[0]?.content ?? explained.rows[0]?.CONTENT
  if (typeof content !== 'string')
    throw new QueryRefused('Snowflake did not return a plan for this query, so it was not run.')
  const stats = parseExplain(content)
  checkPlan(stats, config)

  const { rows, totalRows } = await session.run(cleaned, config.maxRows)
  return {
    rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toPlainValue(value)]))),
    truncated: totalRows > config.maxRows,
    note: `Snowflake planned to scan up to ${formatBytes(stats.bytes)} (limit ${formatBytes(config.maxBytes)}).`,
  }
}

export function snowflakeConnector(config: SnowflakeConfig, createSession: SnowflakeSessionFactory = officialSession): WarehouseConnector {
  let session: Promise<SnowflakeSessionLike> | undefined
  const getSession = () => {
    session ??= createSession(config)
    session.catch(() => {
      session = undefined
    })
    return session
  }
  /** A session that hit an error is closed and replaced on the next call, never reused. */
  const withSession = async <T>(work: (s: SnowflakeSessionLike) => Promise<T>): Promise<T> => {
    const current = await getSession()
    try {
      return await work(current)
    }
    catch (error) {
      // A refused query leaves the session healthy; anything else may have broken it.
      if (!(error instanceof QueryRefused)) {
        session = undefined
        await current.close().catch(() => {})
      }
      throw error
    }
  }
  const where = [config.database, config.schema].filter(Boolean).join('.')
  return {
    id: 'snowflake',
    label: 'Snowflake',
    toolName: 'query_snowflake',
    sqlHint: `Snowflake SQL, one read-only SELECT${where ? `; unqualified tables resolve in ${where}` : '; name tables database.schema.table'}.`,
    freeAlternative: 'export with `snowsql -o output_format=csv` and pass the file to `load_file`',
    maxRows: config.maxRows,
    preview: true,
    listTables: () => withSession(s => listTables(s, config)),
    query: sql => withSession(s => runQuery(s, config, sql)),
  }
}
