/**
 * Pivot Table Hook for React
 * Wraps core pivot logic with React state management
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import type {
  AggregationFunction,
  FieldStats,
  PivotConfig,
  PivotResult,
  PivotValueField,
} from '@smallwebco/tinypivot-core'
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
} from '@smallwebco/tinypivot-core'
import { useLicense } from './useLicense'

// Re-export for convenience
export { getAggregationLabel }

interface UsePivotTableReturn {
  // State
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean

  // Computed
  availableFields: FieldStats[]
  unassignedFields: FieldStats[]
  isConfigured: boolean
  pivotResult: PivotResult | null

  // Actions
  addRowField: (field: string) => void
  removeRowField: (field: string) => void
  addColumnField: (field: string) => void
  removeColumnField: (field: string) => void
  addValueField: (field: string, aggregation?: AggregationFunction) => void
  removeValueField: (field: string, aggregation?: AggregationFunction) => void
  updateValueFieldAggregation: (
    field: string,
    oldAgg: AggregationFunction,
    newAgg: AggregationFunction
  ) => void
  clearConfig: () => void
  setShowRowTotals: (value: boolean) => void
  setShowColumnTotals: (value: boolean) => void
  autoSuggestConfig: () => void
  setRowFields: (fields: string[]) => void
  setColumnFields: (fields: string[]) => void
}

/**
 * Main pivot table hook
 */
export function usePivotTable(data: Record<string, unknown>[]): UsePivotTableReturn {
  const { canUsePivot, requirePro } = useLicense()

  // Configuration state
  const [rowFields, setRowFieldsState] = useState<string[]>([])
  const [columnFields, setColumnFieldsState] = useState<string[]>([])
  const [valueFields, setValueFields] = useState<PivotValueField[]>([])
  const [showRowTotals, setShowRowTotals] = useState(true)
  const [showColumnTotals, setShowColumnTotals] = useState(true)
  const [currentStorageKey, setCurrentStorageKey] = useState<string | null>(null)

  // Compute available fields from data
  const availableFields = useMemo((): FieldStats[] => {
    return computeAvailableFields(data)
  }, [data])

  // Get fields that haven't been assigned yet
  const unassignedFields = useMemo(() => {
    return getUnassignedFields(availableFields, rowFields, columnFields, valueFields)
  }, [availableFields, rowFields, columnFields, valueFields])

  // Check if pivot is configured
  const isConfigured = useMemo(() => {
    return isPivotConfigured({
      rowFields,
      columnFields,
      valueFields,
      showRowTotals,
      showColumnTotals,
    })
  }, [rowFields, columnFields, valueFields, showRowTotals, showColumnTotals])

  // Build pivot result
  const pivotResult = useMemo((): PivotResult | null => {
    if (!isConfigured) return null
    if (!canUsePivot) return null

    return computePivotResult(data, {
      rowFields,
      columnFields,
      valueFields,
      showRowTotals,
      showColumnTotals,
    })
  }, [data, isConfigured, canUsePivot, rowFields, columnFields, valueFields, showRowTotals, showColumnTotals])

  // Load/save config from storage
  useEffect(() => {
    if (data.length === 0) return

    const newKeys = Object.keys(data[0])
    const storageKey = generateStorageKey(newKeys)

    if (storageKey !== currentStorageKey) {
      setCurrentStorageKey(storageKey)

      const savedConfig = loadPivotConfig(storageKey)
      if (savedConfig && isConfigValidForFields(savedConfig, newKeys)) {
        setRowFieldsState(savedConfig.rowFields)
        setColumnFieldsState(savedConfig.columnFields)
        setValueFields(savedConfig.valueFields)
        setShowRowTotals(savedConfig.showRowTotals)
        setShowColumnTotals(savedConfig.showColumnTotals)
      } else {
        // Validate current config
        const currentConfig: PivotConfig = {
          rowFields,
          columnFields,
          valueFields,
          showRowTotals,
          showColumnTotals,
        }
        if (!isConfigValidForFields(currentConfig, newKeys)) {
          setRowFieldsState([])
          setColumnFieldsState([])
          setValueFields([])
        }
      }
    }
  }, [data])

  // Save config when it changes
  useEffect(() => {
    if (!currentStorageKey) return

    const config: PivotConfig = {
      rowFields,
      columnFields,
      valueFields,
      showRowTotals,
      showColumnTotals,
    }
    savePivotConfig(currentStorageKey, config)
  }, [currentStorageKey, rowFields, columnFields, valueFields, showRowTotals, showColumnTotals])

  // Actions
  const addRowField = useCallback(
    (field: string) => {
      if (!requirePro('Pivot Table - Row Fields')) return
      if (!rowFields.includes(field)) {
        setRowFieldsState(prev => [...prev, field])
      }
    },
    [rowFields, requirePro]
  )

  const removeRowField = useCallback((field: string) => {
    setRowFieldsState(prev => prev.filter(f => f !== field))
  }, [])

  const setRowFields = useCallback((fields: string[]) => {
    setRowFieldsState(fields)
  }, [])

  const addColumnField = useCallback(
    (field: string) => {
      if (!requirePro('Pivot Table - Column Fields')) return
      if (!columnFields.includes(field)) {
        setColumnFieldsState(prev => [...prev, field])
      }
    },
    [columnFields, requirePro]
  )

  const removeColumnField = useCallback((field: string) => {
    setColumnFieldsState(prev => prev.filter(f => f !== field))
  }, [])

  const setColumnFields = useCallback((fields: string[]) => {
    setColumnFieldsState(fields)
  }, [])

  const addValueField = useCallback(
    (field: string, aggregation: AggregationFunction = 'sum') => {
      if (!requirePro('Pivot Table - Value Fields')) return
      setValueFields(prev => {
        if (prev.some(v => v.field === field && v.aggregation === aggregation)) {
          return prev
        }
        return [...prev, { field, aggregation }]
      })
    },
    [requirePro]
  )

  const removeValueField = useCallback((field: string, aggregation?: AggregationFunction) => {
    setValueFields(prev => {
      if (aggregation) {
        return prev.filter(v => !(v.field === field && v.aggregation === aggregation))
      }
      return prev.filter(v => v.field !== field)
    })
  }, [])

  const updateValueFieldAggregation = useCallback(
    (field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction) => {
      setValueFields(prev =>
        prev.map(v => {
          if (v.field === field && v.aggregation === oldAgg) {
            return { ...v, aggregation: newAgg }
          }
          return v
        })
      )
    },
    []
  )

  const clearConfig = useCallback(() => {
    setRowFieldsState([])
    setColumnFieldsState([])
    setValueFields([])
  }, [])

  const autoSuggestConfig = useCallback(() => {
    if (!requirePro('Pivot Table - Auto Suggest')) return
    if (availableFields.length === 0) return

    const categoricalFields = availableFields.filter(f => !f.isNumeric && f.uniqueCount < 50)
    const numericFields = availableFields.filter(f => f.isNumeric)

    if (categoricalFields.length > 0 && numericFields.length > 0) {
      setRowFieldsState([categoricalFields[0].field])
      setValueFields([{ field: numericFields[0].field, aggregation: 'sum' }])
    }
  }, [availableFields, requirePro])

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
    setShowRowTotals,
    setShowColumnTotals,
    autoSuggestConfig,
    setRowFields,
    setColumnFields,
  }
}

