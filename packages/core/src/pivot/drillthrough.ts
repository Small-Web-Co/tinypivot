/**
 * TinyPivot Core — Drill-Through Row Extraction
 *
 * On-demand filter of source rows for a clicked pivot cell.
 * No per-cell row storage — computed from the original data on demand.
 */
import type { DrillThroughResult, PivotConfig } from '../types'
import { aggregate, formatAggregatedValue } from './index'

/**
 * Stringify a field value the same way computePivotResult does via makeKey:
 *   String(value ?? '(blank)')
 *
 * This ensures drill-through matches exactly the rows the pivot counted.
 */
function stringifyFieldValue(value: unknown): string {
  return String(value ?? '(blank)')
}

/**
 * Return the source rows that correspond to a clicked pivot cell.
 *
 * Filtering rules:
 * - For each position `i` in `rowPath`: include only rows where
 *   `String(row[rowFields[i]] ?? '(blank)') === rowPath[i]`
 * - Same rule applies for `columnPath` / `columnFields`.
 * - Partial paths (prefix shorter than the full field list) filter only
 *   the provided prefix entries — useful for subtotal / grand-total cells.
 * - Both paths empty → no filter applied → returns all rows (grand total).
 *
 * @param data          - Original source data records
 * @param config        - Pivot configuration (rowFields, columnFields, valueFields)
 * @param rowPath       - Row-field values identifying the row group (may be a prefix)
 * @param columnPath    - Column-field values identifying the column group (may be a prefix)
 * @param valueFieldIndex - Index into config.valueFields for which field/aggregation to
 *                        report in the descriptor. Defaults to 0.
 */
export function getDrillThroughRows(
  data: Record<string, unknown>[],
  config: PivotConfig,
  rowPath: string[],
  columnPath: string[],
  valueFieldIndex = 0,
): DrillThroughResult {
  const { rowFields, columnFields, valueFields } = config

  // Filter rows to only those matching the provided path prefixes
  const rows = data.filter((row) => {
    for (let i = 0; i < rowPath.length; i++) {
      if (stringifyFieldValue(row[rowFields[i]]) !== rowPath[i])
        return false
    }
    for (let i = 0; i < columnPath.length; i++) {
      if (stringifyFieldValue(row[columnFields[i]]) !== columnPath[i])
        return false
    }
    return true
  })

  // Determine which value field the caller is describing
  const vf = valueFields[valueFieldIndex] ?? valueFields[0]

  // Collect numeric values from the matching rows for aggregation
  const numericValues: number[] = []
  for (const row of rows) {
    const raw = row[vf.field]
    if (raw === null || raw === undefined || raw === '')
      continue
    const num = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
    if (!Number.isNaN(num))
      numericValues.push(num)
  }

  const aggregatedValue = aggregate(numericValues, vf.aggregation)
  const formattedValue = formatAggregatedValue(aggregatedValue, vf.aggregation)

  return {
    rows,
    descriptor: {
      rowPath,
      columnPath,
      valueField: vf.field,
      aggregation: vf.aggregation,
      formattedValue,
      rowCount: rows.length,
    },
  }
}
