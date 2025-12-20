/**
 * Pivot Table Composable for Vue
 * Wraps core pivot logic with Vue reactivity
 */
import { type Ref, computed, ref, watch } from 'vue'
import type { AggregationFunction, CalculatedField, FieldStats, PivotConfig, PivotValueField } from '@smallwebco/tinypivot-core'
import {
  computeAvailableFields,
  getUnassignedFields,
  isPivotConfigured,
  computePivotResult,
  generateStorageKey,
  savePivotConfig,
  loadPivotConfig,
  isConfigValidForFields,
  getAggregationLabel,
  loadCalculatedFields,
  saveCalculatedFields,
} from '@smallwebco/tinypivot-core'
import { useLicense } from './useLicense'

// Re-export for convenience
export { getAggregationLabel }

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
  const calculatedFields = ref<CalculatedField[]>(loadCalculatedFields())

  // Track current storage key
  const currentStorageKey = ref<string | null>(null)

  // Compute available fields from data
  const availableFields = computed((): FieldStats[] => {
    return computeAvailableFields(data.value)
  })

  // Get fields that haven't been assigned yet
  const unassignedFields = computed(() => {
    return getUnassignedFields(
      availableFields.value,
      rowFields.value,
      columnFields.value,
      valueFields.value
    )
  })

  // Check if pivot is configured
  const isConfigured = computed(() => {
    return isPivotConfigured({
      rowFields: rowFields.value,
      columnFields: columnFields.value,
      valueFields: valueFields.value,
      showRowTotals: showRowTotals.value,
      showColumnTotals: showColumnTotals.value,
    })
  })

  // Build pivot result
  const pivotResult = computed(() => {
    if (!isConfigured.value) return null

    // Check license for pivot feature
    if (!canUsePivot.value) return null

    return computePivotResult(data.value, {
      rowFields: rowFields.value,
      columnFields: columnFields.value,
      valueFields: valueFields.value,
      showRowTotals: showRowTotals.value,
      showColumnTotals: showColumnTotals.value,
      calculatedFields: calculatedFields.value,
    })
  })

  // Actions - pivot is free with sum aggregation, Pro required for other aggregations
  function addRowField(field: string) {
    if (!rowFields.value.includes(field)) {
      rowFields.value = [...rowFields.value, field]
    }
  }

  function removeRowField(field: string) {
    rowFields.value = rowFields.value.filter(f => f !== field)
  }

  function addColumnField(field: string) {
    if (!columnFields.value.includes(field)) {
      columnFields.value = [...columnFields.value, field]
    }
  }

  function removeColumnField(field: string) {
    columnFields.value = columnFields.value.filter(f => f !== field)
  }

  function addValueField(field: string, aggregation: AggregationFunction = 'sum') {
    // Pro required for non-sum aggregations
    if (aggregation !== 'sum' && !requirePro(`${aggregation} aggregation`)) {
      return
    }
    if (valueFields.value.some(v => v.field === field && v.aggregation === aggregation)) {
      return
    }
    valueFields.value = [...valueFields.value, { field, aggregation }]
  }

  function removeValueField(field: string, aggregation?: AggregationFunction) {
    if (aggregation) {
      valueFields.value = valueFields.value.filter(
        v => !(v.field === field && v.aggregation === aggregation)
      )
    } else {
      valueFields.value = valueFields.value.filter(v => v.field !== field)
    }
  }

  function updateValueFieldAggregation(
    field: string,
    oldAgg: AggregationFunction,
    newAgg: AggregationFunction
  ) {
    valueFields.value = valueFields.value.map(v => {
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

  function moveField(
    from: { area: 'row' | 'column' | 'value'; index: number },
    to: { area: 'row' | 'column' | 'value'; index: number }
  ) {
    if (from.area === to.area) {
      if (from.area === 'row') {
        const items = [...rowFields.value]
        const [removed] = items.splice(from.index, 1)
        items.splice(to.index, 0, removed)
        rowFields.value = items
      } else if (from.area === 'column') {
        const items = [...columnFields.value]
        const [removed] = items.splice(from.index, 1)
        items.splice(to.index, 0, removed)
        columnFields.value = items
      }
    }
  }

  function autoSuggestConfig() {
    if (!requirePro('Pivot Table - Auto Suggest')) return
    if (availableFields.value.length === 0) return

    const categoricalFields = availableFields.value.filter(f => !f.isNumeric && f.uniqueCount < 50)
    const numericFields = availableFields.value.filter(f => f.isNumeric)

    if (categoricalFields.length > 0 && numericFields.length > 0) {
      rowFields.value = [categoricalFields[0].field]
      valueFields.value = [{ field: numericFields[0].field, aggregation: 'sum' }]
    }
  }

  // Calculated field management
  function addCalculatedField(field: CalculatedField) {
    const existing = calculatedFields.value.findIndex(f => f.id === field.id)
    if (existing >= 0) {
      calculatedFields.value = [
        ...calculatedFields.value.slice(0, existing),
        field,
        ...calculatedFields.value.slice(existing + 1),
      ]
    } else {
      calculatedFields.value = [...calculatedFields.value, field]
    }
    saveCalculatedFields(calculatedFields.value)
  }

  function removeCalculatedField(id: string) {
    calculatedFields.value = calculatedFields.value.filter(f => f.id !== id)
    // Also remove from value fields if it was being used
    valueFields.value = valueFields.value.filter(v => v.field !== `calc:${id}`)
    saveCalculatedFields(calculatedFields.value)
  }

  // Watch data to restore or validate config
  watch(
    data,
    newData => {
      if (newData.length === 0) return

      const newKeys = Object.keys(newData[0])
      const storageKey = generateStorageKey(newKeys)

      if (storageKey !== currentStorageKey.value) {
        currentStorageKey.value = storageKey

        const savedConfig = loadPivotConfig(storageKey)
        if (savedConfig && isConfigValidForFields(savedConfig, newKeys)) {
          rowFields.value = savedConfig.rowFields
          columnFields.value = savedConfig.columnFields
          valueFields.value = savedConfig.valueFields
          showRowTotals.value = savedConfig.showRowTotals
          showColumnTotals.value = savedConfig.showColumnTotals
          if (savedConfig.calculatedFields) {
            calculatedFields.value = savedConfig.calculatedFields
          }
        } else {
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
      } else {
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
    },
    { immediate: true }
  )

  // Watch config changes and save to sessionStorage
  watch(
    [rowFields, columnFields, valueFields, showRowTotals, showColumnTotals, calculatedFields],
    () => {
      if (!currentStorageKey.value) return

      const config: PivotConfig = {
        rowFields: rowFields.value,
        columnFields: columnFields.value,
        valueFields: valueFields.value,
        showRowTotals: showRowTotals.value,
        showColumnTotals: showColumnTotals.value,
        calculatedFields: calculatedFields.value,
      }
      savePivotConfig(currentStorageKey.value, config)
    },
    { deep: true }
  )

  return {
    // State
    rowFields,
    columnFields,
    valueFields,
    showRowTotals,
    showColumnTotals,
    calculatedFields,

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
    addCalculatedField,
    removeCalculatedField,
  }
}


