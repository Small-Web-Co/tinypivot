<script setup lang="ts">
/**
 * Pivot Table Skeleton + Data Display
 * Visual layout for pivot configuration and results
 */
import { computed, ref } from 'vue'
import type { AggregationFunction, PivotResult, PivotValueField } from '../types'
import { useLicense } from '../composables/useLicense'

interface ActiveFilter {
  column: string
  valueCount: number
  values: string[]
}

const props = defineProps<{
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  isConfigured: boolean
  draggingField: string | null
  pivotResult: PivotResult | null
  fontSize?: 'xs' | 'sm' | 'base'
  activeFilters?: ActiveFilter[] | null
  totalRowCount?: number
  filteredRowCount?: number
}>()

const emit = defineEmits<{
  (e: 'addRowField', field: string): void
  (e: 'removeRowField', field: string): void
  (e: 'addColumnField', field: string): void
  (e: 'removeColumnField', field: string): void
  (e: 'addValueField', field: string, aggregation: AggregationFunction): void
  (e: 'removeValueField', field: string, aggregation: AggregationFunction): void
  (e: 'updateAggregation', field: string, oldAgg: AggregationFunction, newAgg: AggregationFunction): void
  (e: 'reorderRowFields', fields: string[]): void
  (e: 'reorderColumnFields', fields: string[]): void
}>()

const { showWatermark, canUsePivot, isDemo } = useLicense()

// Drag state
const dragOverArea = ref<'row' | 'column' | 'value' | null>(null)

// Reorder drag state
const reorderDragSource = ref<{ zone: 'row' | 'column', index: number } | null>(null)
const reorderDropTarget = ref<{ zone: 'row' | 'column', index: number } | null>(null)

// Aggregation labels
const aggregationLabels: Record<AggregationFunction, string> = {
  sum: 'Sum',
  count: 'Count',
  avg: 'Average',
  min: 'Min',
  max: 'Max',
  countDistinct: 'Count Distinct',
  median: 'Median',
  stdDev: 'Std Dev',
  percentOfTotal: '% of Total',
}

function getAggregationLabel(fn: AggregationFunction): string {
  return aggregationLabels[fn]
}

function getAggSymbol(agg: AggregationFunction): string {
  const symbols: Record<AggregationFunction, string> = {
    sum: 'Σ',
    count: '#',
    avg: 'x̄',
    min: '↓',
    max: '↑',
    countDistinct: '◇',
    median: 'M̃',
    stdDev: 'σ',
    percentOfTotal: '%Σ',
  }
  return symbols[agg] || 'Σ'
}

// Font size
const currentFontSize = ref(props.fontSize || 'xs')
const fontSizeOptions = [
  { value: 'xs', label: 'S' },
  { value: 'sm', label: 'M' },
  { value: 'base', label: 'L' },
] as const

// Filter status
const hasActiveFilters = computed(() => props.activeFilters && props.activeFilters.length > 0)
const filterSummary = computed(() => {
  if (!props.activeFilters || props.activeFilters.length === 0) return ''
  const columns = props.activeFilters.map(f => f.column).join(', ')
  return columns
})

// Detailed filter tooltip
const filterTooltipDetails = computed(() => {
  if (!props.activeFilters || props.activeFilters.length === 0) return []
  return props.activeFilters.map(f => {
    const maxDisplay = 5
    const displayValues = f.values.slice(0, maxDisplay)
    const remaining = f.values.length - maxDisplay
    return {
      column: f.column,
      values: displayValues,
      remaining: remaining > 0 ? remaining : 0,
    }
  })
})

// Show/hide tooltip
const showFilterTooltip = ref(false)

// Sorting
type SortDirection = 'asc' | 'desc'
type SortTarget = 'row' | number
const sortDirection = ref<SortDirection>('asc')
const sortTarget = ref<SortTarget>('row')

function toggleSort(target: SortTarget = 'row') {
  if (sortTarget.value === target) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortTarget.value = target
    sortDirection.value = 'asc'
  }
}

// Sorted row indices
const sortedRowIndices = computed(() => {
  if (!props.pivotResult)
    return []

  const indices = props.pivotResult.rowHeaders.map((_, i) => i)
  const headers = props.pivotResult.rowHeaders
  const data = props.pivotResult.data

  indices.sort((a, b) => {
    let cmp: number

    if (sortTarget.value === 'row') {
      const aHeader = headers[a]?.join(' / ') || ''
      const bHeader = headers[b]?.join(' / ') || ''
      cmp = aHeader.localeCompare(bHeader, undefined, { numeric: true, sensitivity: 'base' })
    }
    else {
      const colIdx = sortTarget.value as number
      const aVal = data[a]?.[colIdx]?.value ?? null
      const bVal = data[b]?.[colIdx]?.value ?? null

      if (aVal === null && bVal === null)
        cmp = 0
      else if (aVal === null)
        cmp = 1
      else if (bVal === null)
        cmp = -1
      else cmp = aVal - bVal
    }

    return sortDirection.value === 'asc' ? cmp : -cmp
  })

  return indices
})

// Column headers
const columnHeaderCells = computed(() => {
  if (!props.pivotResult || props.pivotResult.headers.length === 0) {
    return [props.valueFields.map(vf => ({
      label: `${vf.field} (${getAggregationLabel(vf.aggregation)})`,
      colspan: 1,
    }))]
  }

  const result: Array<Array<{ label: string, colspan: number }>> = []

  for (let level = 0; level < props.pivotResult.headers.length; level++) {
    const headerRow = props.pivotResult.headers[level]
    const cells: Array<{ label: string, colspan: number }> = []

    let i = 0
    while (i < headerRow.length) {
      const value = headerRow[i]
      let colspan = 1

      while (i + colspan < headerRow.length && headerRow[i + colspan] === value) {
        colspan++
      }

      cells.push({ label: value, colspan })
      i += colspan
    }

    result.push(cells)
  }

  return result
})

// Selection for copy support
const selectedCell = ref<{ row: number, col: number } | null>(null)
function handleCellClick(rowIndex: number, colIndex: number) {
  selectedCell.value = { row: rowIndex, col: colIndex }
}
function isCellSelected(rowIndex: number, colIndex: number): boolean {
  return selectedCell.value?.row === rowIndex && selectedCell.value?.col === colIndex
}

// Drag handlers
function handleDragOver(area: 'row' | 'column' | 'value', event: DragEvent) {
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
  dragOverArea.value = area
}

function handleDragLeave() {
  dragOverArea.value = null
}

function handleDrop(area: 'row' | 'column' | 'value', event: DragEvent) {
  event.preventDefault()
  const field = event.dataTransfer?.getData('text/plain')

  // Skip if this is a reorder operation (handled by chip drop)
  if (!field || field.startsWith('reorder:')) {
    dragOverArea.value = null
    return
  }

  if (props.rowFields.includes(field))
    emit('removeRowField', field)
  if (props.columnFields.includes(field))
    emit('removeColumnField', field)
  const existingValue = props.valueFields.find(v => v.field === field)
  if (existingValue)
    emit('removeValueField', field, existingValue.aggregation)

  switch (area) {
    case 'row':
      emit('addRowField', field)
      break
    case 'column':
      emit('addColumnField', field)
      break
    case 'value':
      emit('addValueField', field, 'sum')
      break
  }
  dragOverArea.value = null
}

// Reorder handlers for chips within zones
function handleChipDragStart(zone: 'row' | 'column', index: number, event: DragEvent) {
  reorderDragSource.value = { zone, index }
  event.dataTransfer!.effectAllowed = 'move'
  event.dataTransfer!.setData('text/plain', `reorder:${zone}:${index}`)
  // Add a slight delay to ensure visual feedback
  requestAnimationFrame(() => {
    dragOverArea.value = null
  })
}

function handleChipDragEnd() {
  reorderDragSource.value = null
  reorderDropTarget.value = null
}

function handleChipDragOver(zone: 'row' | 'column', index: number, event: DragEvent) {
  event.preventDefault()
  // Only handle reorder within same zone
  if (reorderDragSource.value && reorderDragSource.value.zone === zone) {
    event.dataTransfer!.dropEffect = 'move'
    reorderDropTarget.value = { zone, index }
  }
}

function handleChipDragLeave() {
  reorderDropTarget.value = null
}

function handleChipDrop(zone: 'row' | 'column', targetIndex: number, event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  
  if (!reorderDragSource.value || reorderDragSource.value.zone !== zone) {
    return
  }
  
  const sourceIndex = reorderDragSource.value.index
  if (sourceIndex === targetIndex) {
    reorderDragSource.value = null
    reorderDropTarget.value = null
    return
  }
  
  // Create reordered array
  const fields = zone === 'row' ? [...props.rowFields] : [...props.columnFields]
  const [movedField] = fields.splice(sourceIndex, 1)
  fields.splice(targetIndex, 0, movedField)
  
  // Emit reorder event
  if (zone === 'row') {
    emit('reorderRowFields', fields)
  } else {
    emit('reorderColumnFields', fields)
  }
  
  reorderDragSource.value = null
  reorderDropTarget.value = null
}

function isChipDragSource(zone: 'row' | 'column', index: number): boolean {
  return reorderDragSource.value?.zone === zone && reorderDragSource.value?.index === index
}

function isChipDropTarget(zone: 'row' | 'column', index: number): boolean {
  return reorderDropTarget.value?.zone === zone && reorderDropTarget.value?.index === index
}

// Column width
const rowHeaderWidth = ref(180)
const dataColWidth = ref(80)
</script>

<template>
  <div
    class="vpg-pivot-skeleton"
    :class="[
      `vpg-font-${currentFontSize}`,
      { 'vpg-is-dragging': draggingField },
    ]"
  >
    <!-- Header Bar -->
    <div class="vpg-skeleton-header">
      <div class="vpg-skeleton-title">
        <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <span>Pivot Table</span>
      </div>

      <div class="vpg-header-right">
        <!-- Filter indicator with tooltip -->
        <div
          v-if="hasActiveFilters"
          class="vpg-filter-indicator"
          @mouseenter="showFilterTooltip = true"
          @mouseleave="showFilterTooltip = false"
        >
          <svg class="vpg-filter-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span class="vpg-filter-text">
            Filtered: <strong>{{ filterSummary }}</strong>
            <span v-if="filteredRowCount !== undefined && totalRowCount !== undefined" class="vpg-filter-count">
              ({{ filteredRowCount.toLocaleString() }} of {{ totalRowCount.toLocaleString() }} rows)
            </span>
          </span>

          <!-- Tooltip -->
          <div v-if="showFilterTooltip" class="vpg-filter-tooltip">
            <div class="vpg-tooltip-header">Active Filters</div>
            <div v-for="filter in filterTooltipDetails" :key="filter.column" class="vpg-tooltip-filter">
              <div class="vpg-tooltip-column">{{ filter.column }}</div>
              <div class="vpg-tooltip-values">
                <span v-for="(val, idx) in filter.values" :key="idx" class="vpg-tooltip-value">
                  {{ val }}
                </span>
                <span v-if="filter.remaining > 0" class="vpg-tooltip-more">
                  +{{ filter.remaining }} more
                </span>
              </div>
            </div>
            <div v-if="filteredRowCount !== undefined && totalRowCount !== undefined" class="vpg-tooltip-summary">
              Showing {{ filteredRowCount.toLocaleString() }} of {{ totalRowCount.toLocaleString() }} rows
            </div>
          </div>
        </div>

        <div v-if="isConfigured" class="vpg-config-summary">
          <span class="vpg-summary-badge vpg-rows">{{ rowFields.length }} row{{ rowFields.length !== 1 ? 's' : '' }}</span>
          <span class="vpg-summary-badge vpg-cols">{{ columnFields.length }} col{{ columnFields.length !== 1 ? 's' : '' }}</span>
          <span class="vpg-summary-badge vpg-vals">{{ valueFields.length }} val{{ valueFields.length !== 1 ? 's' : '' }}</span>
        </div>

        <div v-if="isConfigured && pivotResult" class="vpg-font-size-toggle">
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
    </div>

    <!-- License Required Message -->
    <div v-if="!canUsePivot" class="vpg-pro-required">
      <div class="vpg-pro-content">
        <svg class="vpg-pro-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3>Pro Feature</h3>
        <p>Pivot Table functionality requires a Pro license.</p>
        <a href="https://tiny-pivot.com/#pricing" target="_blank" class="vpg-pro-link">
          Get Pro License →
        </a>
      </div>
    </div>

    <!-- Content when licensed -->
    <template v-else>
      <!-- Config Bar -->
      <div class="vpg-config-bar">
        <!-- Row drop zone -->
        <div
          class="vpg-drop-zone vpg-row-zone"
          :class="{ 'vpg-drag-over': dragOverArea === 'row' }"
          @dragover="handleDragOver('row', $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop('row', $event)"
        >
          <div class="vpg-zone-header">
            <span class="vpg-zone-icon vpg-row-icon">↓</span>
            <span class="vpg-zone-label">Rows</span>
          </div>
          <div class="vpg-zone-chips">
            <div
              v-for="(field, idx) in rowFields"
              :key="field"
              class="vpg-mini-chip vpg-row-chip"
              :class="{
                'vpg-chip-dragging': isChipDragSource('row', idx),
                'vpg-chip-drop-target': isChipDropTarget('row', idx),
              }"
              draggable="true"
              @dragstart="handleChipDragStart('row', idx, $event)"
              @dragend="handleChipDragEnd"
              @dragover="handleChipDragOver('row', idx, $event)"
              @dragleave="handleChipDragLeave"
              @drop="handleChipDrop('row', idx, $event)"
            >
              <span class="vpg-drag-handle">⋮⋮</span>
              <span class="vpg-mini-name">{{ field }}</span>
              <button class="vpg-mini-remove" @click.stop="emit('removeRowField', field)">×</button>
            </div>
            <span v-if="rowFields.length === 0" class="vpg-zone-hint">Drop here</span>
          </div>
        </div>

        <!-- Column drop zone -->
        <div
          class="vpg-drop-zone vpg-column-zone"
          :class="{ 'vpg-drag-over': dragOverArea === 'column' }"
          @dragover="handleDragOver('column', $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop('column', $event)"
        >
          <div class="vpg-zone-header">
            <span class="vpg-zone-icon vpg-column-icon">→</span>
            <span class="vpg-zone-label">Columns</span>
          </div>
          <div class="vpg-zone-chips">
            <div
              v-for="(field, idx) in columnFields"
              :key="field"
              class="vpg-mini-chip vpg-column-chip"
              :class="{
                'vpg-chip-dragging': isChipDragSource('column', idx),
                'vpg-chip-drop-target': isChipDropTarget('column', idx),
              }"
              draggable="true"
              @dragstart="handleChipDragStart('column', idx, $event)"
              @dragend="handleChipDragEnd"
              @dragover="handleChipDragOver('column', idx, $event)"
              @dragleave="handleChipDragLeave"
              @drop="handleChipDrop('column', idx, $event)"
            >
              <span class="vpg-drag-handle">⋮⋮</span>
              <span class="vpg-mini-name">{{ field }}</span>
              <button class="vpg-mini-remove" @click.stop="emit('removeColumnField', field)">×</button>
            </div>
            <span v-if="columnFields.length === 0" class="vpg-zone-hint">Drop here</span>
          </div>
        </div>

        <!-- Values drop zone -->
        <div
          class="vpg-drop-zone vpg-value-zone"
          :class="{ 'vpg-drag-over': dragOverArea === 'value' }"
          @dragover="handleDragOver('value', $event)"
          @dragleave="handleDragLeave"
          @drop="handleDrop('value', $event)"
        >
          <div class="vpg-zone-header">
            <span class="vpg-zone-icon vpg-value-icon">Σ</span>
            <span class="vpg-zone-label">Values</span>
          </div>
          <div class="vpg-zone-chips">
            <div
              v-for="vf in valueFields"
              :key="`${vf.field}-${vf.aggregation}`"
              class="vpg-mini-chip vpg-value-chip"
            >
              <span class="vpg-agg-symbol">{{ getAggSymbol(vf.aggregation) }}</span>
              <span class="vpg-mini-name">{{ vf.field }}</span>
              <button class="vpg-mini-remove" @click="emit('removeValueField', vf.field, vf.aggregation)">×</button>
            </div>
            <span v-if="valueFields.length === 0" class="vpg-zone-hint">Drop numeric</span>
          </div>
        </div>
      </div>

      <!-- Placeholder when not configured -->
      <div v-if="!isConfigured || !pivotResult" class="vpg-placeholder">
        <div class="vpg-placeholder-content">
          <svg class="vpg-placeholder-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span class="vpg-placeholder-text">
            <template v-if="valueFields.length === 0">
              Add a <strong>Values</strong> field to see your pivot table
            </template>
            <template v-else-if="rowFields.length === 0 && columnFields.length === 0">
              Add <strong>Row</strong> or <strong>Column</strong> fields to group your data
            </template>
            <template v-else>
              Your pivot table will appear here
            </template>
          </span>
        </div>
      </div>

      <!-- Data Table -->
      <div v-else class="vpg-table-container">
        <table class="vpg-pivot-table">
          <thead>
            <tr v-for="(headerRow, levelIdx) in columnHeaderCells" :key="`header-${levelIdx}`" class="vpg-column-header-row">
              <th
                v-if="levelIdx === 0"
                class="vpg-row-header-label"
                :rowspan="columnHeaderCells.length"
                :style="{ width: `${rowHeaderWidth}px` }"
                @click="toggleSort('row')"
              >
                <div class="vpg-header-content">
                  <span>{{ rowFields.join(' / ') || 'Rows' }}</span>
                  <span class="vpg-sort-indicator" :class="{ active: sortTarget === 'row' }">
                    {{ sortTarget === 'row' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅' }}
                  </span>
                </div>
              </th>
              <th
                v-for="(cell, idx) in headerRow"
                :key="idx"
                class="vpg-column-header-cell"
                :colspan="cell.colspan"
                :style="{ width: `${dataColWidth * cell.colspan}px` }"
                @click="levelIdx === columnHeaderCells.length - 1 && toggleSort(idx)"
              >
                <div class="vpg-header-content">
                  <span>{{ cell.label }}</span>
                  <span v-if="levelIdx === columnHeaderCells.length - 1" class="vpg-sort-indicator" :class="{ active: sortTarget === idx }">
                    {{ sortTarget === idx ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅' }}
                  </span>
                </div>
              </th>
              <th
                v-if="pivotResult.rowTotals.length > 0 && levelIdx === 0"
                class="vpg-total-header"
                :rowspan="columnHeaderCells.length"
              >
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="sortedIdx in sortedRowIndices" :key="sortedIdx" class="vpg-data-row">
              <th
                class="vpg-row-header-cell"
                :style="{ width: `${rowHeaderWidth}px` }"
              >
                <span v-for="(val, idx) in pivotResult.rowHeaders[sortedIdx]" :key="idx" class="vpg-row-value">
                  {{ val }}
                </span>
              </th>

              <td
                v-for="(cell, colIdx) in pivotResult.data[sortedIdx]"
                :key="colIdx"
                class="vpg-data-cell"
                :class="[
                  isCellSelected(sortedIdx, colIdx) && 'selected',
                  cell.value === null && 'vpg-is-null',
                ]"
                :style="{ width: `${dataColWidth}px` }"
                @click="handleCellClick(sortedIdx, colIdx)"
              >
                {{ cell.formattedValue }}
              </td>

              <td v-if="pivotResult.rowTotals[sortedIdx]" class="vpg-data-cell vpg-total-cell">
                {{ pivotResult.rowTotals[sortedIdx].formattedValue }}
              </td>
            </tr>

            <tr v-if="pivotResult.columnTotals.length > 0" class="vpg-totals-row">
              <th class="vpg-row-header-cell vpg-total-label" :style="{ width: `${rowHeaderWidth}px` }">
                Total
              </th>
              <td
                v-for="(cell, colIdx) in pivotResult.columnTotals"
                :key="colIdx"
                class="vpg-data-cell vpg-total-cell"
                :style="{ width: `${dataColWidth}px` }"
              >
                {{ cell.formattedValue }}
              </td>
              <td v-if="pivotResult.rowTotals.length > 0" class="vpg-data-cell vpg-grand-total-cell">
                {{ pivotResult.grandTotal.formattedValue }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div v-if="isConfigured && pivotResult" class="vpg-skeleton-footer">
        <span>{{ pivotResult.rowHeaders.length }} rows × {{ pivotResult.data[0]?.length || 0 }} columns</span>
      </div>
    </template>

    <!-- Watermark / Demo Banner -->
    <div v-if="showWatermark && canUsePivot" class="vpg-watermark" :class="{ 'vpg-demo-mode': isDemo }">
      <template v-if="isDemo">
        <span class="vpg-demo-badge">DEMO</span>
        <span>Pro features unlocked for evaluation</span>
        <a href="https://tiny-pivot.com/#pricing" target="_blank" rel="noopener" class="vpg-get-pro">
          Get Pro License →
        </a>
      </template>
      <template v-else>
        <a href="https://tiny-pivot.com" target="_blank" rel="noopener">
          Powered by TinyPivot
        </a>
      </template>
    </div>
  </div>
</template>

<style scoped>
.vpg-pivot-skeleton {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.vpg-pivot-skeleton.vpg-is-dragging {
  box-shadow: 0 0 0 2px #10b981;
}

.vpg-icon {
  width: 1rem;
  height: 1rem;
}

/* Header */
.vpg-skeleton-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: linear-gradient(to right, #ecfdf5, #f0fdfa);
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.vpg-skeleton-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.vpg-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.vpg-config-summary {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.vpg-summary-badge {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
}

.vpg-summary-badge.vpg-rows {
  background: #e0e7ff;
  color: #4f46e5;
}

.vpg-summary-badge.vpg-cols {
  background: #ede9fe;
  color: #7c3aed;
}

.vpg-summary-badge.vpg-vals {
  background: #d1fae5;
  color: #059669;
}

/* Filter indicator */
.vpg-filter-indicator {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  color: #92400e;
  box-shadow: 0 1px 2px rgba(245, 158, 11, 0.15);
  cursor: help;
}

.vpg-filter-icon {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  color: #d97706;
}

.vpg-filter-text {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.vpg-filter-text strong {
  font-weight: 600;
  color: #78350f;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vpg-filter-count {
  color: #a16207;
  font-size: 0.625rem;
}

/* Filter tooltip */
.vpg-filter-tooltip {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 220px;
  max-width: 320px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
}

.vpg-tooltip-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #475569;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.vpg-tooltip-filter {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.vpg-tooltip-filter:last-of-type {
  border-bottom: none;
}

.vpg-tooltip-column {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.375rem;
}

.vpg-tooltip-values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.vpg-tooltip-value {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 0.25rem;
  border: 1px solid #fde68a;
}

.vpg-tooltip-more {
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  color: #64748b;
  font-style: italic;
}

.vpg-tooltip-summary {
  padding: 0.5rem 0.75rem;
  font-size: 0.625rem;
  color: #64748b;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  text-align: center;
}

.vpg-font-size-toggle {
  display: flex;
  background: white;
  border-radius: 0.25rem;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.vpg-font-size-btn {
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
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
  background: #10b981;
  color: white;
}

/* Pro Required */
.vpg-pro-required {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
}

.vpg-pro-content {
  text-align: center;
  padding: 2rem;
}

.vpg-pro-icon {
  width: 3rem;
  height: 3rem;
  color: #d97706;
  margin: 0 auto 1rem;
}

.vpg-pro-content h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 0.5rem;
}

.vpg-pro-content p {
  font-size: 0.875rem;
  color: #a16207;
  margin-bottom: 1rem;
}

.vpg-pro-link {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #f59e0b;
  color: white;
  font-weight: 500;
  border-radius: 0.375rem;
  text-decoration: none;
  transition: background 0.15s;
}

.vpg-pro-link:hover {
  background: #d97706;
}

/* Config Bar */
.vpg-config-bar {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.vpg-drop-zone {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 2px dashed;
  transition: all 0.15s;
}

.vpg-drop-zone.vpg-row-zone {
  background: rgba(238, 242, 255, 0.5);
  border-color: #c7d2fe;
}

.vpg-drop-zone.vpg-column-zone {
  background: rgba(245, 243, 255, 0.5);
  border-color: #ddd6fe;
  flex: 1;
}

.vpg-drop-zone.vpg-value-zone {
  background: rgba(236, 253, 245, 0.5);
  border-color: #a7f3d0;
}

.vpg-drop-zone.vpg-drag-over {
  border-style: solid;
  box-shadow: 0 0 0 2px currentColor inset;
}

.vpg-drop-zone.vpg-row-zone.vpg-drag-over {
  background: #eef2ff;
  border-color: #818cf8;
}

.vpg-drop-zone.vpg-column-zone.vpg-drag-over {
  background: #f5f3ff;
  border-color: #a78bfa;
}

.vpg-drop-zone.vpg-value-zone.vpg-drag-over {
  background: #ecfdf5;
  border-color: #34d399;
}

.vpg-zone-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

.vpg-zone-icon {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.25rem;
}

.vpg-zone-icon.vpg-row-icon {
  background: #c7d2fe;
  color: #4338ca;
}

.vpg-zone-icon.vpg-column-icon {
  background: #ddd6fe;
  color: #7c3aed;
}

.vpg-zone-icon.vpg-value-icon {
  background: #a7f3d0;
  color: #059669;
}

.vpg-zone-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.vpg-row-zone .vpg-zone-label {
  color: #4f46e5;
}

.vpg-column-zone .vpg-zone-label {
  color: #7c3aed;
}

.vpg-value-zone .vpg-zone-label {
  color: #059669;
}

.vpg-zone-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.vpg-zone-hint {
  font-size: 0.625rem;
  color: #94a3b8;
  font-style: italic;
}

.vpg-mini-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  max-width: 100%;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  cursor: grab;
  transition: all 0.15s ease;
}

.vpg-mini-chip:active {
  cursor: grabbing;
}

.vpg-drag-handle {
  opacity: 0.3;
  font-size: 0.625rem;
  letter-spacing: -0.1em;
  margin-right: 0.125rem;
  cursor: grab;
  flex-shrink: 0;
}

.vpg-mini-chip:hover .vpg-drag-handle {
  opacity: 0.6;
}

.vpg-mini-chip.vpg-chip-dragging {
  opacity: 0.4;
  transform: scale(0.95);
}

.vpg-mini-chip.vpg-chip-drop-target {
  transform: translateX(4px);
  box-shadow: -3px 0 0 0 currentColor, 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-mini-chip.vpg-row-chip {
  background: white;
  color: #4338ca;
  border: 1px solid #c7d2fe;
}

.vpg-mini-chip.vpg-column-chip {
  background: white;
  color: #7c3aed;
  border: 1px solid #ddd6fe;
}

.vpg-mini-chip.vpg-value-chip {
  background: white;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.vpg-mini-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.vpg-mini-remove {
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  line-height: 1;
  opacity: 0.4;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-mini-remove:hover {
  opacity: 1;
  background: #fee2e2;
  color: #ef4444;
}

.vpg-agg-symbol {
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  background: #d1fae5;
  color: #059669;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

/* Placeholder */
.vpg-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc, white, rgba(236, 253, 245, 0.3));
  border-top: 1px solid #f1f5f9;
}

.vpg-placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  padding: 2rem;
}

.vpg-placeholder-icon {
  width: 4rem;
  height: 4rem;
  color: #cbd5e1;
}

.vpg-placeholder-text {
  font-size: 0.875rem;
  color: #64748b;
}

.vpg-placeholder-text strong {
  color: #334155;
  font-weight: 600;
}

/* Table */
.vpg-table-container {
  flex: 1;
  overflow: auto;
  max-height: 100%;
}

.vpg-pivot-table {
  border-collapse: collapse;
  table-layout: fixed;
  min-width: max-content;
}

.vpg-pivot-table thead {
  position: sticky;
  top: 0;
  z-index: 30;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.1);
}

.vpg-column-header-row {
  background: #e2e8f0;
}

.vpg-column-header-row th {
  background: #e2e8f0;
}

.vpg-row-header-label {
  position: sticky;
  left: 0;
  z-index: 30;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.625rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  border-bottom: 1px solid #cbd5e1;
  border-right: 1px solid #cbd5e1;
  background: #e2e8f0;
  cursor: pointer;
}

.vpg-row-header-label:hover {
  background: #d1d5db;
}

.vpg-column-header-cell {
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #334155;
  border-bottom: 1px solid #cbd5e1;
  border-right: 1px solid #cbd5e1;
  white-space: nowrap;
  background: #e2e8f0;
  cursor: pointer;
}

.vpg-column-header-cell:hover {
  background: rgba(203, 213, 225, 0.5);
}

.vpg-header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}

.vpg-sort-indicator {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.75rem;
}

.vpg-sort-indicator.active {
  color: #4f46e5;
  font-weight: 700;
}

.vpg-total-header {
  padding: 0.5rem;
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #92400e;
  border-bottom: 1px solid #cbd5e1;
  border-left: 2px solid #f59e0b;
  background: #fde68a;
  vertical-align: middle;
}

.vpg-data-row:hover {
  background: #ecfdf5;
}

.vpg-data-row:nth-child(even) {
  background: #f8fafc;
}

.vpg-row-header-cell {
  position: sticky;
  left: 0;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 500;
  color: #334155;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  white-space: nowrap;
  z-index: 10;
}

.vpg-data-row:nth-child(even) .vpg-row-header-cell {
  background: #f8fafc;
}

.vpg-row-value + .vpg-row-value::before {
  content: ' / ';
  color: #94a3b8;
}

.vpg-data-cell {
  padding: 0.5rem 0.75rem;
  text-align: right;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #334155;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f8fafc;
  cursor: cell;
  white-space: nowrap;
}

.vpg-data-cell.selected {
  background: #d1fae5;
  outline: 2px solid #10b981;
  outline-offset: -2px;
  position: relative;
  z-index: 1;
}

.vpg-data-cell.vpg-is-null {
  color: #cbd5e1;
}

.vpg-data-cell.vpg-total-cell {
  background: #fef3c7;
  font-weight: 600;
  color: #92400e;
}

.vpg-data-cell.vpg-grand-total-cell {
  background: #fde68a;
  font-weight: 700;
  color: #92400e;
}

.vpg-totals-row {
  background: #fef9e7;
}

.vpg-total-label {
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
}

/* Font sizes */
.vpg-pivot-skeleton.vpg-font-xs .vpg-data-cell,
.vpg-pivot-skeleton.vpg-font-xs .vpg-row-header-cell {
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
}

.vpg-pivot-skeleton.vpg-font-sm .vpg-data-cell,
.vpg-pivot-skeleton.vpg-font-sm .vpg-row-header-cell {
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
}

.vpg-pivot-skeleton.vpg-font-base .vpg-data-cell,
.vpg-pivot-skeleton.vpg-font-base .vpg-row-header-cell {
  font-size: 1rem;
  padding: 0.625rem 1rem;
}

/* Footer */
.vpg-skeleton-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: #64748b;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}

/* Watermark */
.vpg-watermark {
  padding: 0.375rem 1rem;
  background: #f1f5f9;
  border-top: 1px solid #e2e8f0;
  text-align: center;
  flex-shrink: 0;
}

.vpg-watermark a {
  font-size: 0.625rem;
  color: #94a3b8;
  text-decoration: none;
  transition: color 0.15s;
}

.vpg-watermark a:hover {
  color: #64748b;
}

/* Demo Mode Banner */
.vpg-watermark.vpg-demo-mode {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-top: 1px solid #fcd34d;
  font-size: 0.75rem;
  color: #92400e;
}

.vpg-demo-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  background: #f59e0b;
  color: white;
  font-size: 0.625rem;
  font-weight: 700;
  border-radius: 0.25rem;
  letter-spacing: 0.05em;
}

.vpg-get-pro {
  font-weight: 600;
  color: #d97706 !important;
}

.vpg-get-pro:hover {
  color: #b45309 !important;
  text-decoration: underline;
}

/* Scrollbar */
.vpg-table-container::-webkit-scrollbar {
  width: 0.5rem;
  height: 0.5rem;
}

.vpg-table-container::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.vpg-table-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 9999px;
}

.vpg-table-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.vpg-table-container::-webkit-scrollbar-corner {
  background: #f1f5f9;
}

</style>

<style>
/* Dark Mode - PivotSkeleton */
.vpg-theme-dark .vpg-pivot-skeleton {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-skeleton-header {
  background: linear-gradient(to right, rgba(16, 185, 129, 0.15), rgba(20, 184, 166, 0.1)) !important;
  border-color: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-skeleton-title {
  color: #6ee7b7 !important;
}

/* Config bar (drop zones container) */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-config-bar {
  background: #0f172a !important;
  border-color: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-drop-zones {
  background: #0f172a !important;
  border-color: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-drop-zone {
  background: #1e293b !important;
  border-color: #475569 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-drop-zone:hover {
  border-color: #64748b !important;
  background: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-drop-zone.vpg-zone-active {
  border-color: #10b981 !important;
  background: rgba(16, 185, 129, 0.2) !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-zone-label {
  color: #94a3b8 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-zone-row .vpg-zone-label { color: #a5b4fc !important; }
.vpg-theme-dark .vpg-pivot-skeleton .vpg-zone-column .vpg-zone-label { color: #c4b5fd !important; }
.vpg-theme-dark .vpg-pivot-skeleton .vpg-zone-value .vpg-zone-label { color: #6ee7b7 !important; }

.vpg-theme-dark .vpg-pivot-skeleton .vpg-zone-hint {
  color: #64748b !important;
}

/* Mini chips in drop zones */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-mini-chip.vpg-row-chip {
  background: #312e81 !important;
  color: #a5b4fc !important;
  border-color: #4338ca !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-mini-chip.vpg-column-chip {
  background: #4c1d95 !important;
  color: #c4b5fd !important;
  border-color: #7c3aed !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-mini-chip.vpg-value-chip {
  background: #064e3b !important;
  color: #6ee7b7 !important;
  border-color: #10b981 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-drag-handle {
  opacity: 0.4;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-mini-chip:hover .vpg-drag-handle {
  opacity: 0.7;
}

/* Font size toggle (S M L) */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-font-size-toggle {
  background: #1e293b !important;
  border-color: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-font-size-btn {
  color: #94a3b8 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-font-size-btn:hover {
  background: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-font-size-btn.active {
  background: #10b981 !important;
  color: white !important;
}

/* Summary badges (1 row, 1 col, 1 val) */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-summary-badge.vpg-rows {
  background: rgba(99, 102, 241, 0.2) !important;
  color: #a5b4fc !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-summary-badge.vpg-cols {
  background: rgba(139, 92, 246, 0.2) !important;
  color: #c4b5fd !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-summary-badge.vpg-vals {
  background: rgba(16, 185, 129, 0.2) !important;
  color: #6ee7b7 !important;
}

/* Filter indicator - dark mode */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-filter-indicator {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.25) 100%) !important;
  border-color: #d97706 !important;
  color: #fbbf24 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-filter-icon {
  color: #fbbf24 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-filter-text strong {
  color: #fcd34d !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-filter-count {
  color: #fbbf24 !important;
}

/* Filter tooltip - dark mode */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-filter-tooltip {
  background: #1e293b !important;
  border-color: #475569 !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-header {
  background: #0f172a !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-filter {
  border-color: #334155 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-column {
  color: #e2e8f0 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-value {
  background: rgba(245, 158, 11, 0.2) !important;
  color: #fbbf24 !important;
  border-color: rgba(245, 158, 11, 0.4) !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-more {
  color: #94a3b8 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-tooltip-summary {
  background: #0f172a !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-table-container {
  background: #1e293b;
}

.vpg-theme-dark .vpg-pivot-table {
  background: #1e293b;
}

.vpg-theme-dark .vpg-pivot-table thead {
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.3);
}

.vpg-theme-dark .vpg-column-header-row {
  background: #0f172a !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-column-header-cell,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-corner-cell,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-row-header-label {
  background: #0f172a !important;
  border-color: #334155 !important;
  color: #e2e8f0 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-row-header-label:hover,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-column-header-cell:hover {
  background: #1e293b !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-row-header-cell {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-cell {
  background: #1e293b;
  border-color: #334155;
  color: #cbd5e1;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-row:nth-child(even) .vpg-row-header-cell,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-row:nth-child(even) .vpg-data-cell {
  background: #0f172a;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-row:hover .vpg-row-header-cell,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-row:hover .vpg-data-cell {
  background: #334155;
}

/* Total header column */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-total-header {
  background: #451a03 !important;
  color: #fbbf24 !important;
  border-color: #334155 !important;
}

/* Total cells in rows - consistent color */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-cell.vpg-total-cell {
  background: #451a03 !important;
  color: #fbbf24 !important;
}

/* Grand total cell */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-data-cell.vpg-grand-total-cell {
  background: #451a03 !important;
  color: #fbbf24 !important;
}

/* Totals row - consistent color */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-totals-row {
  background: transparent !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-totals-row .vpg-row-header-cell,
.vpg-theme-dark .vpg-pivot-skeleton .vpg-totals-row .vpg-data-cell {
  background: #451a03 !important;
}

/* Total label */
.vpg-theme-dark .vpg-pivot-skeleton .vpg-total-label {
  background: #451a03 !important;
  color: #fbbf24 !important;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-empty-state {
  background: #0f172a;
  color: #64748b;
}

.vpg-theme-dark .vpg-skeleton-footer {
  background: #0f172a;
  border-color: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-demo-bar {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
  color: #fbbf24;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-table-container::-webkit-scrollbar-track {
  background: #0f172a;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-table-container::-webkit-scrollbar-thumb {
  background: #334155;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-table-container::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

.vpg-theme-dark .vpg-pivot-skeleton .vpg-table-container::-webkit-scrollbar-corner {
  background: #0f172a;
}
</style>

