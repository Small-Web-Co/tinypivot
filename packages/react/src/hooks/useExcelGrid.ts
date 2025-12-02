/**
 * Excel-like Grid Hook for React
 * Provides Excel-like filtering, sorting, and data manipulation functionality
 */
import { useState, useMemo, useCallback } from 'react'
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
import type { ColumnStats } from '@smallwebco/tinypivot-core'
import { getColumnUniqueValues, formatCellValue } from '@smallwebco/tinypivot-core'

// Re-export for convenience
export { getColumnUniqueValues, formatCellValue }

export interface ExcelGridOptions<T> {
  data: T[]
  columns?: string[]
  enableSorting?: boolean
  enableFiltering?: boolean
  pageSize?: number
}

/**
 * Multi-value filter function for Excel-style filtering
 */
const multiSelectFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) {
    return true
  }

  const cellValue = row.getValue(columnId)
  const cellString =
    cellValue === null || cellValue === undefined || cellValue === ''
      ? '(blank)'
      : String(cellValue)

  return filterValue.includes(cellString)
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

  // Compute columns from data
  const columnKeys = useMemo(() => {
    if (data.length === 0) return []
    return Object.keys(data[0] as Record<string, unknown>)
  }, [data])

  // Get column stats (memoized)
  const getColumnStats = useCallback(
    (columnKey: string): ColumnStats => {
      const cacheKey = `${columnKey}-${data.length}`
      if (!columnStatsCache[cacheKey]) {
        const stats = getColumnUniqueValues(data, columnKey)
        setColumnStatsCache(prev => ({ ...prev, [cacheKey]: stats }))
        return stats
      }
      return columnStatsCache[cacheKey]
    },
    [data, columnStatsCache]
  )

  // Clear stats cache
  const clearStatsCache = useCallback(() => {
    setColumnStatsCache({})
  }, [])

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

  // Check if column has active filter
  const hasActiveFilter = useCallback(
    (columnId: string): boolean => {
      const column = table.getColumn(columnId)
      if (!column) return false
      const filterValue = column.getFilterValue()
      return filterValue !== undefined && Array.isArray(filterValue) && filterValue.length > 0
    },
    [table]
  )

  // Set column filter
  const setColumnFilter = useCallback(
    (columnId: string, values: string[]) => {
      const column = table.getColumn(columnId)
      if (column) {
        column.setFilterValue(values.length === 0 ? undefined : values)
        // Force sync columnFilters state with table state
        setColumnFilters(table.getState().columnFilters)
      }
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
  }
}

