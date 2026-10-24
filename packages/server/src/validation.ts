/**
 * TinyPivot Server - SQL Validation
 * Ensures queries are safe and read-only
 *
 * Validation is parser-based: the query is parsed into an AST, every table
 * reference (including CTEs and nested subqueries) is checked against the
 * allowed-table list, and every function call is checked against a denylist
 * of functions that can read files, reach the network, or disrupt the server.
 *
 * `strict` (default `false`) controls what happens when a query cannot be
 * parsed. In non-strict mode we fall back to the previous keyword heuristics
 * so that exotic-but-valid PostgreSQL syntax keeps working; in strict mode the
 * query is rejected (fail closed). Either way the database session used for
 * `action: 'query'` is opened READ ONLY, which is the backstop for writes.
 */

import { parse } from 'pgsql-ast-parser'

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ValidationOptions {
  /**
   * Reject queries the parser cannot understand instead of falling back to
   * keyword heuristics. Default: `false` (preserves compatibility).
   */
  strict?: boolean
}

/**
 * List of SQL keywords that indicate data modification.
 * Only used by the legacy fallback path.
 */
const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'UPSERT',
  'REPLACE',
  'CALL',
  'SET',
  'LOCK',
  'UNLOCK',
  'COPY',
]

/**
 * Keywords that are dangerous even in SELECT context.
 * Only used by the legacy fallback path.
 */
const DANGEROUS_PATTERNS = [
  /INTO\s+(?:OUTFILE|DUMPFILE)/i, // File operations
  /LOAD\s+DATA/i, // File loading
  /;\s*(?:INSERT|UPDATE|DELETE|DROP)/i, // Statement injection
]

/**
 * Functions that must never be reachable from a user query.
 * These can read or write server files, open outbound connections, change
 * session configuration (e.g. `search_path`, which would defeat the table
 * allowlist), or hold/kill server resources.
 */
const FORBIDDEN_FUNCTIONS = new Set([
  // File system access
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_logdir_ls',
  'lo_import',
  'lo_export',
  'lo_unlink',
  // Network access
  'dblink',
  'dblink_connect',
  'dblink_connect_u',
  'dblink_exec',
  'dblink_open',
  'dblink_fetch',
  'dblink_close',
  'dblink_disconnect',
  'inet_server_addr',
  // Resource disruption
  'pg_sleep',
  'pg_sleep_for',
  'pg_sleep_until',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'pg_create_restore_point',
  'pg_switch_wal',
  'pg_promote',
  'pg_drop_replication_slot',
  'pg_create_physical_replication_slot',
  'pg_create_logical_replication_slot',
  // Session / configuration mutation
  'set_config',
  'pg_advisory_lock',
  'pg_advisory_xact_lock',
])

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

type AstNode = Record<string, unknown>

/**
 * Walk every node of a parsed AST (depth-first, including arrays).
 */
function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walkAst(child, visit)
    }
    return
  }

  if (!node || typeof node !== 'object') {
    return
  }

  const astNode = node as AstNode
  visit(astNode)

  for (const key of Object.keys(astNode)) {
    if (key === 'type') {
      continue
    }
    walkAst(astNode[key], visit)
  }
}

interface TableRef {
  name: string
  schema?: string
}

interface AstSummary {
  tables: TableRef[]
  functions: string[]
  cteNames: Set<string>
  /** Types of statements found inside CTEs (only SELECT/WITH are allowed). */
  cteStatementTypes: string[]
}

/**
 * Summarize everything security-relevant in a parsed statement.
 */
function summarizeStatement(statement: AstNode): AstSummary {
  const tables: TableRef[] = []
  const functions: string[] = []
  const cteNames = new Set<string>()
  const cteStatementTypes: string[] = []

  walkAst(statement, (node) => {
    const type = node.type

    if (type === 'table') {
      const name = node.name as { name?: unknown, schema?: unknown } | undefined
      if (name && typeof name.name === 'string') {
        tables.push({
          name: name.name,
          schema: typeof name.schema === 'string' ? name.schema : undefined,
        })
      }
      return
    }

    if (type === 'call') {
      const fn = node.function as { name?: unknown } | undefined
      if (fn && typeof fn.name === 'string') {
        functions.push(fn.name)
      }
      return
    }

    if (type === 'with' && Array.isArray(node.bind)) {
      for (const bind of node.bind as AstNode[]) {
        const alias = bind.alias as { name?: unknown } | undefined
        if (alias && typeof alias.name === 'string') {
          cteNames.add(alias.name.toLowerCase())
        }
        const inner = bind.statement as AstNode | undefined
        if (inner && typeof inner.type === 'string') {
          cteStatementTypes.push(inner.type)
        }
      }
    }
  })

  return {
    tables,
    functions,
    cteNames,
    cteStatementTypes,
  }
}

/**
 * Read the LIMIT of the outermost SELECT.
 */
function getTopLevelLimit(statement: AstNode): { present: boolean, value?: number } {
  const select = statement.type === 'with'
    ? (statement.in as AstNode | undefined)
    : statement

  if (!select || select.type !== 'select' || !select.limit) {
    return { present: false }
  }

  const limit = select.limit as { limit?: { type?: string, value?: unknown, name?: unknown } }
  const value = limit.limit
  if (!value) {
    return { present: true }
  }

  if (value.type === 'integer' && typeof value.value === 'number') {
    return { present: true, value: value.value }
  }

  // LIMIT ALL
  if (value.type === 'ref' && String(value.name ?? '').toLowerCase() === 'all') {
    return { present: true, value: Number.POSITIVE_INFINITY }
  }

  // LIMIT $1 and other expressions - present but not a fixed number.
  return { present: true }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a SQL query is safe to execute.
 *
 * @param sql - The query to validate
 * @param allowedTables - Table names the caller is allowed to read
 * @param options - `strict: true` rejects queries that cannot be parsed
 */
export function validateSQL(
  sql: string,
  allowedTables: string[],
  options: ValidationOptions = {},
): ValidationResult {
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return { valid: false, error: 'SQL query is required' }
  }

  const trimmedSQL = sql.trim()

  // Fast, friendly rejections (kept for clear error messages)
  if (/--/.test(trimmedSQL) || /\/\*/.test(trimmedSQL)) {
    return { valid: false, error: 'SQL comments are not allowed' }
  }

  let statements: unknown[]
  try {
    statements = parse(trimmedSQL) as unknown[]
  }
  catch {
    if (options.strict) {
      return {
        valid: false,
        error: 'Unable to parse SQL query. Only standard read-only SELECT statements are supported.',
      }
    }
    return validateSQLLegacy(trimmedSQL, allowedTables)
  }

  if (!Array.isArray(statements) || statements.length === 0) {
    return { valid: false, error: 'Empty SQL query' }
  }

  if (statements.length > 1) {
    return { valid: false, error: 'Multiple statements are not allowed' }
  }

  const statement = statements[0] as AstNode
  const body = statement.type === 'with'
    ? (statement.in as AstNode | undefined)
    : statement

  if (!body || body.type !== 'select') {
    return {
      valid: false,
      error: 'Only SELECT queries (including CTEs with WITH) are allowed',
    }
  }

  const summary = summarizeStatement(statement)

  // Data-modifying CTEs (WITH x AS (INSERT ... RETURNING ...) SELECT ...)
  const invalidCte = summary.cteStatementTypes.find(
    type => type !== 'select' && type !== 'with',
  )
  if (invalidCte) {
    return {
      valid: false,
      error: 'Only SELECT statements are allowed inside WITH clauses',
    }
  }

  // Forbidden functions
  for (const fn of summary.functions) {
    if (FORBIDDEN_FUNCTIONS.has(fn.toLowerCase())) {
      return {
        valid: false,
        error: `Function "${fn}" is not allowed`,
      }
    }
  }

  // Table allowlist — every table reference, at any nesting depth
  const normalizedAllowed = new Set(allowedTables.map(t => t.toLowerCase()))

  for (const table of summary.tables) {
    const name = table.name.toLowerCase()
    if (summary.cteNames.has(name)) {
      continue
    }
    if (!normalizedAllowed.has(name)) {
      const qualified = table.schema ? `${table.schema}.${table.name}` : table.name
      return {
        valid: false,
        error: `Table "${qualified}" is not in the allowed list`,
      }
    }
  }

  return { valid: true }
}

/**
 * Previous heuristic validation, used when the parser cannot understand the
 * query (non-strict mode). Keeps behaviour identical to earlier releases
 * while still blocking the known-dangerous functions by name.
 */
function validateSQLLegacy(
  sql: string,
  allowedTables: string[],
): ValidationResult {
  const upperSQL = sql.toUpperCase()

  // Must start with SELECT or WITH (for CTEs)
  if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
    return {
      valid: false,
      error: 'Only SELECT queries (including CTEs with WITH) are allowed',
    }
  }

  // If it starts with WITH, ensure it ends with a SELECT
  if (upperSQL.startsWith('WITH') && !upperSQL.includes('SELECT')) {
    return {
      valid: false,
      error: 'CTE queries must include a final SELECT statement',
    }
  }

  // Check for forbidden keywords (as whole words)
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(sql)) {
      return {
        valid: false,
        error: `Query contains forbidden keyword: ${keyword}`,
      }
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      return { valid: false, error: 'Query contains dangerous pattern' }
    }
  }

  // Check for multiple statements
  const statements = sql.split(';').filter(s => s.trim().length > 0)
  if (statements.length > 1) {
    return { valid: false, error: 'Multiple statements are not allowed' }
  }

  // Block known-dangerous functions by name
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${fn}\\s*\\(`, 'i').test(sql)) {
      return { valid: false, error: `Function "${fn}" is not allowed` }
    }
  }

  // Validate tables against whitelist
  const extractedTables = extractTableNames(sql)
  const normalizedAllowed = allowedTables.map(t => t.toLowerCase())
  for (const table of extractedTables) {
    if (!normalizedAllowed.includes(table.toLowerCase())) {
      return {
        valid: false,
        error: `Table "${table}" is not in the allowed list`,
      }
    }
  }

  return { valid: true }
}

/**
 * Extract top-level table names from a SELECT query.
 * This is a simplified parser - prefer `validateSQL`, which understands
 * nested subqueries and CTEs.
 */
export function extractTableNames(sql: string): string[] {
  const tables: string[] = []

  // Match FROM clause
  const fromMatch = sql.match(/\bFROM\s+([a-z_]\w*(?:\s*,\s*[a-z_]\w*)*)/i)
  if (fromMatch) {
    const fromTables = fromMatch[1].split(',').map(t => t.trim())
    tables.push(...fromTables)
  }

  // Match JOIN clauses
  const joinRegex = /\b(?:LEFT|RIGHT|INNER|OUTER|CROSS|FULL)?\s*JOIN\s+([a-z_]\w*)/gi
  let match
  while ((match = joinRegex.exec(sql)) !== null) {
    tables.push(match[1])
  }

  // Remove duplicates and clean up
  return [...new Set(tables.map(t => t.replace(/["`]/g, '')))]
}

/**
 * Sanitize a table name to prevent SQL injection
 */
export function sanitizeTableName(name: string): string {
  // Only allow alphanumeric and underscores
  return name.replace(/\W/g, '')
}

/**
 * Cap the number of rows a query can return.
 *
 * Uses the parser to find an existing outer LIMIT (so a LIMIT buried in a
 * subquery can no longer be mistaken for the outer one), and wraps the query
 * when the existing limit is larger than the cap.
 */
export function ensureLimit(sql: string, maxRows: number): string {
  const trimmed = sql.replace(/;\s*$/, '').trim()
  const cap = Math.max(1, Math.trunc(maxRows))
  const wrap = () => `SELECT * FROM (${trimmed}) AS tinypivot_limited LIMIT ${cap}`

  try {
    const statements = parse(trimmed) as unknown[]
    if (statements.length === 1) {
      const info = getTopLevelLimit(statements[0] as AstNode)

      if (!info.present) {
        return `${trimmed} LIMIT ${cap}`
      }

      if (typeof info.value === 'number' && info.value <= cap) {
        return trimmed
      }

      // Existing limit exceeds the cap, is LIMIT ALL, or is an expression we
      // cannot evaluate (e.g. LIMIT $1) - wrap to enforce the cap.
      return wrap()
    }
  }
  catch {
    // Parser could not handle the query - fall back to the legacy regex.
    const limitMatch = trimmed.match(/\bLIMIT\s+(\d+)/i)
    if (limitMatch) {
      const legacyLimit = Number.parseInt(limitMatch[1], 10)
      return legacyLimit > cap ? wrap() : trimmed
    }
    if (/\bLIMIT\s+(?:ALL|\$\d+)\b/i.test(trimmed)) {
      return wrap()
    }
    return `${trimmed} LIMIT ${cap}`
  }

  return `${trimmed} LIMIT ${cap}`
}
