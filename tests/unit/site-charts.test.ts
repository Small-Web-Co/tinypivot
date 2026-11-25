import { describe, expect, it } from 'vitest'
import { breakEvenMonth } from '../../demo/site/charts'

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
