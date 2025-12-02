/**
 * Excel-like Grid Hook for React
 * Provides Excel-like filtering, sorting, and data manipulation functionality
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type FilterFn,
} from '@tanstack/react-table'
import type { ColumnStats, NumericRange, ColumnFilterValue } from '@smallwebco/tinypivot-core'
import { getColumnUniqueValues, formatCellValue, isNumericRange } from '@smallwebco/tinypivot-core'

// Re-export for convenience
export { getColumnUniqueValues, formatCellValue, isNumericRange }

export interface ExcelGridOptions<T> {
  data: T[]
  columns?: string[]
  enableSorting?: boolean
  enableFiltering?: boolean
  pageSize?: number
}

/**
 * Combined filter function for Excel-style filtering and numeric range filtering
 */
const multiSelectFilter: FilterFn<unknown> = (row, columnId, filterValue: ColumnFilterValue | undefined) => {
  if (!filterValue) return true

  // Handle numeric range filter
  if (isNumericRange(filterValue)) {
    const cellValue = row.getValue(columnId)
    if (cellValue === null || cellValue === undefined || cellValue === '') {
      return false // Exclude null/empty values from numeric range filtering
    }
    const num = typeof cellValue === 'number' ? cellValue : Number.parseFloat(String(cellValue))
    if (Number.isNaN(num)) return false
    
    const { min, max } = filterValue
    if (min !== null && num < min) return false
    if (max !== null && num > max) return false
    return true
  }

  // Handle multi-select array filter
  if (Array.isArray(filterValue) && filterValue.length > 0) {
    const cellValue = row.getValue(columnId)
    const cellString =
      cellValue === null || cellValue === undefined || cellValue === ''
        ? '(blank)'
        : String(cellValue)
    return filterValue.includes(cellString)
  }

  return true
}

/**
 * Excel-like grid hook
 */
export function useExcelGrid<T extends Record<string, unknown>>(options: ExcelGridOptions<T>) {
  const { data, enableSorting = true, enableFiltering = true } = options

  // State
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Column statistics cache
  const [columnStatsCache, setColumnStatsCache] = useState<Record<string, ColumnStats>>({})

  const dataSignature = useMemo(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [data]
  )

  // Compute columns from data
  const columnKeys = useMemo(() => {
    if (data.length === 0) return []
    return Object.keys(data[0] as Record<string, unknown>)
  }, [data])

  // Get column stats (memoized)
  const getColumnStats = useCallback(
    (columnKey: string): ColumnStats => {
      const cacheKey = `${columnKey}-${dataSignature}`
      if (!columnStatsCache[cacheKey]) {
        const stats = getColumnUniqueValues(data, columnKey)
        setColumnStatsCache(prev => ({ ...prev, [cacheKey]: stats }))
        return stats
      }
      return columnStatsCache[cacheKey]
    },
    [data, columnStatsCache, dataSignature]
  )

  // Clear stats cache
  const clearStatsCache = useCallback(() => {
    setColumnStatsCache({})
  }, [])

  useEffect(() => {
    clearStatsCache()
  }, [dataSignature, clearStatsCache])

  // Create column definitions dynamically
  const columnDefs = useMemo<ColumnDef<T, unknown>[]>(() => {
    return columnKeys.map(key => {
      const stats = getColumnStats(key)

      return {
        id: key,
        accessorKey: key,
        header: key,
        cell: info => formatCellValue(info.getValue(), stats.type),
        filterFn: multiSelectFilter,
        meta: {
          type: stats.type,
          uniqueCount: stats.uniqueValues.length,
        },
      } as ColumnDef<T, unknown>
    })
  }, [columnKeys, getColumnStats])

  // Create table instance
  const table = useReactTable({
    data,
    columns: columnDefs,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    filterFns: {
      multiSelect: multiSelectFilter,
    },
    enableSorting,
    enableFilters: enableFiltering,
  })

  // Computed properties
  const filteredRowCount = table.getFilteredRowModel().rows.length
  const totalRowCount = data.length

  // Active filters
  const activeFilters = useMemo(() => {
    return columnFilters.map(f => ({
      column: f.id,
      values: f.value as string[],
    }))
  }, [columnFilters])

  // Check if column has active filter (handles both array and numeric range)
  const hasActiveFilter = useCallback(
    (columnId: string): boolean => {
      const column = table.getColumn(columnId)
      if (!column) return false
      const filterValue = column.getFilterValue() as ColumnFilterValue | undefined
      if (!filterValue) return false
      
      // Check for numeric range
      if (isNumericRange(filterValue)) {
        return filterValue.min !== null || filterValue.max !== null
      }
      
      // Check for value array
      return Array.isArray(filterValue) && filterValue.length > 0
    },
    [table]
  )

  // Set column filter (value-based)
  const setColumnFilter = useCallback(
    (columnId: string, values: string[]) => {
      const column = table.getColumn(columnId)
      if (column) {
        // Let the table's onColumnFiltersChange handler update the state
        // Do NOT manually call setColumnFilters after - it causes a race condition
        // where the stale state overwrites the pending update
        column.setFilterValue(values.length === 0 ? undefined : values)
      }
    },
    [table]
  )

  // Set numeric range filter
  const setNumericRangeFilter = useCallback(
    (columnId: string, range: NumericRange | null) => {
      const column = table.getColumn(columnId)
      if (column) {
        if (!range || (range.min === null && range.max === null)) {
          column.setFilterValue(undefined)
        } else {
          column.setFilterValue(range)
        }
      }
    },
    [table]
  )

  // Get numeric range filter for a column
  const getNumericRangeFilter = useCallback(
    (columnId: string): NumericRange | null => {
      const column = table.getColumn(columnId)
      if (!column) return null
      const filterValue = column.getFilterValue() as ColumnFilterValue | undefined
      if (filterValue && isNumericRange(filterValue)) {
        return filterValue
      }
      return null
    },
    [table]
  )

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    table.resetColumnFilters()
    setGlobalFilter('')
    // Force sync columnFilters state
    setColumnFilters([])
  }, [table])

  // Get filter values for a specific column
  const getColumnFilterValues = useCallback(
    (columnId: string): string[] => {
      const column = table.getColumn(columnId)
      if (!column) return []
      const filterValue = column.getFilterValue()
      return Array.isArray(filterValue) ? filterValue : []
    },
    [table]
  )

  // Toggle column sort
  const toggleSort = useCallback((columnId: string) => {
    setSorting(prev => {
      const current = prev.find(s => s.id === columnId)
      if (!current) {
        return [{ id: columnId, desc: false }]
      } else if (!current.desc) {
        return [{ id: columnId, desc: true }]
      } else {
        return []
      }
    })
  }, [])

  // Get sort direction for column
  const getSortDirection = useCallback(
    (columnId: string): 'asc' | 'desc' | null => {
      const sort = sorting.find(s => s.id === columnId)
      if (!sort) return null
      return sort.desc ? 'desc' : 'asc'
    },
    [sorting]
  )

  return {
    // Table instance
    table,

    // State
    sorting,
    columnFilters,
    columnVisibility,
    globalFilter,
    columnKeys,
    setSorting,
    setColumnFilters,
    setGlobalFilter,

    // Computed
    filteredRowCount,
    totalRowCount,
    activeFilters,

    // Methods
    getColumnStats,
    clearStatsCache,
    hasActiveFilter,
    setColumnFilter,
    getColumnFilterValues,
    clearAllFilters,
    toggleSort,
    getSortDirection,
    // Numeric range filters
    setNumericRangeFilter,
    getNumericRangeFilter,
  }
}


