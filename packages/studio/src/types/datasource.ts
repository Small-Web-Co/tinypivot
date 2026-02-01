/**
 * Datasource Types for TinyPivot Studio
 * Defines interfaces for connecting to and querying data sources
 */

/**
 * Supported datasource types
 */
export type DatasourceType =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'duckdb'
  | 'bigquery'
  | 'snowflake'
  | 'redshift'
  | 'clickhouse'
  | 'rest-api'
  | 'graphql'
  | 'csv'
  | 'json'
  | 'parquet'

/**
 * Schema for a database column
 */
export interface ColumnSchema {
  /** Column name */
  name: string
  /** Data type (normalized across databases) */
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'binary' | 'unknown'
  /** Original database-specific type */
  nativeType: string
  /** Whether the column allows NULL values */
  nullable: boolean
  /** Whether the column is a primary key */
  primaryKey: boolean
  /** Default value expression */
  defaultValue?: string
  /** Column description/comment */
  description?: string
  /** Sample values (for preview) */
  sampleValues?: unknown[]
  /** Unique value count (if computed) */
  uniqueCount?: number
}

/**
 * Schema for a database table
 */
export interface TableSchema {
  /** Table name */
  name: string
  /** Schema/namespace name */
  schema?: string
  /** Table type */
  type: 'table' | 'view' | 'materialized_view'
  /** Column definitions */
  columns: ColumnSchema[]
  /** Estimated row count (if available) */
  rowCount?: number
  /** Table description/comment */
  description?: string
  /** Primary key column names */
  primaryKeyColumns?: string[]
  /** Foreign key relationships */
  foreignKeys?: ForeignKeyInfo[]
}

/**
 * Foreign key relationship information
 */
export interface ForeignKeyInfo {
  /** Column in this table */
  column: string
  /** Referenced table */
  referencedTable: string
  /** Referenced column */
  referencedColumn: string
  /** Constraint name */
  constraintName?: string
}

/**
 * Column information in a query result
 */
export interface QueryColumn {
  /** Column name or alias */
  name: string
  /** Detected data type */
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'unknown'
  /** Original database type */
  nativeType?: string
}

/**
 * Result of executing a query
 */
export interface QueryResult {
  /** Column metadata */
  columns: QueryColumn[]
  /** Row data */
  rows: Record<string, unknown>[]
  /** Number of rows returned */
  rowCount: number
  /** Whether results were truncated */
  truncated: boolean
  /** Query execution time in milliseconds */
  executionTimeMs: number
  /** Total row count (if available, for pagination) */
  totalRowCount?: number
  /** Warnings generated during query execution */
  warnings?: string[]
}

/**
 * Query validation result
 */
export interface QueryValidation {
  /** Whether the query is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Error position (character offset) */
  errorPosition?: number
  /** Suggestions for fixing the error */
  suggestions?: string[]
  /** Tables referenced in the query */
  referencedTables?: string[]
  /** Whether the query is read-only (SELECT) */
  readOnly?: boolean
  /** Estimated cost/complexity (database-specific) */
  estimatedCost?: number
}

/**
 * Configuration for connecting to a datasource
 */
export interface DatasourceConfig {
  /** Unique datasource identifier */
  id: string
  /** Display name */
  name: string
  /** Datasource type */
  type: DatasourceType
  /** Connection string or URL */
  connectionString?: string
  /** Host name */
  host?: string
  /** Port number */
  port?: number
  /** Database name */
  database?: string
  /** Username for authentication */
  username?: string
  /** Password (should be stored securely) */
  password?: string
  /** SSL/TLS configuration */
  ssl?: boolean | {
    rejectUnauthorized?: boolean
    ca?: string
    cert?: string
    key?: string
  }
  /** Additional connection options */
  options?: Record<string, unknown>
  /** Whether this is a read-only connection */
  readOnly?: boolean
  /** Maximum rows to return from queries */
  maxRows?: number
  /** Query timeout in seconds */
  queryTimeout?: number
  /** Description for documentation */
  description?: string
  /** Tags for organization */
  tags?: string[]
  /** Timestamp when created */
  createdAt?: Date
  /** Timestamp when last updated */
  updatedAt?: Date
}

/**
 * Connection status information
 */
export interface ConnectionStatus {
  /** Whether the connection is established */
  connected: boolean
  /** Last successful connection time */
  connectedAt?: Date
  /** Error message if connection failed */
  error?: string
  /** Database version information */
  version?: string
  /** Current database name */
  database?: string
  /** Connection latency in milliseconds */
  latencyMs?: number
}

/**
 * Datasource adapter interface
 * Implement this interface to support different database types
 */
export interface DatasourceAdapter {
  /**
   * Get the datasource configuration
   */
  readonly config: DatasourceConfig

  /**
   * Get the current connection status
   */
  getStatus: () => ConnectionStatus

  /**
   * Connect to the datasource
   */
  connect: () => Promise<void>

  /**
   * Disconnect from the datasource
   */
  disconnect: () => Promise<void>

  /**
   * Check if connected
   */
  isConnected: () => boolean

  /**
   * Test the connection (connect, verify, disconnect)
   */
  testConnection: () => Promise<ConnectionStatus>

  /**
   * List all available schemas/namespaces
   */
  listSchemas: () => Promise<string[]>

  /**
   * List all tables in a schema
   */
  listTables: (schema?: string) => Promise<TableSchema[]>

  /**
   * Get detailed schema for a specific table
   */
  getTableSchema: (tableName: string, schema?: string) => Promise<TableSchema>

  /**
   * Execute a SQL query
   */
  executeQuery: (query: string, params?: unknown[]) => Promise<QueryResult>

  /**
   * Validate a SQL query without executing
   */
  validateQuery: (query: string) => Promise<QueryValidation>

  /**
   * Get query suggestions/autocomplete
   */
  getSuggestions?: (prefix: string, context?: {
    tables?: string[]
    position?: number
  }) => Promise<string[]>

  /**
   * Cancel a running query
   */
  cancelQuery?: (queryId: string) => Promise<void>

  /**
   * Get sample data from a table
   */
  getSampleData: (tableName: string, limit?: number) => Promise<QueryResult>

  /**
   * Get column statistics (for data profiling)
   */
  getColumnStats?: (tableName: string, columnName: string) => Promise<{
    min?: unknown
    max?: unknown
    avg?: number
    nullCount: number
    distinctCount: number
    topValues?: Array<{ value: unknown, count: number }>
  }>
}

/**
 * Factory function type for creating datasource adapters
 */
export type DatasourceAdapterFactory = (config: DatasourceConfig) => DatasourceAdapter

/**
 * Registry of datasource adapter factories
 */
export interface DatasourceRegistry {
  /** Register an adapter factory for a datasource type */
  register: (type: DatasourceType, factory: DatasourceAdapterFactory) => void
  /** Create an adapter for the given configuration */
  create: (config: DatasourceConfig) => DatasourceAdapter
  /** Check if an adapter is registered for the given type */
  isSupported: (type: DatasourceType) => boolean
  /** Get list of supported datasource types */
  getSupportedTypes: () => DatasourceType[]
}
