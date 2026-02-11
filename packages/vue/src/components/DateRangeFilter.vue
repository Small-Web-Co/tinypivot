<script setup lang="ts">
import type { DateFormat, DateRange } from '@smallwebco/tinypivot-core'
import { formatDate, getDatePlaceholder, parseDateInput } from '@smallwebco/tinypivot-core'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  dataMin: string // ISO date string
  dataMax: string // ISO date string
  currentRange: DateRange | null
  dateFormat?: DateFormat
}>()

const emit = defineEmits<{
  change: [range: DateRange | null]
}>()

const format = computed(() => props.dateFormat ?? 'iso')

// Local state
const localMinText = ref('')
const localMaxText = ref('')
const minError = ref(false)
const maxError = ref(false)

// Initialize from props
function initFromRange(range: DateRange | null) {
  if (range?.min) {
    localMinText.value = formatDate(range.min, format.value)
  }
  else {
    localMinText.value = ''
  }
  if (range?.max) {
    localMaxText.value = formatDate(range.max, format.value)
  }
  else {
    localMaxText.value = ''
  }
  minError.value = false
  maxError.value = false
}

// Display formatted data bounds
const formattedMin = computed(() => formatDate(props.dataMin, format.value))
const formattedMax = computed(() => formatDate(props.dataMax, format.value))

const isFilterActive = computed(() => localMinText.value !== '' || localMaxText.value !== '')

function handleMinInput() {
  if (localMinText.value === '') {
    minError.value = false
    emitChange()
    return
  }
  const parsed = parseDateInput(localMinText.value, format.value)
  minError.value = parsed === null
  if (!minError.value)
    emitChange()
}

function handleMaxInput() {
  if (localMaxText.value === '') {
    maxError.value = false
    emitChange()
    return
  }
  const parsed = parseDateInput(localMaxText.value, format.value)
  maxError.value = parsed === null
  if (!maxError.value)
    emitChange()
}

function emitChange() {
  const min = localMinText.value ? parseDateInput(localMinText.value, format.value) : null
  const max = localMaxText.value ? parseDateInput(localMaxText.value, format.value) : null
  if (min === null && max === null) {
    emit('change', null)
  }
  else {
    emit('change', { min, max })
  }
}

function clearFilter() {
  localMinText.value = ''
  localMaxText.value = ''
  minError.value = false
  maxError.value = false
  emit('change', null)
}

function setFullRange() {
  localMinText.value = formatDate(props.dataMin, format.value)
  localMaxText.value = formatDate(props.dataMax, format.value)
  minError.value = false
  maxError.value = false
  emit('change', { min: props.dataMin, max: props.dataMax })
}

watch(() => props.currentRange, (newRange) => {
  initFromRange(newRange)
}, { immediate: true })
</script>

<template>
  <div class="vpg-range-filter">
    <!-- Data range info -->
    <div class="vpg-range-info">
      <span class="vpg-range-label">Data range:</span>
      <span class="vpg-range-bounds">{{ formattedMin }} – {{ formattedMax }}</span>
    </div>

    <!-- Input fields -->
    <div class="vpg-range-inputs">
      <div class="vpg-input-group">
        <label class="vpg-input-label">From</label>
        <input
          v-model="localMinText"
          type="text"
          class="vpg-range-input"
          :class="{ 'vpg-input-error': minError }"
          :placeholder="getDatePlaceholder(format)"
          @blur="handleMinInput"
          @keyup.enter="handleMinInput"
        >
      </div>
      <span class="vpg-input-separator">to</span>
      <div class="vpg-input-group">
        <label class="vpg-input-label">To</label>
        <input
          v-model="localMaxText"
          type="text"
          class="vpg-range-input"
          :class="{ 'vpg-input-error': maxError }"
          :placeholder="getDatePlaceholder(format)"
          @blur="handleMaxInput"
          @keyup.enter="handleMaxInput"
        >
      </div>
    </div>

    <!-- Quick actions -->
    <div class="vpg-range-actions">
      <button
        class="vpg-range-btn"
        :disabled="!isFilterActive"
        @click="clearFilter"
      >
        <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear
      </button>
      <button class="vpg-range-btn" @click="setFullRange">
        <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        Full Range
      </button>
    </div>

    <!-- Filter summary -->
    <div v-if="isFilterActive && !minError && !maxError" class="vpg-filter-summary">
      <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
      <span>
        Showing dates
        <strong v-if="localMinText">from {{ localMinText }}</strong>
        {{ localMinText && localMaxText ? ' ' : '' }}
        <strong v-if="localMaxText">to {{ localMaxText }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.vpg-range-filter { padding: 0.5rem; }
.vpg-range-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; font-size: 0.6875rem; }
.vpg-range-label { color: #64748b; }
.vpg-range-bounds { font-weight: 500; color: #334155; background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
.vpg-range-inputs { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.vpg-input-group { flex: 1; }
.vpg-input-label { display: block; font-size: 0.625rem; font-weight: 500; color: #64748b; margin-bottom: 0.125rem; text-transform: uppercase; letter-spacing: 0.025em; }
.vpg-range-input { width: 100%; padding: 0.375rem 0.5rem; font-size: 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
.vpg-range-input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
.vpg-range-input::placeholder { color: #94a3b8; }
.vpg-range-input.vpg-input-error { border-color: #ef4444; }
.vpg-range-input.vpg-input-error:focus { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15); }
.vpg-input-separator { color: #94a3b8; font-size: 0.6875rem; padding-top: 1rem; }
.vpg-range-actions { display: flex; gap: 0.375rem; margin-bottom: 0.5rem; }
.vpg-range-btn { display: flex; align-items: center; gap: 0.25rem; padding: 0.25rem 0.5rem; font-size: 0.6875rem; font-weight: 500; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.25rem; cursor: pointer; transition: all 0.15s; }
.vpg-range-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }
.vpg-range-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.vpg-icon-xs { width: 0.75rem; height: 0.75rem; }
.vpg-filter-summary { display: flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.5rem; background: #eef2ff; border-radius: 0.25rem; font-size: 0.6875rem; color: #4338ca; }
.vpg-filter-summary strong { font-weight: 600; }
</style>
