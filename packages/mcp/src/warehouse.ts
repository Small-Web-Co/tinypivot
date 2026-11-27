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
  /** Short id, also the history kind of its pulls: `postgres`, `bigquery`. */
  id: 'postgres' | 'bigquery'
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
  /** Tables the model may query, as it should name them in SQL. */
  listTables: () => Promise<string[]>
  /** Checks the SQL is a single read-only SELECT within limits, then runs it. Throws with a reason if not. */
  query: (sql: string) => Promise<WarehouseQueryResult>
}

/** What to tell the model when a result was cut: aggregate where the data lives instead. */
export function truncationNote(connector: Pick<WarehouseConnector, 'label' | 'maxRows'>): string {
  return `\n_Result cut at ${connector.maxRows.toLocaleString('en-US')} rows, so totals over it would be wrong. Aggregate in the ${connector.label} SQL (GROUP BY, SUM, COUNT) so the full table is counted where it lives._`
}

/** Splits a comma-separated environment variable into trimmed, non-empty entries. */
export function listFromEnv(value: string | undefined): string[] | undefined {
  const items = value?.split(',').map(s => s.trim()).filter(Boolean)
  return items && items.length > 0 ? items : undefined
}
