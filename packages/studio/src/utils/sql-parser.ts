/**
 * SQL Parser Utilities
 * Functions for parsing and manipulating SQL queries
 */

/**
 * Result of extracting tables from SQL
 */
export interface ExtractedTable {
  /** Table name (without schema) */
  name: string
  /** Schema name if provided */
  schema?: string
  /** Full qualified name (schema.table or just table) */
  fullName: string
  /** Type of reference (from, join) */
  type: 'from' | 'join'
}

/**
 * Extract table names from a SQL query
 * Handles FROM clauses, various JOIN types, and schema-qualified names
 * @param sql - The SQL query to parse
 * @returns Array of extracted table information
 */
export function extractTablesFromSQL(sql: string): ExtractedTable[] {
  const tables: ExtractedTable[] = []
  const seen = new Set<string>()

  // Normalize whitespace and handle line breaks
  const normalizedSql = sql.replace(/\s+/g, ' ').trim()

  // Pattern to match table references after FROM and JOIN keywords
  // Handles: table, schema.table, "table", "schema"."table", [table], [schema].[table]
  // Uses non-capturing group for optional alias since we don't need it
  const tablePattern = /(?:FROM|(?:LEFT|RIGHT|INNER|OUTER|CROSS|FULL)?\s*JOIN)\s+(?:(\[?\w+\]?|"\w+")\.)?(\[?\w+\]?|"\w+")(?:\s+(?:AS\s+)?\w+)?/gi

  let match: RegExpExecArray | null
  while ((match = tablePattern.exec(normalizedSql)) !== null) {
    const schemaRaw = match[1]
    const tableRaw = match[2]

    // Remove quotes and brackets from names
    const schema = schemaRaw ? schemaRaw.replace(/[[\]"]/g, '') : undefined
    const name = tableRaw.replace(/[[\]"]/g, '')
    const fullName = schema ? `${schema}.${name}` : name

    // Determine if this is a FROM or JOIN
    const matchText = match[0].toUpperCase()
    const type: 'from' | 'join' = matchText.includes('JOIN') ? 'join' : 'from'

    // Avoid duplicates
    if (!seen.has(fullName.toLowerCase())) {
      seen.add(fullName.toLowerCase())
      tables.push({ name, schema, fullName, type })
    }
  }

  return tables
}

/**
 * Value type for SQL injection
 */
export type SQLValue = string | number | boolean | null | Date | Array<string | number>

/**
 * Escape and format a value for use in SQL
 * @param value - The value to format
 * @returns Formatted SQL string
 */
function formatSQLValue(value: SQLValue): string {
  if (value === null) {
    return 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (value instanceof Date) {
    // Format as ISO string for SQL
    return `'${value.toISOString()}'`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Handle empty array - return impossible condition
      return '(NULL)'
    }
    const formattedValues = value.map((v) => {
      if (typeof v === 'number') {
        return String(v)
      }
      // Escape single quotes by doubling them
      return `'${String(v).replace(/'/g, '\'\'')}'`
    })
    return `(${formattedValues.join(', ')})`
  }

  // String value - escape single quotes
  return `'${String(value).replace(/'/g, '\'\'')}'`
}

/**
 * Inject a WHERE clause into a SQL query
 * If the query already has a WHERE clause, adds the condition with AND
 * Properly handles GROUP BY, ORDER BY, LIMIT, and other trailing clauses
 * @param sql - The SQL query to modify
 * @param field - The field name to filter on
 * @param value - The value to filter by
 * @returns Modified SQL query with the WHERE clause
 */
export function injectWhereClause(
  sql: string,
  field: string,
  value: SQLValue,
): string {
  // Normalize whitespace while preserving structure
  const normalizedSql = sql.replace(/\s+/g, ' ').trim()

  // Build the condition
  let condition: string
  if (value === null) {
    condition = `${field} IS NULL`
  }
  else if (Array.isArray(value)) {
    if (value.length === 0) {
      // Empty array means no matches - return impossible condition
      condition = '1 = 0'
    }
    else {
      condition = `${field} IN ${formatSQLValue(value)}`
    }
  }
  else {
    condition = `${field} = ${formatSQLValue(value)}`
  }

  // Find the position to insert/modify WHERE clause
  // Look for existing WHERE clause (case-insensitive)
  const whereMatch = /\bWHERE\b/i.exec(normalizedSql)

  if (whereMatch) {
    // WHERE clause exists - find where it ends
    // It ends at GROUP BY, HAVING, ORDER BY, LIMIT, UNION, INTERSECT, EXCEPT, or end of string
    const afterWhere = normalizedSql.substring(whereMatch.index + 5)
    const endClauseMatch = /\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|FETCH|FOR)\b/i.exec(afterWhere)

    if (endClauseMatch) {
      // Insert AND condition before the end clause
      const insertPosition = whereMatch.index + 5 + endClauseMatch.index
      return (
        `${normalizedSql.substring(0, insertPosition).trim()
        } AND ${condition} ${
          normalizedSql.substring(insertPosition)}`
      )
    }
    else {
      // No end clause - append to end
      return `${normalizedSql} AND ${condition}`
    }
  }
  else {
    // No WHERE clause - need to insert one
    // Find the position after FROM clause and joins, but before GROUP BY, ORDER BY, etc.
    const insertBeforeMatch = /\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|FETCH|FOR)\b/i.exec(normalizedSql)

    if (insertBeforeMatch) {
      return (
        `${normalizedSql.substring(0, insertBeforeMatch.index).trim()
        } WHERE ${condition} ${
          normalizedSql.substring(insertBeforeMatch.index)}`
      )
    }
    else {
      // No trailing clauses - append WHERE to end
      return `${normalizedSql} WHERE ${condition}`
    }
  }
}
