<script setup lang="ts">
/**
 * TinyPivot - Main DataGrid Component
 * Excel-like data grid with optional pivot table functionality
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useExcelGrid } from '../composables/useExcelGrid'
import { usePivotTable } from '../composables/usePivotTable'
import { useLicense } from '../composables/useLicense'
import {
  exportToCSV,
  exportPivotToCSV,
  copyToClipboard,
  formatSelectionForClipboard,
} from '../composables/useGridFeatures'
import ColumnFilter from './ColumnFilter.vue'
import PivotConfig from './PivotConfig.vue'
import PivotSkeleton from './PivotSkeleton.vue'

const props = withDefaults(defineProps<{
  data: Record<string, unknown>[]
  loading?: boolean
  rowHeight?: number
  headerHeight?: number
  fontSize?: 'xs' | 'sm' | 'base'
  showPivot?: boolean
  // Feature props
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
}>(), {
  loading: false,
  rowHeight: 36,
  headerHeight: 40,
  fontSize: 'xs',
  showPivot: true,
  // Feature defaults
  enableExport: true,
  enableSearch: true,
  enablePagination: false,
  pageSize: 50,
  enableColumnResize: true,
  enableClipboard: true,
  theme: 'light',
  stripedRows: true,
  exportFilename: 'data-export.csv',
  enableVerticalResize: true,
  initialHeight: 600,
  minHeight: 300,
  maxHeight: 1200,
})

const emit = defineEmits<{
  (e: 'cellClick', payload: { row: number, col: number, value: unknown, rowData: Record<string, unknown> }): void
  (e: 'selectionChange', payload: { cells: Array<{ row: number, col: number }>, values: unknown[] }): void
  (e: 'export', payload: { rowCount: number, filename: string }): void
  (e: 'copy', payload: { text: string, cellCount: number }): void
}>()

const { showWatermark, canUsePivot, isDemo, isPro } = useLicense()

// Theme handling
const currentTheme = computed(() => {
  if (props.theme === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return props.theme
})

// Font size state
const currentFontSize = ref(props.fontSize)

// Global search state
const globalSearchTerm = ref('')
const showSearchInput = ref(false)

// Pagination state
const currentPage = ref(1)

// Column resize state
const resizingColumnId = ref<string | null>(null)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)

// Vertical resize state
const gridHeight = ref(props.initialHeight)
const isResizingVertically = ref(false)
const verticalResizeStartY = ref(0)
const verticalResizeStartHeight = ref(0)

// Clipboard toast state
const showCopyToast = ref(false)
const copyToastMessage = ref('')
const fontSizeOptions = [
  { value: 'xs', label: 'S' },
  { value: 'sm', label: 'M' },
  { value: 'base', label: 'L' },
] as const

// Grid composable
const dataRef = computed(() => props.data)
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
} = useExcelGrid({ data: dataRef })

// Filtered data for pivot table (respects column filters)
const filteredDataForPivot = computed(() => {
  const filteredRows = table.getFilteredRowModel().rows
  return filteredRows.map(row => row.original)
})

// Active filters info for display - use activeFilters from useExcelGrid
const activeFilterInfo = computed(() => {
  if (activeFilters.value.length === 0) return null
  return activeFilters.value.map(f => ({
    column: f.column,
    valueCount: f.values?.length || 0,
    values: f.values || [],
  }))
})

// Pivot table composable - uses filtered data
const {
  rowFields: pivotRowFields,
  columnFields: pivotColumnFields,
  valueFields: pivotValueFields,
  showRowTotals: pivotShowRowTotals,
  showColumnTotals: pivotShowColumnTotals,
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
} = usePivotTable(filteredDataForPivot)

// Filtered data based on global search
const searchFilteredData = computed(() => {
  if (!globalSearchTerm.value.trim() || !props.enableSearch) {
    return rows.value
  }
  const term = globalSearchTerm.value.toLowerCase().trim()
  return rows.value.filter((row) => {
    for (const col of columnKeys.value) {
      const value = row.original[col]
      if (value === null || value === undefined) continue
      if (String(value).toLowerCase().includes(term)) {
        return true
      }
    }
    return false
  })
})

// Paginated rows
const totalSearchedRows = computed(() => searchFilteredData.value.length)
const totalPages = computed(() => {
  if (!props.enablePagination) return 1
  return Math.max(1, Math.ceil(totalSearchedRows.value / props.pageSize))
})

const paginatedRows = computed(() => {
  if (!props.enablePagination) return searchFilteredData.value
  const start = (currentPage.value - 1) * props.pageSize
  const end = start + props.pageSize
  return searchFilteredData.value.slice(start, end)
})

const paginationStart = computed(() => {
  if (totalSearchedRows.value === 0) return 0
  return (currentPage.value - 1) * props.pageSize + 1
})

const paginationEnd = computed(() =>
  Math.min(currentPage.value * props.pageSize, totalSearchedRows.value),
)

// Pagination methods
function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}

// Export functionality
function handleExport() {
  if (viewMode.value === 'pivot') {
    handlePivotExport()
    return
  }

  const dataToExport = props.enableSearch && globalSearchTerm.value.trim()
    ? searchFilteredData.value.map(row => row.original)
    : rows.value.map(row => row.original)
  
  exportToCSV(dataToExport, columnKeys.value, {
    filename: props.exportFilename,
    includeHeaders: true,
  })
  
  emit('export', { rowCount: dataToExport.length, filename: props.exportFilename })
}

function handlePivotExport() {
  if (!pivotResult.value) return

  const pivotFilename = props.exportFilename.replace('.csv', '-pivot.csv')
  
  exportPivotToCSV(
    {
      headers: pivotResult.value.headers,
      rowHeaders: pivotResult.value.rowHeaders,
      data: pivotResult.value.data,
      rowTotals: pivotResult.value.rowTotals,
      columnTotals: pivotResult.value.columnTotals,
      grandTotal: pivotResult.value.grandTotal,
      showRowTotals: pivotShowRowTotals.value,
      showColumnTotals: pivotShowColumnTotals.value,
    },
    pivotRowFields.value,
    pivotColumnFields.value,
    pivotValueFields.value,
    { filename: pivotFilename },
  )

  const rowCount = pivotResult.value.rowHeaders.length
  emit('export', { rowCount, filename: pivotFilename })
}

// Column resize methods
function startColumnResize(columnId: string, event: MouseEvent) {
  if (!props.enableColumnResize) return
  event.preventDefault()
  event.stopPropagation()
  
  resizingColumnId.value = columnId
  resizeStartX.value = event.clientX
  resizeStartWidth.value = columnWidths.value[columnId] || MIN_COL_WIDTH
  
  document.addEventListener('mousemove', handleResizeMove)
  document.addEventListener('mouseup', handleResizeEnd)
}

function handleResizeMove(event: MouseEvent) {
  if (!resizingColumnId.value) return
  const diff = event.clientX - resizeStartX.value
  const newWidth = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, resizeStartWidth.value + diff))
  columnWidths.value = {
    ...columnWidths.value,
    [resizingColumnId.value]: newWidth,
  }
}

function handleResizeEnd() {
  resizingColumnId.value = null
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', handleResizeEnd)
}

// Vertical resize methods
function startVerticalResize(event: MouseEvent) {
  if (!props.enableVerticalResize) return
  event.preventDefault()
  
  isResizingVertically.value = true
  verticalResizeStartY.value = event.clientY
  verticalResizeStartHeight.value = gridHeight.value
  
  document.addEventListener('mousemove', handleVerticalResizeMove)
  document.addEventListener('mouseup', handleVerticalResizeEnd)
}

function handleVerticalResizeMove(event: MouseEvent) {
  if (!isResizingVertically.value) return
  const diff = event.clientY - verticalResizeStartY.value
  const newHeight = Math.max(
    props.minHeight,
    Math.min(props.maxHeight, verticalResizeStartHeight.value + diff),
  )
  gridHeight.value = newHeight
}

function handleVerticalResizeEnd() {
  isResizingVertically.value = false
  document.removeEventListener('mousemove', handleVerticalResizeMove)
  document.removeEventListener('mouseup', handleVerticalResizeEnd)
}

// Clipboard methods
function copySelectionToClipboard() {
  if (!selectionBounds.value || !props.enableClipboard) return
  
  const text = formatSelectionForClipboard(
    rows.value.map(r => r.original),
    columnKeys.value,
    selectionBounds.value,
  )
  
  copyToClipboard(
    text,
    () => {
      const cellCount = 
        (selectionBounds.value!.maxRow - selectionBounds.value!.minRow + 1) *
        (selectionBounds.value!.maxCol - selectionBounds.value!.minCol + 1)
      copyToastMessage.value = `Copied ${cellCount} cell${cellCount > 1 ? 's' : ''}`
      showCopyToast.value = true
      setTimeout(() => { showCopyToast.value = false }, 2000)
      emit('copy', { text, cellCount })
    },
    (err) => {
      copyToastMessage.value = 'Copy failed'
      showCopyToast.value = true
      setTimeout(() => { showCopyToast.value = false }, 2000)
      console.error('Copy failed:', err)
    },
  )
}

// View mode
const viewMode = ref<'grid' | 'pivot'>('grid')
const showPivotConfig = ref(true)
const draggingField = ref<string | null>(null)

function handlePivotDragStart(field: string) {
  draggingField.value = field
}

function handlePivotDragEnd() {
  draggingField.value = null
}

function reorderRowFields(fields: string[]) {
  pivotRowFields.value = fields
}

function reorderColumnFields(fields: string[]) {
  pivotColumnFields.value = fields
}

// Container refs
const tableContainerRef = ref<HTMLDivElement>()
const tableBodyRef = ref<HTMLDivElement>()

// Rows
const rows = computed(() => table.getRowModel().rows)

// Column filter dropdown state
const activeFilterColumn = ref<string | null>(null)
const filterDropdownPosition = ref({ top: 0, left: 0, maxHeight: 400 })

// Column widths
const columnWidths = ref<Record<string, number>>({})
const MIN_COL_WIDTH = 120
const MAX_COL_WIDTH = 350

function calculateColumnWidths() {
  if (props.data.length === 0)
    return

  const widths: Record<string, number> = {}
  const sampleSize = Math.min(100, props.data.length)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  ctx.font = '13px system-ui, -apple-system, sans-serif'

  for (const key of columnKeys.value) {
    let maxWidth = ctx.measureText(key).width + 56

    for (let i = 0; i < sampleSize; i++) {
      const value = props.data[i][key]
      const text = value === null || value === undefined ? '' : String(value)
      const width = ctx.measureText(text).width + 28
      maxWidth = Math.max(maxWidth, width)
    }

    widths[key] = Math.min(Math.max(maxWidth, MIN_COL_WIDTH), MAX_COL_WIDTH)
  }

  columnWidths.value = widths
}

function openFilterDropdown(columnId: string, event: MouseEvent) {
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
  let maxHeight: number

  if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
    top = rect.bottom + 4
    maxHeight = Math.min(400, spaceBelow - 4)
  }
  else {
    maxHeight = Math.min(400, spaceAbove - 4)
    top = rect.top - maxHeight - 4
  }

  filterDropdownPosition.value = { top, left, maxHeight }
  activeFilterColumn.value = columnId
}

function closeFilterDropdown() {
  activeFilterColumn.value = null
}

function handleFilter(columnId: string, values: string[]) {
  setColumnFilter(columnId, values)
}

function handleSort(columnId: string, direction: 'asc' | 'desc' | null) {
  if (direction === null) {
    const current = getSortDirection(columnId)
    if (current) {
      toggleSort(columnId)
      if (getSortDirection(columnId)) {
        toggleSort(columnId)
      }
    }
  }
  else {
    const current = getSortDirection(columnId)
    if (current === null) {
      toggleSort(columnId)
      if (direction === 'desc' && getSortDirection(columnId) === 'asc') {
        toggleSort(columnId)
      }
    }
    else if (current !== direction) {
      toggleSort(columnId)
    }
  }
}

const activeFilterCount = computed(() => columnFilters.value.length)

// Selection state
const selectedCell = ref<{ row: number, col: number } | null>(null)
const selectionStart = ref<{ row: number, col: number } | null>(null)
const selectionEnd = ref<{ row: number, col: number } | null>(null)
const isSelecting = ref(false)

function selectColumn(colIndex: number) {
  const maxRow = rows.value.length - 1
  if (maxRow < 0)
    return

  selectionStart.value = { row: 0, col: colIndex }
  selectionEnd.value = { row: maxRow, col: colIndex }
  selectedCell.value = { row: 0, col: colIndex }
}

function handleHeaderClick(colIndex: number, event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.vpg-dropdown-arrow')) {
    const colId = columnKeys.value[colIndex]
    openFilterDropdown(colId, event)
  }
  else {
    selectColumn(colIndex)
  }
}

const selectionBounds = computed(() => {
  if (!selectionStart.value || !selectionEnd.value)
    return null
  return {
    minRow: Math.min(selectionStart.value.row, selectionEnd.value.row),
    maxRow: Math.max(selectionStart.value.row, selectionEnd.value.row),
    minCol: Math.min(selectionStart.value.col, selectionEnd.value.col),
    maxCol: Math.max(selectionStart.value.col, selectionEnd.value.col),
  }
})

function isCellInSelection(rowIndex: number, colIndex: number): boolean {
  if (!selectionBounds.value)
    return false
  const { minRow, maxRow, minCol, maxCol } = selectionBounds.value
  return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol
}

const selectionStats = computed(() => {
  if (!selectionBounds.value)
    return null
  const { minRow, maxRow, minCol, maxCol } = selectionBounds.value

  const values: number[] = []
  let count = 0

  for (let r = minRow; r <= maxRow; r++) {
    const row = rows.value[r]
    if (!row)
      continue

    for (let c = minCol; c <= maxCol; c++) {
      const colId = columnKeys.value[c]
      if (!colId)
        continue

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

  if (values.length === 0)
    return { count, sum: null, avg: null, numericCount: 0 }

  const sum = values.reduce((a, b) => a + b, 0)
  const avg = sum / values.length

  return { count, sum, avg, numericCount: values.length }
})

function formatStatValue(value: number | null): string {
  if (value === null)
    return '-'
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function handleKeydown(event: KeyboardEvent) {
  // Handle Ctrl+C / Cmd+C for clipboard
  if ((event.ctrlKey || event.metaKey) && event.key === 'c' && selectionBounds.value) {
    event.preventDefault()
    copySelectionToClipboard()
    return
  }

  // Handle Ctrl+F / Cmd+F for search
  if ((event.ctrlKey || event.metaKey) && event.key === 'f' && props.enableSearch) {
    event.preventDefault()
    showSearchInput.value = true
    nextTick(() => {
      const input = document.querySelector('.vpg-search-input') as HTMLInputElement
      input?.focus()
    })
    return
  }

  if (!selectedCell.value)
    return
  if (activeFilterColumn.value)
    return

  const { row, col } = selectedCell.value
  const displayRows = paginatedRows.value
  const maxRow = displayRows.length - 1
  const maxCol = columnKeys.value.length - 1

  function updateSelection(newRow: number, newCol: number) {
    if (event.shiftKey) {
      if (!selectionStart.value) {
        selectionStart.value = { row, col }
      }
      selectionEnd.value = { row: newRow, col: newCol }
    }
    else {
      selectionStart.value = { row: newRow, col: newCol }
      selectionEnd.value = { row: newRow, col: newCol }
    }
    selectedCell.value = { row: newRow, col: newCol }
    scrollCellIntoView(newRow, newCol)
  }

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      if (row > 0)
        updateSelection(row - 1, col)
      break
    case 'ArrowDown':
      event.preventDefault()
      if (row < maxRow)
        updateSelection(row + 1, col)
      break
    case 'ArrowLeft':
      event.preventDefault()
      if (col > 0)
        updateSelection(row, col - 1)
      break
    case 'ArrowRight':
      event.preventDefault()
      if (col < maxCol)
        updateSelection(row, col + 1)
      break
    case 'Escape':
      selectedCell.value = null
      selectionStart.value = null
      selectionEnd.value = null
      showSearchInput.value = false
      globalSearchTerm.value = ''
      break
  }
}

function scrollCellIntoView(rowIndex: number, colIndex: number) {
  nextTick(() => {
    const cell = tableBodyRef.value?.querySelector(
      `[data-row="${rowIndex}"][data-col="${colIndex}"]`,
    )
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

function handleMouseDown(rowIndex: number, colIndex: number, event: MouseEvent) {
  event.preventDefault()

  if (event.shiftKey && selectedCell.value) {
    selectionEnd.value = { row: rowIndex, col: colIndex }
  }
  else {
    selectedCell.value = { row: rowIndex, col: colIndex }
    selectionStart.value = { row: rowIndex, col: colIndex }
    selectionEnd.value = { row: rowIndex, col: colIndex }
    isSelecting.value = true
  }

  // Emit event
  const row = rows.value[rowIndex]
  if (row) {
    const colId = columnKeys.value[colIndex]
    emit('cellClick', {
      row: rowIndex,
      col: colIndex,
      value: row.original[colId],
      rowData: row.original,
    })
  }
}

function handleMouseEnter(rowIndex: number, colIndex: number) {
  if (isSelecting.value) {
    selectionEnd.value = { row: rowIndex, col: colIndex }
  }
}

function handleMouseUp() {
  isSelecting.value = false
}

function isCellSelected(rowIndex: number, colIndex: number): boolean {
  if (isCellInSelection(rowIndex, colIndex))
    return true
  return selectedCell.value?.row === rowIndex && selectedCell.value?.col === colIndex
}

// Format cell value
const noFormatPatterns = /^(?:.*_)?(?:id|code|year|month|quarter|day|week|date|zip|phone|fax|ssn|ein|npi|ndc|gpi|hcpcs|icd|cpt|rx|bin|pcn|group|member|claim|rx_number|script|fill)(?:_.*)?$/i

function shouldFormatNumber(columnId: string): boolean {
  return !noFormatPatterns.test(columnId)
}

function formatCellValue(value: unknown, columnId: string): string {
  if (value === null || value === undefined)
    return ''
  if (value === '')
    return ''

  const stats = getColumnStats(columnId)
  if (stats.type === 'number') {
    const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
    if (Number.isNaN(num))
      return String(value)

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

function handleTableScroll() {
  if (activeFilterColumn.value) {
    closeFilterDropdown()
  }
}

function handleWindowScroll(event: Event) {
  if (activeFilterColumn.value) {
    const target = event.target as HTMLElement
    if (target && target.closest?.('.vpg-filter-portal')) {
      return
    }
    closeFilterDropdown()
  }
}

// Initialize
onMounted(() => {
  calculateColumnWidths()
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('mouseup', handleMouseUp)

  nextTick(() => {
    tableContainerRef.value?.addEventListener('scroll', handleTableScroll, { passive: true })
  })

  window.addEventListener('scroll', handleWindowScroll, { passive: true, capture: true })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mouseup', handleMouseUp)
  tableContainerRef.value?.removeEventListener('scroll', handleTableScroll)
  window.removeEventListener('scroll', handleWindowScroll, { capture: true })
})

watch(() => props.data, () => {
  nextTick(calculateColumnWidths)
}, { immediate: true })

const totalTableWidth = computed(() => {
  return columnKeys.value.reduce((sum, key) => sum + (columnWidths.value[key] || MIN_COL_WIDTH), 0)
})

function handleContainerClick(event: MouseEvent) {
  if (activeFilterColumn.value) {
    const target = event.target as HTMLElement
    if (!target.closest('.vpg-filter-portal')) {
      closeFilterDropdown()
    }
  }
}
</script>

<template>
  <div
    class="vpg-data-grid"
    :class="[
      `vpg-font-${currentFontSize}`,
      `vpg-theme-${currentTheme}`,
      { 'vpg-striped': stripedRows },
      { 'vpg-resizing': resizingColumnId },
      { 'vpg-resizing-vertical': isResizingVertically },
    ]"
    :style="{ height: `${gridHeight}px` }"
    @click="handleContainerClick"
  >
    <!-- Copy Toast -->
    <Transition name="vpg-toast">
      <div v-if="showCopyToast" class="vpg-toast">
        <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        {{ copyToastMessage }}
      </div>
    </Transition>

    <!-- Toolbar -->
    <div class="vpg-toolbar">
      <div class="vpg-toolbar-left">
        <!-- View mode toggle -->
        <div v-if="showPivot" class="vpg-view-toggle">
          <button
            class="vpg-view-btn"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
          >
            <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Grid
          </button>
          <button
            class="vpg-view-btn vpg-pivot-btn"
            :class="{ active: viewMode === 'pivot' }"
            @click="viewMode = 'pivot'"
          >
            <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            Pivot
          </button>
        </div>

        <!-- Grid mode controls -->
        <template v-if="viewMode === 'grid'">
          <!-- Search input -->
          <div v-if="enableSearch" class="vpg-search-container">
            <button
              v-if="!showSearchInput"
              class="vpg-icon-btn"
              title="Search (Ctrl+F)"
              @click="showSearchInput = true"
            >
              <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <div v-else class="vpg-search-box">
              <svg class="vpg-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                v-model="globalSearchTerm"
                type="text"
                class="vpg-search-input"
                placeholder="Search all columns..."
                @keydown.escape="showSearchInput = false; globalSearchTerm = ''"
              >
              <button
                v-if="globalSearchTerm"
                class="vpg-search-clear"
                @click="globalSearchTerm = ''"
              >
                <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div class="vpg-font-size-control">
            <span class="vpg-label">Size:</span>
            <div class="vpg-font-size-toggle">
              <button
                v-for="opt in fontSizeOptions"
                :key="opt.value"
                class="vpg-font-size-btn"
                :class="{ active: currentFontSize === opt.value }"
                @click="currentFontSize = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div v-if="activeFilterCount > 0" class="vpg-filter-info">
            <svg class="vpg-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd" />
            </svg>
            <span>{{ activeFilterCount }} filter{{ activeFilterCount > 1 ? 's' : '' }}</span>
          </div>

          <div v-if="globalSearchTerm" class="vpg-search-info">
            <span>{{ totalSearchedRows }} match{{ totalSearchedRows !== 1 ? 'es' : '' }}</span>
          </div>
        </template>

        <!-- Pivot mode controls -->
        <template v-if="viewMode === 'pivot' && canUsePivot">
          <button
            class="vpg-config-toggle"
            :class="{ active: showPivotConfig }"
            @click="showPivotConfig = !showPivotConfig"
          >
            <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            {{ showPivotConfig ? 'Hide' : 'Show' }} Config
          </button>

          <div v-if="pivotIsConfigured" class="vpg-pivot-status">
            <svg class="vpg-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span>Pivot configured</span>
          </div>
        </template>
      </div>

      <div class="vpg-toolbar-right">
        <button v-if="viewMode === 'grid' && activeFilterCount > 0" class="vpg-clear-filters" @click="clearAllFilters">
          <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear Filters
        </button>

        <!-- Copy button -->
        <button
          v-if="enableClipboard && selectionBounds && viewMode === 'grid'"
          class="vpg-icon-btn"
          title="Copy selection (Ctrl+C)"
          @click="copySelectionToClipboard"
        >
          <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>

        <!-- Export button - Grid export is free, Pivot export requires Pro -->
        <button
          v-if="enableExport && viewMode === 'grid'"
          class="vpg-export-btn"
          title="Export to CSV"
          @click="handleExport"
        >
          <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
        <button
          v-if="enableExport && viewMode === 'pivot' && pivotIsConfigured"
          class="vpg-export-btn"
          :class="{ 'vpg-export-btn-disabled': !isPro }"
          :disabled="!isPro"
          :title="isPro ? 'Export Pivot to CSV' : 'Export Pivot to CSV (Pro feature)'"
          @click="isPro && handleExport()"
        >
          <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Pivot{{ !isPro ? ' (Pro)' : '' }}
        </button>
      </div>
    </div>

    <!-- Grid View -->
    <template v-if="viewMode === 'grid'">
      <div ref="tableContainerRef" class="vpg-grid-container" tabindex="0">
        <div v-if="loading" class="vpg-loading">
          <div class="vpg-spinner" />
          <span>Loading data...</span>
        </div>

        <div v-else-if="data.length === 0" class="vpg-empty">
          <div class="vpg-empty-icon">
            <svg class="vpg-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span>No data available</span>
        </div>

        <div v-else-if="filteredRowCount === 0" class="vpg-empty">
          <div class="vpg-empty-icon vpg-warning">
            <svg class="vpg-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <span>No matching records</span>
          <button class="vpg-clear-link" @click="clearAllFilters">
            Clear all filters
          </button>
        </div>

        <div v-else class="vpg-table-wrapper">
          <table class="vpg-table" :style="{ minWidth: `${totalTableWidth}px` }">
            <thead>
              <tr>
                <th
                  v-for="(colId, colIndex) in columnKeys"
                  :key="colId"
                  class="vpg-header-cell"
                  :class="{
                    'vpg-has-filter': hasActiveFilter(colId),
                    'vpg-is-sorted': getSortDirection(colId) !== null,
                    'vpg-is-active': activeFilterColumn === colId,
                  }"
                  :style="{ width: `${columnWidths[colId] || MIN_COL_WIDTH}px`, minWidth: `${columnWidths[colId] || MIN_COL_WIDTH}px` }"
                  @click="handleHeaderClick(colIndex, $event)"
                >
                  <div class="vpg-header-content">
                    <span class="vpg-header-text">{{ colId }}</span>
                    <div class="vpg-header-icons">
                      <span v-if="getSortDirection(colId)" class="vpg-sort-indicator">
                        <svg v-if="getSortDirection(colId) === 'asc'" class="vpg-icon-sm" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />
                        </svg>
                        <svg v-else class="vpg-icon-sm" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <span v-if="hasActiveFilter(colId)" class="vpg-filter-indicator">
                        <svg class="vpg-icon-xs" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd" />
                        </svg>
                      </span>
                      <span class="vpg-dropdown-arrow" title="Filter & Sort">
                        <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  <!-- Column resize handle -->
                  <div
                    v-if="enableColumnResize"
                    class="vpg-resize-handle"
                    @mousedown="startColumnResize(colId, $event)"
                  />
                </th>
              </tr>
            </thead>

            <tbody ref="tableBodyRef">
              <tr
                v-for="(row, rowIndex) in paginatedRows"
                :key="row.id"
                class="vpg-row"
              >
                <td
                  v-for="(colId, colIndex) in columnKeys"
                  :key="colId"
                  class="vpg-cell"
                  :class="{
                    'vpg-selected': isCellSelected(rowIndex, colIndex),
                    'vpg-is-number': getColumnStats(colId).type === 'number',
                  }"
                  :data-row="rowIndex"
                  :data-col="colIndex"
                  :style="{ width: `${columnWidths[colId] || MIN_COL_WIDTH}px`, minWidth: `${columnWidths[colId] || MIN_COL_WIDTH}px` }"
                  @mousedown="handleMouseDown(rowIndex, colIndex, $event)"
                  @mouseenter="handleMouseEnter(rowIndex, colIndex)"
                >
                  {{ formatCellValue(row.original[colId], colId) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Pivot View -->
    <template v-else>
      <div class="vpg-pivot-container">
        <div v-if="showPivotConfig && canUsePivot" class="vpg-pivot-config-panel">
          <PivotConfig
            :available-fields="pivotAvailableFields"
            :row-fields="pivotRowFields"
            :column-fields="pivotColumnFields"
            :value-fields="pivotValueFields"
            :show-row-totals="pivotShowRowTotals"
            :show-column-totals="pivotShowColumnTotals"
            @update:show-row-totals="pivotShowRowTotals = $event"
            @update:show-column-totals="pivotShowColumnTotals = $event"
            @clear-config="clearPivotConfig"
            @auto-suggest="autoSuggestConfig"
            @drag-start="handlePivotDragStart"
            @drag-end="handlePivotDragEnd"
            @update-aggregation="updateValueFieldAggregation"
            @add-row-field="addRowField"
            @remove-row-field="removeRowField"
            @add-column-field="addColumnField"
            @remove-column-field="removeColumnField"
            @add-value-field="addValueField"
            @remove-value-field="removeValueField"
          />
        </div>

        <div class="vpg-pivot-main" :class="{ 'vpg-full-width': !showPivotConfig }">
          <PivotSkeleton
            :row-fields="pivotRowFields"
            :column-fields="pivotColumnFields"
            :value-fields="pivotValueFields"
            :is-configured="pivotIsConfigured"
            :dragging-field="draggingField"
            :pivot-result="pivotResult"
            :font-size="currentFontSize"
            :active-filters="activeFilterInfo"
            :total-row-count="totalRowCount"
            :filtered-row-count="filteredRowCount"
            @add-row-field="addRowField"
            @remove-row-field="removeRowField"
            @add-column-field="addColumnField"
            @remove-column-field="removeColumnField"
            @add-value-field="addValueField"
            @remove-value-field="removeValueField"
            @update-aggregation="updateValueFieldAggregation"
            @reorder-row-fields="reorderRowFields"
            @reorder-column-fields="reorderColumnFields"
          />
        </div>
      </div>
    </template>

    <!-- Footer -->
    <div class="vpg-footer">
      <div class="vpg-footer-left">
        <template v-if="viewMode === 'grid'">
          <template v-if="enablePagination">
            <span>{{ paginationStart.toLocaleString() }}-{{ paginationEnd.toLocaleString() }}</span>
            <span class="vpg-separator">of</span>
            <span>{{ totalSearchedRows.toLocaleString() }}</span>
            <span v-if="totalSearchedRows !== totalRowCount" class="vpg-filtered-note">
              ({{ totalRowCount.toLocaleString() }} total)
            </span>
          </template>
          <template v-else-if="filteredRowCount === totalRowCount && totalSearchedRows === totalRowCount">
            <span>{{ totalRowCount.toLocaleString() }} records</span>
          </template>
          <template v-else>
            <span class="vpg-filtered-count">{{ totalSearchedRows.toLocaleString() }}</span>
            <span class="vpg-separator">of</span>
            <span>{{ totalRowCount.toLocaleString() }}</span>
            <span class="vpg-separator">records</span>
          </template>
        </template>
        <template v-else>
          <span class="vpg-pivot-label">Pivot Table</span>
          <span class="vpg-separator">•</span>
          <span>{{ totalRowCount.toLocaleString() }} source records</span>
        </template>
      </div>

      <!-- Pagination controls -->
      <div v-if="enablePagination && viewMode === 'grid' && totalPages > 1" class="vpg-pagination">
        <button
          class="vpg-page-btn"
          :disabled="currentPage === 1"
          @click="currentPage = 1"
        >
          <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          class="vpg-page-btn"
          :disabled="currentPage === 1"
          @click="prevPage"
        >
          <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="vpg-page-info">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <button
          class="vpg-page-btn"
          :disabled="currentPage === totalPages"
          @click="nextPage"
        >
          <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          class="vpg-page-btn"
          :disabled="currentPage === totalPages"
          @click="currentPage = totalPages"
        >
          <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div v-if="viewMode === 'grid' && selectionStats && selectionStats.count > 1" class="vpg-selection-stats">
        <span class="vpg-stat">
          <span class="vpg-stat-label">Count:</span>
          <span class="vpg-stat-value">{{ selectionStats.count }}</span>
        </span>
        <template v-if="selectionStats.numericCount > 0">
          <span class="vpg-stat-divider">|</span>
          <span class="vpg-stat">
            <span class="vpg-stat-label">Sum:</span>
            <span class="vpg-stat-value">{{ formatStatValue(selectionStats.sum) }}</span>
          </span>
          <span class="vpg-stat-divider">|</span>
          <span class="vpg-stat">
            <span class="vpg-stat-label">Avg:</span>
            <span class="vpg-stat-value">{{ formatStatValue(selectionStats.avg) }}</span>
          </span>
        </template>
      </div>

      <div class="vpg-footer-right">
        <div v-if="isDemo" class="vpg-demo-banner">
          <span class="vpg-demo-badge">DEMO</span>
          <span>Pro features enabled</span>
          <a href="https://tiny-pivot.com/#pricing" target="_blank" rel="noopener">Get License →</a>
        </div>
        <span v-else-if="showWatermark" class="vpg-watermark-inline">
          <a href="https://tiny-pivot.com" target="_blank" rel="noopener">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Powered by TinyPivot
          </a>
        </span>
      </div>
    </div>

    <!-- Vertical Resize Handle -->
    <div
      v-if="enableVerticalResize"
      class="vpg-vertical-resize-handle"
      @mousedown="startVerticalResize"
    >
      <div class="vpg-resize-grip">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>

    <!-- Filter Dropdown Portal -->
    <Teleport to="body">
      <div
        v-if="activeFilterColumn"
        class="vpg-filter-portal"
        :style="{
          position: 'fixed',
          top: `${filterDropdownPosition.top}px`,
          left: `${filterDropdownPosition.left}px`,
          maxHeight: `${filterDropdownPosition.maxHeight}px`,
          zIndex: 9999,
        }"
      >
        <ColumnFilter
          :column-id="activeFilterColumn"
          :column-name="activeFilterColumn"
          :stats="getColumnStats(activeFilterColumn)"
          :selected-values="getColumnFilterValues(activeFilterColumn)"
          :sort-direction="getSortDirection(activeFilterColumn)"
          @filter="(values) => handleFilter(activeFilterColumn!, values)"
          @sort="(dir) => handleSort(activeFilterColumn!, dir)"
          @close="closeFilterDropdown"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.vpg-data-grid {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  margin-bottom: 1.5rem;
  position: relative;
}

.vpg-icon {
  width: 1rem;
  height: 1rem;
}

.vpg-icon-sm {
  width: 0.875rem;
  height: 0.875rem;
}

.vpg-icon-xs {
  width: 0.75rem;
  height: 0.75rem;
}

.vpg-icon-lg {
  width: 3rem;
  height: 3rem;
}

/* Toolbar */
.vpg-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.vpg-toolbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.vpg-toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.vpg-view-toggle {
  display: flex;
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-view-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-view-btn:hover {
  background: #f8fafc;
}

.vpg-view-btn.active {
  background: #4f46e5;
  color: white;
  box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.1);
}

.vpg-view-btn.vpg-pivot-btn.active {
  background: #10b981;
}

.vpg-font-size-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.vpg-label {
  font-size: 0.75rem;
  color: #64748b;
}

.vpg-font-size-toggle {
  display: flex;
  background: white;
  border-radius: 0.25rem;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.vpg-font-size-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-font-size-btn:hover {
  background: #f1f5f9;
}

.vpg-font-size-btn.active {
  background: #4f46e5;
  color: white;
}

.vpg-filter-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #475569;
}

.vpg-filter-info svg {
  color: #4f46e5;
}

.vpg-config-toggle {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  background: white;
  border: 1px solid #e2e8f0;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-config-toggle:hover {
  background: #f8fafc;
}

.vpg-config-toggle.active {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #059669;
}

.vpg-pivot-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #059669;
}

.vpg-clear-filters {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #475569;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-clear-filters:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

/* Grid Container */
.vpg-grid-container {
  flex: 1;
  overflow: auto;
  position: relative;
  background: rgba(248, 250, 252, 0.3);
}

.vpg-grid-container:focus {
  outline: none;
}

.vpg-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  z-index: 10;
}

.vpg-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #e2e8f0;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: vpg-spin 1s linear infinite;
}

@keyframes vpg-spin {
  to {
    transform: rotate(360deg);
  }
}

.vpg-loading span {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #64748b;
}

.vpg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 5rem;
  gap: 0.75rem;
}

.vpg-empty-icon {
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
  margin-bottom: 0.5rem;
}

.vpg-empty-icon.vpg-warning {
  background: #fef3c7;
  color: #fcd34d;
}

.vpg-empty span {
  color: #64748b;
  font-weight: 500;
}

.vpg-clear-link {
  color: #4f46e5;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
}

.vpg-clear-link:hover {
  text-decoration: underline;
}

.vpg-table-wrapper {
  min-height: 100%;
}

.vpg-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.vpg-header-cell {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0.75rem 1rem;
  text-align: left;
  cursor: pointer;
  user-select: none;
  background: white;
  transition: all 0.15s;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #f1f5f9;
}

.vpg-header-cell:hover {
  background: #f8fafc;
}

.vpg-header-cell:last-child {
  border-right: none;
}

.vpg-header-cell.vpg-has-filter {
  background: rgba(238, 242, 255, 0.7);
}

.vpg-header-cell.vpg-is-sorted {
  background: rgba(239, 246, 255, 0.7);
}

.vpg-header-cell.vpg-has-filter.vpg-is-sorted {
  background: rgba(237, 233, 254, 0.7);
}

.vpg-header-cell.vpg-is-active {
  background: #e0e7ff;
  box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.1);
}

.vpg-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.vpg-header-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vpg-header-icons {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.vpg-sort-indicator {
  color: #3b82f6;
}

.vpg-filter-indicator {
  color: #4f46e5;
}

.vpg-dropdown-arrow {
  padding: 0.125rem;
  border-radius: 0.25rem;
  color: #cbd5e1;
  transition: all 0.15s;
  cursor: pointer;
}

.vpg-dropdown-arrow:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-header-cell:hover .vpg-dropdown-arrow {
  color: #94a3b8;
}

.vpg-row {
  transition: background 0.15s;
}

.vpg-row:nth-child(odd) {
  background: white;
}

.vpg-row:nth-child(even) {
  background: rgba(248, 250, 252, 0.5);
}

.vpg-row:hover {
  background: rgba(239, 246, 255, 0.4);
}

.vpg-cell {
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: cell;
  transition: all 0.15s;
  max-width: 350px;
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f8fafc;
}

.vpg-cell:last-child {
  border-right: none;
}

.vpg-cell.vpg-selected {
  background: rgba(224, 231, 255, 0.8);
  outline: 2px solid #818cf8;
  outline-offset: -2px;
  position: relative;
  z-index: 1;
}

.vpg-cell.vpg-is-number {
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #334155;
  font-variant-numeric: tabular-nums;
}

/* Font size variations */
.vpg-data-grid.vpg-font-xs .vpg-cell {
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
}

.vpg-data-grid.vpg-font-xs .vpg-header-text {
  font-size: 0.625rem;
}

.vpg-data-grid.vpg-font-sm .vpg-cell {
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
}

.vpg-data-grid.vpg-font-base .vpg-cell {
  font-size: 1rem;
  padding: 0.625rem 1rem;
}

.vpg-data-grid.vpg-font-base .vpg-header-text {
  font-size: 0.75rem;
}

/* Pivot Container */
.vpg-pivot-container {
  display: flex;
  flex: 1;
  gap: 1rem;
  overflow: hidden;
  min-height: 0;
  padding: 1rem;
}

.vpg-pivot-config-panel {
  width: 14rem;
  flex-shrink: 0;
  overflow: hidden;
}

.vpg-pivot-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.vpg-pivot-main.vpg-full-width {
  width: 100%;
}

/* Footer */
.vpg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(248, 250, 252, 0.8);
  border-top: 1px solid rgba(226, 232, 240, 0.8);
  font-size: 0.875rem;
}

.vpg-footer-left {
  display: flex;
  align-items: center;
  color: #64748b;
}

.vpg-filtered-count {
  color: #4f46e5;
  font-weight: 500;
}

.vpg-separator {
  color: #94a3b8;
  margin: 0 0.25rem;
}

.vpg-pivot-label {
  color: #10b981;
  font-weight: 500;
}

.vpg-footer-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.vpg-selection-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: #eef2ff;
  border-radius: 0.375rem;
  border: 1px solid #c7d2fe;
}

.vpg-stat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.vpg-stat-label {
  font-size: 0.75rem;
  color: #4f46e5;
  font-weight: 500;
}

.vpg-stat-value {
  font-size: 0.75rem;
  color: #1e1b4b;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.vpg-stat-divider {
  color: #c7d2fe;
}

.vpg-watermark-inline a {
  font-size: 0.75rem;
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.15s;
}

.vpg-watermark-inline a:hover {
  color: #64748b;
}

/* Demo Banner */
.vpg-demo-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid #fcd34d;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  color: #92400e;
}

.vpg-demo-badge {
  display: inline-flex;
  padding: 0.125rem 0.375rem;
  background: #f59e0b;
  color: white;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 0.25rem;
  letter-spacing: 0.05em;
}

.vpg-demo-banner a {
  font-weight: 600;
  color: #d97706;
  text-decoration: none;
}

.vpg-demo-banner a:hover {
  color: #b45309;
  text-decoration: underline;
}

/* Scrollbar */
.vpg-grid-container::-webkit-scrollbar {
  width: 0.625rem;
  height: 0.625rem;
}

.vpg-grid-container::-webkit-scrollbar-track {
  background: rgba(241, 245, 249, 0.5);
}

.vpg-grid-container::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 225, 0.8);
  border-radius: 9999px;
}

.vpg-grid-container::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.8);
}

.vpg-grid-container::-webkit-scrollbar-corner {
  background: rgba(241, 245, 249, 0.5);
}

/* Toast notification */
.vpg-toast {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #10b981;
  color: white;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  z-index: 100;
}

.vpg-toast-enter-active,
.vpg-toast-leave-active {
  transition: all 0.2s ease;
}

.vpg-toast-enter-from,
.vpg-toast-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

/* Search */
.vpg-search-container {
  display: flex;
  align-items: center;
}

.vpg-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-icon-btn:hover {
  background: #f1f5f9;
  color: #475569;
}

.vpg-search-box {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #f8fafc;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  transition: all 0.15s ease;
}

.vpg-search-box:focus-within {
  background: white;
  border-color: #e2e8f0;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
}

.vpg-search-icon {
  width: 1rem;
  height: 1rem;
  color: #94a3b8;
  flex-shrink: 0;
}

.vpg-search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.8125rem;
  color: #334155;
  width: 200px;
}

.vpg-search-input:focus {
  outline: none;
}

.vpg-search-input::placeholder {
  color: #94a3b8;
}

.vpg-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.125rem;
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  color: #64748b;
  cursor: pointer;
}

.vpg-search-clear:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-search-info {
  font-size: 0.75rem;
  color: #64748b;
  font-style: italic;
}

/* Export button */
.vpg-export-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-export-btn:hover:not(:disabled) {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.vpg-export-btn-disabled,
.vpg-export-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #94a3b8;
}

/* Column resize handle */
.vpg-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}

.vpg-resize-handle:hover {
  background: rgba(79, 70, 229, 0.3);
}

.vpg-header-cell {
  position: relative;
}

.vpg-data-grid.vpg-resizing {
  cursor: col-resize;
  user-select: none;
}

.vpg-data-grid.vpg-resizing .vpg-resize-handle {
  background: rgba(79, 70, 229, 0.3);
}

/* Vertical resize handle */
.vpg-vertical-resize-handle {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  cursor: row-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.15s;
}

.vpg-vertical-resize-handle:hover {
  background: rgba(79, 70, 229, 0.1);
}

.vpg-vertical-resize-handle:hover .vpg-resize-grip span {
  background: rgba(79, 70, 229, 0.6);
}

.vpg-resize-grip {
  display: flex;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 4px;
}

.vpg-resize-grip span {
  width: 16px;
  height: 2px;
  background: #cbd5e1;
  border-radius: 1px;
  transition: background 0.15s;
}

.vpg-data-grid.vpg-resizing-vertical {
  cursor: row-resize;
  user-select: none;
}

.vpg-data-grid.vpg-resizing-vertical .vpg-vertical-resize-handle {
  background: rgba(79, 70, 229, 0.15);
}

.vpg-data-grid.vpg-resizing-vertical .vpg-resize-grip span {
  background: rgba(79, 70, 229, 0.8);
}

/* Pagination */
.vpg-pagination {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.vpg-page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.25rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-page-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.vpg-page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vpg-page-info {
  font-size: 0.75rem;
  color: #64748b;
  padding: 0 0.5rem;
}

.vpg-filtered-note {
  font-size: 0.75rem;
  color: #94a3b8;
  margin-left: 0.25rem;
}

/* Dark theme */
.vpg-data-grid.vpg-theme-dark {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-toolbar {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-view-toggle {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-view-btn {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-view-btn:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-view-btn.active {
  background: #6366f1;
  color: white;
}

.vpg-theme-dark .vpg-view-btn.vpg-pivot-btn.active {
  background: #10b981;
}

.vpg-theme-dark .vpg-label {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-font-size-toggle {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-font-size-btn {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-font-size-btn:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-grid-container {
  background: rgba(15, 23, 42, 0.5);
}

.vpg-theme-dark .vpg-header-cell {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-header-cell:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-header-text {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-dropdown-arrow {
  color: #64748b;
}

.vpg-theme-dark .vpg-dropdown-arrow:hover {
  background: #475569;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-row:nth-child(odd) {
  background: #1e293b;
}

.vpg-theme-dark .vpg-row:nth-child(even) {
  background: rgba(30, 41, 59, 0.7);
}

.vpg-theme-dark .vpg-row:hover {
  background: rgba(51, 65, 85, 0.5);
}

.vpg-theme-dark .vpg-cell {
  color: #e2e8f0;
  border-color: #334155;
}

.vpg-theme-dark .vpg-cell.vpg-selected {
  background: rgba(99, 102, 241, 0.3);
  outline-color: #818cf8;
}

.vpg-theme-dark .vpg-footer {
  background: rgba(15, 23, 42, 0.8);
  border-color: #334155;
}

.vpg-theme-dark .vpg-footer-left {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-selection-stats {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
}

.vpg-theme-dark .vpg-stat-label {
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-stat-value {
  color: #e0e7ff;
}

.vpg-theme-dark .vpg-stat-divider {
  color: rgba(99, 102, 241, 0.4);
}

.vpg-theme-dark .vpg-search-box {
  background: #334155;
  border-color: transparent;
}

.vpg-theme-dark .vpg-search-box:focus-within {
  background: #1e293b;
  border-color: #475569;
}

.vpg-theme-dark .vpg-search-input {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-search-clear {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-search-clear:hover {
  background: #475569;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-clear-filters {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-clear-filters:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-page-btn {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-page-btn:hover:not(:disabled) {
  background: #334155;
}

.vpg-theme-dark .vpg-export-btn {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.vpg-theme-dark .vpg-export-btn:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.3);
}

.vpg-theme-dark .vpg-export-btn-disabled,
.vpg-theme-dark .vpg-export-btn:disabled {
  opacity: 0.5;
  background: #334155;
  border-color: #475569;
  color: #64748b;
}

.vpg-theme-dark .vpg-config-toggle {
  background: #1e293b;
  border-color: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-config-toggle:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-config-toggle.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: #34d399;
}

.vpg-theme-dark .vpg-pivot-status {
  color: #34d399;
}

.vpg-theme-dark .vpg-watermark-inline a {
  color: #94a3b8;
  background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
  border-color: #475569;
}

.vpg-theme-dark .vpg-watermark-inline a:hover {
  color: #cbd5e1;
  background: linear-gradient(135deg, #334155 0%, #475569 100%);
  border-color: #64748b;
}

.vpg-theme-dark .vpg-resize-grip span {
  background: #475569;
}

.vpg-theme-dark .vpg-vertical-resize-handle:hover .vpg-resize-grip span {
  background: rgba(129, 140, 248, 0.6);
}

.vpg-theme-dark.vpg-resizing-vertical .vpg-resize-grip span {
  background: rgba(129, 140, 248, 0.8);
}

/* Striped rows (toggleable) */
.vpg-data-grid:not(.vpg-striped) .vpg-row:nth-child(even) {
  background: inherit;
}

.vpg-theme-dark:not(.vpg-striped) .vpg-row:nth-child(odd),
.vpg-theme-dark:not(.vpg-striped) .vpg-row:nth-child(even) {
  background: #1e293b;
}
</style>

