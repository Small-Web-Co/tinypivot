/**
 * Unit tests for core utility functions
 */
import { describe, expect, it } from 'vitest'
import { isDateRange, isNumericRange } from '../../packages/core/src/types'
import {
  clamp,
  detectColumnType,
  detectFieldType,
  formatCellValue,
  formatDate,
  formatNumber,
  getColumnUniqueValues,
  getDatePlaceholder,
  makeKey,
  naturalSort,
  parseDateInput,
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
    const result = formatNumber(1.123456, 'us', { maximumFractionDigits: 2 })
    expect(result).toBe('1.12')
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

describe('formatNumber with format presets', () => {
  it('should format with US format (default)', () => {
    expect(formatNumber(1234567.89, 'us')).toBe('1,234,567.89')
  })

  it('should format with EU format', () => {
    expect(formatNumber(1234567.89, 'eu')).toBe('1.234.567,89')
  })

  it('should format with plain format (no separators)', () => {
    expect(formatNumber(1234567, 'plain')).toBe('1234567')
    expect(formatNumber(1234.5678, 'plain')).toBe('1234.57') // maxDigits defaults to 2 for values >= 1000
  })

  it('should default to US format when no format specified', () => {
    expect(formatNumber(1000)).toMatch(/1,000/)
  })
})

describe('formatDate', () => {
  it('should format dates in ISO format (default)', () => {
    expect(formatDate('2024-03-15', 'iso')).toBe('2024-03-15')
  })

  it('should format dates in US format (MM/DD/YYYY)', () => {
    expect(formatDate('2024-03-15', 'us')).toBe('03/15/2024')
  })

  it('should format dates in EU format (DD/MM/YYYY)', () => {
    expect(formatDate('2024-03-15', 'eu')).toBe('15/03/2024')
  })

  it('should handle Date objects', () => {
    const date = new Date('2024-06-01T00:00:00Z')
    expect(formatDate(date, 'iso')).toBe('2024-06-01')
  })

  it('should use UTC to avoid timezone off-by-one', () => {
    // ISO string parsed as UTC midnight — must not shift to previous day
    expect(formatDate('2024-01-15', 'iso')).toBe('2024-01-15')
    expect(formatDate('2024-01-15', 'us')).toBe('01/15/2024')
    expect(formatDate('2024-01-15', 'eu')).toBe('15/01/2024')
  })

  it('should return original string for invalid dates', () => {
    expect(formatDate('not-a-date', 'iso')).toBe('not-a-date')
  })

  it('should default to ISO when no format specified', () => {
    expect(formatDate('2024-12-25')).toBe('2024-12-25')
  })
})

describe('parseDateInput', () => {
  it('should parse ISO format (YYYY-MM-DD)', () => {
    expect(parseDateInput('2024-03-15', 'iso')).toBe('2024-03-15')
  })

  it('should parse US format (MM/DD/YYYY)', () => {
    expect(parseDateInput('03/15/2024', 'us')).toBe('2024-03-15')
  })

  it('should parse EU format (DD/MM/YYYY)', () => {
    expect(parseDateInput('15/03/2024', 'eu')).toBe('2024-03-15')
  })

  it('should return null for empty input', () => {
    expect(parseDateInput('', 'iso')).toBeNull()
    expect(parseDateInput('  ', 'us')).toBeNull()
  })

  it('should return null for invalid format', () => {
    expect(parseDateInput('not-a-date', 'iso')).toBeNull()
    expect(parseDateInput('13/32/2024', 'us')).toBeNull()
  })

  it('should return null for invalid calendar dates', () => {
    // Feb 30 doesn't exist
    expect(parseDateInput('2024-02-30', 'iso')).toBeNull()
    // Month 13 doesn't exist
    expect(parseDateInput('13/01/2024', 'us')).toBeNull()
  })

  it('should handle single-digit months and days', () => {
    expect(parseDateInput('2024-1-5', 'iso')).toBe('2024-01-05')
  })
})

describe('getDatePlaceholder', () => {
  it('should return ISO placeholder', () => {
    expect(getDatePlaceholder('iso')).toBe('YYYY-MM-DD')
  })

  it('should return US placeholder', () => {
    expect(getDatePlaceholder('us')).toBe('MM/DD/YYYY')
  })

  it('should return EU placeholder', () => {
    expect(getDatePlaceholder('eu')).toBe('DD/MM/YYYY')
  })

  it('should default to ISO', () => {
    expect(getDatePlaceholder()).toBe('YYYY-MM-DD')
  })
})

describe('isNumericRange', () => {
  it('should return true for numeric range objects', () => {
    expect(isNumericRange({ min: 0, max: 100 })).toBe(true)
    expect(isNumericRange({ min: null, max: 50 })).toBe(true)
    expect(isNumericRange({ min: 10, max: null })).toBe(true)
    expect(isNumericRange({ min: null, max: null })).toBe(true)
  })

  it('should return false for string arrays', () => {
    expect(isNumericRange(['a', 'b'])).toBe(false)
  })

  it('should return false for date ranges', () => {
    expect(isNumericRange({ min: '2024-01-01', max: '2024-12-31' })).toBe(false)
  })

  it('should return false for null and non-objects', () => {
    expect(isNumericRange(null as any)).toBe(false)
    expect(isNumericRange([] as any)).toBe(false)
  })
})

describe('isDateRange', () => {
  it('should return true for date range objects', () => {
    expect(isDateRange({ min: '2024-01-01', max: '2024-12-31' })).toBe(true)
    expect(isDateRange({ min: null, max: '2024-06-01' })).toBe(true)
    expect(isDateRange({ min: '2024-01-01', max: null })).toBe(true)
    expect(isDateRange({ min: null, max: null })).toBe(true)
  })

  it('should return false for string arrays', () => {
    expect(isDateRange(['a', 'b'])).toBe(false)
  })

  it('should return false for numeric ranges', () => {
    expect(isDateRange({ min: 0, max: 100 })).toBe(false)
  })

  it('should return false for null and non-objects', () => {
    expect(isDateRange(null as any)).toBe(false)
    expect(isDateRange([] as any)).toBe(false)
  })
})

describe('formatCellValue with format options', () => {
  it('should format numbers with EU format', () => {
    expect(formatCellValue(1234.56, 'number', 'eu')).toBe('1.234,56')
  })

  it('should format numbers with plain format', () => {
    expect(formatCellValue(1234, 'number', 'plain')).toBe('1234')
  })

  it('should format dates with US format', () => {
    expect(formatCellValue('2024-03-15', 'date', 'us', 'us')).toBe('03/15/2024')
  })

  it('should format dates with EU format', () => {
    expect(formatCellValue('2024-03-15', 'date', 'us', 'eu')).toBe('15/03/2024')
  })

  it('should format dates with ISO format', () => {
    expect(formatCellValue('2024-03-15', 'date', 'us', 'iso')).toBe('2024-03-15')
  })
})

describe('getColumnUniqueValues for date columns', () => {
  it('should compute dateMin and dateMax for date columns', () => {
    const data = [
      { date: '2024-01-15' },
      { date: '2024-06-20' },
      { date: '2024-03-10' },
    ]
    const result = getColumnUniqueValues(data, 'date')
    expect(result.type).toBe('date')
    expect(result.dateMin).toBe('2024-01-15')
    expect(result.dateMax).toBe('2024-06-20')
  })
})
