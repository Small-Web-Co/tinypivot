/**
 * TinyPivot Snowflake Datasource
 * Snowflake data warehouse connector for TinyPivot Studio
 *
 * @packageDocumentation
 */

import type {
  ColumnSchema,
  ConnectionStatus,
  DatasourceAdapter,
  DatasourceConfig,
  QueryColumn,
  QueryResult,
  QueryValidation,
  TableSchema,
} from '@smallwebco/tinypivot-studio'

// Re-export types for convenience
export type {
  ColumnSchema,
  ConnectionStatus,
  DatasourceAdapter,
  DatasourceConfig,
  QueryColumn,
  QueryResult,
  QueryValidation,
  TableSchema,
}

/**
 * Snowflake-specific configuration options
 */
export interface SnowflakeConfig extends Omit<DatasourceConfig, 'type'> {
  account: string
  username?: string
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
  authenticator?: 'SNOWFLAKE' | 'SNOWFLAKE_JWT' | 'OAUTH' | 'EXTERNALBROWSER'
  accessToken?: string
  warehouse?: string
  role?: string
}

/**
 * Snowflake SDK types (to avoid compile-time dependency)
 */
interface SnowflakeConnectionInterface {
  connect: (callback: (err: Error | null, conn: SnowflakeConnectionInterface) => void) => void
  execute: (options: {
    sqlText: string
    binds?: unknown[]
    complete: (err: Error | null, stmt: SnowflakeStatement, rows: SnowflakeRow[]) => void
  }) => void
  destroy: (callback: (err: Error | null) => void) => void
  isUp: () => boolean
  getId: () => string
}

interface SnowflakeStatement {
  getSqlText: () => string
  getColumns: () => SnowflakeColumn[]
  getStatus: () => string
  getNumRows: () => number
  getNumUpdatedRows: () => number
  getQueryId: () => string
}

interface SnowflakeColumn {
  getName: () => string
  getType: () => string
  isNullable: () => boolean
  getScale: () => number
  getPrecision: () => number
}

type SnowflakeRow = Record<string, unknown>

interface SnowflakeSDK {
  createConnection: (options: Record<string, unknown>) => SnowflakeConnectionInterface
}

/**
 * Load the Snowflake SDK (optional peer dependency)
 */
function loadSnowflakeSDK(): SnowflakeSDK | null {
  try {
    // eslint-disable-next-line ts/no-require-imports
    return require('snowflake-sdk') as SnowflakeSDK
  }
  catch {
    return null
  }
}

/** Common type for both ColumnSchema and QueryColumn */
type NormalizedType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'unknown'

/**
 * Map Snowflake native types to normalized types
 */
function mapSnowflakeType(nativeType: string): NormalizedType {
  const type = nativeType.toUpperCase()

  // String types
  if (type.includes('VARCHAR') || type.includes('CHAR') || type.includes('STRING') || type.includes('TEXT')) {
    return 'string'
  }

  // Number types
  if (type.includes('NUMBER') || type.includes('INT') || type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('DECIMAL') || type.includes('NUMERIC')) {
    return 'number'
  }

  // Boolean
  if (type.includes('BOOLEAN')) {
    return 'boolean'
  }

  // Date types
  if (type === 'DATE') {
    return 'date'
  }

  // DateTime types
  if (type.includes('TIMESTAMP') || type.includes('DATETIME') || type === 'TIME') {
    return 'datetime'
  }

  // JSON types
  if (type.includes('VARIANT') || type.includes('OBJECT') || type.includes('ARRAY')) {
    return 'json'
  }

  // Binary and other types map to unknown
  return 'unknown'
}

/**
 * Snowflake Datasource Adapter
 *
 * Implements the DatasourceAdapter interface for Snowflake data warehouse.
 * Supports multiple authentication methods: password, key-pair, OAuth, and browser SSO.
 */
export class SnowflakeDatasourceAdapter implements DatasourceAdapter {
  readonly config: DatasourceConfig
  private snowflakeConfig: SnowflakeConfig
  private connection: SnowflakeConnectionInterface | null = null
  private sdk: SnowflakeSDK | null = null
  private connectedAt: Date | null = null

  constructor(config: SnowflakeConfig) {
    this.snowflakeConfig = config
    this.config = {
      ...config,
      type: 'snowflake',
    }

    this.sdk = loadSnowflakeSDK()
  }

  getStatus(): ConnectionStatus {
    if (!this.connection) {
      return { connected: false }
    }

    const connected = this.connection.isUp?.() ?? false
    return {
      connected,
      connectedAt: this.connectedAt || undefined,
      database: this.snowflakeConfig.database,
    }
  }

  async connect(): Promise<void> {
    if (!this.sdk) {
      throw new Error('Snowflake SDK (snowflake-sdk) is not installed. Install it with: npm install snowflake-sdk')
    }

    const connectionOptions: Record<string, unknown> = {
      account: this.snowflakeConfig.account,
      username: this.snowflakeConfig.username,
      warehouse: this.snowflakeConfig.warehouse,
      database: this.snowflakeConfig.database,
      schema: this.snowflakeConfig.schema,
      role: this.snowflakeConfig.role,
    }

    // Configure authentication
    const authenticator = this.snowflakeConfig.authenticator || 'SNOWFLAKE'
    connectionOptions.authenticator = authenticator

    switch (authenticator) {
      case 'SNOWFLAKE':
        connectionOptions.password = this.snowflakeConfig.password
        break

      case 'SNOWFLAKE_JWT':
        connectionOptions.privateKey = this.snowflakeConfig.privateKey
        if (this.snowflakeConfig.privateKeyPassphrase) {
          connectionOptions.privateKeyPass = this.snowflakeConfig.privateKeyPassphrase
        }
        break

      case 'OAUTH':
        connectionOptions.token = this.snowflakeConfig.accessToken
        break

      case 'EXTERNALBROWSER':
        // Browser-based SSO - no additional params needed
        break
    }

    return new Promise<void>((resolve, reject) => {
      const conn = this.sdk!.createConnection(connectionOptions)

      conn.connect((err: Error | null, connResult: SnowflakeConnectionInterface) => {
        if (err) {
          reject(new Error(`Failed to connect to Snowflake: ${err.message}`))
          return
        }
        this.connection = connResult
        this.connectedAt = new Date()
        resolve()
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      return
    }

    return new Promise<void>((resolve, reject) => {
      this.connection!.destroy((err: Error | null) => {
        this.connection = null
        this.connectedAt = null

        if (err) {
          reject(new Error(`Failed to disconnect: ${err.message}`))
          return
        }
        resolve()
      })
    })
  }

  isConnected(): boolean {
    return this.connection?.isUp?.() ?? false
  }

  async testConnection(): Promise<ConnectionStatus> {
    const startTime = Date.now()

    try {
      await this.connect()

      // Run a simple query to verify
      const result = await this.executeQuery('SELECT CURRENT_VERSION() as version, CURRENT_DATABASE() as database')
      const row = result.rows[0] as { VERSION?: string, DATABASE?: string } | undefined

      await this.disconnect()

      return {
        connected: true,
        version: row?.VERSION,
        database: row?.DATABASE,
        latencyMs: Date.now() - startTime,
      }
    }
    catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      }
    }
  }

  async listSchemas(): Promise<string[]> {
    this.ensureConnected()

    const result = await this.executeQuery('SHOW SCHEMAS')
    return result.rows.map(row => (row as { name: string }).name)
  }

  async listTables(schema?: string): Promise<TableSchema[]> {
    this.ensureConnected()

    const targetSchema = schema || this.snowflakeConfig.schema || 'PUBLIC'

    // Query INFORMATION_SCHEMA for tables
    const query = `
      SELECT
        TABLE_NAME,
        TABLE_SCHEMA,
        TABLE_TYPE,
        ROW_COUNT,
        COMMENT
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `

    const result = await this.executeQuery(query, [targetSchema])

    return result.rows.map((row) => {
      const r = row as {
        TABLE_NAME: string
        TABLE_SCHEMA: string
        TABLE_TYPE: string
        ROW_COUNT: number | null
        COMMENT: string | null
      }

      let tableType: 'table' | 'view' | 'materialized_view' = 'table'
      if (r.TABLE_TYPE === 'VIEW') {
        tableType = 'view'
      }
      else if (r.TABLE_TYPE === 'MATERIALIZED VIEW') {
        tableType = 'materialized_view'
      }

      return {
        name: r.TABLE_NAME,
        schema: r.TABLE_SCHEMA,
        type: tableType,
        columns: [], // Columns will be fetched separately
        rowCount: r.ROW_COUNT || undefined,
        description: r.COMMENT || undefined,
      }
    })
  }

  async getTableSchema(tableName: string, schema?: string): Promise<TableSchema> {
    this.ensureConnected()

    const targetSchema = schema || this.snowflakeConfig.schema || 'PUBLIC'

    // Get table info
    const tableQuery = `
      SELECT
        TABLE_NAME,
        TABLE_SCHEMA,
        TABLE_TYPE,
        ROW_COUNT,
        COMMENT
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `
    const tableResult = await this.executeQuery(tableQuery, [targetSchema, tableName])

    if (tableResult.rows.length === 0) {
      throw new Error(`Table not found: ${targetSchema}.${tableName}`)
    }

    const tableRow = tableResult.rows[0] as {
      TABLE_NAME: string
      TABLE_SCHEMA: string
      TABLE_TYPE: string
      ROW_COUNT: number | null
      COMMENT: string | null
    }

    // Get column info
    const columnQuery = `
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `
    const columnResult = await this.executeQuery(columnQuery, [targetSchema, tableName])

    const columns: ColumnSchema[] = columnResult.rows.map((row) => {
      const r = row as {
        COLUMN_NAME: string
        DATA_TYPE: string
        IS_NULLABLE: string
        COLUMN_DEFAULT: string | null
        COMMENT: string | null
      }

      return {
        name: r.COLUMN_NAME,
        type: mapSnowflakeType(r.DATA_TYPE),
        nativeType: r.DATA_TYPE,
        nullable: r.IS_NULLABLE === 'YES',
        primaryKey: false, // Snowflake doesn't enforce PKs in the same way
        defaultValue: r.COLUMN_DEFAULT || undefined,
        description: r.COMMENT || undefined,
      }
    })

    let tableType: 'table' | 'view' | 'materialized_view' = 'table'
    if (tableRow.TABLE_TYPE === 'VIEW') {
      tableType = 'view'
    }
    else if (tableRow.TABLE_TYPE === 'MATERIALIZED VIEW') {
      tableType = 'materialized_view'
    }

    return {
      name: tableRow.TABLE_NAME,
      schema: tableRow.TABLE_SCHEMA,
      type: tableType,
      columns,
      rowCount: tableRow.ROW_COUNT || undefined,
      description: tableRow.COMMENT || undefined,
    }
  }

  async executeQuery(query: string, params?: unknown[]): Promise<QueryResult> {
    this.ensureConnected()

    const startTime = Date.now()

    return new Promise<QueryResult>((resolve, reject) => {
      this.connection!.execute({
        sqlText: query,
        binds: params,
        complete: (err: Error | null, stmt: SnowflakeStatement, rows: SnowflakeRow[]) => {
          const executionTimeMs = Date.now() - startTime

          if (err) {
            reject(new Error(`Query failed: ${err.message}`))
            return
          }

          // Build column metadata from statement
          const stmtColumns = stmt.getColumns?.() || []
          const columns: QueryColumn[] = stmtColumns.map((col) => {
            const nativeType = col.getType?.() || 'unknown'
            return {
              name: col.getName?.() || 'unknown',
              type: mapSnowflakeType(nativeType),
              nativeType,
            }
          })

          // If we couldn't get columns from statement, infer from first row
          if (columns.length === 0 && rows.length > 0) {
            const firstRow = rows[0]!
            for (const key of Object.keys(firstRow)) {
              const value = firstRow[key]
              let type: QueryColumn['type'] = 'unknown'

              if (typeof value === 'string') {
                type = 'string'
              }
              else if (typeof value === 'number') {
                type = 'number'
              }
              else if (typeof value === 'boolean') {
                type = 'boolean'
              }
              else if (value instanceof Date) {
                type = 'datetime'
              }

              columns.push({ name: key, type })
            }
          }

          resolve({
            columns,
            rows,
            rowCount: rows.length,
            truncated: false,
            executionTimeMs,
          })
        },
      })
    })
  }

  async validateQuery(query: string): Promise<QueryValidation> {
    this.ensureConnected()

    try {
      // Use EXPLAIN to validate without executing
      await this.executeQuery(`EXPLAIN ${query}`)

      // Check if it's read-only (SELECT)
      const trimmed = query.trim().toUpperCase()
      const readOnly = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('SHOW') || trimmed.startsWith('DESCRIBE')

      return {
        valid: true,
        readOnly,
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      return {
        valid: false,
        error: message,
      }
    }
  }

  async getSampleData(tableName: string, limit: number = 100): Promise<QueryResult> {
    this.ensureConnected()

    const schema = this.snowflakeConfig.schema || 'PUBLIC'
    const query = `SELECT * FROM "${schema}"."${tableName}" LIMIT ${limit}`

    return this.executeQuery(query)
  }

  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new Error('Not connected to Snowflake. Call connect() first.')
    }
  }
}

/**
 * Create a Snowflake datasource adapter
 */
export function createSnowflakeDatasource(config: SnowflakeConfig): SnowflakeDatasourceAdapter {
  return new SnowflakeDatasourceAdapter(config)
}
