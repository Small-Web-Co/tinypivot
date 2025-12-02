/**
 * Grid Features Composable for Vue
 * Provides CSV export, clipboard, pagination, and other utility features
 */
import { computed, ref, type Ref } from 'vue'
import type { PaginationOptions, SelectionBounds, PivotValueField } from '@smallwebco/tinypivot-core'
import {
  exportToCSV as coreExportToCSV,
  exportPivotToCSV as coreExportPivotToCSV,
  copyToClipboard as coreCopyToClipboard,
  formatSelectionForClipboard as coreFormatSelection,
} from '@smallwebco/tinypivot-core'
import type { PivotExportData, ExportOptions } from '@smallwebco/tinypivot-core'

// Re-export core functions
export {
  exportToCSV,
  exportPivotToCSV,
  copyToClipboard,
  formatSelectionForClipboard,
}

/**
 * CSV Export functionality wrapper
 */
function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options?: ExportOptions
): void {
  coreExportToCSV(data, columns, options)
}

/**
 * Pivot CSV export wrapper
 */
function exportPivotToCSV(
  pivotData: PivotExportData,
  rowFields: string[],
  columnFields: string[],
  valueFields: PivotValueField[],
  options?: ExportOptions
): void {
  coreExportPivotToCSV(pivotData, rowFields, columnFields, valueFields, options)
}

/**
 * Copy to clipboard wrapper
 */
function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: Error) => void
): void {
  coreCopyToClipboard(text, onSuccess, onError)
}

/**
 * Format selection for clipboard wrapper
 */
function formatSelectionForClipboard<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
  selectionBounds: SelectionBounds
): string {
  return coreFormatSelection(rows, columns, selectionBounds)
}

/**
 * Pagination composable
 */
export function usePagination<T>(data: Ref<T[]>, options: PaginationOptions = {}) {
  const pageSize = ref(options.pageSize ?? 50)
  const currentPage = ref(options.currentPage ?? 1)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(data.value.length / pageSize.value))
  )

  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return data.value.slice(start, end)
  })

  const startIndex = computed(() => (currentPage.value - 1) * pageSize.value + 1)
  const endIndex = computed(() =>
    Math.min(currentPage.value * pageSize.value, data.value.length)
  )

  function goToPage(page: number) {
    currentPage.value = Math.max(1, Math.min(page, totalPages.value))
  }

  function nextPage() {
    if (currentPage.value < totalPages.value) {
      currentPage.value++
    }
  }

  function prevPage() {
    if (currentPage.value > 1) {
      currentPage.value--
    }
  }

  function firstPage() {
    currentPage.value = 1
  }

  function lastPage() {
    currentPage.value = totalPages.value
  }

  function setPageSize(size: number) {
    pageSize.value = size
    currentPage.value = 1
  }

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
    setPageSize,
  }
}

/**
 * Global search/filter composable
 */
export function useGlobalSearch<T extends Record<string, unknown>>(
  data: Ref<T[]>,
  columns: Ref<string[]>
) {
  const searchTerm = ref('')
  const caseSensitive = ref(false)

  const filteredData = computed(() => {
    if (!searchTerm.value.trim()) {
      return data.value
    }

    const term = caseSensitive.value
      ? searchTerm.value.trim()
      : searchTerm.value.trim().toLowerCase()

    return data.value.filter(row => {
      for (const col of columns.value) {
        const value = row[col]
        if (value === null || value === undefined) continue

        const strValue = caseSensitive.value ? String(value) : String(value).toLowerCase()

        if (strValue.includes(term)) {
          return true
        }
      }
      return false
    })
  })

  function clearSearch() {
    searchTerm.value = ''
  }

  return {
    searchTerm,
    caseSensitive,
    filteredData,
    clearSearch,
  }
}

/**
 * Row selection composable
 */
export function useRowSelection<T>(data: Ref<T[]>) {
  const selectedRowIndices = ref<Set<number>>(new Set())

  const selectedRows = computed(() => {
    return Array.from(selectedRowIndices.value)
      .sort((a, b) => a - b)
      .map(idx => data.value[idx])
      .filter(Boolean)
  })

  const allSelected = computed(() => {
    return data.value.length > 0 && selectedRowIndices.value.size === data.value.length
  })

  const someSelected = computed(() => {
    return selectedRowIndices.value.size > 0 && selectedRowIndices.value.size < data.value.length
  })

  function toggleRow(index: number) {
    if (selectedRowIndices.value.has(index)) {
      selectedRowIndices.value.delete(index)
    } else {
      selectedRowIndices.value.add(index)
    }
    selectedRowIndices.value = new Set(selectedRowIndices.value)
  }

  function selectRow(index: number) {
    selectedRowIndices.value.add(index)
    selectedRowIndices.value = new Set(selectedRowIndices.value)
  }

  function deselectRow(index: number) {
    selectedRowIndices.value.delete(index)
    selectedRowIndices.value = new Set(selectedRowIndices.value)
  }

  function selectAll() {
    selectedRowIndices.value = new Set(data.value.map((_, idx) => idx))
  }

  function deselectAll() {
    selectedRowIndices.value = new Set()
  }

  function toggleAll() {
    if (allSelected.value) {
      deselectAll()
    } else {
      selectAll()
    }
  }

  function isSelected(index: number): boolean {
    return selectedRowIndices.value.has(index)
  }

  function selectRange(startIndex: number, endIndex: number) {
    const min = Math.min(startIndex, endIndex)
    const max = Math.max(startIndex, endIndex)
    for (let i = min; i <= max; i++) {
      selectedRowIndices.value.add(i)
    }
    selectedRowIndices.value = new Set(selectedRowIndices.value)
  }

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
 * Column resizing composable
 */
export function useColumnResize(
  initialWidths: Ref<Record<string, number>>,
  minWidth = 60,
  maxWidth = 600
) {
  const columnWidths = ref<Record<string, number>>({ ...initialWidths.value })
  const isResizing = ref(false)
  const resizingColumn = ref<string | null>(null)

  function startResize(columnId: string, event: MouseEvent) {
    isResizing.value = true
    resizingColumn.value = columnId
    const startX = event.clientX
    const startWidth = columnWidths.value[columnId] || 150

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + diff))
      columnWidths.value = {
        ...columnWidths.value,
        [columnId]: newWidth,
      }
    }

    const handleMouseUp = () => {
      isResizing.value = false
      resizingColumn.value = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function resetColumnWidth(columnId: string) {
    if (initialWidths.value[columnId]) {
      columnWidths.value = {
        ...columnWidths.value,
        [columnId]: initialWidths.value[columnId],
      }
    }
  }

  function resetAllWidths() {
    columnWidths.value = { ...initialWidths.value }
  }

  return {
    columnWidths,
    isResizing,
    resizingColumn,
    startResize,
    resetColumnWidth,
    resetAllWidths,
  }
}

