/**
 * DuckDB WASM utility for client-side SQL execution
 */
import * as duckdb from '@duckdb/duckdb-wasm'

let db: duckdb.AsyncDuckDB | null = null
let conn: duckdb.AsyncDuckDBConnection | null = null

/**
 * Initialize DuckDB WASM
 */
export async function initDuckDB(): Promise<void> {
  if (db)
    return

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES)

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
  )

  const worker = new Worker(worker_url)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  conn = await db.connect()
}

/**
 * Load data into a DuckDB table
 */
export async function loadData(tableName: string, data: Record<string, unknown>[]): Promise<void> {
  if (!db || !conn)
    throw new Error('DuckDB not initialized')
  if (data.length === 0)
    return

  // Drop existing table if it exists
  await conn.query(`DROP TABLE IF EXISTS ${tableName}`)

  // Register JSON data as a virtual file then create table from it
  const jsonStr = JSON.stringify(data)
  const encoder = new TextEncoder()
  const jsonBytes = encoder.encode(jsonStr)

  await db.registerFileBuffer(`${tableName}.json`, jsonBytes)
  await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${tableName}.json')`)
}

/**
 * Execute a SQL query
 */
export async function executeQuery(sql: string): Promise<{ rows: Record<string, unknown>[], columns: string[] }> {
  if (!conn)
    throw new Error('DuckDB not initialized')

  const result = await conn.query(sql)
  const columns = result.schema.fields.map(f => f.name)
  const rows: Record<string, unknown>[] = []

  for (let i = 0; i < result.numRows; i++) {
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      const value = result.getChildAt(columns.indexOf(col))?.get(i)
      row[col] = value
    }
    rows.push(row)
  }

  return { rows, columns }
}

/**
 * Get table schema
 */
export async function getTableSchema(tableName: string): Promise<{ name: string, type: string }[]> {
  if (!conn)
    throw new Error('DuckDB not initialized')

  const result = await conn.query(`DESCRIBE ${tableName}`)
  const schema: { name: string, type: string }[] = []

  for (let i = 0; i < result.numRows; i++) {
    schema.push({
      name: result.getChildAt(0)?.get(i) as string,
      type: result.getChildAt(1)?.get(i) as string,
    })
  }

  return schema
}
