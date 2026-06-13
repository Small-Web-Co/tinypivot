<script setup lang="ts">
import type { DrillThroughResult, PivotValueField } from '@smallwebco/tinypivot-core'
import { exportToCSV, getAggregationLabel } from '@smallwebco/tinypivot-core'
/**
 * Drill-Through Modal
 * Displays source rows for a pivot cell in a paginated table
 */
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  result: DrillThroughResult | null
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  theme?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const PAGE_SIZE = 50

const currentPage = ref(1)

// Escape key handler
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

// Reset page and manage keyboard listener when modal opens/closes
watch(() => props.show, (show) => {
  if (show) {
    currentPage.value = 1
    document.addEventListener('keydown', handleKeydown)
  }
  else {
    document.removeEventListener('keydown', handleKeydown)
  }
}, { immediate: true })

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Column keys from the first row
const columns = computed((): string[] => {
  if (!props.result || props.result.rows.length === 0)
    return []
  return Object.keys(props.result.rows[0])
})

// Total pages
const totalPages = computed(() => {
  if (!props.result)
    return 1
  return Math.max(1, Math.ceil(props.result.rows.length / PAGE_SIZE))
})

// Rows for current page
const pageRows = computed(() => {
  if (!props.result)
    return []
  const start = (currentPage.value - 1) * PAGE_SIZE
  return props.result.rows.slice(start, start + PAGE_SIZE)
})

// Modal title
const modalTitle = computed(() => {
  if (!props.result)
    return 'Drill Through'

  const { descriptor } = props.result
  const parts: string[] = []

  if (descriptor.rowPath.length > 0)
    parts.push(descriptor.rowPath.join(' × '))
  if (descriptor.columnPath.length > 0)
    parts.push(descriptor.columnPath.join(' × '))

  const slice = parts.length > 0 ? parts.join(' × ') : 'Grand Total'
  const aggLabel = getAggregationLabel(descriptor.aggregation)
  const valueStr = descriptor.formattedValue !== '-'
    ? ` = ${descriptor.formattedValue}`
    : ''

  return `${slice} — ${aggLabel} of ${descriptor.valueField}${valueStr} · ${descriptor.rowCount} rows`
})

function prevPage() {
  if (currentPage.value > 1)
    currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value)
    currentPage.value++
}

function handleExport() {
  if (!props.result || props.result.rows.length === 0)
    return
  exportToCSV(props.result.rows, columns.value, { filename: 'drill-through.csv' })
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  return String(value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="vpg-modal-overlay" :class="`vpg-theme-${theme ?? 'light'}`" @click.self="emit('close')">
      <div class="vpg-modal vpg-drill-modal">
        <div class="vpg-modal-header">
          <h3 class="vpg-drill-title">
            {{ modalTitle }}
          </h3>
          <button class="vpg-modal-close" @click="emit('close')">
            ×
          </button>
        </div>

        <div class="vpg-modal-body vpg-drill-body">
          <div v-if="!result || result.rows.length === 0" class="vpg-drill-empty">
            No source rows found for this cell.
          </div>

          <template v-else>
            <div class="vpg-drill-table-wrapper">
              <table class="vpg-drill-table">
                <thead>
                  <tr>
                    <th v-for="col in columns" :key="col">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIdx) in pageRows" :key="rowIdx">
                    <td v-for="col in columns" :key="col">
                      {{ formatCellValue(row[col]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="totalPages > 1" class="vpg-drill-pagination">
              <button
                class="vpg-page-btn"
                :disabled="currentPage === 1"
                @click="prevPage"
              >
                ←
              </button>
              <span>Page {{ currentPage }} of {{ totalPages }}</span>
              <button
                class="vpg-page-btn"
                :disabled="currentPage === totalPages"
                @click="nextPage"
              >
                →
              </button>
            </div>
          </template>
        </div>

        <div class="vpg-modal-footer">
          <button
            v-if="result && result.rows.length > 0"
            class="vpg-btn vpg-btn-secondary"
            @click="handleExport"
          >
            Export CSV
          </button>
          <button class="vpg-btn vpg-btn-primary" @click="emit('close')">
            Close
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vpg-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

.vpg-modal {
  background: var(--vpg-surface-bg);
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.vpg-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vpg-border-default);
  background: var(--vpg-surface-panel);
  gap: 1rem;
}

.vpg-drill-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vpg-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.vpg-modal-close {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: var(--vpg-text-secondary);
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.vpg-modal-close:hover {
  background: var(--vpg-border-default);
  color: var(--vpg-text-primary);
}

.vpg-modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.vpg-drill-body {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.vpg-drill-empty {
  padding: 2rem;
  text-align: center;
  color: var(--vpg-text-secondary);
  font-size: 0.875rem;
}

.vpg-drill-table-wrapper {
  overflow: auto;
  flex: 1;
}

.vpg-drill-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.vpg-drill-table th {
  padding: 0.375rem 0.75rem;
  text-align: left;
  font-weight: 600;
  background: var(--vpg-surface-panel);
  border-bottom: 2px solid var(--vpg-border-default);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}

.vpg-drill-table td {
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--vpg-border-subtle);
  white-space: nowrap;
}

.vpg-drill-table tr:nth-child(even) td {
  background: var(--vpg-surface-striped);
}

.vpg-drill-pagination {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  font-size: 0.75rem;
  color: var(--vpg-text-secondary);
  border-top: 1px solid var(--vpg-border-subtle);
}

.vpg-page-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background: var(--vpg-surface-elevated);
  color: var(--vpg-text-primary);
  border: 1px solid var(--vpg-border-strong);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-page-btn:hover:not(:disabled) {
  background: var(--vpg-surface-hover);
}

.vpg-page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vpg-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--vpg-border-default);
  background: var(--vpg-surface-panel);
}

.vpg-btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-btn-secondary {
  background: var(--vpg-surface-elevated);
  color: var(--vpg-text-primary);
  border: 1px solid var(--vpg-border-strong);
}

.vpg-btn-secondary:hover {
  background: var(--vpg-surface-hover);
}

.vpg-btn-primary {
  background: var(--vpg-accent);
  color: var(--vpg-text-inverse);
  border: 1px solid var(--vpg-accent);
}

.vpg-btn-primary:hover {
  background: var(--vpg-accent-hover);
  border-color: var(--vpg-accent-hover);
}
</style>
