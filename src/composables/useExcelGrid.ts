/**
 * Excel-like Grid Composable
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
import type { ColumnStats } from '../types'

export interface ExcelGridOptions<T> {
  data: Ref<T[]>
  columns?: string[]
  enableSorting?: boolean
  enableFiltering?: boolean
  pageSize?: number
}

/**
 * Detect column data type from values
 */
function detectColumnType(values: unknown[]): ColumnStats['type'] {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNullValues.length === 0)
    return 'string'

  const sample = nonNullValues.slice(0, 100)
  let numberCount = 0
  let dateCount = 0
  let booleanCount = 0

  for (const val of sample) {
    if (typeof val === 'boolean') {
      booleanCount++
    }
    else if (typeof val === 'number' || (!Number.isNaN(Number(val)) && val !== '')) {
      numberCount++
    }
    else if (val instanceof Date || !Number.isNaN(Date.parse(String(val)))) {
      dateCount++
    }
  }

  const threshold = sample.length * 0.8
  if (booleanCount >= threshold)
    return 'boolean'
  if (numberCount >= threshold)
    return 'number'
  if (dateCount >= threshold)
    return 'date'
  return 'string'
}

/**
 * Get unique values for a column (for Excel-style filter dropdown)
 */
export function getColumnUniqueValues<T>(data: T[], columnKey: string, maxValues = 500): ColumnStats {
  const values: unknown[] = []
  let nullCount = 0

  for (const row of data) {
    const value = (row as Record<string, unknown>)[columnKey]
    if (value === null || value === undefined || value === '') {
      nullCount++
    }
    else {
      values.push(value)
    }
  }

  // Get unique values
  const uniqueSet = new Set<string>()
  for (const val of values) {
    uniqueSet.add(String(val))
    if (uniqueSet.size >= maxValues)
      break
  }

  const uniqueValues = Array.from(uniqueSet).sort((a, b) => {
    // Natural sort for numbers
    const numA = Number.parseFloat(a)
    const numB = Number.parseFloat(b)
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })

  return {
    uniqueValues,
    totalCount: data.length,
    nullCount,
    type: detectColumnType(values),
  }
}

/**
 * Format cell value for display
 */
export function formatCellValue(value: unknown, type: ColumnStats['type']): string {
  if (value === null || value === undefined)
    return ''
  if (value === '')
    return ''

  switch (type) {
    case 'number': {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
      if (Number.isNaN(num))
        return String(value)
      // Format with commas for large numbers
      if (Math.abs(num) >= 1000) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
      }
      return num.toLocaleString('en-US', { maximumFractionDigits: 4 })
    }
    case 'date': {
      const date = value instanceof Date ? value : new Date(String(value))
      if (Number.isNaN(date.getTime()))
        return String(value)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    case 'boolean':
      return value ? 'Yes' : 'No'
    default:
      return String(value)
  }
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
    if (data.value.length === 0)
      return []
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
    return columnKeys.value.map((key) => {
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
    onSortingChange: (updater) => {
      sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
    },
    onColumnFiltersChange: (updater) => {
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
    if (!column)
      return false
    const filterValue = column.getFilterValue()
    return filterValue !== undefined && Array.isArray(filterValue) && filterValue.length > 0
  }

  // Set column filter
  function setColumnFilter(columnId: string, values: string[]) {
    const column = table.getColumn(columnId)
    if (column) {
      column.setFilterValue(values.length === 0 ? undefined : values)
    }
  }

  // Clear all filters
  function clearAllFilters() {
    table.resetColumnFilters()
    globalFilter.value = ''
  }

  // Get filter values for a specific column
  function getColumnFilterValues(columnId: string): string[] {
    const column = table.getColumn(columnId)
    if (!column)
      return []
    const filterValue = column.getFilterValue()
    return Array.isArray(filterValue) ? filterValue : []
  }

  // Toggle column sort
  function toggleSort(columnId: string) {
    const current = sorting.value.find(s => s.id === columnId)
    if (!current) {
      sorting.value = [{ id: columnId, desc: false }]
    }
    else if (!current.desc) {
      sorting.value = [{ id: columnId, desc: true }]
    }
    else {
      sorting.value = []
    }
  }

  // Get sort direction for column
  function getSortDirection(columnId: string): 'asc' | 'desc' | null {
    const sort = sorting.value.find(s => s.id === columnId)
    if (!sort)
      return null
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

