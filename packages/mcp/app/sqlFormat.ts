import { format } from 'sql-formatter'

/**
 * SQL as the Studio shows it: DuckDB dialect, keywords in capitals, one clause per line. A query
 * the formatter cannot read (a dialect corner it does not know) is shown exactly as written.
 */
export function formatSql(sql: string): string {
  try {
    return format(sql, { language: 'duckdb', keywordCase: 'upper', functionCase: 'lower', tabWidth: 2 })
  }
  catch {
    return sql.trim()
  }
}

/** The query on one line, for a step's summary before it is opened. */
export function sqlOneLine(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}
