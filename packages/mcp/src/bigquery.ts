import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseQueryResult } from './warehouse.js'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage } from './runtime-package.js'
import { backtickName, listFromEnv, QueryRefused, readOnlyStatementError } from './warehouse.js'

/**
 * Read-only BigQuery, through Google's official client. Every query is dry-run first: BigQuery
 * itself reports the statement type, the tables it reads and the bytes it would scan, so the
 * checks below hold for any GoogleSQL without a parser of our own. The scan cap is then also set
 * on the real job, so BigQuery refuses to bill past it.
 */

export const BIGQUERY_RUNTIME: RuntimePackage = {
  name: '@google-cloud/bigquery',
  version: '8.3.1',
  cacheName: 'bigquery-8.3.1',
  purpose: 'BigQuery queries',
}

const GB = 1_000_000_000
const DEFAULT_MAX_GB = 50
const DEFAULT_MAX_ROWS = 5000
const DEFAULT_TIMEOUT_MS = 60_000
/** Most tables listed for the model, so a large project does not flood its context. */
const MAX_LISTED_TABLES = 200

export interface BigQueryConfig {
  projectId: string
  /** Dataset location, e.g. `US` or `europe-west2`; BigQuery infers it when omitted. */
  location?: string
  /** `dataset`, `dataset.table` or `project.dataset.table` entries; empty means whatever the credentials can read. */
  allowed?: string[]
  /** Most bytes one query may scan (and be billed for). */
  maxBytes: number
  maxRows: number
  timeoutMs: number
}

/** BigQuery settings from TINYPIVOT_BIGQUERY_*, or undefined when no project is set. Credentials come from Google's usual sources. */
export function bigQueryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BigQueryConfig | undefined {
  const projectId = env.TINYPIVOT_BIGQUERY_PROJECT?.trim()
  if (!projectId)
    return undefined
  const maxGb = Number(env.TINYPIVOT_BIGQUERY_MAX_GB)
  return {
    projectId,
    location: env.TINYPIVOT_BIGQUERY_LOCATION?.trim() || undefined,
    allowed: listFromEnv(env.TINYPIVOT_BIGQUERY_ALLOWED),
    maxBytes: (Number.isFinite(maxGb) && maxGb > 0 ? maxGb : DEFAULT_MAX_GB) * GB,
    maxRows: DEFAULT_MAX_ROWS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
}

/* The slice of Google's client this connector uses, so tests can stand in for it. */

export interface TableReference { projectId: string, datasetId: string, tableId: string }

interface JobStatistics {
  totalBytesProcessed?: string
  query?: {
    statementType?: string
    totalBytesProcessed?: string
    referencedTables?: TableReference[]
  }
}

export interface BigQueryJobLike {
  metadata?: { statistics?: JobStatistics }
  getQueryResults: (options: { maxResults: number, autoPaginate: false, timeoutMs: number }) => Promise<[Record<string, unknown>[], ...unknown[]]>
}

export interface BigQueryClientLike {
  createQueryJob: (options: Record<string, unknown>) => Promise<[BigQueryJobLike, ...unknown[]]>
  getDatasets: () => Promise<[Array<{ id?: string }>, ...unknown[]]>
  dataset: (id: string) => { getTables: () => Promise<[Array<{ id?: string }>, ...unknown[]]> }
}

export type BigQueryClientFactory = (config: BigQueryConfig) => Promise<BigQueryClientLike>

const officialClient: BigQueryClientFactory = async (config) => {
  const mod = await loadRuntimePackage<{ BigQuery: new (options: Record<string, unknown>) => BigQueryClientLike }>(BIGQUERY_RUNTIME)
  return new mod.BigQuery({ projectId: config.projectId, ...(config.location ? { location: config.location } : {}) })
}

/** "1.2 GB", "340 MB", "12 KB". */
export function formatBytes(bytes: number): string {
  const units = [['GB', GB], ['MB', 1e6], ['KB', 1e3]] as const
  for (const [unit, size] of units) {
    if (bytes >= size)
      return `${(bytes / size).toFixed(bytes >= 10 * size ? 0 : 1)} ${unit}`
  }
  return `${bytes} B`
}

/** Whether a table the query reads is covered by the allowlist (entries may omit the project, or name a whole dataset). */
export function isAllowedTable(table: TableReference, allowed: string[] | undefined, defaultProject: string): boolean {
  if (!allowed || allowed.length === 0)
    return true
  const full = `${table.projectId}.${table.datasetId}.${table.tableId}`.toLowerCase()
  const inDefaultProject = table.projectId.toLowerCase() === defaultProject.toLowerCase()
  return allowed.some((entry) => {
    const parts = entry.toLowerCase().split('.')
    if (parts.length === 3)
      return parts.join('.') === full
    if (parts.length === 2)
      return inDefaultProject && parts[0] === table.datasetId.toLowerCase() && parts[1] === table.tableId.toLowerCase()
    return inDefaultProject && parts[0] === table.datasetId.toLowerCase()
  })
}

/** Turns BigQuery's typed values (dates, NUMERIC, timestamps) into numbers and strings TinyPivot can store. */
export function toBigQueryPlainValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || value instanceof Date || Array.isArray(value))
    return toPlainValue(value)
  // BigQueryDate, BigQueryTimestamp, Geography and friends wrap a string in `value`.
  const wrapped = (value as { value?: unknown }).value
  if (typeof wrapped === 'string')
    return wrapped
  // NUMERIC and BIGNUMERIC arrive as big.js numbers.
  if (value.constructor?.name === 'Big') {
    const n = Number(String(value))
    return Number.isFinite(n) ? n : String(value)
  }
  return toPlainValue(value)
}

/** Checks a dry run's verdict: one SELECT, allowed tables only, under the scan cap. Returns the bytes it would scan. */
export function checkDryRun(stats: JobStatistics | undefined, config: BigQueryConfig): number {
  const statementType = stats?.query?.statementType
  if (statementType !== 'SELECT')
    throw new QueryRefused(`Only a single read-only SELECT can run here; BigQuery read this as ${statementType ?? 'an unknown statement'}.`)
  const blocked = (stats?.query?.referencedTables ?? []).find(t => !isAllowedTable(t, config.allowed, config.projectId))
  if (blocked)
    throw new QueryRefused(`Table \`${blocked.projectId}.${blocked.datasetId}.${blocked.tableId}\` is not in TINYPIVOT_BIGQUERY_ALLOWED.`)
  const bytes = Number(stats?.query?.totalBytesProcessed ?? stats?.totalBytesProcessed ?? 0)
  if (bytes > config.maxBytes) {
    throw new QueryRefused(`This query would scan ${formatBytes(bytes)}, over the ${formatBytes(config.maxBytes)} limit (TINYPIVOT_BIGQUERY_MAX_GB). Select fewer columns or filter on the partition column.`)
  }
  return bytes
}

async function listTables(client: BigQueryClientLike, config: BigQueryConfig): Promise<string[]> {
  if (config.allowed?.some(entry => entry.split('.').length > 1))
    return config.allowed.filter(entry => entry.split('.').length > 1)
  const datasetIds = config.allowed ?? (await client.getDatasets())[0].flatMap(d => (d.id ? [d.id] : []))
  const tables: string[] = []
  for (const datasetId of datasetIds) {
    if (tables.length >= MAX_LISTED_TABLES)
      break
    const [found] = await client.dataset(datasetId).getTables()
    tables.push(...found.flatMap(t => (t.id ? [`${datasetId}.${t.id}`] : [])))
  }
  return tables.slice(0, MAX_LISTED_TABLES)
}

async function runQuery(client: BigQueryClientLike, config: BigQueryConfig, sql: string): Promise<WarehouseQueryResult> {
  const base = {
    query: sql.trim().replace(/;+\s*$/, ''),
    useLegacySql: false,
    ...(config.location ? { location: config.location } : {}),
  }
  // The same first gate as every warehouse, so a write is refused plainly even where a dry run cannot plan it.
  const textError = readOnlyStatementError(base.query)
  if (textError)
    throw new QueryRefused(textError)
  const [dryRun] = await client.createQueryJob({ ...base, dryRun: true })
  const bytes = checkDryRun(dryRun.metadata?.statistics, config)

  const [job] = await client.createQueryJob({
    ...base,
    maximumBytesBilled: String(config.maxBytes),
    jobTimeoutMs: config.timeoutMs,
    labels: { client: 'tinypivot' },
  })
  const [raw] = await job.getQueryResults({ maxResults: config.maxRows + 1, autoPaginate: false, timeoutMs: config.timeoutMs })
  const truncated = raw.length > config.maxRows
  const rows = (truncated ? raw.slice(0, config.maxRows) : raw).map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toBigQueryPlainValue(value)])),
  )
  return { rows, truncated, note: `BigQuery scanned ${formatBytes(bytes)} (limit ${formatBytes(config.maxBytes)}).` }
}

export function bigQueryConnector(config: BigQueryConfig, createClient: BigQueryClientFactory = officialClient): WarehouseConnector {
  let client: Promise<BigQueryClientLike> | undefined
  const getClient = () => {
    client ??= createClient(config)
    client.catch(() => {
      client = undefined
    })
    return client
  }
  return {
    id: 'bigquery',
    label: 'BigQuery',
    toolName: 'query_bigquery',
    sqlHint: `GoogleSQL, one read-only SELECT; name tables \`dataset.table\` (project ${config.projectId}) or \`project.dataset.table\`.`,
    freeAlternative: 'export with `bq query --format=csv` and pass the file to `load_file`',
    maxRows: config.maxRows,
    dialect: { quoteName: backtickName, median: expr => `APPROX_QUANTILES(${expr}, 2)[OFFSET(1)]` },
    listTables: async () => listTables(await getClient(), config),
    query: async sql => runQuery(await getClient(), config, sql),
  }
}
