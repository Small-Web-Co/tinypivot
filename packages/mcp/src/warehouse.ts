/**
 * A database or warehouse TinyPivot queries directly, read-only, without the agent exporting a
 * file first. The SQL runs where the data lives; only the result comes back.
 */

export interface WarehouseQueryResult {
  rows: Record<string, unknown>[]
  /** True when the result had more rows than the connector returns, and was cut. */
  truncated: boolean
  /** One plain-language line about the run, e.g. how much data it scanned. */
  note?: string
}

export interface WarehouseConnector {
  /** Short id, also the history kind of its pulls. */
  id: 'postgres' | 'bigquery' | 'snowflake' | 'databricks' | 'mysql' | 'clickhouse'
  /** Name shown to people and the model: `PostgreSQL`, `BigQuery`. */
  label: string
  /** The MCP tool that queries it, e.g. `query_bigquery`. */
  toolName: string
  /** One sentence on how to write SQL for it, for the tool description. */
  sqlHint: string
  /** How a Free user can still use this data, for the upgrade message. */
  freeAlternative: string
  /** The most rows one query returns. */
  maxRows: number
  /** Not yet tested against a live account: the tool says so, so people know to report problems. */
  preview?: boolean
  /** Tables the model may query, as it should name them in SQL. */
  listTables: () => Promise<string[]>
  /** Checks the SQL is a single read-only SELECT within limits, then runs it. Throws with a reason if not. */
  query: (sql: string) => Promise<WarehouseQueryResult>
}

/** A query the connector refused before running it: the connection is fine, the SQL is not. */
export class QueryRefused extends Error {}

/** What to tell the model when a result was cut: aggregate where the data lives instead. */
export function truncationNote(connector: Pick<WarehouseConnector, 'label' | 'maxRows'>): string {
  return `\n_Result cut at ${connector.maxRows.toLocaleString('en-US')} rows, so totals over it would be wrong. Aggregate in the ${connector.label} SQL (GROUP BY, SUM, COUNT) so the full table is counted where it lives._`
}

/** Statement words that change data, objects or access, refused anywhere in a query. */
const WRITE_WORDS = ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', 'CALL', 'COPY', 'UNDROP', 'EXECUTE', 'REPLACE INTO']

/** The SQL with comments, string literals and quoted names blanked out, so only its keywords remain. */
export function maskSql(sql: string): string {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, '\'\'')
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/`[^`]*`/g, '``')
}

/**
 * Why `sql` is not a single read-only SELECT, or undefined when it is. A first gate for databases
 * without a dry run of their own; each connector adds its database's own checks behind it.
 */
export function readOnlyStatementError(sql: string): string | undefined {
  const masked = maskSql(sql).trim().replace(/;\s*$/, '')
  if (!masked)
    return 'The SQL is empty.'
  if (masked.includes(';'))
    return 'Send one statement at a time.'
  if (!/^\(*\s*(?:SELECT|WITH)\b/i.test(masked))
    return 'Only a read-only SELECT (or WITH … SELECT) can run here.'
  const write = WRITE_WORDS.find(word => new RegExp(`\\b${word.replace(' ', '\\s+')}\\b`, 'i').test(masked))
  if (write)
    return `${write} is not allowed: this connection only reads.`
  if (/\bSYSTEM\$/i.test(masked))
    return 'System functions (SYSTEM$…) are not allowed.'
  return undefined
}

/** Splits a comma-separated environment variable into trimmed, non-empty entries. */
export function listFromEnv(value: string | undefined): string[] | undefined {
  const items = value?.split(',').map(s => s.trim()).filter(Boolean)
  return items && items.length > 0 ? items : undefined
}
