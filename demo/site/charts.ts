/** Pure helpers behind the site's 1-bit charts. */

export type CellFill = 'ink' | 'dither' | 'accent'

export interface UnitSegment {
  label: string
  value: number
  fill: CellFill
}

export interface UnitCells extends UnitSegment {
  cells: number
}

/**
 * Split a grid of `totalCells` between segments in proportion to their values,
 * at `valuePerCell` per cell. Largest-remainder rounding keeps counts whole.
 * Any non-zero value gets at least one cell. If the values need more cells than
 * the grid has, the scale is coarsened so everything still fits.
 */
export function allocateCells(segments: readonly UnitSegment[], valuePerCell: number, totalCells: number): UnitCells[] {
  const sum = segments.reduce((a, s) => a + s.value, 0)
  const perCell = Math.max(valuePerCell, sum / totalCells)
  const exact = segments.map(s => s.value / perCell)
  const cells = exact.map((v, i) => (segments[i].value > 0 ? Math.max(1, Math.floor(v)) : 0))
  const target = Math.min(totalCells, Math.max(Math.round(sum / perCell), cells.reduce((a, b) => a + b, 0)))

  const byRemainder = exact
    .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
    .sort((a, b) => b.remainder - a.remainder)
  let used = cells.reduce((a, b) => a + b, 0)
  for (const { i } of byRemainder) {
    if (used >= target)
      break
    cells[i] += 1
    used += 1
  }

  // The one-cell minimum can overshoot a full grid; take the excess from the largest segment,
  // but never below its own one cell.
  const largest = cells.indexOf(Math.max(...cells))
  cells[largest] = Math.max(1, cells[largest] - Math.max(0, used - totalCells))

  return segments.map((s, i) => ({ ...s, cells: cells[i] }))
}

/** First month (1-based) in which cumulative savings cover a one-off cost, or null within `horizon`. */
export function breakEvenMonth(monthlySaving: number, cost: number, horizon = 12): number | null {
  if (monthlySaving <= 0)
    return null
  const month = Math.ceil(cost / monthlySaving)
  return month <= horizon ? Math.max(1, month) : null
}
