/**
 * TinyPivot Core - Utility Functions
 * Pure utility functions with no framework dependencies
 */
import type { ColumnStats, DateFormat, FieldStats, NumberFormat } from '../types'

/**
 * Detect column data type from values
 */
export function detectColumnType(values: unknown[]): ColumnStats['type'] {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0)
    return 'string'

  const sample = nonNullValues.slice(0, 100)
  let numberCount = 0
  let dateCount = 0
  let booleanCount = 0

  for (const val of sample) {
    if (typeof val === 'boolean') {
      booleanCount++
    }
    else if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '')) {
      numberCount++
    }
    else if (val instanceof Date || !Number.isNaN(Date.parse(String(val)))) {
      dateCount++
    }
  }

  const threshold = sample.length * 0.8
  if (booleanCount >= threshold)
    return 'boolean'
  if (numberCount >= threshold)
    return 'number'
  if (dateCount >= threshold)
    return 'date'
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
 * For numeric columns, also computes min and max values
 */
export function getColumnUniqueValues<T>(
  data: T[],
  columnKey: string,
  maxValues = 500,
): ColumnStats {
  const values: unknown[] = []
  let nullCount = 0
  let numericMin: number | undefined
  let numericMax: number | undefined
  let dateMin: string | undefined
  let dateMax: string | undefined

  for (const row of data) {
    const value = (row as Record<string, unknown>)[columnKey]
    if (value === null || value === undefined || value === '') {
      nullCount++
    }
    else {
      values.push(value)
      // Track numeric min/max
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (!Number.isNaN(num)) {
        if (numericMin === undefined || num < numericMin)
          numericMin = num
        if (numericMax === undefined || num > numericMax)
          numericMax = num
      }
      // Track date min/max
      if (value instanceof Date || (typeof value === 'string' && !Number.isNaN(Date.parse(String(value))))) {
        const dateObj = value instanceof Date ? value : new Date(String(value))
        if (!Number.isNaN(dateObj.getTime())) {
          const isoStr = dateObj.toISOString().split('T')[0]
          if (dateMin === undefined || isoStr < dateMin)
            dateMin = isoStr
          if (dateMax === undefined || isoStr > dateMax)
            dateMax = isoStr
        }
      }
    }
  }

  // Get unique values
  const uniqueSet = new Set<string>()
  for (const val of values) {
    uniqueSet.add(String(val))
    if (uniqueSet.size >= maxValues)
      break
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

  const columnType = detectColumnType(values)

  return {
    uniqueValues,
    totalCount: data.length,
    nullCount,
    type: columnType,
    // Only include min/max for numeric columns
    ...(columnType === 'number' && numericMin !== undefined && numericMax !== undefined
      ? { numericMin, numericMax }
      : {}),
    ...(columnType === 'date' && dateMin !== undefined && dateMax !== undefined
      ? { dateMin, dateMax }
      : {}),
  }
}

/**
 * Format cell value for display
 */
export function formatCellValue(
  value: unknown,
  type: ColumnStats['type'],
  numberFormat: NumberFormat = 'us',
  dateFormat: DateFormat = 'iso',
): string {
  if (value === null || value === undefined)
    return ''
  if (value === '')
    return ''

  switch (type) {
    case 'number': {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(num))
        return String(value)
      return formatNumber(num, numberFormat)
    }
    case 'date':
      return formatDate(value, dateFormat)
    case 'boolean':
      return value ? 'Yes' : 'No'
    default:
      return String(value)
  }
}

/**
 * Format number for display with appropriate precision
 */
export function formatNumber(value: number | null, format: NumberFormat = 'us', options?: { maximumFractionDigits?: number }): string {
  if (value === null)
    return '-'

  const maxDigits = options?.maximumFractionDigits ?? (Math.abs(value) >= 1000 ? 2 : 4)

  switch (format) {
    case 'eu':
      return value.toLocaleString('de-DE', { maximumFractionDigits: maxDigits })
    case 'plain':
      return Number.isInteger(value) ? String(value) : value.toFixed(Math.min(maxDigits, 20))
    case 'us':
    default:
      return value.toLocaleString('en-US', { maximumFractionDigits: maxDigits })
  }
}

/**
 * Format date according to the specified format preset
 */
export function formatDate(value: unknown, format: DateFormat = 'iso'): string {
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime()))
    return String(value)

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  switch (format) {
    case 'us':
      return `${month}/${day}/${year}`
    case 'eu':
      return `${day}/${month}/${year}`
    case 'iso':
    default:
      return `${year}-${month}-${day}`
  }
}

/**
 * Parse a date string in the given format back to an ISO string (YYYY-MM-DD)
 * Returns null if parsing fails
 */
export function parseDateInput(input: string, format: DateFormat = 'iso'): string | null {
  const trimmed = input.trim()
  if (!trimmed)
    return null

  let year: number, month: number, day: number

  switch (format) {
    case 'us': {
      const parts = trimmed.split('/')
      if (parts.length !== 3)
        return null
      month = Number.parseInt(parts[0], 10)
      day = Number.parseInt(parts[1], 10)
      year = Number.parseInt(parts[2], 10)
      break
    }
    case 'eu': {
      const parts = trimmed.split('/')
      if (parts.length !== 3)
        return null
      day = Number.parseInt(parts[0], 10)
      month = Number.parseInt(parts[1], 10)
      year = Number.parseInt(parts[2], 10)
      break
    }
    case 'iso':
    default: {
      const parts = trimmed.split('-')
      if (parts.length !== 3)
        return null
      year = Number.parseInt(parts[0], 10)
      month = Number.parseInt(parts[1], 10)
      day = Number.parseInt(parts[2], 10)
      break
    }
  }

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day))
    return null
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1)
    return null

  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null

  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/**
 * Get the date format placeholder string
 */
export function getDatePlaceholder(format: DateFormat = 'iso'): string {
  switch (format) {
    case 'us': return 'MM/DD/YYYY'
    case 'eu': return 'DD/MM/YYYY'
    case 'iso':
    default: return 'YYYY-MM-DD'
  }
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
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId)
      clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
