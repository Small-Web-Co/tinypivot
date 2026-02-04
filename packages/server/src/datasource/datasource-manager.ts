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
  PaginatedQueryResult,
  QueryResult,
  UpdateDatasourceInput,
} from './types'
import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Clears the Snowflake token cache file used by EXTERNALBROWSER auth.
 * Called when authentication tokens expire to force re-authentication.
 */
function clearSnowflakeTokenCache(): void {
  try {
    const tokenCachePath = join(homedir(), '.snowflake', 'token-cache.json')
    if (existsSync(tokenCachePath)) {
      unlinkSync(tokenCachePath)
      console.log('[Snowflake EXTERNALBROWSER] Cleared token cache file')
    }
  }
  catch (cacheErr) {
    console.log('[Snowflake EXTERNALBROWSER] Could not clear token cache:', cacheErr)
  }
}

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

  /** Check if a datasource is org-tier (no user auth needed) */
  isOrgDatasource: (id: string) => boolean

  /** Get org-tier datasource with credentials (no user auth needed) */
  getOrgDatasourceWithCredentials: (id: string) => DatasourceWithCredentials | null

  /** Execute a query against an org-tier datasource (no user auth needed) */
  executeOrgQuery: (
    id: string,
    sql: string,
    maxRows?: number
  ) => Promise<QueryResult>

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

  /** Execute a paginated query against a datasource (for infinite scroll) */
  executePaginatedQuery: (
    id: string,
    userId: string,
    userKey: string,
    sql: string,
    offset: number,
    limit: number
  ) => Promise<PaginatedQueryResult>

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

  /** Get schema for specific tables from a datasource */
  getTableSchemas: (
    id: string,
    userId: string,
    userKey: string,
    tableNames: string[]
  ) => Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>>

  /** Get schema for all tables from a datasource */
  getAllTableSchemas: (
    id: string,
    userId: string,
    userKey: string
  ) => Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>>
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
        console.log('[getDatasourceWithCredentials] Found org datasource:', id)
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
        console.log('[getDatasourceWithCredentials] Datasource not found:', id)
        return null
      }

      const record = rows[0]!
      const info = recordToInfo(record, userId)

      console.log('[getDatasourceWithCredentials] Found datasource:', {
        id: record.id,
        name: record.name,
        type: record.type,
        authMethod: record.authMethod,
        hasEncryptedCredentials: !!record.encryptedCredentials,
        hasEncryptedRefreshToken: !!record.encryptedRefreshToken,
      })

      // Decrypt credentials if present
      let credentials: DatasourceCredentials = {}
      if (record.encryptedCredentials && record.credentialsIv && record.credentialsAuthTag && record.credentialsSalt) {
        try {
          const payload: EncryptedPayload = {
            ciphertext: record.encryptedCredentials,
            iv: record.credentialsIv,
            authTag: record.credentialsAuthTag,
            salt: record.credentialsSalt,
          }
          credentials = credentialService.decrypt(payload, userKey) as DatasourceCredentials
          console.log('[getDatasourceWithCredentials] Decrypted credentials:', {
            hasUsername: !!credentials.username,
            hasPassword: !!credentials.password,
            hasPrivateKey: !!credentials.privateKey,
          })
        }
        catch (err) {
          console.error('[getDatasourceWithCredentials] Failed to decrypt credentials:', err)
          throw new Error('Failed to decrypt datasource credentials. Please check your user key.')
        }
      }
      else {
        console.log('[getDatasourceWithCredentials] No encrypted credentials found')
      }

      // Decrypt refresh token if present
      let refreshToken: string | undefined
      if (record.encryptedRefreshToken && record.refreshTokenIv && record.refreshTokenAuthTag && record.refreshTokenSalt) {
        try {
          const payload: EncryptedPayload = {
            ciphertext: record.encryptedRefreshToken,
            iv: record.refreshTokenIv,
            authTag: record.refreshTokenAuthTag,
            salt: record.refreshTokenSalt,
          }
          const decrypted = credentialService.decrypt(payload, userKey) as { token: string }
          refreshToken = decrypted.token
          console.log('[getDatasourceWithCredentials] Decrypted refresh token: present')
        }
        catch (err) {
          console.error('[getDatasourceWithCredentials] Failed to decrypt refresh token:', err)
          // Don't throw here - refresh token might be optional
        }
      }
      else {
        console.log('[getDatasourceWithCredentials] No refresh token found')
      }

      return {
        ...info,
        credentials,
        refreshToken,
        tokenExpiresAt: record.tokenExpiresAt || undefined,
      }
    },

    isOrgDatasource(id: string): boolean {
      return orgSources.has(id)
    },

    getOrgDatasourceWithCredentials(id: string): DatasourceWithCredentials | null {
      return orgSources.get(id) || null
    },

    async executeOrgQuery(
      id: string,
      sql: string,
      maxRows = 1000,
    ): Promise<QueryResult> {
      const source = orgSources.get(id)
      if (!source) {
        return {
          success: false,
          error: 'Org datasource not found',
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

    async createDatasource(
      input: CreateDatasourceInput,
      userId: string,
      userKey: string,
    ): Promise<string> {
      const { name, type, description, authMethod = 'password', connectionConfig, credentials } = input

      // Encrypt credentials
      const encrypted = credentialService.encrypt(credentials, userKey)

      // Copy username to connectionConfig for display purposes (not sensitive)
      // This allows the UI to show the username without decrypting credentials
      const configWithUser = {
        ...connectionConfig,
        user: credentials.username,
      }

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
        JSON.stringify(configWithUser),
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

      // Handle connectionConfig and credentials together to keep username in sync
      // The username is stored in both places: credentials (encrypted) and connectionConfig.user (for display)
      let configToStore = input.connectionConfig
      if (input.credentials?.username !== undefined) {
        // If credentials include a username, ensure it's also in connectionConfig for display
        configToStore = {
          ...(input.connectionConfig || {}),
          user: input.credentials.username,
        }
      }

      if (configToStore !== undefined) {
        updates.push(`connection_config = $${paramIndex++}`)
        values.push(JSON.stringify(configToStore))
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

    async executePaginatedQuery(
      id: string,
      userId: string,
      userKey: string,
      sql: string,
      offset: number,
      limit: number,
    ): Promise<PaginatedQueryResult> {
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        return {
          success: false,
          data: [],
          rowCount: 0,
          offset,
          limit,
          hasMore: false,
          error: 'Datasource not found',
        }
      }

      const startTime = Date.now()

      try {
        if (source.type === 'postgres') {
          return await executePostgresPaginatedQuery(source, sql, offset, limit, startTime)
        }

        if (source.type === 'snowflake') {
          return await executeSnowflakePaginatedQuery(source, sql, offset, limit, startTime)
        }

        return {
          success: false,
          data: [],
          rowCount: 0,
          offset,
          limit,
          hasMore: false,
          error: `Unsupported datasource type: ${source.type}`,
        }
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          data: [],
          rowCount: 0,
          offset,
          limit,
          hasMore: false,
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

    async getTableSchemas(
      id: string,
      userId: string,
      userKey: string,
      tableNames: string[],
    ): Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>> {
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        throw new Error('Datasource not found')
      }

      if (source.type === 'postgres') {
        return await getPostgresTableSchemas(source, tableNames)
      }

      if (source.type === 'snowflake') {
        return await getSnowflakeTableSchemas(source, tableNames)
      }

      throw new Error(`Unsupported datasource type: ${source.type}`)
    },

    async getAllTableSchemas(
      id: string,
      userId: string,
      userKey: string,
    ): Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>> {
      console.log('[getAllTableSchemas] Starting for datasource:', id)
      const source = await this.getDatasourceWithCredentials(id, userId, userKey)
      if (!source) {
        console.log('[getAllTableSchemas] Datasource not found')
        throw new Error('Datasource not found')
      }
      console.log('[getAllTableSchemas] Datasource type:', source.type)

      // First get all tables
      console.log('[getAllTableSchemas] Listing tables...')
      const tables = await this.listTables(id, userId, userKey)
      console.log('[getAllTableSchemas] Listed', tables.length, 'tables')
      const tableNames = tables.map(t => t.schema ? `${t.schema}.${t.name}` : t.name)
      console.log('[getAllTableSchemas] Table names (first 5):', tableNames.slice(0, 5))

      if (tableNames.length === 0) {
        console.log('[getAllTableSchemas] No tables found')
        return []
      }

      if (source.type === 'postgres') {
        console.log('[getAllTableSchemas] Getting PostgreSQL schemas...')
        return await getPostgresTableSchemas(source, tableNames)
      }

      if (source.type === 'snowflake') {
        console.log('[getAllTableSchemas] Getting Snowflake schemas...')
        const schemas = await getSnowflakeTableSchemas(source, tableNames)
        console.log('[getAllTableSchemas] Got', schemas.length, 'schemas')
        return schemas
      }

      throw new Error(`Unsupported datasource type: ${source.type}`)
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
 * Execute a paginated query against a PostgreSQL datasource
 */
async function executePostgresPaginatedQuery(
  source: DatasourceWithCredentials,
  sql: string,
  offset: number,
  limit: number,
  startTime: number,
): Promise<PaginatedQueryResult> {
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return {
      success: false,
      data: [],
      rowCount: 0,
      offset,
      limit,
      hasMore: false,
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
    statement_timeout: 30000,
  })

  try {
    const paginatedSql = buildPaginatedQuery(sql, offset, limit)
    const result = await pool.query(paginatedSql)
    const duration = Date.now() - startTime

    const columns = result.fields?.map((f: { name: string }) => f.name) || []

    // Check if we got more rows than the limit (indicates hasMore)
    const hasMore = result.rows.length > limit
    // Only return up to limit rows
    const data = hasMore ? result.rows.slice(0, limit) : result.rows

    return {
      success: true,
      data: data as Record<string, unknown>[],
      rowCount: data.length,
      offset,
      limit,
      hasMore,
      duration,
      columns,
    }
  }
  catch (error) {
    return {
      success: false,
      data: [],
      rowCount: 0,
      offset,
      limit,
      hasMore: false,
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
 * Get table schemas from a PostgreSQL datasource
 */
async function getPostgresTableSchemas(
  source: DatasourceWithCredentials,
  tableNames: string[],
): Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>> {
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
    const defaultSchema = connectionConfig.schema || 'public'

    // Parse table names to extract schema if present (e.g., "public.users" -> schema: "public", table: "users")
    const parsedTables = tableNames.map((t) => {
      if (t.includes('.')) {
        const [schema, name] = t.split('.')
        return { schema, name, fullName: t }
      }
      return { schema: defaultSchema, name: t, fullName: t }
    })

    // Get schemas to query
    const schemasToQuery = [...new Set(parsedTables.map(t => t.schema))]
    const tableNamesToQuery = parsedTables.map(t => t.name)

    const result = await pool.query(
      `SELECT
        table_schema,
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = ANY($1::text[])
        AND table_name = ANY($2::text[])
      ORDER BY table_schema, table_name, ordinal_position`,
      [schemasToQuery, tableNamesToQuery],
    )

    // Group columns by table
    const tableMap = new Map<string, Array<{ name: string, type: string, nullable: boolean }>>()
    for (const row of result.rows) {
      const fullTableName = `${row.table_schema}.${row.table_name}`
      if (!tableMap.has(fullTableName)) {
        tableMap.set(fullTableName, [])
      }
      tableMap.get(fullTableName)!.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      })
    }

    return Array.from(tableMap.entries()).map(([table, columns]) => ({
      table,
      columns,
    }))
  }
  finally {
    await pool.end()
  }
}

/**
 * Get table schemas from a Snowflake datasource
 */
async function getSnowflakeTableSchemas(
  source: DatasourceWithCredentials,
  tableNames: string[],
): Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>> {
  console.log('[Snowflake getTableSchemas] Starting for', tableNames.length, 'tables')
  console.log('[Snowflake getTableSchemas] Auth method:', source.authMethod)
  console.log('[Snowflake getTableSchemas] Has private key:', !!source.credentials.privateKey)
  console.log('[Snowflake getTableSchemas] Database:', source.connectionConfig.database)
  console.log('[Snowflake getTableSchemas] Schema:', source.connectionConfig.schema)
  console.log('[Snowflake getTableSchemas] Tables:', tableNames.slice(0, 5).join(', '), tableNames.length > 5 ? `... and ${tableNames.length - 5} more` : '')

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
  if (authMethod === 'externalbrowser') {
    connectionOptions.authenticator = 'EXTERNALBROWSER'
    connectionOptions.clientStoreTemporaryCredential = false
    console.log('[Snowflake getTableSchemas] Using EXTERNALBROWSER auth')
  }
  else if (authMethod === 'oauth_sso' && refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
    console.log('[Snowflake getTableSchemas] Using OAUTH auth with refresh token')
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
    console.log('[Snowflake getTableSchemas] Using OAUTH auth (legacy check)')
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = await normalizePrivateKey(credentials.privateKey, credentials.privateKeyPassphrase)
    console.log('[Snowflake getTableSchemas] Using SNOWFLAKE_JWT auth')
  }
  else if (credentials.password) {
    connectionOptions.password = credentials.password
    console.log('[Snowflake getTableSchemas] Using password auth')
  }
  else {
    throw new Error('No valid Snowflake credentials found')
  }

  const connection = snowflake.createConnection(connectionOptions)

  const database = connectionConfig.database
  const defaultSchema = connectionConfig.schema || 'PUBLIC'
  const isExternalBrowser = authMethod === 'externalbrowser'

  // Helper to execute DESCRIBE TABLE queries
  const describeTable = (conn: SnowflakeConnection, tableName: string): Promise<Array<{ name: string, type: string, nullable: boolean }>> => {
    let schema = defaultSchema
    let table = tableName
    if (tableName.includes('.')) {
      const parts = tableName.split('.')
      schema = parts[0]
      table = parts[1]
    }

    const sql = `DESCRIBE TABLE "${database}"."${schema}"."${table}"`
    console.log(`[Snowflake describeTable] Describing: ${tableName} -> SQL: ${sql}`)

    return new Promise((resolve) => {
      conn.execute({
        sqlText: sql,
        complete(err: Error | null, _stmt: unknown, rows: unknown[]) {
          if (err) {
            console.warn(`[Snowflake describeTable] Failed to describe ${tableName}:`, err.message)
            resolve([])
            return
          }

          const cols = (rows as Array<Record<string, unknown>>).map(row => ({
            name: (row.name || row.NAME) as string,
            type: (row.type || row.TYPE) as string,
            nullable: (row['null?'] || row.NULL || 'Y') === 'Y',
          }))
          console.log(`[Snowflake describeTable] ${tableName}: ${cols.length} columns`)
          resolve(cols)
        },
      })
    })
  }

  // For EXTERNALBROWSER, use connection pool (connections must be reused)
  if (isExternalBrowser) {
    console.log('[Snowflake getTableSchemas] Using connection pool for EXTERNALBROWSER')

    // Retry logic for terminated connections
    const executeWithRetry = async (attempt: number): Promise<Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }>> => {
      console.log(`[Snowflake getTableSchemas] Attempt ${attempt}`)

      const conn = await getExternalBrowserConnection(source.id, snowflake, connectionOptions)
      console.log('[Snowflake getTableSchemas] Got pooled connection, isUp:', conn.isUp?.())

      try {
        const results: Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }> = []

        for (const tableName of tableNames) {
          const columns = await describeTable(conn, tableName)
          if (columns.length > 0) {
            let schema = defaultSchema
            let table = tableName
            if (tableName.includes('.')) {
              const parts = tableName.split('.')
              schema = parts[0]
              table = parts[1]
            }
            results.push({ table: `${schema}.${table}`, columns })
          }
        }

        console.log('[Snowflake getTableSchemas] Successfully described', results.length, 'tables')
        // DON'T destroy the connection - keep it for reuse!
        return results
      }
      catch (err) {
        console.error('[Snowflake getTableSchemas] Error during table description:', err)
        // If connection terminated, clear the pool entry and retry
        if (err instanceof Error && err.message.includes('terminated connection')) {
          console.log('[Snowflake getTableSchemas] Clearing stale connection from pool')
          externalBrowserConnectionPool.set(source.id, { connection: null, connectionPromise: null })

          if (attempt < 3) {
            console.log('[Snowflake getTableSchemas] Retrying with fresh connection...')
            await new Promise(r => setTimeout(r, 1000))
            return executeWithRetry(attempt + 1)
          }
        }
        throw err
      }
    }

    return executeWithRetry(1)
  }

  // For other auth methods, use callback-based connect
  console.log('[Snowflake getTableSchemas] Using callback-based connect')
  try {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err: Error | null) => {
        if (err) {
          console.error('[Snowflake getTableSchemas] connect callback error:', err.message)
          reject(err)
        }
        else {
          console.log('[Snowflake getTableSchemas] connect callback success')
          resolve()
        }
      })
    })
  }
  catch (connectErr) {
    console.error('[Snowflake getTableSchemas] Connection failed:', connectErr)
    throw new Error(`Snowflake connection failed: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`)
  }

  // Validate and stabilize connection
  try {
    const isValid = await connection.isValidAsync()
    console.log('[Snowflake getTableSchemas] Connection isValidAsync:', isValid)
  }
  catch (validErr) {
    console.warn('[Snowflake getTableSchemas] isValidAsync failed:', validErr)
  }

  // Small stabilization delay
  await new Promise(r => setTimeout(r, 500))
  console.log('[Snowflake getTableSchemas] After delay, isUp:', connection.isUp?.())

  try {
    const results: Array<{ table: string, columns: Array<{ name: string, type: string, nullable: boolean }> }> = []

    for (const tableName of tableNames) {
      const columns = await describeTable(connection, tableName)
      if (columns.length > 0) {
        let schema = defaultSchema
        let table = tableName
        if (tableName.includes('.')) {
          const parts = tableName.split('.')
          schema = parts[0]
          table = parts[1]
        }
        results.push({ table: `${schema}.${table}`, columns })
      }
    }

    console.log('[Snowflake getTableSchemas] Successfully described', results.length, 'tables')
    return results
  }
  finally {
    connection.destroy(() => {})
  }
}

/**
 * List tables from a Snowflake datasource
 */
async function listSnowflakeTables(
  source: DatasourceWithCredentials,
): Promise<Array<{ name: string, schema?: string }>> {
  console.log('[Snowflake listTables] === STARTING listSnowflakeTables ===')

  try {
    const snowflake = await loadSnowflakeSDK()
    if (!snowflake) {
      throw new Error('Snowflake SDK (snowflake-sdk) is not installed')
    }

    const { connectionConfig, credentials, refreshToken, authMethod } = source

    // Debug logging
    console.log('[Snowflake listTables] Auth method:', authMethod)
    console.log('[Snowflake listTables] Has refresh token:', !!refreshToken)
    console.log('[Snowflake listTables] Has password:', !!credentials.password)
    console.log('[Snowflake listTables] Has private key:', !!credentials.privateKey)
    console.log('[Snowflake listTables] Account:', connectionConfig.account)
    console.log('[Snowflake listTables] Database:', connectionConfig.database)
    console.log('[Snowflake listTables] Schema:', connectionConfig.schema)

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
    if (authMethod === 'externalbrowser') {
      connectionOptions.authenticator = 'EXTERNALBROWSER'
      connectionOptions.clientStoreTemporaryCredential = false
      console.log('[Snowflake listTables] Using EXTERNALBROWSER auth')
    }
    else if (authMethod === 'oauth_sso' && refreshToken) {
      // OAuth SSO - use the refresh token as access token
      connectionOptions.authenticator = 'OAUTH'
      connectionOptions.token = refreshToken
      console.log('[Snowflake listTables] Using OAUTH auth with refresh token')
    }
    else if (refreshToken) {
      connectionOptions.authenticator = 'OAUTH'
      connectionOptions.token = refreshToken
      console.log('[Snowflake listTables] Using OAUTH auth (legacy check)')
    }
    else if (credentials.privateKey) {
      connectionOptions.authenticator = 'SNOWFLAKE_JWT'
      // Normalize/decrypt the private key to ensure it's in proper unencrypted PKCS8 PEM format
      const normalizedKey = await normalizePrivateKey(credentials.privateKey, credentials.privateKeyPassphrase)
      connectionOptions.privateKey = normalizedKey
      // Note: passphrase is no longer needed since we decrypt on-the-fly
      console.log('[Snowflake listTables] Using SNOWFLAKE_JWT auth')
      console.log('[Snowflake listTables] Private key starts with:', normalizedKey.substring(0, 50))
      console.log('[Snowflake listTables] Private key ends with:', normalizedKey.substring(normalizedKey.length - 50))
      console.log('[Snowflake listTables] Private key length:', normalizedKey.length)
    }
    else if (credentials.password) {
      connectionOptions.password = credentials.password
      console.log('[Snowflake listTables] Using password auth')
    }
    else {
      throw new Error('No valid Snowflake credentials found. Please check your datasource configuration.')
    }

    // Query for tables using SHOW TABLES which is more reliable in Snowflake
    const schema = connectionConfig.schema
    const database = connectionConfig.database

    if (!database) {
      throw new Error('Snowflake database name is required to list tables')
    }

    const sql = schema
      ? `SHOW TABLES IN SCHEMA "${database}"."${schema}"`
      : `SHOW TABLES IN DATABASE "${database}"`

    console.log('[Snowflake listTables] SQL query:', sql)

    const isExternalBrowser = authMethod === 'externalbrowser'
    console.log('[Snowflake listTables] Attempting to connect... (isExternalBrowser:', isExternalBrowser, ')')

    // For EXTERNALBROWSER, use connection pooling - connections must be reused
    // Creating a new connection per request doesn't work because browser auth is tied to the connection
    if (isExternalBrowser) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.error('[Snowflake] Connection/query timeout after 120 seconds')
          reject(new Error('Snowflake operation timed out after 120 seconds'))
        }, 120000)

        console.log('[Snowflake EXTERNALBROWSER] Using connection pool (connections must be reused)')

        // Recursive function to handle retries with fresh connections
        const executeWithRetry = (attempt: number): void => {
          console.log(`[Snowflake EXTERNALBROWSER] Execute attempt ${attempt}`)

          getExternalBrowserConnection(source.id, snowflake, connectionOptions)
            .then((conn) => {
              console.log('[Snowflake EXTERNALBROWSER] Got pooled connection, isUp:', conn.isUp?.())

              // Execute query on the pooled connection
              conn.execute({
                sqlText: sql,
                complete(err: Error | null, _stmt: unknown, rows: unknown[]) {
                  console.log('[Snowflake] Query callback received')

                  if (err) {
                    console.error('[Snowflake] Query error:', err.message)

                    // If connection terminated, clear the pool entry and retry with fresh connection
                    if (err.message.includes('terminated connection')) {
                      console.log('[Snowflake EXTERNALBROWSER] Clearing stale connection from pool')
                      externalBrowserConnectionPool.set(source.id, { connection: null, connectionPromise: null })

                      if (attempt < 3) {
                        console.log('[Snowflake EXTERNALBROWSER] Retrying with fresh connection...')
                        setTimeout(() => executeWithRetry(attempt + 1), 1000)
                        return
                      }
                    }

                    clearTimeout(timeoutId)
                    reject(err)
                    return
                  }

                  clearTimeout(timeoutId)
                  // DON'T destroy the connection - keep it for reuse!

                  console.log('[Snowflake] Query returned', rows?.length ?? 0, 'rows')
                  if (rows && rows.length > 0) {
                    console.log('[Snowflake] First row columns:', Object.keys(rows[0] as object))
                  }

                  const tables = (rows as Array<Record<string, unknown>> || []).map((row) => {
                    const name = (row.name || row.NAME || row.Name) as string
                    const schemaName = (row.schema_name || row.SCHEMA_NAME || row.SchemaName) as string
                    return { name, schema: schemaName }
                  }).filter(t => t.name)

                  console.log('[Snowflake] Returning', tables.length, 'tables')
                  resolve(tables)
                },
              })
            })
            .catch((connectErr) => {
              console.error('[Snowflake EXTERNALBROWSER] Pool connection failed:', connectErr)

              // Don't retry on token expiration - user must re-authenticate
              const errMsg = connectErr instanceof Error ? connectErr.message : String(connectErr)
              const isTokenExpired = errMsg.includes('session expired') || errMsg.includes('re-authenticate')

              // Retry on connection failures (but not token expiration)
              if (attempt < 3 && !isTokenExpired) {
                console.log('[Snowflake EXTERNALBROWSER] Retrying connection...')
                externalBrowserConnectionPool.set(source.id, { connection: null, connectionPromise: null })
                setTimeout(() => executeWithRetry(attempt + 1), 1000)
                return
              }

              clearTimeout(timeoutId)
              reject(new Error(isTokenExpired ? errMsg : `Snowflake connection failed: ${errMsg}`))
            })
        }

        executeWithRetry(1)
      })
    }

    // For other auth methods, create connection and use callback-based connect
    console.log('[Snowflake listTables] Using callback-based connect')
    console.log('[Snowflake listTables] Creating connection...')
    const connection = snowflake.createConnection(connectionOptions)
    console.log('[Snowflake listTables] Connection object created')

    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((err: Error | null) => {
          if (err) {
            console.error('[Snowflake listTables] connect callback error:', err.message)
            reject(err)
          }
          else {
            console.log('[Snowflake listTables] connect callback success')
            resolve()
          }
        })
      })
    }
    catch (connectErr) {
      console.error('[Snowflake listTables] Connection failed:', connectErr)
      throw new Error(`Snowflake connection failed: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`)
    }

    // Validate and stabilize connection
    try {
      const isValid = await connection.isValidAsync()
      console.log('[Snowflake listTables] Connection isValidAsync:', isValid)
    }
    catch (validErr) {
      console.warn('[Snowflake listTables] isValidAsync failed:', validErr)
    }

    // Small stabilization delay
    await new Promise(r => setTimeout(r, 500))
    console.log('[Snowflake listTables] After delay, isUp:', connection.isUp?.())

    console.log('[Snowflake] Listing tables with query:', sql)

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error('[Snowflake] Query timeout after 60 seconds')
        connection.destroy(() => {})
        reject(new Error('Snowflake query timed out after 60 seconds'))
      }, 60000)

      // Execute with retry for "terminated connection" errors
      const executeWithRetry = (attempt: number): void => {
        console.log(`[Snowflake listTables] Execute attempt ${attempt}`)
        connection.execute({
          sqlText: sql,
          complete(err: Error | null, _stmt: unknown, rows: unknown[]) {
            console.log('[Snowflake] Query callback received')

            if (err) {
              console.error('[Snowflake] Query error:', err.message)

              // Retry on "terminated connection" errors
              if (err.message.includes('terminated connection') && attempt < 3) {
                console.log('[Snowflake listTables] Retrying after terminated connection...')
                setTimeout(() => executeWithRetry(attempt + 1), 1000)
                return
              }

              clearTimeout(timeoutId)
              connection.destroy(() => {})
              reject(err)
              return
            }

            clearTimeout(timeoutId)
            connection.destroy(() => {})

            console.log('[Snowflake] Query returned', rows?.length ?? 0, 'rows')
            if (rows && rows.length > 0) {
              console.log('[Snowflake] First row columns:', Object.keys(rows[0] as object))
            }

            const tables = (rows as Array<Record<string, unknown>> || []).map((row) => {
              const name = (row.name || row.NAME || row.Name) as string
              const schemaName = (row.schema_name || row.SCHEMA_NAME || row.SchemaName) as string
              return { name, schema: schemaName }
            }).filter(t => t.name)

            console.log('[Snowflake] Returning', tables.length, 'tables')
            resolve(tables)
          },
        })
      }

      executeWithRetry(1)
    })
  }
  catch (err) {
    console.error('[Snowflake listTables] CAUGHT ERROR:', err)
    throw err
  }
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
 * Build a paginated query by removing existing LIMIT/OFFSET and adding new ones
 * Fetches limit + 1 rows to detect if there are more results
 */
function buildPaginatedQuery(sql: string, offset: number, limit: number): string {
  // Remove any trailing semicolon and whitespace
  let trimmed = sql.replace(/;\s*$/, '').trim()

  // Remove existing LIMIT and OFFSET clauses (case insensitive)
  trimmed = trimmed.replace(/\bLIMIT\s+\d+(?:\s+OFFSET\s+\d+)?/gi, '').trim()
  trimmed = trimmed.replace(/\bOFFSET\s+\d+(?:\s+LIMIT\s+\d+)?/gi, '').trim()

  // Add LIMIT (limit + 1 to detect hasMore) and OFFSET
  return `${trimmed} LIMIT ${limit + 1} OFFSET ${offset}`
}

/**
 * Normalize a private key to ensure it's in proper PEM PKCS8 format.
 * Handles:
 * - Keys without PEM headers (raw base64)
 * - Keys with newlines stripped
 * - PKCS1 format (-----BEGIN RSA PRIVATE KEY-----)
 * - Encrypted PKCS8 keys (decrypts them on-the-fly)
 */
async function normalizePrivateKey(key: string, passphrase?: string): Promise<string> {
  // Trim whitespace
  let normalized = key.trim()

  // Check if it's encrypted PKCS8 - decrypt it on-the-fly
  if (normalized.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')) {
    console.log('[Snowflake] Private key is encrypted PKCS8 - decrypting on-the-fly')
    if (!passphrase) {
      console.error('[Snowflake] Encrypted private key requires a passphrase')
      throw new Error('Encrypted private key requires a passphrase. Please provide the private key passphrase.')
    }

    try {
      const crypto = await import('node:crypto')
      const privateKey = crypto.createPrivateKey({
        key: normalized,
        format: 'pem',
        passphrase,
      })

      // Export as unencrypted PKCS8 PEM
      const decrypted = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string

      console.log('[Snowflake] Successfully decrypted private key')
      return decrypted
    }
    catch (err) {
      console.error('[Snowflake] Failed to decrypt private key:', err)
      throw new Error(`Failed to decrypt private key: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Check if it's already properly formatted unencrypted PKCS8
  if (normalized.includes('-----BEGIN PRIVATE KEY-----') && normalized.includes('-----END PRIVATE KEY-----')) {
    // Ensure it has proper line breaks (64 char lines)
    if (!normalized.includes('\n')) {
      // Has headers but no newlines - need to reformat
      const match = normalized.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/)
      if (match) {
        const base64 = match[1].replace(/\s/g, '')
        const lines = base64.match(/.{1,64}/g) || []
        normalized = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`
      }
    }
    return normalized
  }

  // Check if it's PKCS1 format (RSA PRIVATE KEY) - convert to PKCS8
  if (normalized.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    console.log('[Snowflake] Private key is in PKCS1 format - converting to PKCS8')
    try {
      const crypto = await import('node:crypto')
      const privateKey = crypto.createPrivateKey({
        key: normalized,
        format: 'pem',
      })

      // Export as PKCS8 PEM
      const pkcs8 = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string

      console.log('[Snowflake] Successfully converted PKCS1 to PKCS8')
      return pkcs8
    }
    catch (err) {
      console.error('[Snowflake] Failed to convert PKCS1 to PKCS8:', err)
      throw new Error(`Failed to convert private key format: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // No headers - assume it's raw base64 content
  // Strip any whitespace and newlines from the base64
  const base64Only = normalized.replace(/[\s-]/g, '').replace(/BEGINPRIVATEKEY|ENDPRIVATEKEY|BEGINRSAPRIVATEKEY|ENDRSAPRIVATEKEY/g, '')

  // Wrap in PKCS8 PEM headers with proper 64-char line breaks
  const lines = base64Only.match(/.{1,64}/g) || []
  const pemFormatted = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`

  console.log('[Snowflake] Normalized private key from raw base64 to PEM format')
  return pemFormatted
}

/**
 * Snowflake SDK types (dynamically loaded, not a compile-time dependency)
 */
interface SnowflakeConnection {
  connect: (callback: (err: Error | null) => void) => void
  // connectAsync supports both promise and callback patterns
  // Callback pattern waits until connection is fully ready
  connectAsync: {
    (): Promise<SnowflakeConnection>
    (callback: (err: Error | null, conn: SnowflakeConnection) => void): void
  }
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
 * Use require() via createRequire instead of dynamic import()
 */
let snowflakeSdkCache: SnowflakeSDK | null | 'not-loaded' = 'not-loaded'

/**
 * Connection pool for EXTERNALBROWSER auth - these connections must be reused
 * Key: datasource ID, Value: { connection, connectionPromise }
 */
const externalBrowserConnectionPool: Map<string, {
  connection: SnowflakeConnection | null
  connectionPromise: Promise<SnowflakeConnection> | null
}> = new Map()

/**
 * Load Snowflake SDK using require() pattern
 * This is more reliable for EXTERNALBROWSER auth than dynamic import()
 */
function loadSnowflakeSdkSync(): SnowflakeSDK | null {
  if (snowflakeSdkCache !== 'not-loaded') {
    return snowflakeSdkCache
  }

  try {
    // Use createRequire to load the SDK synchronously
    // eslint-disable-next-line ts/no-require-imports
    const { createRequire } = require('node:module')
    const require2 = createRequire(import.meta.url)
    const sdk = require2('snowflake-sdk') as SnowflakeSDK
    snowflakeSdkCache = sdk
    console.log('[Snowflake] SDK loaded via require() pattern')
    return sdk
  }
  catch {
    // Fallback to dynamic import if require fails
    console.warn('[Snowflake] require() failed, will use dynamic import')
    return null
  }
}

/**
 * Get or create a pooled connection for EXTERNALBROWSER auth
 * EXTERNALBROWSER requires connection reuse - the browser auth is tied to the connection instance
 *
 * IMPORTANT: We must use the ORIGINAL connection object
 * returned by createConnection(), NOT the one returned by connectAsync()
 */
async function getExternalBrowserConnection(
  datasourceId: string,
  snowflake: SnowflakeSDK,
  connectionOptions: Record<string, unknown>,
): Promise<SnowflakeConnection> {
  const poolEntry = externalBrowserConnectionPool.get(datasourceId)

  // Check if existing connection is still up
  // NOTE: We rely on isUp() only - isValidAsync() can interfere with EXTERNALBROWSER connections
  // If the connection fails when used, the retry logic in the caller will handle it
  if (poolEntry?.connection?.isUp?.()) {
    console.log('[Snowflake EXTERNALBROWSER] Reusing existing pooled connection for', datasourceId)
    return poolEntry.connection
  }
  else if (poolEntry?.connection) {
    // Connection exists but isUp returned false, clear it
    console.log('[Snowflake EXTERNALBROWSER] Pooled connection is down, recreating...')
    externalBrowserConnectionPool.set(datasourceId, { connection: null, connectionPromise: null })
  }

  // If there's a connection attempt in progress, wait for it
  if (poolEntry?.connectionPromise) {
    console.log('[Snowflake EXTERNALBROWSER] Waiting for in-progress connection for', datasourceId)
    return poolEntry.connectionPromise
  }

  // Create new connection
  console.log('[Snowflake EXTERNALBROWSER] Creating new pooled connection for', datasourceId)

  // CRITICAL: Create the connection object FIRST, then call connectAsync on it
  // We must use THIS connection object for queries, not the one from the Promise
  // NOTE: Create a defensive copy because Snowflake SDK mutates the options object (clears username)
  const connection = snowflake.createConnection({ ...connectionOptions })

  const connectionPromise = new Promise<SnowflakeConnection>((resolve, reject) => {
    // Use CALLBACK instead of promise - callback fires when connection is fully ready
    connection.connectAsync((err: Error | null, _conn: unknown) => {
      if (err) {
        console.error('[Snowflake EXTERNALBROWSER] Pool connection failed:', err)
        // Clear the promise so next attempt can try again
        externalBrowserConnectionPool.set(datasourceId, {
          connection: null,
          connectionPromise: null,
        })

        // Check for token expiration error (390195 = ID Token is invalid)
        const errAny = err as { code?: string, data?: { nextAction?: string } }
        if (errAny.code === '390195' || errAny.data?.nextAction === 'RETRY_LOGIN') {
          console.log('[Snowflake EXTERNALBROWSER] Token expired, clearing cache. User must re-authenticate.')
          // Clear any cached token by trying to delete the token cache
          clearSnowflakeTokenCache()
          reject(new Error('Snowflake session expired. Please test the connection again to re-authenticate through your browser.'))
          return
        }

        reject(err)
        return
      }

      // Use the original connection object, not the one from the callback
      console.log('[Snowflake EXTERNALBROWSER] Pool connection established, isUp:', connection.isUp?.())

      // Store the ORIGINAL connection in pool
      externalBrowserConnectionPool.set(datasourceId, {
        connection,
        connectionPromise: null,
      })
      resolve(connection)
    })
  })

  // Store the promise immediately so concurrent requests wait for it
  externalBrowserConnectionPool.set(datasourceId, {
    connection: null,
    connectionPromise,
  })

  return connectionPromise
}

/**
 * Dynamically load the snowflake-sdk module (optional peer dependency)
 * Prefers sync require() for EXTERNALBROWSER compatibility
 */
async function loadSnowflakeSDK(): Promise<SnowflakeSDK | null> {
  // Try sync require first (more reliable for EXTERNALBROWSER)
  const syncSdk = loadSnowflakeSdkSync()
  if (syncSdk) {
    return syncSdk
  }

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
  if (source.authMethod === 'externalbrowser') {
    // External browser auth - opens browser for SSO (only works locally)
    // clientStoreTemporaryCredential caches credentials after first auth
    connectionOptions.authenticator = 'EXTERNALBROWSER'
    connectionOptions.clientStoreTemporaryCredential = false
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = await normalizePrivateKey(credentials.privateKey, credentials.privateKeyPassphrase)
  }
  else {
    connectionOptions.password = credentials.password
  }

  const connection = snowflake.createConnection(connectionOptions)
  const isExternalBrowser = source.authMethod === 'externalbrowser'

  // Helper to run the test query
  const runTestQuery = (conn: SnowflakeConnection): Promise<ConnectionStatus> => {
    return new Promise((resolve) => {
      conn.execute({
        sqlText: 'SELECT CURRENT_VERSION() as version, CURRENT_DATABASE() as database',
        complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
          conn.destroy(() => {})

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

  // For EXTERNALBROWSER, use connectAsync with CALLBACK pattern
  // CRITICAL: The callback pattern ensures the connection is fully ready before proceeding
  // The promise pattern can resolve before the session is established, causing "terminated connection" errors
  if (isExternalBrowser) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        connection.destroy(() => {})
        resolve({
          connected: false,
          error: 'Snowflake connection timed out after 120 seconds',
          testedAt: new Date(),
        })
      }, 120000)

      // Use CALLBACK pattern instead of promise
      // The callback fires when the connection is fully ready for queries
      connection.connectAsync((connectErr: Error | null, _conn: unknown) => {
        if (connectErr) {
          clearTimeout(timeoutId)
          resolve({
            connected: false,
            error: connectErr.message,
            testedAt: new Date(),
          })
          return
        }

        // IMPORTANT: Use original `connection` object, NOT the one from callback
        console.log('[Snowflake testConnection] connectAsync callback fired, isUp:', connection.isUp?.())

        // Execute test query with retry
        const runWithRetry = (attempt: number): void => {
          console.log(`[Snowflake testConnection] Execute attempt ${attempt}`)
          connection.execute({
            sqlText: 'SELECT CURRENT_VERSION() as version, CURRENT_DATABASE() as database',
            complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
              if (queryErr) {
                console.error('[Snowflake testConnection] Query error:', queryErr.message)

                // Retry on "terminated connection" errors
                if (queryErr.message.includes('terminated connection') && attempt < 3) {
                  console.log('[Snowflake testConnection] Retrying after terminated connection...')
                  setTimeout(() => runWithRetry(attempt + 1), 1000)
                  return
                }

                clearTimeout(timeoutId)
                connection.destroy(() => {})
                resolve({
                  connected: false,
                  error: queryErr.message,
                  testedAt: new Date(),
                })
                return
              }

              clearTimeout(timeoutId)
              connection.destroy(() => {})

              const row = rows?.[0] as { VERSION: string, DATABASE: string } | undefined
              console.log('[Snowflake testConnection] Success:', row?.VERSION)
              resolve({
                connected: true,
                version: row?.VERSION,
                database: row?.DATABASE,
                testedAt: new Date(),
              })
            },
          })
        }

        runWithRetry(1)
      })
    })
  }

  // For other auth methods, use callback-based connect
  try {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err: Error | null) => {
        if (err)
          reject(err)
        else resolve()
      })
    })
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

  return runTestQuery(connection)
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
  if (authMethod === 'externalbrowser') {
    connectionOptions.authenticator = 'EXTERNALBROWSER'
    connectionOptions.clientStoreTemporaryCredential = false
  }
  else if (refreshToken) {
    connectionOptions.authenticator = 'OAUTH'
    connectionOptions.token = refreshToken
  }
  else if (credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = await normalizePrivateKey(credentials.privateKey, credentials.privateKeyPassphrase)
  }
  else {
    connectionOptions.password = credentials.password
  }

  const connection = snowflake.createConnection(connectionOptions)
  const isExternalBrowser = authMethod === 'externalbrowser'

  // Add LIMIT clause if not present
  const limitedSql = ensureQueryLimit(sql, maxRows)

  // For EXTERNALBROWSER, use connectAsync with CALLBACK pattern
  // CRITICAL: The callback pattern ensures the connection is fully ready before proceeding
  if (isExternalBrowser) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        connection.destroy(() => {})
        resolve({
          success: false,
          error: 'Snowflake connection timed out after 120 seconds',
          duration: Date.now() - startTime,
        })
      }, 120000)

      // Use CALLBACK pattern instead of promise - callback fires when connection is fully ready
      connection.connectAsync((connectErr: Error | null, _conn: unknown) => {
        if (connectErr) {
          clearTimeout(timeoutId)
          resolve({
            success: false,
            error: connectErr.message,
            duration: Date.now() - startTime,
          })
          return
        }

        // IMPORTANT: Use original `connection` object, NOT the one from callback
        console.log('[Snowflake executeQuery] connectAsync callback fired, isUp:', connection.isUp?.())

        // Execute with retry
        const runWithRetry = (attempt: number): void => {
          console.log(`[Snowflake executeQuery] Execute attempt ${attempt}`)
          connection.execute({
            sqlText: limitedSql,
            complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
              if (queryErr) {
                console.error('[Snowflake executeQuery] Query error:', queryErr.message)

                if (queryErr.message.includes('terminated connection') && attempt < 3) {
                  console.log('[Snowflake executeQuery] Retrying...')
                  setTimeout(() => runWithRetry(attempt + 1), 1000)
                  return
                }

                clearTimeout(timeoutId)
                connection.destroy(() => {})
                resolve({
                  success: false,
                  error: queryErr.message,
                  duration: Date.now() - startTime,
                })
                return
              }

              clearTimeout(timeoutId)
              connection.destroy(() => {})

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
        }

        runWithRetry(1)
      })
    })
  }

  // For other auth methods, use callback-based connect
  try {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err: Error | null) => {
        if (err)
          reject(err)
        else resolve()
      })
    })
  }
  catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - startTime,
    }
  }

  // Validate and stabilize connection
  try {
    const isValid = await connection.isValidAsync()
    console.log('[Snowflake executeQuery] Connection isValidAsync:', isValid)
  }
  catch (validErr) {
    console.warn('[Snowflake executeQuery] isValidAsync failed:', validErr)
  }

  // Small stabilization delay
  await new Promise(r => setTimeout(r, 500))

  // Execute query with retry
  return new Promise((resolve) => {
    const runWithRetry = (attempt: number): void => {
      console.log(`[Snowflake executeQuery] Execute attempt ${attempt}`)
      connection.execute({
        sqlText: limitedSql,
        complete(queryErr: Error | null, _stmt: unknown, rows: unknown[]) {
          if (queryErr) {
            console.error('[Snowflake executeQuery] Query error:', queryErr.message)

            if (queryErr.message.includes('terminated connection') && attempt < 3) {
              console.log('[Snowflake executeQuery] Retrying...')
              setTimeout(() => runWithRetry(attempt + 1), 1000)
              return
            }

            connection.destroy(() => {})
            resolve({
              success: false,
              error: queryErr.message,
              duration: Date.now() - startTime,
            })
            return
          }

          connection.destroy(() => {})

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
    }

    runWithRetry(1)
  })
}

/**
 * Execute a paginated query against a Snowflake datasource
 */
async function executeSnowflakePaginatedQuery(
  source: DatasourceWithCredentials,
  sql: string,
  offset: number,
  limit: number,
  startTime: number,
): Promise<PaginatedQueryResult> {
  // Dynamically import snowflake-sdk
  const snowflake = await loadSnowflakeSDK()
  if (!snowflake) {
    return {
      success: false,
      data: [],
      rowCount: 0,
      offset,
      limit,
      hasMore: false,
      error: 'Snowflake SDK (snowflake-sdk) is not installed. Install with: pnpm add snowflake-sdk',
    }
  }

  const { connectionConfig, credentials, authMethod } = source

  // Build connection options
  const connectionOptions: Record<string, unknown> = {
    account: connectionConfig.account,
    username: credentials.username,
    warehouse: connectionConfig.warehouse,
    database: connectionConfig.database,
    schema: connectionConfig.schema || 'PUBLIC',
    role: connectionConfig.role,
    timeout: 30000,
  }

  // Add authentication based on method
  if (authMethod === 'keypair' && credentials.privateKey) {
    connectionOptions.authenticator = 'SNOWFLAKE_JWT'
    connectionOptions.privateKey = await normalizePrivateKey(credentials.privateKey, credentials.privateKeyPassphrase)
  }
  else if (authMethod === 'externalbrowser') {
    connectionOptions.authenticator = 'EXTERNALBROWSER'
  }
  else {
    connectionOptions.password = credentials.password
  }

  // Build paginated SQL
  const paginatedSql = buildPaginatedQuery(sql, offset, limit)

  const connection = snowflake.createConnection(connectionOptions as any)

  // Connect
  try {
    await new Promise<void>((resolve, reject) => {
      connection.connect((err: any) => {
        if (err)
          reject(err)
        else resolve()
      })
    })
  }
  catch (err) {
    return {
      success: false,
      data: [],
      rowCount: 0,
      offset,
      limit,
      hasMore: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - startTime,
    }
  }

  // Validate and stabilize connection
  try {
    const isValid = await connection.isValidAsync()
    console.log('[Snowflake executePaginatedQuery] Connection isValidAsync:', isValid)
  }
  catch (validErr) {
    console.warn('[Snowflake executePaginatedQuery] isValidAsync failed:', validErr)
  }

  // Small stabilization delay
  await new Promise(r => setTimeout(r, 500))

  // Execute query with retry
  return new Promise((resolve) => {
    const runWithRetry = (attempt: number): void => {
      console.log(`[Snowflake executePaginatedQuery] Execute attempt ${attempt}`)
      connection.execute({
        sqlText: paginatedSql,

        complete(queryErr: any, _stmt: unknown, rows: unknown[]) {
          if (queryErr) {
            console.error('[Snowflake executePaginatedQuery] Query error:', queryErr.message)

            if (queryErr.message?.includes('terminated connection') && attempt < 3) {
              console.log('[Snowflake executePaginatedQuery] Retrying...')
              setTimeout(() => runWithRetry(attempt + 1), 1000)
              return
            }

            connection.destroy(() => {})
            resolve({
              success: false,
              data: [],
              rowCount: 0,
              offset,
              limit,
              hasMore: false,
              error: queryErr.message || String(queryErr),
              duration: Date.now() - startTime,
            })
            return
          }

          connection.destroy(() => {})

          const allData = rows as Record<string, unknown>[]
          const columns = allData.length > 0 ? Object.keys(allData[0]) : []

          // Check if we got more rows than the limit (indicates hasMore)
          const hasMore = allData.length > limit
          // Only return up to limit rows
          const data = hasMore ? allData.slice(0, limit) : allData

          resolve({
            success: true,
            data,
            rowCount: data.length,
            offset,
            limit,
            hasMore,
            duration: Date.now() - startTime,
            columns,
          })
        },
      })
    }

    runWithRetry(1)
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
