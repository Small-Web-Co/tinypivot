/**
 * Datasource Manager
 *
 * Manages datasources across two tiers:
 * - Org tier: Read-only shared sources configured via environment variables
 * - User tier: Personal sources with encrypted credentials stored in database
 *
 * @example
 * ```ts
 * const manager = createDatasourceManager({
 *   getPool: () => pool,
 *   credentialService,
 *   orgDatasources: [
 *     { prefix: 'ANALYTICS', name: 'Analytics DB', type: 'postgres' }
 *   ]
 * })
 *
 * // List all datasources available to a user
 * const sources = await manager.listDatasources(userId)
 *
 * // Connect with credentials
 * const source = await manager.getDatasourceWithCredentials(id, userId, userKey)
 * ```
 */

import type { Pool } from 'pg'
import type { CredentialService, EncryptedPayload } from '../crypto/credential-service'
import type {
  ConnectionStatus,
  CreateDatasourceInput,
  DatasourceCredentials,
  DatasourceInfo,
  DatasourceRecord,
  DatasourceTier,
  DatasourceType,
  DatasourceWithCredentials,
  OrgDatasourceEnvConfig,
  QueryResult,
  UpdateDatasourceInput,
} from './types'
import { randomUUID } from 'node:crypto'

/**
 * SQL SELECT clause with column aliases to convert snake_case to camelCase.
 * PostgreSQL returns column names as-is, so we need explicit aliases.
 */
const DATASOURCE_COLUMNS = `
  id,
  name,
  type,
  description,
  tier,
  env_prefix AS "envPrefix",
  connection_config AS "connectionConfig",
  encrypted_credentials AS "encryptedCredentials",
  credentials_iv AS "credentialsIv",
  credentials_auth_tag AS "credentialsAuthTag",
  credentials_salt AS "credentialsSalt",
  encrypted_refresh_token AS "encryptedRefreshToken",
  refresh_token_iv AS "refreshTokenIv",
  refresh_token_auth_tag AS "refreshTokenAuthTag",
  refresh_token_salt AS "refreshTokenSalt",
  token_expires_at AS "tokenExpiresAt",
  auth_method AS "authMethod",
  user_id AS "userId",
  last_tested_at AS "lastTestedAt",
  last_test_result AS "lastTestResult",
  last_test_error AS "lastTestError",
  active,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

export interface DatasourceManagerConfig {
  /** Function to get the database pool (lazy loading) */
  getPool: () => Pool | Promise<Pool>
  /** Credential encryption service */
  credentialService: CredentialService
  /** Org-level datasources from environment variables */
  orgDatasources?: OrgDatasourceEnvConfig[]
}

export interface DatasourceManager {
  /** List all datasources available to a user (org + personal) */
  listDatasources: (userId: string) => Promise<DatasourceInfo[]>

  /** Get datasource info (without credentials) */
  getDatasource: (id: string, userId: string) => Promise<DatasourceInfo | null>

  /** Get datasource with decrypted credentials */
  getDatasourceWithCredentials: (
    id: string,
    userId: string,
    userKey: string
  ) => Promise<DatasourceWithCredentials | null>

  /** Create a new user-owned datasource */
  createDatasource: (
    input: CreateDatasourceInput,
    userId: string,
    userKey: string
  ) => Promise<string>

  /** Update a datasource */
  updateDatasource: (
    id: string,
    input: UpdateDatasourceInput,
    userId: string,
    userKey: string
  ) => Promise<void>

  /** Delete a datasource */
  deleteDatasource: (id: string, userId: string) => Promise<void>

  /** Test datasource connection */
  testDatasource: (
    id: string,
    userId: string,
    userKey: string
  ) => Promise<ConnectionStatus>

  /** Execute a query against a datasource */
  executeQuery: (
    id: string,
    userId: string,
    userKey: string,
    sql: string,
    maxRows?: number
  ) => Promise<QueryResult>

  /** List tables from a datasource */
  listTables: (
    id: string,
    userId: string,
    userKey: string
  ) => Promise<Array<{ name: string, schema?: string }>>

  /** Store OAuth tokens for a datasource */
  storeOAuthTokens: (
    id: string,
    userId: string,
    userKey: string,
    refreshToken: string,
    expiresAt: Date
  ) => Promise<void>
}

/**
 * Helper to get env var with optional custom mapping
 */
function getEnvVar(
  prefix: string,
  field: string,
  envMapping?: OrgDatasourceEnvConfig['envMapping'],
): string | undefined {
  const customKey = envMapping?.[field as keyof NonNullable<typeof envMapping>]
  if (customKey) {
    return process.env[customKey]
  }
  return process.env[`${prefix}_${field.toUpperCase()}`]
}

/**
 * Read private key from file if path is provided
 */
function readPrivateKeyFromFile(path: string): string | undefined {
  try {
    // eslint-disable-next-line ts/no-require-imports
    const fs = require('node:fs')
    return fs.readFileSync(path, 'utf8')
  }
  catch {
    return undefined
  }
}

/**
 * Load org-level datasource configuration from environment variables
 */
function loadOrgDatasourceFromEnv(
  config: OrgDatasourceEnvConfig,
): DatasourceWithCredentials | null {
  const { prefix, name, type, description, envMapping } = config

  // Check if required ENV vars are present
  if (type === 'postgres') {
    const host = getEnvVar(prefix, 'host', envMapping)
    const user = getEnvVar(prefix, 'user', envMapping)
    if (!host || !user) {
      return null
    }

    const portStr = getEnvVar(prefix, 'port', envMapping)

    return {
      id: `org-${prefix.toLowerCase()}`,
      name,
      type,
      description,
      tier: 'org',
      authMethod: 'password',
      connectionConfig: {
        host,
        port: portStr ? Number.parseInt(portStr, 10) : 5432,
        database: getEnvVar(prefix, 'database', envMapping) || 'postgres',
        schema: getEnvVar(prefix, 'schema', envMapping) || 'public',
      },
      credentials: {
        username: user,
        password: getEnvVar(prefix, 'password', envMapping),
      },
      isOwner: false,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  if (type === 'snowflake') {
    const account = getEnvVar(prefix, 'account', envMapping)
    const user = getEnvVar(prefix, 'user', envMapping)
    if (!account || !user) {
      return null
    }

    // Get private key - either directly or from file path
    let privateKey = getEnvVar(prefix, 'privateKey', envMapping)
    const privateKeyPath = getEnvVar(prefix, 'privateKeyPath', envMapping)
    if (!privateKey && privateKeyPath) {
      privateKey = readPrivateKeyFromFile(privateKeyPath)
    }

    const privateKeyPassphrase = getEnvVar(prefix, 'privateKeyPassphrase', envMapping)
    const password = getEnvVar(prefix, 'password', envMapping)

    // Auto-detect auth method based on credentials present
    const authMethod: 'password' | 'keypair' = privateKey ? 'keypair' : 'password'

    return {
      id: `org-${prefix.toLowerCase()}`,
      name,
      type,
      description,
      tier: 'org',
      authMethod,
      connectionConfig: {
        account,
        warehouse: getEnvVar(prefix, 'warehouse', envMapping),
        database: getEnvVar(prefix, 'database', envMapping),
        schema: getEnvVar(prefix, 'schema', envMapping),
        role: getEnvVar(prefix, 'role', envMapping),
      },
      credentials: {
        username: user,
        password,
        privateKey,
        privateKeyPassphrase,
      },
      isOwner: false,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  return null
}

/**
 * Convert database record to DatasourceInfo (no credentials)
 */
function recordToInfo(record: DatasourceRecord, userId: string): DatasourceInfo {
  return {
    id: record.id,
    name: record.name,
    type: record.type as DatasourceType,
    description: record.description || undefined,
    tier: record.tier as DatasourceTier,
    authMethod: record.authMethod as 'password' | 'keypair' | 'oauth_sso',
    connectionConfig: record.connectionConfig,
    userId: record.userId || undefined,
    isOwner: record.userId === userId,
    lastTestedAt: record.lastTestedAt || undefined,
    lastTestResult: record.lastTestResult as 'success' | 'failure' | undefined,
    lastTestError: record.lastTestError || undefined,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * Create a datasource manager
 */
export function createDatasourceManager(config: DatasourceManagerConfig): DatasourceManager {
  const { getPool, credentialService, orgDatasources = [] } = config

  // Cache org datasources
  const orgSources = new Map<string, DatasourceWithCredentials>()
  for (const orgConfig of orgDatasources) {
    const source = loadOrgDatasourceFromEnv(orgConfig)
    if (source) {
      orgSources.set(source.id, source)
    }
  }

  return {
    async listDatasources(userId: string): Promise<DatasourceInfo[]> {
      const results: DatasourceInfo[] = []

      // Add org datasources (visible to all users)
      for (const source of orgSources.values()) {
        const { credentials: _creds, refreshToken: _token, tokenExpiresAt: _expires, ...info } = source
        results.push(info)
      }

      // Query user's datasources from database
      const pool = await getPool()
      const query = `
        SELECT ${DATASOURCE_COLUMNS}
        FROM tinypivot_datasources
        WHERE (user_id = $1 OR user_id IS NULL)
          AND active = true
        ORDER BY name
      `
      const { rows } = await pool.query<DatasourceRecord>(query, [userId])

      for (const row of rows) {
        results.push(recordToInfo(row, userId))
      }

      return results
    },

    async getDatasource(id: string, userId: string): Promise<DatasourceInfo | null> {
      // Check org datasources first
      const orgSource = orgSources.get(id)
      if (orgSource) {
        const { credentials: _creds, refreshToken: _token, tokenExpiresAt: _expires, ...info } = orgSource
        return info
      }

      // Query database
      const pool = await getPool()
      const query = `
        SELECT ${DATASOURCE_COLUMNS}
        FROM tinypivot_datasources
        WHERE id = $1
          AND (user_id = $2 OR user_id IS NULL)
          AND active = true
      `
      const { rows } = await pool.query<DatasourceRecord>(query, [id, userId])

      if (rows.length === 0) {
        return null
      }

      return recordToInfo(rows[0]!, userId)
    },

    async getDatasourceWithCredentials(
      id: string,
      userId: string,
      userKey: string,
    ): Promise<DatasourceWithCredentials | null> {
      // Check org datasources first
      const orgSource = orgSources.get(id)
      if (orgSource) {
        return orgSource
      }

      // Query database
      const pool = await getPool()
      const query = `
        SELECT ${DATASOURCE_COLUMNS}
        FROM tinypivot_datasources
        WHERE id = $1
          AND (user_id = $2 OR user_id IS NULL)
          AND active = true
      `
      const { rows } = await pool.query<DatasourceRecord>(query, [id, userId])

      if (rows.length === 0) {
        return null
      }

      const record = rows[0]!
      const info = recordToInfo(record, userId)

      // Decrypt credentials if present
      let credentials: DatasourceCredentials = {}
      if (record.encryptedCredentials && record.credentialsIv && record.credentialsAuthTag && record.credentialsSalt) {
        const payload: EncryptedPayload = {
          ciphertext: record.encryptedCredentials,
          iv: record.credentialsIv,
          authTag: record.credentialsAuthTag,
          salt: record.credentialsSalt,
        }
        credentials = credentialService.decrypt(payload, userKey) as DatasourceCredentials
      }

      // Decrypt refresh token if present
      let refreshToken: string | undefined
      if (record.encryptedRefreshToken && record.refreshTokenIv && record.refreshTokenAuthTag && record.refreshTokenSalt) {
        const payload: EncryptedPayload = {
          ciphertext: record.encryptedRefreshToken,
          iv: record.refreshTokenIv,
          authTag: record.refreshTokenAuthTag,
          salt: record.refreshTokenSalt,
        }
        const decrypted = credentialService.decrypt(payload, userKey) as { token: string }
        refreshToken = decrypted.token
      }

      return {
        ...info,
        credentials,
        refreshToken,
        tokenExpiresAt: record.tokenExpiresAt || undefined,
      }
    },

    async createDatasource(
      input: CreateDatasourceInput,
      userId: string,
      userKey: string,
    ): Promise<string> {
      const { name, type, description, authMethod = 'password', connectionConfig, credentials } = input

      // Encrypt credentials
      const encrypted = credentialService.encrypt(credentials, userKey)

      const id = randomUUID()
      const pool = await getPool()

      const query = `
        INSERT INTO tinypivot_datasources (
          id, name, type, description, tier, auth_method,
          connection_config, encrypted_credentials, credentials_iv,
          credentials_auth_tag, credentials_salt, user_id,
          active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'user', $5,
          $6, $7, $8, $9, $10, $11,
          true, NOW(), NOW()
        )
      `

      await pool.query(query, [
        id,
        name,
        type,
        description || null,
        authMethod,
        JSON.stringify(connectionConfig),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.salt,
        userId,
      ])

      return id
    },

    async updateDatasource(
      id: string,
      input: UpdateDatasourceInput,
      userId: string,
      userKey: string,
    ): Promise<void> {
      // Cannot update org datasources
      if (id.startsWith('org-')) {
        throw new Error('Cannot update organization-level datasources')
      }

      const pool = await getPool()

      // Verify ownership
      const checkQuery = `
        SELECT id FROM tinypivot_datasources
        WHERE id = $1 AND user_id = $2 AND active = true
      `
      const { rows } = await pool.query(checkQuery, [id, userId])
      if (rows.length === 0) {
        throw new Error('Datasource not found or access denied')
      }

      // Build update query dynamically
      const updates: string[] = []
      const values: unknown[] = []
      let paramIndex = 1

      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex++}`)
        values.push(input.name)
      }

      if (input.description !== undefined) {
        updates.push(`description = $${paramIndex++}`)
        values.push(input.description)
      }

      if (input.connectionConfig !== undefined) {
        updates.push(`connection_config = $${paramIndex++}`)
        values.push(JSON.stringify(input.connectionConfig))
      }

      if (input.credentials !== undefined) {
        const encrypted = credentialService.encrypt(input.credentials, userKey)
        updates.push(`encrypted_credentials = $${paramIndex++}`)
        values.push(encrypted.ciphertext)
        updates.push(`credentials_iv = $${paramIndex++}`)
        values.push(encrypted.iv)
        updates.push(`credentials_auth_tag = $${paramIndex++}`)
        values.push(encrypted.authTag)
        updates.push(`credentials_salt = $${paramIndex++}`)
        values.push(encrypted.salt)
      }

      if (updates.length === 0) {
        return // Nothing to update
      }

      updates.push(`updated_at = NOW()`)
      values.push(id)
      values.push(userId)

      const updateQuery = `
        UPDATE tinypivot_datasources
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
      `

      await pool.query(updateQuery, values)
    },

    async deleteDatasource(id: string, userId: string): Promise<void> {
      // Cannot delete org datasources
      if (id.startsWith('org-')) {
        throw new Error('Cannot delete organization-level datasources')
      }

      const pool = await getPool()

      // Soft delete - just mark as inactive
      const query = `
        UPDATE tinypivot_datasources
        SET active = false, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `

      const result = await pool.query(query, [id, userId])
      if (result.rowCount === 0) {
        throw new Error('Datasource not found or access denied')
      }
    },

    async testDatasource(
      id: string,
      userId: string,
      userKey: string,
    ): Promise<ConnectionStatus> {
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        return {
          connected: false,
          error: 'Datasource not found',
          testedAt: new Date(),
        }
      }

      const startTime = Date.now()

      try {
        if (source.type === 'postgres') {
          const status = await testPostgresConnection(source)
          const latencyMs = Date.now() - startTime

          // Update test results in database (only for user datasources)
          if (!id.startsWith('org-')) {
            await updateTestResults(await getPool(), id, status.connected, status.error)
          }

          return { ...status, latencyMs }
        }

        if (source.type === 'snowflake') {
          const status = await testSnowflakeConnection(source)
          const latencyMs = Date.now() - startTime

          // Update test results in database (only for user datasources)
          if (!id.startsWith('org-')) {
            await updateTestResults(await getPool(), id, status.connected, status.error)
          }

          return { ...status, latencyMs }
        }

        return {
          connected: false,
          error: `Unsupported datasource type: ${source.type}`,
          testedAt: new Date(),
        }
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // Update test results in database (only for user datasources)
        if (!id.startsWith('org-')) {
          await updateTestResults(await getPool(), id, false, errorMessage)
        }

        return {
          connected: false,
          error: errorMessage,
          latencyMs: Date.now() - startTime,
          testedAt: new Date(),
        }
      }
    },

    async executeQuery(
      id: string,
      userId: string,
      userKey: string,
      sql: string,
      maxRows = 1000,
    ): Promise<QueryResult> {
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        return {
          success: false,
          error: 'Datasource not found',
        }
      }

      const startTime = Date.now()

      try {
        if (source.type === 'postgres') {
          return await executePostgresQuery(source, sql, maxRows, startTime)
        }

        if (source.type === 'snowflake') {
          return await executeSnowflakeQuery(source, sql, maxRows, startTime)
        }

        return {
          success: false,
          error: `Unsupported datasource type: ${source.type}`,
        }
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          duration: Date.now() - startTime,
        }
      }
    },

    async listTables(
      id: string,
      userId: string,
      userKey: string,
    ): Promise<Array<{ name: string, schema?: string }>> {
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        throw new Error('Datasource not found')
      }

      if (source.type === 'postgres') {
        return await listPostgresTables(source)
      }

      if (source.type === 'snowflake') {
        return await listSnowflakeTables(source)
      }

      throw new Error(`Unsupported datasource type: ${source.type}`)
    },

    async storeOAuthTokens(
      id: string,
      userId: string,
      userKey: string,
      refreshToken: string,
      expiresAt: Date,
    ): Promise<void> {
      // Cannot modify org datasources
      if (id.startsWith('org-')) {
        throw new Error('Cannot store OAuth tokens for organization-level datasources')
      }

      const pool = await getPool()

      // Verify ownership
      const checkQuery = `
        SELECT id FROM tinypivot_datasources
        WHERE id = $1 AND user_id = $2 AND active = true
      `
      const { rows } = await pool.query(checkQuery, [id, userId])
      if (rows.length === 0) {
        throw new Error('Datasource not found or access denied')
      }

      // Encrypt refresh token
      const encrypted = credentialService.encrypt({ token: refreshToken }, userKey)

      const query = `
        UPDATE tinypivot_datasources
        SET encrypted_refresh_token = $1,
            refresh_token_iv = $2,
            refresh_token_auth_tag = $3,
            refresh_token_salt = $4,
            token_expires_at = $5,
            auth_method = 'oauth_sso',
            updated_at = NOW()
        WHERE id = $6 AND user_id = $7
      `

      await pool.query(query, [
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.salt,
        expiresAt,
        id,
        userId,
      ])
    },
  }
}

/**
 * Test PostgreSQL connection
 */
async function testPostgresConnection(source: DatasourceWithCredentials): Promise<ConnectionStatus> {
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return {
      connected: false,
      error: 'PostgreSQL driver (pg) is not installed',
      testedAt: new Date(),
    }
  }

  const { connectionConfig, credentials } = source
  const pool = new Pool({
    host: connectionConfig.host,
    port: connectionConfig.port || 5432,
    database: connectionConfig.database || 'postgres',
    user: credentials.username,
    password: credentials.password,
    connectionTimeoutMillis: 10000,
  })

  try {
    const result = await pool.query('SELECT version()')
    const version = (result.rows[0] as { version: string })?.version

    return {
      connected: true,
      version,
      database: connectionConfig.database,
      testedAt: new Date(),
    }
  }
  catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      testedAt: new Date(),
    }
  }
  finally {
    await pool.end()
  }
}

/**
 * Execute a query against a PostgreSQL datasource
 */
async function executePostgresQuery(
  source: DatasourceWithCredentials,
  sql: string,
  maxRows: number,
  startTime: number,
): Promise<QueryResult> {
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return {
      success: false,
      error: 'PostgreSQL driver (pg) is not installed',
    }
  }

  const { connectionConfig, credentials } = source
  const pool = new Pool({
    host: connectionConfig.host,
    port: connectionConfig.port || 5432,
    database: connectionConfig.database || 'postgres',
    user: credentials.username,
    password: credentials.password,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000, // 30 second query timeout
  })

  try {
    // Add LIMIT if not already present
    const limitedSql = ensureQueryLimit(sql, maxRows)

    const result = await pool.query(limitedSql)
    const duration = Date.now() - startTime

    // Get column names from the first row or fields metadata
    const columns = result.fields?.map((f: { name: string }) => f.name) || []

    return {
      success: true,
      data: result.rows as Record<string, unknown>[],
      rowCount: result.rows.length,
      truncated: result.rows.length >= maxRows,
      duration,
      columns,
    }
  }
  catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    }
  }
  finally {
    await pool.end()
  }
}

/**
 * List tables from a PostgreSQL datasource
 */
async function listPostgresTables(
  source: DatasourceWithCredentials,
): Promise<Array<{ name: string, schema?: string }>> {
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    throw new Error('PostgreSQL driver (pg) is not installed')
  }

  const { connectionConfig, credentials } = source
  const pool = new Pool({
    host: connectionConfig.host,
    port: connectionConfig.port || 5432,
    database: connectionConfig.database || 'postgres',
    user: credentials.username,
    password: credentials.password,
    connectionTimeoutMillis: 10000,
  })

  try {
    const schema = connectionConfig.schema || 'public'
    const result = await pool.query(
      `SELECT table_name, table_schema
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema],
    )

    return result.rows.map((row: { table_name: string, table_schema: string }) => ({
      name: row.table_name,
      schema: row.table_schema,
    }))
  }
  finally {
    await pool.end()
  }
}

/**
 * List tables from a Snowflake datasource
 */
async function listSnowflakeTables(
  source: DatasourceWithCredentials,
): Promise<Array<{ name: string, schema?: string }>> {
  const snowflake = await loadSnowflakeSDK()
  if (!snowflake) {
    throw new Error('Snowflake SDK (snowflake-sdk) is not installed')
  }

  const { connectionConfig, credentials, refreshToken, authMethod } = source

  const connectionOptions: Record<string, unknown> = {
    account: connectionConfig.account,
    username: credentials.username,
    warehouse: connectionConfig.warehouse,
    database: connectionConfig.database,
    schema: connectionConfig.schema,
    role: connectionConfig.role,
    timeout: 30000,
    clientSessionKeepAlive: true,
  }

  // Determine authentication method
  const useAsyncConnect = authMethod === 'externalbrowser'

  if (authMethod === 'externalbrowser') {
    connectionOptions.authenticator = 'EXTERNALBROWSER'
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = credentials.privateKey
    if (credentials.privateKeyPassphrase) {
      connectionOptions.privateKeyPass = credentials.privateKeyPassphrase
    }
  }
  else {
    connectionOptions.password = credentials.password
  }

  const connection = snowflake.createConnection(connectionOptions)

  // Connect
  if (useAsyncConnect) {
    await connection.connectAsync()
  }
  else {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err: Error | null) => {
        if (err)
          reject(err)
        else resolve()
      })
    })
  }

  // Query for tables using SHOW TABLES which is more reliable in Snowflake
  // If a specific schema is configured, show tables in that schema
  // Otherwise, show tables in the current database (all schemas)
  const schema = connectionConfig.schema
  const database = connectionConfig.database

  if (!database) {
    throw new Error('Snowflake database name is required to list tables')
  }

  const sql = schema
    ? `SHOW TABLES IN SCHEMA "${database}"."${schema}"`
    : `SHOW TABLES IN DATABASE "${database}"`

  // Log for debugging
  console.log('[Snowflake] Listing tables with query:', sql)

  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete(err: Error | null, _stmt: unknown, rows: unknown[]) {
        connection.destroy(() => {})

        if (err) {
          reject(err)
          return
        }

        // Log raw response for debugging
        if (rows.length > 0) {
          console.log('[Snowflake] First row columns:', Object.keys(rows[0] as object))
          console.log('[Snowflake] First row sample:', JSON.stringify(rows[0]).slice(0, 500))
        }
        else {
          console.log('[Snowflake] No tables returned from SHOW TABLES')
        }

        // SHOW TABLES returns columns that may be lowercase or uppercase depending on SDK version
        // Common column names: name/NAME, schema_name/SCHEMA_NAME
        const tables = (rows as Array<Record<string, unknown>>).map((row) => {
          // Try both cases for column names
          const name = (row.name || row.NAME || row.Name) as string
          const schemaName = (row.schema_name || row.SCHEMA_NAME || row.SchemaName) as string
          return {
            name,
            schema: schemaName,
          }
        }).filter(t => t.name) // Filter out any rows where name wasn't found

        console.log('[Snowflake] Returning', tables.length, 'tables')
        resolve(tables)
      },
    })
  })
}

/**
 * Ensure a query has a LIMIT clause to prevent runaway queries
 */
function ensureQueryLimit(sql: string, maxRows: number): string {
  // Simple check - if query already has LIMIT, don't add another
  if (/\bLIMIT\s+\d+\b/i.test(sql)) {
    return sql
  }
  // Add LIMIT to the end of the query (before any trailing semicolon)
  const trimmed = sql.replace(/;\s*$/, '').trim()
  return `${trimmed} LIMIT ${maxRows}`
}

/**
 * Snowflake SDK types (dynamically loaded, not a compile-time dependency)
 */
interface SnowflakeConnection {
  connect: (callback: (err: Error | null) => void) => void
  connectAsync: () => Promise<SnowflakeConnection>
  execute: (options: {
    sqlText: string
    complete: (err: Error | null, stmt: unknown, rows: unknown[]) => void
  }) => void
  isUp: () => boolean
  isValidAsync: () => Promise<boolean>
  destroy: (callback: () => void) => void
}

interface SnowflakeSDK {
  createConnection: (options: Record<string, unknown>) => SnowflakeConnection
}

/**
 * Cached snowflake-sdk module (loaded once on first use)
 */
let snowflakeSdkCache: SnowflakeSDK | null | 'not-loaded' = 'not-loaded'

/**
 * Dynamically load the snowflake-sdk module (optional peer dependency)
 */
async function loadSnowflakeSDK(): Promise<SnowflakeSDK | null> {
  if (snowflakeSdkCache !== 'not-loaded') {
    return snowflakeSdkCache
  }

  try {
    // Use dynamic import for better module resolution with pnpm
    const sdk = await import('snowflake-sdk') as unknown as { default?: SnowflakeSDK } & SnowflakeSDK
    snowflakeSdkCache = (sdk.default || sdk) as SnowflakeSDK
    return snowflakeSdkCache
  }
  catch {
    snowflakeSdkCache = null
    return null
  }
}

/**
 * Test Snowflake connection
 */
async function testSnowflakeConnection(source: DatasourceWithCredentials): Promise<ConnectionStatus> {
  // Dynamically import snowflake-sdk (optional peer dependency)
  const snowflake = await loadSnowflakeSDK()
  if (!snowflake) {
    return {
      connected: false,
      error: 'Snowflake SDK (snowflake-sdk) is not installed. Install with: pnpm add snowflake-sdk',
      testedAt: new Date(),
    }
  }

  const { connectionConfig, credentials, refreshToken } = source

  const connectionOptions: Record<string, unknown> = {
    account: connectionConfig.account,
    username: credentials.username,
    warehouse: connectionConfig.warehouse,
    database: connectionConfig.database,
    schema: connectionConfig.schema,
    role: connectionConfig.role,
    timeout: 30000,
    clientSessionKeepAlive: true,
    clientSessionKeepAliveHeartbeatFrequency: 3600,
  }

  // Determine authentication method
  const useAsyncConnect = source.authMethod === 'externalbrowser'

  if (source.authMethod === 'externalbrowser') {
    // External browser auth - opens browser for SSO (only works locally)
    connectionOptions.authenticator = 'EXTERNALBROWSER'
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = credentials.privateKey
    if (credentials.privateKeyPassphrase) {
      connectionOptions.privateKeyPass = credentials.privateKeyPassphrase
    }
  }
  else {
    connectionOptions.password = credentials.password
  }

  const connection = snowflake.createConnection(connectionOptions)

  try {
    // Use connectAsync for external browser auth, regular connect for others
    if (useAsyncConnect) {
      // connectAsync() connects the connection in place and returns it
      await connection.connectAsync()
    }
    else {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err: Error | null) => {
          if (err)
            reject(err)
          else resolve()
        })
      })
    }
  }
  catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : String(err),
      testedAt: new Date(),
    }
  }

  // Check connection state
  if (typeof connection.isUp === 'function' && !connection.isUp()) {
    return {
      connected: false,
      error: 'Connection was established but is no longer active',
      testedAt: new Date(),
    }
  }

  // For externalbrowser auth, just verify connection succeeded without running a query
  // The SDK has issues maintaining the connection after EXTERNALBROWSER auth
  if (useAsyncConnect) {
    connection.destroy(() => {})
    return {
      connected: true,
      version: 'Connected via SSO',
      database: connectionConfig.database,
      testedAt: new Date(),
    }
  }

  // Query for version using callback-based execute wrapped in promise
  return new Promise((resolve) => {
    connection.execute({
      sqlText: 'SELECT CURRENT_VERSION() as version, CURRENT_DATABASE() as database',
      complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
        connection.destroy(() => {})

        if (queryErr) {
          resolve({
            connected: false,
            error: queryErr.message,
            testedAt: new Date(),
          })
          return
        }

        const row = rows?.[0] as { VERSION: string, DATABASE: string } | undefined
        resolve({
          connected: true,
          version: row?.VERSION,
          database: row?.DATABASE,
          testedAt: new Date(),
        })
      },
    })
  })
}

/**
 * Execute a query against a Snowflake datasource
 */
async function executeSnowflakeQuery(
  source: DatasourceWithCredentials,
  sql: string,
  maxRows: number,
  startTime: number,
): Promise<QueryResult> {
  // Dynamically import snowflake-sdk
  const snowflake = await loadSnowflakeSDK()
  if (!snowflake) {
    return {
      success: false,
      error: 'Snowflake SDK (snowflake-sdk) is not installed. Install with: pnpm add snowflake-sdk',
    }
  }

  const { connectionConfig, credentials, refreshToken, authMethod } = source

  const connectionOptions: Record<string, unknown> = {
    account: connectionConfig.account,
    username: credentials.username,
    warehouse: connectionConfig.warehouse,
    database: connectionConfig.database,
    schema: connectionConfig.schema,
    role: connectionConfig.role,
    timeout: 30000,
    clientSessionKeepAlive: true,
    clientSessionKeepAliveHeartbeatFrequency: 3600,
  }

  // Determine authentication method
  const useAsyncConnect = authMethod === 'externalbrowser'

  if (authMethod === 'externalbrowser') {
    connectionOptions.authenticator = 'EXTERNALBROWSER'
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = credentials.privateKey
    if (credentials.privateKeyPassphrase) {
      connectionOptions.privateKeyPass = credentials.privateKeyPassphrase
    }
  }
  else {
    connectionOptions.password = credentials.password
  }

  const connection = snowflake.createConnection(connectionOptions)

  try {
    // Connect
    if (useAsyncConnect) {
      await connection.connectAsync()
    }
    else {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err: Error | null) => {
          if (err)
            reject(err)
          else resolve()
        })
      })
    }
  }
  catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - startTime,
    }
  }

  // Add LIMIT clause if not present
  const limitedSql = ensureQueryLimit(sql, maxRows)

  // Execute query
  return new Promise((resolve) => {
    connection.execute({
      sqlText: limitedSql,
      complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
        connection.destroy(() => {})

        if (queryErr) {
          resolve({
            success: false,
            error: queryErr.message,
            duration: Date.now() - startTime,
          })
          return
        }

        const data = rows as Record<string, unknown>[]
        const columns = data.length > 0 ? Object.keys(data[0]) : []

        resolve({
          success: true,
          data,
          rowCount: data.length,
          truncated: data.length >= maxRows,
          duration: Date.now() - startTime,
          columns,
        })
      },
    })
  })
}

/**
 * Update test results in database
 */
async function updateTestResults(
  pool: Pool,
  id: string,
  success: boolean,
  error?: string,
): Promise<void> {
  const query = `
    UPDATE tinypivot_datasources
    SET last_tested_at = NOW(),
        last_test_result = $1,
        last_test_error = $2,
        updated_at = NOW()
    WHERE id = $3
  `

  await pool.query(query, [
    success ? 'success' : 'failure',
    error || null,
    id,
  ])
}
