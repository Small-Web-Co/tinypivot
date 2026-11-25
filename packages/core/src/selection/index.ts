import type { SelectionBounds } from '../types'

/**
 * Cell range selection shared by the grid and the pivot table, in React and Vue: the bounds of a
 * dragged range, and the classes that give the range a single outline around its edges.
 */

export interface CellPosition {
  row: number
  col: number
}

/** The rectangle between two cells, or null when nothing is selected. */
export function selectionBounds(start: CellPosition | null | undefined, end: CellPosition | null | undefined): SelectionBounds | null {
  const from = start ?? end
  const to = end ?? start
  if (!from || !to)
    return null
  return {
    minRow: Math.min(from.row, to.row),
    maxRow: Math.max(from.row, to.row),
    minCol: Math.min(from.col, to.col),
    maxCol: Math.max(from.col, to.col),
  }
}

export function isInSelection(bounds: SelectionBounds | null, row: number, col: number): boolean {
  return Boolean(bounds) && row >= bounds!.minRow && row <= bounds!.maxRow && col >= bounds!.minCol && col <= bounds!.maxCol
}

/**
 * `vpg-selected` for a cell inside the range, plus the range edges it sits on, so the range is
 * outlined once instead of every cell drawing its own box. Empty outside the range.
 */
export function selectionCellClass(bounds: SelectionBounds | null, row: number, col: number): string {
  if (!bounds || !isInSelection(bounds, row, col))
    return ''
  return [
    'vpg-selected',
    row === bounds.minRow && 'vpg-sel-top',
    row === bounds.maxRow && 'vpg-sel-bottom',
    col === bounds.minCol && 'vpg-sel-left',
    col === bounds.maxCol && 'vpg-sel-right',
  ].filter(Boolean).join(' ')
}
