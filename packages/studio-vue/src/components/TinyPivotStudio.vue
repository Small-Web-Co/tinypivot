<script setup lang="ts">
/**
 * TinyPivot Studio Vue Component
 * Main entry point for the TinyPivot Studio page builder
 */
import type {
  Block,
  DatasourceConfig,
  GridPosition,
  LayoutMode,
  Page,
  PageListItem,
  PageShare,
  PageShareSettings,
  PageTemplate,
  PageVersionSummary,
  StorageAdapter,
  WidgetBlock,
  WidgetConfig,
} from '@smallwebco/tinypivot-studio'
import type { GridStackNode } from 'gridstack'
import {
  calculateContentHash,
  generateId,
  isHeadingBlock,
  isTextBlock,
  isWidgetBlock,
  MAX_VERSIONS_PER_PAGE,
} from '@smallwebco/tinypivot-studio'

import { DataGrid } from '@smallwebco/tinypivot-vue'
import { GridStack } from 'gridstack'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import draggable from 'vuedraggable'

import { provideStudio, type StudioConfig } from '../composables'
import { calculateResizeWithCollision } from '../utils/gridCollision'
import { capturePageThumbnail } from '../utils/thumbnail'
import { getLastPage, getWidgetState, saveLastPage, saveWidgetState } from '../utils/widgetState'
import ReportGallery from './ReportGallery.vue'
import RichTextEditor from './RichTextEditor.vue'
import ShareModal from './ShareModal.vue'
// Import styles
import '@smallwebco/tinypivot-studio/style.css'
import '@smallwebco/tinypivot-vue/style.css'
import 'gridstack/dist/gridstack.min.css'

const props = withDefaults(defineProps<TinyPivotStudioProps>(), {
  theme: 'light',
})

const emit = defineEmits<{
  /** Emitted when a page is saved */
  pageSave: [page: Page]
  /** Emitted when a widget is saved */
  widgetSave: [widget: WidgetConfig]
}>()

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
  /** API endpoint for server-side operations (datasources, queries) */
  apiEndpoint?: string
  /** User key for credential encryption (required for server-side datasources) */
  userKey?: string
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

// Get AI Analyst config for a specific widget/datasource
function getAiAnalystConfigForDatasource(datasourceId?: string) {
  if (!props.aiAnalyst?.endpoint)
    return undefined

  // If using sample data or no datasource, return basic config
  if (!datasourceId || datasourceId === 'sample') {
    return {
      enabled: true,
      embedded: true,
      endpoint: props.aiAnalyst.endpoint,
      persistToLocalStorage: true,
      sessionId: `studio-${props.userId || 'demo'}`,
      apiKey: props.aiAnalyst.apiKey,
    }
  }

  // For real datasources, include auth info for datasource-specific queries
  return {
    enabled: true,
    embedded: true,
    endpoint: props.aiAnalyst.endpoint,
    persistToLocalStorage: true,
    sessionId: `studio-${props.userId || 'demo'}-${datasourceId}`,
    datasourceId,
    userId: props.userId,
    userKey: props.userKey || props.userId,
    apiKey: props.aiAnalyst.apiKey,
  }
}

// Check if widget should auto-show AI tab (has datasource but no table selected)
function shouldAutoShowAI(block: WidgetBlock): boolean {
  return Boolean(
    block.metadata?.datasourceId
    && block.metadata.datasourceId !== 'sample'
    && !block.metadata?.tableId,
  )
}

// State
const pages = ref<PageListItem[]>([])
const currentPage = ref<Page | null>(null)
const showCreateModal = ref(false)
const isLoading = ref(true)
const sidebarTab = ref<'pages' | 'explore'>('pages')

// Modal state
const newPageTitle = ref('')
const newPageTemplate = ref<PageTemplate>('blank')

// Widget configuration modal state
const showWidgetConfigModal = ref(false)
const widgetConfigBlockId = ref<string | null>(null)
const widgetConfigTitle = ref('')
const widgetConfigHeight = ref<number>(400)
const widgetConfigVisualizationType = ref<'table' | 'pivot' | 'chart'>('table')
const widgetConfigShowTitle = ref(true)
// Datasource selection for widget
const widgetConfigDatasourceId = ref<string>('sample') // 'sample' or datasource ID

// Share modal state
const showShareModal = ref(false)
const currentPageShare = ref<PageShare | null>(null)

// Editor state
const editorTitle = ref('')
const editorBlocks = ref<Block[]>([])
const showBlockMenu = ref(false)

// Layout mode state
const layoutMode = ref<LayoutMode>('grid')
const gridInstance = ref<GridStack | null>(null)
const gridContainerRef = ref<HTMLElement | null>(null)

// Column nested block state - tracks which column's add block menu is open
// Format: "parentBlockId:columnIndex" or null
const activeColumnMenu = ref<string | null>(null)

// Widget hover state tracking
const hoveredBlockId = ref<string | null>(null)
const focusedBlockId = ref<string | null>(null)

function shouldShowControls(blockId: string): boolean {
  return hoveredBlockId.value === blockId || focusedBlockId.value === blockId
}

function handleBlockFocusOut(event: FocusEvent, _blockId: string) {
  const relatedTarget = event.relatedTarget as HTMLElement | null
  const blockElement = event.currentTarget as HTMLElement

  // Keep focus if the new target is still within the block
  if (relatedTarget && blockElement.contains(relatedTarget)) {
    return
  }
  focusedBlockId.value = null
}

// ============================================================================
// Undo/Redo System
// ============================================================================
const MAX_HISTORY_SIZE = 50

interface HistoryEntry {
  blocks: Block[]
  title: string
  timestamp: number
}

const history = ref<HistoryEntry[]>([])
const historyIndex = ref(-1)
const isUndoRedo = ref(false) // Flag to prevent recording during undo/redo

// Check if undo/redo is available
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

// Record a state change to history
function recordHistory() {
  if (isUndoRedo.value)
    return

  // Create a deep copy of current state
  const entry: HistoryEntry = {
    blocks: JSON.parse(JSON.stringify(editorBlocks.value)),
    title: editorTitle.value,
    timestamp: Date.now(),
  }

  // If we're not at the end of history, remove future entries
  if (historyIndex.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIndex.value + 1)
  }

  // Add new entry
  history.value.push(entry)

  // Trim history if too large
  if (history.value.length > MAX_HISTORY_SIZE) {
    history.value = history.value.slice(-MAX_HISTORY_SIZE)
  }

  historyIndex.value = history.value.length - 1
}

// Perform undo
function undo() {
  if (!canUndo.value)
    return

  isUndoRedo.value = true
  historyIndex.value--
  const entry = history.value[historyIndex.value]
  editorBlocks.value = JSON.parse(JSON.stringify(entry.blocks))
  editorTitle.value = entry.title
  isUndoRedo.value = false

  // Also persist the change
  handleUpdatePage()
}

// Perform redo
function redo() {
  if (!canRedo.value)
    return

  isUndoRedo.value = true
  historyIndex.value++
  const entry = history.value[historyIndex.value]
  editorBlocks.value = JSON.parse(JSON.stringify(entry.blocks))
  editorTitle.value = entry.title
  isUndoRedo.value = false

  // Also persist the change
  handleUpdatePage()
}

// Keyboard shortcuts for undo/redo
function handleKeyDown(event: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey

  if (ctrlOrCmd && event.key === 'z') {
    if (event.shiftKey) {
      // Cmd+Shift+Z or Ctrl+Shift+Z for redo
      event.preventDefault()
      redo()
    }
    else {
      // Cmd+Z or Ctrl+Z for undo
      event.preventDefault()
      undo()
    }
  }
  else if (ctrlOrCmd && event.key === 'y') {
    // Ctrl+Y for redo (Windows style)
    event.preventDefault()
    redo()
  }
}

// Set up keyboard listener on mount
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  destroyGrid()
})

// ============================================================================
// Grid Layout Mode (Gridstack)
// ============================================================================

// Handle collision-aware grid resize
function handleGridResize(element: HTMLElement, newWidth: number): boolean {
  const blockId = element.getAttribute('gs-id')
  if (!blockId)
    return true

  const result = calculateResizeWithCollision(
    editorBlocks.value,
    blockId,
    newWidth,
    'right',
  )

  if (!result.canResize) {
    return false
  }

  // Apply neighbor adjustments
  for (const adj of result.neighborAdjustments) {
    const block = editorBlocks.value.find(b => b.id === adj.blockId)
    if (block) {
      block.gridPosition = adj.newPosition
      const neighborEl = gridContainerRef.value?.querySelector(`[gs-id="${adj.blockId}"]`)
      if (neighborEl && gridInstance.value) {
        gridInstance.value.update(neighborEl as HTMLElement, {
          x: adj.newPosition.x,
          w: adj.newPosition.w,
        })
      }
    }
  }

  return true
}

// Initialize gridstack when switching to grid mode
function initGrid() {
  if (gridInstance.value) {
    return
  }
  if (!gridContainerRef.value) {
    return
  }

  // Initialize gridstack with auto: false so we can manually add widgets
  gridInstance.value = GridStack.init({
    column: 12,
    cellHeight: 80,
    margin: 8,
    animate: true,
    draggable: { handle: '.tps-block-drag-handle, .tps-widget-header, .tps-block-header' },
    // Enable resizing from all sides for maximum flexibility
    resizable: { handles: 'e,se,s,sw,w' },
    // Float mode allows blocks to be placed anywhere, not just stacked
    float: true,
    // Don't auto-initialize children - we'll do it manually after Vue renders
    auto: false,
  }, gridContainerRef.value)

  // Manually make each Vue-rendered element a gridstack widget
  const items = gridContainerRef.value.querySelectorAll('.grid-stack-item')
  items.forEach((el) => {
    gridInstance.value!.makeWidget(el as HTMLElement)
  })

  gridInstance.value.on('change', (_event: Event, items: GridStackNode[]) => {
    if (!items)
      return
    items.forEach((item) => {
      const block = editorBlocks.value.find(b => b.id === item.id)
      if (block) {
        block.gridPosition = {
          x: item.x ?? 0,
          y: item.y ?? 0,
          w: item.w ?? 12,
          h: item.h ?? 2,
        }
      }
    })
    handleUpdatePage()
  })

  // Register resize event listener for collision-aware resizing
  gridInstance.value.on('resize', (_event: Event, el: HTMLElement) => {
    const gsW = el.getAttribute('gs-w')
    if (gsW) {
      handleGridResize(el, Number.parseInt(gsW, 10))
    }
  })
}

// Watch for gridContainerRef to become available when in grid mode
watch(gridContainerRef, (newRef) => {
  if (newRef && layoutMode.value === 'grid' && !gridInstance.value) {
    initGrid()
  }
}, { flush: 'post' })

// Destroy gridstack instance
function destroyGrid() {
  if (gridInstance.value) {
    gridInstance.value.destroy(false)
    gridInstance.value = null
  }
}

// Convert blocks from linear to grid positions
// Creates a smart initial layout - widgets side by side, text full width
// Preserves existing grid positions if they exist
function convertLinearToGrid() {
  // Check if any blocks already have grid positions (returning from linear mode)
  const hasExistingPositions = editorBlocks.value.some(b => b.gridPosition)
  if (hasExistingPositions) {
    // Preserve existing positions, only assign new ones to blocks without positions
    editorBlocks.value.forEach((block) => {
      if (!block.gridPosition) {
        // Find the lowest y position to place new block at the bottom
        const maxY = editorBlocks.value.reduce((max, b) => {
          const pos = b.gridPosition
          if (pos) {
            return Math.max(max, pos.y + pos.h)
          }
          return max
        }, 0)
        const defaultWidth = isWidgetBlock(block) ? 6 : 12
        const defaultHeight = isWidgetBlock(block) ? 4 : 2
        block.gridPosition = {
          x: 0,
          y: maxY,
          w: defaultWidth,
          h: defaultHeight,
        }
      }
    })
    return
  }

  // No existing positions - create initial layout
  let yPos = 0
  let currentRow: Block[] = []

  const placeRow = () => {
    if (currentRow.length === 0)
      return

    // Calculate width for each item in row
    const itemWidth = Math.floor(12 / currentRow.length)

    currentRow.forEach((block, idx) => {
      const defaultHeight = isWidgetBlock(block) ? 4 : 2
      block.gridPosition = {
        x: idx * itemWidth,
        y: yPos,
        w: itemWidth,
        h: defaultHeight,
      }
    })

    // Move to next row (use max height from current row)
    const maxHeight = Math.max(...currentRow.map(b => isWidgetBlock(b) ? 4 : 2))
    yPos += maxHeight
    currentRow = []
  }

  editorBlocks.value.forEach((block) => {
    // Widgets can be placed side by side (up to 2 per row)
    if (isWidgetBlock(block)) {
      currentRow.push(block)
      if (currentRow.length >= 2) {
        placeRow()
      }
    }
    else {
      // Non-widget blocks: place any pending row first, then full width
      placeRow()
      const defaultHeight = 2
      block.gridPosition = {
        x: 0,
        y: yPos,
        w: 12,
        h: defaultHeight,
      }
      yPos += defaultHeight
    }
  })

  // Place any remaining items in the row
  placeRow()
}

// Convert blocks from grid to linear (sort by y, then x)
function convertGridToLinear() {
  editorBlocks.value.sort((a, b) => {
    const aY = a.gridPosition?.y ?? 0
    const bY = b.gridPosition?.y ?? 0
    if (aY !== bY)
      return aY - bY
    const aX = a.gridPosition?.x ?? 0
    const bX = b.gridPosition?.x ?? 0
    return aX - bX
  })
}

// Set layout mode explicitly
async function setLayoutMode(newMode: LayoutMode) {
  // Skip if already in this mode
  if (layoutMode.value === newMode) {
    return
  }

  if (newMode === 'grid') {
    // Converting to grid: assign positions
    convertLinearToGrid()
    layoutMode.value = 'grid'
    await nextTick()
    await nextTick() // Double nextTick to ensure DOM is ready
    initGrid()
  }
  else {
    // Converting to linear: sort and destroy grid
    destroyGrid()
    convertGridToLinear()
    layoutMode.value = 'linear'
  }

  // Update the page with new layout mode
  if (currentPage.value) {
    currentPage.value.layoutMode = newMode
  }
  handleUpdatePage()
  recordHistory()
}

// Get grid position for a block (with defaults)
function getBlockGridPosition(block: Block): GridPosition {
  return block.gridPosition ?? { x: 0, y: 0, w: 12, h: 2 }
}

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

// ============================================================================
// Reactive Field Linking / Filter State
// ============================================================================

interface ActiveFilter {
  id: string
  field: string
  value: string
  sourceWidgetId?: string
}

const activeFilters = ref<ActiveFilter[]>([])

// Check if there are any widget blocks in the editor
const hasWidgetBlocks = computed(() => {
  return editorBlocks.value.some(block => block.type === 'widget' || block.type === 'widgetGrid')
})

// Add a filter (e.g., when user clicks a value in a widget)
function addFilter(field: string, value: string, sourceWidgetId?: string) {
  // Check if filter already exists
  const existingIndex = activeFilters.value.findIndex(f => f.field === field)
  if (existingIndex >= 0) {
    // Update existing filter
    activeFilters.value[existingIndex] = {
      ...activeFilters.value[existingIndex],
      value,
      sourceWidgetId,
    }
  }
  else {
    // Add new filter
    activeFilters.value.push({
      id: generateId(),
      field,
      value,
      sourceWidgetId,
    })
  }
}

// Remove a specific filter
function removeFilter(filterId: string) {
  activeFilters.value = activeFilters.value.filter(f => f.id !== filterId)
}

// Clear all filters
function clearAllFilters() {
  activeFilters.value = []
}

// Apply filters to sample data (for demo purposes)
function getFilteredSampleData() {
  if (activeFilters.value.length === 0) {
    return widgetSampleData
  }

  return widgetSampleData.filter((row) => {
    return activeFilters.value.every((filter) => {
      const fieldValue = String(row[filter.field as keyof typeof row] ?? '')
      return fieldValue.toLowerCase().includes(filter.value.toLowerCase())
    })
  })
}

// Handle click on a row in a widget - enables click-to-filter
function handleWidgetRowClick(widgetBlockId: string, row: Record<string, unknown>) {
  // Find the first meaningful field to filter by (skip 'id')
  const filterableFields = Object.keys(row).filter(key => key !== 'id')
  if (filterableFields.length === 0)
    return

  // For now, use the 'category' field if available, otherwise the first field
  const filterField = filterableFields.includes('category') ? 'category' : filterableFields[0]
  const filterValue = String(row[filterField] ?? '')

  if (filterValue) {
    addFilter(filterField, filterValue, widgetBlockId)
  }
}

// Load pages on mount
onMounted(async () => {
  if (!storage.value) {
    isLoading.value = false
    return
  }

  try {
    const result = await storage.value.listPages()
    pages.value = result.items

    // Restore last page if available
    const lastPageId = getLastPage()
    if (lastPageId && pages.value.length > 0) {
      const lastPage = pages.value.find(p => p.id === lastPageId)
      if (lastPage) {
        await handleSelectPage(lastPageId)
      }
    }
  }
  catch (error) {
    console.error('Failed to load pages:', error)
  }
  finally {
    isLoading.value = false
  }
})

// Track current page ID to detect page switches vs updates
const currentPageId = ref<string | null>(null)

// Sync editor state when current page changes
watch(currentPage, async (page, _oldPage) => {
  const isNewPage = page?.id !== currentPageId.value

  if (isNewPage) {
    // Only reset state when switching to a different page
    destroyGrid()
    currentPageId.value = page?.id ?? null

    if (page) {
      editorTitle.value = page.title
      editorBlocks.value = [...page.blocks]
      layoutMode.value = page.layoutMode || 'grid'

      // Initialize grid if page was saved in grid mode
      if (layoutMode.value === 'grid') {
        // Double nextTick to ensure Vue has rendered both the container and items
        await nextTick()
        await nextTick()
        initGrid()
      }
    }
    else {
      editorTitle.value = ''
      editorBlocks.value = []
      layoutMode.value = 'grid'
    }
  }
  // If same page (just an update), don't reset editor state
})

// Handle page selection
async function handleSelectPage(pageId: string) {
  if (!storage.value)
    return

  try {
    const page = await storage.value.getPage(pageId)
    currentPage.value = page

    // Save as last page
    saveLastPage(pageId)
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
      layoutMode: layoutMode.value,
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
  recordHistory() // Save state before change for undo
  editorBlocks.value = editorBlocks.value.map((block): Block =>
    block.id === blockId ? { ...block, ...updates } as Block : block,
  )
  handleUpdatePage()
}

// Handle block deletion
function handleBlockDelete(blockId: string) {
  recordHistory() // Save state before change for undo

  // Remove from gridstack if in grid mode
  if (layoutMode.value === 'grid' && gridInstance.value) {
    const el = gridContainerRef.value?.querySelector(`[gs-id="${blockId}"]`)
    if (el) {
      gridInstance.value.removeWidget(el as HTMLElement, false)
    }
  }

  editorBlocks.value = editorBlocks.value.filter(block => block.id !== blockId)
  handleUpdatePage()
}

// Handle add block
async function handleAddBlock(type: Block['type']) {
  recordHistory() // Save state before change for undo
  const newBlock = createBlock(type)

  // Assign grid position if in grid mode
  if (layoutMode.value === 'grid') {
    // Find the lowest y position to place new block at the bottom
    const maxY = editorBlocks.value.reduce((max, b) => {
      const pos = b.gridPosition
      if (pos) {
        return Math.max(max, pos.y + pos.h)
      }
      return max
    }, 0)

    newBlock.gridPosition = {
      x: 0,
      y: maxY,
      w: isWidgetBlock(newBlock) ? 6 : 12,
      h: isWidgetBlock(newBlock) ? 4 : 2,
    }
  }

  editorBlocks.value = [...editorBlocks.value, newBlock]
  showBlockMenu.value = false

  // Tell gridstack about the new Vue-rendered element
  if (layoutMode.value === 'grid' && gridInstance.value) {
    await nextTick()
    // Find the newly rendered element and make it a gridstack widget
    const newEl = gridContainerRef.value?.querySelector(`[gs-id="${newBlock.id}"]`) as HTMLElement
    if (newEl) {
      gridInstance.value.makeWidget(newEl)
    }
  }

  handleUpdatePage()
}

// Handle block reorder (called after drag-and-drop)
function handleBlockReorder() {
  recordHistory() // Save state before change for undo
  // vuedraggable already updates editorBlocks via v-model
  // We just need to persist the new order
  handleUpdatePage()
}

// ============================================================================
// Columns Block - Nested Block Handling
// ============================================================================

// Open the add block menu for a specific column
function openColumnAddBlockMenu(parentBlockId: string, columnIndex: number) {
  activeColumnMenu.value = `${parentBlockId}:${columnIndex}`
}

// Close the column add block menu
function closeColumnAddBlockMenu() {
  activeColumnMenu.value = null
}

// Check if a column's add block menu is active
function isColumnMenuActive(parentBlockId: string, columnIndex: number): boolean {
  return activeColumnMenu.value === `${parentBlockId}:${columnIndex}`
}

// Add a block to a specific column within a columns block
function handleAddBlockToColumn(parentBlockId: string, columnIndex: number, blockType: Block['type']) {
  const newBlock = createBlock(blockType)

  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === parentBlockId && block.type === 'columns') {
      const columnsBlock = block as Block & { type: 'columns', columns: Array<{ id: string, width: number, blocks: Block[] }> }
      const newColumns = columnsBlock.columns.map((col, idx) => {
        if (idx === columnIndex) {
          return { ...col, blocks: [...col.blocks, newBlock] }
        }
        return col
      })
      return { ...columnsBlock, columns: newColumns }
    }
    return block
  })

  closeColumnAddBlockMenu()
  handleUpdatePage()
}

// Update a nested block within a column
function handleNestedBlockUpdate(parentBlockId: string, columnIndex: number, blockId: string, updates: Partial<Block>) {
  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === parentBlockId && block.type === 'columns') {
      const columnsBlock = block as Block & { type: 'columns', columns: Array<{ id: string, width: number, blocks: Block[] }> }
      const newColumns = columnsBlock.columns.map((col, idx) => {
        if (idx === columnIndex) {
          return {
            ...col,
            blocks: col.blocks.map((b): Block =>
              b.id === blockId ? { ...b, ...updates } as Block : b,
            ),
          }
        }
        return col
      })
      return { ...columnsBlock, columns: newColumns }
    }
    return block
  })
  handleUpdatePage()
}

// Delete a nested block within a column
function handleNestedBlockDelete(parentBlockId: string, columnIndex: number, blockId: string) {
  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === parentBlockId && block.type === 'columns') {
      const columnsBlock = block as Block & { type: 'columns', columns: Array<{ id: string, width: number, blocks: Block[] }> }
      const newColumns = columnsBlock.columns.map((col, idx) => {
        if (idx === columnIndex) {
          return {
            ...col,
            blocks: col.blocks.filter(b => b.id !== blockId),
          }
        }
        return col
      })
      return { ...columnsBlock, columns: newColumns }
    }
    return block
  })
  handleUpdatePage()
}

// ============================================================================
// Grid Block - Masonry Layout Handling
// ============================================================================

type GridBlock = Block & { type: 'grid', items: Array<{ block: Block, colSpan?: number, rowSpan?: number }> }

// Add a new item to a grid block
function handleGridAddItem(gridBlockId: string) {
  const newBlock: Block = { id: generateId(), type: 'stat', value: '0', label: 'New Stat', size: 'medium' } as Block
  const newItem = { block: newBlock, colSpan: 1, rowSpan: 1 }

  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === gridBlockId && block.type === 'grid') {
      const gridBlock = block as GridBlock
      return { ...gridBlock, items: [...gridBlock.items, newItem] }
    }
    return block
  })
  handleUpdatePage()
}

// Update span for a grid item
function handleGridItemSpan(gridBlockId: string, itemIndex: number, spanType: 'colSpan' | 'rowSpan', delta: number) {
  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === gridBlockId && block.type === 'grid') {
      const gridBlock = block as GridBlock
      const newItems = gridBlock.items.map((item, idx) => {
        if (idx === itemIndex) {
          const currentSpan = item[spanType] || 1
          const newSpan = Math.max(1, Math.min(gridBlock.columns, currentSpan + delta))
          return { ...item, [spanType]: newSpan }
        }
        return item
      })
      return { ...gridBlock, items: newItems }
    }
    return block
  })
  handleUpdatePage()
}

// Delete a grid item
function handleGridItemDelete(gridBlockId: string, itemIndex: number) {
  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === gridBlockId && block.type === 'grid') {
      const gridBlock = block as GridBlock
      return { ...gridBlock, items: gridBlock.items.filter((_, idx) => idx !== itemIndex) }
    }
    return block
  })
  handleUpdatePage()
}

// Update a block within a grid item
function handleGridItemBlockUpdate(gridBlockId: string, itemIndex: number, updates: Partial<Block>) {
  editorBlocks.value = editorBlocks.value.map((block): Block => {
    if (block.id === gridBlockId && block.type === 'grid') {
      const gridBlock = block as GridBlock
      const newItems = gridBlock.items.map((item, idx) => {
        if (idx === itemIndex) {
          return { ...item, block: { ...item.block, ...updates } as Block }
        }
        return item
      })
      return { ...gridBlock, items: newItems }
    }
    return block
  })
  handleUpdatePage()
}

// Grid item resize state
const gridResizeState = ref<{ gridBlockId: string, itemIndex: number, type: 'col' | 'row', startX: number, startY: number, startSpan: number } | null>(null)

// Start resizing a grid item
function handleGridItemResizeStart(gridBlockId: string, itemIndex: number, resizeType: 'col' | 'row', event: MouseEvent) {
  const gridBlock = editorBlocks.value.find(b => b.id === gridBlockId && b.type === 'grid') as GridBlock | undefined
  if (!gridBlock)
    return

  const item = gridBlock.items[itemIndex]
  const startSpan = resizeType === 'col' ? (item.colSpan || 1) : (item.rowSpan || 1)

  gridResizeState.value = {
    gridBlockId,
    itemIndex,
    type: resizeType,
    startX: event.clientX,
    startY: event.clientY,
    startSpan,
  }

  document.addEventListener('mousemove', handleGridItemResizeMove)
  document.addEventListener('mouseup', handleGridItemResizeEnd)
}

// Handle resize movement
function handleGridItemResizeMove(event: MouseEvent) {
  if (!gridResizeState.value)
    return

  const { gridBlockId, itemIndex, type, startX, startY, startSpan } = gridResizeState.value
  const gridBlock = editorBlocks.value.find(b => b.id === gridBlockId && b.type === 'grid') as GridBlock | undefined
  if (!gridBlock)
    return

  const delta = type === 'col' ? event.clientX - startX : event.clientY - startY
  const spanDelta = Math.round(delta / 100) // 100px per span unit
  const newSpan = Math.max(1, Math.min(gridBlock.columns, startSpan + spanDelta))

  if (type === 'col') {
    handleGridItemSpan(gridBlockId, itemIndex, 'colSpan', newSpan - (gridBlock.items[itemIndex].colSpan || 1))
  }
  else {
    handleGridItemSpan(gridBlockId, itemIndex, 'rowSpan', newSpan - (gridBlock.items[itemIndex].rowSpan || 1))
  }
}

// End resize
function handleGridItemResizeEnd() {
  gridResizeState.value = null
  document.removeEventListener('mousemove', handleGridItemResizeMove)
  document.removeEventListener('mouseup', handleGridItemResizeEnd)
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

// Widget configuration modal functions
function openWidgetConfigModal(block: WidgetBlock) {
  widgetConfigBlockId.value = block.id
  widgetConfigTitle.value = block.titleOverride || ''
  widgetConfigHeight.value = typeof block.height === 'number' ? block.height : 400
  widgetConfigVisualizationType.value = (block.metadata?.visualizationType as 'table' | 'pivot' | 'chart') || 'table'
  widgetConfigShowTitle.value = block.showTitle !== false
  // Load datasource from block metadata
  widgetConfigDatasourceId.value = (block.metadata?.datasourceId as string) || 'sample'
  showWidgetConfigModal.value = true
}

function closeWidgetConfigModal() {
  showWidgetConfigModal.value = false
  widgetConfigBlockId.value = null
  widgetConfigTitle.value = ''
  widgetConfigHeight.value = 400
  widgetConfigVisualizationType.value = 'table'
  widgetConfigShowTitle.value = true
  widgetConfigDatasourceId.value = 'sample'
}

function handleWidgetConfigOverlayClick() {
  closeWidgetConfigModal()
}

// Share modal functions
async function openShareModal() {
  if (!currentPage.value || !storage.value)
    return
  // Try to get existing share settings
  try {
    const settings = await storage.value.getShareSettings(currentPage.value.id)
    if (settings?.enabled) {
      // For now, open modal and let it show current settings
      // In production, would fetch active share token
    }
  }
  catch (err) {
    console.warn('Could not load share settings:', err)
  }
  showShareModal.value = true
}

async function handleShareSave(settings: Partial<PageShareSettings>) {
  if (!currentPage.value || !storage.value)
    return

  try {
    // Capture thumbnail before sharing if public
    let thumbnailUrl: string | undefined
    const editorContent = document.querySelector('.tps-editor-content') as HTMLElement

    if (editorContent && settings.visibility === 'public') {
      try {
        thumbnailUrl = await capturePageThumbnail(editorContent)
      }
      catch (err) {
        console.warn('Failed to capture thumbnail:', err)
      }
    }

    if (currentPageShare.value) {
      await storage.value.updateShareSettings(currentPage.value.id, settings)
    }
    else {
      const share = await storage.value.createShare(currentPage.value.id, settings)
      currentPageShare.value = share
    }
    // Keep modal open to show the link
    // Note: thumbnailUrl is captured but storage schema changes needed to persist it
    if (thumbnailUrl) {
      console.log('Thumbnail captured for share:', thumbnailUrl.substring(0, 50))
    }
  }
  catch (err) {
    console.error('Failed to create share:', err)
  }
}

async function handleShareRevoke() {
  if (!currentPageShare.value || !storage.value)
    return

  try {
    await storage.value.revokeShare(currentPageShare.value.token)
    currentPageShare.value = null
    showShareModal.value = false
  }
  catch (err) {
    console.error('Failed to revoke share:', err)
  }
}

// Handle datasource selection change in widget config
function handleWidgetDatasourceChange(datasourceId: string) {
  widgetConfigDatasourceId.value = datasourceId
}

function handleSaveWidgetConfig() {
  if (!widgetConfigBlockId.value)
    return

  const isSampleData = widgetConfigDatasourceId.value === 'sample'
  const updates: Partial<WidgetBlock> = {
    titleOverride: widgetConfigTitle.value || undefined,
    height: widgetConfigHeight.value,
    widgetId: isSampleData ? 'sample' : widgetConfigDatasourceId.value,
    showTitle: widgetConfigShowTitle.value,
    metadata: {
      visualizationType: widgetConfigVisualizationType.value,
      datasourceId: isSampleData ? undefined : widgetConfigDatasourceId.value,
    },
  }

  handleBlockUpdate(widgetConfigBlockId.value, updates)
  closeWidgetConfigModal()
}

// ============================================================================
// Data Source Management
// ============================================================================

// Data source state
const datasources = ref<DatasourceConfig[]>([])
const selectedDatasourceId = ref<string | null>(null)
const showDatasourceModal = ref(false)
const editingDatasource = ref<DatasourceConfig | null>(null)
const datasourceTestStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
const datasourceTestMessage = ref('')

// Form state for new/edit datasource
const dsFormName = ref('')
const dsFormType = ref<'postgres' | 'snowflake'>('postgres')
// Postgres fields
const dsFormHost = ref('')
const dsFormPort = ref(5432)
const dsFormDatabase = ref('')
const dsFormUsername = ref('')
const dsFormPassword = ref('')
// Snowflake fields
const dsFormAccount = ref('')
const dsFormWarehouse = ref('')
const dsFormSchema = ref('')
const dsFormRole = ref('')
// Snowflake auth method
const dsFormAuthMethod = ref<'password' | 'keypair' | 'externalbrowser'>('password')
const dsFormPrivateKey = ref('')
const dsFormPrivateKeyPassphrase = ref('')

// Load datasources from server
async function loadDatasourcesFromServer(): Promise<DatasourceConfig[]> {
  if (!props.apiEndpoint || !props.userId) {
    return []
  }

  try {
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list-datasources',
        userId: props.userId,
      }),
    })

    if (!response.ok) {
      console.error('Failed to load datasources from server:', response.status)
      return []
    }

    const data = await response.json()
    if (data.datasources && Array.isArray(data.datasources)) {
      // Convert server format to local format (no credentials exposed)
      return data.datasources.map((ds: {
        id: string
        name: string
        type: string
        authMethod?: string
        connectionConfig?: Record<string, unknown>
      }) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type as 'postgres' | 'snowflake',
        host: ds.connectionConfig?.host as string | undefined,
        port: ds.connectionConfig?.port as number | undefined,
        database: ds.connectionConfig?.database as string | undefined,
        schema: ds.connectionConfig?.schema as string | undefined,
        account: ds.connectionConfig?.account as string | undefined,
        warehouse: ds.connectionConfig?.warehouse as string | undefined,
        role: ds.connectionConfig?.role as string | undefined,
        authMethod: (ds.authMethod || 'password') as 'password' | 'keypair' | 'externalbrowser',
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    }
    return []
  }
  catch (e) {
    console.error('Failed to load datasources from server:', e)
    return []
  }
}

// Initialize datasources on mount
onMounted(async () => {
  if (props.apiEndpoint && props.userId) {
    datasources.value = await loadDatasourcesFromServer()
  }
})

// Open datasource modal for creating new
function openDatasourceModal() {
  editingDatasource.value = null
  resetDatasourceForm()
  showDatasourceModal.value = true
}

// Open datasource modal for editing
function openEditDatasource(ds: DatasourceConfig) {
  editingDatasource.value = ds
  dsFormName.value = ds.name
  dsFormType.value = ds.type as 'postgres' | 'snowflake'
  dsFormHost.value = ds.host || ''
  dsFormPort.value = ds.port || 5432
  dsFormDatabase.value = ds.database || ''
  dsFormUsername.value = ds.username || ''
  dsFormPassword.value = ds.password || ''
  dsFormAccount.value = ds.account || ''
  dsFormWarehouse.value = ds.warehouse || ''
  dsFormSchema.value = ds.schema || ''
  dsFormRole.value = ds.role || ''
  dsFormAuthMethod.value = (ds.authMethod as 'password' | 'keypair' | 'externalbrowser') || 'password'
  dsFormPrivateKey.value = ds.privateKey || ''
  dsFormPrivateKeyPassphrase.value = ds.privateKeyPassphrase || ''
  showDatasourceModal.value = true
}

// Select a datasource for querying
function selectDatasource(ds: DatasourceConfig) {
  selectedDatasourceId.value = ds.id
}

// Reset form to defaults
function resetDatasourceForm() {
  dsFormName.value = ''
  dsFormType.value = 'postgres'
  dsFormHost.value = ''
  dsFormPort.value = 5432
  dsFormDatabase.value = ''
  dsFormUsername.value = ''
  dsFormPassword.value = ''
  dsFormAccount.value = ''
  dsFormWarehouse.value = ''
  dsFormSchema.value = ''
  dsFormRole.value = ''
  dsFormAuthMethod.value = 'password'
  dsFormPrivateKey.value = ''
  dsFormPrivateKeyPassphrase.value = ''
  datasourceTestStatus.value = 'idle'
  datasourceTestMessage.value = ''
}

// Close datasource modal
function closeDatasourceModal() {
  showDatasourceModal.value = false
  editingDatasource.value = null
  resetDatasourceForm()
}

// Test connection
async function handleTestConnection() {
  datasourceTestStatus.value = 'testing'
  datasourceTestMessage.value = 'Testing connection...'

  // If no API endpoint, simulate for local-only mode
  if (!props.apiEndpoint || !props.userId) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    datasourceTestStatus.value = 'success'
    datasourceTestMessage.value = 'Connection test simulated (no API endpoint configured)'
    return
  }

  try {
    const isSnowflake = dsFormType.value === 'snowflake'
    const tempConfig = {
      name: dsFormName.value || 'Test Connection',
      type: dsFormType.value,
      authMethod: isSnowflake ? dsFormAuthMethod.value : 'password',
      connectionConfig: dsFormType.value === 'postgres'
        ? { host: dsFormHost.value, port: dsFormPort.value, database: dsFormDatabase.value, schema: dsFormSchema.value || 'public' }
        : { account: dsFormAccount.value, warehouse: dsFormWarehouse.value, database: dsFormDatabase.value, schema: dsFormSchema.value, role: dsFormRole.value },
      credentials: dsFormType.value === 'postgres' || dsFormAuthMethod.value === 'password'
        ? { username: dsFormUsername.value, password: dsFormPassword.value }
        : dsFormAuthMethod.value === 'keypair'
          ? { username: dsFormUsername.value, privateKey: dsFormPrivateKey.value, privateKeyPassphrase: dsFormPrivateKeyPassphrase.value }
          : { username: dsFormUsername.value },
    }

    // Create datasource temporarily to test
    const createResponse = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-datasource',
        userId: props.userId,
        userKey: props.userKey || props.userId,
        datasourceConfig: tempConfig,
      }),
    })
    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(errorText || `Server error: ${createResponse.status}`)
    }
    let createData
    try {
      createData = await createResponse.json()
    }
    catch {
      throw new Error('Server returned invalid JSON. Is the API server running?')
    }
    if (createData.error) {
      throw new Error(createData.error)
    }

    const tempDatasourceId = createData.datasourceId || createData.id
    if (!tempDatasourceId) {
      throw new Error(`Server did not return datasource ID. Response: ${JSON.stringify(createData)}`)
    }

    // Test the connection
    const testResponse = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test-datasource',
        datasourceId: tempDatasourceId,
        userId: props.userId,
        userKey: props.userKey || props.userId,
      }),
    })
    if (!testResponse.ok) {
      const errorText = await testResponse.text()
      throw new Error(errorText || `Test failed: ${testResponse.status}`)
    }
    let testData
    try {
      testData = await testResponse.json()
    }
    catch {
      throw new Error('Server returned invalid response')
    }

    // Delete the temporary datasource - wait for it and log errors
    try {
      const deleteResponse = await fetch(props.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-datasource',
          datasourceId: tempDatasourceId,
          userId: props.userId,
        }),
      })
      if (!deleteResponse.ok) {
        console.warn('Failed to delete temporary test datasource:', await deleteResponse.text())
      }
    }
    catch (deleteErr) {
      console.warn('Failed to delete temporary test datasource:', deleteErr)
    }

    if (testData.status?.connected) {
      datasourceTestStatus.value = 'success'
      datasourceTestMessage.value = `Connection successful! ${testData.status.version ? `(${testData.status.version})` : ''}`
    }
    else {
      datasourceTestStatus.value = 'error'
      datasourceTestMessage.value = testData.status?.error || 'Connection failed'
    }
  }
  catch (err) {
    datasourceTestStatus.value = 'error'
    datasourceTestMessage.value = err instanceof Error ? err.message : 'Connection test failed'
  }
}

// Save datasource (server-only, no local storage)
async function handleSaveDatasource() {
  if (!props.apiEndpoint || !props.userId) {
    alert('API endpoint not configured. Cannot save datasource.')
    return
  }

  const now = new Date()
  const isSnowflake = dsFormType.value === 'snowflake'
  const isEditing = Boolean(editingDatasource.value)

  // Build the config for the API (credentials are encrypted server-side)
  const apiConfig = {
    name: dsFormName.value.trim(),
    type: dsFormType.value,
    authMethod: isSnowflake ? dsFormAuthMethod.value : 'password',
    connectionConfig: dsFormType.value === 'postgres'
      ? { host: dsFormHost.value, port: dsFormPort.value, database: dsFormDatabase.value, schema: dsFormSchema.value || 'public' }
      : { account: dsFormAccount.value, warehouse: dsFormWarehouse.value, database: dsFormDatabase.value, schema: dsFormSchema.value, role: dsFormRole.value },
    credentials: dsFormType.value === 'postgres' || dsFormAuthMethod.value === 'password'
      ? { username: dsFormUsername.value, password: dsFormPassword.value }
      : dsFormAuthMethod.value === 'keypair'
        ? { username: dsFormUsername.value, privateKey: dsFormPrivateKey.value, privateKeyPassphrase: dsFormPrivateKeyPassphrase.value }
        : { username: dsFormUsername.value },
  }

  try {
    let serverId: string

    if (isEditing && editingDatasource.value) {
      // Update existing datasource
      const response = await fetch(props.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-datasource',
          datasourceId: editingDatasource.value.id,
          userId: props.userId,
          userKey: props.userKey || props.userId,
          datasourceConfig: apiConfig,
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Failed to update: ${response.status}`)
      }
      serverId = editingDatasource.value.id
    }
    else {
      // Create new datasource
      const response = await fetch(props.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-datasource',
          userId: props.userId,
          userKey: props.userKey || props.userId,
          datasourceConfig: apiConfig,
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `Failed to create: ${response.status}`)
      }
      const data = await response.json()
      serverId = data.datasourceId || data.id
    }

    // Update local state with non-sensitive info only (no credentials)
    const dsConfig: DatasourceConfig = {
      id: serverId,
      name: dsFormName.value.trim(),
      type: dsFormType.value,
      host: dsFormType.value === 'postgres' ? dsFormHost.value : undefined,
      port: dsFormType.value === 'postgres' ? dsFormPort.value : undefined,
      database: dsFormDatabase.value || undefined,
      schema: dsFormSchema.value || undefined,
      account: isSnowflake ? dsFormAccount.value : undefined,
      warehouse: isSnowflake ? dsFormWarehouse.value : undefined,
      role: isSnowflake ? dsFormRole.value : undefined,
      authMethod: isSnowflake ? dsFormAuthMethod.value : 'password',
      createdAt: editingDatasource.value?.createdAt || now,
      updatedAt: now,
    }

    if (isEditing) {
      datasources.value = datasources.value.map(d =>
        d.id === dsConfig.id ? dsConfig : d,
      )
    }
    else {
      datasources.value = [...datasources.value, dsConfig]
    }

    closeDatasourceModal()
  }
  catch (err) {
    console.error('Failed to save datasource:', err)
    alert(`Failed to save datasource: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

// Delete datasource
async function handleDeleteDatasource(dsId: string, event: MouseEvent) {
  event.stopPropagation()
  if (!window.confirm('Are you sure you want to delete this data source?')) {
    return
  }

  // Call server to delete datasource
  if (props.apiEndpoint && props.userId) {
    try {
      const response = await fetch(props.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-datasource',
          datasourceId: dsId,
          userId: props.userId,
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to delete datasource:', errorText)
        alert(`Failed to delete: ${errorText}`)
        return
      }
    }
    catch (err) {
      console.error('Failed to delete datasource:', err)
      alert(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`)
      return
    }
  }

  // Update local state
  datasources.value = datasources.value.filter(d => d.id !== dsId)
}

// Get datasource type label
function getDatasourceTypeLabel(type: string): string {
  switch (type) {
    case 'postgres':
      return 'PostgreSQL'
    case 'snowflake':
      return 'Snowflake'
    default:
      return type
  }
}

// ============================================================================
// Template Helpers
// ============================================================================

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
    case 'image':
      return { id, type: 'image', src: '', alt: '', caption: '', align: 'center', shape: 'rectangle', aspectRatio: 'free' }
    case 'callout':
      return { id, type: 'callout', content: '', style: 'info', title: '' }
    case 'columns':
      return {
        id,
        type: 'columns',
        columns: [
          { id: generateId(), width: 1, blocks: [] },
          { id: generateId(), width: 1, blocks: [] },
        ],
        gap: 16,
      }
    case 'stat':
      return { id, type: 'stat', value: '0', label: 'Label', size: 'medium' }
    case 'progress':
      return { id, type: 'progress', value: 50, label: 'Progress', showValue: true, variant: 'bar', size: 'medium' }
    case 'spacer':
      return { id, type: 'spacer', height: 48 }
    case 'quote':
      return { id, type: 'quote', content: '', author: '', source: '', style: 'simple' }
    case 'grid':
      return {
        id,
        type: 'grid',
        columns: 3,
        gap: 16,
        rowHeight: 'auto',
        items: [],
        dense: false,
      }
    default:
      return { id, type: 'text', content: '' }
  }
}

// Get initial blocks for a template
function getTemplateBlocks(template: PageTemplate): Block[] {
  switch (template) {
    case 'article':
      return [
        { id: generateId(), type: 'heading', content: 'Article Title', level: 1 },
        { id: generateId(), type: 'text', content: 'Write your introduction here. This template is optimized for long-form content with embedded data visualizations.' },
        { id: generateId(), type: 'heading', content: 'Section Heading', level: 2 },
        { id: generateId(), type: 'text', content: 'Add your content and embed widgets to visualize data alongside your narrative.' },
        { id: generateId(), type: 'widget', widgetId: '', showTitle: true, titleOverride: 'Data Visualization' } as WidgetBlock,
        { id: generateId(), type: 'heading', content: 'Conclusion', level: 2 },
        { id: generateId(), type: 'text', content: 'Summarize your findings here.' },
      ]
    case 'dashboard':
      return [
        { id: generateId(), type: 'widget', widgetId: '', showTitle: true, titleOverride: 'Widget 1' } as WidgetBlock,
      ]
    case 'infographic':
      return [
        { id: generateId(), type: 'heading', content: 'Infographic Title', level: 1 },
        { id: generateId(), type: 'text', content: 'A brief subtitle or description for your infographic.' },
        { id: generateId(), type: 'divider' },
        { id: generateId(), type: 'widget', widgetId: '', showTitle: true, titleOverride: 'Key Metrics' } as WidgetBlock,
        { id: generateId(), type: 'divider' },
        { id: generateId(), type: 'widget', widgetId: '', showTitle: true, titleOverride: 'Main Visualization' } as WidgetBlock,
        { id: generateId(), type: 'divider' },
        { id: generateId(), type: 'text', content: 'Add additional context or footnotes here.' },
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

// ============================================================================
// Resizable Blocks
// ============================================================================

// Track which block is being resized
const resizingBlockId = ref<string | null>(null)

// Constants for resize constraints
const MIN_HEIGHT = 200
const MAX_HEIGHT = 1000
const MIN_WIDTH = 200

// Handle resize start
function handleResizeStart(blockId: string, event: MouseEvent | TouchEvent) {
  event.preventDefault()
  event.stopPropagation()

  resizingBlockId.value = blockId
  document.body.classList.add('tps-resizing')

  const block = editorBlocks.value.find(b => b.id === blockId)
  if (!block)
    return

  const blockElement = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement
  if (!blockElement)
    return

  const startY = 'touches' in event ? event.touches[0].clientY : event.clientY
  const startHeight = blockElement.offsetHeight
  const startWidth = blockElement.offsetWidth

  // Track if shift is held for aspect ratio lock (images)
  const isImage = block.type === 'image'
  const aspectRatio = startWidth / startHeight

  function handleMouseMove(e: MouseEvent | TouchEvent) {
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = currentY - startY
    const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + deltaY))

    // For images with shift key, maintain aspect ratio
    if (isImage && (e as MouseEvent).shiftKey) {
      const newWidth = newHeight * aspectRatio
      handleBlockUpdate(blockId, {
        height: newHeight,
        width: Math.max(MIN_WIDTH, newWidth),
      })
    }
    else {
      handleBlockUpdate(blockId, { height: newHeight })
    }
  }

  function handleMouseUp() {
    resizingBlockId.value = null
    document.body.classList.remove('tps-resizing')
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('touchmove', handleMouseMove)
    document.removeEventListener('touchend', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  document.addEventListener('touchmove', handleMouseMove)
  document.addEventListener('touchend', handleMouseUp)
}

// Get block height style from stored config
function getBlockHeightStyle(block: Block): string | undefined {
  if ('height' in block && block.height) {
    return typeof block.height === 'number' ? `${block.height}px` : block.height
  }
  return undefined
}

// ============================================================================
// Image Block Drag-and-Drop Upload
// ============================================================================

// Track which image block is being dragged over
const imageDragOverBlockId = ref<string | null>(null)

// Track loading state for image uploads
const imageLoadingBlockId = ref<string | null>(null)

// Handle image file drop
function handleImageDrop(blockId: string, event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  imageDragOverBlockId.value = null

  const file = event.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) {
    imageLoadingBlockId.value = blockId
    const reader = new FileReader()
    reader.onload = () => {
      handleBlockUpdate(blockId, { src: reader.result as string })
      imageLoadingBlockId.value = null
    }
    reader.onerror = () => {
      imageLoadingBlockId.value = null
    }
    reader.readAsDataURL(file)
  }
}

// Handle drag over for image drop
function handleImageDragOver(blockId: string, event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  imageDragOverBlockId.value = blockId
}

// Handle drag leave for image drop
function handleImageDragLeave(blockId: string, event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (imageDragOverBlockId.value === blockId) {
    imageDragOverBlockId.value = null
  }
}

// Handle file input change for image upload
function handleImageFileChange(blockId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file && file.type.startsWith('image/')) {
    imageLoadingBlockId.value = blockId
    const reader = new FileReader()
    reader.onload = () => {
      handleBlockUpdate(blockId, { src: reader.result as string })
      imageLoadingBlockId.value = null
    }
    reader.onerror = () => {
      imageLoadingBlockId.value = null
    }
    reader.readAsDataURL(file)
  }
  // Reset file input so same file can be selected again
  input.value = ''
}

// Trigger file input click for image upload
function triggerImageFileInput(blockId: string) {
  const input = document.getElementById(`image-file-${blockId}`) as HTMLInputElement
  input?.click()
}

// Trigger file input click for grid mode image upload
function triggerGridImageFileInput(blockId: string) {
  const input = document.getElementById(`grid-image-file-${blockId}`) as HTMLInputElement
  input?.click()
}

// Get image container classes based on shape and aspect ratio
function getImageContainerClasses(block: Block & { type: 'image', shape?: string, aspectRatio?: string }): string[] {
  const classes = [`tps-image-preview-container`, `tps-align-${block.align || 'center'}`]

  if (block.shape === 'circle') {
    classes.push('tps-image-circle')
  }
  else if (block.shape === 'rounded') {
    classes.push('tps-image-rounded')
  }

  if (block.aspectRatio && block.aspectRatio !== 'free') {
    classes.push(`tps-image-aspect-${block.aspectRatio.replace(':', '-')}`)
  }

  return classes
}

// Clear image from block
function handleClearImage(blockId: string) {
  handleBlockUpdate(blockId, { src: '' })
}

// ============================================================================
// Page Version History
// ============================================================================

// Version storage key prefix
const VERSION_STORAGE_PREFIX = 'tinypivot-versions-'

// Version state
const showVersionPanel = ref(false)
const versions = ref<PageVersionSummary[]>([])
const previewingVersionId = ref<string | null>(null)
const previewBlocks = ref<Block[] | null>(null)
const newVersionDescription = ref('')

// Load versions for the current page
function loadVersions(pageId: string): PageVersionSummary[] {
  try {
    const stored = localStorage.getItem(`${VERSION_STORAGE_PREFIX}${pageId}`)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.map((v: PageVersionSummary) => ({
        ...v,
        createdAt: new Date(v.createdAt),
      }))
    }
  }
  catch (error) {
    console.error('Failed to load versions:', error)
  }
  return []
}

// Save versions for a page
function saveVersions(pageId: string, versionList: PageVersionSummary[]) {
  try {
    localStorage.setItem(`${VERSION_STORAGE_PREFIX}${pageId}`, JSON.stringify(versionList))
  }
  catch (error) {
    console.error('Failed to save versions:', error)
  }
}

// Load versions when page changes
watch(currentPage, (page) => {
  if (page) {
    versions.value = loadVersions(page.id)
  }
  else {
    versions.value = []
  }
  // Reset preview state
  previewingVersionId.value = null
  previewBlocks.value = null
})

// Create a new version
function createVersion(description?: string) {
  if (!currentPage.value)
    return

  const pageId = currentPage.value.id
  const existingVersions = loadVersions(pageId)

  // Calculate content hash to check if anything changed
  const currentHash = calculateContentHash(editorBlocks.value)
  const latestVersionSummary = existingVersions[0]

  // Check if content has changed by comparing with latest full version
  if (latestVersionSummary && !description) {
    const latestFullVersion = getFullVersion(latestVersionSummary.id)
    if (latestFullVersion?.contentHash === currentHash) {
      return // No changes, skip creating version
    }
  }

  const newVersion: PageVersionSummary = {
    id: generateId(),
    pageId,
    version: (existingVersions[0]?.version || 0) + 1,
    title: editorTitle.value,
    createdAt: new Date(),
    createdBy: props.userId,
    changeDescription: description || undefined,
    blockCount: editorBlocks.value.length,
    widgetCount: editorBlocks.value.filter(b => b.type === 'widget' || b.type === 'widgetGrid').length,
  }

  // Store full blocks separately for this version
  const fullVersion = {
    ...newVersion,
    blocks: JSON.parse(JSON.stringify(editorBlocks.value)),
    contentHash: currentHash,
  }
  localStorage.setItem(`${VERSION_STORAGE_PREFIX}${pageId}-${newVersion.id}`, JSON.stringify(fullVersion))

  // Update versions list (newest first)
  const updatedVersions = [newVersion, ...existingVersions]

  // Prune old versions if exceeding max
  if (updatedVersions.length > MAX_VERSIONS_PER_PAGE) {
    const removed = updatedVersions.splice(MAX_VERSIONS_PER_PAGE)
    // Clean up storage for removed versions
    removed.forEach((v) => {
      localStorage.removeItem(`${VERSION_STORAGE_PREFIX}${pageId}-${v.id}`)
    })
  }

  saveVersions(pageId, updatedVersions)
  versions.value = updatedVersions
  newVersionDescription.value = ''
}

// Get full version data (with blocks)
function getFullVersion(versionId: string) {
  if (!currentPage.value)
    return null

  try {
    const stored = localStorage.getItem(`${VERSION_STORAGE_PREFIX}${currentPage.value.id}-${versionId}`)
    if (stored) {
      return JSON.parse(stored)
    }
  }
  catch (error) {
    console.error('Failed to load version:', error)
  }
  return null
}

// Preview a version
function previewVersion(versionId: string) {
  const fullVersion = getFullVersion(versionId)
  if (fullVersion) {
    previewingVersionId.value = versionId
    previewBlocks.value = fullVersion.blocks
  }
}

// Cancel preview
function cancelPreview() {
  previewingVersionId.value = null
  previewBlocks.value = null
}

// Restore a version
function restoreVersion(versionId: string) {
  const fullVersion = getFullVersion(versionId)
  if (!fullVersion || !currentPage.value)
    return

  // Create a backup of current state before restoring
  createVersion('Auto-backup before restore')

  // Restore the blocks
  editorBlocks.value = JSON.parse(JSON.stringify(fullVersion.blocks))
  if (fullVersion.title) {
    editorTitle.value = fullVersion.title
  }

  // Save the restored state
  handleUpdatePage()

  // Clear preview state
  cancelPreview()

  // Create a new version marking this as a restore point
  createVersion(`Restored from version ${fullVersion.version}`)
}

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1)
    return 'Just now'
  if (minutes < 60)
    return `${minutes}m ago`
  if (hours < 24)
    return `${hours}h ago`
  if (days < 7)
    return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

// Check if currently previewing
const isPreviewMode = computed(() => previewingVersionId.value !== null)

// Toggle version panel
function toggleVersionPanel() {
  showVersionPanel.value = !showVersionPanel.value
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

      <!-- Sidebar Tabs -->
      <div class="tps-sidebar-tabs">
        <button
          type="button"
          class="tps-sidebar-tab"
          :class="{ 'tps-active': sidebarTab === 'pages' }"
          @click="sidebarTab = 'pages'"
        >
          My Pages
        </button>
        <button
          type="button"
          class="tps-sidebar-tab"
          :class="{ 'tps-active': sidebarTab === 'explore' }"
          @click="sidebarTab = 'explore'"
        >
          Explore
        </button>
      </div>

      <!-- Pages Tab Content -->
      <template v-if="sidebarTab === 'pages'">
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

        <!-- Data Sources Section -->
        <div class="tps-sidebar-section">
          <span class="tps-sidebar-section-title">Data Sources</span>
          <button
            type="button"
            class="tps-btn tps-btn-ghost tps-btn-sm tps-btn-icon"
            title="Add data source"
            @click="openDatasourceModal"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div class="tps-datasource-list">
          <div v-if="datasources.length === 0" class="tps-page-list-empty">
            No data sources
          </div>
          <button
            v-for="ds in datasources"
            v-else
            :key="ds.id"
            type="button"
            class="tps-page-item" :class="[ds.id === selectedDatasourceId ? 'tps-active' : '']"
            @click="selectDatasource(ds)"
          >
            <svg class="tps-page-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            <div class="tps-datasource-item-content">
              <span class="tps-page-item-title">{{ ds.name }}</span>
              <span class="tps-datasource-item-type">{{ getDatasourceTypeLabel(ds.type) }}</span>
            </div>
            <div class="tps-page-item-actions">
              <button
                type="button"
                class="tps-page-item-edit"
                title="Edit data source"
                @click.stop="openEditDatasource(ds)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                type="button"
                class="tps-page-item-delete"
                title="Delete data source"
                @click.stop="handleDeleteDatasource(ds.id, $event)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </button>
        </div>
      </template>

      <!-- Explore Tab Content -->
      <div v-else class="tps-sidebar-gallery">
        <ReportGallery v-if="storage" :storage="storage" :compact="true" />
        <div v-else class="tps-page-list-empty">
          Storage not configured
        </div>
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
      <div v-else-if="currentPage" class="tps-editor" :class="`tps-template-${currentPage.template || 'blank'}`">
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
          <div class="tps-editor-actions">
            <!-- Undo/Redo Buttons -->
            <button
              type="button"
              class="tps-editor-action"
              :class="{ 'tps-disabled': !canUndo }"
              :disabled="!canUndo"
              title="Undo (Ctrl+Z)"
              @click="undo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.9 3.2L3 13" />
              </svg>
            </button>
            <button
              type="button"
              class="tps-editor-action"
              :class="{ 'tps-disabled': !canRedo }"
              :disabled="!canRedo"
              title="Redo (Ctrl+Y)"
              @click="redo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.9 3.2L21 13" />
              </svg>
            </button>
            <!-- Layout Mode Toggle -->
            <div class="tps-layout-toggle">
              <button
                type="button"
                class="tps-layout-btn"
                :class="{ 'tps-active': layoutMode === 'linear' }"
                title="Linear Layout"
                @click="setLayoutMode('linear')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                type="button"
                class="tps-layout-btn"
                :class="{ 'tps-active': layoutMode === 'grid' }"
                title="Grid Layout"
                @click="setLayoutMode('grid')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
            </div>
            <!-- Version History Toggle -->
            <button
              type="button"
              class="tps-version-toggle"
              :class="{ 'tps-active': showVersionPanel }"
              title="Version History"
              @click="toggleVersionPanel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span v-if="versions.length > 0" class="tps-version-count">{{ versions.length }}</span>
            </button>
            <!-- Share Button -->
            <button
              v-if="currentPage"
              type="button"
              class="tps-btn tps-btn-share"
              title="Share page"
              @click="openShareModal"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>
        </div>

        <!-- Preview Mode Banner -->
        <div v-if="isPreviewMode" class="tps-preview-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span class="tps-preview-banner-text">
            Previewing version {{ versions.find(v => v.id === previewingVersionId)?.version }}
          </span>
          <div class="tps-preview-banner-actions">
            <button
              type="button"
              class="tps-preview-banner-btn tps-restore"
              @click="restoreVersion(previewingVersionId!)"
            >
              Restore this version
            </button>
            <button
              type="button"
              class="tps-preview-banner-btn tps-cancel"
              @click="cancelPreview"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Filter Bar - Reactive Field Linking -->
        <div v-if="activeFilters.length > 0 || hasWidgetBlocks" class="tps-filter-bar">
          <span class="tps-filter-bar-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
            </svg>
            Filters
          </span>
          <div class="tps-filter-pills">
            <div
              v-for="filter in activeFilters"
              :key="filter.id"
              class="tps-filter-pill"
            >
              <span class="tps-filter-pill-field">{{ filter.field }}:</span>
              <span class="tps-filter-pill-value">{{ filter.value }}</span>
              <button
                type="button"
                class="tps-filter-pill-remove"
                title="Remove filter"
                @click="removeFilter(filter.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <button
            v-if="activeFilters.length > 0"
            type="button"
            class="tps-filter-clear-all"
            @click="clearAllFilters"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            Clear all
          </button>
        </div>

        <div class="tps-editor-content">
          <!-- Linear Layout Mode -->
          <draggable
            v-if="layoutMode === 'linear'"
            v-model="editorBlocks"
            item-key="id"
            handle=".tps-block-drag-handle"
            ghost-class="tps-block-ghost"
            drag-class="tps-block-dragging"
            animation="200"
            class="tps-blocks"
            :disabled="isPreviewMode"
            @end="handleBlockReorder"
          >
            <template #item="{ element: block }">
              <!-- Text Block -->
              <div v-if="isTextBlock(block)" class="tps-block tps-block-text">
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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
                <RichTextEditor
                  :content="block.content"
                  placeholder="Type something, or press / for commands..."
                  @update:content="(html: string) => handleBlockUpdate(block.id, { content: html })"
                />
              </div>

              <!-- Heading Block -->
              <div v-else-if="isHeadingBlock(block)" class="tps-block tps-block-heading" :data-level="block.level">
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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
              <div
                v-else-if="isWidgetBlock(block)"
                :data-block-id="block.id"
                class="tps-block tps-block-widget tps-block-resizable"
                :class="{ 'tps-block-resizing': resizingBlockId === block.id, 'tps-block-controls-visible': shouldShowControls(block.id) }"
                :style="{ minHeight: getWidgetHeightStyle(block), height: getBlockHeightStyle(block) }"
                @mouseenter="hoveredBlockId = block.id"
                @mouseleave="hoveredBlockId = null"
                @focusin="focusedBlockId = block.id"
                @focusout="handleBlockFocusOut($event, block.id)"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button
                    type="button"
                    class="tps-block-action"
                    title="Configure widget"
                    @click="openWidgetConfigModal(block)"
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
                    @click="openWidgetConfigModal(block)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Configure Widget
                  </button>
                </div>

                <!-- Widget with Data (using sample data for now, filtered by active filters) -->
                <div v-else class="tps-widget-content" :class="{ 'tps-widget-linked': activeFilters.length > 0 }">
                  <DataGrid
                    :widget-id="block.id"
                    :initial-view-state="getWidgetState(block.id) ?? undefined"
                    :data="getFilteredSampleData()"
                    :theme="resolvedTheme"
                    :show-controls="shouldShowControls(block.id)"
                    :enable-export="false"
                    :enable-pagination="false"
                    :enable-search="true"
                    :striped-rows="true"
                    :enable-vertical-resize="false"
                    :initial-height="350"
                    :min-height="200"
                    :max-height="600"
                    :ai-analyst="getAiAnalystConfigForDatasource(block.metadata?.datasourceId as string)"
                    :initial-view-mode="shouldAutoShowAI(block) ? 'ai' : 'grid'"
                    @cell-click="(payload) => handleWidgetRowClick(block.id, payload.rowData)"
                    @view-state-change="(state) => saveWidgetState(block.id, state)"
                  />
                </div>

                <!-- Resize Handle -->
                <div
                  class="tps-resize-handle-bottom"
                  title="Drag to resize"
                  @mousedown="handleResizeStart(block.id, $event)"
                  @touchstart="handleResizeStart(block.id, $event)"
                />
              </div>

              <!-- Image Block -->
              <div
                v-else-if="block.type === 'image'"
                :data-block-id="block.id"
                class="tps-block tps-block-image tps-block-resizable"
                :class="{ 'tps-block-resizing': resizingBlockId === block.id }"
                :style="{ height: getBlockHeightStyle(block) }"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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

                <!-- Hidden file input for image upload -->
                <input
                  :id="`image-file-${block.id}`"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style="display: none"
                  @change="(e) => handleImageFileChange(block.id, e)"
                >

                <!-- Image dropzone when no src -->
                <div
                  v-if="!block.src && imageLoadingBlockId !== block.id"
                  class="tps-image-dropzone"
                  :class="{ 'tps-dragging': imageDragOverBlockId === block.id }"
                  @drop="(e) => handleImageDrop(block.id, e)"
                  @dragover="(e) => handleImageDragOver(block.id, e)"
                  @dragleave="(e) => handleImageDragLeave(block.id, e)"
                  @click="triggerImageFileInput(block.id)"
                >
                  <svg class="tps-image-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <div class="tps-image-dropzone-text">
                    <strong>Drop an image</strong> or click to browse
                  </div>
                  <div class="tps-image-dropzone-hint">
                    Supports JPG, PNG, GIF, WebP
                  </div>
                  <div class="tps-image-dropzone-or">
                    or
                  </div>
                  <input
                    type="text"
                    class="tps-input tps-image-url-input"
                    placeholder="Paste image URL..."
                    @blur="(e) => handleBlockUpdate(block.id, { src: (e.target as HTMLInputElement).value })"
                    @keyup.enter="(e) => handleBlockUpdate(block.id, { src: (e.target as HTMLInputElement).value })"
                    @click.stop
                  >
                </div>

                <!-- Loading state -->
                <div v-else-if="imageLoadingBlockId === block.id" class="tps-image-loading">
                  <svg class="tps-image-loading-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span class="tps-image-loading-text">Loading image...</span>
                </div>

                <!-- Image preview when src exists -->
                <div v-else class="tps-image-preview">
                  <div
                    :class="getImageContainerClasses(block)"
                  >
                    <img
                      :src="block.src"
                      :alt="block.alt || ''"
                      :class="{ 'tps-image-full': block.width === 'full' }"
                      :style="block.width && block.width !== 'full' ? { width: typeof block.width === 'number' ? `${block.width}px` : block.width } : {}"
                    >
                  </div>
                  <input
                    :value="block.caption || ''"
                    type="text"
                    class="tps-image-caption"
                    placeholder="Add a caption..."
                    @input="handleBlockUpdate(block.id, { caption: ($event.target as HTMLInputElement).value })"
                  >

                  <!-- Image Toolbar -->
                  <div class="tps-image-toolbar">
                    <!-- Alignment buttons -->
                    <button
                      type="button"
                      class="tps-image-align-btn"
                      :class="{ 'tps-active': block.align === 'left' }"
                      title="Align left"
                      @click="handleBlockUpdate(block.id, { align: 'left' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 10H3M21 6H3M21 14H3M17 18H3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tps-image-align-btn"
                      :class="{ 'tps-active': block.align === 'center' || !block.align }"
                      title="Align center"
                      @click="handleBlockUpdate(block.id, { align: 'center' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 10H6M21 6H3M21 14H3M18 18H6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tps-image-align-btn"
                      :class="{ 'tps-active': block.align === 'right' }"
                      title="Align right"
                      @click="handleBlockUpdate(block.id, { align: 'right' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10H7M21 6H3M21 14H3M21 18H7" />
                      </svg>
                    </button>

                    <div class="tps-image-toolbar-divider" />

                    <!-- Shape buttons -->
                    <button
                      type="button"
                      class="tps-image-shape-btn"
                      :class="{ 'tps-active': !block.shape || block.shape === 'rectangle' }"
                      title="Rectangle"
                      @click="handleBlockUpdate(block.id, { shape: 'rectangle' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="5" width="18" height="14" rx="1" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tps-image-shape-btn"
                      :class="{ 'tps-active': block.shape === 'rounded' }"
                      title="Rounded"
                      @click="handleBlockUpdate(block.id, { shape: 'rounded' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="5" width="18" height="14" rx="4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="tps-image-shape-btn"
                      :class="{ 'tps-active': block.shape === 'circle' }"
                      title="Circle"
                      @click="handleBlockUpdate(block.id, { shape: 'circle' })"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </button>

                    <div class="tps-image-toolbar-divider" />

                    <!-- Aspect ratio buttons -->
                    <button
                      type="button"
                      class="tps-image-aspect-btn"
                      :class="{ 'tps-active': !block.aspectRatio || block.aspectRatio === 'free' }"
                      title="Free aspect ratio"
                      @click="handleBlockUpdate(block.id, { aspectRatio: 'free' })"
                    >
                      Free
                    </button>
                    <button
                      type="button"
                      class="tps-image-aspect-btn"
                      :class="{ 'tps-active': block.aspectRatio === '1:1' }"
                      title="Square (1:1)"
                      @click="handleBlockUpdate(block.id, { aspectRatio: '1:1' })"
                    >
                      1:1
                    </button>
                    <button
                      type="button"
                      class="tps-image-aspect-btn"
                      :class="{ 'tps-active': block.aspectRatio === '16:9' }"
                      title="Widescreen (16:9)"
                      @click="handleBlockUpdate(block.id, { aspectRatio: '16:9' })"
                    >
                      16:9
                    </button>
                    <button
                      type="button"
                      class="tps-image-aspect-btn"
                      :class="{ 'tps-active': block.aspectRatio === '4:3' }"
                      title="Standard (4:3)"
                      @click="handleBlockUpdate(block.id, { aspectRatio: '4:3' })"
                    >
                      4:3
                    </button>

                    <div class="tps-image-toolbar-divider" />

                    <!-- Clear button -->
                    <button
                      type="button"
                      class="tps-image-clear-btn"
                      title="Remove image"
                      @click="handleClearImage(block.id)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                  </div>
                </div>

                <!-- Resize Handle -->
                <div
                  class="tps-resize-handle"
                  title="Drag to resize (hold Shift for aspect ratio)"
                  @mousedown="handleResizeStart(block.id, $event)"
                  @touchstart="handleResizeStart(block.id, $event)"
                />
              </div>

              <!-- Callout Block -->
              <div
                v-else-if="block.type === 'callout'"
                class="tps-block tps-block-callout"
                :data-style="block.style || 'info'"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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
                <div class="tps-callout-content">
                  <div class="tps-callout-icon">
                    <svg v-if="block.style === 'info' || !block.style" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <svg v-else-if="block.style === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                    <svg v-else-if="block.style === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <svg v-else-if="block.style === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                    <svg v-else-if="block.style === 'note'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <svg v-else-if="block.style === 'tip'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                    </svg>
                  </div>
                  <div class="tps-callout-body">
                    <input
                      :value="block.title || ''"
                      type="text"
                      class="tps-callout-title-input"
                      placeholder="Title (optional)"
                      @input="handleBlockUpdate(block.id, { title: ($event.target as HTMLInputElement).value })"
                    >
                    <textarea
                      :value="block.content"
                      class="tps-callout-text-input"
                      placeholder="Write your callout content..."
                      rows="1"
                      @input="(e) => { handleTextareaInput(e); handleBlockUpdate(block.id, { content: (e.target as HTMLTextAreaElement).value }) }"
                    />
                  </div>
                </div>
                <div class="tps-callout-style-selector">
                  <button
                    v-for="style in ['info', 'warning', 'success', 'error', 'note', 'tip'] as const"
                    :key="style"
                    type="button"
                    class="tps-callout-style-btn"
                    :class="{ 'tps-active': block.style === style }"
                    :data-style="style"
                    :title="style.charAt(0).toUpperCase() + style.slice(1)"
                    @click="handleBlockUpdate(block.id, { style })"
                  />
                </div>
              </div>

              <!-- Columns Block -->
              <div
                v-else-if="block.type === 'columns'"
                :data-block-id="block.id"
                class="tps-block tps-block-columns tps-block-resizable"
                :class="{ 'tps-block-resizing': resizingBlockId === block.id }"
                :style="{ height: getBlockHeightStyle(block) }"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
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
                <div class="tps-columns-container" :data-gap="block.gap ? (block.gap <= 8 ? 'small' : block.gap <= 16 ? 'medium' : 'large') : 'medium'">
                  <div
                    v-for="(column, colIndex) in block.columns"
                    :key="column.id"
                    class="tps-column tps-column-dropzone"
                    :style="{ flex: column.width }"
                  >
                    <!-- Render nested blocks in this column -->
                    <div v-if="column.blocks && column.blocks.length > 0" class="tps-column-blocks">
                      <div
                        v-for="childBlock in column.blocks"
                        :key="childBlock.id"
                        class="tps-nested-block-wrapper"
                      >
                        <!-- Text Block -->
                        <div v-if="childBlock.type === 'text'" class="tps-block tps-block-text">
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <RichTextEditor
                            :content="childBlock.content"
                            placeholder="Type something, or press / for commands..."
                            @update:content="(html: string) => handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { content: html })"
                          />
                        </div>

                        <!-- Heading Block -->
                        <div v-else-if="childBlock.type === 'heading'" class="tps-block tps-block-heading" :data-level="childBlock.level">
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <input
                            :value="childBlock.content"
                            type="text"
                            class="tps-block-input"
                            placeholder="Heading..."
                            @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { content: ($event.target as HTMLInputElement).value })"
                          >
                        </div>

                        <!-- Divider Block -->
                        <div v-else-if="childBlock.type === 'divider'" class="tps-block tps-block-divider">
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <hr>
                        </div>

                        <!-- Widget Block -->
                        <div
                          v-else-if="isWidgetBlock(childBlock)"
                          class="tps-block tps-block-widget"
                          :style="{ minHeight: getWidgetHeightStyle(childBlock) }"
                        >
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action"
                              title="Configure widget"
                              @click="openWidgetConfigModal(childBlock)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <div v-if="childBlock.showTitle !== false" class="tps-widget-header">
                            <input
                              :value="childBlock.titleOverride || ''"
                              type="text"
                              class="tps-widget-title-input"
                              placeholder="Widget Title"
                              @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { titleOverride: ($event.target as HTMLInputElement).value })"
                            >
                          </div>
                          <div v-if="!hasWidgetData(childBlock)" class="tps-widget-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <path d="M3 9h18" />
                              <path d="M9 21V9" />
                            </svg>
                            <span>No data configured</span>
                          </div>
                          <div v-else class="tps-widget-content">
                            <DataGrid
                              :widget-id="childBlock.id"
                              :initial-view-state="getWidgetState(childBlock.id) ?? undefined"
                              :data="widgetSampleData"
                              :theme="resolvedTheme"
                              :show-controls="shouldShowControls(childBlock.id)"
                              :enable-export="false"
                              :enable-pagination="false"
                              :enable-search="true"
                              :striped-rows="true"
                              :enable-vertical-resize="false"
                              :initial-height="250"
                              :min-height="150"
                              :max-height="400"
                              :ai-analyst="getAiAnalystConfigForDatasource(childBlock.metadata?.datasourceId as string)"
                              :initial-view-mode="shouldAutoShowAI(childBlock as WidgetBlock) ? 'ai' : 'grid'"
                              @view-state-change="(state) => saveWidgetState(childBlock.id, state)"
                            />
                          </div>
                        </div>

                        <!-- Image Block -->
                        <div v-else-if="childBlock.type === 'image'" class="tps-block tps-block-image">
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <div v-if="!childBlock.src" class="tps-image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <span>Add image URL</span>
                            <input
                              type="text"
                              class="tps-input tps-image-url-input"
                              placeholder="https://example.com/image.jpg"
                              @blur="(e) => handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { src: (e.target as HTMLInputElement).value })"
                              @keyup.enter="(e) => handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { src: (e.target as HTMLInputElement).value })"
                            >
                          </div>
                          <div v-else class="tps-image-preview">
                            <div class="tps-image-preview-container" :class="[`tps-align-${childBlock.align || 'center'}`]">
                              <img :src="childBlock.src" :alt="childBlock.alt || ''">
                            </div>
                          </div>
                        </div>

                        <!-- Callout Block -->
                        <div
                          v-else-if="childBlock.type === 'callout'"
                          class="tps-block tps-block-callout"
                          :data-style="childBlock.style || 'info'"
                        >
                          <div class="tps-block-actions">
                            <button
                              type="button"
                              class="tps-block-action tps-block-delete"
                              title="Delete block"
                              @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <div class="tps-callout-content">
                            <div class="tps-callout-icon">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4M12 8h.01" />
                              </svg>
                            </div>
                            <div class="tps-callout-body">
                              <input
                                :value="childBlock.title || ''"
                                type="text"
                                class="tps-callout-title-input"
                                placeholder="Title (optional)"
                                @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { title: ($event.target as HTMLInputElement).value })"
                              >
                              <textarea
                                :value="childBlock.content"
                                class="tps-callout-text-input"
                                placeholder="Write your callout content..."
                                rows="1"
                                @input="(e) => { handleTextareaInput(e); handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { content: (e.target as HTMLTextAreaElement).value }) }"
                              />
                            </div>
                          </div>
                        </div>

                        <!-- Stat Block (nested) -->
                        <div
                          v-else-if="childBlock.type === 'stat'"
                          class="tps-block tps-block-stat"
                          :data-size="childBlock.size || 'medium'"
                        >
                          <div class="tps-block-actions">
                            <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleNestedBlockDelete(block.id, colIndex, childBlock.id)">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                              </svg>
                            </button>
                          </div>
                          <div class="tps-stat-content">
                            <div class="tps-stat-value-wrapper">
                              <input
                                type="text"
                                class="tps-stat-prefix-input"
                                :value="childBlock.prefix || ''"
                                placeholder=""
                                @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { prefix: ($event.target as HTMLInputElement).value })"
                              >
                              <input
                                type="text"
                                class="tps-stat-value-input"
                                :value="childBlock.value"
                                :style="{ color: childBlock.color || undefined }"
                                @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { value: ($event.target as HTMLInputElement).value })"
                              >
                              <input
                                type="text"
                                class="tps-stat-suffix-input"
                                :value="childBlock.suffix || ''"
                                placeholder=""
                                @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { suffix: ($event.target as HTMLInputElement).value })"
                              >
                            </div>
                            <input
                              type="text"
                              class="tps-stat-label-input"
                              :value="childBlock.label"
                              placeholder="Label"
                              @input="handleNestedBlockUpdate(block.id, colIndex, childBlock.id, { label: ($event.target as HTMLInputElement).value })"
                            >
                          </div>
                        </div>

                        <!-- Unknown nested block type -->
                        <div v-else class="tps-block">
                          <span>Unknown block type: {{ childBlock.type }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Add block button/menu for this column -->
                    <div v-if="isColumnMenuActive(block.id, colIndex)" class="tps-column-add-block-menu">
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Text"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'text')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Heading"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'heading')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M6 4v16M18 4v16M6 12h12" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Widget"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'widget')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9h18" />
                          <path d="M9 21V9" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Image"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'image')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Callout"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'callout')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 16v-4M12 8h.01" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option"
                        title="Divider"
                        @click="handleAddBlockToColumn(block.id, colIndex, 'divider')"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M3 12h18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="tps-column-block-option tps-column-block-cancel"
                        title="Cancel"
                        @click="closeColumnAddBlockMenu"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <button
                      v-else
                      type="button"
                      class="tps-column-add-block"
                      @click="openColumnAddBlockMenu(block.id, colIndex)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span>Add block</span>
                    </button>
                  </div>
                </div>
                <div class="tps-columns-controls">
                  <span class="tps-columns-label">Columns:</span>
                  <button
                    v-for="num in [2, 3, 4] as const"
                    :key="num"
                    type="button"
                    class="tps-columns-btn"
                    :class="{ 'tps-active': block.columns.length === num }"
                    @click="handleBlockUpdate(block.id, {
                      columns: Array.from({ length: num }, (_, i) =>
                        i < block.columns.length
                          ? block.columns[i]
                          : { id: generateId(), width: 1, blocks: [] },
                      ),
                    })"
                  >
                    {{ num }}
                  </button>
                </div>

                <!-- Resize Handle -->
                <div
                  class="tps-resize-handle-bottom"
                  title="Drag to resize"
                  @mousedown="handleResizeStart(block.id, $event)"
                  @touchstart="handleResizeStart(block.id, $event)"
                />
              </div>

              <!-- Stat Block -->
              <div
                v-else-if="block.type === 'stat'"
                :data-block-id="block.id"
                class="tps-block tps-block-stat"
                :data-size="block.size || 'medium'"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleBlockDelete(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <div class="tps-stat-content">
                  <div class="tps-stat-value-wrapper">
                    <input
                      type="text"
                      class="tps-stat-prefix-input"
                      :value="block.prefix || ''"
                      placeholder=""
                      @input="handleBlockUpdate(block.id, { prefix: ($event.target as HTMLInputElement).value })"
                    >
                    <input
                      type="text"
                      class="tps-stat-value-input"
                      :value="block.value"
                      :style="{ color: block.color || undefined }"
                      @input="handleBlockUpdate(block.id, { value: ($event.target as HTMLInputElement).value })"
                    >
                    <input
                      type="text"
                      class="tps-stat-suffix-input"
                      :value="block.suffix || ''"
                      placeholder=""
                      @input="handleBlockUpdate(block.id, { suffix: ($event.target as HTMLInputElement).value })"
                    >
                  </div>
                  <input
                    type="text"
                    class="tps-stat-label-input"
                    :value="block.label"
                    placeholder="Label"
                    @input="handleBlockUpdate(block.id, { label: ($event.target as HTMLInputElement).value })"
                  >
                  <div
                    v-if="block.trend"
                    class="tps-stat-trend"
                    :class="{
                      'tps-stat-trend-up': block.trend.direction === 'up',
                      'tps-stat-trend-down': block.trend.direction === 'down',
                      'tps-stat-trend-flat': block.trend.direction === 'flat',
                      'tps-stat-trend-negative': block.trend.positive === false,
                    }"
                  >
                    <svg v-if="block.trend.direction === 'up'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                    <svg v-else-if="block.trend.direction === 'down'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 12h14" />
                    </svg>
                    <input
                      type="text"
                      class="tps-stat-trend-input"
                      :value="block.trend.value || ''"
                      placeholder="12%"
                      @input="handleBlockUpdate(block.id, { trend: { ...block.trend, value: ($event.target as HTMLInputElement).value } })"
                    >
                  </div>
                </div>
                <div class="tps-stat-controls">
                  <span class="tps-stat-controls-label">Size:</span>
                  <div class="tps-stat-size-controls">
                    <button
                      v-for="size in ['small', 'medium', 'large', 'xlarge'] as const"
                      :key="size"
                      type="button"
                      class="tps-stat-size-btn"
                      :class="{ 'tps-active': (block.size || 'medium') === size }"
                      @click="handleBlockUpdate(block.id, { size })"
                    >
                      {{ size.charAt(0).toUpperCase() }}
                    </button>
                  </div>
                  <span class="tps-stat-controls-label" style="margin-left: 0.5rem;">Trend:</span>
                  <div class="tps-stat-trend-controls">
                    <button
                      type="button"
                      class="tps-stat-trend-btn"
                      :class="{ 'tps-active': !block.trend }"
                      @click="handleBlockUpdate(block.id, { trend: undefined })"
                    >
                      None
                    </button>
                    <button
                      type="button"
                      class="tps-stat-trend-btn"
                      :class="{ 'tps-active': block.trend?.direction === 'up' }"
                      @click="handleBlockUpdate(block.id, { trend: { direction: 'up', value: block.trend?.value || '', positive: true } })"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      class="tps-stat-trend-btn"
                      :class="{ 'tps-active': block.trend?.direction === 'down' }"
                      @click="handleBlockUpdate(block.id, { trend: { direction: 'down', value: block.trend?.value || '', positive: false } })"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      class="tps-stat-trend-btn"
                      :class="{ 'tps-active': block.trend?.direction === 'flat' }"
                      @click="handleBlockUpdate(block.id, { trend: { direction: 'flat', value: block.trend?.value || '' } })"
                    >
                      Flat
                    </button>
                  </div>
                </div>
              </div>

              <!-- Progress Block -->
              <div
                v-else-if="block.type === 'progress'"
                :data-block-id="block.id"
                class="tps-block tps-block-progress"
                :data-variant="block.variant || 'bar'"
                :data-size="block.size || 'medium'"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleBlockDelete(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <div class="tps-progress-content">
                  <input
                    type="text"
                    class="tps-progress-label-input"
                    :value="block.label || ''"
                    placeholder="Progress Label"
                    @input="handleBlockUpdate(block.id, { label: ($event.target as HTMLInputElement).value })"
                  >

                  <!-- Bar variant -->
                  <div v-if="(block.variant || 'bar') === 'bar'" class="tps-progress-bar-container">
                    <div class="tps-progress-bar">
                      <div
                        class="tps-progress-fill"
                        :style="{
                          width: `${Math.min(100, Math.max(0, (block.value / (block.max || 100)) * 100))}%`,
                          background: block.color || undefined,
                        }"
                      />
                    </div>
                    <input
                      v-if="block.showValue !== false"
                      type="number"
                      class="tps-progress-value-input"
                      :value="block.value"
                      min="0"
                      :max="block.max || 100"
                      @input="handleBlockUpdate(block.id, { value: Number(($event.target as HTMLInputElement).value) })"
                    >
                    <span v-if="block.showValue !== false" class="tps-progress-value">%</span>
                  </div>

                  <!-- Circle variant -->
                  <div v-else-if="block.variant === 'circle'" class="tps-progress-circle-container">
                    <div class="tps-progress-circle">
                      <svg
                        :width="block.size === 'small' ? 80 : block.size === 'large' ? 160 : 120"
                        :height="block.size === 'small' ? 80 : block.size === 'large' ? 160 : 120"
                        viewBox="0 0 120 120"
                      >
                        <circle
                          class="tps-progress-circle-bg"
                          cx="60"
                          cy="60"
                          r="54"
                          stroke-width="12"
                        />
                        <circle
                          class="tps-progress-circle-fill"
                          cx="60"
                          cy="60"
                          r="54"
                          stroke-width="12"
                          :stroke="block.color || undefined"
                          :stroke-dasharray="339.292"
                          :stroke-dashoffset="339.292 * (1 - block.value / (block.max || 100))"
                        />
                      </svg>
                      <span class="tps-progress-circle-value">{{ block.value }}%</span>
                    </div>
                  </div>

                  <!-- Semicircle variant -->
                  <div v-else-if="block.variant === 'semicircle'" class="tps-progress-semicircle-container">
                    <div class="tps-progress-semicircle">
                      <svg
                        :width="block.size === 'small' ? 100 : block.size === 'large' ? 200 : 150"
                        :height="block.size === 'small' ? 50 : block.size === 'large' ? 100 : 75"
                        viewBox="0 0 150 75"
                      >
                        <path
                          class="tps-progress-circle-bg"
                          d="M 15 75 A 60 60 0 0 1 135 75"
                          fill="none"
                          stroke-width="12"
                          stroke-linecap="round"
                        />
                        <path
                          class="tps-progress-circle-fill"
                          d="M 15 75 A 60 60 0 0 1 135 75"
                          fill="none"
                          stroke-width="12"
                          stroke-linecap="round"
                          :stroke="block.color || undefined"
                          :stroke-dasharray="188.5"
                          :stroke-dashoffset="188.5 * (1 - block.value / (block.max || 100))"
                        />
                      </svg>
                      <span class="tps-progress-semicircle-value">{{ block.value }}%</span>
                    </div>
                  </div>
                </div>
                <div class="tps-progress-controls">
                  <span class="tps-progress-controls-label">Style:</span>
                  <div class="tps-progress-variant-controls">
                    <button
                      v-for="variant in ['bar', 'circle', 'semicircle'] as const"
                      :key="variant"
                      type="button"
                      class="tps-progress-variant-btn"
                      :class="{ 'tps-active': (block.variant || 'bar') === variant }"
                      @click="handleBlockUpdate(block.id, { variant })"
                    >
                      {{ variant.charAt(0).toUpperCase() + variant.slice(1) }}
                    </button>
                  </div>
                  <span class="tps-progress-controls-label" style="margin-left: 0.5rem;">Size:</span>
                  <div class="tps-progress-size-controls">
                    <button
                      v-for="size in ['small', 'medium', 'large'] as const"
                      :key="size"
                      type="button"
                      class="tps-progress-size-btn"
                      :class="{ 'tps-active': (block.size || 'medium') === size }"
                      @click="handleBlockUpdate(block.id, { size })"
                    >
                      {{ size.charAt(0).toUpperCase() }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Spacer Block -->
              <div
                v-else-if="block.type === 'spacer'"
                :data-block-id="block.id"
                class="tps-block tps-block-spacer"
                :style="{ height: `${block.height}px` }"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleBlockDelete(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <div class="tps-spacer-content">
                  <span class="tps-spacer-label">
                    <input
                      type="number"
                      class="tps-spacer-height-input"
                      :value="block.height"
                      min="8"
                      max="500"
                      @input="handleBlockUpdate(block.id, { height: Number(($event.target as HTMLInputElement).value) })"
                    >px
                  </span>
                </div>
              </div>

              <!-- Quote Block -->
              <div
                v-else-if="block.type === 'quote'"
                :data-block-id="block.id"
                class="tps-block tps-block-quote"
                :data-style="block.style || 'simple'"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleBlockDelete(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <div class="tps-quote-content">
                  <svg class="tps-quote-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                  <textarea
                    class="tps-quote-text-input"
                    :value="block.content"
                    placeholder="Enter your quote here..."
                    @input="handleBlockUpdate(block.id, { content: ($event.target as HTMLTextAreaElement).value })"
                  />
                  <div class="tps-quote-attribution">
                    <input
                      type="text"
                      class="tps-quote-author-input"
                      :value="block.author || ''"
                      placeholder="Author name"
                      @input="handleBlockUpdate(block.id, { author: ($event.target as HTMLInputElement).value })"
                    >
                    <input
                      type="text"
                      class="tps-quote-source-input"
                      :value="block.source || ''"
                      placeholder="Title, Company"
                      @input="handleBlockUpdate(block.id, { source: ($event.target as HTMLInputElement).value })"
                    >
                  </div>
                </div>
                <div class="tps-quote-style-selector">
                  <span class="tps-quote-style-label">Style:</span>
                  <button
                    v-for="style in ['simple', 'bordered', 'highlighted'] as const"
                    :key="style"
                    type="button"
                    class="tps-quote-style-btn"
                    :class="{ 'tps-active': (block.style || 'simple') === style }"
                    @click="handleBlockUpdate(block.id, { style })"
                  >
                    {{ style.charAt(0).toUpperCase() + style.slice(1) }}
                  </button>
                </div>
              </div>

              <!-- Grid Block -->
              <div
                v-else-if="block.type === 'grid'"
                :data-block-id="block.id"
                class="tps-block tps-block-grid-container"
              >
                <div class="tps-block-drag-handle" title="Drag to reorder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                    <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                    <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                  </svg>
                </div>
                <div class="tps-block-actions">
                  <button type="button" class="tps-block-action tps-block-delete" title="Delete block" @click="handleBlockDelete(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <!-- Grid Configuration Bar -->
                <div class="tps-grid-config">
                  <label class="tps-grid-config-label">Columns:</label>
                  <input
                    type="number"
                    class="tps-grid-config-input"
                    :value="block.columns"
                    min="1"
                    max="6"
                    @input="handleBlockUpdate(block.id, { columns: Math.min(6, Math.max(1, parseInt(($event.target as HTMLInputElement).value) || 3)) })"
                  >
                  <label class="tps-grid-config-label">Gap:</label>
                  <input
                    type="number"
                    class="tps-grid-config-input"
                    :value="block.gap || 16"
                    min="0"
                    max="48"
                    @input="handleBlockUpdate(block.id, { gap: parseInt(($event.target as HTMLInputElement).value) || 16 })"
                  >
                  <label class="tps-grid-config-checkbox">
                    <input
                      type="checkbox"
                      :checked="block.dense"
                      @change="handleBlockUpdate(block.id, { dense: ($event.target as HTMLInputElement).checked })"
                    >
                    Dense packing
                  </label>
                </div>
                <!-- Grid Layout -->
                <div
                  class="tps-block-grid"
                  :data-columns="block.columns"
                  :data-dense="block.dense"
                  :style="{ gap: `${block.gap || 16}px` }"
                >
                  <!-- Grid Items -->
                  <template v-for="(item, itemIndex) in block.items" :key="item.block.id">
                    <div
                      class="tps-grid-item"
                      :data-col-span="item.colSpan || 1"
                      :data-row-span="item.rowSpan || 1"
                    >
                      <div class="tps-grid-item-controls">
                        <button
                          type="button"
                          class="tps-grid-item-btn"
                          title="Decrease column span"
                          @click="handleGridItemSpan(block.id, itemIndex, 'colSpan', -1)"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          class="tps-grid-item-btn"
                          title="Increase column span"
                          @click="handleGridItemSpan(block.id, itemIndex, 'colSpan', 1)"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          class="tps-grid-item-btn"
                          title="Delete item"
                          @click="handleGridItemDelete(block.id, itemIndex)"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div class="tps-grid-item-content">
                        <!-- Nested block content (simplified inline rendering) -->
                        <div v-if="item.block.type === 'text'">
                          <RichTextEditor
                            :content="item.block.content"
                            placeholder="Type something, or press / for commands..."
                            @update:content="(html: string) => handleGridItemBlockUpdate(block.id, itemIndex, { content: html })"
                          />
                        </div>
                        <div v-else-if="item.block.type === 'heading'">
                          <input
                            type="text"
                            class="tps-heading-input"
                            :class="`tps-heading-${item.block.level}`"
                            :value="item.block.content"
                            placeholder="Heading..."
                            @input="handleGridItemBlockUpdate(block.id, itemIndex, { content: ($event.target as HTMLInputElement).value })"
                          >
                        </div>
                        <div v-else-if="item.block.type === 'stat'" class="tps-stat-content" :data-size="item.block.size || 'medium'">
                          <div class="tps-stat-value" :style="item.block.color ? { color: item.block.color } : {}">
                            <span v-if="item.block.prefix" class="tps-stat-prefix">{{ item.block.prefix }}</span>
                            <input
                              type="text"
                              class="tps-stat-value-input"
                              :value="item.block.value"
                              placeholder="0"
                              @input="handleGridItemBlockUpdate(block.id, itemIndex, { value: ($event.target as HTMLInputElement).value })"
                            >
                            <span v-if="item.block.suffix" class="tps-stat-suffix">{{ item.block.suffix }}</span>
                          </div>
                          <input
                            type="text"
                            class="tps-stat-label-input"
                            :value="item.block.label"
                            placeholder="Label"
                            @input="handleGridItemBlockUpdate(block.id, itemIndex, { label: ($event.target as HTMLInputElement).value })"
                          >
                        </div>
                        <div v-else-if="item.block.type === 'progress'" class="tps-progress-content" :data-size="item.block.size || 'medium'">
                          <div v-if="item.block.variant !== 'circle' && item.block.variant !== 'semicircle'" class="tps-progress-bar-container">
                            <div class="tps-progress-bar" :style="{ width: `${(item.block.value / (item.block.max || 100)) * 100}%`, background: item.block.color || '#6366f1' }" />
                          </div>
                          <input
                            type="range"
                            min="0"
                            :max="item.block.max || 100"
                            :value="item.block.value"
                            @input="handleGridItemBlockUpdate(block.id, itemIndex, { value: parseInt(($event.target as HTMLInputElement).value) })"
                          >
                        </div>
                        <div v-else-if="item.block.type === 'image'">
                          <div v-if="item.block.src" class="tps-image-preview">
                            <img :src="item.block.src" :alt="item.block.alt || ''" style="max-width: 100%; height: auto;">
                          </div>
                          <div v-else class="tps-image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <span>Image</span>
                          </div>
                        </div>
                        <div v-else class="tps-grid-item-type-label">
                          {{ item.block.type }}
                        </div>
                      </div>
                      <!-- Resize handles -->
                      <div class="tps-grid-item-resize-col" @mousedown.prevent="handleGridItemResizeStart(block.id, itemIndex, 'col', $event)" />
                      <div class="tps-grid-item-resize-row" @mousedown.prevent="handleGridItemResizeStart(block.id, itemIndex, 'row', $event)" />
                    </div>
                  </template>
                  <!-- Add Item Button -->
                  <div class="tps-grid-add-item" @click="handleGridAddItem(block.id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Item
                  </div>
                </div>
              </div>

              <!-- Unknown Block -->
              <div v-else class="tps-block">
                <span>Unknown block type: {{ block.type }}</span>
              </div>
            </template>
          </draggable>

          <!-- Grid Layout Mode - Vue renders content, gridstack manages layout -->
          <div
            v-else
            ref="gridContainerRef"
            class="grid-stack tps-blocks-grid"
          >
            <div
              v-for="block in editorBlocks"
              :key="block.id"
              class="grid-stack-item"
              :gs-id="block.id"
              :gs-x="getBlockGridPosition(block).x"
              :gs-y="getBlockGridPosition(block).y"
              :gs-w="getBlockGridPosition(block).w"
              :gs-h="getBlockGridPosition(block).h"
              :gs-min-w="2"
              :gs-min-h="1"
            >
              <div class="grid-stack-item-content">
                <!-- Text Block -->
                <div v-if="isTextBlock(block)" class="tps-block tps-block-text tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <RichTextEditor
                    :content="block.content"
                    placeholder="Type something, or press / for commands..."
                    @update:content="(html: string) => handleBlockUpdate(block.id, { content: html })"
                  />
                </div>

                <!-- Heading Block -->
                <div v-else-if="isHeadingBlock(block)" class="tps-block tps-block-heading tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <input
                    :value="block.content"
                    type="text"
                    class="tps-block-input"
                    :class="`tps-heading-${block.level}`"
                    placeholder="Heading..."
                    @input="handleBlockUpdate(block.id, { content: ($event.target as HTMLInputElement).value })"
                  >
                </div>

                <!-- Widget Block -->
                <div v-else-if="isWidgetBlock(block)" class="tps-block tps-block-widget tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action" title="Configure" @click="openWidgetConfigModal(block)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                    </button>
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div v-if="block.showTitle !== false" class="tps-widget-header">
                    <input
                      :value="block.titleOverride || ''"
                      type="text"
                      class="tps-widget-title-input"
                      placeholder="Widget Title"
                      @input="handleBlockUpdate(block.id, { titleOverride: ($event.target as HTMLInputElement).value })"
                    >
                  </div>
                  <div v-if="!hasWidgetData(block)" class="tps-widget-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18" /><path d="M9 21V9" />
                    </svg>
                    <span>No data configured</span>
                    <button type="button" class="tps-btn tps-btn-sm tps-btn-primary" @click="openWidgetConfigModal(block)">
                      Configure Widget
                    </button>
                  </div>
                  <div v-else class="tps-widget-content">
                    <DataGrid
                      :widget-id="block.id"
                      :initial-view-state="getWidgetState(block.id) ?? undefined"
                      :data="getFilteredSampleData()"
                      :theme="resolvedTheme"
                      :show-controls="shouldShowControls(block.id)"
                      :enable-export="false"
                      :enable-pagination="false"
                      :enable-search="true"
                      :striped-rows="true"
                      :enable-vertical-resize="false"
                      :ai-analyst="getAiAnalystConfigForDatasource(block.metadata?.datasourceId as string)"
                      :initial-view-mode="shouldAutoShowAI(block) ? 'ai' : 'grid'"
                      style="height: 100%"
                      @view-state-change="(state) => saveWidgetState(block.id, state)"
                    />
                  </div>
                </div>

                <!-- Divider Block -->
                <div v-else-if="block.type === 'divider'" class="tps-block tps-block-divider tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <hr>
                </div>

                <!-- Stat Block -->
                <div v-else-if="block.type === 'stat'" class="tps-block tps-block-stat tps-grid-block" :data-size="block.size || 'medium'">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-stat-content">
                    <div class="tps-stat-value-wrapper">
                      <span v-if="block.prefix" class="tps-stat-prefix">{{ block.prefix }}</span>
                      <input
                        type="text"
                        class="tps-stat-value-input"
                        :value="block.value"
                        :style="{ color: block.color || undefined }"
                        @input="handleBlockUpdate(block.id, { value: ($event.target as HTMLInputElement).value })"
                      >
                      <span v-if="block.suffix" class="tps-stat-suffix">{{ block.suffix }}</span>
                    </div>
                    <input
                      type="text"
                      class="tps-stat-label-input"
                      :value="block.label"
                      placeholder="Label"
                      @input="handleBlockUpdate(block.id, { label: ($event.target as HTMLInputElement).value })"
                    >
                  </div>
                </div>

                <!-- Callout Block -->
                <div v-else-if="block.type === 'callout'" class="tps-block tps-block-callout tps-grid-block" :data-style="block.style || 'info'">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-callout-content">
                    <div class="tps-callout-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </div>
                    <div class="tps-callout-body">
                      <input
                        v-if="block.title !== undefined"
                        type="text"
                        class="tps-callout-title-input"
                        :value="block.title || ''"
                        placeholder="Title"
                        @input="handleBlockUpdate(block.id, { title: ($event.target as HTMLInputElement).value })"
                      >
                      <textarea
                        class="tps-callout-text-input"
                        :value="block.content"
                        placeholder="Callout content..."
                        @input="handleBlockUpdate(block.id, { content: ($event.target as HTMLTextAreaElement).value })"
                      />
                    </div>
                  </div>
                </div>

                <!-- Image Block -->
                <div v-else-if="block.type === 'image'" class="tps-block tps-block-image tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  <!-- Hidden file input for image upload -->
                  <input
                    :id="`grid-image-file-${block.id}`"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    style="display: none"
                    @change="(e) => handleImageFileChange(block.id, e)"
                  >

                  <!-- Image dropzone when no src -->
                  <div
                    v-if="!block.src && imageLoadingBlockId !== block.id"
                    class="tps-image-dropzone"
                    :class="{ 'tps-dragging': imageDragOverBlockId === block.id }"
                    @drop="(e) => handleImageDrop(block.id, e)"
                    @dragover="(e) => handleImageDragOver(block.id, e)"
                    @dragleave="(e) => handleImageDragLeave(block.id, e)"
                    @click="triggerGridImageFileInput(block.id)"
                  >
                    <svg class="tps-image-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <div class="tps-image-dropzone-text">
                      <strong>Drop an image</strong> or click to browse
                    </div>
                    <div class="tps-image-dropzone-hint">
                      Supports JPG, PNG, GIF, WebP
                    </div>
                  </div>

                  <!-- Loading state -->
                  <div v-else-if="imageLoadingBlockId === block.id" class="tps-image-loading">
                    <svg class="tps-image-loading-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span class="tps-image-loading-text">Loading image...</span>
                  </div>

                  <!-- Image preview when src exists -->
                  <div v-else class="tps-image-preview">
                    <img :src="block.src" :alt="block.alt || ''" :style="{ objectFit: block.objectFit || 'cover' }">
                  </div>
                </div>

                <!-- Columns Block -->
                <div v-else-if="block.type === 'columns'" class="tps-block tps-block-columns tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-columns-wrapper" :style="{ gap: `${block.gap || 16}px` }">
                    <div
                      v-for="(col, colIndex) in block.columns"
                      :key="col.id"
                      class="tps-column"
                      :style="{ flex: col.width }"
                    >
                      <div class="tps-column-label">
                        Column {{ colIndex + 1 }}
                      </div>
                      <div v-if="col.blocks.length === 0" class="tps-column-empty">
                        Empty
                      </div>
                      <div v-else class="tps-column-blocks-count">
                        {{ col.blocks.length }} block(s)
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Progress Block -->
                <div v-else-if="block.type === 'progress'" class="tps-block tps-block-progress tps-grid-block" :data-variant="block.variant || 'bar'">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-progress-content">
                    <input
                      v-if="block.label"
                      type="text"
                      class="tps-progress-label-input"
                      :value="block.label"
                      placeholder="Label"
                      @input="handleBlockUpdate(block.id, { label: ($event.target as HTMLInputElement).value })"
                    >
                    <div class="tps-progress-bar-wrapper">
                      <div class="tps-progress-bar" :style="{ width: `${(block.value / (block.max || 100)) * 100}%`, background: block.color || '#6366f1' }" />
                    </div>
                    <span v-if="block.showValue !== false" class="tps-progress-value">{{ Math.round((block.value / (block.max || 100)) * 100) }}%</span>
                  </div>
                </div>

                <!-- Spacer Block -->
                <div v-else-if="block.type === 'spacer'" class="tps-block tps-block-spacer tps-grid-block" :style="{ minHeight: `${block.height}px` }">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-spacer-indicator">
                    <span>Spacer ({{ block.height }}px)</span>
                  </div>
                </div>

                <!-- Quote Block -->
                <div v-else-if="block.type === 'quote'" class="tps-block tps-block-quote tps-grid-block" :data-style="block.style || 'simple'">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <div class="tps-quote-content">
                    <textarea
                      class="tps-quote-text-input"
                      :value="block.content"
                      placeholder="Quote text..."
                      @input="handleBlockUpdate(block.id, { content: ($event.target as HTMLTextAreaElement).value })"
                    />
                    <input
                      type="text"
                      class="tps-quote-author-input"
                      :value="block.author || ''"
                      placeholder="Author"
                      @input="handleBlockUpdate(block.id, { author: ($event.target as HTMLInputElement).value })"
                    >
                  </div>
                </div>

                <!-- Fallback for unknown block types -->
                <div v-else class="tps-block tps-grid-block">
                  <div class="tps-block-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
                    </svg>
                  </div>
                  <div class="tps-block-actions">
                    <button type="button" class="tps-block-action tps-block-delete" title="Delete" @click="handleBlockDelete(block.id)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                  <span class="tps-block-type-label">{{ block.type }} block</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Add Block Menu (shared between linear and grid modes) -->
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
              class="tps-add-block-option"
              @click="handleAddBlock('image')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              Image
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('callout')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              Callout
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('columns')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" />
              </svg>
              Columns
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('stat')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 20V10" />
                <path d="M12 20V4" />
                <path d="M20 20v-6" />
              </svg>
              Stat
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('progress')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="10" width="20" height="4" rx="2" />
                <rect x="2" y="10" width="12" height="4" rx="2" fill="currentColor" opacity="0.3" />
              </svg>
              Progress
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('spacer')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 6h16" />
                <path d="M4 18h16" />
                <path d="M12 9v6" />
                <path d="M9 11l3-3 3 3" />
                <path d="M9 13l3 3 3-3" />
              </svg>
              Spacer
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('quote')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
              </svg>
              Quote
            </button>
            <button
              type="button"
              class="tps-add-block-option"
              @click="handleAddBlock('grid')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Grid
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

    <!-- Widget Configuration Modal -->
    <div v-if="showWidgetConfigModal" class="tps-modal-overlay" @click="handleWidgetConfigOverlayClick">
      <div class="tps-modal" @click.stop>
        <div class="tps-modal-header">
          <h3 class="tps-modal-title">
            Configure Widget
          </h3>
          <button type="button" class="tps-modal-close" @click="closeWidgetConfigModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="handleSaveWidgetConfig">
          <div class="tps-modal-body">
            <div class="tps-form-group">
              <label class="tps-label" for="widget-title">Widget Title</label>
              <input
                id="widget-title"
                v-model="widgetConfigTitle"
                type="text"
                class="tps-input"
                placeholder="Sales Overview"
              >
            </div>

            <div class="tps-form-group">
              <label class="tps-checkbox-label">
                <input
                  v-model="widgetConfigShowTitle"
                  type="checkbox"
                  class="tps-checkbox"
                >
                <span>Show widget title</span>
              </label>
            </div>

            <div class="tps-form-group">
              <label class="tps-label" for="widget-datasource">Data Source</label>
              <select
                id="widget-datasource"
                :value="widgetConfigDatasourceId"
                class="tps-select"
                @change="handleWidgetDatasourceChange(($event.target as HTMLSelectElement).value)"
              >
                <option value="sample">
                  Sample Data (Demo)
                </option>
                <option v-for="ds in datasources" :key="ds.id" :value="ds.id">
                  {{ ds.name }} ({{ ds.type }})
                </option>
              </select>
              <p v-if="widgetConfigDatasourceId === 'sample'" class="tps-form-hint">
                Sample data shows a demo dataset. Select a connected data source to use real data.
              </p>
              <p v-else-if="datasources.length === 0" class="tps-form-hint tps-form-hint-warning">
                No data sources connected. Add a data source from the sidebar first.
              </p>
            </div>

            <div class="tps-form-group">
              <label class="tps-label" for="widget-viz-type">Visualization Type</label>
              <select
                id="widget-viz-type"
                v-model="widgetConfigVisualizationType"
                class="tps-select"
              >
                <option value="table">
                  Table (DataGrid)
                </option>
                <option value="pivot">
                  Pivot Table
                </option>
                <option value="chart">
                  Chart
                </option>
              </select>
              <p v-if="widgetConfigVisualizationType !== 'table'" class="tps-form-hint tps-form-hint-warning">
                Only Table visualization is currently available. Other types coming soon.
              </p>
            </div>

            <div class="tps-form-group">
              <label class="tps-label" for="widget-height">Height (pixels)</label>
              <input
                id="widget-height"
                v-model.number="widgetConfigHeight"
                type="number"
                class="tps-input"
                min="200"
                max="1000"
                step="50"
              >
            </div>
          </div>

          <div class="tps-modal-footer">
            <button type="button" class="tps-btn tps-btn-secondary" @click="closeWidgetConfigModal">
              Cancel
            </button>
            <button type="submit" class="tps-btn tps-btn-primary">
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Data Source Connection Modal -->
    <div v-if="showDatasourceModal" class="tps-modal-overlay" @click="closeDatasourceModal">
      <div class="tps-modal tps-modal-wide" @click.stop>
        <div class="tps-modal-header">
          <h3 class="tps-modal-title">
            {{ editingDatasource ? 'Edit Data Source' : 'Add Data Source' }}
          </h3>
          <button type="button" class="tps-modal-close" @click="closeDatasourceModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="handleSaveDatasource">
          <div class="tps-modal-body">
            <div class="tps-form-group">
              <label class="tps-label" for="ds-name">Connection Name</label>
              <input
                id="ds-name"
                v-model="dsFormName"
                type="text"
                class="tps-input"
                placeholder="My Database"
                autofocus
              >
            </div>

            <div class="tps-form-group">
              <label class="tps-label" for="ds-type">Database Type</label>
              <select
                id="ds-type"
                v-model="dsFormType"
                class="tps-select"
              >
                <option value="postgres">
                  PostgreSQL
                </option>
                <option value="snowflake">
                  Snowflake
                </option>
              </select>
            </div>

            <!-- PostgreSQL Fields -->
            <template v-if="dsFormType === 'postgres'">
              <div class="tps-form-row">
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-host">Host</label>
                  <input
                    id="ds-host"
                    v-model="dsFormHost"
                    type="text"
                    class="tps-input"
                    placeholder="localhost"
                  >
                </div>
                <div class="tps-form-group tps-form-group-small">
                  <label class="tps-label" for="ds-port">Port</label>
                  <input
                    id="ds-port"
                    v-model.number="dsFormPort"
                    type="number"
                    class="tps-input"
                    placeholder="5432"
                  >
                </div>
              </div>

              <div class="tps-form-group">
                <label class="tps-label" for="ds-database">Database</label>
                <input
                  id="ds-database"
                  v-model="dsFormDatabase"
                  type="text"
                  class="tps-input"
                  placeholder="mydb"
                >
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-username">Username</label>
                  <input
                    id="ds-username"
                    v-model="dsFormUsername"
                    type="text"
                    class="tps-input"
                    placeholder="postgres"
                  >
                </div>
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-password">Password</label>
                  <input
                    id="ds-password"
                    v-model="dsFormPassword"
                    type="password"
                    class="tps-input"
                    placeholder="********"
                  >
                </div>
              </div>
            </template>

            <!-- Snowflake Fields -->
            <template v-if="dsFormType === 'snowflake'">
              <div class="tps-form-group">
                <label class="tps-label" for="ds-account">Account Identifier</label>
                <input
                  id="ds-account"
                  v-model="dsFormAccount"
                  type="text"
                  class="tps-input"
                  placeholder="xy12345.us-east-1"
                >
                <p class="tps-form-hint">
                  Your Snowflake account identifier (e.g., xy12345.us-east-1)
                </p>
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-warehouse">Warehouse</label>
                  <input
                    id="ds-warehouse"
                    v-model="dsFormWarehouse"
                    type="text"
                    class="tps-input"
                    placeholder="COMPUTE_WH"
                  >
                </div>
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-sf-database">Database</label>
                  <input
                    id="ds-sf-database"
                    v-model="dsFormDatabase"
                    type="text"
                    class="tps-input"
                    placeholder="MY_DATABASE"
                  >
                </div>
              </div>

              <div class="tps-form-row">
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-schema">Schema</label>
                  <input
                    id="ds-schema"
                    v-model="dsFormSchema"
                    type="text"
                    class="tps-input"
                    placeholder="PUBLIC"
                  >
                </div>
                <div class="tps-form-group tps-form-group-flex">
                  <label class="tps-label" for="ds-role">Role (optional)</label>
                  <input
                    id="ds-role"
                    v-model="dsFormRole"
                    type="text"
                    class="tps-input"
                    placeholder="ACCOUNTADMIN"
                  >
                </div>
              </div>

              <div class="tps-form-group">
                <label class="tps-label" for="ds-auth-method">Authentication Method</label>
                <select
                  id="ds-auth-method"
                  v-model="dsFormAuthMethod"
                  class="tps-select"
                >
                  <option value="password">
                    Username & Password
                  </option>
                  <option value="keypair">
                    Key Pair (RSA)
                  </option>
                  <option value="externalbrowser">
                    External Browser (SSO)
                  </option>
                </select>
                <p class="tps-form-hint">
                  <template v-if="dsFormAuthMethod === 'password'">
                    Standard username and password authentication
                  </template>
                  <template v-else-if="dsFormAuthMethod === 'keypair'">
                    RSA key pair for server-to-server authentication
                  </template>
                  <template v-else-if="dsFormAuthMethod === 'externalbrowser'">
                    Opens browser for SSO login (local development only)
                  </template>
                </p>
              </div>

              <div class="tps-form-group">
                <label class="tps-label" for="ds-sf-username">Username</label>
                <input
                  id="ds-sf-username"
                  v-model="dsFormUsername"
                  type="text"
                  class="tps-input"
                  placeholder="my_user"
                >
              </div>

              <div v-if="dsFormAuthMethod === 'password'" class="tps-form-group">
                <label class="tps-label" for="ds-sf-password">Password</label>
                <input
                  id="ds-sf-password"
                  v-model="dsFormPassword"
                  type="password"
                  class="tps-input"
                  placeholder="********"
                >
              </div>

              <template v-if="dsFormAuthMethod === 'keypair'">
                <div class="tps-form-group">
                  <label class="tps-label" for="ds-sf-privatekey">Private Key (PEM)</label>
                  <textarea
                    id="ds-sf-privatekey"
                    v-model="dsFormPrivateKey"
                    class="tps-input tps-textarea"
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    rows="4"
                  />
                  <p class="tps-form-hint">
                    Paste your RSA private key in PEM format
                  </p>
                </div>
                <div class="tps-form-group">
                  <label class="tps-label" for="ds-sf-passphrase">Key Passphrase (optional)</label>
                  <input
                    id="ds-sf-passphrase"
                    v-model="dsFormPrivateKeyPassphrase"
                    type="password"
                    class="tps-input"
                    placeholder="Leave empty if key is not encrypted"
                  >
                </div>
              </template>

              <p v-if="dsFormAuthMethod === 'externalbrowser'" class="tps-form-hint tps-form-hint-info">
                When you test the connection, a browser window will open for SSO authentication.
                This method only works in local development environments.
              </p>
            </template>

            <!-- Test Connection Section -->
            <div class="tps-form-group">
              <div class="tps-test-connection">
                <button
                  type="button"
                  class="tps-btn tps-btn-secondary"
                  :disabled="datasourceTestStatus === 'testing'"
                  @click="handleTestConnection"
                >
                  <svg v-if="datasourceTestStatus === 'testing'" class="tps-spinner-inline" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4" stroke-dashoffset="10" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Test Connection
                </button>
                <span
                  v-if="datasourceTestMessage"
                  class="tps-test-result"
                  :class="{
                    'tps-test-success': datasourceTestStatus === 'success',
                    'tps-test-error': datasourceTestStatus === 'error',
                  }"
                >
                  {{ datasourceTestMessage }}
                </span>
              </div>
            </div>
          </div>

          <div class="tps-modal-footer">
            <button type="button" class="tps-btn tps-btn-secondary" @click="closeDatasourceModal">
              Cancel
            </button>
            <button type="submit" class="tps-btn tps-btn-primary" :disabled="!dsFormName.trim()">
              {{ editingDatasource ? 'Save Changes' : 'Add Data Source' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Version History Panel -->
    <div class="tps-version-panel" :class="{ 'tps-open': showVersionPanel }">
      <div class="tps-version-panel-header">
        <h3 class="tps-version-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Version History
        </h3>
        <button
          type="button"
          class="tps-version-panel-close"
          title="Close"
          @click="showVersionPanel = false"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="tps-version-panel-content">
        <!-- Create Version -->
        <div v-if="currentPage && !isPreviewMode" style="margin-bottom: 1rem;">
          <textarea
            v-model="newVersionDescription"
            class="tps-version-description-input"
            placeholder="Describe your changes (optional)..."
            rows="2"
          />
          <button
            type="button"
            class="tps-version-create"
            @click="createVersion(newVersionDescription || undefined)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Save Version
          </button>
        </div>

        <!-- Version List -->
        <div v-if="versions.length > 0" class="tps-version-list">
          <div
            v-for="(version, index) in versions"
            :key="version.id"
            class="tps-version-item"
            :class="{
              'tps-current': index === 0 && !isPreviewMode,
              'tps-previewing': previewingVersionId === version.id,
            }"
          >
            <div class="tps-version-item-header">
              <span class="tps-version-number">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Version {{ version.version }}
              </span>
              <span
                v-if="index === 0 && !isPreviewMode"
                class="tps-version-badge tps-current"
              >Current</span>
              <span
                v-else-if="previewingVersionId === version.id"
                class="tps-version-badge tps-preview"
              >Preview</span>
            </div>
            <div class="tps-version-time">
              {{ formatRelativeTime(version.createdAt) }}
            </div>
            <div v-if="version.changeDescription" class="tps-version-description">
              {{ version.changeDescription }}
            </div>
            <div class="tps-version-stats">
              <span class="tps-version-stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {{ version.blockCount }} blocks
              </span>
              <span v-if="version.widgetCount > 0" class="tps-version-stat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                {{ version.widgetCount }} widgets
              </span>
            </div>
            <div v-if="index !== 0 || isPreviewMode" class="tps-version-actions">
              <button
                v-if="previewingVersionId !== version.id"
                type="button"
                class="tps-version-action"
                @click="previewVersion(version.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Preview
              </button>
              <button
                type="button"
                class="tps-version-action tps-primary"
                @click="restoreVersion(version.id)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.9 3.2L3 13" />
                </svg>
                Restore
              </button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="tps-version-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span class="tps-version-empty-text">No versions saved yet</span>
          <span class="tps-version-empty-hint">
            Click "Save Version" to create a checkpoint
          </span>
        </div>
      </div>
    </div>

    <!-- Share Modal -->
    <ShareModal
      :is-open="showShareModal"
      :page-id="currentPage?.id ?? ''"
      :page-title="currentPage?.title ?? ''"
      :existing-share="currentPageShare"
      @close="showShareModal = false"
      @save="handleShareSave"
      @revoke="handleShareRevoke"
    />
  </div>
</template>
