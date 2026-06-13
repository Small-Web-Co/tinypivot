/**
 * TinyPivot Core — Row-span merge helper for grouped pivot layout
 *
 * Pure, framework-agnostic. No DOM, no framework imports.
 * Computes per-cell rowspan information so renderers can produce
 * <th rowspan=N> for repeated parent values instead of repeating them.
 */

export type { PivotLayout } from '../types'

export interface RowSpanCell {
  /** 0 = do not render (a previous cell spans over this position); ≥1 = actual rowspan */
  rowspan: number
  /** true = render a <th> with this rowspan; false = omit the cell entirely */
  render: boolean
}

/**
 * Compute rowspan information for pivot row-header cells.
 *
 * @param rowHeaders - Full rowHeaders array (indexed by original/unsorted row index).
 *   Each entry is an array of string values, one per row field.
 * @param sortedIndices - The indices into `rowHeaders` in the order they are displayed.
 * @param rowFieldCount - Number of row-field columns (depth of the hierarchy).
 * @returns A 2-D array indexed by [sortedPosition][columnIndex].
 *   Empty array when rowHeaders is empty or rowFieldCount is 0.
 *
 * Algorithm (per column c, top-to-bottom in sorted order):
 *   A "run" is a maximal sequence of consecutive sorted rows whose path prefix
 *   rowHeaders[idx][0..c] (inclusive) are ALL equal, AND whose ancestor column
 *   (c-1) also did not break at that position (child run cannot span across
 *   different parents).
 *
 *   First row of a run → { rowspan: runLength, render: true }
 *   Other rows in a run → { rowspan: 0, render: false }
 *
 *   Empty-string segments ("") are treated as ordinary values, naturally forming
 *   their own runs and not merging with non-empty siblings.
 */
export function computeRowSpans(
  rowHeaders: string[][],
  sortedIndices: number[],
  rowFieldCount: number,
): RowSpanCell[][] {
  if (rowHeaders.length === 0 || rowFieldCount === 0)
    return []

  const rowCount = sortedIndices.length
  // result[pos][col] — initialise everything as a solo render-true cell
  const result: RowSpanCell[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: rowFieldCount }, () => ({ rowspan: 1, render: true })))

  for (let col = 0; col < rowFieldCount; col++) {
    let runStart = 0

    while (runStart < rowCount) {
      const runEnd = findRunEnd(result, rowHeaders, sortedIndices, col, runStart, rowCount)
      const runLength = runEnd - runStart

      // First position of the run gets the full rowspan
      result[runStart][col] = { rowspan: runLength, render: true }

      // Remaining positions in the run are skipped
      for (let pos = runStart + 1; pos < runEnd; pos++) {
        result[pos][col] = { rowspan: 0, render: false }
      }

      runStart = runEnd
    }
  }

  return result
}

/**
 * Find the exclusive end index of the run starting at `runStart` for column `col`.
 *
 * A run extends while:
 *   1. The ancestor column (col - 1) did NOT break (render: false means the
 *      parent cell above is still spanning over this position — same parent).
 *   2. The value at column `col` is identical to the run-start value.
 */
function findRunEnd(
  result: RowSpanCell[][],
  rowHeaders: string[][],
  sortedIndices: number[],
  col: number,
  runStart: number,
  rowCount: number,
): number {
  const startValue = rowHeaders[sortedIndices[runStart]][col]
  let pos = runStart + 1

  while (pos < rowCount) {
    // If the parent column broke at this position, the run must also break
    if (col > 0 && result[pos][col - 1].render) {
      break
    }
    // If the value at this column changed, the run breaks
    if (rowHeaders[sortedIndices[pos]][col] !== startValue) {
      break
    }
    pos++
  }

  return pos
}
