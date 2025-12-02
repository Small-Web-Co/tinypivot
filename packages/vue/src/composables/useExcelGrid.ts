/**
 * Excel-like Grid Composable for Vue
 * Provides Excel-like filtering, sorting, and data manipulation functionality
 */
import type { ColumnDef, ColumnFiltersState, FilterFn, SortingState, VisibilityState } from '@tanstack/vue-table'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { type Ref, computed, ref, watch } from 'vue'
import type { ColumnStats } from '@smallwebco/tinypivot-core'
import { getColumnUniqueValues, formatCellValue } from '@smallwebco/tinypivot-core'

// Re-export for convenience
export { getColumnUniqueValues, formatCellValue }

export interface ExcelGridOptions<T> {
  data: Ref<T[]>
  columns?: string[]
  enableSorting?: boolean
  enableFiltering?: boolean
  pageSize?: number
}

/**
 * Multi-value filter function for Excel-style filtering
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const multiSelectFilter: FilterFn<any> = (row, columnId, filterValue) => {
  if (!filterValue || !Array.isArray(filterValue) || filterValue.length === 0) {
    return true
  }

  const cellValue = row.getValue(columnId)
  const cellString = cellValue === null || cellValue === undefined || cellValue === ''
    ? '(blank)'
    : String(cellValue)

  return filterValue.includes(cellString)
}

/**
 * Create Excel-like grid composable
 */
export function useExcelGrid<T extends Record<string, unknown>>(options: ExcelGridOptions<T>) {
  const { data, enableSorting = true, enableFiltering = true } = options

  // State
  const sorting = ref<SortingState>([])
  const columnFilters = ref<ColumnFiltersState>([])
  const columnVisibility = ref<VisibilityState>({})
  const globalFilter = ref('')

  // Column statistics cache
  const columnStatsCache = ref<Record<string, ColumnStats>>({})

  // Compute columns from data
  const columnKeys = computed(() => {
    if (data.value.length === 0) return []
    return Object.keys(data.value[0] as Record<string, unknown>)
  })

  // Get column stats (memoized)
  function getColumnStats(columnKey: string): ColumnStats {
    const cacheKey = `${columnKey}-${data.value.length}`
    if (!columnStatsCache.value[cacheKey]) {
      columnStatsCache.value[cacheKey] = getColumnUniqueValues(data.value, columnKey)
    }
    return columnStatsCache.value[cacheKey]
  }

  // Clear stats cache when data changes
  function clearStatsCache() {
    columnStatsCache.value = {}
  }

  // Create column definitions dynamically
  const columnDefs = computed<ColumnDef<T, unknown>[]>(() => {
    return columnKeys.value.map(key => {
      const stats = getColumnStats(key)

      return {
        id: key,
        accessorKey: key,
        header: key,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: (info: any) => formatCellValue(info.getValue(), stats.type),
        filterFn: multiSelectFilter,
        meta: {
          type: stats.type,
          uniqueCount: stats.uniqueValues.length,
        },
      } as ColumnDef<T, unknown>
    })
  })

  // Create table instance
  const table = useVueTable({
    get data() { return data.value },
    get columns() { return columnDefs.value },
    state: {
      get sorting() { return sorting.value },
      get columnFilters() { return columnFilters.value },
      get columnVisibility() { return columnVisibility.value },
      get globalFilter() { return globalFilter.value },
    },
    onSortingChange: updater => {
      sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
    },
    onColumnFiltersChange: updater => {
      columnFilters.value = typeof updater === 'function' ? updater(columnFilters.value) : updater
    },
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
  const filteredRowCount = computed(() => table.getFilteredRowModel().rows.length)
  const totalRowCount = computed(() => data.value.length)

  // Active filters
  const activeFilters = computed(() => {
    return columnFilters.value.map(f => ({
      column: f.id,
      values: f.value as string[],
    }))
  })

  // Check if column has active filter
  function hasActiveFilter(columnId: string): boolean {
    const column = table.getColumn(columnId)
    if (!column) return false
    const filterValue = column.getFilterValue()
    return filterValue !== undefined && Array.isArray(filterValue) && filterValue.length > 0
  }

  // Set column filter
  function setColumnFilter(columnId: string, values: string[]) {
    const column = table.getColumn(columnId)
    if (column) {
      column.setFilterValue(values.length === 0 ? undefined : values)
      // Force sync columnFilters ref with table state
      columnFilters.value = table.getState().columnFilters
    }
  }

  // Clear all filters
  function clearAllFilters() {
    table.resetColumnFilters()
    globalFilter.value = ''
    // Force sync columnFilters ref with table state
    columnFilters.value = []
  }

  // Get filter values for a specific column
  function getColumnFilterValues(columnId: string): string[] {
    const column = table.getColumn(columnId)
    if (!column) return []
    const filterValue = column.getFilterValue()
    return Array.isArray(filterValue) ? filterValue : []
  }

  // Toggle column sort
  function toggleSort(columnId: string) {
    const current = sorting.value.find(s => s.id === columnId)
    if (!current) {
      sorting.value = [{ id: columnId, desc: false }]
    } else if (!current.desc) {
      sorting.value = [{ id: columnId, desc: true }]
    } else {
      sorting.value = []
    }
  }

  // Get sort direction for column
  function getSortDirection(columnId: string): 'asc' | 'desc' | null {
    const sort = sorting.value.find(s => s.id === columnId)
    if (!sort) return null
    return sort.desc ? 'desc' : 'asc'
  }

  // Watch data changes to clear cache
  watch(data, () => {
    clearStatsCache()
  })

  return {
    // Table instance
    table,

    // State
    sorting,
    columnFilters,
    columnVisibility,
    globalFilter,
    columnKeys,

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


