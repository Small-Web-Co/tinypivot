/**
 * TinyPivot Core - Utility Functions
 * Pure utility functions with no framework dependencies
 */
import type { ColumnStats, FieldStats } from '../types'

/**
 * Detect column data type from values
 */
export function detectColumnType(values: unknown[]): ColumnStats['type'] {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0) return 'string'

  const sample = nonNullValues.slice(0, 100)
  let numberCount = 0
  let dateCount = 0
  let booleanCount = 0

  for (const val of sample) {
    if (typeof val === 'boolean') {
      booleanCount++
    } else if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '')) {
      numberCount++
    } else if (val instanceof Date || !Number.isNaN(Date.parse(String(val)))) {
      dateCount++
    }
  }

  const threshold = sample.length * 0.8
  if (booleanCount >= threshold) return 'boolean'
  if (numberCount >= threshold) return 'number'
  if (dateCount >= threshold) return 'date'
  return 'string'
}

/**
 * Detect field type from sample data (for pivot)
 */
export function detectFieldType(data: Record<string, unknown>[], field: string): FieldStats {
  const values = data.map(row => row[field]).filter(v => v !== null && v !== undefined && v !== '')
  const sample = values.slice(0, 100)

  let numberCount = 0
  const uniqueSet = new Set<string>()

  for (const val of sample) {
    uniqueSet.add(String(val))
    if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '')) {
      numberCount++
    }
  }

  const isNumeric = numberCount >= sample.length * 0.8

  return {
    field,
    type: isNumeric ? 'number' : 'string',
    uniqueCount: uniqueSet.size,
    isNumeric,
  }
}

/**
 * Get unique values for a column (for Excel-style filter dropdown)
 */
export function getColumnUniqueValues<T>(
  data: T[],
  columnKey: string,
  maxValues = 500
): ColumnStats {
  const values: unknown[] = []
  let nullCount = 0

  for (const row of data) {
    const value = (row as Record<string, unknown>)[columnKey]
    if (value === null || value === undefined || value === '') {
      nullCount++
    } else {
      values.push(value)
    }
  }

  // Get unique values
  const uniqueSet = new Set<string>()
  for (const val of values) {
    uniqueSet.add(String(val))
    if (uniqueSet.size >= maxValues) break
  }

  const uniqueValues = Array.from(uniqueSet).sort((a, b) => {
    // Natural sort for numbers
    const numA = Number.parseFloat(a)
    const numB = Number.parseFloat(b)
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })

  return {
    uniqueValues,
    totalCount: data.length,
    nullCount,
    type: detectColumnType(values),
  }
}

/**
 * Format cell value for display
 */
export function formatCellValue(value: unknown, type: ColumnStats['type']): string {
  if (value === null || value === undefined) return ''
  if (value === '') return ''

  switch (type) {
    case 'number': {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(num)) return String(value)
      // Format with commas for large numbers
      if (Math.abs(num) >= 1000) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
      }
      return num.toLocaleString('en-US', { maximumFractionDigits: 4 })
    }
    case 'date': {
      const date = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    }
    case 'boolean':
      return value ? 'Yes' : 'No'
    default:
      return String(value)
  }
}

/**
 * Format number for display with appropriate precision
 */
export function formatNumber(value: number | null, options?: { maximumFractionDigits?: number }): string {
  if (value === null) return '-'

  const maxDigits = options?.maximumFractionDigits ?? (Math.abs(value) >= 1000 ? 2 : 4)

  return value.toLocaleString('en-US', { maximumFractionDigits: maxDigits })
}

/**
 * Create a composite key from field values (for pivot grouping)
 */
export function makeKey(row: Record<string, unknown>, fields: string[]): string {
  return fields.map(f => String(row[f] ?? '(blank)')).join('|||')
}

/**
 * Parse composite key back to values
 */
export function parseKey(key: string): string[] {
  return key.split('|||')
}

/**
 * Natural sort comparator
 */
export function naturalSort(a: string, b: string): number {
  const numA = Number.parseFloat(a)
  const numB = Number.parseFloat(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    return numA - numB
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}


