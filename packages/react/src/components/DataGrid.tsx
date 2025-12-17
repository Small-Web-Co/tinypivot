/**
 * TinyPivot React - Main DataGrid Component
 * Excel-like data grid with optional pivot table functionality
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ColumnStats } from '@smallwebco/tinypivot-core'
import { useExcelGrid } from '../hooks/useExcelGrid'
import { usePivotTable } from '../hooks/usePivotTable'
import { useLicense } from '../hooks/useLicense'
import {
  exportToCSV,
  exportPivotToCSV,
  copyToClipboard,
  formatSelectionForClipboard,
} from '../hooks/useGridFeatures'
import { ColumnFilter } from './ColumnFilter'
import { PivotConfig } from './PivotConfig'
import { PivotSkeleton } from './PivotSkeleton'

interface DataGridProps {
  data: Record<string, unknown>[]
  loading?: boolean
  rowHeight?: number
  headerHeight?: number
  fontSize?: 'xs' | 'sm' | 'base'
  showPivot?: boolean
  enableExport?: boolean
  enableSearch?: boolean
  enablePagination?: boolean
  pageSize?: number
  enableColumnResize?: boolean
  enableClipboard?: boolean
  theme?: 'light' | 'dark' | 'auto'
  stripedRows?: boolean
  exportFilename?: string
  enableVerticalResize?: boolean
  initialHeight?: number
  minHeight?: number
  maxHeight?: number
  onCellClick?: (payload: {
    row: number
    col: number
    value: unknown
    rowData: Record<string, unknown>
  }) => void
  onSelectionChange?: (payload: { cells: Array<{ row: number; col: number }>; values: unknown[] }) => void
  onExport?: (payload: { rowCount: number; filename: string }) => void
  onCopy?: (payload: { text: string; cellCount: number }) => void
}

const MIN_COL_WIDTH = 120
const MAX_COL_WIDTH = 350

export function DataGrid({
  data,
  loading = false,
  fontSize: initialFontSize = 'xs',
  showPivot = true,
  enableExport = true,
  enableSearch = true,
  enablePagination = false,
  pageSize = 50,
  enableColumnResize = true,
  enableClipboard = true,
  theme = 'light',
  stripedRows = true,
  exportFilename = 'data-export.csv',
  enableVerticalResize = true,
  initialHeight = 600,
  minHeight = 300,
  maxHeight = 1200,
  onCellClick,
  onExport,
  onCopy,
}: DataGridProps) {
  const { showWatermark, canUsePivot, isDemo } = useLicense()

  // Theme handling
  const currentTheme = useMemo(() => {
    if (theme === 'auto') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  }, [theme])

  // State
  const [currentFontSize, setCurrentFontSize] = useState(initialFontSize)
  const [globalSearchTerm, setGlobalSearchTerm] = useState('')
  const [showSearchInput, setShowSearchInput] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)
  const [gridHeight, setGridHeight] = useState(initialHeight)
  const [isResizingVertically, setIsResizingVertically] = useState(false)
  const [verticalResizeStartY, setVerticalResizeStartY] = useState(0)
  const [verticalResizeStartHeight, setVerticalResizeStartHeight] = useState(0)
  const [showCopyToast, setShowCopyToast] = useState(false)
  const [copyToastMessage, setCopyToastMessage] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'pivot'>('grid')
  const [showPivotConfig, setShowPivotConfig] = useState(true)
  const [draggingField, setDraggingField] = useState<string | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0, maxHeight: 400 })
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null)
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)

  const fontSizeOptions = [
    { value: 'xs' as const, label: 'S' },
    { value: 'sm' as const, label: 'M' },
    { value: 'base' as const, label: 'L' },
  ]

  // Grid composable
  const {
    table,
    columnKeys,
    filteredRowCount,
    totalRowCount,
    getColumnStats,
    hasActiveFilter,
    setColumnFilter,
    getColumnFilterValues,
    clearAllFilters,
    toggleSort,
    getSortDirection,
    columnFilters,
    activeFilters,
    // Numeric range filters
    setNumericRangeFilter,
    getNumericRangeFilter,
  } = useExcelGrid({ data, enableSorting: true, enableFiltering: true })

  // Filtered data for pivot table
  const filteredDataForPivot = useMemo(() => {
    const filteredRows = table.getFilteredRowModel().rows
    return filteredRows.map(row => row.original)
  }, [table, columnFilters])

  // Pivot table composable
  const {
    rowFields: pivotRowFields,
    columnFields: pivotColumnFields,
    valueFields: pivotValueFields,
    showRowTotals: pivotShowRowTotals,
    showColumnTotals: pivotShowColumnTotals,
    calculatedFields: pivotCalculatedFields,
    availableFields: pivotAvailableFields,
    isConfigured: pivotIsConfigured,
    pivotResult,
    addRowField,
    removeRowField,
    addColumnField,
    removeColumnField,
    addValueField,
    removeValueField,
    updateValueFieldAggregation,
    clearConfig: clearPivotConfig,
    autoSuggestConfig,
    setShowRowTotals: setPivotShowRowTotals,
    setShowColumnTotals: setPivotShowColumnTotals,
    setRowFields,
    setColumnFields,
    addCalculatedField,
    removeCalculatedField,
  } = usePivotTable(filteredDataForPivot)

  // Active filters info for display
  const activeFilterInfo = useMemo(() => {
    if (activeFilters.length === 0) return null
    return activeFilters.map(f => {
      if (f.type === 'range' && f.range) {
        // Format range filter display
        const parts = []
        if (f.range.min !== null) parts.push(`≥ ${f.range.min}`)
        if (f.range.max !== null) parts.push(`≤ ${f.range.max}`)
        return {
          column: f.column,
          valueCount: 1,
          displayText: parts.join(' and '),
          isRange: true,
        }
      }
      return {
        column: f.column,
        valueCount: f.values?.length || 0,
        values: f.values || [],
        isRange: false,
      }
    })
  }, [activeFilters])

  // Rows - depends on columnFilters to recompute when filters change
  const rows = useMemo(() => table.getFilteredRowModel().rows, [table, columnFilters])

  // Filtered data based on global search
  const searchFilteredData = useMemo(() => {
    if (!globalSearchTerm.trim() || !enableSearch) {
      return rows
    }
    const term = globalSearchTerm.toLowerCase().trim()
    return rows.filter(row => {
      for (const col of columnKeys) {
        const value = row.original[col]
        if (value === null || value === undefined) continue
        if (String(value).toLowerCase().includes(term)) {
          return true
        }
      }
      return false
    })
  }, [rows, globalSearchTerm, enableSearch, columnKeys])

  // Paginated rows
  const totalSearchedRows = searchFilteredData.length
  const totalPages = useMemo(() => {
    if (!enablePagination) return 1
    return Math.max(1, Math.ceil(totalSearchedRows / pageSize))
  }, [enablePagination, totalSearchedRows, pageSize])

  const paginatedRows = useMemo(() => {
    if (!enablePagination) return searchFilteredData
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return searchFilteredData.slice(start, end)
  }, [enablePagination, searchFilteredData, currentPage, pageSize])

  // Reset to page 1 when filters or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [columnFilters, globalSearchTerm])

  // Selection bounds
  const selectionBounds = useMemo(() => {
    if (!selectionStart || !selectionEnd) return null
    return {
      minRow: Math.min(selectionStart.row, selectionEnd.row),
      maxRow: Math.max(selectionStart.row, selectionEnd.row),
      minCol: Math.min(selectionStart.col, selectionEnd.col),
      maxCol: Math.max(selectionStart.col, selectionEnd.col),
    }
  }, [selectionStart, selectionEnd])

  // Selection stats
  const selectionStats = useMemo(() => {
    if (!selectionBounds) return null
    const { minRow, maxRow, minCol, maxCol } = selectionBounds

    const values: number[] = []
    let count = 0

    for (let r = minRow; r <= maxRow; r++) {
      const row = rows[r]
      if (!row) continue

      for (let c = minCol; c <= maxCol; c++) {
        const colId = columnKeys[c]
        if (!colId) continue

        const value = row.original[colId]
        count++

        if (value !== null && value !== undefined && value !== '') {
          const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
          if (!Number.isNaN(num)) {
            values.push(num)
          }
        }
      }
    }

    if (values.length === 0) return { count, sum: null, avg: null, numericCount: 0 }

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length

    return { count, sum, avg, numericCount: values.length }
  }, [selectionBounds, rows, columnKeys])

  // Calculate column widths
  useEffect(() => {
    // Skip during SSR (no document available)
    if (typeof document === 'undefined') return
    if (data.length === 0) return

    const widths: Record<string, number> = {}
    const sampleSize = Math.min(100, data.length)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.font = '13px system-ui, -apple-system, sans-serif'

    for (const key of columnKeys) {
      let maxWidth = ctx.measureText(key).width + 56

      for (let i = 0; i < sampleSize; i++) {
        const value = data[i][key]
        const text = value === null || value === undefined ? '' : String(value)
        const width = ctx.measureText(text).width + 28
        maxWidth = Math.max(maxWidth, width)
      }

      widths[key] = Math.min(Math.max(maxWidth, MIN_COL_WIDTH), MAX_COL_WIDTH)
    }

    setColumnWidths(widths)
  }, [data, columnKeys])

  // Column resize handlers
  const startColumnResize = useCallback(
    (columnId: string, event: React.MouseEvent) => {
      if (!enableColumnResize) return
      event.preventDefault()
      event.stopPropagation()

      setResizingColumnId(columnId)
      setResizeStartX(event.clientX)
      setResizeStartWidth(columnWidths[columnId] || MIN_COL_WIDTH)
    },
    [enableColumnResize, columnWidths]
  )

  useEffect(() => {
    if (!resizingColumnId) return

    const handleResizeMove = (event: MouseEvent) => {
      const diff = event.clientX - resizeStartX
      const newWidth = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, resizeStartWidth + diff))
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumnId]: newWidth,
      }))
    }

    const handleResizeEnd = () => {
      setResizingColumnId(null)
    }

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [resizingColumnId, resizeStartX, resizeStartWidth])

  // Vertical resize handlers
  const startVerticalResize = useCallback(
    (event: React.MouseEvent) => {
      if (!enableVerticalResize) return
      event.preventDefault()

      setIsResizingVertically(true)
      setVerticalResizeStartY(event.clientY)
      setVerticalResizeStartHeight(gridHeight)
    },
    [enableVerticalResize, gridHeight]
  )

  useEffect(() => {
    if (!isResizingVertically) return

    const handleVerticalResizeMove = (event: MouseEvent) => {
      const diff = event.clientY - verticalResizeStartY
      const newHeight = Math.max(minHeight, Math.min(maxHeight, verticalResizeStartHeight + diff))
      setGridHeight(newHeight)
    }

    const handleVerticalResizeEnd = () => {
      setIsResizingVertically(false)
    }

    document.addEventListener('mousemove', handleVerticalResizeMove)
    document.addEventListener('mouseup', handleVerticalResizeEnd)
    return () => {
      document.removeEventListener('mousemove', handleVerticalResizeMove)
      document.removeEventListener('mouseup', handleVerticalResizeEnd)
    }
  }, [isResizingVertically, verticalResizeStartY, verticalResizeStartHeight, minHeight, maxHeight])

  // Export handlers
  const handleExport = useCallback(() => {
    if (viewMode === 'pivot') {
      if (!pivotResult) return

      const pivotFilename = exportFilename.replace('.csv', '-pivot.csv')
      exportPivotToCSV(
        {
          headers: pivotResult.headers,
          rowHeaders: pivotResult.rowHeaders,
          data: pivotResult.data,
          rowTotals: pivotResult.rowTotals,
          columnTotals: pivotResult.columnTotals,
          grandTotal: pivotResult.grandTotal,
          showRowTotals: pivotShowRowTotals,
          showColumnTotals: pivotShowColumnTotals,
        },
        pivotRowFields,
        pivotColumnFields,
        pivotValueFields,
        { filename: pivotFilename }
      )

      onExport?.({ rowCount: pivotResult.rowHeaders.length, filename: pivotFilename })
      return
    }

    const dataToExport =
      enableSearch && globalSearchTerm.trim()
        ? searchFilteredData.map(row => row.original)
        : rows.map(row => row.original)

    exportToCSV(dataToExport, columnKeys, {
      filename: exportFilename,
      includeHeaders: true,
    })

    onExport?.({ rowCount: dataToExport.length, filename: exportFilename })
  }, [
    viewMode,
    pivotResult,
    exportFilename,
    pivotShowRowTotals,
    pivotShowColumnTotals,
    pivotRowFields,
    pivotColumnFields,
    pivotValueFields,
    enableSearch,
    globalSearchTerm,
    searchFilteredData,
    rows,
    columnKeys,
    onExport,
  ])

  // Copy to clipboard
  const copySelectionToClipboard = useCallback(() => {
    if (!selectionBounds || !enableClipboard) return

    const text = formatSelectionForClipboard(
      rows.map(r => r.original),
      columnKeys,
      selectionBounds
    )

    copyToClipboard(
      text,
      () => {
        const cellCount =
          (selectionBounds.maxRow - selectionBounds.minRow + 1) *
          (selectionBounds.maxCol - selectionBounds.minCol + 1)
        setCopyToastMessage(`Copied ${cellCount} cell${cellCount > 1 ? 's' : ''}`)
        setShowCopyToast(true)
        setTimeout(() => setShowCopyToast(false), 2000)
        onCopy?.({ text, cellCount })
      },
      err => {
        setCopyToastMessage('Copy failed')
        setShowCopyToast(true)
        setTimeout(() => setShowCopyToast(false), 2000)
        console.error('Copy failed:', err)
      }
    )
  }, [selectionBounds, enableClipboard, rows, columnKeys, onCopy])

  // Cell selection handlers
  const handleMouseDown = useCallback(
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

      const row = rows[rowIndex]
      if (row) {
        const colId = columnKeys[colIndex]
        onCellClick?.({
          row: rowIndex,
          col: colIndex,
          value: row.original[colId],
          rowData: row.original,
        })
      }
    },
    [selectedCell, rows, columnKeys, onCellClick]
  )

  const handleMouseEnter = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (isSelecting) {
        setSelectionEnd({ row: rowIndex, col: colIndex })
      }
    },
    [isSelecting]
  )

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false)
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Keyboard handling
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Handle Ctrl+C / Cmd+C for clipboard
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && selectionBounds) {
        event.preventDefault()
        copySelectionToClipboard()
        return
      }

      // Handle Escape
      if (event.key === 'Escape') {
        setSelectedCell(null)
        setSelectionStart(null)
        setSelectionEnd(null)
        setShowSearchInput(false)
        setGlobalSearchTerm('')
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [selectionBounds, copySelectionToClipboard])

  // Filter dropdown
  const openFilterDropdown = useCallback(
    (columnId: string, event: React.MouseEvent) => {
      event.stopPropagation()
      const target = event.currentTarget as HTMLElement
      const headerCell = target.closest('.vpg-header-cell') as HTMLElement
      const rect = headerCell?.getBoundingClientRect() || target.getBoundingClientRect()

      const dropdownWidth = 280
      const padding = 12

      let left = rect.left
      if (left + dropdownWidth > window.innerWidth - padding) {
        left = window.innerWidth - dropdownWidth - padding
      }
      left = Math.max(padding, left)

      const spaceBelow = window.innerHeight - rect.bottom - padding
      const spaceAbove = rect.top - padding

      let top: number
      let maxDropdownHeight: number

      if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
        top = rect.bottom + 4
        maxDropdownHeight = Math.min(400, spaceBelow - 4)
      } else {
        maxDropdownHeight = Math.min(400, spaceAbove - 4)
        top = rect.top - maxDropdownHeight - 4
      }

      setFilterDropdownPosition({ top, left, maxHeight: maxDropdownHeight })
      setActiveFilterColumn(columnId)
    },
    []
  )

  const closeFilterDropdown = useCallback(() => {
    setActiveFilterColumn(null)
  }, [])

  const handleFilter = useCallback(
    (columnId: string, values: string[]) => {
      setColumnFilter(columnId, values)
    },
    [setColumnFilter]
  )

  const handleRangeFilter = useCallback(
    (columnId: string, range: import('@smallwebco/tinypivot-core').NumericRange | null) => {
      setNumericRangeFilter(columnId, range)
    },
    [setNumericRangeFilter]
  )

  const handleSort = useCallback(
    (columnId: string, direction: 'asc' | 'desc' | null) => {
      if (direction === null) {
        const current = getSortDirection(columnId)
        if (current) {
          toggleSort(columnId)
          if (getSortDirection(columnId)) {
            toggleSort(columnId)
          }
        }
      } else {
        const current = getSortDirection(columnId)
        if (current === null) {
          toggleSort(columnId)
          if (direction === 'desc' && getSortDirection(columnId) === 'asc') {
            toggleSort(columnId)
          }
        } else if (current !== direction) {
          toggleSort(columnId)
        }
      }
    },
    [getSortDirection, toggleSort]
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

  const formatStatValue = (value: number | null): string => {
    if (value === null) return '-'
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
  }

  // Format cell value
  const noFormatPatterns =
    /^(?:.*_)?(?:id|code|year|month|quarter|day|week|date|zip|phone|fax|ssn|ein|npi|ndc|gpi|hcpcs|icd|cpt|rx|bin|pcn|group|member|claim|rx_number|script|fill)(?:_.*)?$/i

  const shouldFormatNumber = (columnId: string): boolean => {
    return !noFormatPatterns.test(columnId)
  }

  const formatCellValueDisplay = (value: unknown, columnId: string): string => {
    if (value === null || value === undefined) return ''
    if (value === '') return ''

    const stats = getColumnStats(columnId)
    if (stats.type === 'number') {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(num)) return String(value)

      if (shouldFormatNumber(columnId) && Math.abs(num) >= 1000) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
      }

      if (Number.isInteger(num)) {
        return String(num)
      }
      return num.toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false })
    }

    return String(value)
  }

  const totalTableWidth = useMemo(() => {
    return columnKeys.reduce((sum, key) => sum + (columnWidths[key] || MIN_COL_WIDTH), 0)
  }, [columnKeys, columnWidths])

  const activeFilterCount = columnFilters.length

  return (
    <div
      className={`vpg-data-grid vpg-font-${currentFontSize} vpg-theme-${currentTheme} ${stripedRows ? 'vpg-striped' : ''} ${resizingColumnId ? 'vpg-resizing' : ''} ${isResizingVertically ? 'vpg-resizing-vertical' : ''}`}
      style={{ height: `${gridHeight}px` }}
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

      {/* Toolbar */}
      <div className="vpg-toolbar">
        <div className="vpg-toolbar-left">
          {/* View mode toggle */}
          {showPivot && (
            <div className="vpg-view-toggle">
              <button
                className={`vpg-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
              >
                <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Grid
              </button>
              <button
                className={`vpg-view-btn vpg-pivot-btn ${viewMode === 'pivot' ? 'active' : ''}`}
                onClick={() => setViewMode('pivot')}
              >
                <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
                Pivot
              </button>
            </div>
          )}

          {/* Grid mode controls */}
          {viewMode === 'grid' && (
            <>
              {/* Search */}
              {enableSearch && (
                <div className="vpg-search-container">
                  {!showSearchInput ? (
                    <button
                      className="vpg-icon-btn"
                      title="Search (Ctrl+F)"
                      onClick={() => setShowSearchInput(true)}
                    >
                      <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </button>
                  ) : (
                    <div className="vpg-search-box">
                      <svg
                        className="vpg-search-icon"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <input
                        type="text"
                        value={globalSearchTerm}
                        onChange={e => setGlobalSearchTerm(e.target.value)}
                        className="vpg-search-input"
                        placeholder="Search all columns..."
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            setShowSearchInput(false)
                            setGlobalSearchTerm('')
                          }
                        }}
                        autoFocus
                      />
                      {globalSearchTerm && (
                        <button className="vpg-search-clear" onClick={() => setGlobalSearchTerm('')}>
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="vpg-font-size-control">
                <span className="vpg-label">Size:</span>
                <div className="vpg-font-size-toggle">
                  {fontSizeOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={`vpg-font-size-btn ${currentFontSize === opt.value ? 'active' : ''}`}
                      onClick={() => setCurrentFontSize(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <div className="vpg-filter-info">
                  <svg className="vpg-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {globalSearchTerm && (
                <div className="vpg-search-info">
                  <span>
                    {totalSearchedRows} match{totalSearchedRows !== 1 ? 'es' : ''}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Pivot mode controls */}
          {viewMode === 'pivot' && canUsePivot && (
            <>
              <button
                className={`vpg-config-toggle ${showPivotConfig ? 'active' : ''}`}
                onClick={() => setShowPivotConfig(!showPivotConfig)}
              >
                <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
                {showPivotConfig ? 'Hide' : 'Show'} Config
              </button>

              {pivotIsConfigured && (
                <div className="vpg-pivot-status">
                  <svg className="vpg-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Pivot configured</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="vpg-toolbar-right">
          {viewMode === 'grid' && activeFilterCount > 0 && (
            <button className="vpg-clear-filters" onClick={clearAllFilters}>
              <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear Filters
            </button>
          )}

          {/* Copy button */}
          {enableClipboard && selectionBounds && viewMode === 'grid' && (
            <button
              className="vpg-icon-btn"
              title="Copy selection (Ctrl+C)"
              onClick={copySelectionToClipboard}
            >
              <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          )}

          {/* Export button */}
          {enableExport && (viewMode === 'grid' || (viewMode === 'pivot' && pivotIsConfigured)) && (
            <button
              className="vpg-export-btn"
              title={viewMode === 'pivot' ? 'Export Pivot to CSV' : 'Export to CSV'}
              onClick={handleExport}
            >
              <svg className="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export{viewMode === 'pivot' ? ' Pivot' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div ref={tableContainerRef} className="vpg-grid-container" tabIndex={0}>
          {loading && (
            <div className="vpg-loading">
              <div className="vpg-spinner" />
              <span>Loading data...</span>
            </div>
          )}

          {!loading && data.length === 0 && (
            <div className="vpg-empty">
              <div className="vpg-empty-icon">
                <svg className="vpg-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <span>No data available</span>
            </div>
          )}

          {!loading && data.length > 0 && filteredRowCount === 0 && (
            <div className="vpg-empty">
              <div className="vpg-empty-icon vpg-warning">
                <svg className="vpg-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </div>
              <span>No matching records</span>
              <button className="vpg-clear-link" onClick={clearAllFilters}>
                Clear all filters
              </button>
            </div>
          )}

          {!loading && filteredRowCount > 0 && (
            <div className="vpg-table-wrapper">
              <table className="vpg-table" style={{ minWidth: `${totalTableWidth}px` }}>
                <thead>
                  <tr>
                    {columnKeys.map((colId, colIndex) => (
                      <th
                        key={colId}
                        className={`vpg-header-cell ${hasActiveFilter(colId) ? 'vpg-has-filter' : ''} ${getSortDirection(colId) !== null ? 'vpg-is-sorted' : ''} ${activeFilterColumn === colId ? 'vpg-is-active' : ''}`}
                        style={{
                          width: `${columnWidths[colId] || MIN_COL_WIDTH}px`,
                          minWidth: `${columnWidths[colId] || MIN_COL_WIDTH}px`,
                        }}
                        onClick={e => {
                          const target = e.target as HTMLElement
                          if (target.closest('.vpg-dropdown-arrow')) {
                            openFilterDropdown(colId, e)
                          }
                        }}
                      >
                        <div className="vpg-header-content">
                          <span className="vpg-header-text">{colId}</span>
                          <div className="vpg-header-icons">
                            {getSortDirection(colId) && (
                              <span className="vpg-sort-indicator">
                                {getSortDirection(colId) === 'asc' ? (
                                  <svg
                                    className="vpg-icon-sm"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                ) : (
                                  <svg
                                    className="vpg-icon-sm"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </span>
                            )}
                            {hasActiveFilter(colId) && (
                              <span className="vpg-filter-indicator">
                                <svg
                                  className="vpg-icon-xs"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </span>
                            )}
                            <span className="vpg-dropdown-arrow" title="Filter & Sort">
                              <svg
                                className="vpg-icon-sm"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </span>
                          </div>
                        </div>
                        {enableColumnResize && (
                          <div
                            className="vpg-resize-handle"
                            onMouseDown={e => startColumnResize(colId, e)}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody ref={tableBodyRef}>
                  {paginatedRows.map((row, rowIndex) => (
                    <tr key={row.id} className="vpg-row">
                      {columnKeys.map((colId, colIndex) => (
                        <td
                          key={colId}
                          className={`vpg-cell ${isCellSelected(rowIndex, colIndex) ? 'vpg-selected' : ''} ${getColumnStats(colId).type === 'number' ? 'vpg-is-number' : ''}`}
                          data-row={rowIndex}
                          data-col={colIndex}
                          style={{
                            width: `${columnWidths[colId] || MIN_COL_WIDTH}px`,
                            minWidth: `${columnWidths[colId] || MIN_COL_WIDTH}px`,
                          }}
                          onMouseDown={e => handleMouseDown(rowIndex, colIndex, e)}
                          onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                        >
                          {formatCellValueDisplay(row.original[colId], colId)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pivot View */}
      {viewMode === 'pivot' && (
        <div className="vpg-pivot-container">
          {showPivotConfig && canUsePivot && (
            <div className="vpg-pivot-config-panel">
              <PivotConfig
                availableFields={pivotAvailableFields}
                rowFields={pivotRowFields}
                columnFields={pivotColumnFields}
                valueFields={pivotValueFields}
                showRowTotals={pivotShowRowTotals}
                showColumnTotals={pivotShowColumnTotals}
                calculatedFields={pivotCalculatedFields}
                onShowRowTotalsChange={setPivotShowRowTotals}
                onShowColumnTotalsChange={setPivotShowColumnTotals}
                onClearConfig={clearPivotConfig}
                onAutoSuggest={autoSuggestConfig}
                onDragStart={(field, e) => setDraggingField(field)}
                onDragEnd={() => setDraggingField(null)}
                onUpdateAggregation={updateValueFieldAggregation}
                onAddRowField={addRowField}
                onRemoveRowField={removeRowField}
                onAddColumnField={addColumnField}
                onRemoveColumnField={removeColumnField}
                onAddValueField={addValueField}
                onRemoveValueField={removeValueField}
                onAddCalculatedField={addCalculatedField}
                onRemoveCalculatedField={removeCalculatedField}
                onUpdateCalculatedField={addCalculatedField}
              />
            </div>
          )}

          <div className={`vpg-pivot-main ${!showPivotConfig ? 'vpg-full-width' : ''}`}>
            <PivotSkeleton
              rowFields={pivotRowFields}
              columnFields={pivotColumnFields}
              valueFields={pivotValueFields}
              calculatedFields={pivotCalculatedFields}
              isConfigured={pivotIsConfigured}
              draggingField={draggingField}
              pivotResult={pivotResult}
              fontSize={currentFontSize}
              activeFilters={activeFilterInfo}
              totalRowCount={totalRowCount}
              filteredRowCount={filteredRowCount}
              onAddRowField={addRowField}
              onRemoveRowField={removeRowField}
              onAddColumnField={addColumnField}
              onRemoveColumnField={removeColumnField}
              onAddValueField={addValueField}
              onRemoveValueField={removeValueField}
              onUpdateAggregation={updateValueFieldAggregation}
              onReorderRowFields={setRowFields}
              onReorderColumnFields={setColumnFields}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="vpg-footer">
        <div className="vpg-footer-left">
          {viewMode === 'grid' ? (
            enablePagination ? (
              <>
                <span>
                  {((currentPage - 1) * pageSize + 1).toLocaleString()}-
                  {Math.min(currentPage * pageSize, totalSearchedRows).toLocaleString()}
                </span>
                <span className="vpg-separator">of</span>
                <span>{totalSearchedRows.toLocaleString()}</span>
                {totalSearchedRows !== totalRowCount && (
                  <span className="vpg-filtered-note">({totalRowCount.toLocaleString()} total)</span>
                )}
              </>
            ) : filteredRowCount === totalRowCount && totalSearchedRows === totalRowCount ? (
              <span>{totalRowCount.toLocaleString()} records</span>
            ) : (
              <>
                <span className="vpg-filtered-count">{totalSearchedRows.toLocaleString()}</span>
                <span className="vpg-separator">of</span>
                <span>{totalRowCount.toLocaleString()}</span>
                <span className="vpg-separator">records</span>
              </>
            )
          ) : (
            <>
              <span className="vpg-pivot-label">Pivot Table</span>
              <span className="vpg-separator">•</span>
              <span>{totalRowCount.toLocaleString()} source records</span>
            </>
          )}
        </div>

        {/* Pagination controls */}
        {enablePagination && viewMode === 'grid' && totalPages > 1 && (
          <div className="vpg-pagination">
            <button
              className="vpg-page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
            >
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              className="vpg-page-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="vpg-page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="vpg-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <button
              className="vpg-page-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              <svg className="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}

        {viewMode === 'grid' && selectionStats && selectionStats.count > 1 && (
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

        <div className="vpg-footer-right">
          {isDemo ? (
            <div className="vpg-demo-banner">
              <span className="vpg-demo-badge">DEMO</span>
              <span>Pro features enabled</span>
              <a href="https://tiny-pivot.com/#pricing" target="_blank" rel="noopener noreferrer">
                Get License →
              </a>
            </div>
          ) : showWatermark ? (
            <span className="vpg-watermark-inline">
              <a href="https://tiny-pivot.com" target="_blank" rel="noopener noreferrer">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Powered by TinyPivot
              </a>
            </span>
          ) : null}
        </div>
      </div>

      {/* Vertical Resize Handle */}
      {enableVerticalResize && (
        <div className="vpg-vertical-resize-handle" onMouseDown={startVerticalResize}>
          <div className="vpg-resize-grip">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}

      {/* Filter Dropdown Portal */}
      {activeFilterColumn && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="vpg-filter-portal"
            style={{
              position: 'fixed',
              top: `${filterDropdownPosition.top}px`,
              left: `${filterDropdownPosition.left}px`,
              maxHeight: `${filterDropdownPosition.maxHeight}px`,
              zIndex: 9999,
            }}
          >
            <ColumnFilter
              columnId={activeFilterColumn}
              columnName={activeFilterColumn}
              stats={getColumnStats(activeFilterColumn)}
              selectedValues={getColumnFilterValues(activeFilterColumn)}
              sortDirection={getSortDirection(activeFilterColumn)}
              numericRange={getNumericRangeFilter(activeFilterColumn)}
              onFilter={values => handleFilter(activeFilterColumn, values)}
              onRangeFilter={range => handleRangeFilter(activeFilterColumn, range)}
              onSort={dir => handleSort(activeFilterColumn, dir)}
              onClose={closeFilterDropdown}
            />
          </div>,
          document.body
        )}
    </div>
  )
}

