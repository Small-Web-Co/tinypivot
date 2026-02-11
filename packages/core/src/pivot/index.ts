/**
 * TinyPivot Core - Pivot Table Logic
 * Pure pivot table computation with no framework dependencies
 */
import type {
  AggregationFunction,
  CalculatedField,
  CustomAggregationFn,
  FieldStats,
  NumberFormat,
  PivotCell,
  PivotConfig,
  PivotResult,
  PivotValueField,
} from '../types'
import { detectFieldType, formatNumber, makeKey, parseKey } from '../utils'

/**
 * Calculate median of an array
 */
function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Calculate standard deviation of an array
 */
function calculateStdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map(v => (v - mean) ** 2)
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(avgSquaredDiff)
}

/**
 * Aggregate values based on function type
 * @param values - Array of values to aggregate
 * @param fn - Aggregation function to apply
 * @param grandTotal - Optional grand total for percentOfTotal calculation
 * @param customFn - Optional custom aggregation function
 * @param allFieldValues - Optional all field values for cross-field custom calculations
 */
export function aggregate(
  values: number[],
  fn: AggregationFunction,
  grandTotal?: number,
  customFn?: CustomAggregationFn,
  allFieldValues?: Record<string, number[]>,
): number | null {
  if (values.length === 0 && fn !== 'custom')
    return null

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
    case 'median':
      return calculateMedian(values)
    case 'stdDev':
      return calculateStdDev(values)
    case 'percentOfTotal': {
      const sum = values.reduce((a, b) => a + b, 0)
      if (grandTotal === undefined || grandTotal === 0)
        return null
      return (sum / grandTotal) * 100
    }
    case 'custom':
      if (customFn) {
        try {
          return customFn(values, allFieldValues)
        }
        catch {
          return null
        }
      }
      return null
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

/**
 * Format aggregated value for display
 */
export function formatAggregatedValue(value: number | null, fn: AggregationFunction, numberFormat: NumberFormat = 'us'): string {
  if (value === null)
    return '-'

  if (fn === 'count' || fn === 'countDistinct') {
    return formatNumber(Math.round(value), numberFormat, { maximumFractionDigits: 0 })
  }

  if (fn === 'percentOfTotal') {
    return `${value.toFixed(1)}%`
  }

  return formatNumber(value, numberFormat)
}

/**
 * Get aggregation function display label
 */
export function getAggregationLabel(fn: AggregationFunction, customLabel?: string): string {
  if (fn === 'custom' && customLabel)
    return customLabel
  const labels: Record<AggregationFunction, string> = {
    sum: 'Sum',
    count: 'Count',
    avg: 'Average',
    min: 'Min',
    max: 'Max',
    countDistinct: 'Count Distinct',
    median: 'Median',
    stdDev: 'Std Dev',
    percentOfTotal: '% of Total',
    custom: 'Custom',
  }
  return labels[fn]
}

/**
 * Get aggregation function symbol
 */
export function getAggregationSymbol(fn: AggregationFunction, customSymbol?: string): string {
  if (fn === 'custom' && customSymbol)
    return customSymbol
  const symbols: Record<AggregationFunction, string> = {
    sum: 'Σ',
    count: '#',
    avg: 'x̄',
    min: '↓',
    max: '↑',
    countDistinct: '◇',
    median: 'M̃',
    stdDev: 'σ',
    percentOfTotal: '%Σ',
    custom: 'ƒ',
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
  { value: 'median', label: 'Median', symbol: 'M̃' },
  { value: 'stdDev', label: 'Std Dev', symbol: 'σ' },
  { value: 'percentOfTotal', label: '% of Total', symbol: '%Σ' },
]

// ============================================
// Calculated Fields & Formula Parsing
// ============================================

/**
 * Supported functions in calculated field formulas
 */
export const FORMULA_FUNCTIONS = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'MEDIAN'] as const
export type FormulaFunction = typeof FORMULA_FUNCTIONS[number]

/**
 * Parse a formula and extract field references
 * e.g., "SUM(revenue) / SUM(units)" -> [{fn: 'SUM', field: 'revenue'}, {fn: 'SUM', field: 'units'}]
 */
export function parseFormula(formula: string): Array<{ fn: FormulaFunction, field: string }> {
  const regex = /(SUM|AVG|MIN|MAX|COUNT|MEDIAN)\s*\(\s*([^)]+)\s*\)/gi
  const matches: Array<{ fn: FormulaFunction, field: string }> = []
  let match

  while ((match = regex.exec(formula)) !== null) {
    matches.push({
      fn: match[1].toUpperCase() as FormulaFunction,
      field: match[2].trim(),
    })
  }

  return matches
}

/**
 * Evaluate a calculated field formula with aggregated values
 * @param formula - Formula string like "SUM(revenue) / SUM(units) * 100"
 * @param aggregatedValues - Map of "FN(field)" to aggregated value
 * @returns Calculated value or null if evaluation fails
 */
export function evaluateFormula(
  formula: string,
  aggregatedValues: Record<string, number | null>,
): number | null {
  try {
    // Replace function calls with their values
    let expression = formula

    for (const [key, value] of Object.entries(aggregatedValues)) {
      if (value === null)
        return null
      // Escape special regex characters in key and replace
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expression = expression.replace(new RegExp(escaped, 'gi'), String(value))
    }

    // Safety check - only allow numbers, operators, parentheses, and whitespace
    if (!/^[\d\s.+\-*/()]+$/.test(expression)) {
      console.warn('Invalid formula expression:', expression)
      return null
    }

    // Evaluate the expression
    // Using Function constructor for safe math evaluation
    const result = new Function(`return (${expression})`)()

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return null
    }

    return result
  }
  catch (error) {
    console.warn('Formula evaluation error:', error)
    return null
  }
}

/**
 * Format calculated field value based on format type
 */
export function formatCalculatedValue(
  value: number | null,
  formatAs?: 'number' | 'percent' | 'currency',
  decimals = 2,
  numberFormat: NumberFormat = 'us',
): string {
  if (value === null)
    return '-'

  switch (formatAs) {
    case 'percent':
      return `${value.toFixed(decimals)}%`
    case 'currency':
      return formatNumber(value, numberFormat, { maximumFractionDigits: decimals })
    default:
      return formatNumber(value, numberFormat, { maximumFractionDigits: decimals })
  }
}

/**
 * Validate a calculated field formula
 * @returns Error message if invalid, null if valid
 */
export function validateFormula(formula: string, availableFields: string[]): string | null {
  if (!formula.trim()) {
    return 'Formula cannot be empty'
  }

  const references = parseFormula(formula)

  if (references.length === 0) {
    return 'Formula must contain at least one function like SUM(field)'
  }

  // Case-insensitive field matching
  const lowerFields = availableFields.map(f => f.toLowerCase())

  for (const ref of references) {
    const fieldLower = ref.field.toLowerCase()
    if (!lowerFields.includes(fieldLower)) {
      return `Unknown field: ${ref.field}`
    }
  }

  // Try to evaluate with dummy values to check syntax
  const dummyValues: Record<string, number> = {}
  for (const ref of references) {
    dummyValues[`${ref.fn}(${ref.field})`] = 1
  }

  const result = evaluateFormula(formula, dummyValues)
  if (result === null) {
    return 'Invalid formula syntax'
  }

  return null
}

/**
 * Parse a simple formula to extract field references (no aggregation functions)
 * e.g., "sales / units" -> ["sales", "units"]
 */
export function parseSimpleFormula(formula: string): string[] {
  // Match word characters that could be field names (not operators or numbers)
  const matches = formula.match(/[a-z_]\w*/gi) || []
  // Filter out common keywords/operators
  const keywords = ['true', 'false', 'null', 'undefined']
  return [...new Set(matches.filter(m => !keywords.includes(m.toLowerCase())))]
}

/**
 * Validate a simple formula (field math, no aggregation functions)
 */
export function validateSimpleFormula(formula: string, availableFields: string[]): string | null {
  if (!formula.trim()) {
    return 'Formula is required'
  }

  const referencedFields = parseSimpleFormula(formula)

  if (referencedFields.length === 0) {
    return 'Formula must reference at least one field'
  }

  // Case-insensitive field matching
  const lowerFields = availableFields.map(f => f.toLowerCase())

  for (const field of referencedFields) {
    if (!lowerFields.includes(field.toLowerCase())) {
      return `Unknown field: ${field}`
    }
  }

  // Test that the formula is valid JavaScript
  try {
    // Replace field names with dummy values
    let testExpr = formula
    for (const field of referencedFields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      testExpr = testExpr.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '1')
    }

    new Function(`return ${testExpr}`)
  }
  catch {
    return 'Invalid formula syntax'
  }

  return null
}

/**
 * Evaluate a simple formula for a single row of data
 */
export function evaluateSimpleFormula(
  formula: string,
  row: Record<string, unknown>,
  fieldNames: string[],
): number | null {
  try {
    const referencedFields = parseSimpleFormula(formula)
    let expression = formula

    for (const field of referencedFields) {
      // Find actual field name (case-insensitive)
      const actualField = fieldNames.find(f => f.toLowerCase() === field.toLowerCase()) || field
      const value = row[actualField]

      if (value === null || value === undefined || value === '') {
        return null // Can't compute if any referenced field is missing
      }

      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(num)) {
        return null
      }

      // Replace field name with value
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expression = expression.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), String(num))
    }

    // Safety check - only allow numbers, operators, parentheses
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      return null
    }

    const result = new Function(`return ${expression}`)()
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  }
  catch {
    return null
  }
}

/**
 * Create common calculated field presets
 */
export const CALCULATED_FIELD_PRESETS = [
  {
    name: 'Profit Margin %',
    formula: 'SUM(profit) / SUM(revenue) * 100',
    formatAs: 'percent' as const,
    description: 'Profit as percentage of revenue',
  },
  {
    name: 'Average Price',
    formula: 'SUM(revenue) / SUM(units)',
    formatAs: 'currency' as const,
    description: 'Revenue per unit sold',
  },
  {
    name: 'Growth Rate',
    formula: '(SUM(current) - SUM(previous)) / SUM(previous) * 100',
    formatAs: 'percent' as const,
    description: 'Percentage change between periods',
  },
]

/**
 * Compute available fields from data
 */
export function computeAvailableFields(data: Record<string, unknown>[]): FieldStats[] {
  if (data.length === 0)
    return []

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
  valueFields: PivotValueField[],
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
  config: PivotConfig,
): PivotResult | null {
  const { rowFields, columnFields, valueFields, showRowTotals, showColumnTotals, calculatedFields } = config

  if (!isPivotConfigured(config))
    return null
  if (data.length === 0)
    return null

  // Build a map of calculated field IDs to their definitions
  const calcFieldMap = new Map<string, CalculatedField>()
  if (calculatedFields) {
    for (const cf of calculatedFields) {
      calcFieldMap.set(cf.id, cf)
    }
  }

  // Get all field names from data for formula evaluation
  const allDataFieldNames = data.length > 0 ? Object.keys(data[0]) : []

  // Collect unique row and column keys
  const rowKeySet = new Set<string>()
  const colKeySet = new Set<string>()

  // Group data by row and column keys
  // Each value field (regular or calculated) gets its own array of values
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
      let num: number | null = null

      if (vf.field.startsWith('calc:')) {
        // Calculated field - evaluate formula for this row
        const calcId = vf.field.replace('calc:', '')
        const calcDef = calcFieldMap.get(calcId)
        if (calcDef) {
          num = evaluateSimpleFormula(calcDef.formula, row, allDataFieldNames)
        }
      }
      else {
        // Regular field - get value directly
        const val = row[vf.field]
        if (val !== null && val !== undefined && val !== '') {
          num = typeof val === 'number' ? val : Number.parseFloat(String(val))
          if (Number.isNaN(num)) {
            num = (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') ? 1 : null
          }
        }
      }

      if (num !== null) {
        valueArrays[i].push(num)
      }
    }
  }

  // Sort keys
  const rowKeys = Array.from(rowKeySet).sort()
  const colKeys = Array.from(colKeySet).sort()

  // Pre-calculate grand totals for percentOfTotal calculations
  const grandTotals: number[] = valueFields.map((vf, _i) => {
    let total = 0
    for (const row of data) {
      let num: number | null = null

      if (vf.field.startsWith('calc:')) {
        const calcId = vf.field.replace('calc:', '')
        const calcDef = calcFieldMap.get(calcId)
        if (calcDef) {
          num = evaluateSimpleFormula(calcDef.formula, row, allDataFieldNames)
        }
      }
      else {
        const val = row[vf.field]
        if (val !== null && val !== undefined && val !== '') {
          num = typeof val === 'number' ? val : Number.parseFloat(String(val))
          if (Number.isNaN(num))
            num = null
        }
      }

      if (num !== null)
        total += num
    }
    return total
  })

  // Helper to get value field display label
  function getValueFieldLabel(vf: PivotValueField): string {
    if (vf.field.startsWith('calc:')) {
      const calcId = vf.field.replace('calc:', '')
      const calcDef = calcFieldMap.get(calcId)
      const name = calcDef?.name || vf.field
      return `${name} (${getAggregationLabel(vf.aggregation)})`
    }
    return `${vf.label || vf.field} (${getAggregationLabel(vf.aggregation)})`
  }

  // Build column headers
  // When there are multiple value fields, each column header must be repeated
  // for each value field so the headers align with the data columns
  const headers: string[][] = []
  if (columnFields.length > 0) {
    const repeatCount = valueFields.length > 1 ? valueFields.length : 1
    for (let level = 0; level < columnFields.length; level++) {
      const headerRow: string[] = []
      for (const colKey of colKeys) {
        const parts = parseKey(colKey)
        // Repeat header for each value field
        for (let i = 0; i < repeatCount; i++) {
          headerRow.push(parts[level] || '')
        }
      }
      headers.push(headerRow)
    }
  }

  // If multiple value fields, add value field labels as last header row
  if (valueFields.length > 1 || headers.length === 0) {
    const valueLabels: string[] = []
    for (const _colKey of colKeys) {
      for (const vf of valueFields) {
        valueLabels.push(getValueFieldLabel(vf))
      }
    }
    if (colKeys.length === 1 && colKeys[0] === '__all__') {
      headers.push(
        valueFields.map(vf => getValueFieldLabel(vf)),
      )
    }
    else {
      headers.push(valueLabels)
    }
  }

  // Build row headers
  const rowHeaders: string[][] = rowKeys.map((key) => {
    if (key === '__all__')
      return ['Total']
    return parseKey(key)
  })

  // Build data matrix
  const pivotData: PivotCell[][] = []
  const rowTotals: PivotCell[] = []
  const columnTotalsMap: Map<string, number[][]> = new Map() // colKey -> raw values

  for (const rowKey of rowKeys) {
    const rowData: PivotCell[] = []
    // Collect all raw values for this row (for row totals)
    const rowAllValues: number[][] = valueFields.map(() => [])

    for (const colKey of colKeys) {
      const colMap = dataMap.get(rowKey)
      const rawValues = colMap?.get(colKey) || valueFields.map(() => [])

      // Accumulate for row totals
      for (let fi = 0; fi < rawValues.length; fi++) {
        rowAllValues[fi].push(...rawValues[fi])
      }

      // Accumulate for column totals
      if (!columnTotalsMap.has(colKey)) {
        columnTotalsMap.set(colKey, valueFields.map(() => []))
      }
      const colTotals = columnTotalsMap.get(colKey)!
      for (let fi = 0; fi < rawValues.length; fi++) {
        colTotals[fi].push(...rawValues[fi])
      }

      // Compute cell for each value field
      for (let vfIdx = 0; vfIdx < valueFields.length; vfIdx++) {
        const vf = valueFields[vfIdx]
        const values = rawValues[vfIdx] || []
        const gtValue = grandTotals[vfIdx]
        const aggValue = aggregate(values, vf.aggregation, gtValue)

        // Format based on whether it's a calculated field
        let formattedValue: string
        if (vf.field.startsWith('calc:')) {
          const calcId = vf.field.replace('calc:', '')
          const calcDef = calcFieldMap.get(calcId)
          formattedValue = formatCalculatedValue(aggValue, calcDef?.formatAs || 'number', calcDef?.decimals ?? 2)
        }
        else {
          formattedValue = formatAggregatedValue(aggValue, vf.aggregation)
        }

        rowData.push({
          value: aggValue,
          count: values.length,
          formattedValue,
        })
      }
    }

    pivotData.push(rowData)

    // Compute row total (using first value field for now)
    if (showRowTotals && colKeys.length > 1) {
      if (valueFields.length > 0) {
        const vf = valueFields[0]
        const values = rowAllValues[0] || []
        const aggValue = aggregate(values, vf.aggregation, grandTotals[0])
        rowTotals.push({
          value: aggValue,
          count: values.length,
          formattedValue: formatAggregatedValue(aggValue, vf.aggregation),
        })
      }
      else {
        rowTotals.push({ value: null, count: 0, formattedValue: '-' })
      }
    }
  }

  // Calculate column totals
  const columnTotals: PivotCell[] = []
  if (showColumnTotals && rowKeys.length > 1) {
    for (const colKey of colKeys) {
      const colRawValues = columnTotalsMap.get(colKey) || valueFields.map(() => [])
      for (let vfIdx = 0; vfIdx < valueFields.length; vfIdx++) {
        const vf = valueFields[vfIdx]
        const values = colRawValues[vfIdx] || []
        const aggValue = aggregate(values, vf.aggregation, grandTotals[vfIdx])
        columnTotals.push({
          value: aggValue,
          count: values.length,
          formattedValue: formatAggregatedValue(aggValue, vf.aggregation),
        })
      }
    }
  }

  // Grand total - collect all values across entire dataset
  const grandTotal: PivotCell = { value: null, count: 0, formattedValue: '-' }
  if (showRowTotals && showColumnTotals && valueFields.length > 0) {
    // Collect all raw values from the entire dataset
    const allRawValues: number[][] = valueFields.map(() => [])
    for (const rowKey of rowKeys) {
      const colMap = dataMap.get(rowKey)
      if (colMap) {
        for (const colKey of colKeys) {
          const vals = colMap.get(colKey)
          if (vals) {
            for (let fi = 0; fi < vals.length; fi++) {
              allRawValues[fi].push(...vals[fi])
            }
          }
        }
      }
    }

    const vf = valueFields[0]
    const values = allRawValues[0] || []
    const aggValue = aggregate(values, vf.aggregation, grandTotals[0])
    grandTotal.value = aggValue
    grandTotal.count = values.length
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
  }
  catch {
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
  }
  catch {
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
  // Filter out calculated fields (they start with 'calc:')
  return allConfiguredFields
    .filter(f => !f.startsWith('calc:'))
    .every(f => available.has(f))
}

// Calculated Fields Storage
const CALC_FIELDS_KEY = 'vpg-calculated-fields'

/**
 * Save calculated fields to localStorage (persists across sessions)
 */
export function saveCalculatedFields(fields: CalculatedField[]): void {
  try {
    localStorage.setItem(CALC_FIELDS_KEY, JSON.stringify(fields))
  }
  catch {
    // Ignore storage errors
  }
}

/**
 * Load calculated fields from localStorage
 */
export function loadCalculatedFields(): CalculatedField[] {
  try {
    const stored = localStorage.getItem(CALC_FIELDS_KEY)
    if (stored) {
      return JSON.parse(stored) as CalculatedField[]
    }
  }
  catch {
    // Ignore parse errors
  }
  return []
}

/**
 * Add a calculated field to storage
 */
export function addCalculatedField(field: CalculatedField): CalculatedField[] {
  const fields = loadCalculatedFields()
  const existing = fields.findIndex(f => f.id === field.id)
  if (existing >= 0) {
    fields[existing] = field
  }
  else {
    fields.push(field)
  }
  saveCalculatedFields(fields)
  return fields
}

/**
 * Remove a calculated field from storage
 */
export function removeCalculatedField(id: string): CalculatedField[] {
  const fields = loadCalculatedFields().filter(f => f.id !== id)
  saveCalculatedFields(fields)
  return fields
}
