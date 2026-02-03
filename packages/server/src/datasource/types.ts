/**
 * Datasource Manager Types
 *
 * Types for the two-tier datasource model:
 * - Tier 'org': Shared read-only sources configured via environment variables
 * - Tier 'user': Personal sources with encrypted credentials in DB
 */

export type DatasourceTier = 'org' | 'user'
export type DatasourceType = 'postgres' | 'snowflake'
export type AuthMethod = 'password' | 'keypair' | 'oauth_sso' | 'externalbrowser'
export type ConnectionTestResult = 'success' | 'failure'

/**
 * Non-sensitive connection configuration stored in plaintext
 */
export interface ConnectionConfig {
  host?: string
  port?: number
  database?: string
  schema?: string
  // Snowflake-specific
  account?: string
  warehouse?: string
  role?: string
  // Username for display purposes (not sensitive - e.g., email for EXTERNALBROWSER auth)
  // The actual credentials.username is used for connections, this is for UI display
  user?: string
}

/**
 * Sensitive credentials (encrypted in DB)
 */
export interface DatasourceCredentials {
  username?: string
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
  [key: string]: string | undefined
}

/**
 * Datasource as returned to clients (credentials stripped)
 */
export interface DatasourceInfo {
  id: string
  name: string
  type: DatasourceType
  description?: string
  tier: DatasourceTier
  authMethod: AuthMethod
  connectionConfig: ConnectionConfig
  // Owner info
  userId?: string
  isOwner: boolean
  // Connection test results
  lastTestedAt?: Date
  lastTestResult?: ConnectionTestResult
  lastTestError?: string
  // Metadata
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Input for creating a new datasource
 */
export interface CreateDatasourceInput {
  name: string
  type: DatasourceType
  description?: string
  authMethod?: AuthMethod
  connectionConfig: ConnectionConfig
  credentials: DatasourceCredentials
}

/**
 * Input for updating a datasource
 */
export interface UpdateDatasourceInput {
  name?: string
  description?: string
  connectionConfig?: ConnectionConfig
  credentials?: DatasourceCredentials
}

/**
 * Connection status after testing
 */
export interface ConnectionStatus {
  connected: boolean
  error?: string
  version?: string
  database?: string
  latencyMs?: number
  testedAt: Date
}

/**
 * Org-level datasource from environment variables
 */
export interface OrgDatasourceEnvConfig {
  /** Environment variable prefix (e.g., 'ANALYTICS' -> ANALYTICS_HOST) */
  prefix: string
  /** Display name */
  name: string
  /** Datasource type */
  type: DatasourceType
  /** Description */
  description?: string
  /**
   * Custom environment variable name mappings.
   * Override the default `{PREFIX}_{FIELD}` pattern for any field.
   *
   * @example
   * ```ts
   * // Use SNOWFLAKE_ACCOUNT instead of MYPREFIX_ACCOUNT
   * envMapping: {
   *   account: 'SNOWFLAKE_ACCOUNT',
   *   user: 'SNOWFLAKE_USER',
   *   privateKey: 'SNOWFLAKE_PRIVATE_KEY',
   *   privateKeyPath: 'SNOWFLAKE_PRIVATE_KEY_PATH'
   * }
   * ```
   */
  envMapping?: {
    // Common
    user?: string
    password?: string
    // PostgreSQL
    host?: string
    port?: string
    database?: string
    schema?: string
    // Snowflake
    account?: string
    warehouse?: string
    role?: string
    privateKey?: string
    privateKeyPath?: string
    privateKeyPassphrase?: string
  }
}

/**
 * Full datasource record from database
 */
export interface DatasourceRecord {
  id: string
  name: string
  type: string
  description: string | null
  tier: string
  envPrefix: string | null
  connectionConfig: ConnectionConfig
  encryptedCredentials: string | null
  credentialsIv: string | null
  credentialsAuthTag: string | null
  credentialsSalt: string | null
  encryptedRefreshToken: string | null
  refreshTokenIv: string | null
  refreshTokenAuthTag: string | null
  refreshTokenSalt: string | null
  tokenExpiresAt: Date | null
  authMethod: string
  userId: string | null
  lastTestedAt: Date | null
  lastTestResult: string | null
  lastTestError: string | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Datasource with decrypted credentials (for internal use)
 */
export interface DatasourceWithCredentials extends DatasourceInfo {
  credentials: DatasourceCredentials
  refreshToken?: string
  tokenExpiresAt?: Date
}

/**
 * Query result from datasource
 */
export interface QueryResult {
  success: boolean
  data?: Record<string, unknown>[]
  rowCount?: number
  truncated?: boolean
  duration?: number
  error?: string
  columns?: string[]
}

/**
 * Paginated query result from datasource (for infinite scroll)
 */
export interface PaginatedQueryResult {
  success: boolean
  data: Record<string, unknown>[]
  rowCount: number
  offset: number
  limit: number
  hasMore: boolean
  duration?: number
  error?: string
  columns?: string[]
}
