/**
 * Pivot Table Skeleton + Data Display for React
 * Visual layout for pivot configuration and results
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import type { AggregationFunction, CalculatedField, PivotResult, PivotValueField } from '@smallwebco/tinypivot-core'
import { getAggregationLabel, getAggregationSymbol } from '@smallwebco/tinypivot-core'
import { useLicense } from '../hooks/useLicense'

interface ActiveFilter {
  column: string
  valueCount: number
  values?: string[]
  displayText?: string
  isRange?: boolean
}

interface PivotSkeletonProps {
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  calculatedFields?: CalculatedField[]
  isConfigured: boolean
  draggingField: string | null
  pivotResult: PivotResult | null
  fontSize?: 'xs' | 'sm' | 'base'
  activeFilters?: ActiveFilter[] | null
  totalRowCount?: number
  filteredRowCount?: number
  onAddRowField: (field: string) => void
  onRemoveRowField: (field: string) => void
  onAddColumnField: (field: string) => void
  onRemoveColumnField: (field: string) => void
  onAddValueField: (field: string, aggregation: AggregationFunction) => void
  onRemoveValueField: (field: string, aggregation: AggregationFunction) => void
  onUpdateAggregation: (field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction) => void
  onReorderRowFields: (fields: string[]) => void
  onReorderColumnFields: (fields: string[]) => void
}

export function PivotSkeleton({
  rowFields,
  columnFields,
  valueFields,
  calculatedFields,
  isConfigured,
  draggingField,
  pivotResult,
  fontSize = 'xs',
  activeFilters,
  totalRowCount,
  filteredRowCount,
  onAddRowField,
  onRemoveRowField,
  onAddColumnField,
  onRemoveColumnField,
  onAddValueField,
  onRemoveValueField,
  onReorderRowFields,
  onReorderColumnFields,
}: PivotSkeletonProps) {
  const { showWatermark, canUsePivot, isDemo } = useLicense()

  // Helper to get display name for value fields (resolves calc IDs to names)
  const getValueFieldDisplayName = useCallback((field: string): string => {
    if (field.startsWith('calc:')) {
      const calcId = field.replace('calc:', '')
      const calcField = calculatedFields?.find(c => c.id === calcId)
      return calcField?.name || field
    }
    return field
  }, [calculatedFields])

  // Helper to check if field is a calculated field
  const isCalculatedField = useCallback((field: string): boolean => {
    return field.startsWith('calc:')
  }, [])

  // Drag state
  const [dragOverArea, setDragOverArea] = useState<'row' | 'column' | 'value' | null>(null)
  
  // Reorder drag state
  const [reorderDragSource, setReorderDragSource] = useState<{ zone: 'row' | 'column'; index: number } | null>(null)
  const [reorderDropTarget, setReorderDropTarget] = useState<{ zone: 'row' | 'column'; index: number } | null>(null)

  // Sorting
  type SortTarget = 'row' | number
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [sortTarget, setSortTarget] = useState<SortTarget>('row')

  const toggleSort = useCallback((target: SortTarget = 'row') => {
    if (sortTarget === target) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortTarget(target)
      setSortDirection('asc')
    }
  }, [sortTarget])

  // Selection state for cell selection and copy
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null)
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [showCopyToast, setShowCopyToast] = useState(false)
  const [copyToastMessage, setCopyToastMessage] = useState('')

  const selectionBounds = useMemo(() => {
    if (!selectionStart || !selectionEnd) return null
    return {
      minRow: Math.min(selectionStart.row, selectionEnd.row),
      maxRow: Math.max(selectionStart.row, selectionEnd.row),
      minCol: Math.min(selectionStart.col, selectionEnd.col),
      maxCol: Math.max(selectionStart.col, selectionEnd.col),
    }
  }, [selectionStart, selectionEnd])

  const handleCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
      event.preventDefault()
      
      if (event.shiftKey && selectedCell) {
        setSelectionEnd({ row: rowIndex, col: colIndex })
      } else {
        setSelectedCell({ row: rowIndex, col: colIndex })
        setSelectionStart({ row: rowIndex, col: colIndex })
        setSelectionEnd({ row: rowIndex, col: colIndex })
        setIsSelecting(true)
      }
    },
    [selectedCell]
  )

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (isSelecting) {
        setSelectionEnd({ row: rowIndex, col: colIndex })
      }
    },
    [isSelecting]
  )

  const isCellSelected = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      if (!selectionBounds) {
        return selectedCell?.row === rowIndex && selectedCell?.col === colIndex
      }
      const { minRow, maxRow, minCol, maxCol } = selectionBounds
      return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
    },
    [selectionBounds, selectedCell]
  )

  // Mouse up handler
  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false)
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Sorted row indices
  const sortedRowIndices = useMemo(() => {
    if (!pivotResult) return []

    const indices = pivotResult.rowHeaders.map((_, i) => i)
    const headers = pivotResult.rowHeaders
    const data = pivotResult.data

    indices.sort((a, b) => {
      let cmp: number

      if (sortTarget === 'row') {
        const aHeader = headers[a]?.join(' / ') || ''
        const bHeader = headers[b]?.join(' / ') || ''
        cmp = aHeader.localeCompare(bHeader, undefined, { numeric: true, sensitivity: 'base' })
      } else {
        const colIdx = sortTarget as number
        const aVal = data[a]?.[colIdx]?.value ?? null
        const bVal = data[b]?.[colIdx]?.value ?? null

        if (aVal === null && bVal === null) cmp = 0
        else if (aVal === null) cmp = 1
        else if (bVal === null) cmp = -1
        else cmp = aVal - bVal
      }

      return sortDirection === 'asc' ? cmp : -cmp
    })

    return indices
  }, [pivotResult, sortTarget, sortDirection])

  // Copy selection to clipboard
  const copySelectionToClipboard = useCallback(() => {
    if (!selectionBounds || !pivotResult) return
    
    const { minRow, maxRow, minCol, maxCol } = selectionBounds
    const lines: string[] = []
    
    for (let r = minRow; r <= maxRow; r++) {
      const sortedIdx = sortedRowIndices[r]
      if (sortedIdx === undefined) continue
      
      const rowValues: string[] = []
      for (let c = minCol; c <= maxCol; c++) {
        const cell = pivotResult.data[sortedIdx]?.[c]
        rowValues.push(cell?.formattedValue ?? '')
      }
      lines.push(rowValues.join('\t'))
    }
    
    const text = lines.join('\n')
    
    navigator.clipboard.writeText(text).then(() => {
      const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1)
      setCopyToastMessage(`Copied ${cellCount} cell${cellCount > 1 ? 's' : ''}`)
      setShowCopyToast(true)
      setTimeout(() => setShowCopyToast(false), 2000)
    }).catch(err => {
      console.error('Copy failed:', err)
    })
  }, [selectionBounds, pivotResult, sortedRowIndices])

  // Keyboard handler for copy
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!selectionBounds) return
      
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault()
        copySelectionToClipboard()
        return
      }
      
      if (event.key === 'Escape') {
        setSelectedCell(null)
        setSelectionStart(null)
        setSelectionEnd(null)
      }
    }
    
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [selectionBounds, copySelectionToClipboard])

  // Selection statistics for footer
  const selectionStats = useMemo(() => {
    if (!selectionBounds || !pivotResult) return null
    
    const { minRow, maxRow, minCol, maxCol } = selectionBounds
    const values: number[] = []
    let count = 0
    
    for (let r = minRow; r <= maxRow; r++) {
      const sortedIdx = sortedRowIndices[r]
      if (sortedIdx === undefined) continue
      
      for (let c = minCol; c <= maxCol; c++) {
        const cell = pivotResult.data[sortedIdx]?.[c]
        count++
        if (cell?.value !== null && cell?.value !== undefined && typeof cell.value === 'number') {
          values.push(cell.value)
        }
      }
    }
    
    if (count <= 1) return null
    
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = values.length > 0 ? sum / values.length : 0
    
    return {
      count,
      numericCount: values.length,
      sum,
      avg,
    }
  }, [selectionBounds, pivotResult, sortedRowIndices])

  const formatStatValue = useCallback((val: number): string => {
    if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`
    if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(2)}K`
    return val.toFixed(2)
  }, [])

  // Column headers
  const columnHeaderCells = useMemo(() => {
    if (!pivotResult || pivotResult.headers.length === 0) {
      return [
        valueFields.map(vf => ({
          label: `${getValueFieldDisplayName(vf.field)} (${getAggregationLabel(vf.aggregation)})`,
          colspan: 1,
        })),
      ]
    }

    const result: Array<Array<{ label: string; colspan: number }>> = []

    for (let level = 0; level < pivotResult.headers.length; level++) {
      const headerRow = pivotResult.headers[level]
      const cells: Array<{ label: string; colspan: number }> = []

      let i = 0
      while (i < headerRow.length) {
        const value = headerRow[i]
        let colspan = 1

        while (i + colspan < headerRow.length && headerRow[i + colspan] === value) {
          colspan++
        }

        cells.push({ label: value, colspan })
        i += colspan
      }

      result.push(cells)
    }

    return result
  }, [pivotResult, valueFields])

  // Filter status
  const hasActiveFilters = activeFilters && activeFilters.length > 0
  const filterSummary = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) return ''
    return activeFilters.map(f => f.column).join(', ')
  }, [activeFilters])

  // Detailed filter tooltip
  const [showFilterTooltip, setShowFilterTooltip] = useState(false)
  const filterTooltipDetails = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) return []
    return activeFilters.map(f => {
      // Handle range filters
      if (f.isRange && f.displayText) {
        return {
          column: f.column,
          displayText: f.displayText,
          isRange: true,
          values: [] as string[],
          remaining: 0,
        }
      }
      // Handle value filters
      const values = f.values || []
      const maxDisplay = 5
      const displayValues = values.slice(0, maxDisplay)
      const remaining = values.length - maxDisplay
      return {
        column: f.column,
        values: displayValues,
        remaining: remaining > 0 ? remaining : 0,
        isRange: false,
      }
    })
  }, [activeFilters])

  // Drag handlers
  const handleDragOver = useCallback(
    (area: 'row' | 'column' | 'value', event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer!.dropEffect = 'move'
      setDragOverArea(area)
    },
    []
  )

  const handleDragLeave = useCallback(() => {
    setDragOverArea(null)
  }, [])

  const handleDrop = useCallback(
    (area: 'row' | 'column' | 'value', event: React.DragEvent) => {
      event.preventDefault()
      const field = event.dataTransfer?.getData('text/plain')

      if (!field || field.startsWith('reorder:')) {
        setDragOverArea(null)
        return
      }

      if (rowFields.includes(field)) onRemoveRowField(field)
      if (columnFields.includes(field)) onRemoveColumnField(field)
      const existingValue = valueFields.find(v => v.field === field)
      if (existingValue) onRemoveValueField(field, existingValue.aggregation)

      switch (area) {
        case 'row':
          onAddRowField(field)
          break
        case 'column':
          onAddColumnField(field)
          break
        case 'value':
          onAddValueField(field, 'sum')
          break
      }
      setDragOverArea(null)
    },
    [rowFields, columnFields, valueFields, onAddRowField, onRemoveRowField, onAddColumnField, onRemoveColumnField, onAddValueField, onRemoveValueField]
  )

  // Reorder handlers for chips within zones
  const handleChipDragStart = useCallback(
    (zone: 'row' | 'column', index: number, event: React.DragEvent) => {
      setReorderDragSource({ zone, index })
      event.dataTransfer!.effectAllowed = 'move'
      event.dataTransfer!.setData('text/plain', `reorder:${zone}:${index}`)
      // Clear any zone drag-over state
      requestAnimationFrame(() => {
        setDragOverArea(null)
      })
    },
    []
  )

  const handleChipDragEnd = useCallback(() => {
    setReorderDragSource(null)
    setReorderDropTarget(null)
  }, [])

  const handleChipDragOver = useCallback(
    (zone: 'row' | 'column', index: number, event: React.DragEvent) => {
      event.preventDefault()
      // Only handle reorder within same zone
      if (reorderDragSource && reorderDragSource.zone === zone) {
        event.dataTransfer!.dropEffect = 'move'
        setReorderDropTarget({ zone, index })
      }
    },
    [reorderDragSource]
  )

  const handleChipDragLeave = useCallback(() => {
    setReorderDropTarget(null)
  }, [])

  const handleChipDrop = useCallback(
    (zone: 'row' | 'column', targetIndex: number, event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (!reorderDragSource || reorderDragSource.zone !== zone) {
        return
      }

      const sourceIndex = reorderDragSource.index
      if (sourceIndex === targetIndex) {
        setReorderDragSource(null)
        setReorderDropTarget(null)
        return
      }

      // Create reordered array
      const fields = zone === 'row' ? [...rowFields] : [...columnFields]
      const [movedField] = fields.splice(sourceIndex, 1)
      fields.splice(targetIndex, 0, movedField)

      // Emit reorder event
      if (zone === 'row') {
        onReorderRowFields(fields)
      } else {
        onReorderColumnFields(fields)
      }

      setReorderDragSource(null)
      setReorderDropTarget(null)
    },
    [reorderDragSource, rowFields, columnFields, onReorderRowFields, onReorderColumnFields]
  )

  const isChipDragSource = useCallback(
    (zone: 'row' | 'column', index: number): boolean => {
      return reorderDragSource?.zone === zone && reorderDragSource?.index === index
    },
    [reorderDragSource]
  )

  const isChipDropTarget = useCallback(
    (zone: 'row' | 'column', index: number): boolean => {
      return reorderDropTarget?.zone === zone && reorderDropTarget?.index === index
    },
    [reorderDropTarget]
  )

  const currentFontSize = fontSize

  // Calculate width per row header column
  const rowHeaderWidth = 180
  const rowHeaderColWidth = useMemo(() => {
    const numCols = Math.max(rowFields.length, 1)
    return Math.max(rowHeaderWidth / numCols, 80)
  }, [rowFields.length])

  // Calculate left offset for each row header column (for sticky positioning)
  const getRowHeaderLeftOffset = useCallback((fieldIdx: number): number => {
    return fieldIdx * rowHeaderColWidth
  }, [rowHeaderColWidth])

  return (
    <div
      className={`vpg-pivot-skeleton vpg-font-${currentFontSize} ${draggingField ? 'vpg-is-dragging' : ''}`}
    >
      {/* Copy Toast */}
      {showCopyToast && (
        <div className="vpg-toast">
          <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {copyToastMessage}
        </div>
      )}

      {/* Header Bar */}
      <div className="vpg-skeleton-header">
        <div className="vpg-skeleton-title">
          <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
            />
          </svg>
          <span>Pivot Table</span>
        </div>

        <div className="vpg-header-right">
          {hasActiveFilters && (
            <div
              className="vpg-filter-indicator"
              onMouseEnter={() => setShowFilterTooltip(true)}
              onMouseLeave={() => setShowFilterTooltip(false)}
            >
              <svg
                className="vpg-filter-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span className="vpg-filter-text">
                Filtered: <strong>{filterSummary}</strong>
                {filteredRowCount !== undefined && totalRowCount !== undefined && (
                  <span className="vpg-filter-count">
                    ({filteredRowCount.toLocaleString()} of {totalRowCount.toLocaleString()} rows)
                  </span>
                )}
              </span>

              {/* Tooltip */}
              {showFilterTooltip && (
                <div className="vpg-filter-tooltip">
                  <div className="vpg-tooltip-header">Active Filters</div>
                  {filterTooltipDetails.map(filter => (
                    <div key={filter.column} className="vpg-tooltip-filter">
                      <div className="vpg-tooltip-column">{filter.column}</div>
                      <div className="vpg-tooltip-values">
                        {filter.isRange ? (
                          <span className="vpg-tooltip-value vpg-range-value">{filter.displayText}</span>
                        ) : (
                          <>
                            {filter.values.map((val, idx) => (
                              <span key={idx} className="vpg-tooltip-value">
                                {val}
                              </span>
                            ))}
                            {filter.remaining > 0 && (
                              <span className="vpg-tooltip-more">+{filter.remaining} more</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredRowCount !== undefined && totalRowCount !== undefined && (
                    <div className="vpg-tooltip-summary">
                      Showing {filteredRowCount.toLocaleString()} of {totalRowCount.toLocaleString()} rows
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isConfigured && (
            <div className="vpg-config-summary">
              <span className="vpg-summary-badge vpg-rows">
                {rowFields.length} row{rowFields.length !== 1 ? 's' : ''}
              </span>
              <span className="vpg-summary-badge vpg-cols">
                {columnFields.length} col{columnFields.length !== 1 ? 's' : ''}
              </span>
              <span className="vpg-summary-badge vpg-vals">
                {valueFields.length} val{valueFields.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* License Required Message */}
      {!canUsePivot ? (
        <div className="vpg-pro-required">
          <div className="vpg-pro-content">
            <svg className="vpg-pro-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3>Pro Feature</h3>
            <p>Pivot Table functionality requires a Pro license.</p>
            <a href="https://tiny-pivot.com/#pricing" target="_blank" rel="noopener noreferrer" className="vpg-pro-link">
              Get Pro License →
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Config Bar */}
          <div className="vpg-config-bar">
            {/* Row drop zone */}
            <div
              className={`vpg-drop-zone vpg-row-zone ${dragOverArea === 'row' ? 'vpg-drag-over' : ''}`}
              onDragOver={e => handleDragOver('row', e)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop('row', e)}
            >
              <div className="vpg-zone-header">
                <span className="vpg-zone-icon vpg-row-icon">↓</span>
                <span className="vpg-zone-label">Rows</span>
              </div>
              <div className="vpg-zone-chips">
                {rowFields.map((field, idx) => (
                  <div
                    key={field}
                    className={`vpg-mini-chip vpg-row-chip ${isChipDragSource('row', idx) ? 'vpg-chip-dragging' : ''} ${isChipDropTarget('row', idx) ? 'vpg-chip-drop-target' : ''}`}
                    draggable
                    onDragStart={e => handleChipDragStart('row', idx, e)}
                    onDragEnd={handleChipDragEnd}
                    onDragOver={e => handleChipDragOver('row', idx, e)}
                    onDragLeave={handleChipDragLeave}
                    onDrop={e => handleChipDrop('row', idx, e)}
                  >
                    <span className="vpg-drag-handle">⋮⋮</span>
                    <span className="vpg-mini-name">{field}</span>
                    <button
                      className="vpg-mini-remove"
                      onClick={e => { e.stopPropagation(); onRemoveRowField(field) }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {rowFields.length === 0 && <span className="vpg-zone-hint">Drop here</span>}
              </div>
            </div>

            {/* Column drop zone */}
            <div
              className={`vpg-drop-zone vpg-column-zone ${dragOverArea === 'column' ? 'vpg-drag-over' : ''}`}
              onDragOver={e => handleDragOver('column', e)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop('column', e)}
            >
              <div className="vpg-zone-header">
                <span className="vpg-zone-icon vpg-column-icon">→</span>
                <span className="vpg-zone-label">Columns</span>
              </div>
              <div className="vpg-zone-chips">
                {columnFields.map((field, idx) => (
                  <div
                    key={field}
                    className={`vpg-mini-chip vpg-column-chip ${isChipDragSource('column', idx) ? 'vpg-chip-dragging' : ''} ${isChipDropTarget('column', idx) ? 'vpg-chip-drop-target' : ''}`}
                    draggable
                    onDragStart={e => handleChipDragStart('column', idx, e)}
                    onDragEnd={handleChipDragEnd}
                    onDragOver={e => handleChipDragOver('column', idx, e)}
                    onDragLeave={handleChipDragLeave}
                    onDrop={e => handleChipDrop('column', idx, e)}
                  >
                    <span className="vpg-drag-handle">⋮⋮</span>
                    <span className="vpg-mini-name">{field}</span>
                    <button
                      className="vpg-mini-remove"
                      onClick={e => { e.stopPropagation(); onRemoveColumnField(field) }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {columnFields.length === 0 && <span className="vpg-zone-hint">Drop here</span>}
              </div>
            </div>

            {/* Values drop zone */}
            <div
              className={`vpg-drop-zone vpg-value-zone ${dragOverArea === 'value' ? 'vpg-drag-over' : ''}`}
              onDragOver={e => handleDragOver('value', e)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop('value', e)}
            >
              <div className="vpg-zone-header">
                <span className="vpg-zone-icon vpg-value-icon">Σ</span>
                <span className="vpg-zone-label">Values</span>
              </div>
              <div className="vpg-zone-chips">
                {valueFields.map(vf => (
                  <div
                    key={`${vf.field}-${vf.aggregation}`}
                    className={`vpg-mini-chip vpg-value-chip${isCalculatedField(vf.field) ? ' vpg-calc-chip' : ''}`}
                  >
                    <span className="vpg-agg-symbol">{isCalculatedField(vf.field) ? 'ƒ' : getAggregationSymbol(vf.aggregation)}</span>
                    <span className="vpg-mini-name">{getValueFieldDisplayName(vf.field)}</span>
                    <button
                      className="vpg-mini-remove"
                      onClick={() => onRemoveValueField(vf.field, vf.aggregation)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {valueFields.length === 0 && <span className="vpg-zone-hint">Drop numeric</span>}
              </div>
            </div>
          </div>

          {/* Placeholder when not configured */}
          {(!isConfigured || !pivotResult) && (
            <div className="vpg-placeholder">
              <div className="vpg-placeholder-content">
                <svg
                  className="vpg-placeholder-icon"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="vpg-placeholder-text">
                  {valueFields.length === 0 ? (
                    <>
                      Add a <strong>Values</strong> field to see your pivot table
                    </>
                  ) : rowFields.length === 0 && columnFields.length === 0 ? (
                    <>
                      Add <strong>Row</strong> or <strong>Column</strong> fields to group your data
                    </>
                  ) : (
                    'Your pivot table will appear here'
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Data Table */}
          {isConfigured && pivotResult && (
            <div className="vpg-table-container">
              <table className="vpg-pivot-table">
                <thead>
                  {columnHeaderCells.map((headerRow, levelIdx) => (
                    <tr key={`header-${levelIdx}`} className="vpg-column-header-row">
                      {levelIdx === 0 && (rowFields.length > 0 ? rowFields : ['Rows']).map((field, fieldIdx) => (
                        <th
                          key={`row-header-${fieldIdx}`}
                          className="vpg-row-header-label"
                          rowSpan={columnHeaderCells.length}
                          style={{ width: `${rowHeaderColWidth}px`, minWidth: '80px', left: `${getRowHeaderLeftOffset(fieldIdx)}px` }}
                          onClick={() => toggleSort('row')}
                        >
                          <div className="vpg-header-content">
                            <span>{field}</span>
                            {(fieldIdx === rowFields.length - 1 || rowFields.length === 0) && (
                              <span className={`vpg-sort-indicator ${sortTarget === 'row' ? 'active' : ''}`}>
                                {sortTarget === 'row' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      {headerRow.map((cell, idx) => (
                        <th
                          key={idx}
                          className="vpg-column-header-cell"
                          colSpan={cell.colspan}
                          onClick={() =>
                            levelIdx === columnHeaderCells.length - 1 && toggleSort(idx)
                          }
                        >
                          <div className="vpg-header-content">
                            <span>{cell.label}</span>
                            {levelIdx === columnHeaderCells.length - 1 && (
                              <span className={`vpg-sort-indicator ${sortTarget === idx ? 'active' : ''}`}>
                                {sortTarget === idx
                                  ? sortDirection === 'asc'
                                    ? '↑'
                                    : '↓'
                                  : '⇅'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      {pivotResult.rowTotals.length > 0 && levelIdx === 0 && (
                        <th className="vpg-total-header" rowSpan={columnHeaderCells.length}>
                          Total
                        </th>
                      )}
                    </tr>
                  ))}
                </thead>

                <tbody>
                  {sortedRowIndices.map(sortedIdx => (
                    <tr key={sortedIdx} className="vpg-data-row">
                      {pivotResult.rowHeaders[sortedIdx].map((val, idx) => (
                        <th
                          key={`row-${sortedIdx}-${idx}`}
                          className="vpg-row-header-cell"
                          style={{ width: `${rowHeaderColWidth}px`, minWidth: '80px', left: `${getRowHeaderLeftOffset(idx)}px` }}
                        >
                          {val}
                        </th>
                      ))}

                      {pivotResult.data[sortedIdx].map((cell, colIdx) => {
                        const displayRowIdx = sortedRowIndices.indexOf(sortedIdx)
                        return (
                          <td
                            key={colIdx}
                            className={`vpg-data-cell ${isCellSelected(displayRowIdx, colIdx) ? 'selected' : ''} ${cell.value === null ? 'vpg-is-null' : ''}`}
                            onMouseDown={e => handleCellMouseDown(displayRowIdx, colIdx, e)}
                            onMouseEnter={() => handleCellMouseEnter(displayRowIdx, colIdx)}
                          >
                            {cell.formattedValue}
                          </td>
                        )
                      })}

                      {pivotResult.rowTotals[sortedIdx] && (
                        <td className="vpg-data-cell vpg-total-cell">
                          {pivotResult.rowTotals[sortedIdx].formattedValue}
                        </td>
                      )}
                    </tr>
                  ))}

                  {pivotResult.columnTotals.length > 0 && (
                    <tr className="vpg-totals-row">
                      <th
                        className="vpg-row-header-cell vpg-total-label"
                        colSpan={Math.max(rowFields.length, 1)}
                        style={{ width: `${rowHeaderWidth}px` }}
                      >
                        Total
                      </th>
                      {pivotResult.columnTotals.map((cell, colIdx) => (
                        <td key={colIdx} className="vpg-data-cell vpg-total-cell">
                          {cell.formattedValue}
                        </td>
                      ))}
                      {pivotResult.rowTotals.length > 0 && (
                        <td className="vpg-data-cell vpg-grand-total-cell">
                          {pivotResult.grandTotal.formattedValue}
                        </td>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {isConfigured && pivotResult && (
            <div className="vpg-skeleton-footer">
              <span className="vpg-footer-info">
                {pivotResult.rowHeaders.length} rows × {pivotResult.data[0]?.length || 0} columns
              </span>
              
              {selectionStats && selectionStats.count > 1 && (
                <div className="vpg-selection-stats">
                  <span className="vpg-stat">
                    <span className="vpg-stat-label">Count:</span>
                    <span className="vpg-stat-value">{selectionStats.count}</span>
                  </span>
                  {selectionStats.numericCount > 0 && (
                    <>
                      <span className="vpg-stat-divider">|</span>
                      <span className="vpg-stat">
                        <span className="vpg-stat-label">Sum:</span>
                        <span className="vpg-stat-value">{formatStatValue(selectionStats.sum)}</span>
                      </span>
                      <span className="vpg-stat-divider">|</span>
                      <span className="vpg-stat">
                        <span className="vpg-stat-label">Avg:</span>
                        <span className="vpg-stat-value">{formatStatValue(selectionStats.avg)}</span>
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Watermark / Demo Banner */}
      {showWatermark && canUsePivot && (
        <div className={`vpg-watermark ${isDemo ? 'vpg-demo-mode' : ''}`}>
          {isDemo ? (
            <>
              <span className="vpg-demo-badge">DEMO</span>
              <span>Pro features unlocked for evaluation</span>
              <a
                href="https://tiny-pivot.com/#pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="vpg-get-pro"
              >
                Get Pro License →
              </a>
            </>
          ) : (
            <a href="https://tiny-pivot.com" target="_blank" rel="noopener noreferrer">
              Powered by TinyPivot
            </a>
          )}
        </div>
      )}
    </div>
  )
}


