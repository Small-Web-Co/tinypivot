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
import type { AIColumnSchema, AIProxyResponse, AITableSchema, QueryResponse, SchemaResponse } from '@smallwebco/tinypivot-core'
import type { RequestHandler } from './types'
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
}

/**
 * Request body for the unified endpoint
 */
export interface TinyPivotRequest {
  /** Action to perform */
  action: 'list-tables' | 'get-schema' | 'get-all-schemas' | 'query' | 'chat'

  // For get-schema
  tables?: string[]

  // For query
  sql?: string
  table?: string

  // For chat
  messages?: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
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
  } = options

  // AI model priority: options.model > AI_MODEL env var > provider default
  const modelOverride = options.model || process.env.AI_MODEL

  // Default to public schema
  const schemas = tableOptions.schemas || ['public']
  const descriptions = tableOptions.descriptions || {}

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
          return handleGetSchema(body.tables || [], connectionString, schemas, tableOptions, onError)

        case 'get-all-schemas':
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
          return handleChat(body.messages || [], apiKey, modelOverride, maxTokens, onError)

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
  modelOverride: string | undefined,
  maxTokens: number,
  onError?: (error: Error) => void,
): Promise<Response> {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return createErrorResponse('Missing or invalid messages array', 400)
  }

  if (!apiKey) {
    return createErrorResponse(
      'AI API key not configured. Set AI_API_KEY environment variable.',
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
