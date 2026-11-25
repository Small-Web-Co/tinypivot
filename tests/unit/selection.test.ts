import { describe, expect, it } from 'vitest'
import { selectionBounds, selectionCellClass } from '../../packages/core/src/selection'

describe('selection', () => {
  it('spans the rectangle between two cells, in either drag direction', () => {
    expect(selectionBounds({ row: 4, col: 3 }, { row: 1, col: 1 })).toEqual({ minRow: 1, maxRow: 4, minCol: 1, maxCol: 3 })
    expect(selectionBounds({ row: 2, col: 2 }, null)).toEqual({ minRow: 2, maxRow: 2, minCol: 2, maxCol: 2 })
    expect(selectionBounds(null, null)).toBeNull()
  })

  it('outlines the range once: edge classes only on the cells along its border', () => {
    const bounds = selectionBounds({ row: 1, col: 1 }, { row: 2, col: 3 })
    expect(selectionCellClass(bounds, 1, 1)).toBe('vpg-selected vpg-sel-top vpg-sel-left')
    expect(selectionCellClass(bounds, 1, 2)).toBe('vpg-selected vpg-sel-top')
    expect(selectionCellClass(bounds, 2, 3)).toBe('vpg-selected vpg-sel-bottom vpg-sel-right')
    expect(selectionCellClass(bounds, 3, 3)).toBe('')
    expect(selectionCellClass(selectionBounds({ row: 0, col: 0 }, null), 0, 0)).toBe('vpg-selected vpg-sel-top vpg-sel-bottom vpg-sel-left vpg-sel-right')
  })
})
