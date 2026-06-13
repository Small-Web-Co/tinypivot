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
  PivotGroupStart,
  PivotResult,
  PivotRowMeta,
  PivotValueField,
} from '../types'
import { detectFieldType, formatNumber, makeKey, parseKey } from '../utils'

export { getDrillThroughRows } from './drillthrough'

// ============================================================
// Path key helpers (NUL-separated, collision-safe)
// ============================================================

const PATH_SEP = '\0'

/**
 * Join row-field values into a collision-safe path key.
 * Uses NUL (\0) as separator — a character that cannot appear in typical data values.
 */
export function pathKey(values: string[]): string {
  return values.join(PATH_SEP)
}

/**
 * Parse a path key back to its component values.
 */
export function parsePathKey(key: string): string[] {
  if (key === '')
    return []
  return key.split(PATH_SEP)
}

// ============================================================
// Collapse options
// ============================================================

export interface ComputePivotOptions {
  /** Set of pathKey strings for currently collapsed row groups */
  collapsedPaths?: Set<string>
}

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
      return `$${formatNumber(value, numberFormat, { maximumFractionDigits: decimals })}`
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

/** Extract a numeric value from a data row for a given value field definition */
function extractNumericValue(
  row: Record<string, unknown>,
  vf: PivotValueField,
  calcFieldMap: Map<string, CalculatedField>,
  allDataFieldNames: string[],
): number | null {
  if (vf.field.startsWith('calc:')) {
    const calcId = vf.field.replace('calc:', '')
    const calcDef = calcFieldMap.get(calcId)
    return calcDef ? evaluateSimpleFormula(calcDef.formula, row, allDataFieldNames) : null
  }
  const val = row[vf.field]
  if (val === null || val === undefined || val === '')
    return null
  const num = typeof val === 'number' ? val : Number.parseFloat(String(val))
  if (Number.isNaN(num))
    return (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') ? 1 : null
  return num
}

/** Merge all raw leaf values for a colKey and return per-value-field arrays */
function mergeLeafValues(
  leafRowKeys: string[],
  leafDataMap: Map<string, Map<string, number[][]>>,
  colKeys: string[],
  fieldCount: number,
): number[][] {
  const merged: number[][] = Array.from({ length: fieldCount }, () => [])
  for (const lk of leafRowKeys) {
    const colMap = leafDataMap.get(lk)
    if (!colMap)
      continue
    for (const colKey of colKeys) {
      const vals = colMap.get(colKey)
      if (!vals)
        continue
      for (let fi = 0; fi < vals.length; fi++) {
        merged[fi].push(...vals[fi])
      }
    }
  }
  return merged
}

/** Compute the grand total PivotCell (always over all leaf source rows) */
function buildGrandTotal(
  leafRowKeys: string[],
  leafDataMap: Map<string, Map<string, number[][]>>,
  colKeys: string[],
  valueFields: PivotValueField[],
  grandTotals: number[],
  calcFieldMap: Map<string, CalculatedField>,
  showRowTotals: boolean,
  showColumnTotals: boolean,
): PivotCell {
  const empty: PivotCell = { value: null, count: 0, formattedValue: '-' }
  if (!showRowTotals || !showColumnTotals || valueFields.length === 0)
    return empty

  const allRawValues = mergeLeafValues(leafRowKeys, leafDataMap, colKeys, valueFields.length)
  const vf = valueFields[0]
  const values = allRawValues[0] ?? []
  return buildCell(values, vf, grandTotals[0], calcFieldMap)
}

/** Compute a formatted PivotCell from raw numeric values */
function buildCell(
  values: number[],
  vf: PivotValueField,
  grandTotal: number,
  calcFieldMap: Map<string, CalculatedField>,
): PivotCell {
  const aggValue = aggregate(values, vf.aggregation, grandTotal)
  let formattedValue: string
  if (vf.field.startsWith('calc:')) {
    const calcId = vf.field.replace('calc:', '')
    const calcDef = calcFieldMap.get(calcId)
    formattedValue = formatCalculatedValue(aggValue, calcDef?.formatAs || 'number', calcDef?.decimals ?? 2)
  }
  else {
    formattedValue = formatAggregatedValue(aggValue, vf.aggregation)
  }
  return { value: aggValue, count: values.length, formattedValue }
}

/**
 * Build pivot result from data and config.
 * Optional third argument supports collapse-aware output with row metadata.
 */
export function computePivotResult(
  data: Record<string, unknown>[],
  config: PivotConfig,
  options: ComputePivotOptions = {},
): PivotResult | null {
  const { rowFields, columnFields, valueFields, showRowTotals, showColumnTotals, calculatedFields } = config
  const collapsedPaths = options.collapsedPaths ?? new Set<string>()

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

  const allDataFieldNames = data.length > 0 ? Object.keys(data[0]) : []
  const colKeySet = new Set<string>()

  // leafDataMap: leaf rowKey → colKey → values per value field
  const leafDataMap = new Map<string, Map<string, number[][]>>()
  const leafRowKeySet = new Set<string>()

  for (const row of data) {
    const rowKey = rowFields.length > 0 ? makeKey(row, rowFields) : '__all__'
    const colKey = columnFields.length > 0 ? makeKey(row, columnFields) : '__all__'

    leafRowKeySet.add(rowKey)
    colKeySet.add(colKey)

    if (!leafDataMap.has(rowKey))
      leafDataMap.set(rowKey, new Map())
    const colMap = leafDataMap.get(rowKey)!

    if (!colMap.has(colKey))
      colMap.set(colKey, valueFields.map(() => []))
    const valueArrays = colMap.get(colKey)!

    for (let i = 0; i < valueFields.length; i++) {
      const num = extractNumericValue(row, valueFields[i], calcFieldMap, allDataFieldNames)
      if (num !== null)
        valueArrays[i].push(num)
    }
  }

  const leafRowKeys = Array.from(leafRowKeySet).sort()
  const colKeys = Array.from(colKeySet).sort()

  // Pre-calculate grand totals for percentOfTotal
  const grandTotals: number[] = valueFields.map((vf) => {
    let total = 0
    for (const row of data) {
      const num = extractNumericValue(row, vf, calcFieldMap, allDataFieldNames)
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
  const headers: string[][] = []
  if (columnFields.length > 0) {
    const repeatCount = valueFields.length > 1 ? valueFields.length : 1
    for (let level = 0; level < columnFields.length; level++) {
      const headerRow: string[] = []
      for (const colKey of colKeys) {
        const parts = parseKey(colKey)
        for (let i = 0; i < repeatCount; i++) {
          headerRow.push(parts[level] || '')
        }
      }
      headers.push(headerRow)
    }
  }
  if (valueFields.length > 1 || headers.length === 0) {
    if (colKeys.length === 1 && colKeys[0] === '__all__') {
      headers.push(valueFields.map(vf => getValueFieldLabel(vf)))
    }
    else {
      const valueLabels: string[] = []
      for (const _colKey of colKeys) {
        for (const vf of valueFields) {
          valueLabels.push(getValueFieldLabel(vf))
        }
      }
      headers.push(valueLabels)
    }
  }

  // -------------------------------------------------------
  // Tabular-form collapse semantics
  //
  // Default output: ONLY leaf rows, same order as master.
  // Each visible row carries `groupStarts` metadata so the UI
  // can place chevrons without extra injected group rows.
  //
  // Collapsed group: all its leaf rows are replaced by ONE
  // subtotal row (isSubtotal: true), aggregated over the full
  // group's source rows via the same aggregate() path.
  // -------------------------------------------------------

  // Build map: prefixKey → leaf rowKeys belonging to that group
  const groupLeafMap = new Map<string, string[]>()
  if (rowFields.length > 1) {
    for (const leafKey of leafRowKeys) {
      const parts = parseKey(leafKey)
      for (let depth = 1; depth < parts.length; depth++) {
        const prefixKey = pathKey(parts.slice(0, depth))
        const existing = groupLeafMap.get(prefixKey)
        if (existing) {
          existing.push(leafKey)
        }
        else {
          groupLeafMap.set(prefixKey, [leafKey])
        }
      }
    }
  }

  // Comparator for path-sorted row order (same as leaf key sort)
  function comparePaths(a: string[], b: string[]): number {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const cmp = a[i].localeCompare(b[i], undefined, { numeric: true, sensitivity: 'base' })
      if (cmp !== 0)
        return cmp
    }
    return a.length - b.length
  }

  // Determine which ancestor (if any) is collapsed — returns the deepest
  // collapsed ancestor path, or null if none.
  function collapsedAncestor(leafParts: string[]): string[] | null {
    // Check each prefix from shallowest to deepest
    for (let len = 1; len < leafParts.length; len++) {
      const prefix = leafParts.slice(0, len)
      if (collapsedPaths.has(pathKey(prefix)))
        return prefix
    }
    return null
  }

  // Build ordered visible rows in tabular form.
  // Each entry is either a normal leaf or a collapsed-group subtotal.
  interface RowEntry {
    rowPath: string[]
    leafKeys: string[]
    isSubtotal: boolean
  }

  function buildRowEntries(): RowEntry[] {
    if (rowFields.length <= 1) {
      return leafRowKeys.map((lk) => {
        const parts = lk === '__all__' ? ['Total'] : parseKey(lk)
        return { rowPath: parts, leafKeys: [lk], isSubtotal: false }
      })
    }

    const entries: RowEntry[] = []
    // Track which collapsed subtotals we've already emitted
    const emittedSubtotals = new Set<string>()

    for (const lk of leafRowKeys) {
      const parts = parseKey(lk)
      const ancestor = collapsedAncestor(parts)
      if (ancestor !== null) {
        // Leaf is hidden by a collapsed ancestor — emit ONE subtotal for that group
        const subtotalKey = pathKey(ancestor)
        if (emittedSubtotals.has(subtotalKey))
          continue
        emittedSubtotals.add(subtotalKey)
        const groupLeaves = groupLeafMap.get(subtotalKey) ?? []
        // Pad subtotal path to full rowFields width with empty strings
        const paddedPath = [...ancestor, ...Array.from<string>({ length: rowFields.length - ancestor.length }).fill('')]
        entries.push({ rowPath: paddedPath, leafKeys: groupLeaves, isSubtotal: true })
      }
      else {
        entries.push({ rowPath: parts, leafKeys: [lk], isSubtotal: false })
      }
    }

    // Sort all visible rows by path
    entries.sort((a, b) => comparePaths(a.rowPath, b.rowPath))
    return entries
  }

  const rowEntries = buildRowEntries()

  // Build groupStarts for each row entry.
  // A group at depth d starts at the first visible row whose path[0..d] matches that group.
  const seenGroupKeys = new Set<string>()

  function buildGroupStarts(entry: RowEntry): PivotGroupStart[] {
    // Only applies to multi-level hierarchies
    if (rowFields.length <= 1)
      return []
    const starts: PivotGroupStart[] = []
    // The effective path for a subtotal is the collapsed ancestor prefix
    const effectivePath = entry.isSubtotal
      ? entry.rowPath.slice(0, [...entry.rowPath].reduceRight((acc, v, i) => acc === -1 && v !== '' ? i : acc, -1) + 1)
      : entry.rowPath
    // Groups are at depths 0 … rowFields.length - 2 (not the leaf depth)
    const maxGroupDepth = rowFields.length - 2
    for (let depth = 0; depth <= maxGroupDepth; depth++) {
      if (depth >= effectivePath.length)
        break
      const groupPath = effectivePath.slice(0, depth + 1)
      const key = pathKey(groupPath)
      if (!seenGroupKeys.has(key)) {
        seenGroupKeys.add(key)
        starts.push({
          depth,
          path: groupPath,
          key,
          isCollapsed: collapsedPaths.has(key),
        })
      }
    }
    return starts
  }

  // Build rowHeaders and rowMeta
  const rowHeaders: string[][] = rowEntries.map(e => e.rowPath)

  const rowMeta: PivotRowMeta[] = rowEntries.map((e) => {
    return {
      path: e.rowPath,
      key: pathKey(e.rowPath),
      isSubtotal: e.isSubtotal,
      groupStarts: buildGroupStarts(e),
    }
  })

  // -------------------------------------------------------
  // Build data matrix
  // -------------------------------------------------------

  /** Get raw values for a set of leaf row keys + one column key */
  function getRawValues(leafKeys: string[], colKey: string): number[][] {
    const result: number[][] = valueFields.map(() => [])
    for (const lk of leafKeys) {
      const colMap = leafDataMap.get(lk)
      const vals = colMap?.get(colKey) ?? valueFields.map(() => [])
      for (let fi = 0; fi < vals.length; fi++) {
        result[fi].push(...vals[fi])
      }
    }
    return result
  }

  const pivotData: PivotCell[][] = []
  const rowTotals: PivotCell[] = []
  const columnTotalsMap: Map<string, number[][]> = new Map()

  for (const entry of rowEntries) {
    const rowData: PivotCell[] = []
    const rowAllValues: number[][] = valueFields.map(() => [])

    for (const colKey of colKeys) {
      const rawValues = getRawValues(entry.leafKeys, colKey)

      for (let fi = 0; fi < rawValues.length; fi++) {
        rowAllValues[fi].push(...rawValues[fi])
      }

      if (!columnTotalsMap.has(colKey))
        columnTotalsMap.set(colKey, valueFields.map(() => []))
      const colTotals = columnTotalsMap.get(colKey)!
      // Every visible row (leaf or subtotal) contributes to column totals.
      // No double-counting since each leaf key appears in exactly one visible row.
      for (let fi = 0; fi < rawValues.length; fi++) {
        colTotals[fi].push(...rawValues[fi])
      }

      for (let vfIdx = 0; vfIdx < valueFields.length; vfIdx++) {
        const vf = valueFields[vfIdx]
        const values = rawValues[vfIdx] ?? []
        rowData.push(buildCell(values, vf, grandTotals[vfIdx], calcFieldMap))
      }
    }

    pivotData.push(rowData)

    if (showRowTotals && colKeys.length > 1 && valueFields.length > 0) {
      const vf = valueFields[0]
      const values = rowAllValues[0] ?? []
      rowTotals.push(buildCell(values, vf, grandTotals[0], calcFieldMap))
    }
    else if (showRowTotals && colKeys.length > 1) {
      rowTotals.push({ value: null, count: 0, formattedValue: '-' })
    }
  }

  // Column totals: show when there are multiple visible rows
  const columnTotals: PivotCell[] = []
  if (showColumnTotals && rowEntries.length > 1) {
    for (const colKey of colKeys) {
      const colRawValues = columnTotalsMap.get(colKey) ?? valueFields.map(() => [])
      for (let vfIdx = 0; vfIdx < valueFields.length; vfIdx++) {
        const vf = valueFields[vfIdx]
        const values = colRawValues[vfIdx] ?? []
        columnTotals.push(buildCell(values, vf, grandTotals[vfIdx], calcFieldMap))
      }
    }
  }

  // Grand total (always over entire dataset — independent of collapse state)
  const grandTotal = buildGrandTotal(leafRowKeys, leafDataMap, colKeys, valueFields, grandTotals, calcFieldMap, showRowTotals, showColumnTotals)

  return {
    headers,
    rowHeaders,
    data: pivotData,
    rowTotals,
    columnTotals,
    grandTotal,
    rowMeta,
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
