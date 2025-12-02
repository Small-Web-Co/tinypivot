/**
 * Pivot Table Configuration Panel for React
 * Draggable fields with aggregation selection
 */
import React, { useState, useMemo, useCallback } from 'react'
import type { AggregationFunction, PivotValueField, FieldStats, CalculatedField } from '@smallwebco/tinypivot-core'
import { AGGREGATION_OPTIONS, getAggregationSymbol } from '@smallwebco/tinypivot-core'
import { CalculatedFieldModal } from './CalculatedFieldModal'

// Extended field stats for calculated fields
interface ExtendedFieldStats extends FieldStats {
  isCalculated?: boolean
  calcId?: string
  calcName?: string
  calcFormula?: string
}

interface PivotConfigProps {
  availableFields: FieldStats[]
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
  calculatedFields?: CalculatedField[]
  onShowRowTotalsChange: (value: boolean) => void
  onShowColumnTotalsChange: (value: boolean) => void
  onClearConfig: () => void
  onAutoSuggest: () => void
  onDragStart: (field: string, event: React.DragEvent) => void
  onDragEnd: () => void
  onUpdateAggregation: (field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction) => void
  onAddRowField: (field: string) => void
  onRemoveRowField: (field: string) => void
  onAddColumnField: (field: string) => void
  onRemoveColumnField: (field: string) => void
  onAddValueField: (field: string, aggregation: AggregationFunction) => void
  onRemoveValueField: (field: string, aggregation: AggregationFunction) => void
  onAddCalculatedField?: (field: CalculatedField) => void
  onRemoveCalculatedField?: (id: string) => void
  onUpdateCalculatedField?: (field: CalculatedField) => void
}

function getFieldIcon(type: FieldStats['type'], isCalculated?: boolean): string {
  if (isCalculated) return 'ƒ'
  switch (type) {
    case 'number':
      return '#'
    case 'date':
      return '📅'
    case 'boolean':
      return '✓'
    default:
      return 'Aa'
  }
}

export function PivotConfig({
  availableFields,
  rowFields,
  columnFields,
  valueFields,
  showRowTotals,
  calculatedFields,
  onShowRowTotalsChange,
  onShowColumnTotalsChange,
  onClearConfig,
  onAutoSuggest,
  onDragStart,
  onDragEnd,
  onUpdateAggregation,
  onRemoveRowField,
  onRemoveColumnField,
  onRemoveValueField,
  onAddRowField,
  onAddColumnField,
  onAddCalculatedField,
  onRemoveCalculatedField,
  onUpdateCalculatedField,
}: PivotConfigProps) {
  const [fieldSearch, setFieldSearch] = useState('')
  const [showCalcModal, setShowCalcModal] = useState(false)
  const [editingCalcField, setEditingCalcField] = useState<CalculatedField | null>(null)

  // Get only numeric field names for calculated field formulas
  const numericFieldNames = useMemo(() =>
    availableFields
      .filter(f => f.isNumeric)
      .map(f => f.field),
    [availableFields]
  )

  // Convert calculated fields to virtual FieldStats for display
  const calculatedFieldsAsStats = useMemo((): ExtendedFieldStats[] => {
    if (!calculatedFields) return []
    return calculatedFields.map(calc => ({
      field: `calc:${calc.id}`,
      type: 'number' as const,
      uniqueCount: 0,
      isNumeric: true,
      isCalculated: true,
      calcId: calc.id,
      calcName: calc.name,
      calcFormula: calc.formula,
    }))
  }, [calculatedFields])

  // Combined available fields (data fields + calculated fields)
  const allAvailableFields = useMemo((): ExtendedFieldStats[] => [
    ...availableFields.map(f => ({ ...f, isCalculated: false })),
    ...calculatedFieldsAsStats,
  ], [availableFields, calculatedFieldsAsStats])

  // Assigned fields
  const assignedFields = useMemo(() => {
    const rowSet = new Set(rowFields)
    const colSet = new Set(columnFields)
    const valueMap = new Map(valueFields.map(v => [v.field, v]))

    return allAvailableFields
      .filter(f => rowSet.has(f.field) || colSet.has(f.field) || valueMap.has(f.field))
      .map(f => ({
        ...f,
        assignedTo: rowSet.has(f.field)
          ? ('row' as const)
          : colSet.has(f.field)
            ? ('column' as const)
            : ('value' as const),
        valueConfig: valueMap.get(f.field),
      }))
  }, [allAvailableFields, rowFields, columnFields, valueFields])

  // Unassigned fields (including unassigned calculated fields)
  const unassignedFields = useMemo(() => {
    const rowSet = new Set(rowFields)
    const colSet = new Set(columnFields)
    const valSet = new Set(valueFields.map(v => v.field))

    return allAvailableFields.filter(
      f => !rowSet.has(f.field) && !colSet.has(f.field) && !valSet.has(f.field)
    )
  }, [allAvailableFields, rowFields, columnFields, valueFields])

  const filteredUnassignedFields = useMemo(() => {
    if (!fieldSearch.trim()) return unassignedFields
    const search = fieldSearch.toLowerCase().trim()
    return unassignedFields.filter(f => {
      const fieldName = f.field.toLowerCase()
      const displayName = f.isCalculated && f.calcName ? f.calcName.toLowerCase() : ''
      return fieldName.includes(search) || displayName.includes(search)
    })
  }, [unassignedFields, fieldSearch])

  const assignedCount = assignedFields.length

  // Get display name for field (handles calculated fields)
  const getFieldDisplayName = useCallback((field: ExtendedFieldStats): string => {
    if (field.isCalculated && field.calcName) {
      return field.calcName
    }
    return field.field
  }, [])

  const handleDragStart = useCallback(
    (field: string, event: React.DragEvent) => {
      event.dataTransfer?.setData('text/plain', field)
      event.dataTransfer!.effectAllowed = 'move'
      onDragStart(field, event)
    },
    [onDragStart]
  )

  const handleAggregationChange = useCallback(
    (field: string, currentAgg: AggregationFunction, newAgg: AggregationFunction) => {
      onUpdateAggregation(field, currentAgg, newAgg)
    },
    [onUpdateAggregation]
  )

  const toggleRowColumn = useCallback(
    (field: string, currentAssignment: 'row' | 'column') => {
      if (currentAssignment === 'row') {
        onRemoveRowField(field)
        onAddColumnField(field)
      } else {
        onRemoveColumnField(field)
        onAddRowField(field)
      }
    },
    [onRemoveRowField, onAddColumnField, onRemoveColumnField, onAddRowField]
  )

  const removeField = useCallback(
    (field: string, assignedTo: 'row' | 'column' | 'value', valueConfig?: PivotValueField) => {
      if (assignedTo === 'row') {
        onRemoveRowField(field)
      } else if (assignedTo === 'column') {
        onRemoveColumnField(field)
      } else if (valueConfig) {
        onRemoveValueField(field, valueConfig.aggregation)
      }
    },
    [onRemoveRowField, onRemoveColumnField, onRemoveValueField]
  )

  // Handle totals toggle (toggle both row and column together)
  const handleTotalsToggle = useCallback((checked: boolean) => {
    onShowRowTotalsChange(checked)
    onShowColumnTotalsChange(checked)
  }, [onShowRowTotalsChange, onShowColumnTotalsChange])

  // Calculated field modal handlers
  const openCalcModal = useCallback((field?: CalculatedField) => {
    setEditingCalcField(field || null)
    setShowCalcModal(true)
  }, [])

  const handleSaveCalcField = useCallback((field: CalculatedField) => {
    if (editingCalcField && onUpdateCalculatedField) {
      onUpdateCalculatedField(field)
    } else if (onAddCalculatedField) {
      onAddCalculatedField(field)
    }
    setShowCalcModal(false)
    setEditingCalcField(null)
  }, [editingCalcField, onAddCalculatedField, onUpdateCalculatedField])

  const handleCloseCalcModal = useCallback(() => {
    setShowCalcModal(false)
    setEditingCalcField(null)
  }, [])

  return (
    <div className="vpg-pivot-config">
      {/* Header */}
      <div className="vpg-config-header">
        <h3 className="vpg-config-title">
          <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          Fields
        </h3>
        <div className="vpg-header-actions">
          {assignedCount > 0 && (
            <button
              className="vpg-action-btn vpg-clear-btn"
              title="Clear all"
              onClick={onClearConfig}
            >
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Assigned Fields */}
      {assignedCount > 0 && (
        <div className="vpg-assigned-section">
          <div className="vpg-section-label">Active</div>
          <div className="vpg-assigned-list">
            {assignedFields.map(field => (
              <div
                key={field.field}
                className={`vpg-assigned-item vpg-type-${field.assignedTo}${field.isCalculated ? ' vpg-type-calc' : ''}`}
                title={field.isCalculated ? field.calcFormula : field.field}
                draggable
                onDragStart={e => handleDragStart(field.field, e)}
                onDragEnd={onDragEnd}
              >
                <div className="vpg-item-main">
                  <span className={`vpg-item-badge ${field.assignedTo}${field.isCalculated ? ' calc' : ''}`}>
                    {field.isCalculated
                      ? 'ƒ'
                      : field.assignedTo === 'row'
                        ? 'R'
                        : field.assignedTo === 'column'
                          ? 'C'
                          : getAggregationSymbol(field.valueConfig?.aggregation || 'sum')}
                  </span>
                  <span className="vpg-item-name">{getFieldDisplayName(field)}</span>
                </div>

                <div className="vpg-item-actions">
                  {(field.assignedTo === 'row' || field.assignedTo === 'column') && (
                    <button
                      className="vpg-toggle-btn"
                      title={field.assignedTo === 'row' ? 'Move to Columns' : 'Move to Rows'}
                      onClick={e => {
                        e.stopPropagation()
                        toggleRowColumn(field.field, field.assignedTo as 'row' | 'column')
                      }}
                    >
                      <svg
                        className="vpg-icon-xs"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                    </button>
                  )}

                  {field.assignedTo === 'value' && field.valueConfig && (
                    <select
                      className="vpg-agg-select"
                      value={field.valueConfig.aggregation}
                      onChange={e => {
                        e.stopPropagation()
                        handleAggregationChange(
                          field.field,
                          field.valueConfig!.aggregation,
                          e.target.value as AggregationFunction
                        )
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {AGGREGATION_OPTIONS.map(agg => (
                        <option key={agg.value} value={agg.value}>
                          {agg.symbol} {agg.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    className="vpg-remove-btn"
                    title="Remove"
                    onClick={e => {
                      e.stopPropagation()
                      removeField(field.field, field.assignedTo, field.valueConfig)
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unassigned Fields */}
      <div className="vpg-unassigned-section">
        <div className="vpg-section-header">
          <div className="vpg-section-label">
            Available <span className="vpg-count">{unassignedFields.length}</span>
          </div>
        </div>

        {/* Field Search */}
        <div className="vpg-field-search">
          <svg className="vpg-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={fieldSearch}
            onChange={e => setFieldSearch(e.target.value)}
            placeholder="Search fields..."
            className="vpg-search-input"
          />
          {fieldSearch && (
            <button className="vpg-clear-search" onClick={() => setFieldSearch('')}>
              <svg className="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="vpg-field-list">
          {filteredUnassignedFields.map(field => (
            <div
              key={field.field}
              className={`vpg-field-item${field.isNumeric && !field.isCalculated ? ' vpg-is-numeric' : ''}${field.isCalculated ? ' vpg-is-calculated' : ''}`}
              title={field.isCalculated ? field.calcFormula : field.field}
              draggable
              onDragStart={e => handleDragStart(field.field, e)}
              onDragEnd={onDragEnd}
            >
              <span className={`vpg-field-type-icon${field.isCalculated ? ' vpg-calc-type' : ''}`} title={field.type}>
                {getFieldIcon(field.type, field.isCalculated)}
              </span>
              <span className="vpg-field-name">{getFieldDisplayName(field)}</span>
              {field.isCalculated ? (
                <>
                  <button
                    className="vpg-field-edit"
                    title="Edit calculated field"
                    onClick={e => {
                      e.stopPropagation()
                      const calcField = calculatedFields?.find(c => c.id === field.calcId)
                      if (calcField) openCalcModal(calcField)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="vpg-field-delete"
                    title="Delete calculated field"
                    onClick={e => {
                      e.stopPropagation()
                      if (field.calcId && onRemoveCalculatedField) {
                        onRemoveCalculatedField(field.calcId)
                      }
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <span className="vpg-unique-count">{field.uniqueCount}</span>
              )}
            </div>
          ))}
          {filteredUnassignedFields.length === 0 && fieldSearch && (
            <div className="vpg-empty-hint">No fields match "{fieldSearch}"</div>
          )}
          {unassignedFields.length === 0 && <div className="vpg-empty-hint">All fields assigned</div>}
        </div>
      </div>

      {/* Options */}
      <div className="vpg-options-section">
        <label className="vpg-option-toggle">
          <input
            type="checkbox"
            checked={showRowTotals}
            onChange={e => handleTotalsToggle(e.target.checked)}
          />
          <span>Totals</span>
        </label>
        <button className="vpg-calc-btn" onClick={() => openCalcModal()} title="Add calculated field (e.g. Profit Margin %)">
          <span className="vpg-calc-icon">ƒ</span>
          <span>+ Calc</span>
        </button>
      </div>

      {/* Calculated Field Modal */}
      <CalculatedFieldModal
        show={showCalcModal}
        availableFields={numericFieldNames}
        existingField={editingCalcField}
        onClose={handleCloseCalcModal}
        onSave={handleSaveCalcField}
      />
    </div>
  )
}
