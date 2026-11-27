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

/** The little dialect the Pro audit probes need to write portable SQL for a database. */
export interface SqlDialect {
  /** A column name as this database reads it in a probe. */
  quoteName: (name: string) => string
  /** A median aggregate of `expr`; omitted when the database has none, which skips the outlier audit. */
  median?: (expr: string) => string
}

/** Backticked names, for BigQuery, Databricks, ClickHouse and MySQL. */
export function backtickName(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``
}

/** Names left as the query wrote them, for Postgres and Snowflake: quoting would make them case-sensitive and stop matching. */
export function plainName(name: string): string {
  return name
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
  /** How audit probes name columns and take a median here. */
  dialect: SqlDialect
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

/** What each kind of token is blanked to: comments to a space, quotes to an empty pair of the same quote. */
const MASK_TOKENS: Array<[pattern: RegExp, mask: string]> = [
  [/\$\$[\s\S]*?\$\$/, ' '],
  [/--[^\n]*/, ' '],
  [/\/\*[\s\S]*?\*\//, ' '],
  [/'(?:[^'\\]|\\.|'')*'/, '\'\''],
  [/"(?:[^"]|"")*"/, '""'],
  [/`[^`]*`/, '``'],
]

/**
 * The SQL with comments, string literals and quoted names blanked out, so only its keywords remain.
 * One left-to-right pass, as a database reads it, so a comment marker inside a string (`'--'`)
 * cannot hide the code after the string. `lineComment` adds a dialect's own line comment, e.g. `#`.
 */
export function maskSql(sql: string, lineComment?: RegExp): string {
  const tokens = lineComment ? [...MASK_TOKENS, [lineComment, ' '] as [RegExp, string]] : MASK_TOKENS
  const any = new RegExp(tokens.map(([pattern]) => `(${pattern.source})`).join('|'), 'g')
  return sql.replace(any, (...groups: string[]) => tokens[groups.slice(1, tokens.length + 1).findIndex(Boolean)][1])
}

/**
 * Why `sql` is not a single read-only SELECT, or undefined when it is. A first gate for databases
 * without a dry run of their own; each connector adds its database's own checks behind it.
 * `lineComment` is the dialect's extra line comment, as for `maskSql`.
 */
export function readOnlyStatementError(sql: string, lineComment?: RegExp): string | undefined {
  const masked = maskSql(sql, lineComment).trim().replace(/;\s*$/, '')
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
