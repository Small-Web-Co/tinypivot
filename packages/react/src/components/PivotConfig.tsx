/**
 * Pivot Table Configuration Panel for React
 * Draggable fields with aggregation selection
 */
import React, { useState, useMemo, useCallback } from 'react'
import type { AggregationFunction, PivotValueField, FieldStats } from '@smallwebco/tinypivot-core'
import { AGGREGATION_OPTIONS, getAggregationSymbol } from '@smallwebco/tinypivot-core'
import { useLicense } from '../hooks/useLicense'

interface PivotConfigProps {
  availableFields: FieldStats[]
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
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
}

function getFieldIcon(type: FieldStats['type']): string {
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
  onShowRowTotalsChange,
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
}: PivotConfigProps) {
  const { showWatermark } = useLicense()
  const [fieldSearch, setFieldSearch] = useState('')

  // Assigned fields
  const assignedFields = useMemo(() => {
    const rowSet = new Set(rowFields)
    const colSet = new Set(columnFields)
    const valueMap = new Map(valueFields.map(v => [v.field, v]))

    return availableFields
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
  }, [availableFields, rowFields, columnFields, valueFields])

  // Unassigned fields
  const unassignedFields = useMemo(() => {
    const rowSet = new Set(rowFields)
    const colSet = new Set(columnFields)
    const valSet = new Set(valueFields.map(v => v.field))

    return availableFields.filter(
      f => !rowSet.has(f.field) && !colSet.has(f.field) && !valSet.has(f.field)
    )
  }, [availableFields, rowFields, columnFields, valueFields])

  const filteredUnassignedFields = useMemo(() => {
    if (!fieldSearch.trim()) return unassignedFields
    const search = fieldSearch.toLowerCase().trim()
    return unassignedFields.filter(f => f.field.toLowerCase().includes(search))
  }, [unassignedFields, fieldSearch])

  const assignedCount = assignedFields.length

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
                className={`vpg-assigned-item vpg-type-${field.assignedTo}`}
                title={field.field}
                draggable
                onDragStart={e => handleDragStart(field.field, e)}
                onDragEnd={onDragEnd}
              >
                <div className="vpg-item-main">
                  <span className={`vpg-item-badge ${field.assignedTo}`}>
                    {field.assignedTo === 'row'
                      ? 'R'
                      : field.assignedTo === 'column'
                        ? 'C'
                        : getAggregationSymbol(field.valueConfig?.aggregation || 'sum')}
                  </span>
                  <span className="vpg-item-name">{field.field}</span>
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
              className={`vpg-field-item ${field.isNumeric ? 'vpg-is-numeric' : ''}`}
              title={field.field}
              draggable
              onDragStart={e => handleDragStart(field.field, e)}
              onDragEnd={onDragEnd}
            >
              <span className="vpg-field-type-icon" title={field.type}>
                {getFieldIcon(field.type)}
              </span>
              <span className="vpg-field-name">{field.field}</span>
              <span className="vpg-unique-count">{field.uniqueCount}</span>
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
            onChange={e => onShowRowTotalsChange(e.target.checked)}
          />
          <span>Totals</span>
        </label>
        <button className="vpg-auto-btn" onClick={onAutoSuggest}>
          <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Auto
        </button>
      </div>

      {/* Watermark */}
      {showWatermark && (
        <div className="vpg-watermark">
          <a href="https://tiny-pivot.com" target="_blank" rel="noopener noreferrer">
            TinyPivot
          </a>
        </div>
      )}
    </div>
  )
}

