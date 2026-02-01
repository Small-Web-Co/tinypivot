<script setup lang="ts">
/**
 * TinyPivot Studio Vue Component
 * Main entry point for the TinyPivot Studio page builder
 */
import type {
  Block,
  DatasourceConfig,
  HeadingBlock,
  Page,
  PageListItem,
  PageTemplate,
  StorageAdapter,
  TextBlock,
  WidgetBlock,
  WidgetConfig,
} from '@smallwebco/tinypivot-studio'
import { generateId, isWidgetBlock } from '@smallwebco/tinypivot-studio'
import { DataGrid } from '@smallwebco/tinypivot-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { provideStudio, type StudioConfig } from '../composables'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'

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
  /** Theme setting */
  theme?: 'light' | 'dark' | 'auto'
}

const props = withDefaults(defineProps<TinyPivotStudioProps>(), {
  theme: 'light',
})

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

// Use storage from props directly (useStudio is for child components)
const storage = computed(() => props.storage)

// Resolve theme
const resolvedTheme = computed(() => {
  if (props.theme === 'auto') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  }
  return props.theme
})

const themeClass = computed(() => resolvedTheme.value === 'dark' ? 'tps-theme-dark' : '')

// State
const pages = ref<PageListItem[]>([])
const currentPage = ref<Page | null>(null)
const showCreateModal = ref(false)
const isLoading = ref(true)

// Modal state
const newPageTitle = ref('')
const newPageTemplate = ref<PageTemplate>('blank')

// Editor state
const editorTitle = ref('')
const editorBlocks = ref<Block[]>([])
const showBlockMenu = ref(false)

// Widget sample data - used when no data source is configured
const widgetSampleData = [
  { id: 1, product: 'Widget A', category: 'Electronics', sales: 1250, revenue: 31250 },
  { id: 2, product: 'Widget B', category: 'Electronics', sales: 980, revenue: 24500 },
  { id: 3, product: 'Gadget X', category: 'Home', sales: 750, revenue: 18750 },
  { id: 4, product: 'Gadget Y', category: 'Home', sales: 620, revenue: 15500 },
  { id: 5, product: 'Device Z', category: 'Office', sales: 1100, revenue: 27500 },
]

// Widget loading state per block
const widgetLoadingStates = ref<Record<string, boolean>>({})
const widgetErrorStates = ref<Record<string, string | null>>({})

// Load pages on mount
onMounted(async () => {
  if (!storage.value) {
    isLoading.value = false
    return
  }

  try {
    const result = await storage.value.listPages()
    pages.value = result.items
  }
  catch (error) {
    console.error('Failed to load pages:', error)
  }
  finally {
    isLoading.value = false
  }
})

// Sync editor state when current page changes
watch(currentPage, (page) => {
  if (page) {
    editorTitle.value = page.title
    editorBlocks.value = [...page.blocks]
  }
  else {
    editorTitle.value = ''
    editorBlocks.value = []
  }
})

// Handle page selection
async function handleSelectPage(pageId: string) {
  if (!storage.value)
    return

  try {
    const page = await storage.value.getPage(pageId)
    currentPage.value = page
  }
  catch (error) {
    console.error('Failed to load page:', error)
  }
}

// Handle page deletion
async function handleDeletePage(pageId: string, event: MouseEvent) {
  event.stopPropagation()
  if (!storage.value)
    return

  if (!window.confirm('Are you sure you want to delete this page?')) {
    return
  }

  try {
    await storage.value.deletePage(pageId)
    pages.value = pages.value.filter(p => p.id !== pageId)
    if (currentPage.value?.id === pageId) {
      currentPage.value = null
    }
  }
  catch (error) {
    console.error('Failed to delete page:', error)
  }
}

// Handle page creation
async function handleCreatePage() {
  if (!storage.value || !newPageTitle.value.trim())
    return

  try {
    // Deep clone blocks to avoid IndexedDB serialization issues
    const blocksForStorage = JSON.parse(JSON.stringify(getTemplateBlocks(newPageTemplate.value)))
    const page = await storage.value.createPage({
      title: newPageTitle.value.trim(),
      template: newPageTemplate.value,
      blocks: blocksForStorage,
    })

    pages.value = [...pages.value, {
      id: page.id,
      title: page.title,
      slug: page.slug,
      published: page.published,
      archived: page.archived,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      template: page.template,
    }]

    currentPage.value = page
    showCreateModal.value = false
    newPageTitle.value = ''
    newPageTemplate.value = 'blank'

    emit('pageSave', page)
  }
  catch (error) {
    console.error('Failed to create page:', error)
  }
}

// Handle page update
async function handleUpdatePage() {
  if (!storage.value || !currentPage.value)
    return

  try {
    // Deep clone blocks to avoid IndexedDB serialization issues with Vue proxies
    const blocksForStorage = JSON.parse(JSON.stringify(editorBlocks.value))
    const page = await storage.value.updatePage(currentPage.value.id, {
      title: editorTitle.value,
      blocks: blocksForStorage,
    })

    currentPage.value = page
    pages.value = pages.value.map(p =>
      p.id === page.id
        ? { ...p, title: page.title, updatedAt: page.updatedAt }
        : p,
    )

    emit('pageSave', page)
  }
  catch (error) {
    console.error('Failed to update page:', error)
  }
}

// Handle title blur
function handleTitleBlur() {
  if (currentPage.value && editorTitle.value !== currentPage.value.title) {
    handleUpdatePage()
  }
}

// Handle block update
function handleBlockUpdate(blockId: string, updates: Partial<Block>) {
  editorBlocks.value = editorBlocks.value.map((block): Block =>
    block.id === blockId ? { ...block, ...updates } as Block : block,
  )
  handleUpdatePage()
}

// Handle block deletion
function handleBlockDelete(blockId: string) {
  editorBlocks.value = editorBlocks.value.filter(block => block.id !== blockId)
  handleUpdatePage()
}

// Handle add block
function handleAddBlock(type: Block['type']) {
  const newBlock = createBlock(type)
  editorBlocks.value = [...editorBlocks.value, newBlock]
  showBlockMenu.value = false
  handleUpdatePage()
}

// Open create modal
function openCreateModal() {
  showCreateModal.value = true
}

// Close create modal
function closeCreateModal() {
  showCreateModal.value = false
  newPageTitle.value = ''
  newPageTemplate.value = 'blank'
}

// Handle modal overlay click
function handleModalOverlayClick() {
  closeCreateModal()
}

// Get template icon path
function getTemplateIconPath(template: PageTemplate): string {
  switch (template) {
    case 'blank':
      return 'M3 3h18v18H3z'
    case 'article':
      return 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM8 13h8M8 17h8M8 9h2'
    case 'dashboard':
      return 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'
    case 'infographic':
      return 'M18 20V10M12 20V4M6 20v-6'
    default:
      return 'M3 3h18v18H3z'
  }
}

// Create a new block of the given type
function createBlock(type: Block['type']): Block {
  const id = generateId()

  switch (type) {
    case 'text':
      return { id, type: 'text', content: '' }
    case 'heading':
      return { id, type: 'heading', content: '', level: 2 }
    case 'divider':
      return { id, type: 'divider' }
    case 'widget':
      return { id, type: 'widget', widgetId: '', showTitle: true } as WidgetBlock
    default:
      return { id, type: 'text', content: '' }
  }
}

// Get initial blocks for a template
function getTemplateBlocks(template: PageTemplate): Block[] {
  switch (template) {
    case 'article':
      return [
        { id: generateId(), type: 'heading', content: '', level: 1 },
        { id: generateId(), type: 'text', content: '' },
      ]
    case 'dashboard':
      return [
        { id: generateId(), type: 'heading', content: 'Dashboard', level: 1 },
        { id: generateId(), type: 'text', content: 'Add widgets to build your dashboard.' },
      ]
    case 'infographic':
      return [
        { id: generateId(), type: 'heading', content: '', level: 1 },
        { id: generateId(), type: 'text', content: '' },
        { id: generateId(), type: 'divider' },
      ]
    default:
      return []
  }
}

// Auto-resize textarea
function handleTextareaInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = `${target.scrollHeight}px`
}

// Type guards for blocks
function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'text'
}

function isHeadingBlock(block: Block): block is HeadingBlock {
  return block.type === 'heading'
}

// Get widget height style
function getWidgetHeightStyle(block: WidgetBlock): string {
  if (!block.height)
    return '400px'
  return typeof block.height === 'number' ? `${block.height}px` : block.height
}

// Check if widget has data configured
function hasWidgetData(block: WidgetBlock): boolean {
  return Boolean(block.widgetId)
}

// Expose save handlers for child components
defineExpose({
  handleUpdatePage,
})
</script>

<template>
  <div class="tps-studio" :class="[themeClass]">
    <!-- Sidebar -->
    <aside class="tps-sidebar">
      <div class="tps-sidebar-header">
        <div class="tps-sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <span>TinyPivot Studio</span>
        </div>
      </div>

      <div class="tps-sidebar-section">
        <span class="tps-sidebar-section-title">Pages</span>
        <button
          type="button"
          class="tps-btn tps-btn-ghost tps-btn-sm tps-btn-icon"
          title="New page"
          @click="openCreateModal"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div class="tps-page-list">
        <div v-if="isLoading" class="tps-page-list-empty">
          <div class="tps-spinner tps-spinner-sm" />
        </div>
        <div v-else-if="pages.length === 0" class="tps-page-list-empty">
          No pages yet
        </div>
        <button
          v-for="page in pages"
          v-else
          :key="page.id"
          type="button"
          class="tps-page-item" :class="[{ 'tps-active': page.id === currentPage?.id }]"
          @click="handleSelectPage(page.id)"
        >
          <svg class="tps-page-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
          <span class="tps-page-item-title">{{ page.title }}</span>
          <div class="tps-page-item-actions">
            <button
              type="button"
              class="tps-page-item-delete"
              title="Delete page"
              @click="handleDeletePage(page.id, $event)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="tps-main">
      <!-- No Storage State -->
      <div v-if="!storage" class="tps-empty-state">
        <div class="tps-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <h2 class="tps-empty-title">
          Storage Not Configured
        </h2>
        <p class="tps-empty-description">
          To save and load pages, please configure a storage adapter in the TinyPivotStudio component.
        </p>
      </div>

      <!-- Page Editor -->
      <div v-else-if="currentPage" class="tps-editor">
        <div class="tps-editor-header">
          <div class="tps-editor-title-wrapper">
            <input
              v-model="editorTitle"
              type="text"
              class="tps-editor-title"
              placeholder="Untitled"
              @blur="handleTitleBlur"
            >
          </div>
        </div>

        <div class="tps-editor-content">
          <div class="tps-blocks">
            <!-- Text Block -->
            <template v-for="block in editorBlocks" :key="block.id">
              <div v-if="isTextBlock(block)" class="tps-block tps-block-text">
                <div class="tps-block-actions">
                  <button
                    type="button"
                    class="tps-block-action tps-block-delete"
                    title="Delete block"
                    @click="handleBlockDelete(block.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                <textarea
                  :value="block.content"
                  class="tps-block-input"
                  placeholder="Type some text..."
                  rows="1"
                  @input="(e) => { handleTextareaInput(e); handleBlockUpdate(block.id, { content: (e.target as HTMLTextAreaElement).value }) }"
                />
              </div>

              <!-- Heading Block -->
              <div v-else-if="isHeadingBlock(block)" class="tps-block tps-block-heading" :data-level="block.level">
                <div class="tps-block-actions">
                  <button
                    type="button"
                    class="tps-block-action tps-block-delete"
                    title="Delete block"
                    @click="handleBlockDelete(block.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                <input
                  :value="block.content"
                  type="text"
                  class="tps-block-input"
                  placeholder="Heading..."
                  @input="handleBlockUpdate(block.id, { content: ($event.target as HTMLInputElement).value })"
                >
              </div>

              <!-- Divider Block -->
              <div v-else-if="block.type === 'divider'" class="tps-block tps-block-divider">
                <div class="tps-block-actions">
                  <button
                    type="button"
                    class="tps-block-action tps-block-delete"
                    title="Delete block"
                    @click="handleBlockDelete(block.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
                <hr>
              </div>

              <!-- Widget Block -->
              <div v-else-if="isWidgetBlock(block)" class="tps-block tps-block-widget" :style="{ minHeight: getWidgetHeightStyle(block) }">
                <div class="tps-block-actions">
                  <button
                    type="button"
                    class="tps-block-action"
                    title="Configure widget"
                    @click="handleBlockUpdate(block.id, { widgetId: block.widgetId ? '' : 'sample' })"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="tps-block-action tps-block-delete"
                    title="Delete block"
                    @click="handleBlockDelete(block.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                <!-- Widget Title -->
                <div v-if="block.showTitle !== false" class="tps-widget-header">
                  <input
                    :value="block.titleOverride || ''"
                    type="text"
                    class="tps-widget-title-input"
                    placeholder="Widget Title"
                    @input="handleBlockUpdate(block.id, { titleOverride: ($event.target as HTMLInputElement).value })"
                  >
                </div>

                <!-- Widget Loading State -->
                <div v-if="widgetLoadingStates[block.id]" class="tps-widget-loading">
                  <div class="tps-spinner" />
                  <span>Loading widget...</span>
                </div>

                <!-- Widget Error State -->
                <div v-else-if="widgetErrorStates[block.id]" class="tps-widget-error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{{ widgetErrorStates[block.id] }}</span>
                  <button type="button" class="tps-btn tps-btn-sm tps-btn-secondary" @click="widgetErrorStates[block.id] = null">
                    Retry
                  </button>
                </div>

                <!-- Widget Placeholder (no data configured) -->
                <div v-else-if="!hasWidgetData(block)" class="tps-widget-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  <span>No data configured</span>
                  <button
                    type="button"
                    class="tps-btn tps-btn-sm tps-btn-primary"
                    @click="handleBlockUpdate(block.id, { widgetId: 'sample' })"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Configure Widget
                  </button>
                </div>

                <!-- Widget with Data (using sample data for now) -->
                <div v-else class="tps-widget-content">
                  <DataGrid
                    :data="widgetSampleData"
                    :theme="resolvedTheme"
                    :enable-export="false"
                    :enable-pagination="false"
                    :enable-search="true"
                    :striped-rows="true"
                    :initial-height="350"
                    :min-height="200"
                    :max-height="600"
                  />
                </div>
              </div>

              <!-- Unknown Block -->
              <div v-else class="tps-block">
                <span>Unknown block type: {{ block.type }}</span>
              </div>
            </template>

            <!-- Add Block Menu -->
            <div v-if="showBlockMenu" class="tps-add-block-menu">
              <button
                type="button"
                class="tps-add-block-option"
                @click="handleAddBlock('text')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                </svg>
                Text
              </button>
              <button
                type="button"
                class="tps-add-block-option"
                @click="handleAddBlock('heading')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M6 4v16M18 4v16M6 12h12" />
                </svg>
                Heading
              </button>
              <button
                type="button"
                class="tps-add-block-option"
                @click="handleAddBlock('divider')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 12h18" />
                </svg>
                Divider
              </button>
              <button
                type="button"
                class="tps-add-block-option"
                @click="handleAddBlock('widget')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                Widget
              </button>
              <button
                type="button"
                class="tps-btn tps-btn-ghost tps-btn-sm"
                style="margin-left: auto"
                @click="showBlockMenu = false"
              >
                Cancel
              </button>
            </div>

            <!-- Add Block Button -->
            <button
              v-else
              type="button"
              class="tps-add-block"
              @click="showBlockMenu = true"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add block
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="tps-empty-state">
        <div class="tps-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14,2 14,8 20,8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </div>
        <h2 class="tps-empty-title">
          Welcome to TinyPivot Studio
        </h2>
        <p class="tps-empty-description">
          Create pages to build interactive dashboards, reports, and data visualizations.
        </p>
        <div class="tps-empty-actions">
          <button type="button" class="tps-btn tps-btn-primary" @click="openCreateModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create your first page
          </button>
        </div>
        <div class="tps-empty-links">
          <button type="button" class="tps-empty-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10,8 16,12 10,16" />
            </svg>
            Watch tutorial
          </button>
          <button type="button" class="tps-empty-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Read docs
          </button>
        </div>
      </div>
    </main>

    <!-- Create Page Modal -->
    <div v-if="showCreateModal" class="tps-modal-overlay" @click="handleModalOverlayClick">
      <div class="tps-modal" @click.stop>
        <div class="tps-modal-header">
          <h3 class="tps-modal-title">
            Create New Page
          </h3>
          <button type="button" class="tps-modal-close" @click="closeCreateModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="handleCreatePage">
          <div class="tps-modal-body">
            <div class="tps-form-group">
              <label class="tps-label" for="page-title">Page Title</label>
              <input
                id="page-title"
                v-model="newPageTitle"
                type="text"
                class="tps-input"
                placeholder="My Dashboard"
                autofocus
              >
            </div>

            <div class="tps-form-group">
              <label class="tps-label">Template</label>
              <div class="tps-template-grid">
                <button
                  v-for="t in ['blank', 'article', 'dashboard', 'infographic'] as const"
                  :key="t"
                  type="button"
                  class="tps-template-card" :class="[{ 'tps-selected': newPageTemplate === t }]"
                  @click="newPageTemplate = t"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path :d="getTemplateIconPath(t)" />
                  </svg>
                  <span class="tps-template-card-label">
                    {{ t.charAt(0).toUpperCase() + t.slice(1) }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="tps-modal-footer">
            <button type="button" class="tps-btn tps-btn-secondary" @click="closeCreateModal">
              Cancel
            </button>
            <button type="submit" class="tps-btn tps-btn-primary" :disabled="!newPageTitle.trim()">
              Create Page
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
