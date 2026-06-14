<script setup lang="ts">
/**
 * Export dropdown menu component
 * Renders a single "Export ▾" button that opens a list of format options.
 * Disabled items are shown greyed with an optional badge, but cannot be selected.
 */
import { onMounted, onUnmounted, ref } from 'vue'

export interface ExportFormat {
  key: string
  label: string
  disabled?: boolean
  badge?: string
}

const { label = 'Export', formats } = defineProps<{
  label?: string
  formats: ExportFormat[]
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const isOpen = ref(false)
const wrapperRef = ref<HTMLDivElement>()

function toggle() {
  isOpen.value = !isOpen.value
}

function select(format: ExportFormat) {
  if (format.disabled)
    return
  isOpen.value = false
  emit('select', format.key)
}

function handleClickOutside(event: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="wrapperRef" class="vpg-export-menu">
    <button
      class="vpg-export-btn"
      :class="{ 'vpg-export-btn--open': isOpen }"
      @click="toggle"
    >
      <svg class="vpg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {{ label }}
      <svg class="vpg-icon-xs vpg-export-caret" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="isOpen" class="vpg-export-dropdown">
      <button
        v-for="format in formats"
        :key="format.key"
        class="vpg-export-item"
        :class="{ 'vpg-export-item--disabled': format.disabled }"
        :disabled="format.disabled"
        @click="select(format)"
      >
        <span class="vpg-export-item-label">{{ format.label }}</span>
        <span v-if="format.badge" class="vpg-pro-badge">{{ format.badge }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.vpg-export-menu {
  position: relative;
  display: inline-flex;
}

.vpg-export-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vpg-accent);
  background: var(--vpg-accent-soft-bg);
  border: 1px solid var(--vpg-accent);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-export-btn:hover,
.vpg-export-btn--open {
  background: var(--vpg-accent);
  color: var(--vpg-text-inverse);
}

.vpg-export-caret {
  margin-left: 0.125rem;
  transition: transform 0.15s;
}

.vpg-export-btn--open .vpg-export-caret {
  transform: rotate(180deg);
}

.vpg-export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 200;
  background: var(--vpg-surface-elevated);
  border: 1px solid var(--vpg-border-default);
  border-radius: 0.375rem;
  box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.15), 0 4px 10px -5px rgb(0 0 0 / 0.1);
  min-width: 160px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.vpg-export-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vpg-text-primary);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
  width: 100%;
}

.vpg-export-item:hover:not(.vpg-export-item--disabled) {
  background: var(--vpg-surface-hover);
}

.vpg-export-item--disabled {
  color: var(--vpg-text-muted);
  cursor: not-allowed;
  opacity: 0.7;
}

.vpg-export-item-label {
  flex: 1;
  text-align: left;
}

.vpg-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.vpg-icon-xs {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
}

.vpg-pro-badge {
  display: inline-flex;
  padding: 0.0625rem 0.25rem;
  font-size: 0.5625rem;
  font-weight: 600;
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
  color: white;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  flex-shrink: 0;
}
</style>
