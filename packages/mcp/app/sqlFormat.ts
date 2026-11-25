import { format } from 'sql-formatter'

/**
 * SQL formatted in the browser: DuckDB dialect, keywords in capitals, one clause per line. The
 * Studio prefers SQLFluff's layout from the server; this is the fallback without it. A query the
 * formatter cannot read (a dialect corner it does not know) is shown exactly as written.
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

/** A step's SQL as the Studio shows it: SQLFluff's layout when the server has it, else formatted here. */
export function shownSql(step: { editableSql?: string, formattedSql?: string }): string {
  return step.formattedSql ?? (step.editableSql ? formatSql(step.editableSql) : '')
}

/** A name as SQL must write it: quoted when it is not a plain identifier (e.g. it starts with a digit). */
export function sqlName(name: string): string {
  return /^[a-z_]\w*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`
}
