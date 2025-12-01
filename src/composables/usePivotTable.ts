/**
 * Pivot Table Composable
 * Provides pivot table functionality with aggregation, row/column grouping
 */
import { type Ref, computed, ref, watch } from 'vue'
import type { AggregationFunction, FieldStats, PivotCell, PivotConfig, PivotResult, PivotValueField } from '../types'
import { useLicense } from './useLicense'

/**
 * Detect field type from sample data
 */
function detectFieldType(data: Record<string, unknown>[], field: string): FieldStats {
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
 * Aggregate values based on function type
 */
function aggregate(values: number[], fn: AggregationFunction): number | null {
  if (values.length === 0)
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
    default:
      return values.reduce((a, b) => a + b, 0)
  }
}

/**
 * Format aggregated value for display
 */
function formatValue(value: number | null, fn: AggregationFunction): string {
  if (value === null)
    return '-'

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
 * Create a composite key from field values
 */
function makeKey(row: Record<string, unknown>, fields: string[]): string {
  return fields.map(f => String(row[f] ?? '(blank)')).join('|||')
}

/**
 * Parse composite key back to values
 */
function parseKey(key: string): string[] {
  return key.split('|||')
}

const STORAGE_KEY_PREFIX = 'vpg-pivot-'

/**
 * Generate a storage key based on column names
 */
function generateStorageKey(columns: string[]): string {
  const sorted = [...columns].sort()
  const hash = sorted.join('|').substring(0, 100)
  return `${STORAGE_KEY_PREFIX}${hash}`
}

/**
 * Save pivot config to sessionStorage
 */
function saveConfig(key: string, config: PivotConfig): void {
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
function loadConfig(key: string): PivotConfig | null {
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
function isConfigValidForFields(config: PivotConfig, availableFieldNames: string[]): boolean {
  const available = new Set(availableFieldNames)
  const allConfiguredFields = [
    ...config.rowFields,
    ...config.columnFields,
    ...config.valueFields.map(v => v.field),
  ]
  return allConfiguredFields.every(f => available.has(f))
}

/**
 * Main pivot table composable
 */
export function usePivotTable(data: Ref<Record<string, unknown>[]>) {
  const { canUsePivot, requirePro } = useLicense()

  // Configuration state
  const rowFields = ref<string[]>([])
  const columnFields = ref<string[]>([])
  const valueFields = ref<PivotValueField[]>([])
  const showRowTotals = ref(true)
  const showColumnTotals = ref(true)

  // Track current storage key
  const currentStorageKey = ref<string | null>(null)

  // Compute available fields from data
  const availableFields = computed((): FieldStats[] => {
    if (data.value.length === 0)
      return []

    const keys = Object.keys(data.value[0])
    return keys.map(field => detectFieldType(data.value, field))
  })

  // Get fields that haven't been assigned yet
  const unassignedFields = computed(() => {
    const assigned = new Set([
      ...rowFields.value,
      ...columnFields.value,
      ...valueFields.value.map(v => v.field),
    ])
    return availableFields.value.filter(f => !assigned.has(f.field))
  })

  // Check if pivot is configured
  const isConfigured = computed(() => {
    return (rowFields.value.length > 0 || columnFields.value.length > 0) && valueFields.value.length > 0
  })

  // Build pivot result
  const pivotResult = computed((): PivotResult | null => {
    if (!isConfigured.value)
      return null

    // Check license for pivot feature
    if (!canUsePivot.value) {
      return null
    }

    const rows = data.value
    if (rows.length === 0)
      return null

    // Collect unique row and column keys
    const rowKeySet = new Set<string>()
    const colKeySet = new Set<string>()

    // Group data by row and column keys
    const dataMap = new Map<string, Map<string, number[][]>>()

    for (const row of rows) {
      const rowKey = rowFields.value.length > 0 ? makeKey(row, rowFields.value) : '__all__'
      const colKey = columnFields.value.length > 0 ? makeKey(row, columnFields.value) : '__all__'

      rowKeySet.add(rowKey)
      colKeySet.add(colKey)

      if (!dataMap.has(rowKey)) {
        dataMap.set(rowKey, new Map())
      }
      const colMap = dataMap.get(rowKey)!

      if (!colMap.has(colKey)) {
        colMap.set(colKey, valueFields.value.map(() => []))
      }
      const valueArrays = colMap.get(colKey)!

      // Collect values for each value field
      for (let i = 0; i < valueFields.value.length; i++) {
        const vf = valueFields.value[i]
        const val = row[vf.field]
        if (val !== null && val !== undefined && val !== '') {
          const num = typeof val === 'number' ? val : Number.parseFloat(String(val))
          if (!Number.isNaN(num)) {
            valueArrays[i].push(num)
          }
          else if (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') {
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
    if (columnFields.value.length > 0) {
      for (let level = 0; level < columnFields.value.length; level++) {
        const headerRow: string[] = []
        for (const colKey of colKeys) {
          const parts = parseKey(colKey)
          headerRow.push(parts[level] || '')
        }
        headers.push(headerRow)
      }
    }

    // If multiple value fields, add value field labels as last header row
    if (valueFields.value.length > 1 || headers.length === 0) {
      const valueLabels: string[] = []
      for (const colKey of colKeys) {
        for (const vf of valueFields.value) {
          valueLabels.push(`${vf.label || vf.field} (${getAggregationLabel(vf.aggregation)})`)
        }
      }
      if (colKeys.length === 1 && colKeys[0] === '__all__') {
        headers.push(valueFields.value.map(vf =>
          `${vf.label || vf.field} (${getAggregationLabel(vf.aggregation)})`,
        ))
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
    const columnTotalsMap: Map<number, number[][]> = new Map()

    for (const rowKey of rowKeys) {
      const rowData: PivotCell[] = []
      const rowTotalValues: number[][] = valueFields.value.map(() => [])

      let colIndex = 0
      for (const colKey of colKeys) {
        const colMap = dataMap.get(rowKey)
        const valueArrays = colMap?.get(colKey) || valueFields.value.map(() => [])

        for (let i = 0; i < valueFields.value.length; i++) {
          const vf = valueFields.value[i]
          const values = valueArrays[i]
          const aggValue = aggregate(values, vf.aggregation)

          rowData.push({
            value: aggValue,
            count: values.length,
            formattedValue: formatValue(aggValue, vf.aggregation),
          })

          rowTotalValues[i].push(...values)

          if (!columnTotalsMap.has(colIndex)) {
            columnTotalsMap.set(colIndex, valueFields.value.map(() => []))
          }
          columnTotalsMap.get(colIndex)![i].push(...values)

          colIndex++
        }
      }

      pivotData.push(rowData)

      if (showRowTotals.value && colKeys.length > 1) {
        const totalCell: PivotCell = {
          value: null,
          count: 0,
          formattedValue: '-',
        }

        if (valueFields.value.length > 0) {
          const vf = valueFields.value[0]
          const allValues = rowTotalValues[0]
          const aggValue = aggregate(allValues, vf.aggregation)
          totalCell.value = aggValue
          totalCell.count = allValues.length
          totalCell.formattedValue = formatValue(aggValue, vf.aggregation)
        }

        rowTotals.push(totalCell)
      }
    }

    // Calculate column totals
    const columnTotals: PivotCell[] = []
    if (showColumnTotals.value && rowKeys.length > 1) {
      for (let colIdx = 0; colIdx < colKeys.length * valueFields.value.length; colIdx++) {
        const valueIdx = colIdx % valueFields.value.length
        const vf = valueFields.value[valueIdx]

        const allColValues: number[] = []
        for (const rowKey of rowKeys) {
          const colMap = dataMap.get(rowKey)
          const colKey = colKeys[Math.floor(colIdx / valueFields.value.length)]
          const valueArrays = colMap?.get(colKey) || valueFields.value.map(() => [])
          allColValues.push(...valueArrays[valueIdx])
        }

        const aggValue = aggregate(allColValues, vf.aggregation)
        columnTotals.push({
          value: aggValue,
          count: allColValues.length,
          formattedValue: formatValue(aggValue, vf.aggregation),
        })
      }
    }

    // Grand total
    const grandTotal: PivotCell = { value: null, count: 0, formattedValue: '-' }
    if (showRowTotals.value && showColumnTotals.value && valueFields.value.length > 0) {
      const vf = valueFields.value[0]
      const allValues: number[] = []

      for (const row of data.value) {
        const val = row[vf.field]
        if (val !== null && val !== undefined && val !== '') {
          const num = typeof val === 'number' ? val : Number.parseFloat(String(val))
          if (!Number.isNaN(num)) {
            allValues.push(num)
          }
          else if (vf.aggregation === 'count' || vf.aggregation === 'countDistinct') {
            allValues.push(1)
          }
        }
      }

      const aggValue = aggregate(allValues, vf.aggregation)
      grandTotal.value = aggValue
      grandTotal.count = allValues.length
      grandTotal.formattedValue = formatValue(aggValue, vf.aggregation)
    }

    return {
      headers,
      rowHeaders,
      data: pivotData,
      rowTotals,
      columnTotals,
      grandTotal,
    }
  })

  // Actions with license checks
  function addRowField(field: string) {
    if (!requirePro('Pivot Table - Row Fields'))
      return
    if (!rowFields.value.includes(field)) {
      rowFields.value = [...rowFields.value, field]
    }
  }

  function removeRowField(field: string) {
    rowFields.value = rowFields.value.filter(f => f !== field)
  }

  function addColumnField(field: string) {
    if (!requirePro('Pivot Table - Column Fields'))
      return
    if (!columnFields.value.includes(field)) {
      columnFields.value = [...columnFields.value, field]
    }
  }

  function removeColumnField(field: string) {
    columnFields.value = columnFields.value.filter(f => f !== field)
  }

  function addValueField(field: string, aggregation: AggregationFunction = 'sum') {
    if (!requirePro('Pivot Table - Value Fields'))
      return
    if (valueFields.value.some(v => v.field === field && v.aggregation === aggregation)) {
      return
    }
    valueFields.value = [...valueFields.value, { field, aggregation }]
  }

  function removeValueField(field: string, aggregation?: AggregationFunction) {
    if (aggregation) {
      valueFields.value = valueFields.value.filter(v =>
        !(v.field === field && v.aggregation === aggregation),
      )
    }
    else {
      valueFields.value = valueFields.value.filter(v => v.field !== field)
    }
  }

  function updateValueFieldAggregation(field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction) {
    valueFields.value = valueFields.value.map((v) => {
      if (v.field === field && v.aggregation === oldAgg) {
        return { ...v, aggregation: newAgg }
      }
      return v
    })
  }

  function clearConfig() {
    rowFields.value = []
    columnFields.value = []
    valueFields.value = []
  }

  function moveField(from: { area: 'row' | 'column' | 'value', index: number }, to: { area: 'row' | 'column' | 'value', index: number }) {
    if (from.area === to.area) {
      if (from.area === 'row') {
        const items = [...rowFields.value]
        const [removed] = items.splice(from.index, 1)
        items.splice(to.index, 0, removed)
        rowFields.value = items
      }
      else if (from.area === 'column') {
        const items = [...columnFields.value]
        const [removed] = items.splice(from.index, 1)
        items.splice(to.index, 0, removed)
        columnFields.value = items
      }
    }
  }

  function autoSuggestConfig() {
    if (!requirePro('Pivot Table - Auto Suggest'))
      return
    if (availableFields.value.length === 0)
      return

    const categoricalFields = availableFields.value.filter(f => !f.isNumeric && f.uniqueCount < 50)
    const numericFields = availableFields.value.filter(f => f.isNumeric)

    if (categoricalFields.length > 0 && numericFields.length > 0) {
      rowFields.value = [categoricalFields[0].field]
      valueFields.value = [{ field: numericFields[0].field, aggregation: 'sum' }]
    }
  }

  // Watch data to restore or validate config
  watch(data, (newData) => {
    if (newData.length === 0)
      return

    const newKeys = Object.keys(newData[0])
    const storageKey = generateStorageKey(newKeys)

    if (storageKey !== currentStorageKey.value) {
      currentStorageKey.value = storageKey

      const savedConfig = loadConfig(storageKey)
      if (savedConfig && isConfigValidForFields(savedConfig, newKeys)) {
        rowFields.value = savedConfig.rowFields
        columnFields.value = savedConfig.columnFields
        valueFields.value = savedConfig.valueFields
        showRowTotals.value = savedConfig.showRowTotals
        showColumnTotals.value = savedConfig.showColumnTotals
      }
      else {
        const currentConfig: PivotConfig = {
          rowFields: rowFields.value,
          columnFields: columnFields.value,
          valueFields: valueFields.value,
          showRowTotals: showRowTotals.value,
          showColumnTotals: showColumnTotals.value,
        }
        if (!isConfigValidForFields(currentConfig, newKeys)) {
          clearConfig()
        }
      }
    }
    else {
      const currentConfig: PivotConfig = {
        rowFields: rowFields.value,
        columnFields: columnFields.value,
        valueFields: valueFields.value,
        showRowTotals: showRowTotals.value,
        showColumnTotals: showColumnTotals.value,
      }
      if (!isConfigValidForFields(currentConfig, newKeys)) {
        clearConfig()
      }
    }
  }, { immediate: true })

  // Watch config changes and save to sessionStorage
  watch(
    [rowFields, columnFields, valueFields, showRowTotals, showColumnTotals],
    () => {
      if (!currentStorageKey.value)
        return

      const config: PivotConfig = {
        rowFields: rowFields.value,
        columnFields: columnFields.value,
        valueFields: valueFields.value,
        showRowTotals: showRowTotals.value,
        showColumnTotals: showColumnTotals.value,
      }
      saveConfig(currentStorageKey.value, config)
    },
    { deep: true },
  )

  return {
    // State
    rowFields,
    columnFields,
    valueFields,
    showRowTotals,
    showColumnTotals,

    // Computed
    availableFields,
    unassignedFields,
    isConfigured,
    pivotResult,

    // Actions
    addRowField,
    removeRowField,
    addColumnField,
    removeColumnField,
    addValueField,
    removeValueField,
    updateValueFieldAggregation,
    clearConfig,
    moveField,
    autoSuggestConfig,
  }
}

