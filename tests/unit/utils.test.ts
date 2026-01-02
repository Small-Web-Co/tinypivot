/**
 * Unit tests for core utility functions
 */
import { describe, expect, it } from 'vitest'
import {
  clamp,
  detectColumnType,
  detectFieldType,
  formatCellValue,
  formatNumber,
  getColumnUniqueValues,
  makeKey,
  naturalSort,
  parseKey,
} from '../../packages/core/src/utils'

describe('detectColumnType', () => {
  it('should detect number type', () => {
    const values = [1, 2, 3, 4, 5]
    expect(detectColumnType(values)).toBe('number')
  })

  it('should detect number type from strings', () => {
    const values = ['1', '2', '3', '4', '5']
    expect(detectColumnType(values)).toBe('number')
  })

  it('should detect string type', () => {
    const values = ['apple', 'banana', 'cherry']
    expect(detectColumnType(values)).toBe('string')
  })

  it('should detect boolean type', () => {
    const values = [true, false, true, false, true]
    expect(detectColumnType(values)).toBe('boolean')
  })

  it('should return string for empty values', () => {
    expect(detectColumnType([])).toBe('string')
    expect(detectColumnType([null, undefined, ''])).toBe('string')
  })

  it('should use 80% threshold for type detection', () => {
    // 8 numbers, 2 strings = 80% numbers
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 'a', 'b']
    expect(detectColumnType(values)).toBe('number')
  })
})

describe('detectFieldType', () => {
  it('should detect numeric field', () => {
    const data = [
      { amount: 100 },
      { amount: 200 },
      { amount: 300 },
    ]
    const result = detectFieldType(data, 'amount')
    expect(result.field).toBe('amount')
    expect(result.isNumeric).toBe(true)
    expect(result.type).toBe('number')
    expect(result.uniqueCount).toBe(3)
  })

  it('should detect string field', () => {
    const data = [
      { category: 'A' },
      { category: 'B' },
      { category: 'A' },
    ]
    const result = detectFieldType(data, 'category')
    expect(result.isNumeric).toBe(false)
    expect(result.type).toBe('string')
    expect(result.uniqueCount).toBe(2)
  })
})

describe('getColumnUniqueValues', () => {
  it('should get unique values and stats', () => {
    const data = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 30 },
      { name: 'Alice', age: 25 },
      { name: null, age: null },
    ]
    const result = getColumnUniqueValues(data, 'name')
    expect(result.uniqueValues).toEqual(['Alice', 'Bob'])
    expect(result.totalCount).toBe(4)
    expect(result.nullCount).toBe(1)
  })

  it('should compute min/max for numeric columns', () => {
    const data = [
      { value: 10 },
      { value: 5 },
      { value: 20 },
    ]
    const result = getColumnUniqueValues(data, 'value')
    expect(result.type).toBe('number')
    expect(result.numericMin).toBe(5)
    expect(result.numericMax).toBe(20)
  })

  it('should respect maxValues limit', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const result = getColumnUniqueValues(data, 'id', 10)
    expect(result.uniqueValues.length).toBeLessThanOrEqual(10)
  })
})

describe('formatCellValue', () => {
  it('should format numbers with appropriate precision', () => {
    expect(formatCellValue(1234.5678, 'number')).toMatch(/1,234/)
    expect(formatCellValue(0.1234, 'number')).toMatch(/0\.1234/)
  })

  it('should format booleans as Yes/No', () => {
    expect(formatCellValue(true, 'boolean')).toBe('Yes')
    expect(formatCellValue(false, 'boolean')).toBe('No')
  })

  it('should handle null/undefined', () => {
    expect(formatCellValue(null, 'string')).toBe('')
    expect(formatCellValue(undefined, 'number')).toBe('')
  })

  it('should convert strings', () => {
    expect(formatCellValue('hello', 'string')).toBe('hello')
  })
})

describe('formatNumber', () => {
  it('should format large numbers with commas', () => {
    expect(formatNumber(1000000)).toMatch(/1,000,000/)
  })

  it('should return dash for null', () => {
    expect(formatNumber(null)).toBe('-')
  })

  it('should respect maximumFractionDigits option', () => {
    const result = formatNumber(1.123456, { maximumFractionDigits: 2 })
    expect(result).toMatch(/1\.12/)
  })
})

describe('makeKey / parseKey', () => {
  it('should create and parse composite keys', () => {
    const row = { region: 'North', product: 'Widget' }
    const key = makeKey(row, ['region', 'product'])
    expect(key).toBe('North|||Widget')

    const parsed = parseKey(key)
    expect(parsed).toEqual(['North', 'Widget'])
  })

  it('should handle blank values', () => {
    const row = { region: null, product: 'Widget' }
    const key = makeKey(row, ['region', 'product'])
    expect(key).toBe('(blank)|||Widget')
  })
})

describe('naturalSort', () => {
  it('should sort numbers correctly', () => {
    const arr = ['10', '2', '1', '20']
    const sorted = arr.sort(naturalSort)
    expect(sorted).toEqual(['1', '2', '10', '20'])
  })

  it('should sort strings alphabetically', () => {
    const arr = ['banana', 'Apple', 'cherry']
    const sorted = arr.sort(naturalSort)
    expect(sorted).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('should handle mixed content', () => {
    const arr = ['item2', 'item10', 'item1']
    const sorted = arr.sort(naturalSort)
    expect(sorted).toEqual(['item1', 'item2', 'item10'])
  })
})

describe('clamp', () => {
  it('should clamp value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })
})
