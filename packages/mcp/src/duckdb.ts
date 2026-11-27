import type { DuckDBConnection } from '@duckdb/node-api'
import type { RuntimePackage } from './runtime-package.js'
import { loadRuntimePackage, runtimePackageDir } from './runtime-package.js'

/**
 * Read-only SQL over local files and earlier pulls, through an embedded DuckDB.
 *
 * DuckDB's native binary is 19-27 MB per platform, against under 1 MB for TinyPivot, so it is
 * not a dependency: it downloads once, on first use, into a cache that survives TinyPivot
 * updates. Only people who run SQL pay for it.
 */

export const DUCKDB_PACKAGE = '@duckdb/node-api'
export const DUCKDB_VERSION = '2.0.1-r.1'
/** Most rows a query result may bring into TinyPivot. */
export const QUERY_ROW_LIMIT = 500_000

type DuckDbModule = typeof import('@duckdb/node-api')

const DUCKDB_RUNTIME: RuntimePackage = {
  name: DUCKDB_PACKAGE,
  version: DUCKDB_VERSION,
  cacheName: `duckdb-${DUCKDB_VERSION}`,
  purpose: 'SQL queries',
}

export function duckdbCacheDir(): string {
  return runtimePackageDir(DUCKDB_RUNTIME)
}

/** DuckDB's module: from TinyPivot's own install if present, else from the cache, installing it once. */
export function loadDuckDb(): Promise<DuckDbModule> {
  return loadRuntimePackage<DuckDbModule>(DUCKDB_RUNTIME)
}

/** Resolves to the value, or to 'pending' if it takes longer than `ms`. The work keeps going. */
export function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | 'pending'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<'pending'>((resolve) => {
    timer = setTimeout(resolve, ms, 'pending')
  })
  return Promise.race([work, budget]).finally(() => clearTimeout(timer))
}

export function quoteLiteral(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return `'${value.replace(/'/g, '\'\'')}'`
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** A named table the query can use: an earlier pull, read back from its file. */
export interface QueryView {
  name: string
  /** A DuckDB table expression, e.g. `'orders.csv'` or `read_json_auto('…jsonl.gz')`. */
  from: string
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  /** True when the result had more than QUERY_ROW_LIMIT rows and was cut there. */
  truncated: boolean
}

export class QueryRejected extends Error {}

/** Values TinyPivot can store: numbers, strings, booleans and null. */
export function toPlainValue(value: unknown): unknown {
  if (value === null || value === undefined)
    return null
  if (typeof value === 'bigint')
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString()
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  return JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner))
}

/** One DuckDB connection per server, locked down: no extension downloads, no setting changes. */
export class DuckDbRunner {
  private connection?: Promise<DuckDBConnection>
  private duck?: DuckDbModule

  constructor(private readonly load: () => Promise<DuckDbModule> = loadDuckDb) {}

  /** Starts loading DuckDB (downloading it if needed) without waiting. */
  prepare(): Promise<DuckDBConnection> {
    this.connection ??= (async () => {
      this.duck = await this.load()
      const instance = await this.duck.DuckDBInstance.create(':memory:', {
        autoinstall_known_extensions: 'false',
        autoload_known_extensions: 'false',
      })
      const connection = await instance.connect()
      await connection.run('SET lock_configuration = true')
      return connection
    })()
    this.connection.catch(() => {
      this.connection = undefined
    })
    return this.connection
  }

  async run(sql: string, views: QueryView[], maxRows = QUERY_ROW_LIMIT): Promise<QueryResult> {
    const connection = await this.prepare()
    const statementTypes = this.duck!.StatementType
    for (const view of views)
      await connection.run(`CREATE OR REPLACE TEMP VIEW ${quoteIdentifier(view.name)} AS SELECT * FROM ${view.from}`)

    const query = sql.trim().replace(/;+\s*$/, '')
    const extracted = await connection.extractStatements(query)
    if (extracted.count !== 1)
      throw new QueryRejected('Send exactly one SELECT statement.')
    const prepared = await extracted.prepare(0)
    if (prepared.statementType !== statementTypes.SELECT)
      throw new QueryRejected('Only SELECT queries can run here: TinyPivot reads data, it never changes it.')

    const reader = await connection.runAndReadAll(`SELECT * FROM (${query}) AS tinypivot_query LIMIT ${maxRows + 1}`)
    const rows = reader.getRowObjectsJS().map(row =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toPlainValue(value)])),
    )
    return { columns: reader.columnNames(), rows: rows.slice(0, maxRows), truncated: rows.length > maxRows }
  }
}
