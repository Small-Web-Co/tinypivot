<script setup lang="ts">
/**
 * Column Filter Dropdown Component
 * Shows unique values with checkboxes, search, and sort controls
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ColumnStats } from '../types'

const props = defineProps<{
  columnId: string
  columnName: string
  stats: ColumnStats
  selectedValues: string[]
  sortDirection: 'asc' | 'desc' | null
}>()

const emit = defineEmits<{
  filter: [values: string[]]
  sort: [direction: 'asc' | 'desc' | null]
  close: []
}>()

// Local state
const searchQuery = ref('')
const dropdownRef = ref<HTMLDivElement>()
const searchInputRef = ref<HTMLInputElement>()

// Get all possible values including blank
const allPossibleValues = computed(() => {
  const values = [...props.stats.uniqueValues]
  if (props.stats.nullCount > 0) {
    values.unshift('(blank)')
  }
  return values
})

// Initialize with selected values
const localSelected = ref<Set<string>>(new Set(props.selectedValues))

// Include blank option if there are null values
const hasBlankValues = computed(() => props.stats.nullCount > 0)

// Filtered unique values based on search
const filteredValues = computed(() => {
  const values = props.stats.uniqueValues
  if (!searchQuery.value)
    return values

  const query = searchQuery.value.toLowerCase()
  return values.filter(v => v.toLowerCase().includes(query))
})

// All values including blank
const allValues = computed(() => {
  const values = [...filteredValues.value]
  if (hasBlankValues.value && (!searchQuery.value || '(blank)'.includes(searchQuery.value.toLowerCase()))) {
    values.unshift('(blank)')
  }
  return values
})

// Check states
const isAllSelected = computed(() => {
  return allValues.value.every(v => localSelected.value.has(v))
})

const isNoneSelected = computed(() => {
  return localSelected.value.size === 0
})

// Toggle single value
function toggleValue(value: string) {
  if (localSelected.value.has(value)) {
    localSelected.value.delete(value)
  }
  else {
    localSelected.value.add(value)
  }
  localSelected.value = new Set(localSelected.value)
}

// Select all visible
function selectAll() {
  for (const value of allValues.value) {
    localSelected.value.add(value)
  }
  localSelected.value = new Set(localSelected.value)
}

// Clear all
function clearAll() {
  localSelected.value.clear()
  localSelected.value = new Set(localSelected.value)
}

// Apply filter
function applyFilter() {
  if (localSelected.value.size === 0) {
    emit('filter', [])
  }
  else {
    emit('filter', Array.from(localSelected.value))
  }
  emit('close')
}

// Sort handlers
function sortAscending() {
  emit('sort', props.sortDirection === 'asc' ? null : 'asc')
}

function sortDescending() {
  emit('sort', props.sortDirection === 'desc' ? null : 'desc')
}

// Clear filter only
function clearFilter() {
  localSelected.value.clear()
  localSelected.value = new Set(localSelected.value)
  emit('filter', [])
  emit('close')
}

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

// Keyboard handling
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
  else if (event.key === 'Enter' && event.ctrlKey) {
    applyFilter()
  }
}

// Focus search on mount
onMounted(() => {
  nextTick(() => {
    searchInputRef.value?.focus()
  })
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})

// Sync with props
watch(() => props.selectedValues, (newValues) => {
  localSelected.value = new Set(newValues)
}, { immediate: true })
</script>

<template>
  <div ref="dropdownRef" class="vpg-filter-dropdown">
    <!-- Header -->
    <div class="vpg-filter-header">
      <span class="vpg-filter-title">{{ columnName }}</span>
      <span class="vpg-filter-count">
        {{ stats.uniqueValues.length.toLocaleString() }} unique
      </span>
    </div>

    <!-- Sort Controls -->
    <div class="vpg-sort-controls">
      <button
        class="vpg-sort-btn"
        :class="{ active: sortDirection === 'asc' }"
        title="Sort A to Z"
        @click="sortAscending"
      >
        <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
        <span>A→Z</span>
      </button>
      <button
        class="vpg-sort-btn"
        :class="{ active: sortDirection === 'desc' }"
        title="Sort Z to A"
        @click="sortDescending"
      >
        <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        <span>Z→A</span>
      </button>
    </div>

    <div class="vpg-divider" />

    <!-- Search -->
    <div class="vpg-search-container">
      <svg class="vpg-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Search values..."
        class="vpg-search-input"
      >
      <button v-if="searchQuery" class="vpg-clear-search" @click="searchQuery = ''">
        ×
      </button>
    </div>

    <!-- Select All / Clear All -->
    <div class="vpg-bulk-actions">
      <button class="vpg-bulk-btn" @click="selectAll">
        <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Select All
      </button>
      <button class="vpg-bulk-btn" @click="clearAll">
        <svg class="vpg-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear All
      </button>
    </div>

    <!-- Values List -->
    <div class="vpg-values-list">
      <label
        v-for="value in allValues"
        :key="value"
        class="vpg-value-item"
        :class="{ selected: localSelected.has(value) }"
      >
        <input
          type="checkbox"
          :checked="localSelected.has(value)"
          class="vpg-value-checkbox"
          @change="toggleValue(value)"
        >
        <span class="vpg-value-text" :class="{ 'vpg-blank': value === '(blank)' }">
          {{ value }}
        </span>
      </label>

      <div v-if="allValues.length === 0" class="vpg-no-results">
        No matching values
      </div>
    </div>

    <!-- Footer -->
    <div class="vpg-filter-footer">
      <button class="vpg-btn-clear" @click="clearFilter">
        Clear Filter
      </button>
      <button class="vpg-btn-apply" @click="applyFilter">
        Apply
      </button>
    </div>
  </div>
</template>

<style scoped>
.vpg-filter-dropdown {
  position: absolute;
  z-index: 50;
  background: white;
  border-radius: 0.375rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
  border: 1px solid #e2e8f0;
  min-width: 220px;
  max-width: 280px;
  top: 100%;
  left: 0;
  margin-top: 2px;
  max-height: calc(100vh - 100px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.vpg-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-radius: 0.375rem 0.375rem 0 0;
}

.vpg-filter-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vpg-filter-count {
  font-size: 0.625rem;
  color: #64748b;
}

.vpg-sort-controls {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  background: #f8fafc;
}

.vpg-sort-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  border-radius: 0.25rem;
  color: #475569;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-sort-btn:hover {
  background: #e2e8f0;
}

.vpg-sort-btn.active {
  background: #e0e7ff;
  color: #4338ca;
}

.vpg-icon-sm {
  width: 0.75rem;
  height: 0.75rem;
}

.vpg-divider {
  height: 1px;
  background: #e2e8f0;
}

.vpg-search-container {
  position: relative;
  padding: 0.375rem 0.5rem;
}

.vpg-search-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
  color: #94a3b8;
}

.vpg-search-input {
  width: 100%;
  padding: 0.25rem 1.5rem 0.25rem 1.75rem;
  font-size: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.25rem;
  outline: none;
}

.vpg-search-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1;
}

.vpg-clear-search {
  position: absolute;
  right: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.875rem;
  line-height: 1;
  background: transparent;
  border: none;
  cursor: pointer;
}

.vpg-clear-search:hover {
  color: #475569;
}

.vpg-bulk-actions {
  display: flex;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid #f1f5f9;
}

.vpg-bulk-btn {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 500;
  color: #475569;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-bulk-btn:hover {
  color: #4f46e5;
  background: #eef2ff;
}

.vpg-values-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0.125rem 0.25rem;
  flex: 1;
  min-height: 0;
}

.vpg-value-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background 0.15s;
}

.vpg-value-item:hover {
  background: #f1f5f9;
}

.vpg-value-item.selected {
  background: #eef2ff;
}

.vpg-value-checkbox {
  width: 0.875rem;
  height: 0.875rem;
  accent-color: #4f46e5;
  border-radius: 0.25rem;
}

.vpg-value-text {
  font-size: 0.75rem;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.vpg-value-text.vpg-blank {
  font-style: italic;
  color: #94a3b8;
}

.vpg-no-results {
  text-align: center;
  padding: 0.75rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.vpg-filter-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.625rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  border-radius: 0 0 0.375rem 0.375rem;
}

.vpg-btn-clear {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #475569;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-btn-clear:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.vpg-btn-apply {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: white;
  background: #4f46e5;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}

.vpg-btn-apply:hover {
  background: #4338ca;
}
</style>

