<script setup lang="ts">
/**
 * TinyPivot Studio Vue Component
 * Main entry point for the TinyPivot Studio page builder
 */
import type { DatasourceConfig, Page, StorageAdapter, WidgetConfig } from '@smallwebco/tinypivot-studio'
import { provideStudio, type StudioConfig } from '../composables'

/**
 * Props for TinyPivotStudio component
 */
export interface TinyPivotStudioProps {
  /** User ID from your auth system */
  userId?: string
  /** Storage adapter for persisting pages and widgets */
  storage?: StorageAdapter
  /** Data source configuration (e.g., Snowflake endpoint) */
  datasource?: DatasourceConfig
  /** AI Analyst configuration */
  aiAnalyst?: {
    endpoint: string
    apiKey?: string
  }
  /** Cache configuration */
  cache?: {
    enabled: boolean
    maxAge?: '1h' | '24h' | '1d' | '1w'
    storage?: 'indexeddb' | 'server'
  }
  /** Enable sample data mode for demos */
  sampleData?: boolean
}

const props = defineProps<TinyPivotStudioProps>()

const emit = defineEmits<{
  /** Emitted when a page is saved */
  pageSave: [page: Page]
  /** Emitted when a widget is saved */
  widgetSave: [widget: WidgetConfig]
}>()

// Provide studio context to child components
const config: StudioConfig = {
  userId: props.userId,
  storage: props.storage,
  datasource: props.datasource,
  aiAnalyst: props.aiAnalyst,
  cache: props.cache,
  sampleData: props.sampleData,
}

provideStudio(config)

/**
 * Handle page save - called by child components when a page is saved
 */
function handlePageSave(page: Page) {
  emit('pageSave', page)
}

/**
 * Handle widget save - called by child components when a widget is saved
 */
function handleWidgetSave(widget: WidgetConfig) {
  emit('widgetSave', widget)
}

// Expose save handlers for child components
defineExpose({
  handlePageSave,
  handleWidgetSave,
})
</script>

<template>
  <div class="tinypivot-studio">
    <aside class="tinypivot-studio-sidebar">
      <div class="tinypivot-studio-sidebar-section">
        Pages
      </div>
      <div class="tinypivot-studio-sidebar-section">
        Widgets
      </div>
    </aside>
    <main class="tinypivot-studio-main">
      <div class="tinypivot-studio-empty">
        <h2>TinyPivot Studio</h2>
        <p>You don't have any pages yet.</p>
        <button type="button">
          + Create your first page
        </button>
        <div class="tinypivot-studio-empty-links">
          <button type="button">
            Connect to Snowflake
          </button>
          <button type="button">
            Try with sample data
          </button>
          <button type="button">
            Watch quick tutorial
          </button>
          <button type="button">
            Read the docs
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.tinypivot-studio {
  display: flex;
  height: 100%;
  min-height: 400px;
}

.tinypivot-studio-sidebar {
  width: 240px;
  border-right: 1px solid #e2e8f0;
  padding: 16px;
}

.tinypivot-studio-sidebar-section {
  padding: 8px 0;
  font-weight: 500;
  color: #64748b;
}

.tinypivot-studio-main {
  flex: 1;
  padding: 24px;
}

.tinypivot-studio-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.tinypivot-studio-empty h2 {
  margin-bottom: 8px;
  font-size: 1.5rem;
  font-weight: 600;
}

.tinypivot-studio-empty p {
  color: #6b7280;
  margin-bottom: 16px;
}

.tinypivot-studio-empty button {
  cursor: pointer;
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.tinypivot-studio-empty button:hover {
  background: #f1f5f9;
}

.tinypivot-studio-empty-links {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
  justify-content: center;
}

.tinypivot-studio-empty-links button {
  padding: 6px 12px;
  font-size: 0.75rem;
  color: #3b82f6;
  background: transparent;
  border: none;
}

.tinypivot-studio-empty-links button:hover {
  text-decoration: underline;
  background: transparent;
}
</style>
