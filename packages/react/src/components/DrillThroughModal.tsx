/**
 * Drill-Through Modal for React
 * Displays source rows for a pivot cell in a paginated table
 */
import type { DrillThroughResult, PivotValueField } from '@smallwebco/tinypivot-core'
import { exportToCSV, getAggregationLabel } from '@smallwebco/tinypivot-core'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface DrillThroughModalProps {
  show: boolean
  result: DrillThroughResult | null
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  onClose: () => void
}

const PAGE_SIZE = 50

export function DrillThroughModal({
  show,
  result,
  onClose,
}: DrillThroughModalProps) {
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when modal opens or result changes
  useEffect(() => {
    if (show) {
      setCurrentPage(1)
    }
  }, [show, result])

  // Keyboard listener — only depends on show and onClose
  useEffect(() => {
    if (!show)
      return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [show, onClose])

  // Column keys from the first row
  const columns = useMemo((): string[] => {
    if (!result || result.rows.length === 0)
      return []
    return Object.keys(result.rows[0])
  }, [result])

  // Total pages
  const totalPages = useMemo(() => {
    if (!result)
      return 1
    return Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE))
  }, [result])

  // Rows for current page
  const pageRows = useMemo(() => {
    if (!result)
      return []
    const start = (currentPage - 1) * PAGE_SIZE
    return result.rows.slice(start, start + PAGE_SIZE)
  }, [result, currentPage])

  // Modal title
  const modalTitle = useMemo(() => {
    if (!result)
      return 'Drill Through'

    const { descriptor } = result
    const parts: string[] = []

    if (descriptor.rowPath.length > 0)
      parts.push(descriptor.rowPath.join(' × '))
    if (descriptor.columnPath.length > 0)
      parts.push(descriptor.columnPath.join(' × '))

    const slice = parts.length > 0 ? parts.join(' × ') : 'Grand Total'
    const aggLabel = getAggregationLabel(descriptor.aggregation)
    const valueStr = descriptor.formattedValue !== '-'
      ? ` = ${descriptor.formattedValue}`
      : ''

    return `${slice} — ${aggLabel} of ${descriptor.valueField}${valueStr} · ${descriptor.rowCount} rows`
  }, [result])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handleExport = useCallback(() => {
    if (!result || result.rows.length === 0)
      return
    exportToCSV(result.rows, columns, { filename: 'drill-through.csv' })
  }, [result, columns])

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined)
      return ''
    return String(value)
  }

  if (!show || typeof document === 'undefined')
    return null

  return createPortal(
    <div className="vpg-modal-overlay" onClick={handleOverlayClick}>
      <div className="vpg-modal vpg-drill-modal">
        <div className="vpg-modal-header">
          <h3 className="vpg-drill-title">{modalTitle}</h3>
          <button className="vpg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="vpg-modal-body vpg-drill-body">
          {!result || result.rows.length === 0
            ? (
                <div className="vpg-drill-empty">
                  No source rows found for this cell.
                </div>
              )
            : (
                <>
                  <div className="vpg-drill-table-wrapper">
                    <table className="vpg-drill-table">
                      <thead>
                        <tr>
                          {columns.map(col => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {columns.map(col => (
                              <td key={col}>{formatCellValue(row[col])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="vpg-drill-pagination">
                      <button
                        className="vpg-page-btn"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        ←
                      </button>
                      <span>
                        Page
                        {' '}
                        {currentPage}
                        {' '}
                        of
                        {' '}
                        {totalPages}
                      </span>
                      <button
                        className="vpg-page-btn"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        →
                      </button>
                    </div>
                  )}
                </>
              )}
        </div>

        <div className="vpg-modal-footer">
          {result && result.rows.length > 0 && (
            <button className="vpg-btn vpg-btn-secondary" onClick={handleExport}>
              Export CSV
            </button>
          )}
          <button className="vpg-btn vpg-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
