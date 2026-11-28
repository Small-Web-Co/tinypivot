import type { WarehouseConnector, WarehouseTableSchema } from './warehouse.js'
import { levenshtein } from './audit.js'

/**
 * Deterministic SQL repair hints for warehouse query errors: maps common DuckDB / Postgres /
 * T-SQL / window-function mistakes to exact fixes for BigQuery, Snowflake, Databricks, Postgres,
 * ClickHouse and MySQL, plus Levenshtein column-name suggestions from cached metadata.
 */

const MISSING_COL_PATTERNS = [
  /Name\s+([A-Z_][\w$]*)\s+not\s+found\s+inside/i,
  /Unrecognized\s+name:\s*([A-Z_][\w$]*)/i,
  /column\s+"([^"]+)"\s+does\s+not\s+exist/i,
  /invalid\s+identifier\s+'([^']+)'/i,
  /Unknown\s+column\s+'([^']+)'/i,
  /Cannot\s+resolve\s+column\s+name\s+"([^"]+)"/i,
  /with\s+name\s+[`'"]([^`'"]+)[`'"]\s+cannot\s+be\s+resolved/i,
  /Missing\s+columns:\s*'([^']+)'/i,
  /Unknown\s+expression\s+(?:or\s+function\s+)?identifier\s+[`'"]([^`'"]+)[`'"]/i,
]

function extractMissingColumn(errorMessage: string): string | undefined {
  for (const re of MISSING_COL_PATTERNS) {
    const m = re.exec(errorMessage)
    if (m?.[1])
      return m[1].split('.').pop()
  }
  return undefined
}

function closestColumnsHint(badCol: string, schemas: WarehouseTableSchema[]): string | undefined {
  const seen = new Set<string>()
  const allCols: Array<{ table: string, col: string }> = []
  for (const s of schemas) {
    for (const c of s.columns) {
      const key = `${s.name.toLowerCase()}\0${c.name.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        allCols.push({ table: s.name, col: c.name })
      }
    }
  }
  if (allCols.length === 0)
    return undefined
  const lower = badCol.toLowerCase()
  const ranked = allCols
    .map(entry => ({ ...entry, dist: levenshtein(lower, entry.col.toLowerCase()) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4)
  const threshold = Math.max(3, Math.floor(badCol.length * 0.6))
  const close = ranked.filter(r => r.dist <= threshold)
  if (close.length === 0)
    return undefined
  return `Closest column${close.length > 1 ? 's' : ''}: ${close.map(r => `\`${r.col}\` (in \`${r.table}\`)`).join(', ')}.`
}

const MISSING_TABLE_PATTERNS = [
  /Not found:\s*Table\s+(\S+)/i,
  /Table\s+`?([^\s`]+)`?\s+(?:not found|does not exist)/i,
  /relation\s+"([^"]+)"\s+does not exist/i,
]

function extractMissingTable(errorMessage: string): string | undefined {
  for (const re of MISSING_TABLE_PATTERNS) {
    const m = re.exec(errorMessage)
    if (m?.[1])
      return m[1].replace(/[`":]/g, '.')
  }
  return undefined
}

function closestTablesHint(badTable: string, schemas: WarehouseTableSchema[]): string | undefined {
  if (schemas.length === 0)
    return undefined
  const short = badTable.split('.').pop()?.toLowerCase() ?? badTable.toLowerCase()
  const exactShort = schemas.filter(s => s.name.split('.').pop()?.toLowerCase() === short)
  const picks = exactShort.length > 0
    ? exactShort.slice(0, 4).map(s => s.name)
    : schemas
        .map(s => ({ name: s.name, dist: levenshtein(short, s.name.split('.').pop()?.toLowerCase() ?? s.name.toLowerCase()) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
        .map(x => x.name)
  return picks.length > 0 ? `Available matching tables: ${picks.map(t => `\`${t}\``).join(', ')}.` : undefined
}

function bigQueryHints(errorMessage: string, sql: string): string[] {
  const hints: string[] = []
  if (/Function not found:\s*MEDIAN|percentile_cont aggregate function is not supported/i.test(errorMessage) || /\bMEDIAN\s*\(/i.test(sql)) {
    hints.push('BigQuery has no `MEDIAN()` aggregate and `PERCENTILE_CONT` is window-only. Use `APPROX_QUANTILES(col, 100)[OFFSET(50)]` as an aggregate, or compute `SELECT DISTINCT PERCENTILE_CONT(col, 0.5) OVER ()` in its own CTE/subquery.')
  }
  if (/neither grouped nor aggregated/i.test(errorMessage)) {
    hints.push('In BigQuery, do not mix aggregates (`SUM`/`COUNT`) with window functions (`OVER ()`) or ungrouped columns in one `SELECT`. Compute window values (`ROW_NUMBER()`, `COUNT(*) OVER ()`, `PERCENTILE_CONT(...) OVER ()`) in a CTE first, then aggregate in the outer `SELECT` (wrapping constant columns in `MAX(...)` or `ANY_VALUE(...)`).')
  }
  if (/LIMIT expects an integer literal/i.test(errorMessage)) {
    hints.push('BigQuery `LIMIT` requires a constant integer literal. For top-N% or dynamic limits, compute `ROW_NUMBER() OVER (ORDER BY ...) AS rn` and `COUNT(*) OVER () AS n` in a CTE, then filter `WHERE rn <= CEIL(0.01 * n)`.')
  }
  if (/No matching signature for aggregate function\s+COUNTIF/i.test(errorMessage)) {
    hints.push('BigQuery `COUNTIF(cond)` requires a BOOL expression (e.g. `COUNTIF(flag > 0)`), not an INT64; use `SUM(flag)` for 0/1 flags.')
  }
  if (/No matching signature for function\s+(?:DATE_TRUNC|DATE|FORMAT_DATE)/i.test(errorMessage) || /\bDATE_TRUNC\s*\(\s*'/i.test(sql)) {
    hints.push('BigQuery takes `DATE_TRUNC(date_col, MONTH)` (date first, unquoted part second), `EXTRACT(YEAR FROM date_col)`, and `DATE(year, month, day)`.')
  }
  if (/\bFILTER\s*\(\s*WHERE\b/i.test(sql)) {
    hints.push('BigQuery does not support `FILTER (WHERE ...)`; use `COUNTIF(cond)` or `SUM(IF(cond, val, 0))`.')
  }
  if (/\bSTRFTIME\s*\(/i.test(sql)) {
    hints.push('BigQuery uses `FORMAT_DATE(\'%Y-%m\', date_col)` instead of `STRFTIME(...)`.')
  }
  if (/Division by zero/i.test(errorMessage)) {
    hints.push('Use `SAFE_DIVIDE(numerator, denominator)` in BigQuery to avoid division by zero.')
  }
  return hints
}

function commonDialectHints(warehouseId: WarehouseConnector['id'], errorMessage: string, sql: string): string[] {
  const hints: string[] = []
  if (warehouseId === 'bigquery')
    hints.push(...bigQueryHints(errorMessage, sql))
  if (warehouseId !== 'bigquery' && /Division by zero/i.test(errorMessage))
    hints.push('Guard denominators with `NULLIF(denominator, 0)`.')
  if (/Column name\s+\S+\s+is ambiguous|ambiguous column/i.test(errorMessage))
    hints.push('Qualify the ambiguous column with its table alias (e.g. `o.col` or `c.col`).')
  if (warehouseId === 'postgres' && /\bCOUNTIF\s*\(/i.test(sql))
    hints.push('PostgreSQL uses `COUNT(*) FILTER (WHERE cond)` instead of `COUNTIF(cond)`.')
  if (warehouseId === 'snowflake' && /\bSAFE_DIVIDE\s*\(/i.test(sql))
    hints.push('Snowflake uses `DIV0NULL(a, b)` or `a / NULLIF(b, 0)` instead of `SAFE_DIVIDE`.')
  if (warehouseId === 'mysql' && /\bDATE_TRUNC\s*\(/i.test(sql))
    hints.push('MySQL uses `DATE_FORMAT(date_col, \'%Y-%m-01\')` instead of `DATE_TRUNC`.')
  return hints
}

/** Returns a concise `\nSQL repair hint: ...` block when a warehouse error matches a known fix, else `''`. */
export function formatWarehouseSqlRepairHint(
  warehouseId: WarehouseConnector['id'],
  errorMessage: string,
  sql: string,
  schemas: WarehouseTableSchema[] = [],
): string {
  const hints = commonDialectHints(warehouseId, errorMessage, sql)
  const badTable = extractMissingTable(errorMessage)
  if (badTable) {
    const tblHint = closestTablesHint(badTable, schemas)
    if (tblHint)
      hints.push(tblHint)
  }
  const badCol = extractMissingColumn(errorMessage)
  if (badCol) {
    const colHint = closestColumnsHint(badCol, schemas)
    if (colHint)
      hints.push(colHint)
    else if (schemas.length === 0)
      hints.push(`Call \`profile(warehouse="${warehouseId}")\` once to see exact table schemas and column names.`)
  }
  return hints.length > 0 ? `\nSQL repair hint: ${hints.join(' ')}` : ''
}
