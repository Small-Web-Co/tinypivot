/**
 * Grid Features Hook for React
 * Provides CSV export, clipboard, pagination, and other utility features
 */
import { useState, useMemo, useCallback } from 'react'
import type { PaginationOptions, SelectionBounds, PivotValueField } from '@smallwebco/tinypivot-core'
import {
  exportToCSV as coreExportToCSV,
  exportPivotToCSV as coreExportPivotToCSV,
  copyToClipboard as coreCopyToClipboard,
  formatSelectionForClipboard as coreFormatSelection,
} from '@smallwebco/tinypivot-core'
import type { PivotExportData, ExportOptions } from '@smallwebco/tinypivot-core'

// Re-export core functions
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options?: ExportOptions
): void {
  coreExportToCSV(data, columns, options)
}

export function exportPivotToCSV(
  pivotData: PivotExportData,
  rowFields: string[],
  columnFields: string[],
  valueFields: PivotValueField[],
  options?: ExportOptions
): void {
  coreExportPivotToCSV(pivotData, rowFields, columnFields, valueFields, options)
}

export function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: Error) => void
): void {
  coreCopyToClipboard(text, onSuccess, onError)
}

export function formatSelectionForClipboard<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
  selectionBounds: SelectionBounds
): string {
  return coreFormatSelection(rows, columns, selectionBounds)
}

/**
 * Pagination hook
 */
export function usePagination<T>(data: T[], options: PaginationOptions = {}) {
  const [pageSize, setPageSize] = useState(options.pageSize ?? 50)
  const [currentPage, setCurrentPage] = useState(options.currentPage ?? 1)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.length / pageSize)),
    [data.length, pageSize]
  )

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return data.slice(start, end)
  }, [data, currentPage, pageSize])

  const startIndex = useMemo(() => (currentPage - 1) * pageSize + 1, [currentPage, pageSize])
  const endIndex = useMemo(
    () => Math.min(currentPage * pageSize, data.length),
    [currentPage, pageSize, data.length]
  )

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)))
    },
    [totalPages]
  )

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
    }
  }, [currentPage, totalPages])

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
    }
  }, [currentPage])

  const firstPage = useCallback(() => {
    setCurrentPage(1)
  }, [])

  const lastPage = useCallback(() => {
    setCurrentPage(totalPages)
  }, [totalPages])

  const updatePageSize = useCallback((size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }, [])

  return {
    pageSize,
    currentPage,
    totalPages,
    paginatedData,
    startIndex,
    endIndex,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setPageSize: updatePageSize,
  }
}

/**
 * Global search/filter hook
 */
export function useGlobalSearch<T extends Record<string, unknown>>(data: T[], columns: string[]) {
  const [searchTerm, setSearchTerm] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) {
      return data
    }

    const term = caseSensitive ? searchTerm.trim() : searchTerm.trim().toLowerCase()

    return data.filter(row => {
      for (const col of columns) {
        const value = row[col]
        if (value === null || value === undefined) continue

        const strValue = caseSensitive ? String(value) : String(value).toLowerCase()

        if (strValue.includes(term)) {
          return true
        }
      }
      return false
    })
  }, [data, columns, searchTerm, caseSensitive])

  const clearSearch = useCallback(() => {
    setSearchTerm('')
  }, [])

  return {
    searchTerm,
    setSearchTerm,
    caseSensitive,
    setCaseSensitive,
    filteredData,
    clearSearch,
  }
}

/**
 * Row selection hook
 */
export function useRowSelection<T>(data: T[]) {
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set())

  const selectedRows = useMemo(() => {
    return Array.from(selectedRowIndices)
      .sort((a, b) => a - b)
      .map(idx => data[idx])
      .filter(Boolean)
  }, [data, selectedRowIndices])

  const allSelected = useMemo(() => {
    return data.length > 0 && selectedRowIndices.size === data.length
  }, [data.length, selectedRowIndices.size])

  const someSelected = useMemo(() => {
    return selectedRowIndices.size > 0 && selectedRowIndices.size < data.length
  }, [data.length, selectedRowIndices.size])

  const toggleRow = useCallback((index: number) => {
    setSelectedRowIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const selectRow = useCallback((index: number) => {
    setSelectedRowIndices(prev => new Set([...prev, index]))
  }, [])

  const deselectRow = useCallback((index: number) => {
    setSelectedRowIndices(prev => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedRowIndices(new Set(data.map((_, idx) => idx)))
  }, [data])

  const deselectAll = useCallback(() => {
    setSelectedRowIndices(new Set())
  }, [])

  const toggleAll = useCallback(() => {
    if (allSelected) {
      deselectAll()
    } else {
      selectAll()
    }
  }, [allSelected, selectAll, deselectAll])

  const isSelected = useCallback(
    (index: number): boolean => {
      return selectedRowIndices.has(index)
    },
    [selectedRowIndices]
  )

  const selectRange = useCallback((startIndex: number, endIndex: number) => {
    const min = Math.min(startIndex, endIndex)
    const max = Math.max(startIndex, endIndex)
    setSelectedRowIndices(prev => {
      const next = new Set(prev)
      for (let i = min; i <= max; i++) {
        next.add(i)
      }
      return next
    })
  }, [])

  return {
    selectedRowIndices,
    selectedRows,
    allSelected,
    someSelected,
    toggleRow,
    selectRow,
    deselectRow,
    selectAll,
    deselectAll,
    toggleAll,
    isSelected,
    selectRange,
  }
}

/**
 * Column resizing hook
 */
export function useColumnResize(
  initialWidths: Record<string, number>,
  minWidth = 60,
  maxWidth = 600
) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...initialWidths })
  const [isResizing, setIsResizing] = useState(false)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)

  const startResize = useCallback(
    (columnId: string, event: React.MouseEvent) => {
      setIsResizing(true)
      setResizingColumn(columnId)
      const startX = event.clientX
      const startWidth = columnWidths[columnId] || 150

      const handleMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + diff))
        setColumnWidths(prev => ({
          ...prev,
          [columnId]: newWidth,
        }))
      }

      const handleMouseUp = () => {
        setIsResizing(false)
        setResizingColumn(null)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [columnWidths, minWidth, maxWidth]
  )

  const resetColumnWidth = useCallback(
    (columnId: string) => {
      if (initialWidths[columnId]) {
        setColumnWidths(prev => ({
          ...prev,
          [columnId]: initialWidths[columnId],
        }))
      }
    },
    [initialWidths]
  )

  const resetAllWidths = useCallback(() => {
    setColumnWidths({ ...initialWidths })
  }, [initialWidths])

  return {
    columnWidths,
    setColumnWidths,
    isResizing,
    resizingColumn,
    startResize,
    resetColumnWidth,
    resetAllWidths,
  }
}

