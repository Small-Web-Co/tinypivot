import type { IniFile } from './config-files.js'
import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseQueryResult } from './warehouse.js'
import { Buffer } from 'node:buffer'
import os from 'node:os'
import { databricksConfigFile, readIniFile } from './config-files.js'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage } from './runtime-package.js'
import { QueryRefused, readOnlyStatementError } from './warehouse.js'

/**
 * Read-only Databricks SQL, through Databricks' official Node driver. Each query passes two checks
 * before it runs: a text check (one SELECT, no write words), then EXPLAIN EXTENDED, which plans it
 * without running it: its plan must hold no write or DDL step. It then runs with a statement
 * timeout and a row cap. Unity Catalog grants that only allow SELECT are still the strongest guard,
 * and the docs recommend them.
 */

/**
 * 2.4.0 is the newest release whose engines allow any Node 20+ (`>=20.0.0`). 3.x requires
 * `>=22.23.4 <23 || >=24.22.1 <25 || >=26.12.1`, which refuses many supported Node versions.
 */
export const DATABRICKS_RUNTIME: RuntimePackage = {
  name: '@databricks/sql',
  version: '2.4.0',
  cacheName: 'databricks-sql-2.4.0',
  purpose: 'Databricks queries',
}

const DEFAULT_MAX_ROWS = 5000
const STATEMENT_TIMEOUT_S = 60
/** Extra time past the server timeout before TinyPivot cancels the operation itself. */
const CLIENT_GRACE_S = 15
/** Covers a stopped warehouse starting up, or a browser sign-in. */
const CONNECT_TIMEOUT_MS = 180_000
const REST_TIMEOUT_MS = 15_000
const MAX_LISTED_TABLES = 200
const USER_AGENT = 'TinyPivot'

export type DatabricksAuth
  = | { kind: 'token', token: string }
    | { kind: 'm2m', clientId: string, clientSecret: string }
    | { kind: 'browser' }

/** Settings as given; the profile and any secret in it are read on first connect. */
export interface DatabricksConfig {
  host?: string
  token?: string
  clientId?: string
  clientSecret?: string
  /** A profile in ~/.databrickscfg (or DATABRICKS_CONFIG_FILE). */
  profile?: string
  configFile: string
  /** A SQL warehouse id or an HTTP path such as `/sql/1.0/warehouses/<id>`. */
  warehouse?: string
  catalog?: string
  schema?: string
  maxRows: number
  timeoutS: number
}

/** What a connection needs once the profile has been read. */
export interface DatabricksConnection {
  host: string
  auth: DatabricksAuth
  /** HTTP path of the SQL warehouse, when known before connecting. */
  httpPath?: string
}

const trimmed = (value: string | undefined) => value?.trim() || undefined

/** Databricks settings from TINYPIVOT_DATABRICKS_*, or undefined when neither a host nor a profile is set. */
export function databricksConfigFromEnv(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): DatabricksConfig | undefined {
  const host = trimmed(env.TINYPIVOT_DATABRICKS_HOST)
  const profile = trimmed(env.TINYPIVOT_DATABRICKS_PROFILE)
  if (!host && !profile)
    return undefined
  return {
    host,
    token: trimmed(env.TINYPIVOT_DATABRICKS_TOKEN),
    clientId: trimmed(env.TINYPIVOT_DATABRICKS_CLIENT_ID),
    clientSecret: trimmed(env.TINYPIVOT_DATABRICKS_CLIENT_SECRET),
    profile,
    configFile: databricksConfigFile(env, home),
    warehouse: trimmed(env.TINYPIVOT_DATABRICKS_WAREHOUSE),
    catalog: trimmed(env.TINYPIVOT_DATABRICKS_CATALOG),
    schema: trimmed(env.TINYPIVOT_DATABRICKS_SCHEMA),
    maxRows: DEFAULT_MAX_ROWS,
    timeoutS: STATEMENT_TIMEOUT_S,
  }
}

/** `https://dbc-1.cloud.databricks.com/` → `dbc-1.cloud.databricks.com`. */
export function normalizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
}

/** A warehouse id or HTTP path as the driver's `path`. */
export function warehousePath(warehouse: string): string {
  const value = warehouse.trim()
  if (value.startsWith('/'))
    return value
  if (!/^[\w-]+$/.test(value))
    throw new Error(`TINYPIVOT_DATABRICKS_WAREHOUSE should be a SQL warehouse id or an HTTP path like /sql/1.0/warehouses/<id>, not \`${value}\`.`)
  return `/sql/1.0/warehouses/${value}`
}

/** The named profile, or with none named, the first profile for `host`. */
function findProfile(config: DatabricksConfig, file: IniFile | undefined): Record<string, string> | undefined {
  if (config.profile) {
    const named = file?.[config.profile]
    if (!named)
      throw new Error(`Profile \`${config.profile}\` was not found in ${config.configFile}. Run \`databricks auth login --profile ${config.profile}\` or check TINYPIVOT_DATABRICKS_PROFILE.`)
    return named
  }
  const want = config.host ? normalizeHost(config.host) : undefined
  return Object.values(file ?? {}).find(section => section.host && normalizeHost(section.host) === want)
}

/** Profile auth types the driver can use; others (Azure CLI, Entra service principals, GCP) need a token instead. */
const BROWSER_AUTH_TYPES = new Set(['databricks-cli', 'external-browser', 'oauth-u2m'])

function chooseAuth(values: { token?: string, clientId?: string, clientSecret?: string, authType?: string }): DatabricksAuth {
  const { token, clientId, clientSecret, authType } = values
  if (authType && authType !== 'pat' && authType !== 'oauth-m2m' && !BROWSER_AUTH_TYPES.has(authType))
    throw new Error(`Databricks profile auth_type \`${authType}\` is not supported by TinyPivot. Use a personal access token, an OAuth service principal (client_id/client_secret) or \`databricks auth login\`.`)
  if (token && authType !== 'oauth-m2m' && !BROWSER_AUTH_TYPES.has(authType ?? ''))
    return { kind: 'token', token }
  if (clientId && clientSecret && !BROWSER_AUTH_TYPES.has(authType ?? ''))
    return { kind: 'm2m', clientId, clientSecret }
  if (authType === 'pat' || authType === 'oauth-m2m')
    throw new Error(`The Databricks profile says auth_type = ${authType} but has no ${authType === 'pat' ? 'token' : 'client_id and client_secret'}.`)
  return { kind: 'browser' }
}

/**
 * Reads the profile (if any) and merges TINYPIVOT_DATABRICKS_* over it. Sign-in order: personal
 * access token, OAuth service principal (client id + secret), else browser sign-in (OAuth U2M).
 */
export function resolveDatabricksConnection(config: DatabricksConfig): DatabricksConnection {
  const needsFile = config.profile || (!config.token && !(config.clientId && config.clientSecret))
  const profile = needsFile ? findProfile(config, readIniFile(config.configFile)) : undefined
  const host = config.host ?? profile?.host
  if (!host)
    throw new Error(`Databricks profile \`${config.profile}\` has no host. Set host in ${config.configFile} or TINYPIVOT_DATABRICKS_HOST.`)
  const auth = chooseAuth({
    token: config.token ?? profile?.token,
    clientId: config.clientId ?? profile?.client_id,
    clientSecret: config.clientSecret ?? profile?.client_secret,
    // A token or secret given in the environment overrides the profile's sign-in method.
    authType: config.token || (config.clientId && config.clientSecret) ? undefined : profile?.auth_type,
  })
  const warehouse = config.warehouse ?? profile?.warehouse_id
  return { host: normalizeHost(host), auth, httpPath: warehouse ? warehousePath(warehouse) : undefined }
}

/* SQL warehouse lookup through the REST API, for token and service principal sign-ins. */

export type FetchLike = (url: string, init: { method?: string, headers: Record<string, string>, body?: string, signal?: AbortSignal }) => Promise<{ ok: boolean, status: number, json: () => Promise<unknown>, text: () => Promise<string> }>

async function fetchJson(fetchImpl: FetchLike, url: string, init: Parameters<FetchLike>[1]): Promise<unknown> {
  const { host, pathname } = new URL(url)
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REST_TIMEOUT_MS) }).catch((error: Error) => {
    const cause = (error.cause as Error | undefined)?.message ?? error.message
    throw new Error(`Could not reach Databricks at ${host}: ${cause}`)
  })
  if (!response.ok)
    throw new Error(`Databricks returned HTTP ${response.status} for ${pathname}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

/** A bearer token for the REST API: the PAT itself, or one minted for the service principal. */
async function restToken(connection: DatabricksConnection, fetchImpl: FetchLike): Promise<string> {
  const { auth } = connection
  if (auth.kind === 'token')
    return auth.token
  if (auth.kind === 'browser')
    throw new Error('Set TINYPIVOT_DATABRICKS_WAREHOUSE to a SQL warehouse id: with browser sign-in TinyPivot cannot look one up for you.')
  const basic = Buffer.from(`${auth.clientId}:${auth.clientSecret}`).toString('base64')
  const body = await fetchJson(fetchImpl, `https://${connection.host}/oidc/v1/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
    body: 'grant_type=client_credentials&scope=all-apis',
  }) as { access_token?: string }
  if (!body.access_token)
    throw new Error('Databricks did not return an access token for the service principal.')
  return body.access_token
}

interface WarehouseInfo { id?: string, name?: string, state?: string, odbc_params?: { path?: string } }

/** The HTTP path of a running SQL warehouse, else of the first one listed. */
export async function findWarehousePath(connection: DatabricksConnection, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<string> {
  const token = await restToken(connection, fetchImpl)
  const body = await fetchJson(fetchImpl, `https://${connection.host}/api/2.0/sql/warehouses`, {
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT },
  }) as { warehouses?: WarehouseInfo[] }
  const warehouses = (body.warehouses ?? []).filter(w => w.id)
  const chosen = warehouses.find(w => w.state === 'RUNNING') ?? warehouses[0]
  if (!chosen)
    throw new Error('No SQL warehouse is visible to these credentials. Set TINYPIVOT_DATABRICKS_WAREHOUSE, or ask for CAN USE on a warehouse.')
  return chosen.odbc_params?.path || warehousePath(chosen.id!)
}

/* The plan check. */

/**
 * Spark and Databricks plan nodes that write data or change objects (logical and physical names,
 * matched as prefixes): AppendData, OverwriteByExpression, MergeIntoTable, CreateTableAsSelect,
 * InsertIntoHadoopFsRelationCommand, WriteFiles and the like. A plain SELECT plans none of them.
 */
const WRITE_NODES = [
  'InsertInto',
  'AppendData',
  'OverwriteByExpression',
  'OverwritePartitionsDynamic',
  'ReplaceData',
  'ReplaceTable',
  'Write',
  'V2TableWrite',
  'DataWritingCommand',
  'SaveIntoDataSource',
  'DeleteFrom',
  'DeleteCommand',
  'UpdateTable',
  'UpdateCommand',
  'MergeInto',
  'CreateTable',
  'CreateDataSourceTable',
  'CreateView',
  'CreateFunction',
  'CreateNamespace',
  'AtomicCreate',
  'AtomicReplace',
  'DropTable',
  'DropView',
  'DropFunction',
  'DropNamespace',
  'AlterTable',
  'AlterView',
  'RenameTable',
  'TruncateTable',
  'CacheTable',
  'UncacheTable',
  'RefreshTable',
  'CopyInto',
  'OptimizeTable',
  'VacuumTable',
  'RestoreTable',
  'CloneTable',
  'Grant',
  'Revoke',
]

/** A node at the start of a plan line, after the tree drawing (`+- `, `:  `, `*(2) `, `'` for unresolved). */
const WRITE_NODE = new RegExp(String.raw`^[\s:|+\-*()\d'!]*(Execute\s+\w+|(?:${WRITE_NODES.join('|')})\w*)`, 'm')

/** Refuses a plan that writes, or that Databricks could not make. */
export function checkPlan(plan: string): void {
  const failed = plan.match(/Error occurred during query planning:?\s*([\s\S]*)/)
  if (failed)
    throw new QueryRefused(`Databricks could not plan this query: ${failed[1].trim().slice(0, 500)}`)
  const write = plan.match(WRITE_NODE)
  if (write)
    throw new QueryRefused(`Databricks's plan includes a ${write[1].replace(/\s+/g, ' ')} step; only reads can run here.`)
}

/* Values. */

/** Turns the driver's values (Date, bigint, binary, structs, arrays, maps) into numbers, strings, booleans and null. */
export function toDatabricksPlainValue(value: unknown): unknown {
  if (value instanceof Uint8Array)
    return Buffer.from(value).toString('base64')
  return toPlainValue(value)
}

/* The official driver, wrapped as a DatabricksSessionLike. */

/** One open Databricks session: runs a statement and returns at most `limit` rows. */
export interface DatabricksSessionLike {
  /** HTTP path of the warehouse it runs on. */
  warehouse: string
  run: (sql: string, limit: number) => Promise<Record<string, unknown>[]>
  close: () => Promise<void>
}

export type DatabricksSessionFactory = (config: DatabricksConfig) => Promise<DatabricksSessionLike>

interface SdkOperation {
  fetchChunk: (o: { maxRows: number }) => Promise<object[]>
  hasMoreRows: () => Promise<boolean>
  cancel: () => Promise<unknown>
  close: () => Promise<unknown>
}
interface SdkSession {
  executeStatement: (sql: string, o: { queryTimeout?: number, maxRows?: number }) => Promise<SdkOperation>
  close: () => Promise<unknown>
}
interface SdkClient {
  connect: (o: Record<string, unknown>) => Promise<unknown>
  openSession: (o: { initialCatalog?: string, initialSchema?: string, configuration?: Record<string, string> }) => Promise<SdkSession>
  close: () => Promise<unknown>
}
interface SdkLogger { log: (level: string, message: string) => void }
interface SdkModule { DBSQLClient: new (o: { logger: SdkLogger }) => SdkClient }

/** The MCP server talks over stdout, and the driver's default logger writes there: errors go to stderr instead. */
const stderrLogger: SdkLogger = {
  log: (level, message) => {
    if (level === 'error')
      console.error(`[tinypivot-mcp] Databricks: ${message}`)
  },
}

function authOptions(auth: DatabricksAuth): Record<string, unknown> {
  switch (auth.kind) {
    case 'token': return { authType: 'access-token', token: auth.token }
    // Databricks' own OAuth on every cloud, as `databricks auth login` uses (Azure would otherwise use Entra ID).
    case 'm2m': return { authType: 'databricks-oauth', oauthClientId: auth.clientId, oauthClientSecret: auth.clientSecret, useDatabricksOAuthInAzure: true }
    case 'browser': return { authType: 'databricks-oauth', useDatabricksOAuthInAzure: true }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

async function readRows(operation: SdkOperation, limit: number): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let more = true
  while (more && rows.length < limit) {
    const chunk = await operation.fetchChunk({ maxRows: limit - rows.length })
    rows.push(...chunk as Record<string, unknown>[])
    more = await operation.hasMoreRows()
  }
  return rows.slice(0, limit)
}

/** Runs one statement, fetching at most `limit` rows, and always closes the operation. */
async function runStatement(session: SdkSession, sql: string, limit: number, timeoutS: number): Promise<Record<string, unknown>[]> {
  const operation = await session.executeStatement(sql, { queryTimeout: timeoutS, maxRows: Math.min(limit, 10_000) })
  try {
    return await withTimeout(readRows(operation, limit), (timeoutS + CLIENT_GRACE_S) * 1000, `Databricks did not finish within ${timeoutS}s.`)
  }
  catch (error) {
    await operation.cancel().catch(() => {})
    throw error
  }
  finally {
    await operation.close().catch(() => {})
  }
}

async function openSdkSession(client: SdkClient, connection: DatabricksConnection & { httpPath: string }, config: DatabricksConfig): Promise<SdkSession> {
  await client.connect({
    host: connection.host,
    path: connection.httpPath,
    ...authOptions(connection.auth),
    userAgentEntry: USER_AGENT,
    telemetryEnabled: false,
    retryMaxAttempts: 3,
    retriesTimeout: CONNECT_TIMEOUT_MS,
  })
  const session = await client.openSession({
    ...(config.catalog ? { initialCatalog: config.catalog } : {}),
    ...(config.schema ? { initialSchema: config.schema } : {}),
    configuration: { query_tags: 'client:tinypivot' },
  })
  // SQL warehouses ignore the driver's queryTimeout; STATEMENT_TIMEOUT is their setting.
  await runStatement(session, `SET STATEMENT_TIMEOUT = ${config.timeoutS}`, 1, config.timeoutS)
  return session
}

const officialSession: DatabricksSessionFactory = async (config) => {
  const resolved = resolveDatabricksConnection(config)
  const httpPath = resolved.httpPath ?? await findWarehousePath(resolved)
  const connection = { ...resolved, httpPath }
  const sdk = await loadRuntimePackage<SdkModule>(DATABRICKS_RUNTIME)
  const client = new sdk.DBSQLClient({ logger: stderrLogger })
  let session: SdkSession
  try {
    session = await withTimeout(openSdkSession(client, connection, config), CONNECT_TIMEOUT_MS, `Could not connect to Databricks within ${CONNECT_TIMEOUT_MS / 1000}s.`)
  }
  catch (error) {
    await client.close().catch(() => {})
    throw error
  }
  return {
    warehouse: httpPath,
    run: (sql, limit) => runStatement(session, sql, limit, config.timeoutS),
    close: async () => {
      await session.close().catch(() => {})
      await client.close().catch(() => {})
    },
  }
}

/* The connector. */

const quoteName = (name: string) => `\`${name.replace(/`/g, '``')}\``
const quoteString = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`

async function listTables(session: DatabricksSessionLike, config: DatabricksConfig): Promise<string[]> {
  const source = config.catalog ? `${quoteName(config.catalog)}.information_schema.tables` : 'information_schema.tables'
  const schemaFilter = config.schema ? ` AND table_schema = ${quoteString(config.schema.toLowerCase())}` : ''
  const rows = await session.run(
    `SELECT concat_ws('.', table_catalog, table_schema, table_name) AS name FROM ${source} WHERE table_schema <> 'information_schema'${schemaFilter} ORDER BY 1 LIMIT ${MAX_LISTED_TABLES}`,
    MAX_LISTED_TABLES,
  )
  return rows.map(row => String(row.name))
}

async function runQuery(session: DatabricksSessionLike, config: DatabricksConfig, sql: string): Promise<WarehouseQueryResult> {
  const cleaned = sql.trim().replace(/;+\s*$/, '')
  const textError = readOnlyStatementError(cleaned)
  if (textError)
    throw new QueryRefused(textError)
  const explained = await session.run(`EXPLAIN EXTENDED ${cleaned}`, 1)
  const plan = explained[0]?.plan
  if (typeof plan !== 'string')
    throw new QueryRefused('Databricks did not return a plan for this query, so it was not run.')
  checkPlan(plan)

  const raw = await session.run(cleaned, config.maxRows + 1)
  const truncated = raw.length > config.maxRows
  const rows = (truncated ? raw.slice(0, config.maxRows) : raw).map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toDatabricksPlainValue(value)])),
  )
  const warehouseId = session.warehouse.split('/').pop()
  return { rows, truncated, note: `Databricks planned it as a read and ran it on SQL warehouse ${warehouseId} (${config.timeoutS}s timeout).` }
}

export function databricksConnector(config: DatabricksConfig, createSession: DatabricksSessionFactory = officialSession): WarehouseConnector {
  let session: Promise<DatabricksSessionLike> | undefined
  const getSession = () => {
    session ??= createSession(config)
    session.catch(() => {
      session = undefined
    })
    return session
  }
  /** A session that hit an error is closed and replaced on the next call, never reused. */
  const withSession = async <T>(work: (s: DatabricksSessionLike) => Promise<T>): Promise<T> => {
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
  const where = [config.catalog, config.schema].filter(Boolean).join('.')
  return {
    id: 'databricks',
    label: 'Databricks',
    toolName: 'query_databricks',
    sqlHint: `Databricks SQL, one read-only SELECT${where ? `; unqualified tables resolve in ${where}` : '; name tables catalog.schema.table'}.`,
    freeAlternative: 'download the result as CSV from the Databricks SQL editor and pass the file to `load_file`',
    maxRows: config.maxRows,
    listTables: () => withSession(s => listTables(s, config)),
    query: sql => withSession(s => runQuery(s, config, sql)),
  }
}
