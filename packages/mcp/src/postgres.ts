import { validateSQL } from '@smallwebco/tinypivot-server'

export interface PostgresConfig {
  connectionString: string
  allowedTables?: string[]
  maxRows?: number
}

export interface PostgresQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}

async function createPool(connectionString: string) {
  let pgModule: typeof import('pg')
  try {
    pgModule = await import('pg')
  }
  catch {
    throw new Error('PostgreSQL queries require the optional "pg" package (`pnpm add pg`).')
  }
  const Pool = pgModule.Pool ?? (pgModule as unknown as { default: typeof import('pg') }).default.Pool
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 15_000 })
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

  const maxRows = config.maxRows ?? 5000
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
    const rows = truncated ? rawRows.slice(0, maxRows) : rawRows
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
