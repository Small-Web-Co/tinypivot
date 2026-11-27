import type { RuntimePackage } from './runtime-package.js'
import type { WarehouseConnector, WarehouseTableSchema } from './warehouse.js'
import { validateSQL } from '@smallwebco/tinypivot-server'
import { toPlainValue } from './duckdb.js'
import { loadRuntimePackage } from './runtime-package.js'
import { listFromEnv, plainName } from './warehouse.js'

export interface PostgresConfig {
  connectionString: string
  allowedTables?: string[]
  maxRows?: number
}

const DEFAULT_MAX_ROWS = 5000

export interface PostgresQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}

/** The pg driver installs once, on the first Postgres query, like TinyPivot's other database drivers. */
export const PG_RUNTIME: RuntimePackage = {
  name: 'pg',
  version: '8.23.1',
  cacheName: 'pg-8.23.1',
  purpose: 'PostgreSQL queries',
}

/** Postgres type ids whose text TinyPivot reads itself, instead of pg's default parsing. */
const PG_TYPES = { int8: 20, numeric: 1700, date: 1082, timestamp: 1114 } as const

/** A number when the text is one JavaScript holds exactly enough to chart; else the text unchanged. */
export function pgNumber(text: string): number | string {
  const n = Number(text)
  return Number.isFinite(n) && (Number.isSafeInteger(n) || !/^-?\d+$/.test(text)) ? n : text
}

/**
 * pg returns bigint (COUNT, SUM of integers) and numeric (SUM, AVG) as strings, and dates as local-time
 * Date objects. TinyPivot needs numbers to total and chart, and the calendar date as written.
 */
export function pgTypeParser(defaultParser: (oid: number, format?: string) => (text: string) => unknown) {
  return (oid: number, format?: string) => {
    if (oid === PG_TYPES.int8 || oid === PG_TYPES.numeric)
      return pgNumber
    if (oid === PG_TYPES.date || oid === PG_TYPES.timestamp)
      return (text: string) => text
    return defaultParser(oid, format)
  }
}

async function createPool(connectionString: string) {
  const pgModule = await loadRuntimePackage<typeof import('pg')>(PG_RUNTIME)
  const pg = pgModule.Pool ? pgModule : (pgModule as unknown as { default: typeof import('pg') }).default
  const getTypeParser = pgTypeParser(pg.types.getTypeParser as (oid: number, format?: string) => (text: string) => unknown)
  return new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 15_000, types: { getTypeParser } as never })
}

export async function listPostgresTables(config: PostgresConfig): Promise<string[]> {
  const pool = await createPool(config.connectionString)
  try {
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW')
       ORDER BY table_name`,
    )
    const all = res.rows.map(r => r.table_name)
    if (config.allowedTables && config.allowedTables.length > 0) {
      const allow = new Set(config.allowedTables.map(t => t.toLowerCase()))
      return all.filter(t => allow.has(t.toLowerCase()))
    }
    return all
  }
  finally {
    await pool.end()
  }
}

export async function executeReadOnlyPostgresQuery(
  config: PostgresConfig,
  sql: string,
): Promise<PostgresQueryResult> {
  const allowedTables = config.allowedTables && config.allowedTables.length > 0
    ? config.allowedTables
    : await listPostgresTables(config)

  const check = validateSQL(sql, allowedTables)
  if (!check.valid) {
    throw new Error(`SQL rejected by TinyPivot read-only validator: ${check.error}`)
  }

  const maxRows = config.maxRows ?? DEFAULT_MAX_ROWS
  const cleaned = sql.trim().replace(/;+\s*$/, '')
  const limitedSql = /\bLIMIT\s+\d+/i.test(cleaned)
    ? cleaned
    : `${cleaned} LIMIT ${maxRows + 1}`

  const pool = await createPool(config.connectionString)
  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query('SET LOCAL statement_timeout = 15000')
    const result = await client.query(limitedSql)
    await client.query('COMMIT')

    const rawRows = (result.rows ?? []) as Record<string, unknown>[]
    const truncated = rawRows.length > maxRows
    const rows = (truncated ? rawRows.slice(0, maxRows) : rawRows).map(row =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toPlainValue(value)])),
    )
    return {
      rows,
      rowCount: rows.length,
      truncated,
    }
  }
  catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
  finally {
    client.release()
    await pool.end()
  }
}

/** Postgres settings from DATABASE_URL and TINYPIVOT_ALLOWED_TABLES, or undefined when no database is set. */
export function postgresConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresConfig | undefined {
  if (!env.DATABASE_URL)
    return undefined
  return { connectionString: env.DATABASE_URL, allowedTables: listFromEnv(env.TINYPIVOT_ALLOWED_TABLES) }
}

async function describePostgresTables(config: PostgresConfig, requested?: string[]): Promise<WarehouseTableSchema[]> {
  const pool = await createPool(config.connectionString)
  try {
    const res = await pool.query<{ table_name: string, column_name: string, data_type: string }>(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    )
    const allow = config.allowedTables?.length ? new Set(config.allowedTables.map(t => t.toLowerCase())) : undefined
    const filter = requested?.length ? new Set(requested.map(t => t.replace(/["`]/g, '').toLowerCase())) : undefined
    const byTable = new Map<string, WarehouseTableSchema>()
    for (const row of res.rows) {
      const lower = row.table_name.toLowerCase()
      if ((allow && !allow.has(lower)) || (filter && !filter.has(lower)))
        continue
      const entry = byTable.get(row.table_name) ?? { name: row.table_name, columns: [] }
      entry.columns.push({ name: row.column_name, type: row.data_type })
      byTable.set(row.table_name, entry)
    }
    return [...byTable.values()].slice(0, 20)
  }
  finally {
    await pool.end()
  }
}

export function postgresConnector(config: PostgresConfig): WarehouseConnector {
  return {
    id: 'postgres',
    label: 'PostgreSQL',
    toolName: 'query_postgres',
    sqlHint: 'Postgres SQL (SELECT/WITH, sql or queries[]).',
    freeAlternative: 'export with `psql --csv` and pass the file to `load_file`',
    maxRows: config.maxRows ?? DEFAULT_MAX_ROWS,
    concurrent: true,
    dialect: {
      quoteName: plainName,
      median: expr => `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${expr})`,
      sampleDistinct: (expr, limit) => `ARRAY_TO_STRING((ARRAY_AGG(DISTINCT CAST(${expr} AS TEXT)))[1:${limit}], ', ')`,
    },
    listTables: () => listPostgresTables(config),
    describeTables: tables => describePostgresTables(config, tables),
    query: async (sql) => {
      const res = await executeReadOnlyPostgresQuery(config, sql)
      return { rows: res.rows, truncated: res.truncated }
    },
  }
}
