import { describe, expect, it } from 'vitest'
import { plainArrowValue } from '../../demo/utils/duckdb'

describe('plainArrowValue', () => {
  it('shows Arrow dates as dates, not epoch milliseconds', () => {
    expect(plainArrowValue(1720396800000, 'Date32<DAY>')).toBe('2024-07-08')
    expect(plainArrowValue(1720396800000, 'Timestamp<MICROSECOND>')).toBe('2024-07-08T00:00:00.000Z')
    expect(plainArrowValue(42n, 'Int64')).toBe(42)
    expect(plainArrowValue(1720396800000, 'Float64')).toBe(1720396800000)
    expect(plainArrowValue(null, 'Date32<DAY>')).toBeNull()
  })
})
