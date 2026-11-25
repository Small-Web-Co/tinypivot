import { describe, expect, it } from 'vitest'
import { allocateCells, breakEvenMonth } from '../../demo/site/charts'

describe('allocateCells', () => {
  const pasted = [
    { label: 'rows', value: 60_000, fill: 'ink' as const },
    { label: 're-reads', value: 30_000, fill: 'dither' as const },
    { label: 'rewrites', value: 3_000, fill: 'accent' as const },
  ]

  it('fills the whole grid when the values add up to it', () => {
    const cells = allocateCells(pasted, 93, 1000).map(c => c.cells)
    expect(cells).toEqual([645, 323, 32])
    expect(cells.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('keeps the same scale for a much smaller total', () => {
    const [summary] = allocateCells([{ label: 'schema', value: 300, fill: 'ink' }], 93, 1000)
    expect(summary.cells).toBe(3)
  })

  it('never hides a non-zero value and never draws a zero one', () => {
    const cells = allocateCells([
      { label: 'tiny', value: 1, fill: 'ink' },
      { label: 'none', value: 0, fill: 'dither' },
    ], 93, 1000).map(c => c.cells)
    expect(cells).toEqual([1, 0])
  })

  it('coarsens the scale instead of overflowing the grid', () => {
    const cells = allocateCells(pasted, 10, 1000).map(c => c.cells)
    expect(cells.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(cells).toEqual([645, 323, 32])
  })

  it('keeps one cell per segment even when segments outnumber the grid', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ label: `s${i}`, value: i === 0 ? 1_000_000 : 1, fill: 'ink' as const }))
    const cells = allocateCells(many, 1, 10).map(c => c.cells)
    expect(Math.min(...cells)).toBe(1)
    expect(cells.reduce((a, b) => a + b, 0)).toBe(12)
  })
})

describe('breakEvenMonth', () => {
  it('returns the first month cumulative savings cover the cost', () => {
    expect(breakEvenMonth(50, 149)).toBe(3)
    expect(breakEvenMonth(149, 149)).toBe(1)
    expect(breakEvenMonth(500, 149)).toBe(1)
  })

  it('returns null when it does not pay back within the horizon', () => {
    expect(breakEvenMonth(10, 149)).toBeNull()
    expect(breakEvenMonth(0, 149)).toBeNull()
  })
})
