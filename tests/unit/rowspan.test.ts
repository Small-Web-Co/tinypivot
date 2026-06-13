/**
 * Tests for the computeRowSpans helper (Task 1: Core rowspan merge helper)
 *
 * Uses hand-built rowHeaders + sortedIndices fixtures.
 * Tests are written BEFORE implementation (TDD).
 */
import { describe, expect, it } from 'vitest'
import { computeRowSpans } from '../../packages/core/src/pivot/rowspan'

describe('computeRowSpans', () => {
  // -----------------------------------------------------------------------
  // Guard: empty input
  // -----------------------------------------------------------------------
  it('returns empty array when rowHeaders is empty', () => {
    const result = computeRowSpans([], [], 1)
    expect(result).toEqual([])
  })

  it('returns empty array when rowFieldCount is 0', () => {
    const rowHeaders = [['Sports'], ['Home']]
    const result = computeRowSpans(rowHeaders, [0, 1], 0)
    expect(result).toEqual([])
  })

  // -----------------------------------------------------------------------
  // Single row field: consecutive equal values merge
  // -----------------------------------------------------------------------
  it('merges consecutive equal values under a single row field', () => {
    // rowHeaders: [["Sports"], ["Sports"], ["Home"]]
    // sortedIndices: [0, 1, 2] (natural order)
    // Expected: position 0 → col0: {rowspan:2, render:true}
    //           position 1 → col0: {rowspan:0, render:false}
    //           position 2 → col0: {rowspan:1, render:true}
    const rowHeaders = [['Sports'], ['Sports'], ['Home']]
    const sortedIndices = [0, 1, 2]

    const result = computeRowSpans(rowHeaders, sortedIndices, 1)

    expect(result).toHaveLength(3)
    // position 0: first of a 2-row "Sports" run
    expect(result[0][0]).toEqual({ rowspan: 2, render: true })
    // position 1: continuation of "Sports" run
    expect(result[1][0]).toEqual({ rowspan: 0, render: false })
    // position 2: solo "Home"
    expect(result[2][0]).toEqual({ rowspan: 1, render: true })
  })

  it('gives rowspan 1 render true when all single-row values are distinct', () => {
    const rowHeaders = [['Alpha'], ['Beta'], ['Gamma']]
    const sortedIndices = [0, 1, 2]

    const result = computeRowSpans(rowHeaders, sortedIndices, 1)

    for (let pos = 0; pos < 3; pos++) {
      expect(result[pos][0]).toEqual({ rowspan: 1, render: true })
    }
  })

  // -----------------------------------------------------------------------
  // Two fields: parent merges, children don't (all leaf values distinct)
  // -----------------------------------------------------------------------
  it('merges parent column but not child column when children are distinct', () => {
    // rowHeaders:
    //   idx 0: ["Sports", "VIP"]
    //   idx 1: ["Sports", "Regular"]
    //   idx 2: ["Sports", "New"]
    //   idx 3: ["Home", "New"]
    // sortedIndices: [0, 1, 2, 3]
    // col0: Sports spans positions 0-2 (rowspan 3), Home is rowspan 1
    // col1: all rowspan 1 render true (VIP, Regular, New, New — last New is under Home)
    const rowHeaders = [
      ['Sports', 'VIP'],
      ['Sports', 'Regular'],
      ['Sports', 'New'],
      ['Home', 'New'],
    ]
    const sortedIndices = [0, 1, 2, 3]

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    expect(result).toHaveLength(4)

    // col0: Sports spanning rows 0-2
    expect(result[0][0]).toEqual({ rowspan: 3, render: true })
    expect(result[1][0]).toEqual({ rowspan: 0, render: false })
    expect(result[2][0]).toEqual({ rowspan: 0, render: false })
    // col0: Home alone
    expect(result[3][0]).toEqual({ rowspan: 1, render: true })

    // col1: all distinct in their respective parent runs
    expect(result[0][1]).toEqual({ rowspan: 1, render: true })
    expect(result[1][1]).toEqual({ rowspan: 1, render: true })
    expect(result[2][1]).toEqual({ rowspan: 1, render: true })
    expect(result[3][1]).toEqual({ rowspan: 1, render: true })
  })

  // -----------------------------------------------------------------------
  // Child value repeated under different parents stays separate (no cross-parent merge)
  // -----------------------------------------------------------------------
  it('does not merge child "New" rows that belong to different parent groups', () => {
    // "New" appears under both "Sports" (pos 2) and "Home" (pos 3).
    // They must NOT merge at col1 because col0 breaks between them.
    const rowHeaders = [
      ['Sports', 'VIP'],
      ['Sports', 'Regular'],
      ['Sports', 'New'],
      ['Home', 'New'],
    ]
    const sortedIndices = [0, 1, 2, 3]

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    // position 2 (Sports/New) and position 3 (Home/New): both render true at col1
    expect(result[2][1]).toEqual({ rowspan: 1, render: true })
    expect(result[3][1]).toEqual({ rowspan: 1, render: true })
  })

  // -----------------------------------------------------------------------
  // Collapsed subtotal row (empty-string padded) breaks a span
  // -----------------------------------------------------------------------
  it('treats empty-string padded subtotal rows as their own run, breaking the span', () => {
    // rowHeaders:
    //   idx 0: ["Sports", "VIP"]
    //   idx 1: ["Sports", ""]     ← subtotal/collapsed row padded with ""
    //   idx 2: ["Home", ""]
    // sortedIndices: [0, 1, 2]
    //
    // col0: "Sports" at pos 0 and "Sports" at pos 1 → same col0 prefix → rowspan 2 for Sports
    //       "Home" at pos 2 → rowspan 1
    // col1: pos 0 ("VIP") and pos 1 ("") are NOT equal → each rowspan 1 render true
    //       pos 2 ("" under Home) → rowspan 1 render true
    const rowHeaders = [
      ['Sports', 'VIP'],
      ['Sports', ''],
      ['Home', ''],
    ]
    const sortedIndices = [0, 1, 2]

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    expect(result).toHaveLength(3)

    // col0: Sports spans positions 0-1
    expect(result[0][0]).toEqual({ rowspan: 2, render: true })
    expect(result[1][0]).toEqual({ rowspan: 0, render: false })
    // col0: Home alone
    expect(result[2][0]).toEqual({ rowspan: 1, render: true })

    // col1: VIP and "" are different values → each renders independently
    expect(result[0][1]).toEqual({ rowspan: 1, render: true })
    expect(result[1][1]).toEqual({ rowspan: 1, render: true })
    expect(result[2][1]).toEqual({ rowspan: 1, render: true })
  })

  it('does not merge two empty-string children across different parents', () => {
    // pos 1 ("") under Sports and pos 2 ("") under Home must NOT merge
    const rowHeaders = [
      ['Sports', 'VIP'],
      ['Sports', ''],
      ['Home', ''],
    ]
    const sortedIndices = [0, 1, 2]

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    // Each "" is under a different parent (col0 breaks at pos 2)
    expect(result[1][1]).toEqual({ rowspan: 1, render: true })
    expect(result[2][1]).toEqual({ rowspan: 1, render: true })
  })

  // -----------------------------------------------------------------------
  // sortedIndices can be in non-identity order (reflects sort permutation)
  // -----------------------------------------------------------------------
  it('respects sortedIndices ordering when computing runs', () => {
    // Data is stored at original indices but visited in sorted order.
    // sortedIndices = [2, 0, 1] means visit rowHeaders[2], then [0], then [1].
    // rowHeaders[2] = ["Sports","VIP"], [0] = ["Sports","Regular"], [1] = ["Home","New"]
    // In sorted order: Sports/VIP, Sports/Regular, Home/New
    // col0: Sports positions 0-1 → rowspan 2; Home position 2 → rowspan 1
    const rowHeaders = [
      ['Sports', 'Regular'], // original index 0
      ['Home', 'New'], // original index 1
      ['Sports', 'VIP'], // original index 2
    ]
    const sortedIndices = [2, 0, 1] // visit: VIP, Regular, Home

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    expect(result).toHaveLength(3)
    // sorted position 0 (idx 2, Sports/VIP) → first of Sports run
    expect(result[0][0]).toEqual({ rowspan: 2, render: true })
    // sorted position 1 (idx 0, Sports/Regular) → continuation
    expect(result[1][0]).toEqual({ rowspan: 0, render: false })
    // sorted position 2 (idx 1, Home/New) → new group
    expect(result[2][0]).toEqual({ rowspan: 1, render: true })
  })

  // -----------------------------------------------------------------------
  // Single row — trivial case
  // -----------------------------------------------------------------------
  it('handles a single row with rowspan 1 render true for all columns', () => {
    const rowHeaders = [['Sports', 'VIP']]
    const sortedIndices = [0]

    const result = computeRowSpans(rowHeaders, sortedIndices, 2)

    expect(result).toHaveLength(1)
    expect(result[0][0]).toEqual({ rowspan: 1, render: true })
    expect(result[0][1]).toEqual({ rowspan: 1, render: true })
  })

  // -----------------------------------------------------------------------
  // Three-level hierarchy: grandparent, parent, child
  // -----------------------------------------------------------------------
  it('merges at each level independently for three-level hierarchy', () => {
    // Region → Category → Customer
    // Sorted: West/Sports/VIP, West/Sports/Regular, West/Home/New, East/Sports/VIP
    const rowHeaders = [
      ['West', 'Sports', 'VIP'],
      ['West', 'Sports', 'Regular'],
      ['West', 'Home', 'New'],
      ['East', 'Sports', 'VIP'],
    ]
    const sortedIndices = [0, 1, 2, 3]

    const result = computeRowSpans(rowHeaders, sortedIndices, 3)

    expect(result).toHaveLength(4)

    // col0 (Region): West spans 0-2, East alone
    expect(result[0][0]).toEqual({ rowspan: 3, render: true })
    expect(result[1][0]).toEqual({ rowspan: 0, render: false })
    expect(result[2][0]).toEqual({ rowspan: 0, render: false })
    expect(result[3][0]).toEqual({ rowspan: 1, render: true })

    // col1 (Category): Sports spans 0-1 within West; Home alone; East/Sports alone
    expect(result[0][1]).toEqual({ rowspan: 2, render: true })
    expect(result[1][1]).toEqual({ rowspan: 0, render: false })
    expect(result[2][1]).toEqual({ rowspan: 1, render: true })
    expect(result[3][1]).toEqual({ rowspan: 1, render: true })

    // col2 (Customer): all distinct within their respective parent runs
    expect(result[0][2]).toEqual({ rowspan: 1, render: true })
    expect(result[1][2]).toEqual({ rowspan: 1, render: true })
    expect(result[2][2]).toEqual({ rowspan: 1, render: true })
    expect(result[3][2]).toEqual({ rowspan: 1, render: true })
  })
})
