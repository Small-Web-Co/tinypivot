<script setup lang="ts">
import type { NumericRange } from '@smallwebco/tinypivot-core'
/**
 * Numeric Range Filter Component
 * Provides an intuitive dual-handle slider and input fields for filtering numeric data
 */
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  dataMin: number
  dataMax: number
  currentRange: NumericRange | null
}>()

const emit = defineEmits<{
  change: [range: NumericRange | null]
}>()

// Local state for the range values
const localMin = ref<number | null>(props.currentRange?.min ?? null)
const localMax = ref<number | null>(props.currentRange?.max ?? null)

// Calculate step based on data range
const step = computed(() => {
  const range = props.dataMax - props.dataMin
  if (range === 0)
    return 1
  if (range <= 1)
    return 0.01
  if (range <= 10)
    return 0.1
  if (range <= 100)
    return 1
  if (range <= 1000)
    return 10
  return 10 ** (Math.floor(Math.log10(range)) - 2)
})

// Format numbers for display
function formatValue(val: number | null): string {
  if (val === null)
    return ''
  if (Number.isInteger(val))
    return val.toLocaleString()
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// Check if filter is active
const isFilterActive = computed(() => {
  return localMin.value !== null || localMax.value !== null
})

// Calculate slider percentages for visual representation
const minPercent = computed(() => {
  if (localMin.value === null || props.dataMax === props.dataMin)
    return 0
  return ((localMin.value - props.dataMin) / (props.dataMax - props.dataMin)) * 100
})

const maxPercent = computed(() => {
  if (localMax.value === null || props.dataMax === props.dataMin)
    return 100
  return ((localMax.value - props.dataMin) / (props.dataMax - props.dataMin)) * 100
})

// Handle min slider change
function handleMinSlider(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number.parseFloat(target.value)

  // Ensure min doesn't exceed max
  if (localMax.value !== null && value > localMax.value) {
    localMin.value = localMax.value
  }
  else {
    localMin.value = value
  }
}

// Handle max slider change
function handleMaxSlider(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number.parseFloat(target.value)

  // Ensure max doesn't go below min
  if (localMin.value !== null && value < localMin.value) {
    localMax.value = localMin.value
  }
  else {
    localMax.value = value
  }
}

// Handle min input change
function handleMinInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value === '' ? null : Number.parseFloat(target.value)

  if (value !== null && !Number.isNaN(value)) {
    // Clamp to data bounds
    localMin.value = Math.max(props.dataMin, Math.min(value, localMax.value ?? props.dataMax))
  }
  else if (value === null) {
    localMin.value = null
  }
}

// Handle max input change
function handleMaxInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.value === '' ? null : Number.parseFloat(target.value)

  if (value !== null && !Number.isNaN(value)) {
    // Clamp to data bounds
    localMax.value = Math.min(props.dataMax, Math.max(value, localMin.value ?? props.dataMin))
  }
  else if (value === null) {
    localMax.value = null
  }
}

// Clear the filter
function clearFilter() {
  localMin.value = null
  localMax.value = null
  emitChange()
}

// Set to full range
function setFullRange() {
  localMin.value = props.dataMin
  localMax.value = props.dataMax
  emitChange()
}

// Emit change
function emitChange() {
  if (localMin.value === null && localMax.value === null) {
    emit('change', null)
  }
  else {
    emit('change', { min: localMin.value, max: localMax.value })
  }
}

// Sync with props
watch(() => props.currentRange, (newRange) => {
  localMin.value = newRange?.min ?? null
  localMax.value = newRange?.max ?? null
}, { immediate: true })
</script>

<template>
  <div class="vpg-range-filter">
    <!-- Data range info -->
    <div class="vpg-range-info">
      <span class="vpg-range-label">Data range:</span>
      <span class="vpg-range-bounds">{{ formatValue(dataMin) }} – {{ formatValue(dataMax) }}</span>
    </div>

    <!-- Dual slider track -->
    <div class="vpg-slider-container">
      <div class="vpg-slider-track">
        <div
          class="vpg-slider-fill"
          :style="{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }"
        />
      </div>

      <!-- Min slider (lower handle) -->
      <input
        type="range"
        class="vpg-slider vpg-slider-min"
        :min="dataMin"
        :max="dataMax"
        :step="step"
        :value="localMin ?? dataMin"
        @input="handleMinSlider"
        @change="emitChange"
      >

      <!-- Max slider (upper handle) -->
      <input
        type="range"
        class="vpg-slider vpg-slider-max"
        :min="dataMin"
        :max="dataMax"
        :step="step"
        :value="localMax ?? dataMax"
        @input="handleMaxSlider"
        @change="emitChange"
      >
    </div>

    <!-- Input fields for precise entry -->
    <div class="vpg-range-inputs">
      <div class="vpg-input-group">
        <label class="vpg-input-label">Min</label>
        <input
          type="number"
          class="vpg-range-input"
          :placeholder="formatValue(dataMin)"
          :value="localMin ?? ''"
          :step="step"
          @input="handleMinInput"
          @change="emitChange"
        >
      </div>
      <span class="vpg-input-separator">to</span>
      <div class="vpg-input-group">
        <label class="vpg-input-label">Max</label>
        <input
          type="number"
          class="vpg-range-input"
          :placeholder="formatValue(dataMax)"
          :value="localMax ?? ''"
          :step="step"
          @input="handleMaxInput"
          @change="emitChange"
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

    <!-- Current filter display -->
    <div v-if="isFilterActive" class="vpg-filter-summary">
      <svg class="vpg-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
      <span>
        Showing values
        <strong>{{ localMin !== null ? `≥ ${formatValue(localMin)}` : '' }}</strong>
        {{ localMin !== null && localMax !== null ? ' and ' : '' }}
        <strong>{{ localMax !== null ? `≤ ${formatValue(localMax)}` : '' }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.vpg-range-filter {
  padding: 0.5rem;
}

.vpg-range-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.6875rem;
}

.vpg-range-label {
  color: #64748b;
}

.vpg-range-bounds {
  font-weight: 500;
  color: #334155;
  background: #f1f5f9;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

/* Slider container with dual handles */
.vpg-slider-container {
  position: relative;
  height: 24px;
  margin: 0.75rem 0;
}

.vpg-slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  transform: translateY(-50%);
}

.vpg-slider-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 2px;
  transition: left 0.1s, right 0.1s;
}

.vpg-slider {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  pointer-events: none;
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}

.vpg-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  border: 2px solid #6366f1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.vpg-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.4);
}

.vpg-slider::-webkit-slider-thumb:active {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.5);
}

.vpg-slider::-moz-range-thumb {
  pointer-events: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  border: 2px solid #6366f1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.vpg-slider::-moz-range-thumb:hover {
  transform: scale(1.15);
}

.vpg-slider-min {
  z-index: 1;
}

.vpg-slider-max {
  z-index: 2;
}

/* Input fields */
.vpg-range-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.vpg-input-group {
  flex: 1;
}

.vpg-input-label {
  display: block;
  font-size: 0.625rem;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 0.125rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.vpg-range-input {
  width: 100%;
  padding: 0.375rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.25rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.vpg-range-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.vpg-range-input::placeholder {
  color: #94a3b8;
}

/* Hide number input spinners */
.vpg-range-input::-webkit-outer-spin-button,
.vpg-range-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.vpg-range-input[type="number"] {
  -moz-appearance: textfield;
}

.vpg-input-separator {
  color: #94a3b8;
  font-size: 0.6875rem;
  padding-top: 1rem;
}

/* Action buttons */
.vpg-range-actions {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.vpg-range-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-range-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}

.vpg-range-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vpg-icon-xs {
  width: 0.75rem;
  height: 0.75rem;
}

/* Filter summary */
.vpg-filter-summary {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  background: #eef2ff;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  color: #4338ca;
}

.vpg-filter-summary strong {
  font-weight: 600;
}
</style>
