import type { AIColumnSchema, AIProxyResponse, AITableSchema, QueryResponse, SchemaResponse } from '@smallwebco/tinypivot-core'
import type { RequestHandler } from './types'
import { createSnowflakeOAuth } from './auth/snowflake-oauth'
import { createCredentialService } from './crypto/credential-service'
import { createDatasourceManager } from './datasource'
/**
 * TinyPivot Server - Unified Handler
 *
 * A single endpoint that handles everything:
 * - Table discovery (auto-discovers from PostgreSQL information_schema)
 * - Schema introspection
 * - Query execution
 * - AI chat proxy
 *
 * This is the simplified API for TinyPivot AI Data Analyst.
 *
 * @example
 * ```typescript
 * // Next.js App Router
 * import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
 * export const POST = createTinyPivotHandler()
 *
 * // That's it! Set DATABASE_URL and AI_API_KEY in your .env
 * ```
 */
import { ensureLimit, validateSQL } from './validation'

// ============================================================================
// Types
// ============================================================================

/**
 * Table filtering options for controlling which tables are exposed
 */
export interface TableFilterOptions {
  /**
   * Only include tables matching these patterns (exact string or regex)
   * If not provided, all tables in the specified schemas are included.
   *
   * Example: `['sales', 'customers', /^app_.+/]`
   */
  include?: (string | RegExp)[]

  /**
   * Exclude tables matching these patterns (applied after include)
   *
   * Example: `[/^_/, 'migrations', 'sessions']`
   */
  exclude?: (string | RegExp)[]

  /**
   * Only include tables from these schemas (default: ['public'])
   *
   * Example: `['public', 'analytics']`
   */
  schemas?: string[]

  /**
   * Descriptions to show to the AI for context
   * Keys are table names, values are human-readable descriptions
   */
  descriptions?: Record<string, string>
}

/**
 * Options for creating the unified TinyPivot handler
 */
export interface TinyPivotHandlerOptions {
  /**
   * PostgreSQL connection string
   * @default process.env.DATABASE_URL
   */
  connectionString?: string

  /**
   * AI API key - auto-detects provider from key format:
   * - `sk-ant-...` → Anthropic
   * - `sk-or-...` → OpenRouter
   * - `sk-...` → OpenAI
   * @default process.env.AI_API_KEY
   */
  apiKey?: string

  /**
   * Custom OpenAI-compatible base URL for AI requests.
   * When set, uses OpenAI chat completions format with optional Bearer auth.
   * @default process.env.AI_BASE_URL
   * @example "http://localhost:11434/v1"
   */
  aiBaseUrl?: string

  /**
   * Table filtering options
   * By default, all tables in the 'public' schema are exposed.
   */
  tables?: TableFilterOptions

  /**
   * Maximum rows to return from queries.
   * If not set, no limit is enforced (queries may return large result sets).
   */
  maxRows?: number

  /**
   * Query timeout in milliseconds.
   * If not set, uses PostgreSQL default (no timeout).
   */
  timeout?: number

  /**
   * Override the AI model.
   *
   * Priority: options.model > AI_MODEL env var > cheap default per provider
   *
   * Defaults (cheap/fast):
   * - Anthropic: claude-3-haiku-20240307
   * - OpenAI: gpt-4o-mini
   * - OpenRouter: anthropic/claude-3-haiku
   *
   * @example 'claude-sonnet-4-20250514', 'gpt-4o'
   */
  model?: string

  /**
   * Maximum tokens for AI responses
   * @default 2048
   */
  maxTokens?: number

  /**
   * Custom error handler
   */
  onError?: (error: Error) => void

  /**
   * Credential encryption key for user-managed datasources
   * Required for datasource management features
   * @default process.env.CREDENTIAL_ENCRYPTION_KEY
   */
  credentialEncryptionKey?: string

  /**
   * Org-level datasources configured via environment variables
   * These are read-only sources shared across all users
   */
  orgDatasources?: Array<{
    /** Environment variable prefix (e.g., 'ANALYTICS' -> ANALYTICS_HOST) */
    prefix: string
    /** Display name */
    name: string
    /** Datasource type */
    type: 'postgres' | 'snowflake'
    /** Description */
    description?: string
    /**
     * Custom environment variable name mappings.
     * Override the default `{PREFIX}_{FIELD}` pattern for any field.
     *
     * @example
     * ```ts
     * // Use existing env vars with different naming
     * envMapping: {
     *   account: 'SNOWFLAKE_ACCOUNT',
     *   user: 'SNOWFLAKE_USER',
     *   privateKeyPath: 'SNOWFLAKE_PRIVATE_KEY_PATH'
     * }
     * ```
     */
    envMapping?: {
      user?: string
      password?: string
      host?: string
      port?: string
      database?: string
      schema?: string
      account?: string
      warehouse?: string
      role?: string
      privateKey?: string
      privateKeyPath?: string
      privateKeyPassphrase?: string
    }
  }>

  /**
   * Snowflake OAuth configuration for Browser SSO
   * Required for Snowflake SSO authentication flow
   */
  snowflakeOAuth?: {
    /** Snowflake account identifier (e.g., 'xy12345.us-east-1') */
    account: string
    /** OAuth client ID from Snowflake security integration */
    clientId: string
    /** OAuth client secret from Snowflake security integration */
    clientSecret: string
    /** Redirect URI registered in Snowflake (must match exactly) */
    redirectUri: string
    /** OAuth scopes (default: 'session:role:PUBLIC') */
    scopes?: string[]
  }
}

/**
 * Request body for the unified endpoint
 */
export interface TinyPivotRequest {
  /** Action to perform */
  action:
    | 'list-tables'
    | 'get-schema'
    | 'get-all-schemas'
    | 'query'
    | 'chat'
    // Datasource management actions
    | 'list-datasources'
    | 'get-datasource'
    | 'create-datasource'
    | 'update-datasource'
    | 'delete-datasource'
    | 'test-datasource'
    | 'connect-datasource'
    | 'query-datasource'
    | 'list-datasource-tables'
    // Paginated query action
    | 'query-datasource-paginated'
    // Snowflake OAuth SSO
    | 'start-snowflake-oauth'
    | 'snowflake-oauth-callback'

  // For get-schema
  tables?: string[]

  // For query
  sql?: string
  table?: string

  // For chat
  messages?: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
  /** Client-provided API key for LLM requests (overrides server AI_API_KEY) */
  apiKey?: string
  /** Client-provided base URL for AI API (overrides server aiBaseUrl and AI_BASE_URL env) */
  aiBaseUrl?: string
  /** Client-provided model override for AI requests */
  aiModel?: string

  // For datasource management
  /** Datasource ID */
  datasourceId?: string
  /** Datasource configuration for create/update */
  datasourceConfig?: {
    name: string
    type: 'postgres' | 'snowflake'
    description?: string
    authMethod?: 'password' | 'keypair' | 'oauth_sso' | 'externalbrowser'
    connectionConfig: {
      host?: string
      port?: number
      database?: string
      schema?: string
      account?: string
      warehouse?: string
      role?: string
    }
    credentials: {
      username?: string
      password?: string
      privateKey?: string
      privateKeyPassphrase?: string
    }
  }

  // For query-datasource
  /** Maximum number of rows to return */
  maxRows?: number

  // For query-datasource-paginated
  /** Offset for paginated queries */
  offset?: number
  /** Limit for paginated queries (batch size) */
  limit?: number

  // Authentication context (should be set by your auth middleware)
  /** User ID from authentication */
  userId?: string
  /** User's encryption key for credentials (should be derived from user's auth) */
  userKey?: string

  // For Snowflake OAuth
  /** OAuth authorization code (for callback) */
  code?: string
  /** OAuth state parameter (for callback) */
  state?: string
  /** OAuth error (for callback) */
  oauthError?: string
  /** OAuth error description (for callback) */
  oauthErrorDescription?: string
  /** Snowflake OAuth config for start-snowflake-oauth */
  snowflakeDatasource?: {
    name: string
    description?: string
    account: string
    warehouse?: string
    database?: string
    schema?: string
    role?: string
  }
}

/**
 * Response for list-tables action
 */
export interface ListTablesResponse {
  tables: Array<{
    name: string
    description?: string
  }>
  error?: string
}

// ============================================================================
// AI Provider Detection
// ============================================================================

type AIProvider = 'anthropic' | 'openai' | 'openrouter'

interface ProviderConfig {
  provider: AIProvider
  endpoint: string
  defaultModel: string
  buildHeaders: (apiKey: string) => Record<string, string>
  extractContent: (data: unknown) => string
}

/**
 * Detect AI provider from API key format
 */
function detectProvider(apiKey: string): AIProvider {
  if (apiKey.startsWith('sk-ant-')) {
    return 'anthropic'
  }
  if (apiKey.startsWith('sk-or-')) {
    return 'openrouter'
  }
  // Default to OpenAI for sk-... keys
  return 'openai'
}

/**
 * Get provider configuration
 *
 * Default models are intentionally cheap/fast for cost-efficiency:
 * - Anthropic: claude-3-haiku (cheapest Claude model)
 * - OpenAI: gpt-4o-mini (cheapest GPT-4 class model)
 * - OpenRouter: anthropic/claude-3-haiku (cheapest via OpenRouter)
 *
 * Override with AI_MODEL env var or `model` option for better quality.
 */
function getProviderConfig(provider: AIProvider): ProviderConfig {
  switch (provider) {
    case 'anthropic':
      return {
        provider: 'anthropic',
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-haiku-20240307',
        buildHeaders: apiKey => ({
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        }),
        extractContent: (data: unknown) => {
          const d = data as { content?: Array<{ text?: string }> }
          return d.content?.[0]?.text || ''
        },
      }

    case 'openrouter':
      return {
        provider: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'anthropic/claude-3-haiku',
        buildHeaders: apiKey => ({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://tiny-pivot.com',
          'X-Title': 'TinyPivot AI Data Analyst',
        }),
        extractContent: (data: unknown) => {
          const d = data as { choices?: Array<{ message?: { content?: string } }> }
          return d.choices?.[0]?.message?.content || ''
        },
      }

    case 'openai':
    default:
      return {
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
        buildHeaders: apiKey => ({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        }),
        extractContent: (data: unknown) => {
          const d = data as { choices?: Array<{ message?: { content?: string } }> }
          return d.choices?.[0]?.message?.content || ''
        },
      }
  }
}

/**
 * Normalize model name for OpenRouter
 * OpenRouter requires provider/model format (e.g., "anthropic/claude-3-haiku")
 * If user provides just a model name, try to infer the provider
 */
function normalizeModelForOpenRouter(model: string): string {
  // Already has provider prefix
  if (model.includes('/')) {
    return model
  }

  // Map common model prefixes to providers
  if (model.startsWith('claude')) {
    return `anthropic/${model}`
  }
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    return `openai/${model}`
  }
  if (model.startsWith('gemini')) {
    return `google/${model}`
  }
  if (model.startsWith('llama') || model.startsWith('codellama')) {
    return `meta-llama/${model}`
  }
  if (model.startsWith('mistral') || model.startsWith('mixtral') || model.startsWith('codestral')) {
    return `mistralai/${model}`
  }
  if (model.startsWith('deepseek')) {
    return `deepseek/${model}`
  }
  if (model.startsWith('qwen')) {
    return `qwen/${model}`
  }

  // If we can't infer, return as-is and let OpenRouter handle the error
  return model
}

// ============================================================================
// PostgreSQL Type Mapping
// ============================================================================

const PG_TYPE_MAP: Record<string, AIColumnSchema['type']> = {
  'character varying': 'string',
  'varchar': 'string',
  'character': 'string',
  'char': 'string',
  'text': 'string',
  'uuid': 'string',
  'name': 'string',
  'citext': 'string',
  'integer': 'number',
  'int': 'number',
  'int2': 'number',
  'int4': 'number',
  'int8': 'number',
  'smallint': 'number',
  'bigint': 'number',
  'decimal': 'number',
  'numeric': 'number',
  'real': 'number',
  'double precision': 'number',
  'float4': 'number',
  'float8': 'number',
  'money': 'number',
  'serial': 'number',
  'bigserial': 'number',
  'boolean': 'boolean',
  'bool': 'boolean',
  'date': 'date',
  'timestamp': 'date',
  'timestamp without time zone': 'date',
  'timestamp with time zone': 'date',
  'timestamptz': 'date',
  'time': 'date',
  'time without time zone': 'date',
  'time with time zone': 'date',
  'timetz': 'date',
  'interval': 'date',
}

// ============================================================================
// Snowflake Type Mapping
// ============================================================================

const SNOWFLAKE_TYPE_MAP: Record<string, AIColumnSchema['type']> = {
  'VARCHAR': 'string',
  'CHAR': 'string',
  'CHARACTER': 'string',
  'STRING': 'string',
  'TEXT': 'string',
  'BINARY': 'string',
  'VARBINARY': 'string',
  'NUMBER': 'number',
  'DECIMAL': 'number',
  'NUMERIC': 'number',
  'INT': 'number',
  'INTEGER': 'number',
  'BIGINT': 'number',
  'SMALLINT': 'number',
  'TINYINT': 'number',
  'BYTEINT': 'number',
  'FLOAT': 'number',
  'FLOAT4': 'number',
  'FLOAT8': 'number',
  'DOUBLE': 'number',
  'DOUBLE PRECISION': 'number',
  'REAL': 'number',
  'BOOLEAN': 'boolean',
  'DATE': 'date',
  'DATETIME': 'date',
  'TIME': 'date',
  'TIMESTAMP': 'date',
  'TIMESTAMP_LTZ': 'date',
  'TIMESTAMP_NTZ': 'date',
  'TIMESTAMP_TZ': 'date',
}

/**
 * Map a database type to AIColumnSchema type
 */
function mapDbType(dbType: string, isSnowflake: boolean): AIColumnSchema['type'] {
  if (isSnowflake) {
    // Snowflake types are usually uppercase, and may include precision like "NUMBER(38,0)"
    const baseType = dbType.toUpperCase().split('(')[0].trim()
    return SNOWFLAKE_TYPE_MAP[baseType] || 'unknown'
  }
  return PG_TYPE_MAP[dbType.toLowerCase()] || 'unknown'
}

// ============================================================================
// Table Filtering
// ============================================================================

/**
 * Check if a table name matches a pattern (string or regex)
 */
function matchesPattern(tableName: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    return tableName.toLowerCase() === pattern.toLowerCase()
  }
  return pattern.test(tableName)
}

/**
 * Filter tables based on include/exclude patterns
 */
function filterTables(
  tables: string[],
  options: TableFilterOptions,
): string[] {
  let filtered = tables

  // Apply include filter
  if (options.include && options.include.length > 0) {
    filtered = filtered.filter(table =>
      options.include!.some(pattern => matchesPattern(table, pattern)),
    )
  }

  // Apply exclude filter
  if (options.exclude && options.exclude.length > 0) {
    filtered = filtered.filter(table =>
      !options.exclude!.some(pattern => matchesPattern(table, pattern)),
    )
  }

  return filtered
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Create a unified TinyPivot handler
 *
 * This single endpoint handles:
 * - `action: 'list-tables'` - Auto-discover tables from PostgreSQL
 * - `action: 'get-schema'` - Get column schema for tables
 * - `action: 'query'` - Execute validated SELECT queries
 * - `action: 'chat'` - Proxy to AI provider
 * - `action: 'list-datasources'` - List available datasources for a user
 * - `action: 'get-datasource'` - Get datasource info
 * - `action: 'create-datasource'` - Create a new user datasource
 * - `action: 'update-datasource'` - Update a datasource
 * - `action: 'delete-datasource'` - Delete a datasource
 * - `action: 'test-datasource'` - Test datasource connection
 * - `action: 'connect-datasource'` - Connect and get schema info
 * - `action: 'query-datasource'` - Execute SQL query against a datasource
 *
 * @example
 * ```typescript
 * // Next.js App Router - app/api/tinypivot/route.ts
 * import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
 *
 * export const POST = createTinyPivotHandler()
 * ```
 *
 * @example
 * ```typescript
 * // With options
 * const handler = createTinyPivotHandler({
 *   tables: {
 *     include: ['sales', 'customers', 'products'],
 *     exclude: [/^_/, 'migrations'],
 *     descriptions: {
 *       sales: 'Sales transactions with revenue data',
 *     }
 *   }
 * })
 * ```
 */
export function createTinyPivotHandler(options: TinyPivotHandlerOptions = {}): RequestHandler {
  const {
    connectionString = process.env.DATABASE_URL,
    apiKey = process.env.AI_API_KEY,
    tables: tableOptions = {},
    maxRows,
    timeout,
    maxTokens = 2048,
    onError,
    credentialEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY,
    orgDatasources = [],
    snowflakeOAuth: snowflakeOAuthConfig,
  } = options

  // AI model priority: options.model > AI_MODEL env var > provider default
  const modelOverride = options.model || process.env.AI_MODEL

  // Default to public schema
  const schemas = tableOptions.schemas || ['public']
  const descriptions = tableOptions.descriptions || {}

  // Initialize datasource manager (lazy - only if encryption key is set)
  let datasourceManager: ReturnType<typeof createDatasourceManager> | null = null
  let pgPool: InstanceType<typeof import('pg').Pool> | null = null

  const getDatasourceManager = async () => {
    if (datasourceManager) {
      return datasourceManager
    }

    if (!credentialEncryptionKey) {
      throw new Error('CREDENTIAL_ENCRYPTION_KEY is required for datasource management')
    }

    if (!connectionString) {
      throw new Error('DATABASE_URL is required for datasource management')
    }

    const pg = await import('pg')
    pgPool = new pg.Pool({ connectionString })

    const credentialService = createCredentialService({ serverKey: credentialEncryptionKey })

    datasourceManager = createDatasourceManager({
      getPool: () => pgPool!,
      credentialService,
      orgDatasources,
    })

    return datasourceManager
  }

  return async (req: Request): Promise<Response> => {
    try {
      const body = await req.json() as TinyPivotRequest
      const { action } = body

      if (!action) {
        return createErrorResponse('Missing action parameter', 400)
      }

      switch (action) {
        case 'list-tables':
          return handleListTables(connectionString, schemas, tableOptions, descriptions, onError)

        case 'get-schema':
          // If datasourceId is provided, use datasource-aware schema fetching
          if (body.datasourceId) {
            return handleGetDatasourceSchema(
              await getDatasourceManager(),
              body.datasourceId,
              body.userId,
              body.userKey,
              body.tables || [],
              onError,
            )
          }
          return handleGetSchema(body.tables || [], connectionString, schemas, tableOptions, onError)

        case 'get-all-schemas':
          // If datasourceId is provided, use datasource-aware schema fetching
          if (body.datasourceId) {
            return handleGetAllDatasourceSchemas(
              await getDatasourceManager(),
              body.datasourceId,
              body.userId,
              body.userKey,
              onError,
            )
          }
          return handleGetAllSchemas(connectionString, schemas, tableOptions, onError)

        case 'query':
          return handleQuery(
            body.sql,
            body.table,
            connectionString,
            schemas,
            tableOptions,
            maxRows,
            timeout,
            onError,
          )

        case 'chat':
          // Client-provided apiKey takes precedence over server config
          return handleChat(
            body.messages || [],
            body.apiKey || apiKey,
            body.aiBaseUrl || options.aiBaseUrl || process.env.AI_BASE_URL,
            body.aiModel || modelOverride,
            maxTokens,
            onError,
          )

        // Datasource management actions
        case 'list-datasources':
          return handleListDatasources(await getDatasourceManager(), body.userId, onError)

        case 'get-datasource':
          return handleGetDatasource(await getDatasourceManager(), body.datasourceId, body.userId, onError)

        case 'create-datasource':
          return handleCreateDatasource(await getDatasourceManager(), body.datasourceConfig, body.userId, body.userKey, onError)

        case 'update-datasource':
          return handleUpdateDatasource(await getDatasourceManager(), body.datasourceId, body.datasourceConfig, body.userId, body.userKey, onError)

        case 'delete-datasource':
          return handleDeleteDatasource(await getDatasourceManager(), body.datasourceId, body.userId, onError)

        case 'test-datasource':
          return handleTestDatasource(await getDatasourceManager(), body.datasourceId, body.userId, body.userKey, onError)

        case 'connect-datasource':
          return handleConnectDatasource(await getDatasourceManager(), body.datasourceId, body.userId, body.userKey, onError)

        case 'query-datasource':
          return handleQueryDatasource(
            await getDatasourceManager(),
            body.datasourceId,
            body.userId,
            body.userKey,
            body.sql,
            body.maxRows,
            onError,
          )

        case 'list-datasource-tables':
          return handleListDatasourceTables(
            await getDatasourceManager(),
            body.datasourceId,
            body.userId,
            body.userKey,
            onError,
          )

        case 'query-datasource-paginated':
          return handleQueryDatasourcePaginated(
            await getDatasourceManager(),
            body.datasourceId,
            body.userId,
            body.userKey,
            body.sql,
            body.offset ?? 0,
            body.limit ?? 1000,
            onError,
          )

        // Snowflake OAuth SSO
        case 'start-snowflake-oauth':
          return handleStartSnowflakeOAuth(
            snowflakeOAuthConfig,
            credentialEncryptionKey,
            body.snowflakeDatasource,
            body.userId,
            body.userKey,
            onError,
          )

        case 'snowflake-oauth-callback':
          return handleSnowflakeOAuthCallback(
            await getDatasourceManager(),
            snowflakeOAuthConfig,
            credentialEncryptionKey,
            body.code,
            body.state,
            body.oauthError,
            body.oauthErrorDescription,
            onError,
          )

        default:
          return createErrorResponse(`Unknown action: ${action}`, 400)
      }
    }
    catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      onError?.(err)
      return createErrorResponse(err.message, 500)
    }
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

/**
 * Handle list-tables action - auto-discover tables from database
 */
async function handleListTables(
  connectionString: string | undefined,
  schemas: string[],
  tableOptions: TableFilterOptions,
  descriptions: Record<string, string>,
  onError?: (error: Error) => void,
): Promise<Response> {
  // Check if pg is available
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return createErrorResponse(
      'PostgreSQL driver (pg) is not installed. Install it with: pnpm add pg',
      500,
    )
  }

  if (!connectionString) {
    return createErrorResponse(
      'Database connection not configured. Set DATABASE_URL environment variable.',
      500,
    )
  }

  const pool = new Pool({ connectionString })

  try {
    // Query information_schema for tables
    const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ')
    const result = await pool.query(
      `
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema IN (${schemaPlaceholders})
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
      `,
      schemas,
    )

    // Extract table names
    let tableNames = result.rows.map((row: { table_name: string }) => row.table_name)

    // Apply filters
    tableNames = filterTables(tableNames, tableOptions)

    // Build response with descriptions
    const response: ListTablesResponse = {
      tables: tableNames.map(name => ({
        name,
        description: descriptions[name],
      })),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to list tables: ${err.message}`, 500)
  }
  finally {
    await pool.end()
  }
}

/**
 * Handle get-schema action - introspect table columns
 */
async function handleGetSchema(
  tables: string[],
  connectionString: string | undefined,
  schemas: string[],
  tableOptions: TableFilterOptions,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    return createErrorResponse('Missing or invalid tables array', 400)
  }

  // Check if pg is available
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return createErrorResponse(
      'PostgreSQL driver (pg) is not installed. Install it with: pnpm add pg',
      500,
    )
  }

  if (!connectionString) {
    return createErrorResponse(
      'Database connection not configured. Set DATABASE_URL environment variable.',
      500,
    )
  }

  const pool = new Pool({ connectionString })

  try {
    // First, get allowed tables from the database
    const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ')
    const tablesResult = await pool.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema IN (${schemaPlaceholders})
        AND table_type = 'BASE TABLE'
      `,
      schemas,
    )

    let allowedTables = tablesResult.rows.map((row: { table_name: string }) => row.table_name)
    allowedTables = filterTables(allowedTables, tableOptions)

    // Filter requested tables to only allowed ones
    const filteredTables = tables.filter(t =>
      allowedTables.map((a: string) => a.toLowerCase()).includes(t.toLowerCase()),
    )

    if (filteredTables.length === 0) {
      return createErrorResponse('None of the requested tables are allowed', 403)
    }

    // Get schema for each table
    const tableSchemas: AITableSchema[] = []

    for (const table of filteredTables) {
      const columnsResult = await pool.query(
        `
        SELECT 
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns 
        WHERE table_name = $1
          AND table_schema = ANY($2::text[])
        ORDER BY ordinal_position
        `,
        [table, schemas],
      )

      if (columnsResult.rows.length > 0) {
        const columns: AIColumnSchema[] = columnsResult.rows.map((row: {
          column_name: string
          data_type: string
          is_nullable: string
        }) => ({
          name: row.column_name,
          type: PG_TYPE_MAP[row.data_type.toLowerCase()] || 'unknown',
          nullable: row.is_nullable === 'YES',
        }))

        tableSchemas.push({ table, columns })
      }
    }

    const response: SchemaResponse = { schemas: tableSchemas }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to get schema: ${err.message}`, 500)
  }
  finally {
    await pool.end()
  }
}

/**
 * Handle get-all-schemas action - get schemas for ALL allowed tables at once
 * This enables the AI to understand relationships and generate JOINs
 */
async function handleGetAllSchemas(
  connectionString: string | undefined,
  schemas: string[],
  tableOptions: TableFilterOptions,
  onError?: (error: Error) => void,
): Promise<Response> {
  // Check if pg is available
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return createErrorResponse(
      'PostgreSQL driver (pg) is not installed. Install it with: pnpm add pg',
      500,
    )
  }

  if (!connectionString) {
    return createErrorResponse(
      'Database connection not configured. Set DATABASE_URL environment variable.',
      500,
    )
  }

  const pool = new Pool({ connectionString })

  try {
    // First, get all allowed tables
    const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ')
    const tablesResult = await pool.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema IN (${schemaPlaceholders})
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
      `,
      schemas,
    )

    let tableNames = tablesResult.rows.map((row: { table_name: string }) => row.table_name)
    tableNames = filterTables(tableNames, tableOptions)

    if (tableNames.length === 0) {
      const response: SchemaResponse = { schemas: [] }
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get schemas for all tables in a single query for efficiency
    const tablePlaceholders = tableNames.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const columnsResult = await pool.query(
      `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name IN (${tablePlaceholders})
        AND table_schema = ANY($${tableNames.length + 1}::text[])
      ORDER BY table_name, ordinal_position
      `,
      [...tableNames, schemas],
    )

    // Group columns by table
    const tableMap = new Map<string, AIColumnSchema[]>()
    for (const row of columnsResult.rows) {
      const tableName = row.table_name as string
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, [])
      }
      tableMap.get(tableName)!.push({
        name: row.column_name,
        type: PG_TYPE_MAP[row.data_type.toLowerCase()] || 'unknown',
        nullable: row.is_nullable === 'YES',
      })
    }

    // Build response
    const tableSchemas: AITableSchema[] = []
    for (const [tableName, columns] of tableMap) {
      tableSchemas.push({ table: tableName, columns })
    }

    const response: SchemaResponse = { schemas: tableSchemas }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to get all schemas: ${err.message}`, 500)
  }
  finally {
    await pool.end()
  }
}

/**
 * Handle query action - execute validated SELECT query
 */
async function handleQuery(
  sql: string | undefined,
  table: string | undefined,
  connectionString: string | undefined,
  schemas: string[],
  tableOptions: TableFilterOptions,
  maxRows: number | undefined,
  timeout: number | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!sql || typeof sql !== 'string') {
    return createErrorResponse('Missing or invalid SQL query', 400)
  }

  if (!table || typeof table !== 'string') {
    return createErrorResponse('Missing or invalid table name', 400)
  }

  // Check if pg is available
  let Pool: typeof import('pg').Pool
  try {
    const pg = await import('pg')
    Pool = pg.Pool
  }
  catch {
    return createErrorResponse(
      'PostgreSQL driver (pg) is not installed. Install it with: pnpm add pg',
      500,
    )
  }

  if (!connectionString) {
    return createErrorResponse(
      'Database connection not configured. Set DATABASE_URL environment variable.',
      500,
    )
  }

  const poolConfig: { connectionString: string, statement_timeout?: number } = { connectionString }
  if (timeout !== undefined) {
    poolConfig.statement_timeout = timeout
  }
  const pool = new Pool(poolConfig)

  try {
    // Get allowed tables
    const schemaPlaceholders = schemas.map((_, i) => `$${i + 1}`).join(', ')
    const tablesResult = await pool.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema IN (${schemaPlaceholders})
        AND table_type = 'BASE TABLE'
      `,
      schemas,
    )

    let allowedTables = tablesResult.rows.map((row: { table_name: string }) => row.table_name)
    allowedTables = filterTables(allowedTables, tableOptions)

    // Check if requested table is allowed
    if (!allowedTables.map((t: string) => t.toLowerCase()).includes(table.toLowerCase())) {
      return createErrorResponse(`Table "${table}" is not allowed`, 403)
    }

    // Validate SQL safety
    const validation = validateSQL(sql, allowedTables)
    if (!validation.valid) {
      return createErrorResponse(validation.error || 'Invalid SQL', 400)
    }

    // Ensure LIMIT clause if maxRows is configured
    const finalSQL = maxRows !== undefined ? ensureLimit(sql, maxRows) : sql

    // Execute query
    const startTime = Date.now()
    const result = await pool.query(finalSQL)
    const duration = Date.now() - startTime

    // Check if results were truncated (only if maxRows was set)
    const truncated = maxRows !== undefined && result.rows.length >= maxRows

    const response: QueryResponse = {
      success: true,
      data: result.rows,
      rowCount: result.rows.length,
      truncated,
      duration,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(sanitizeErrorMessage(err.message), 500)
  }
  finally {
    await pool.end()
  }
}

/**
 * Handle chat action - proxy to AI provider
 */
async function handleChat(
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
  apiKey: string | undefined,
  aiBaseUrl: string | undefined,
  modelOverride: string | undefined,
  maxTokens: number,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return createErrorResponse('Missing or invalid messages array', 400)
  }

  // Custom endpoint mode: use OpenAI-compatible format
  if (aiBaseUrl) {
    const endpoint = aiBaseUrl.endsWith('/chat/completions')
      ? aiBaseUrl
      : `${aiBaseUrl.replace(/\/$/, '')}/chat/completions`

    const model = modelOverride || 'default'

    const requestBody = {
      model,
      max_tokens: maxTokens,
      messages,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`AI provider error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      // OpenAI-compatible format
      const content = (data as { choices?: Array<{ message?: { content?: string } }> })
        .choices?.[0]
        ?.message
        ?.content || ''

      const aiResponse: AIProxyResponse = { content }

      return new Response(JSON.stringify(aiResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      onError?.(err)

      const response: AIProxyResponse = { content: '', error: err.message }
      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (!apiKey) {
    return createErrorResponse(
      'AI API key not configured. Set AI_API_KEY environment variable or provide aiBaseUrl for keyless endpoints.',
      500,
    )
  }

  // Detect provider and get config
  const provider = detectProvider(apiKey)
  const config = getProviderConfig(provider)
  let model = modelOverride || config.defaultModel

  // Normalize model name for OpenRouter (requires provider/model format)
  if (provider === 'openrouter') {
    model = normalizeModelForOpenRouter(model)
  }

  try {
    // Build request body based on provider
    let requestBody: Record<string, unknown>

    if (provider === 'anthropic') {
      // Anthropic uses a different format
      requestBody = {
        model,
        max_tokens: maxTokens,
        messages: messages.map(m => ({
          role: m.role === 'system' ? 'user' : m.role,
          content: m.content,
        })),
      }
    }
    else {
      // OpenAI / OpenRouter format
      requestBody = {
        model,
        max_tokens: maxTokens,
        messages,
      }
    }

    // Make request to AI provider
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: config.buildHeaders(apiKey),
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`AI provider error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const content = config.extractContent(data)

    const aiResponse: AIProxyResponse = { content }

    return new Response(JSON.stringify(aiResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)

    const response: AIProxyResponse = { content: '', error: err.message }
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sanitize error messages to avoid leaking sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message.replace(/postgresql?:\/\/\S+/gi, '[DATABASE_URL]')
  sanitized = sanitized.replace(/\/[^\s:]+\.(js|ts|mjs|cjs)/g, '[FILE]')
  sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]')
  if (sanitized.length > 200) {
    sanitized = `${sanitized.slice(0, 200)}...`
  }
  return sanitized
}

/**
 * Create a JSON error response
 */
function createErrorResponse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// Datasource Action Handlers
// ============================================================================

/**
 * Handle list-datasources action
 */
async function handleListDatasources(
  manager: ReturnType<typeof createDatasourceManager>,
  userId: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }

  try {
    const datasources = await manager.listDatasources(userId)
    return new Response(JSON.stringify({ datasources }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to list datasources: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle get-datasource action
 */
async function handleGetDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }

  try {
    const datasource = await manager.getDatasource(datasourceId, userId)
    if (!datasource) {
      return createErrorResponse('Datasource not found', 404)
    }
    return new Response(JSON.stringify({ datasource }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to get datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle create-datasource action
 */
async function handleCreateDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  config: TinyPivotRequest['datasourceConfig'],
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!config) {
    return createErrorResponse('datasourceConfig is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for creating datasources', 400)
  }

  try {
    const id = await manager.createDatasource(
      {
        name: config.name,
        type: config.type,
        description: config.description,
        authMethod: config.authMethod,
        connectionConfig: config.connectionConfig,
        credentials: config.credentials,
      },
      userId,
      userKey,
    )
    return new Response(JSON.stringify({ datasourceId: id, success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to create datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle update-datasource action
 */
async function handleUpdateDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  config: TinyPivotRequest['datasourceConfig'],
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!config) {
    return createErrorResponse('datasourceConfig is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for updating datasources', 400)
  }

  try {
    await manager.updateDatasource(
      datasourceId,
      {
        name: config.name,
        description: config.description,
        connectionConfig: config.connectionConfig,
        credentials: config.credentials,
      },
      userId,
      userKey,
    )
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to update datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle delete-datasource action
 */
async function handleDeleteDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }

  try {
    await manager.deleteDatasource(datasourceId, userId)
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to delete datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle test-datasource action
 */
async function handleTestDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for testing datasources', 400)
  }

  try {
    const status = await manager.testDatasource(datasourceId, userId, userKey)
    return new Response(JSON.stringify({ status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to test datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle connect-datasource action
 * Returns datasource schema information for AI Analyst context
 */
async function handleConnectDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for connecting to datasources', 400)
  }

  try {
    // Get datasource with credentials
    const datasource = await manager.getDatasourceWithCredentials(datasourceId, userId, userKey)
    if (!datasource) {
      return createErrorResponse('Datasource not found', 404)
    }

    // Test connection and get schema info
    const status = await manager.testDatasource(datasourceId, userId, userKey)
    if (!status.connected) {
      return createErrorResponse(`Connection failed: ${status.error}`, 400)
    }

    // Return connection status and basic datasource info (no credentials)
    return new Response(JSON.stringify({
      connected: true,
      datasource: {
        id: datasource.id,
        name: datasource.name,
        type: datasource.type,
        description: datasource.description,
        connectionConfig: datasource.connectionConfig,
      },
      status,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to connect to datasource: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle query-datasource action
 * Execute a SQL query against a datasource
 */
async function handleQueryDatasource(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  sql: string | undefined,
  maxRows: number | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!sql) {
    return createErrorResponse('sql is required', 400)
  }

  try {
    let result

    // Check if this is an org-tier datasource (no user auth needed)
    if (manager.isOrgDatasource(datasourceId)) {
      result = await manager.executeOrgQuery(datasourceId, sql, maxRows)
    }
    else {
      // User-tier datasource requires authentication
      if (!userId) {
        return createErrorResponse('userId is required for user-tier datasources', 400)
      }
      if (!userKey) {
        return createErrorResponse('userKey is required for user-tier datasources', 400)
      }
      result = await manager.executeQuery(datasourceId, userId, userKey, sql, maxRows)
    }

    if (!result.success) {
      return createErrorResponse(result.error || 'Query execution failed', 400)
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to execute query: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle query-datasource-paginated action
 * Execute a paginated SQL query against a datasource for infinite scroll
 */
async function handleQueryDatasourcePaginated(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  sql: string | undefined,
  offset: number,
  limit: number,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for executing queries', 400)
  }
  if (!sql) {
    return createErrorResponse('sql is required', 400)
  }

  try {
    const result = await manager.executePaginatedQuery(datasourceId, userId, userKey, sql, offset, limit)

    if (!result.success) {
      return createErrorResponse(result.error || 'Query execution failed', 400)
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to execute paginated query: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle list-datasource-tables action
 * Get available tables from a datasource
 */
async function handleListDatasourceTables(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for listing tables', 400)
  }

  try {
    const tables = await manager.listTables(datasourceId, userId, userKey)

    return new Response(JSON.stringify({ tables }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to list tables: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle get-schema action for a managed datasource
 * Get schema for specific tables from the datasource connection
 */
async function handleGetDatasourceSchema(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  tableNames: string[],
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for fetching schema', 400)
  }

  try {
    // Get datasource info to determine type for type mapping
    const dsInfo = await manager.getDatasource(datasourceId, userId)
    const isSnowflake = dsInfo?.type === 'snowflake'

    const schemas = await manager.getTableSchemas(datasourceId, userId, userKey, tableNames)

    // Convert to the expected SchemaResponse format with proper type mapping
    const response: SchemaResponse = {
      schemas: schemas.map(s => ({
        table: s.table,
        columns: s.columns.map(c => ({
          name: c.name,
          type: mapDbType(c.type, isSnowflake),
          nullable: c.nullable,
        })),
      })),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to fetch schema: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle get-all-schemas action for a managed datasource
 * Get schema for all tables from the datasource connection
 */
async function handleGetAllDatasourceSchemas(
  manager: ReturnType<typeof createDatasourceManager>,
  datasourceId: string | undefined,
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!datasourceId) {
    return createErrorResponse('datasourceId is required', 400)
  }
  if (!userId) {
    return createErrorResponse('userId is required', 400)
  }
  if (!userKey) {
    return createErrorResponse('userKey is required for fetching all schemas', 400)
  }

  try {
    // Get datasource info to determine type for type mapping
    const dsInfo = await manager.getDatasource(datasourceId, userId)
    const isSnowflake = dsInfo?.type === 'snowflake'

    const schemas = await manager.getAllTableSchemas(datasourceId, userId, userKey)

    // Convert to the expected SchemaResponse format with proper type mapping
    const response: SchemaResponse = {
      schemas: schemas.map(s => ({
        table: s.table,
        columns: s.columns.map(c => ({
          name: c.name,
          type: mapDbType(c.type, isSnowflake),
          nullable: c.nullable,
        })),
      })),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to fetch all schemas: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

// ============================================================================
// Snowflake OAuth Handlers
// ============================================================================

/**
 * State payload encoded in the OAuth state parameter
 */
interface OAuthStatePayload {
  /** Datasource name */
  name: string
  /** Datasource description */
  description?: string
  /** Snowflake account */
  account: string
  /** Warehouse */
  warehouse?: string
  /** Database */
  database?: string
  /** Schema */
  schema?: string
  /** Role */
  role?: string
  /** User ID */
  userId: string
  /** User's encryption key */
  userKey: string
  /** Timestamp for expiry check */
  timestamp: number
}

/**
 * Handle start-snowflake-oauth action
 *
 * Generates an authorization URL with encrypted state containing the datasource config.
 * The state is encrypted using the credential service so it can be decoded on callback.
 */
async function handleStartSnowflakeOAuth(
  snowflakeOAuthConfig: TinyPivotHandlerOptions['snowflakeOAuth'],
  credentialEncryptionKey: string | undefined,
  snowflakeDatasource: TinyPivotRequest['snowflakeDatasource'],
  userId: string | undefined,
  userKey: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  try {
    if (!snowflakeOAuthConfig) {
      return createErrorResponse('Snowflake OAuth is not configured', 400)
    }

    if (!credentialEncryptionKey) {
      return createErrorResponse('CREDENTIAL_ENCRYPTION_KEY is required for OAuth', 400)
    }

    if (!snowflakeDatasource) {
      return createErrorResponse('snowflakeDatasource is required', 400)
    }

    if (!userId || !userKey) {
      return createErrorResponse('userId and userKey are required', 400)
    }

    if (!snowflakeDatasource.name || !snowflakeDatasource.account) {
      return createErrorResponse('Datasource name and Snowflake account are required', 400)
    }

    // Create credential service for state encryption
    const credentialService = createCredentialService({ serverKey: credentialEncryptionKey })

    // Build state payload
    const statePayload: OAuthStatePayload = {
      name: snowflakeDatasource.name,
      description: snowflakeDatasource.description,
      account: snowflakeDatasource.account,
      warehouse: snowflakeDatasource.warehouse,
      database: snowflakeDatasource.database,
      schema: snowflakeDatasource.schema,
      role: snowflakeDatasource.role,
      userId,
      userKey,
      timestamp: Date.now(),
    }

    // Encrypt the state payload
    // Use a fixed "oauth" key since this is server-side state, not user credentials
    const encrypted = credentialService.encrypt(statePayload as unknown as Record<string, unknown>, 'oauth-state')

    // Encode as URL-safe base64
    const stateString = Buffer.from(JSON.stringify(encrypted)).toString('base64url')

    // Create OAuth helper and generate URL
    const oauth = createSnowflakeOAuth({
      account: snowflakeOAuthConfig.account,
      clientId: snowflakeOAuthConfig.clientId,
      clientSecret: snowflakeOAuthConfig.clientSecret,
      redirectUri: snowflakeOAuthConfig.redirectUri,
      scopes: snowflakeOAuthConfig.scopes,
    })

    const authorizationUrl = oauth.getAuthorizationUrl(stateString)

    return new Response(JSON.stringify({
      authorizationUrl,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createErrorResponse(`Failed to start Snowflake OAuth: ${sanitizeErrorMessage(err.message)}`, 500)
  }
}

/**
 * Handle snowflake-oauth-callback action
 *
 * Decodes the state, exchanges the authorization code for tokens,
 * and creates the datasource with the OAuth tokens.
 */
async function handleSnowflakeOAuthCallback(
  datasourceManager: ReturnType<typeof createDatasourceManager>,
  snowflakeOAuthConfig: TinyPivotHandlerOptions['snowflakeOAuth'],
  credentialEncryptionKey: string | undefined,
  code: string | undefined,
  state: string | undefined,
  oauthError: string | undefined,
  oauthErrorDescription: string | undefined,
  onError?: (error: Error) => void,
): Promise<Response> {
  try {
    // Handle OAuth error from Snowflake
    if (oauthError) {
      const errorMessage = oauthErrorDescription || oauthError
      return createOAuthCallbackResponse(false, undefined, errorMessage)
    }

    if (!snowflakeOAuthConfig) {
      return createOAuthCallbackResponse(false, undefined, 'Snowflake OAuth is not configured')
    }

    if (!credentialEncryptionKey) {
      return createOAuthCallbackResponse(false, undefined, 'Server configuration error')
    }

    if (!code || !state) {
      return createOAuthCallbackResponse(false, undefined, 'Missing code or state parameter')
    }

    // Decode and decrypt the state
    let statePayload: OAuthStatePayload
    try {
      const credentialService = createCredentialService({ serverKey: credentialEncryptionKey })
      const encrypted = JSON.parse(Buffer.from(state, 'base64url').toString())
      statePayload = credentialService.decrypt(encrypted, 'oauth-state') as unknown as OAuthStatePayload
    }
    catch {
      return createOAuthCallbackResponse(false, undefined, 'Invalid or expired OAuth state')
    }

    // Check state expiry (10 minutes)
    const stateAge = Date.now() - statePayload.timestamp
    if (stateAge > 10 * 60 * 1000) {
      return createOAuthCallbackResponse(false, undefined, 'OAuth state expired')
    }

    // Create OAuth helper and exchange code for tokens
    const oauth = createSnowflakeOAuth({
      account: snowflakeOAuthConfig.account,
      clientId: snowflakeOAuthConfig.clientId,
      clientSecret: snowflakeOAuthConfig.clientSecret,
      redirectUri: snowflakeOAuthConfig.redirectUri,
      scopes: snowflakeOAuthConfig.scopes,
    })

    const tokens = await oauth.exchangeCodeForTokens(code)

    // Create the datasource with OAuth tokens
    const datasourceId = await datasourceManager.createDatasource(
      {
        name: statePayload.name,
        type: 'snowflake',
        description: statePayload.description,
        authMethod: 'oauth_sso',
        connectionConfig: {
          account: statePayload.account,
          warehouse: statePayload.warehouse,
          database: statePayload.database,
          schema: statePayload.schema,
          role: statePayload.role,
        },
        // For OAuth, we store the username from Snowflake (will be determined by the token)
        // Password is not needed for OAuth
        credentials: {
          username: 'oauth_user', // Placeholder - actual user is in the token
        },
      },
      statePayload.userId,
      statePayload.userKey,
    )

    // Store the OAuth tokens
    await datasourceManager.storeOAuthTokens(
      datasourceId,
      statePayload.userId,
      statePayload.userKey,
      tokens.refreshToken,
      tokens.expiresAt,
    )

    return createOAuthCallbackResponse(true, datasourceId)
  }
  catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    return createOAuthCallbackResponse(false, undefined, sanitizeErrorMessage(err.message))
  }
}

/**
 * Create an OAuth callback HTML response
 *
 * Returns HTML that posts a message to the parent window and closes itself.
 */
function createOAuthCallbackResponse(
  success: boolean,
  datasourceId?: string,
  error?: string,
): Response {
  const messageData = JSON.stringify({ success, datasourceId, error })

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Snowflake Authentication</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .message {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    p { color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="message">
    ${success
        ? '<h2 class="success">✓ Connected</h2><p>You can close this window.</p>'
        : `<h2 class="error">✗ Connection Failed</h2><p>${escapeHtmlForCallback(error || 'Unknown error')}</p>`
    }
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(${messageData}, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}

/**
 * Escape HTML to prevent XSS in callback page
 */
function escapeHtmlForCallback(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
