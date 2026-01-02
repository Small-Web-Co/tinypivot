/**
 * Grid Features Composable
 * Provides CSV export, clipboard, pagination, and other utility features
 */
import { computed, ref, type Ref } from 'vue'

export interface PaginationOptions {
  pageSize?: number
  currentPage?: number
}

export interface ExportOptions {
  filename?: string
  includeHeaders?: boolean
  delimiter?: string
}

/**
 * CSV Export functionality
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options: ExportOptions = {},
): void {
  const {
    filename = 'export.csv',
    includeHeaders = true,
    delimiter = ',',
  } = options

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined)
      return ''
    const str = String(value)
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows: string[] = []

  if (includeHeaders) {
    rows.push(columns.map(escapeCSV).join(delimiter))
  }

  for (const row of data) {
    const values = columns.map(col => escapeCSV(row[col]))
    rows.push(values.join(delimiter))
  }

  const csvContent = rows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Pivot table export interface
 */
export interface PivotExportData {
  headers: string[][]
  rowHeaders: string[][]
  data: Array<Array<{ formattedValue: string }>>
  rowTotals?: Array<{ formattedValue: string }>
  columnTotals?: Array<{ formattedValue: string }>
  grandTotal?: { formattedValue: string }
  showRowTotals?: boolean
  showColumnTotals?: boolean
}

/**
 * Export pivot table to CSV
 */
export function exportPivotToCSV(
  pivotData: PivotExportData,
  rowFields: string[],
  _columnFields: string[],
  valueFields: Array<{ field: string, aggregation: string }>,
  options: ExportOptions = {},
): void {
  const {
    filename = 'pivot-export.csv',
    delimiter = ',',
  } = options

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined)
      return ''
    const str = String(value)
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const rows: string[] = []
  const { headers, rowHeaders, data, rowTotals, columnTotals, grandTotal, showRowTotals, showColumnTotals } = pivotData

  // Calculate number of row header columns
  const rowHeaderColCount = rowFields.length || 1

  // Build column headers
  if (headers.length > 0) {
    // Multi-level column headers
    for (let level = 0; level < headers.length; level++) {
      const headerRow: string[] = []
      // Empty cells for row field columns
      for (let i = 0; i < rowHeaderColCount; i++) {
        headerRow.push(level === headers.length - 1 ? escapeCSV(rowFields[i] || '') : '')
      }
      // Column header values
      for (const val of headers[level]) {
        headerRow.push(escapeCSV(val))
      }
      // Row totals header
      if (showRowTotals && rowTotals && rowTotals.length > 0) {
        if (level === headers.length - 1) {
          for (const vf of valueFields) {
            headerRow.push(escapeCSV(`Total (${vf.aggregation})`))
          }
        }
        else {
          for (let i = 0; i < valueFields.length; i++) {
            headerRow.push('')
          }
        }
      }
      rows.push(headerRow.join(delimiter))
    }
  }
  else {
    // Simple header with value fields only
    const headerRow: string[] = []
    for (let i = 0; i < rowHeaderColCount; i++) {
      headerRow.push(escapeCSV(rowFields[i] || ''))
    }
    for (const vf of valueFields) {
      headerRow.push(escapeCSV(`${vf.field} (${vf.aggregation})`))
    }
    if (showRowTotals && rowTotals && rowTotals.length > 0) {
      headerRow.push(escapeCSV('Total'))
    }
    rows.push(headerRow.join(delimiter))
  }

  // Build data rows
  for (let rowIdx = 0; rowIdx < rowHeaders.length; rowIdx++) {
    const csvRow: string[] = []

    // Row headers
    const rowHeader = rowHeaders[rowIdx] || []
    for (let i = 0; i < rowHeaderColCount; i++) {
      csvRow.push(escapeCSV(rowHeader[i] || ''))
    }

    // Data cells
    const rowData = data[rowIdx] || []
    for (const cell of rowData) {
      csvRow.push(escapeCSV(cell?.formattedValue || ''))
    }

    // Row total
    if (showRowTotals && rowTotals && rowTotals[rowIdx]) {
      csvRow.push(escapeCSV(rowTotals[rowIdx].formattedValue || ''))
    }

    rows.push(csvRow.join(delimiter))
  }

  // Column totals row
  if (showColumnTotals && columnTotals && columnTotals.length > 0) {
    const totalsRow: string[] = []
    // Label for totals row
    totalsRow.push(escapeCSV('Total'))
    for (let i = 1; i < rowHeaderColCount; i++) {
      totalsRow.push('')
    }
    // Column total values
    for (const cell of columnTotals) {
      totalsRow.push(escapeCSV(cell?.formattedValue || ''))
    }
    // Grand total
    if (showRowTotals && grandTotal) {
      totalsRow.push(escapeCSV(grandTotal.formattedValue || ''))
    }
    rows.push(totalsRow.join(delimiter))
  }

  const csvContent = rows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copy selection to clipboard
 */
export function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: Error) => void,
): void {
  navigator.clipboard.writeText(text).then(onSuccess).catch(onError)
}

/**
 * Format selected cells for clipboard
 */
export function formatSelectionForClipboard<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
  selectionBounds: { minRow: number, maxRow: number, minCol: number, maxCol: number },
): string {
  const { minRow, maxRow, minCol, maxCol } = selectionBounds
  const lines: string[] = []

  for (let r = minRow; r <= maxRow; r++) {
    const row = rows[r]
    if (!row)
      continue
    const values: string[] = []
    for (let c = minCol; c <= maxCol; c++) {
      const colId = columns[c]
      if (!colId)
        continue
      const value = row[colId]
      values.push(value === null || value === undefined ? '' : String(value))
    }
    lines.push(values.join('\t'))
  }

  return lines.join('\n')
}

/**
 * Pagination composable
 */
export function usePagination<T>(
  data: Ref<T[]>,
  options: PaginationOptions = {},
) {
  const pageSize = ref(options.pageSize ?? 50)
  const currentPage = ref(options.currentPage ?? 1)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(data.value.length / pageSize.value)),
  )

  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return data.value.slice(start, end)
  })

  const startIndex = computed(() => (currentPage.value - 1) * pageSize.value + 1)
  const endIndex = computed(() =>
    Math.min(currentPage.value * pageSize.value, data.value.length),
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
  columns: Ref<string[]>,
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

    return data.value.filter((row) => {
      for (const col of columns.value) {
        const value = row[col]
        if (value === null || value === undefined)
          continue

        const strValue = caseSensitive.value
          ? String(value)
          : String(value).toLowerCase()

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
    }
    else {
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
    }
    else {
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
  maxWidth = 600,
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
