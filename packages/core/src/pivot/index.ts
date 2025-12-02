/**
 * TinyPivot Core - Pivot Table Logic
 * Pure pivot table computation with no framework dependencies
 */
import type {
  AggregationFunction,
  FieldStats,
  PivotCell,
  PivotConfig,
  PivotResult,
  PivotValueField,
} from '../types'
import { detectFieldType, makeKey, parseKey } from '../utils'

/**
 * Aggregate values based on function type
 */
export function aggregate(values: number[], fn: AggregationFunction): number | null {
  if (values.length === 0) return null

  switch (fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'count':
      return values.length
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    case 'countDistinct':
      return new Set(values).size
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

/**
 * Format aggregated value for display
 */
export function formatAggregatedValue(value: number | null, fn: AggregationFunction): string {
  if (value === null) return '-'

  if (fn === 'count' || fn === 'countDistinct') {
    return Math.round(value).toLocaleString()
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/**
 * Get aggregation function display label
 */
export function getAggregationLabel(fn: AggregationFunction): string {
  const labels: Record<AggregationFunction, string> = {
    sum: 'Sum',
    count: 'Count',
    avg: 'Average',
    min: 'Min',
    max: 'Max',
    countDistinct: 'Count Distinct',
  }
  return labels[fn]
}

/**
 * Get aggregation function symbol
 */
export function getAggregationSymbol(fn: AggregationFunction): string {
  const symbols: Record<AggregationFunction, string> = {
    sum: 'Σ',
    count: '#',
    avg: 'x̄',
    min: '↓',
    max: '↑',
    countDistinct: '◇',
  }
  return symbols[fn]
}

/**
 * Aggregation options for UI
 */
export const AGGREGATION_OPTIONS: Array<{
  value: AggregationFunction
  label: string
  symbol: string
}> = [
  { value: 'sum', label: 'Sum', symbol: 'Σ' },
  { value: 'count', label: 'Count', symbol: '#' },
  { value: 'avg', label: 'Avg', symbol: 'x̄' },
  { value: 'min', label: 'Min', symbol: '↓' },
  { value: 'max', label: 'Max', symbol: '↑' },
  { value: 'countDistinct', label: 'Unique', symbol: '◇' },
]

/**
 * Compute available fields from data
 */
export function computeAvailableFields(data: Record<string, unknown>[]): FieldStats[] {
  if (data.length === 0) return []

  const keys = Object.keys(data[0])
  return keys.map(field => detectFieldType(data, field))
}

/**
 * Get unassigned fields (not in row, column, or value fields)
 */
export function getUnassignedFields(
  availableFields: FieldStats[],
  rowFields: string[],
  columnFields: string[],
  valueFields: PivotValueField[]
): FieldStats[] {
  const assigned = new Set([
    ...rowFields,
    ...columnFields,
    ...valueFields.map(v => v.field),
  ])
  return availableFields.filter(f => !assigned.has(f.field))
}

/**
 * Check if pivot is configured
 */
export function isPivotConfigured(config: PivotConfig): boolean {
  return (config.rowFields.length > 0 || config.columnFields.length > 0) && config.valueFields.length > 0
}

/**
 * Build pivot result from data and config
 */
export function computePivotResult(
  data: Record<string, unknown>[],
  config: PivotConfig
): PivotResult | null {
  const { rowFields, columnFields, valueFields, showRowTotals, showColumnTotals } = config

  if (!isPivotConfigured(config)) return null
  if (data.length === 0) return null

  // Collect unique row and column keys
  const rowKeySet = new Set<string>()
  const colKeySet = new Set<string>()

  // Group data by row and column keys
  const dataMap = new Map<string, Map<string, number[][]>>()

  for (const row of data) {
    const rowKey = rowFields.length > 0 ? makeKey(row, rowFields) : '__all__'
    const colKey = columnFields.length > 0 ? makeKey(row, columnFields) : '__all__'

    rowKeySet.add(rowKey)
    colKeySet.add(colKey)

    if (!dataMap.has(rowKey)) {
      dataMap.set(rowKey, new Map())
    }
    const colMap = dataMap.get(rowKey)!

    if (!colMap.has(colKey)) {
      colMap.set(colKey, valueFields.map(() => []))
    }
    const valueArrays = colMap.get(colKey)!

    // Collect values for each value field
    for (let i = 0; i < valueFields.length; i++) {
      const vf = valueFields[i]
      const val = row[vf.field]
      if (val !== null && val !== undefined && val !== '') {
        const num = typeof val === 'number' ? val : Number.parseFloat(String(val))
        if (!Number.isNaN(num)) {
          valueArrays[i].push(num)
        } else if (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') {
          valueArrays[i].push(1)
        }
      }
    }
  }

  // Sort keys
  const rowKeys = Array.from(rowKeySet).sort()
  const colKeys = Array.from(colKeySet).sort()

  // Build column headers
  const headers: string[][] = []
  if (columnFields.length > 0) {
    for (let level = 0; level < columnFields.length; level++) {
      const headerRow: string[] = []
      for (const colKey of colKeys) {
        const parts = parseKey(colKey)
        headerRow.push(parts[level] || '')
      }
      headers.push(headerRow)
    }
  }

  // If multiple value fields, add value field labels as last header row
  if (valueFields.length > 1 || headers.length === 0) {
    const valueLabels: string[] = []
    for (const colKey of colKeys) {
      for (const vf of valueFields) {
        valueLabels.push(`${vf.label || vf.field} (${getAggregationLabel(vf.aggregation)})`)
      }
    }
    if (colKeys.length === 1 && colKeys[0] === '__all__') {
      headers.push(
        valueFields.map(vf => `${vf.label || vf.field} (${getAggregationLabel(vf.aggregation)})`)
      )
    } else {
      headers.push(valueLabels)
    }
  }

  // Build row headers
  const rowHeaders: string[][] = rowKeys.map(key => {
    if (key === '__all__') return ['Total']
    return parseKey(key)
  })

  // Build data matrix
  const pivotData: PivotCell[][] = []
  const rowTotals: PivotCell[] = []
  const columnTotalsMap: Map<number, number[][]> = new Map()

  for (const rowKey of rowKeys) {
    const rowData: PivotCell[] = []
    const rowTotalValues: number[][] = valueFields.map(() => [])

    let colIndex = 0
    for (const colKey of colKeys) {
      const colMap = dataMap.get(rowKey)
      const valueArrays = colMap?.get(colKey) || valueFields.map(() => [])

      for (let i = 0; i < valueFields.length; i++) {
        const vf = valueFields[i]
        const values = valueArrays[i]
        const aggValue = aggregate(values, vf.aggregation)

        rowData.push({
          value: aggValue,
          count: values.length,
          formattedValue: formatAggregatedValue(aggValue, vf.aggregation),
        })

        rowTotalValues[i].push(...values)

        if (!columnTotalsMap.has(colIndex)) {
          columnTotalsMap.set(colIndex, valueFields.map(() => []))
        }
        columnTotalsMap.get(colIndex)![i].push(...values)

        colIndex++
      }
    }

    pivotData.push(rowData)

    if (showRowTotals && colKeys.length > 1) {
      const totalCell: PivotCell = {
        value: null,
        count: 0,
        formattedValue: '-',
      }

      if (valueFields.length > 0) {
        const vf = valueFields[0]
        const allValues = rowTotalValues[0]
        const aggValue = aggregate(allValues, vf.aggregation)
        totalCell.value = aggValue
        totalCell.count = allValues.length
        totalCell.formattedValue = formatAggregatedValue(aggValue, vf.aggregation)
      }

      rowTotals.push(totalCell)
    }
  }

  // Calculate column totals
  const columnTotals: PivotCell[] = []
  if (showColumnTotals && rowKeys.length > 1) {
    for (let colIdx = 0; colIdx < colKeys.length * valueFields.length; colIdx++) {
      const valueIdx = colIdx % valueFields.length
      const vf = valueFields[valueIdx]

      const allColValues: number[] = []
      for (const rowKey of rowKeys) {
        const colMap = dataMap.get(rowKey)
        const colKey = colKeys[Math.floor(colIdx / valueFields.length)]
        const valueArrays = colMap?.get(colKey) || valueFields.map(() => [])
        allColValues.push(...valueArrays[valueIdx])
      }

      const aggValue = aggregate(allColValues, vf.aggregation)
      columnTotals.push({
        value: aggValue,
        count: allColValues.length,
        formattedValue: formatAggregatedValue(aggValue, vf.aggregation),
      })
    }
  }

  // Grand total
  const grandTotal: PivotCell = { value: null, count: 0, formattedValue: '-' }
  if (showRowTotals && showColumnTotals && valueFields.length > 0) {
    const vf = valueFields[0]
    const allValues: number[] = []

    for (const row of data) {
      const val = row[vf.field]
      if (val !== null && val !== undefined && val !== '') {
        const num = typeof val === 'number' ? val : Number.parseFloat(String(val))
        if (!Number.isNaN(num)) {
          allValues.push(num)
        } else if (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') {
          allValues.push(1)
        }
      }
    }

    const aggValue = aggregate(allValues, vf.aggregation)
    grandTotal.value = aggValue
    grandTotal.count = allValues.length
    grandTotal.formattedValue = formatAggregatedValue(aggValue, vf.aggregation)
  }

  return {
    headers,
    rowHeaders,
    data: pivotData,
    rowTotals,
    columnTotals,
    grandTotal,
  }
}

// Storage helpers for pivot config persistence
const STORAGE_KEY_PREFIX = 'vpg-pivot-'

/**
 * Generate a storage key based on column names
 */
export function generateStorageKey(columns: string[]): string {
  const sorted = [...columns].sort()
  const hash = sorted.join('|').substring(0, 100)
  return `${STORAGE_KEY_PREFIX}${hash}`
}

/**
 * Save pivot config to sessionStorage
 */
export function savePivotConfig(key: string, config: PivotConfig): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(config))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load pivot config from sessionStorage
 */
export function loadPivotConfig(key: string): PivotConfig | null {
  try {
    const stored = sessionStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as PivotConfig
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Check if config fields exist in available fields
 */
export function isConfigValidForFields(config: PivotConfig, availableFieldNames: string[]): boolean {
  const available = new Set(availableFieldNames)
  const allConfiguredFields = [
    ...config.rowFields,
    ...config.columnFields,
    ...config.valueFields.map(v => v.field),
  ]
  return allConfiguredFields.every(f => available.has(f))
}

