/**
 * TinyPivot Server - SQL Validation
 * Ensures queries are safe and read-only
 */

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * List of SQL keywords that indicate data modification
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
]

/**
 * Keywords that are dangerous even in SELECT context
 */
const DANGEROUS_PATTERNS = [
  /INTO\s+(?:OUTFILE|DUMPFILE)/i, // File operations
  /LOAD\s+DATA/i, // File loading
  /;\s*(?:INSERT|UPDATE|DELETE|DROP)/i, // Statement injection
]

/**
 * Validate that a SQL query is safe to execute
 */
export function validateSQL(
  sql: string,
  allowedTables: string[],
): ValidationResult {
  const trimmedSQL = sql.trim()
  const upperSQL = trimmedSQL.toUpperCase()

  // Must start with SELECT or WITH (for CTEs)
  if (!upperSQL.startsWith('SELECT') && !upperSQL.startsWith('WITH')) {
    return {
      valid: false,
      error: 'Only SELECT queries (including CTEs with WITH) are allowed',
    }
  }

  // If it starts with WITH, ensure it ends with a SELECT
  if (upperSQL.startsWith('WITH')) {
    // Check that there's a final SELECT after the CTEs
    // CTEs pattern: WITH ... AS (...), ... AS (...) SELECT ...
    if (!upperSQL.includes('SELECT')) {
      return {
        valid: false,
        error: 'CTE queries must include a final SELECT statement',
      }
    }
  }

  // Check for forbidden keywords (as whole words)
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(trimmedSQL)) {
      return {
        valid: false,
        error: `Query contains forbidden keyword: ${keyword}`,
      }
    }
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmedSQL)) {
      return {
        valid: false,
        error: 'Query contains dangerous pattern',
      }
    }
  }

  // Check for multiple statements
  const statements = trimmedSQL.split(';').filter(s => s.trim().length > 0)
  if (statements.length > 1) {
    return {
      valid: false,
      error: 'Multiple statements are not allowed',
    }
  }

  // Check for comments that could hide malicious code
  if (/--/.test(trimmedSQL) || /\/\*/.test(trimmedSQL)) {
    return {
      valid: false,
      error: 'SQL comments are not allowed',
    }
  }

  // Extract table names from the query
  const extractedTables = extractTableNames(trimmedSQL)

  // Validate tables against whitelist
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
 * Extract table names from a SELECT query
 * This is a simplified parser - for production, consider using a proper SQL parser
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
 * Add LIMIT clause if not present
 */
export function ensureLimit(sql: string, maxRows: number): string {
  // Check if LIMIT already exists
  if (/\bLIMIT\s+\d+/i.test(sql)) {
    // Extract existing limit and ensure it doesn't exceed maxRows
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i)
    if (limitMatch) {
      const existingLimit = Number.parseInt(limitMatch[1], 10)
      if (existingLimit > maxRows) {
        // Replace with maxRows
        return sql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxRows}`)
      }
    }
    return sql
  }

  // Add LIMIT clause before any trailing semicolon or whitespace
  const trimmed = sql.replace(/;\s*$/, '').trim()
  return `${trimmed} LIMIT ${maxRows}`
}

/**
 * Build a paginated query by removing existing LIMIT/OFFSET and adding new ones
 * Fetches limit + 1 rows to detect if there are more results
 */
export function buildPaginatedQuery(sql: string, offset: number, limit: number): string {
  // Remove any trailing semicolon and whitespace
  let trimmed = sql.replace(/;\s*$/, '').trim()

  // Remove existing LIMIT and OFFSET clauses (case insensitive)
  // Handle both "LIMIT x" and "LIMIT x OFFSET y" patterns
  trimmed = trimmed.replace(/\bLIMIT\s+\d+(?:\s+OFFSET\s+\d+)?/gi, '').trim()
  // Also handle "OFFSET x LIMIT y" pattern (some SQL variants)
  trimmed = trimmed.replace(/\bOFFSET\s+\d+(?:\s+LIMIT\s+\d+)?/gi, '').trim()

  // Add LIMIT (limit + 1 to detect hasMore) and OFFSET
  return `${trimmed} LIMIT ${limit + 1} OFFSET ${offset}`
}
