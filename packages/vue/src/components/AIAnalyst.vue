<script setup lang="ts">
/**
 * TinyPivot - AI Data Analyst Component
 * Split-panel layout: 1/4 chat, 3/4 data preview
 * Each query step shows data visually with expandable SQL
 */
import type {
  AIAnalystConfig,
  AIConversationUpdateEvent,
  AIDataLoadedEvent,
  AIErrorEvent,
  AIMessage,
  AIQueryExecutedEvent,
  AITableSchema,
} from '@smallwebco/tinypivot-core'
import { stripSQLFromContent } from '@smallwebco/tinypivot-core'
import { computed, nextTick, ref, watch } from 'vue'
import { useAIAnalyst } from '../composables/useAIAnalyst'

const props = defineProps<{
  config: AIAnalystConfig
  theme?: 'light' | 'dark'
}>()

const emit = defineEmits<{
  (e: 'dataLoaded', payload: AIDataLoadedEvent): void
  (e: 'conversationUpdate', payload: AIConversationUpdateEvent): void
  (e: 'queryExecuted', payload: AIQueryExecutedEvent): void
  (e: 'error', payload: AIErrorEvent): void
  (e: 'viewResults', payload: { data: Record<string, unknown>[], query: string }): void
}>()

const {
  messages,
  hasMessages,
  isLoading,
  isLoadingTables,
  error,
  schemas,
  selectedDataSource,
  selectedDataSourceInfo,
  lastLoadedData,
  dataSources,
  selectDataSource,
  sendMessage,
  clearConversation,
  loadFullData,
} = useAIAnalyst({
  config: props.config,
  onDataLoaded: payload => emit('dataLoaded', payload),
  onConversationUpdate: payload => emit('conversationUpdate', payload),
  onQueryExecuted: payload => emit('queryExecuted', payload),
  onError: payload => emit('error', payload),
})

// Expose loadFullData for parent component access
defineExpose({
  loadFullData,
  selectedDataSource,
})

// Input state
const inputText = ref('')
const searchQuery = ref('')
const messagesContainerRef = ref<HTMLDivElement>()

// Track which message's data is being viewed (null = latest)
const selectedMessageId = ref<string | null>(null)

// Track SQL panel visibility in the right pane
const showSqlPanel = ref(false)

// Track expanded schema groups (default: expand 'public')
const expandedSchemas = ref<Set<string>>(new Set(['public']))

// Group data sources by schema for tree view
const schemaTree = computed(() => {
  const tree: Record<string, typeof dataSources.value> = {}
  for (const ds of dataSources.value) {
    // Extract schema from the table identifier (e.g., "public.users" -> "public")
    const schema = ds.table?.includes('.')
      ? ds.table.split('.')[0]
      : 'default'
    if (!tree[schema])
      tree[schema] = []
    tree[schema].push(ds)
  }
  // Sort schemas: 'public' first, then alphabetically
  return Object.fromEntries(
    Object.entries(tree).sort(([a], [b]) => {
      if (a === 'public')
        return -1
      if (b === 'public')
        return 1
      return a.localeCompare(b)
    }),
  )
})

function toggleSchema(schemaName: string) {
  const newSet = new Set(expandedSchemas.value)
  if (newSet.has(schemaName)) {
    newSet.delete(schemaName)
  }
  else {
    newSet.add(schemaName)
  }
  expandedSchemas.value = newSet
}

// Get schema for selected data source
const currentSchema = computed((): AITableSchema | undefined => {
  if (!selectedDataSource.value)
    return undefined
  return schemas.value.get(selectedDataSource.value)
})

// Get data for the selected message (or latest)
const previewData = computed(() => {
  if (selectedMessageId.value) {
    const msg = messages.value.find(m => m.id === selectedMessageId.value)
    if (msg?.metadata?.data) {
      return msg.metadata.data.slice(0, 100)
    }
  }
  // Fall back to lastLoadedData
  if (!lastLoadedData.value)
    return []
  return lastLoadedData.value.slice(0, 100)
})

// Get full data for the selected message
const fullPreviewData = computed(() => {
  if (selectedMessageId.value) {
    const msg = messages.value.find(m => m.id === selectedMessageId.value)
    if (msg?.metadata?.data) {
      return msg.metadata.data
    }
  }
  return lastLoadedData.value || []
})

// Get column keys from preview data
const previewColumns = computed(() => {
  if (previewData.value.length > 0) {
    return Object.keys(previewData.value[0])
  }
  if (currentSchema.value) {
    return currentSchema.value.columns.map(c => c.name)
  }
  return []
})

// Get the selected message's query
const selectedQuery = computed(() => {
  if (selectedMessageId.value) {
    const msg = messages.value.find(m => m.id === selectedMessageId.value)
    return msg?.metadata?.query || ''
  }
  // Find the last message with data
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].metadata?.data) {
      return messages.value[i].metadata?.query || ''
    }
  }
  return ''
})

// Scroll to bottom when messages change
watch(messages, () => {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
  // Auto-select the latest message with data
  const latestWithData = [...messages.value].reverse().find(m => m.metadata?.data)
  if (latestWithData) {
    selectedMessageId.value = latestWithData.id
  }
}, { deep: true })

function handleSubmit() {
  if (!inputText.value.trim() || isLoading.value)
    return
  sendMessage(inputText.value)
  inputText.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

function handleViewResults() {
  if (fullPreviewData.value.length > 0) {
    emit('viewResults', { data: fullPreviewData.value, query: selectedQuery.value })
  }
}

function selectMessage(messageId: string) {
  const msg = messages.value.find(m => m.id === messageId)
  if (msg?.metadata?.data) {
    selectedMessageId.value = messageId
  }
}

function toggleSqlPanel() {
  showSqlPanel.value = !showSqlPanel.value
}

function copyToClipboard(text: string) {
  if (typeof window !== 'undefined' && window.navigator?.clipboard) {
    window.navigator.clipboard.writeText(text)
  }
}

function handleClearConversation() {
  clearConversation()
  searchQuery.value = ''
  selectedMessageId.value = null
  showSqlPanel.value = false
}

function handleChangeDataSource() {
  clearConversation()
  searchQuery.value = ''
  selectedMessageId.value = null
  showSqlPanel.value = false
}

function getColumnTypeIcon(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('int') || t.includes('float') || t.includes('decimal') || t.includes('number'))
    return '#'
  if (t.includes('date') || t.includes('time'))
    return 'D'
  if (t.includes('bool'))
    return '?'
  return 'T'
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
    return String(value)
  }
  return String(value)
}

function getMessageContent(message: AIMessage): string {
  // Strip SQL blocks and clean up markdown formatting
  return stripSQLFromContent(message.content)
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function autoResizeTextarea(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
}

function hasQueryResult(message: AIMessage): boolean {
  return !!message.metadata?.data && message.metadata.data.length > 0
}
</script>

<template>
  <div class="vpg-ai-analyst" :class="{ 'vpg-theme-dark': theme === 'dark' }">
    <!-- Data Source Picker (full width when no data source selected) -->
    <div v-if="!selectedDataSource" class="vpg-ai-picker-fullscreen">
      <div class="vpg-ai-picker-content">
        <div class="vpg-ai-picker-header">
          <div class="vpg-ai-icon-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
              <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <h2>AI Data Analyst</h2>
          <p>Select a data source to start exploring with AI</p>
        </div>

        <!-- Empty state -->
        <template v-if="dataSources.length === 0 && !isLoadingTables">
          <div class="vpg-ai-empty-state">
            <p>No data sources configured.</p>
            <a
              href="https://tinypivot.com/docs/ai-analyst"
              target="_blank"
              rel="noopener"
              class="vpg-ai-docs-link"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              View Documentation
            </a>
          </div>
        </template>

        <!-- Data source list (schema tree) -->
        <template v-else>
          <div class="vpg-ai-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search tables..."
              class="vpg-ai-search-input"
            >
          </div>

          <!-- Schema Tree -->
          <div class="vpg-ai-schema-tree">
            <div
              v-for="(tables, schemaName) in schemaTree"
              :key="schemaName"
              class="vpg-ai-schema-group"
            >
              <!-- Schema Header (expandable) -->
              <button
                type="button"
                class="vpg-ai-schema-header"
                @click="toggleSchema(schemaName as string)"
              >
                <svg
                  class="vpg-ai-chevron"
                  :class="{ expanded: expandedSchemas.has(schemaName as string) }"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <svg class="vpg-ai-schema-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
                <span class="vpg-ai-schema-name">{{ schemaName }}</span>
                <span class="vpg-ai-table-count">{{ tables.length }}</span>
              </button>

              <!-- Table List (collapsible) -->
              <div v-show="expandedSchemas.has(schemaName as string)" class="vpg-ai-table-list">
                <button
                  v-for="table in tables.filter(t =>
                    !searchQuery.trim()
                    || t.name.toLowerCase().includes(searchQuery.toLowerCase())
                    || t.table.toLowerCase().includes(searchQuery.toLowerCase()),
                  )"
                  :key="table.id"
                  type="button"
                  class="vpg-ai-table-item"
                  @click="selectDataSource(table.id)"
                >
                  <svg class="vpg-ai-table-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  <span>{{ table.name.includes('.') ? table.name.split('.')[1] : table.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="Object.keys(schemaTree).length === 0" class="vpg-ai-no-results">
            No tables available
          </div>
        </template>
      </div>
    </div>

    <!-- Split Layout: Chat (1/4) + Data Preview (3/4) -->
    <div v-else class="vpg-ai-split-layout">
      <!-- Left Panel: Chat -->
      <div class="vpg-ai-chat-panel">
        <!-- Chat Header -->
        <div class="vpg-ai-chat-header">
          <button
            class="vpg-ai-back-btn"
            title="Change data source"
            @click="handleChangeDataSource"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div class="vpg-ai-chat-title">
            <span class="vpg-ai-chat-name">{{ selectedDataSourceInfo?.name }}</span>
          </div>
          <button
            v-if="hasMessages"
            class="vpg-ai-clear-btn"
            title="Clear conversation"
            @click="handleClearConversation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>

        <!-- Messages -->
        <div ref="messagesContainerRef" class="vpg-ai-messages">
          <!-- Welcome message when no messages -->
          <div v-if="!hasMessages" class="vpg-ai-welcome">
            <p>Ask questions about your data</p>
            <div class="vpg-ai-suggestions">
              <button @click="sendMessage('Show me a summary of the data')">
                Summary
              </button>
              <button @click="sendMessage('Show me the top 10 records')">
                Top 10
              </button>
              <button @click="sendMessage('What are the trends?')">
                Trends
              </button>
            </div>
          </div>

          <!-- Message list -->
          <template v-for="message in messages" :key="message.id">
            <!-- User message -->
            <div
              v-if="message.role === 'user'"
              class="vpg-ai-msg vpg-ai-msg-user"
            >
              <span>{{ message.content }}</span>
            </div>

            <!-- Assistant message with query result -->
            <div
              v-else-if="hasQueryResult(message)"
              class="vpg-ai-msg vpg-ai-msg-result"
              :class="{ 'vpg-ai-msg-selected': selectedMessageId === message.id }"
              @click="selectMessage(message.id)"
            >
              <!-- Header with result badge and SQL button -->
              <div class="vpg-ai-result-header">
                <div class="vpg-ai-result-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>{{ message.metadata?.rowCount?.toLocaleString() }} rows</span>
                </div>
                <!-- SQL toggle button - toggles right pane SQL panel -->
                <button
                  v-if="message.metadata?.query"
                  class="vpg-ai-sql-toggle"
                  :class="{ 'vpg-ai-sql-expanded': showSqlPanel && selectedMessageId === message.id }"
                  title="View SQL query"
                  @click.stop="toggleSqlPanel()"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span>SQL</span>
                </button>
              </div>
              <!-- Full message content (insight from AI) -->
              <div class="vpg-ai-result-content">
                {{ getMessageContent(message) }}
              </div>
            </div>

            <!-- Assistant message without data (text only) -->
            <div
              v-else-if="message.role === 'assistant'"
              class="vpg-ai-msg vpg-ai-msg-assistant"
            >
              <div class="vpg-ai-assistant-content">
                {{ getMessageContent(message) }}
              </div>
              <!-- Error indicator -->
              <div v-if="message.metadata?.error" class="vpg-ai-msg-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Error
              </div>
            </div>
          </template>

          <!-- Loading indicator -->
          <div v-if="isLoading" class="vpg-ai-msg vpg-ai-msg-loading">
            <div class="vpg-ai-typing">
              <span /><span /><span />
            </div>
          </div>
        </div>

        <!-- Input Area with Controls -->
        <div class="vpg-ai-input-area">
          <form class="vpg-ai-input-form" @submit.prevent="handleSubmit">
            <textarea
              v-model="inputText"
              class="vpg-ai-input"
              placeholder="Ask about your data..."
              :disabled="isLoading"
              rows="1"
              @keydown="handleKeydown"
              @input="autoResizeTextarea"
            />
            <button
              type="submit"
              class="vpg-ai-send-btn"
              :disabled="!inputText.trim() || isLoading"
              title="Send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
          <!-- Action buttons and model info -->
          <div class="vpg-ai-input-footer">
            <span v-if="config.aiModelName" class="vpg-ai-model-name">
              {{ config.aiModelName }}
            </span>
            <div class="vpg-ai-input-actions">
              <button
                v-if="fullPreviewData.length > 0"
                class="vpg-ai-action-btn vpg-ai-action-primary"
                title="View in Grid tab"
                @click="handleViewResults"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                View in Grid
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Data Scratchpad -->
      <div class="vpg-ai-preview-panel">
        <!-- Header with schema -->
        <div class="vpg-ai-preview-header">
          <div class="vpg-ai-preview-title-row">
            <h3>{{ selectedDataSourceInfo?.name }}</h3>
            <div class="vpg-ai-preview-meta">
              <span v-if="fullPreviewData.length > 0" class="vpg-ai-preview-count">
                {{ fullPreviewData.length.toLocaleString() }} rows
              </span>
              <button
                v-if="selectedQuery"
                class="vpg-ai-preview-sql-btn"
                :class="{ 'vpg-ai-sql-active': showSqlPanel }"
                title="Toggle SQL query"
                @click="toggleSqlPanel()"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                SQL
              </button>
              <button
                v-if="fullPreviewData.length > 0"
                class="vpg-ai-preview-view-btn"
                title="View in Grid"
                @click="handleViewResults"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                View in Grid
              </button>
            </div>
          </div>
          <!-- Schema pills in preview header -->
          <div v-if="currentSchema" class="vpg-ai-schema-bar">
            <div
              v-for="col in currentSchema.columns"
              :key="col.name"
              class="vpg-ai-schema-chip"
              :title="`${col.name} (${col.type})`"
            >
              <span class="vpg-ai-chip-type">{{ getColumnTypeIcon(col.type) }}</span>
              <span class="vpg-ai-chip-name">{{ col.name }}</span>
            </div>
          </div>
        </div>

        <!-- SQL Panel (expandable, above the table) -->
        <div v-if="showSqlPanel && selectedQuery" class="vpg-ai-sql-panel">
          <div class="vpg-ai-sql-panel-header">
            <span class="vpg-ai-sql-panel-title">SQL Query</span>
            <div class="vpg-ai-sql-panel-actions">
              <button
                class="vpg-ai-copy-btn"
                title="Copy SQL"
                @click="copyToClipboard(selectedQuery)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <button
                class="vpg-ai-sql-panel-close"
                title="Close"
                @click="showSqlPanel = false"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <pre class="vpg-ai-sql-panel-code"><code>{{ selectedQuery }}</code></pre>
        </div>

        <!-- Loading state -->
        <div v-if="isLoading" class="vpg-ai-preview-loading">
          <div class="vpg-ai-preview-spinner" />
          <span>Running query...</span>
        </div>

        <!-- No data yet - show schema only state -->
        <div v-else-if="previewData.length === 0 && currentSchema" class="vpg-ai-preview-ready">
          <div class="vpg-ai-preview-ready-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
            </svg>
          </div>
          <p>Data source connected</p>
          <span>{{ currentSchema.columns.length }} columns available</span>
          <div class="vpg-ai-preview-hint">
            Ask a question to explore the data
          </div>
        </div>

        <!-- Error loading data -->
        <div v-else-if="error" class="vpg-ai-preview-empty vpg-ai-preview-error">
          <div class="vpg-ai-preview-empty-icon" style="background: #fee2e2;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p style="color: #ef4444;">
            {{ error }}
          </p>
        </div>

        <!-- No data yet (still loading) -->
        <div v-else-if="previewData.length === 0 && lastLoadedData === null" class="vpg-ai-preview-empty">
          <div class="vpg-ai-preview-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p>Loading data source...</p>
        </div>

        <!-- Empty table -->
        <div v-else-if="previewData.length === 0" class="vpg-ai-preview-empty">
          <div class="vpg-ai-preview-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p>No data in this table</p>
        </div>

        <!-- Data table -->
        <div v-else class="vpg-ai-preview-table-container">
          <table class="vpg-ai-preview-table">
            <thead>
              <tr>
                <th v-for="col in previewColumns" :key="col">
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in previewData" :key="idx">
                <td v-for="col in previewColumns" :key="col">
                  {{ formatCellValue(row[col]) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="fullPreviewData.length > 100" class="vpg-ai-preview-more">
            Showing 100 of {{ fullPreviewData.length.toLocaleString() }} rows.
            <button @click="handleViewResults">
              View all in Grid
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vpg-ai-analyst {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Full-screen picker */
.vpg-ai-picker-fullscreen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.vpg-ai-picker-content {
  max-width: 600px;
  width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vpg-ai-picker-header {
  text-align: center;
  margin-bottom: 2rem;
  flex-shrink: 0;
}

.vpg-ai-icon-lg {
  width: 4rem;
  height: 4rem;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin: 0 auto 1rem;
}

.vpg-ai-icon-lg svg {
  width: 2rem;
  height: 2rem;
}

.vpg-ai-picker-header h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1e293b;
}

.vpg-ai-picker-header p {
  margin: 0;
  color: #64748b;
}

/* Search */
.vpg-ai-search {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.vpg-ai-search svg {
  width: 1.25rem;
  height: 1.25rem;
  color: #94a3b8;
  flex-shrink: 0;
}

.vpg-ai-search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.9375rem;
  color: #1e293b;
  background: transparent;
}

.vpg-ai-search-input::placeholder {
  color: #94a3b8;
}

/* Data source grid */
.vpg-ai-datasource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
  max-height: 400px;
  padding-right: 0.25rem;
}

.vpg-ai-datasource-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.vpg-ai-datasource-card:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.vpg-ai-datasource-icon {
  width: 2.25rem;
  height: 2.25rem;
  background: #eef2ff;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
  flex-shrink: 0;
}

.vpg-ai-datasource-icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.vpg-ai-datasource-info {
  flex: 1;
  min-width: 0;
}

.vpg-ai-datasource-name {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vpg-ai-datasource-desc {
  display: block;
  font-size: 0.6875rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vpg-ai-no-results,
.vpg-ai-empty-state {
  text-align: center;
  padding: 2rem;
  color: #94a3b8;
}

.vpg-ai-docs-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 0.375rem;
  text-decoration: none;
  transition: all 0.15s;
}

.vpg-ai-docs-link:hover {
  background: #e0e7ff;
}

.vpg-ai-docs-link svg {
  width: 1rem;
  height: 1rem;
}

/* Split Layout */
.vpg-ai-split-layout {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Chat Panel (1/4) */
.vpg-ai-chat-panel {
  width: 300px;
  min-width: 260px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: white;
  border-right: 1px solid #e2e8f0;
}

.vpg-ai-chat-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid #e2e8f0;
}

.vpg-ai-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-back-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.vpg-ai-back-btn svg {
  width: 0.875rem;
  height: 0.875rem;
}

.vpg-ai-clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-clear-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}

.vpg-ai-clear-btn svg {
  width: 0.875rem;
  height: 0.875rem;
}

.vpg-ai-chat-title {
  flex: 1;
  min-width: 0;
}

.vpg-ai-chat-name {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Messages */
.vpg-ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  padding-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.vpg-ai-welcome {
  text-align: center;
  padding: 0.75rem 0;
}

.vpg-ai-welcome p {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: #64748b;
}

.vpg-ai-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.25rem;
}

.vpg-ai-suggestions button {
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  color: #6366f1;
  background: #eef2ff;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-suggestions button:hover {
  background: #e0e7ff;
}

/* Message styles */
.vpg-ai-msg {
  max-width: 100%;
  font-size: 0.75rem;
  line-height: 1.5;
}

.vpg-ai-msg-user {
  align-self: flex-end;
  background: #4f46e5;
  color: white;
  padding: 0.5rem 0.625rem;
  border-radius: 0.75rem 0.75rem 0.25rem 0.75rem;
  max-width: 90%;
  word-wrap: break-word;
  flex-shrink: 0;
}

.vpg-ai-msg-assistant {
  background: #f1f5f9;
  color: #334155;
  padding: 0.5rem 0.625rem;
  border-radius: 0.75rem 0.75rem 0.75rem 0.25rem;
  max-width: 100%;
  flex-shrink: 0;
}

.vpg-ai-assistant-content {
  white-space: pre-wrap;
  word-wrap: break-word;
}

.vpg-ai-msg-error {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.6875rem;
  border-radius: 0.25rem;
}

.vpg-ai-msg-error svg {
  width: 0.75rem;
  height: 0.75rem;
}

/* Result message (clickable) */
.vpg-ai-msg-result {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0.5rem;
  flex-shrink: 0;
}

.vpg-ai-msg-result:hover {
  border-color: #c7d2fe;
}

.vpg-ai-msg-result.vpg-ai-msg-selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

/* Result header with badge and SQL toggle */
.vpg-ai-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

/* Result badge */
.vpg-ai-result-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  background: #ecfdf5;
  color: #059669;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: 0.25rem;
}

.vpg-ai-result-badge svg {
  width: 0.75rem;
  height: 0.75rem;
}

/* SQL toggle button */
.vpg-ai-sql-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.625rem;
  font-weight: 500;
  border: 1px solid #e2e8f0;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-sql-toggle:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-ai-sql-toggle.vpg-ai-sql-expanded {
  background: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
}

.vpg-ai-sql-toggle svg {
  width: 0.625rem;
  height: 0.625rem;
}

/* Expanded SQL block */
.vpg-ai-sql-expanded-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  margin-bottom: 0.375rem;
  overflow: hidden;
}

.vpg-ai-sql-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.625rem;
  font-weight: 600;
  color: #64748b;
}

/* Result content - full text */
.vpg-ai-result-content {
  font-size: 0.75rem;
  color: #334155;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.vpg-ai-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-copy-btn:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-ai-copy-btn svg {
  width: 0.625rem;
  height: 0.625rem;
}

.vpg-ai-sql-code {
  margin: 0;
  padding: 0.375rem 0.5rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.6875rem;
  color: #334155;
  background: #f8fafc;
  white-space: pre-wrap;
  word-break: break-word;
}

.vpg-ai-sql-code code {
  font-family: inherit;
}

/* Loading */
.vpg-ai-msg-loading {
  align-self: flex-start;
}

.vpg-ai-typing {
  display: flex;
  gap: 0.1875rem;
  padding: 0.375rem 0.5rem;
  background: #f1f5f9;
  border-radius: 0.5rem;
}

.vpg-ai-typing span {
  width: 0.3125rem;
  height: 0.3125rem;
  background: #94a3b8;
  border-radius: 50%;
  animation: vpg-ai-bounce 1.4s infinite ease-in-out both;
}

.vpg-ai-typing span:nth-child(1) { animation-delay: -0.32s; }
.vpg-ai-typing span:nth-child(2) { animation-delay: -0.16s; }

@keyframes vpg-ai-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* Input Area */
.vpg-ai-input-area {
  padding: 0.5rem;
  border-top: 1px solid #e2e8f0;
  background: white;
}

.vpg-ai-input-form {
  display: flex;
  gap: 0.375rem;
  align-items: flex-end;
}

.vpg-ai-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  resize: none;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-height: 2.25rem;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
}

.vpg-ai-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.vpg-ai-input:disabled {
  background: #f8fafc;
  cursor: not-allowed;
}

.vpg-ai-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  background: #4f46e5;
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.vpg-ai-send-btn:hover:not(:disabled) {
  background: #4338ca;
}

.vpg-ai-send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.vpg-ai-send-btn svg {
  width: 0.75rem;
  height: 0.75rem;
}

/* Input footer with model name and actions */
.vpg-ai-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.375rem;
}

.vpg-ai-model-name {
  font-size: 0.625rem;
  font-style: italic;
  color: #94a3b8;
}

/* Action buttons */
.vpg-ai-input-actions {
  display: flex;
  gap: 0.25rem;
}

.vpg-ai-action-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-action-btn:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-ai-action-btn svg {
  width: 0.625rem;
  height: 0.625rem;
}

.vpg-ai-action-btn.vpg-ai-action-primary {
  background: #eef2ff;
  color: #4f46e5;
}

.vpg-ai-action-btn.vpg-ai-action-primary:hover {
  background: #e0e7ff;
}

/* Preview Panel (3/4) */
.vpg-ai-preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f8fafc;
}

.vpg-ai-preview-header {
  display: flex;
  flex-direction: column;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.vpg-ai-preview-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
}

.vpg-ai-preview-header h3 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
}

.vpg-ai-preview-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.vpg-ai-preview-count {
  font-size: 0.75rem;
  color: #64748b;
  padding: 0.125rem 0.5rem;
  background: #f1f5f9;
  border-radius: 0.25rem;
}

.vpg-ai-preview-sql-btn,
.vpg-ai-preview-view-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: #64748b;
  background: #f1f5f9;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-preview-sql-btn:hover,
.vpg-ai-preview-view-btn:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-ai-preview-view-btn {
  background: #eef2ff;
  color: #4f46e5;
}

.vpg-ai-preview-view-btn:hover {
  background: #e0e7ff;
}

.vpg-ai-preview-sql-btn svg,
.vpg-ai-preview-view-btn svg {
  width: 0.875rem;
  height: 0.875rem;
}

/* Schema bar in preview header */
.vpg-ai-schema-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: #fafbfc;
  border-top: 1px solid #f1f5f9;
  max-height: 80px;
  overflow-y: auto;
}

.vpg-ai-schema-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
}

.vpg-ai-chip-type {
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e2e8f0;
  border-radius: 0.125rem;
  font-size: 0.625rem;
  font-weight: 700;
  color: #64748b;
}

.vpg-ai-chip-name {
  color: #475569;
  font-family: ui-monospace, monospace;
}

/* SQL Panel (collapsible, above the table) */
.vpg-ai-sql-panel {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.vpg-ai-sql-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.vpg-ai-sql-panel-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.vpg-ai-sql-panel-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.vpg-ai-sql-panel-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.vpg-ai-sql-panel-close:hover {
  background: #e2e8f0;
  color: #475569;
}

.vpg-ai-sql-panel-close svg {
  width: 0.75rem;
  height: 0.75rem;
}

.vpg-ai-sql-panel-code {
  margin: 0;
  padding: 0.75rem;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #334155;
  background: #f8fafc;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
}

.vpg-ai-sql-panel-code code {
  font-family: inherit;
}

/* SQL button active state */
.vpg-ai-preview-sql-btn.vpg-ai-sql-active {
  background: #eef2ff;
  color: #6366f1;
  border-color: #c7d2fe;
}

/* Loading state */
.vpg-ai-preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
}

.vpg-ai-preview-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: vpg-ai-spin 1s linear infinite;
}

@keyframes vpg-ai-spin {
  to { transform: rotate(360deg); }
}

.vpg-ai-preview-loading span {
  font-size: 0.8125rem;
  color: #64748b;
}

/* Ready state (schema loaded, no data yet) */
.vpg-ai-preview-ready {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.vpg-ai-preview-ready-icon {
  width: 4rem;
  height: 4rem;
  background: #ecfdf5;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #10b981;
  margin-bottom: 1rem;
}

.vpg-ai-preview-ready-icon svg {
  width: 2rem;
  height: 2rem;
}

.vpg-ai-preview-ready p {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
}

.vpg-ai-preview-ready span {
  font-size: 0.875rem;
  color: #64748b;
}

.vpg-ai-preview-hint {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: #64748b;
}

/* Preview empty state */
.vpg-ai-preview-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.vpg-ai-preview-empty-icon {
  width: 3.5rem;
  height: 3.5rem;
  background: #e2e8f0;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  margin-bottom: 0.75rem;
}

.vpg-ai-preview-empty-icon svg {
  width: 1.75rem;
  height: 1.75rem;
}

.vpg-ai-preview-empty p {
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #475569;
}

.vpg-ai-preview-empty span {
  font-size: 0.75rem;
  color: #94a3b8;
}

/* Preview table */
.vpg-ai-preview-table-container {
  flex: 1;
  overflow: auto;
}

.vpg-ai-preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.6875rem;
}

.vpg-ai-preview-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}

.vpg-ai-preview-table th {
  padding: 0.375rem 0.625rem;
  text-align: left;
  font-size: 0.625rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.vpg-ai-preview-table td {
  padding: 0.375rem 0.625rem;
  color: #334155;
  background: white;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vpg-ai-preview-table tr:hover td {
  background: #f8fafc;
}

.vpg-ai-preview-more {
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.6875rem;
  color: #64748b;
  background: white;
  border-top: 1px solid #e2e8f0;
}

.vpg-ai-preview-more button {
  color: #4f46e5;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
  margin-left: 0.25rem;
}

.vpg-ai-preview-more button:hover {
  text-decoration: underline;
}

/* Dark theme */
.vpg-ai-analyst.vpg-theme-dark {
  background: #0f172a;
}

.vpg-theme-dark .vpg-ai-picker-header h2 {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-ai-picker-header p {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-search {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-search-input {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-datasource-card {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-datasource-card:hover {
  border-color: #6366f1;
}

.vpg-theme-dark .vpg-ai-datasource-name {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-ai-chat-panel {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-chat-header {
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-back-btn:hover {
  background: #334155;
}

.vpg-theme-dark .vpg-ai-clear-btn:hover {
  background: rgba(220, 38, 38, 0.15);
  color: #f87171;
}

.vpg-theme-dark .vpg-ai-chat-name {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-ai-welcome p {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-suggestions button {
  background: #334155;
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-ai-suggestions button:hover {
  background: #475569;
}

.vpg-theme-dark .vpg-ai-msg-assistant {
  background: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-msg-result {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-msg-result:hover {
  border-color: #475569;
}

.vpg-theme-dark .vpg-ai-msg-result.vpg-ai-msg-selected {
  border-color: #6366f1;
}

.vpg-theme-dark .vpg-ai-result-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.vpg-theme-dark .vpg-ai-result-content {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-sql-reference {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-sql-label {
  background: #1e293b;
  border-color: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-sql-code {
  background: #0f172a;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-copy-btn:hover {
  background: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-typing {
  background: #334155;
}

.vpg-theme-dark .vpg-ai-input-area {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-input {
  background: #0f172a;
  border-color: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-input:focus {
  border-color: #6366f1;
}

.vpg-theme-dark .vpg-ai-action-btn {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-action-btn:hover {
  background: #475569;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-action-btn.vpg-ai-action-primary {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-ai-preview-panel {
  background: #0f172a;
}

.vpg-theme-dark .vpg-ai-preview-header {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-preview-header h3 {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-ai-preview-sql-btn,
.vpg-theme-dark .vpg-ai-preview-view-btn {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-preview-sql-btn:hover,
.vpg-theme-dark .vpg-ai-preview-view-btn:hover {
  background: #475569;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-preview-view-btn {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.vpg-theme-dark .vpg-ai-preview-count {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-schema-bar {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-schema-chip {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-chip-type {
  background: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-chip-name {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-preview-loading span {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-preview-spinner {
  border-color: #334155;
  border-top-color: #6366f1;
}

.vpg-theme-dark .vpg-ai-preview-ready-icon {
  background: rgba(16, 185, 129, 0.15);
}

.vpg-theme-dark .vpg-ai-preview-ready p {
  color: #f1f5f9;
}

.vpg-theme-dark .vpg-ai-preview-ready span {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-preview-hint {
  background: #1e293b;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-preview-empty-icon {
  background: #334155;
}

.vpg-theme-dark .vpg-ai-preview-empty p {
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-preview-table th {
  background: #1e293b;
  border-color: #334155;
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-preview-table td {
  background: #0f172a;
  border-color: #1e293b;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-preview-table tr:hover td {
  background: #1e293b;
}

.vpg-theme-dark .vpg-ai-preview-more {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-result-icon {
  background: rgba(16, 185, 129, 0.15);
}

.vpg-theme-dark .vpg-ai-model-name {
  color: #64748b;
}

.vpg-theme-dark .vpg-ai-sql-panel {
  background: #0f172a;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-sql-panel-header {
  background: #1e293b;
  border-color: #334155;
}

.vpg-theme-dark .vpg-ai-sql-panel-title {
  color: #94a3b8;
}

.vpg-theme-dark .vpg-ai-sql-panel-close:hover {
  background: #334155;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-sql-panel-code {
  background: #0f172a;
  color: #e2e8f0;
}

.vpg-theme-dark .vpg-ai-preview-sql-btn.vpg-ai-sql-active {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}
</style>
