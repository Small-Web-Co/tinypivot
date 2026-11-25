<script setup lang="ts">
/**
 * Dashboard filters: one control per field, above every view, so the grid, pivot and chart can be
 * narrowed without opening the grid's column headers. Each opens the same filter as its header.
 */
import { computed } from 'vue'

export interface FilterBarField {
  field: string
  /** What the filter is set to, or null when it lets every row through. */
  summary: string | null
}

const props = defineProps<{
  fields: FilterBarField[]
  filteredRowCount: number
  totalRowCount: number
}>()

const emit = defineEmits<{
  (e: 'open', field: string, event: MouseEvent): void
  (e: 'clear'): void
}>()

const active = computed(() => props.fields.some(field => field.summary !== null))
</script>

<template>
  <div class="vpg-filter-bar" role="toolbar" aria-label="Filters">
    <button
      v-for="item in fields"
      :key="item.field"
      type="button"
      class="vpg-filter-chip"
      :class="{ 'vpg-filter-chip-active': item.summary !== null }"
      aria-haspopup="dialog"
      @click="emit('open', item.field, $event)"
    >
      <span class="vpg-filter-chip-field">{{ item.field }}</span>
      <span class="vpg-filter-chip-value">{{ item.summary ?? 'All' }}</span>
      <svg class="vpg-filter-chip-caret" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <template v-if="active">
      <span class="vpg-filter-bar-count">{{ filteredRowCount.toLocaleString() }} of {{ totalRowCount.toLocaleString() }} rows</span>
      <button type="button" class="vpg-filter-bar-clear" @click="emit('clear')">
        Clear
      </button>
    </template>
  </div>
</template>
