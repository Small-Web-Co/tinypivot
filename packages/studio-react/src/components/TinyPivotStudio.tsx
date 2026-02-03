/**
 * TinyPivotStudio - Main React Component
 * The primary entry point for the TinyPivot Studio experience
 */
import type {
  Block,
  DatasourceConfig,
  GridPosition,
  HeadingBlock,
  LayoutMode,
  Page,
  PageListItem,
  PageShare,
  PageShareSettings,
  PageTemplate,
  PageVersionSummary,
  StorageAdapter,
  TextBlock,
  WidgetBlock,
  WidgetConfig,
} from '@smallwebco/tinypivot-studio'
import type { GridStackNode } from 'gridstack'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DataGrid } from '@smallwebco/tinypivot-react'
import { calculateContentHash, generateId, isHeadingBlock, isTextBlock, isWidgetBlock, MAX_VERSIONS_PER_PAGE } from '@smallwebco/tinypivot-studio'
import { GridStack } from 'gridstack'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type StudioConfig, StudioProvider, useStudioContext } from '../context'
import { getLastPage, getWidgetState, saveLastPage, saveWidgetState } from '../utils/widgetState'
import { RichTextEditor } from './RichTextEditor'
import { ShareModal } from './ShareModal'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'
import '@smallwebco/tinypivot-react/style.css'
import 'gridstack/dist/gridstack.min.css'

// LocalStorage key for datasources
const DATASOURCES_STORAGE_KEY = 'tinypivot-datasources'

// Version storage key prefix
const VERSION_STORAGE_PREFIX = 'tinypivot-versions-'

// Resize constraints
const MIN_HEIGHT = 200
const MAX_HEIGHT = 1000
const MIN_WIDTH = 200

// Widget sample data - used when no data source is configured
const widgetSampleData = [
  { id: 1, product: 'Widget A', category: 'Electronics', sales: 1250, revenue: 31250 },
  { id: 2, product: 'Widget B', category: 'Electronics', sales: 980, revenue: 24500 },
  { id: 3, product: 'Gadget X', category: 'Home', sales: 750, revenue: 18750 },
  { id: 4, product: 'Gadget Y', category: 'Home', sales: 620, revenue: 15500 },
  { id: 5, product: 'Device Z', category: 'Office', sales: 1100, revenue: 27500 },
]

// Helper functions for localStorage
function loadDatasources(): DatasourceConfig[] {
  try {
    const stored = localStorage.getItem(DATASOURCES_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  }
  catch (error) {
    console.error('Failed to load datasources:', error)
  }
  return []
}

function saveDatasources(ds: DatasourceConfig[]) {
  try {
    localStorage.setItem(DATASOURCES_STORAGE_KEY, JSON.stringify(ds))
  }
  catch (error) {
    console.error('Failed to save datasources:', error)
  }
}

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

// Check if widget should auto-show AI tab (has datasource but no table selected)
function shouldAutoShowAI(block: WidgetBlock): boolean {
  return Boolean(
    block.metadata?.datasourceId
    && block.metadata.datasourceId !== 'sample'
    && !block.metadata?.tableId,
  )
}

// ============================================================================
// Version History Helpers
// ============================================================================

// Load versions for a page
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

// Get full version data (with blocks)
function getFullVersion(pageId: string, versionId: string) {
  try {
    const stored = localStorage.getItem(`${VERSION_STORAGE_PREFIX}${pageId}-${versionId}`)
    if (stored) {
      return JSON.parse(stored)
    }
  }
  catch (error) {
    console.error('Failed to load version:', error)
  }
  return null
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

/**
 * Props for the TinyPivotStudio component
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
  /** Callback when a page is saved */
  onPageSave?: (page: Page) => void
  /** Callback when a widget is saved */
  onWidgetSave?: (widget: WidgetConfig) => void
  /** Custom class name */
  className?: string
}

/**
 * TinyPivotStudio - Main component for building data studio applications
 *
 * This component provides the complete studio experience including:
 * - Page management (create, edit, delete pages)
 * - Widget library (tables, charts, pivots, KPIs)
 * - Data source connection management
 * - AI-powered analytics (optional)
 *
 * @example
 * ```tsx
 * import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-react'
 *
 * function App() {
 *   return (
 *     <TinyPivotStudio
 *       userId={user.id}
 *       storage={indexedDbAdapter}
 *       datasource={{
 *         id: 'main',
 *         name: 'Analytics DB',
 *         type: 'snowflake',
 *         connectionString: '...'
 *       }}
 *       onPageSave={(page) => console.log('Saved:', page.title)}
 *     />
 *   )
 * }
 * ```
 */
export function TinyPivotStudio({
  userId,
  storage,
  datasource,
  apiEndpoint,
  userKey,
  aiAnalyst,
  cache,
  sampleData,
  theme = 'light',
  onPageSave,
  onWidgetSave,
  className,
}: TinyPivotStudioProps) {
  const config: StudioConfig = {
    userId,
    storage,
    datasource,
    apiEndpoint,
    userKey,
    aiAnalyst,
    cache,
    sampleData,
  }

  // Determine actual theme
  const resolvedTheme = useMemo(() => {
    if (theme === 'auto') {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
      return 'light'
    }
    return theme
  }, [theme])

  const themeClass = resolvedTheme === 'dark' ? 'tps-theme-dark' : ''

  return (
    <StudioProvider config={config}>
      <div className={`tps-studio ${themeClass} ${className ?? ''}`.trim()}>
        <StudioLayout
          theme={resolvedTheme}
          onPageSave={onPageSave}
          onWidgetSave={onWidgetSave}
        />
      </div>
    </StudioProvider>
  )
}

interface StudioLayoutProps {
  theme: 'light' | 'dark'
  onPageSave?: (page: Page) => void
  onWidgetSave?: (widget: WidgetConfig) => void
}

/**
 * Internal layout component for the studio
 * Provides the sidebar and main content area structure
 */
function StudioLayout({ theme, onPageSave }: StudioLayoutProps) {
  const { storage, apiEndpoint, userKey, userId, aiAnalyst, selectedDatasourceId, setSelectedDatasourceId } = useStudioContext()

  // Get AI Analyst config for a specific widget/datasource

  const getAiAnalystConfigForDatasource = useCallback((datasourceId?: string) => {
    if (!aiAnalyst?.endpoint)
      return undefined

    // If using sample data or no datasource, return basic config
    if (!datasourceId || datasourceId === 'sample') {
      return {
        enabled: true,
        embedded: true,
        endpoint: aiAnalyst.endpoint,
        persistToLocalStorage: true,
        sessionId: `studio-${userId || 'demo'}`,
        apiKey: aiAnalyst.apiKey,
      }
    }

    // For real datasources, include auth info for datasource-specific queries
    return {
      enabled: true,
      embedded: true,
      endpoint: aiAnalyst.endpoint,
      persistToLocalStorage: true,
      sessionId: `studio-${userId || 'demo'}-${datasourceId}`,
      datasourceId,
      userId,
      userKey: userKey || userId,
      apiKey: aiAnalyst.apiKey,
    }
  }, [aiAnalyst, userId, userKey])

  // State
  const [pages, setPages] = useState<PageListItem[]>([])
  const [currentPage, setCurrentPage] = useState<Page | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Widget configuration modal state
  const [showWidgetConfigModal, setShowWidgetConfigModal] = useState(false)
  const [widgetConfigBlockId, setWidgetConfigBlockId] = useState<string | null>(null)
  const [widgetConfigTitle, setWidgetConfigTitle] = useState('')
  const [widgetConfigHeight, setWidgetConfigHeight] = useState(400)
  const [widgetConfigVisualizationType, setWidgetConfigVisualizationType] = useState<'table' | 'pivot' | 'chart'>('table')
  const [widgetConfigShowTitle, setWidgetConfigShowTitle] = useState(true)
  // Datasource selection for widget
  const [widgetConfigDatasourceId, setWidgetConfigDatasourceId] = useState<string>('sample')

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false)
  const [currentPageShare, setCurrentPageShare] = useState<PageShare | null>(null)

  // Data source state
  const [datasources, setDatasources] = useState<DatasourceConfig[]>([])
  const [showDatasourceModal, setShowDatasourceModal] = useState(false)
  const [editingDatasource, setEditingDatasource] = useState<DatasourceConfig | null>(null)

  // Load datasources on mount
  useEffect(() => {
    setDatasources(loadDatasources())
  }, [])

  // Handle datasource deletion
  const handleDeleteDatasource = useCallback((dsId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this data source?')) {
      return
    }
    const updated = datasources.filter(d => d.id !== dsId)
    setDatasources(updated)
    saveDatasources(updated)
  }, [datasources])

  // Handle datasource save
  const handleSaveDatasource = useCallback((dsConfig: DatasourceConfig) => {
    let updated: DatasourceConfig[]
    if (editingDatasource) {
      updated = datasources.map(d => d.id === dsConfig.id ? dsConfig : d)
    }
    else {
      updated = [...datasources, dsConfig]
    }
    setDatasources(updated)
    saveDatasources(updated)
    setShowDatasourceModal(false)
    setEditingDatasource(null)
  }, [datasources, editingDatasource])

  // Open datasource modal for editing
  const openEditDatasource = useCallback((ds: DatasourceConfig) => {
    setEditingDatasource(ds)
    setShowDatasourceModal(true)
  }, [])

  // Load pages on mount
  useEffect(() => {
    async function loadPages() {
      if (!storage) {
        setIsLoading(false)
        return
      }

      try {
        const result = await storage.listPages()
        setPages(result.items)

        // Restore last page if available
        const lastPageId = getLastPage()
        if (lastPageId && result.items.length > 0) {
          const lastPage = result.items.find(p => p.id === lastPageId)
          if (lastPage) {
            const page = await storage.getPage(lastPageId)
            setCurrentPage(page)
          }
        }
      }
      catch (error) {
        console.error('Failed to load pages:', error)
      }
      finally {
        setIsLoading(false)
      }
    }

    loadPages()
  }, [storage])

  // Handle page selection
  const handleSelectPage = useCallback(async (pageId: string) => {
    if (!storage)
      return

    try {
      const page = await storage.getPage(pageId)
      setCurrentPage(page)

      // Save as last page
      saveLastPage(pageId)
    }
    catch (error) {
      console.error('Failed to load page:', error)
    }
  }, [storage])

  // Handle page deletion
  const handleDeletePage = useCallback(async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!storage)
      return

    if (!window.confirm('Are you sure you want to delete this page?')) {
      return
    }

    try {
      await storage.deletePage(pageId)
      setPages(prev => prev.filter(p => p.id !== pageId))
      if (currentPage?.id === pageId) {
        setCurrentPage(null)
      }
    }
    catch (error) {
      console.error('Failed to delete page:', error)
    }
  }, [storage, currentPage])

  // Handle page creation
  const handleCreatePage = useCallback(async (title: string, template: PageTemplate) => {
    if (!storage)
      return

    try {
      const page = await storage.createPage({
        title,
        template,
        blocks: getTemplateBlocks(template),
      })

      setPages(prev => [...prev, {
        id: page.id,
        title: page.title,
        slug: page.slug,
        published: page.published,
        archived: page.archived,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        template: page.template,
      }])

      setCurrentPage(page)
      setShowCreateModal(false)

      if (onPageSave) {
        onPageSave(page)
      }
    }
    catch (error) {
      console.error('Failed to create page:', error)
    }
  }, [storage, onPageSave])

  // Handle page update
  const handleUpdatePage = useCallback(async (updatedPage: Page) => {
    if (!storage)
      return

    try {
      const page = await storage.updatePage(updatedPage.id, {
        title: updatedPage.title,
        blocks: updatedPage.blocks,
      })

      setCurrentPage(page)
      setPages(prev => prev.map(p =>
        p.id === page.id
          ? { ...p, title: page.title, updatedAt: page.updatedAt }
          : p,
      ))

      if (onPageSave) {
        onPageSave(page)
      }
    }
    catch (error) {
      console.error('Failed to update page:', error)
    }
  }, [storage, onPageSave])

  // Toggle theme (placeholder - parent controls theme)
  const handleToggleTheme = useCallback(() => {
    // Theme is controlled by parent via props
    // This could emit an event or call a callback
  }, [])

  // Widget configuration modal functions
  const openWidgetConfigModal = useCallback((block: WidgetBlock) => {
    setWidgetConfigBlockId(block.id)
    setWidgetConfigTitle(block.titleOverride || '')
    setWidgetConfigHeight(typeof block.height === 'number' ? block.height : 400)
    setWidgetConfigVisualizationType((block.metadata?.visualizationType as 'table' | 'pivot' | 'chart') || 'table')
    setWidgetConfigShowTitle(block.showTitle !== false)
    // Load datasource from block metadata
    const dsId = (block.metadata?.datasourceId as string) || 'sample'
    setWidgetConfigDatasourceId(dsId)
    setShowWidgetConfigModal(true)
  }, [])

  const closeWidgetConfigModal = useCallback(() => {
    setShowWidgetConfigModal(false)
    setWidgetConfigBlockId(null)
    setWidgetConfigTitle('')
    setWidgetConfigHeight(400)
    setWidgetConfigVisualizationType('table')
    setWidgetConfigShowTitle(true)
    setWidgetConfigDatasourceId('sample')
  }, [])

  // Share modal functions
  const openShareModal = useCallback(async () => {
    if (!currentPage || !storage)
      return
    // Try to get existing share settings
    try {
      const settings = await storage.getShareSettings(currentPage.id)
      if (settings?.enabled) {
        // For now, open modal and let it show current settings
        // In production, would fetch active share token
      }
    }
    catch (err) {
      console.warn('Could not load share settings:', err)
    }
    setShowShareModal(true)
  }, [currentPage, storage])

  const handleShareSave = useCallback(async (settings: Partial<PageShareSettings>) => {
    if (!currentPage || !storage)
      return

    try {
      if (currentPageShare) {
        await storage.updateShareSettings(currentPage.id, settings)
      }
      else {
        const share = await storage.createShare(currentPage.id, settings)
        setCurrentPageShare(share)
      }
      // Keep modal open to show the link
    }
    catch (err) {
      console.error('Failed to create share:', err)
    }
  }, [currentPage, storage, currentPageShare])

  const handleShareRevoke = useCallback(async () => {
    if (!currentPageShare || !storage)
      return

    try {
      await storage.revokeShare(currentPageShare.token)
      setCurrentPageShare(null)
      setShowShareModal(false)
    }
    catch (err) {
      console.error('Failed to revoke share:', err)
    }
  }, [currentPageShare, storage])

  // Handle datasource selection change in widget config
  const handleWidgetDatasourceChange = useCallback((datasourceId: string) => {
    setWidgetConfigDatasourceId(datasourceId)
  }, [])

  return (
    <>
      <Sidebar
        pages={pages}
        currentPageId={currentPage?.id}
        isLoading={isLoading}
        onSelectPage={handleSelectPage}
        onDeletePage={handleDeletePage}
        onCreatePage={() => setShowCreateModal(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        datasources={datasources}
        selectedDatasourceId={selectedDatasourceId}
        onSelectDatasource={ds => setSelectedDatasourceId(ds.id)}
        onCreateDatasource={() => { setEditingDatasource(null); setShowDatasourceModal(true) }}
        onEditDatasource={openEditDatasource}
        onDeleteDatasource={handleDeleteDatasource}
      />

      <main className="tps-main">
        {!storage ? (
          <NoStorageState />
        ) : currentPage ? (
          <PageEditor
            page={currentPage}
            theme={theme}
            onUpdatePage={handleUpdatePage}
            onConfigureWidget={openWidgetConfigModal}
            getAiAnalystConfig={getAiAnalystConfigForDatasource}
            onShare={openShareModal}
          />
        ) : (
          <EmptyState onCreatePage={() => setShowCreateModal(true)} />
        )}
      </main>

      {showCreateModal && (
        <CreatePageModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePage}
        />
      )}

      {showWidgetConfigModal && (
        <WidgetConfigModal
          title={widgetConfigTitle}
          setTitle={setWidgetConfigTitle}
          height={widgetConfigHeight}
          setHeight={setWidgetConfigHeight}
          visualizationType={widgetConfigVisualizationType}
          setVisualizationType={setWidgetConfigVisualizationType}
          showTitle={widgetConfigShowTitle}
          setShowTitle={setWidgetConfigShowTitle}
          datasourceId={widgetConfigDatasourceId}
          onDatasourceChange={handleWidgetDatasourceChange}
          datasources={datasources}
          onClose={closeWidgetConfigModal}
          onSave={() => {
            if (!widgetConfigBlockId || !currentPage)
              return

            const isSampleData = widgetConfigDatasourceId === 'sample'
            const updates: Partial<WidgetBlock> = {
              titleOverride: widgetConfigTitle || undefined,
              height: widgetConfigHeight,
              widgetId: isSampleData ? 'sample' : widgetConfigDatasourceId,
              showTitle: widgetConfigShowTitle,
              metadata: {
                visualizationType: widgetConfigVisualizationType,
                datasourceId: isSampleData ? undefined : widgetConfigDatasourceId,
              },
            }

            const newBlocks = currentPage.blocks.map((block): Block =>
              block.id === widgetConfigBlockId ? { ...block, ...updates } as Block : block,
            )
            handleUpdatePage({ ...currentPage, blocks: newBlocks })
            closeWidgetConfigModal()
          }}
        />
      )}

      {showDatasourceModal && (
        <DatasourceModal
          datasource={editingDatasource}
          onClose={() => { setShowDatasourceModal(false); setEditingDatasource(null) }}
          onSave={handleSaveDatasource}
          apiEndpoint={apiEndpoint}
          userKey={userKey}
          userId={userId}
        />
      )}

      <ShareModal
        isOpen={showShareModal}
        pageId={currentPage?.id ?? ''}
        pageTitle={currentPage?.title ?? ''}
        existingShare={currentPageShare}
        onClose={() => setShowShareModal(false)}
        onSave={handleShareSave}
        onRevoke={handleShareRevoke}
      />
    </>
  )
}

/**
 * Sidebar component with page list
 */
interface SidebarProps {
  pages: PageListItem[]
  currentPageId?: string
  isLoading: boolean
  onSelectPage: (pageId: string) => void
  onDeletePage: (pageId: string, e: React.MouseEvent) => void
  onCreatePage: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  datasources: DatasourceConfig[]
  selectedDatasourceId: string | null
  onSelectDatasource: (ds: DatasourceConfig) => void
  onCreateDatasource: () => void
  onEditDatasource: (ds: DatasourceConfig) => void
  onDeleteDatasource: (dsId: string, e: React.MouseEvent) => void
}

function Sidebar({
  pages,
  currentPageId,
  isLoading,
  onSelectPage,
  onDeletePage,
  onCreatePage,
  datasources,
  selectedDatasourceId,
  onSelectDatasource,
  onCreateDatasource,
  onEditDatasource,
  onDeleteDatasource,
}: SidebarProps) {
  return (
    <aside className="tps-sidebar">
      <div className="tps-sidebar-header">
        <div className="tps-sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <span>TinyPivot Studio</span>
        </div>
      </div>

      <div className="tps-sidebar-section">
        <span className="tps-sidebar-section-title">Pages</span>
        <button
          type="button"
          className="tps-btn tps-btn-ghost tps-btn-sm tps-btn-icon"
          onClick={onCreatePage}
          title="New page"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="tps-page-list">
        {isLoading ? (
          <div className="tps-page-list-empty">
            <div className="tps-spinner tps-spinner-sm" />
          </div>
        ) : pages.length === 0 ? (
          <div className="tps-page-list-empty">No pages yet</div>
        ) : (
          pages.map(page => (
            <button
              key={page.id}
              type="button"
              className={`tps-page-item ${page.id === currentPageId ? 'tps-active' : ''}`}
              onClick={() => onSelectPage(page.id)}
            >
              <svg className="tps-page-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
              <span className="tps-page-item-title">{page.title}</span>
              <div className="tps-page-item-actions">
                <button
                  type="button"
                  className="tps-page-item-delete"
                  onClick={e => onDeletePage(page.id, e)}
                  title="Delete page"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Data Sources Section */}
      <div className="tps-sidebar-section">
        <span className="tps-sidebar-section-title">Data Sources</span>
        <button
          type="button"
          className="tps-btn tps-btn-ghost tps-btn-sm tps-btn-icon"
          onClick={onCreateDatasource}
          title="Add data source"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="tps-datasource-list">
        {datasources.length === 0 ? (
          <div className="tps-page-list-empty">No data sources</div>
        ) : (
          datasources.map(ds => (
            <button
              key={ds.id}
              type="button"
              className={`tps-page-item ${ds.id === selectedDatasourceId ? 'tps-active' : ''}`}
              onClick={() => onSelectDatasource(ds)}
            >
              <svg className="tps-page-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <div className="tps-datasource-item-content">
                <span className="tps-page-item-title">{ds.name}</span>
                <span className="tps-datasource-item-type">{getDatasourceTypeLabel(ds.type)}</span>
              </div>
              <div className="tps-page-item-actions">
                <button
                  type="button"
                  className="tps-page-item-edit"
                  onClick={(e) => { e.stopPropagation(); onEditDatasource(ds) }}
                  title="Edit data source"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="tps-page-item-delete"
                  onClick={e => onDeleteDatasource(ds.id, e)}
                  title="Delete data source"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}

/**
 * Empty state component displayed when no pages exist
 */
interface EmptyStateProps {
  onCreatePage: () => void
}

function EmptyState({ onCreatePage }: EmptyStateProps) {
  return (
    <div className="tps-empty-state">
      <div className="tps-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </div>
      <h2 className="tps-empty-title">Welcome to TinyPivot Studio</h2>
      <p className="tps-empty-description">
        Create pages to build interactive dashboards, reports, and data visualizations.
      </p>
      <div className="tps-empty-actions">
        <button type="button" className="tps-btn tps-btn-primary" onClick={onCreatePage}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create your first page
        </button>
      </div>
      <div className="tps-empty-links">
        <button type="button" className="tps-empty-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10,8 16,12 10,16" />
          </svg>
          Watch tutorial
        </button>
        <button type="button" className="tps-empty-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Read docs
        </button>
      </div>
    </div>
  )
}

/**
 * State shown when no storage adapter is configured
 */
function NoStorageState() {
  return (
    <div className="tps-empty-state">
      <div className="tps-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      </div>
      <h2 className="tps-empty-title">Storage Not Configured</h2>
      <p className="tps-empty-description">
        To save and load pages, please configure a storage adapter in the TinyPivotStudio component.
      </p>
    </div>
  )
}

/**
 * Create page modal
 */
interface CreatePageModalProps {
  onClose: () => void
  onCreate: (title: string, template: PageTemplate) => void
}

function CreatePageModal({ onClose, onCreate }: CreatePageModalProps) {
  const [title, setTitle] = useState('')
  const [template, setTemplate] = useState<PageTemplate>('blank')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim()) {
      onCreate(title.trim(), template)
    }
  }

  return (
    <div className="tps-modal-overlay" onClick={onClose}>
      <div className="tps-modal" onClick={e => e.stopPropagation()}>
        <div className="tps-modal-header">
          <h3 className="tps-modal-title">Create New Page</h3>
          <button type="button" className="tps-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="tps-modal-body">
            <div className="tps-form-group">
              <label className="tps-label" htmlFor="page-title">Page Title</label>
              <input
                id="page-title"
                type="text"
                className="tps-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="My Dashboard"
                autoFocus
              />
            </div>

            <div className="tps-form-group">
              <label className="tps-label">Template</label>
              <div className="tps-template-grid">
                {(['blank', 'article', 'dashboard', 'infographic'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`tps-template-card ${template === t ? 'tps-selected' : ''}`}
                    onClick={() => setTemplate(t)}
                  >
                    <TemplateIcon template={t} />
                    <span className="tps-template-card-label">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tps-modal-footer">
            <button type="button" className="tps-btn tps-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="tps-btn tps-btn-primary" disabled={!title.trim()}>
              Create Page
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Template icon component
 */
function TemplateIcon({ template }: { template: PageTemplate }) {
  switch (template) {
    case 'blank':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      )
    case 'article':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <path d="M8 13h8M8 17h8M8 9h2" />
        </svg>
      )
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'infographic':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      )
  }
}

/**
 * Page editor component
 */
interface PageEditorProps {
  page: Page
  theme: 'light' | 'dark'
  onUpdatePage: (page: Page) => void
  onConfigureWidget: (block: WidgetBlock) => void
  getAiAnalystConfig?: (datasourceId?: string) => Record<string, unknown> | undefined
  onShare?: () => void
}

interface ActiveFilter {
  id: string
  field: string
  value: string
  sourceWidgetId?: string
}

function PageEditor({ page, theme, onUpdatePage, onConfigureWidget, getAiAnalystConfig, onShare }: PageEditorProps) {
  const [title, setTitle] = useState(page.title)
  const [blocks, setBlocks] = useState<Block[]>(page.blocks)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])

  // Widget hover state tracking
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null)
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)

  const shouldShowControls = useCallback((blockId: string): boolean => {
    return hoveredBlockId === blockId || focusedBlockId === blockId
  }, [hoveredBlockId, focusedBlockId])

  const handleBlockFocusOut = useCallback((event: React.FocusEvent, _blockId: string) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null
    const blockElement = event.currentTarget as HTMLElement

    // Keep focus if the new target is still within the block
    if (relatedTarget && blockElement.contains(relatedTarget)) {
      return
    }
    setFocusedBlockId(null)
  }, [])

  // Layout mode state
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(page.layoutMode || 'linear')
  const gridInstanceRef = useRef<GridStack | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)

  // Check if there are any widget blocks in the editor
  const hasWidgetBlocks = blocks.some(block => block.type === 'widget' || block.type === 'widgetGrid')

  // Filter management functions
  const addFilter = useCallback((field: string, value: string, sourceWidgetId?: string) => {
    setActiveFilters((prevFilters) => {
      const existingIndex = prevFilters.findIndex(f => f.field === field)
      if (existingIndex >= 0) {
        const newFilters = [...prevFilters]
        newFilters[existingIndex] = { ...newFilters[existingIndex], value, sourceWidgetId }
        return newFilters
      }
      return [...prevFilters, { id: generateId(), field, value, sourceWidgetId }]
    })
  }, [])

  const removeFilter = useCallback((filterId: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== filterId))
  }, [])

  const clearAllFilters = useCallback(() => {
    setActiveFilters([])
  }, [])

  // Handle click on a row in a widget - enables click-to-filter
  const handleWidgetRowClick = useCallback((widgetBlockId: string, row: Record<string, unknown>) => {
    const filterableFields = Object.keys(row).filter(key => key !== 'id')
    if (filterableFields.length === 0)
      return

    const filterField = filterableFields.includes('category') ? 'category' : filterableFields[0]
    const filterValue = String(row[filterField] ?? '')

    if (filterValue) {
      addFilter(filterField, filterValue, widgetBlockId)
    }
  }, [addFilter])

  // ============================================================================
  // Grid Layout Mode
  // ============================================================================

  // Get grid position for a block (with defaults)
  const getBlockGridPosition = useCallback((block: Block): GridPosition => {
    return block.gridPosition ?? { x: 0, y: 0, w: 12, h: 2 }
  }, [])

  // Initialize gridstack when switching to grid mode
  const initGrid = useCallback(() => {
    if (gridInstanceRef.current)
      return
    if (!gridContainerRef.current)
      return

    // Initialize gridstack with auto: false so we can manually add widgets
    gridInstanceRef.current = GridStack.init({
      column: 12,
      cellHeight: 80,
      margin: 8,
      animate: true,
      draggable: { handle: '.tps-block-drag-handle' },
      resizable: { handles: 'e,se,s,sw,w' },
      float: true,
      auto: false,
    }, gridContainerRef.current)

    // Manually make each React-rendered element a gridstack widget
    const items = gridContainerRef.current.querySelectorAll('.grid-stack-item')
    items.forEach((el) => {
      gridInstanceRef.current!.makeWidget(el as HTMLElement)
    })

    gridInstanceRef.current.on('change', (_event: Event, items: GridStackNode[]) => {
      if (!items)
        return
      setBlocks((prevBlocks) => {
        const newBlocks = prevBlocks.map((block) => {
          const item = items.find(i => i.id === block.id)
          if (item) {
            return {
              ...block,
              gridPosition: {
                x: item.x ?? 0,
                y: item.y ?? 0,
                w: item.w ?? 12,
                h: item.h ?? 2,
              },
            }
          }
          return block
        })
        onUpdatePage({ ...page, title, blocks: newBlocks, layoutMode: 'grid' })
        return newBlocks
      })
    })
  }, [page, title, onUpdatePage])

  // Destroy gridstack instance
  const destroyGrid = useCallback(() => {
    if (gridInstanceRef.current) {
      gridInstanceRef.current.destroy(false)
      gridInstanceRef.current = null
    }
  }, [])

  // Convert blocks from linear to grid positions
  const convertLinearToGrid = useCallback(() => {
    let yPos = 0
    let currentRow: Block[] = []

    const placeRow = () => {
      if (currentRow.length === 0)
        return

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

      const maxHeight = Math.max(...currentRow.map(b => isWidgetBlock(b) ? 4 : 2))
      yPos += maxHeight
      currentRow = []
    }

    blocks.forEach((block) => {
      if (isWidgetBlock(block)) {
        currentRow.push(block)
        if (currentRow.length >= 2) {
          placeRow()
        }
      }
      else {
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

    placeRow()
  }, [blocks])

  // Convert blocks from grid to linear (sort by y, then x)
  const convertGridToLinear = useCallback(() => {
    setBlocks((prevBlocks) => {
      const sorted = [...prevBlocks].sort((a, b) => {
        const aY = a.gridPosition?.y ?? 0
        const bY = b.gridPosition?.y ?? 0
        if (aY !== bY)
          return aY - bY
        const aX = a.gridPosition?.x ?? 0
        const bX = b.gridPosition?.x ?? 0
        return aX - bX
      })
      return sorted
    })
  }, [])

  // Set layout mode
  const setLayoutMode = useCallback(async (newMode: LayoutMode) => {
    if (layoutMode === newMode)
      return

    if (newMode === 'grid') {
      convertLinearToGrid()
      setLayoutModeState('grid')
      // Wait for React to render, then initialize grid
      setTimeout(() => {
        initGrid()
      }, 100)
    }
    else {
      destroyGrid()
      convertGridToLinear()
      setLayoutModeState('linear')
    }

    onUpdatePage({ ...page, title, blocks, layoutMode: newMode })
  }, [layoutMode, convertLinearToGrid, convertGridToLinear, initGrid, destroyGrid, page, title, blocks, onUpdatePage])

  // Initialize grid on mount if in grid mode
  useEffect(() => {
    if (layoutMode === 'grid' && gridContainerRef.current && !gridInstanceRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        initGrid()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [layoutMode, initGrid])

  // Cleanup grid on unmount
  useEffect(() => {
    return () => {
      destroyGrid()
    }
  }, [destroyGrid])

  // ============================================================================
  // Undo/Redo System
  // ============================================================================
  const MAX_HISTORY_SIZE = 50

  interface HistoryEntry {
    blocks: Block[]
    title: string
    timestamp: number
  }

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const isUndoRedoRef = useRef(false) // Flag to prevent recording during undo/redo

  // Check if undo/redo is available
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  // Record a state change to history
  const recordHistory = useCallback(() => {
    if (isUndoRedoRef.current)
      return

    const entry: HistoryEntry = {
      blocks: JSON.parse(JSON.stringify(blocks)),
      title,
      timestamp: Date.now(),
    }

    setHistory((prev) => {
      // If we're not at the end of history, remove future entries
      const newHistory = historyIndex < prev.length - 1
        ? prev.slice(0, historyIndex + 1)
        : prev

      // Add new entry
      const updated = [...newHistory, entry]

      // Trim history if too large
      if (updated.length > MAX_HISTORY_SIZE) {
        return updated.slice(-MAX_HISTORY_SIZE)
      }
      return updated
    })

    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1))
  }, [blocks, title, historyIndex])

  // Perform undo
  const undo = useCallback(() => {
    if (historyIndex <= 0)
      return

    isUndoRedoRef.current = true
    const newIndex = historyIndex - 1
    const entry = history[newIndex]
    setBlocks(JSON.parse(JSON.stringify(entry.blocks)))
    setTitle(entry.title)
    setHistoryIndex(newIndex)
    onUpdatePage({ ...page, title: entry.title, blocks: entry.blocks })
    isUndoRedoRef.current = false
  }, [historyIndex, history, page, onUpdatePage])

  // Perform redo
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1)
      return

    isUndoRedoRef.current = true
    const newIndex = historyIndex + 1
    const entry = history[newIndex]
    setBlocks(JSON.parse(JSON.stringify(entry.blocks)))
    setTitle(entry.title)
    setHistoryIndex(newIndex)
    onUpdatePage({ ...page, title: entry.title, blocks: entry.blocks })
    isUndoRedoRef.current = false
  }, [historyIndex, history, page, onUpdatePage])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey

      if (ctrlOrCmd && event.key === 'z') {
        if (event.shiftKey) {
          event.preventDefault()
          redo()
        }
        else {
          event.preventDefault()
          undo()
        }
      }
      else if (ctrlOrCmd && event.key === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  // ============================================================================
  // Version History
  // ============================================================================
  const [showVersionPanel, setShowVersionPanel] = useState(false)
  const [versions, setVersions] = useState<PageVersionSummary[]>([])
  const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null)
  // previewBlocks stores the blocks of the version being previewed (for future use)
  const [, setPreviewBlocks] = useState<Block[] | null>(null)
  const [newVersionDescription, setNewVersionDescription] = useState('')

  // Load versions when page changes
  useEffect(() => {
    setVersions(loadVersions(page.id))
    setPreviewingVersionId(null)
    setPreviewBlocks(null)
  }, [page.id])

  // Create a new version
  const createVersion = useCallback((description?: string) => {
    const existingVersions = loadVersions(page.id)

    // Calculate content hash to check if anything changed
    const currentHash = calculateContentHash(blocks)
    const latestVersionSummary = existingVersions[0]

    // Check if content has changed by comparing with latest full version
    if (latestVersionSummary && !description) {
      const latestFullVersion = getFullVersion(page.id, latestVersionSummary.id)
      if (latestFullVersion?.contentHash === currentHash) {
        return // No changes, skip creating version
      }
    }

    const newVersion: PageVersionSummary = {
      id: generateId(),
      pageId: page.id,
      version: (existingVersions[0]?.version || 0) + 1,
      title,
      createdAt: new Date(),
      changeDescription: description || undefined,
      blockCount: blocks.length,
      widgetCount: blocks.filter(b => b.type === 'widget' || b.type === 'widgetGrid').length,
    }

    // Store full blocks separately for this version
    const fullVersion = {
      ...newVersion,
      blocks: JSON.parse(JSON.stringify(blocks)),
      contentHash: currentHash,
    }
    localStorage.setItem(`${VERSION_STORAGE_PREFIX}${page.id}-${newVersion.id}`, JSON.stringify(fullVersion))

    // Update versions list (newest first)
    const updatedVersions = [newVersion, ...existingVersions]

    // Prune old versions if exceeding max
    if (updatedVersions.length > MAX_VERSIONS_PER_PAGE) {
      const removed = updatedVersions.splice(MAX_VERSIONS_PER_PAGE)
      // Clean up storage for removed versions
      removed.forEach((v) => {
        localStorage.removeItem(`${VERSION_STORAGE_PREFIX}${page.id}-${v.id}`)
      })
    }

    saveVersions(page.id, updatedVersions)
    setVersions(updatedVersions)
    setNewVersionDescription('')
  }, [blocks, title, page.id])

  // Preview a version
  const previewVersion = useCallback((versionId: string) => {
    const fullVersion = getFullVersion(page.id, versionId)
    if (fullVersion) {
      setPreviewingVersionId(versionId)
      setPreviewBlocks(fullVersion.blocks)
    }
  }, [page.id])

  // Cancel preview
  const cancelPreview = useCallback(() => {
    setPreviewingVersionId(null)
    setPreviewBlocks(null)
  }, [])

  // Restore a version
  const restoreVersion = useCallback((versionId: string) => {
    const fullVersion = getFullVersion(page.id, versionId)
    if (!fullVersion)
      return

    // Create a backup of current state before restoring
    createVersion('Auto-backup before restore')

    // Restore the blocks
    const restoredBlocks = JSON.parse(JSON.stringify(fullVersion.blocks))
    setBlocks(restoredBlocks)
    if (fullVersion.title) {
      setTitle(fullVersion.title)
    }

    // Save the restored state
    onUpdatePage({ ...page, title: fullVersion.title || title, blocks: restoredBlocks })

    // Clear preview state
    cancelPreview()

    // Create a new version marking this as a restore point
    setTimeout(() => {
      createVersion(`Restored from version ${fullVersion.version}`)
    }, 100)
  }, [page, title, createVersion, cancelPreview, onUpdatePage])

  // Check if currently previewing
  const isPreviewMode = previewingVersionId !== null

  // Toggle version panel
  const toggleVersionPanel = useCallback(() => {
    setShowVersionPanel(prev => !prev)
  }, [])

  // dnd-kit sensors for pointer and keyboard
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Update local state when page changes
  useEffect(() => {
    setTitle(page.title)
    setBlocks(page.blocks)
  }, [page.id, page.title, page.blocks])

  // Handle title change
  const handleTitleBlur = () => {
    if (title !== page.title) {
      onUpdatePage({ ...page, title, blocks })
    }
  }

  // Handle block update
  const handleBlockUpdate = (blockId: string, updates: Partial<Block>) => {
    recordHistory() // Save state before change for undo
    const newBlocks = blocks.map((block): Block =>
      block.id === blockId ? { ...block, ...updates } as Block : block,
    )
    setBlocks(newBlocks)
    onUpdatePage({ ...page, title, blocks: newBlocks })
  }

  // Handle block deletion
  const handleBlockDelete = (blockId: string) => {
    recordHistory() // Save state before change for undo

    // Remove from gridstack if in grid mode
    if (layoutMode === 'grid' && gridInstanceRef.current && gridContainerRef.current) {
      const el = gridContainerRef.current.querySelector(`[gs-id="${blockId}"]`)
      if (el) {
        gridInstanceRef.current.removeWidget(el as HTMLElement, false)
      }
    }

    const newBlocks = blocks.filter(block => block.id !== blockId)
    setBlocks(newBlocks)
    onUpdatePage({ ...page, title, blocks: newBlocks })
  }

  // Handle add block
  const handleAddBlock = (type: Block['type']) => {
    recordHistory() // Save state before change for undo
    const newBlock = createBlock(type)

    // Assign grid position if in grid mode
    if (layoutMode === 'grid') {
      const maxY = blocks.reduce((max, b) => {
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

    const newBlocks = [...blocks, newBlock]
    setBlocks(newBlocks)
    setShowBlockMenu(false)
    onUpdatePage({ ...page, title, blocks: newBlocks })

    // Tell gridstack about the new React-rendered element
    if (layoutMode === 'grid' && gridInstanceRef.current) {
      setTimeout(() => {
        const newEl = gridContainerRef.current?.querySelector(`[gs-id="${newBlock.id}"]`) as HTMLElement
        if (newEl) {
          gridInstanceRef.current!.makeWidget(newEl)
        }
      }, 50)
    }
  }

  // Handle drag end for reordering blocks
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      recordHistory() // Save state before change for undo
      const oldIndex = blocks.findIndex(b => b.id === active.id)
      const newIndex = blocks.findIndex(b => b.id === over.id)

      const newBlocks = arrayMove(blocks, oldIndex, newIndex)
      setBlocks(newBlocks)
      onUpdatePage({ ...page, title, blocks: newBlocks })
    }
  }

  return (
    <div className="tps-editor">
      <div className="tps-editor-header">
        <div className="tps-editor-title-wrapper">
          <input
            type="text"
            className="tps-editor-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Untitled"
          />
        </div>
        <div className="tps-editor-actions">
          {/* Undo/Redo Buttons */}
          <button
            type="button"
            className={`tps-editor-action ${!canUndo ? 'tps-disabled' : ''}`}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            onClick={undo}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.9 3.2L3 13" />
            </svg>
          </button>
          <button
            type="button"
            className={`tps-editor-action ${!canRedo ? 'tps-disabled' : ''}`}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            onClick={redo}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.9 3.2L21 13" />
            </svg>
          </button>
          {/* Layout Mode Toggle */}
          <div className="tps-layout-toggle">
            <button
              type="button"
              className={`tps-layout-btn ${layoutMode === 'linear' ? 'tps-active' : ''}`}
              title="Linear Layout"
              onClick={() => setLayoutMode('linear')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              className={`tps-layout-btn ${layoutMode === 'grid' ? 'tps-active' : ''}`}
              title="Grid Layout"
              onClick={() => setLayoutMode('grid')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
          </div>
          {/* Version History Toggle */}
          <button
            type="button"
            className={`tps-version-toggle ${showVersionPanel ? 'tps-active' : ''}`}
            title="Version History"
            onClick={toggleVersionPanel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {versions.length > 0 && (
              <span className="tps-version-count">{versions.length}</span>
            )}
          </button>
          {/* Share Button */}
          {onShare && (
            <button
              type="button"
              className="tps-btn tps-btn-share"
              title="Share page"
              onClick={onShare}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          )}
        </div>
      </div>

      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="tps-preview-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="tps-preview-banner-text">
            Previewing version
            {' '}
            {versions.find(v => v.id === previewingVersionId)?.version}
          </span>
          <div className="tps-preview-banner-actions">
            <button
              type="button"
              className="tps-preview-banner-btn tps-restore"
              onClick={() => restoreVersion(previewingVersionId!)}
            >
              Restore this version
            </button>
            <button
              type="button"
              className="tps-preview-banner-btn tps-cancel"
              onClick={cancelPreview}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar - Reactive Field Linking */}
      {(activeFilters.length > 0 || hasWidgetBlocks) && (
        <div className="tps-filter-bar">
          <span className="tps-filter-bar-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
            </svg>
            Filters
          </span>
          <div className="tps-filter-pills">
            {activeFilters.map(filter => (
              <div key={filter.id} className="tps-filter-pill">
                <span className="tps-filter-pill-field">
                  {filter.field}
                  :
                </span>
                <span className="tps-filter-pill-value">{filter.value}</span>
                <button
                  type="button"
                  className="tps-filter-pill-remove"
                  title="Remove filter"
                  onClick={() => removeFilter(filter.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {activeFilters.length > 0 && (
            <button
              type="button"
              className="tps-filter-clear-all"
              onClick={clearAllFilters}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="tps-editor-content">
        {/* Linear Layout Mode */}
        {layoutMode === 'linear' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map(b => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="tps-blocks">
                {blocks.map(block => (
                  <SortableBlockWrapper key={block.id} id={block.id}>
                    <BlockRenderer
                      block={block}
                      theme={theme}
                      onUpdate={handleBlockUpdate}
                      onDelete={handleBlockDelete}
                      onConfigureWidget={onConfigureWidget}
                      activeFilters={activeFilters}
                      onWidgetRowClick={handleWidgetRowClick}
                      getAiAnalystConfig={getAiAnalystConfig}
                      shouldShowControls={shouldShowControls}
                      onMouseEnter={setHoveredBlockId}
                      onMouseLeave={() => setHoveredBlockId(null)}
                      onFocusIn={setFocusedBlockId}
                      onFocusOut={handleBlockFocusOut}
                    />
                  </SortableBlockWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          /* Grid Layout Mode */
          <div
            ref={gridContainerRef}
            className="grid-stack tps-blocks-grid"
          >
            {blocks.map(block => (
              <div
                key={block.id}
                className="grid-stack-item"
                gs-id={block.id}
                gs-x={getBlockGridPosition(block).x}
                gs-y={getBlockGridPosition(block).y}
                gs-w={getBlockGridPosition(block).w}
                gs-h={getBlockGridPosition(block).h}
                gs-min-w={2}
                gs-min-h={1}
              >
                <div className="grid-stack-item-content">
                  <GridBlockRenderer
                    block={block}
                    theme={theme}
                    onUpdate={handleBlockUpdate}
                    onDelete={handleBlockDelete}
                    onConfigureWidget={onConfigureWidget}
                    activeFilters={activeFilters}
                    onWidgetRowClick={handleWidgetRowClick}
                    getAiAnalystConfig={getAiAnalystConfig}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Block Menu - shared between both modes */}
        <div className="tps-blocks">
          {showBlockMenu ? (
            <div className="tps-add-block-menu">
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('text')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                </svg>
                Text
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('heading')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 4v16M18 4v16M6 12h12" />
                </svg>
                Heading
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('divider')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 12h18" />
                </svg>
                Divider
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('widget')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                Widget
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('image')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Image
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('callout')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
                Callout
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('columns')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18M15 3v18" />
                </svg>
                Columns
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('stat')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 20V10" />
                  <path d="M12 20V4" />
                  <path d="M20 20v-6" />
                </svg>
                Stat
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('progress')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="10" width="20" height="4" rx="2" />
                  <rect x="2" y="10" width="12" height="4" rx="2" fill="currentColor" opacity="0.3" />
                </svg>
                Progress
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('spacer')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                className="tps-add-block-option"
                onClick={() => handleAddBlock('quote')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
                </svg>
                Quote
              </button>
              <button
                type="button"
                className="tps-add-block-option"
                onClick={() => handleAddBlock('grid')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Grid
              </button>
              <button
                type="button"
                className="tps-btn tps-btn-ghost tps-btn-sm"
                onClick={() => setShowBlockMenu(false)}
                style={{ marginLeft: 'auto' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tps-add-block"
              onClick={() => setShowBlockMenu(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add block
            </button>
          )}
        </div>
      </div>

      {/* Version History Panel */}
      <div className={`tps-version-panel ${showVersionPanel ? 'tps-open' : ''}`}>
        <div className="tps-version-panel-header">
          <h3 className="tps-version-panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Version History
          </h3>
          <button
            type="button"
            className="tps-version-panel-close"
            title="Close"
            onClick={() => setShowVersionPanel(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="tps-version-panel-content">
          {/* Create Version */}
          {!isPreviewMode && (
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                className="tps-version-description-input"
                placeholder="Describe your changes (optional)..."
                rows={2}
                value={newVersionDescription}
                onChange={e => setNewVersionDescription(e.target.value)}
              />
              <button
                type="button"
                className="tps-version-create"
                onClick={() => createVersion(newVersionDescription || undefined)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Save Version
              </button>
            </div>
          )}

          {/* Version List */}
          {versions.length > 0 ? (
            <div className="tps-version-list">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className={`tps-version-item ${
                    index === 0 && !isPreviewMode ? 'tps-current' : ''
                  } ${previewingVersionId === version.id ? 'tps-previewing' : ''}`}
                >
                  <div className="tps-version-item-header">
                    <span className="tps-version-number">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      Version
                      {' '}
                      {version.version}
                    </span>
                    {index === 0 && !isPreviewMode && (
                      <span className="tps-version-badge tps-current">Current</span>
                    )}
                    {previewingVersionId === version.id && (
                      <span className="tps-version-badge tps-preview">Preview</span>
                    )}
                  </div>
                  <div className="tps-version-time">
                    {formatRelativeTime(version.createdAt)}
                  </div>
                  {version.changeDescription && (
                    <div className="tps-version-description">
                      {version.changeDescription}
                    </div>
                  )}
                  <div className="tps-version-stats">
                    <span className="tps-version-stat">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                      {version.blockCount}
                      {' '}
                      blocks
                    </span>
                    {version.widgetCount > 0 && (
                      <span className="tps-version-stat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9h18" />
                          <path d="M9 21V9" />
                        </svg>
                        {version.widgetCount}
                        {' '}
                        widgets
                      </span>
                    )}
                  </div>
                  {(index !== 0 || isPreviewMode) && (
                    <div className="tps-version-actions">
                      {previewingVersionId !== version.id && (
                        <button
                          type="button"
                          className="tps-version-action"
                          onClick={() => previewVersion(version.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Preview
                        </button>
                      )}
                      <button
                        type="button"
                        className="tps-version-action tps-primary"
                        onClick={() => restoreVersion(version.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7v6h6" />
                          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.9 3.2L3 13" />
                        </svg>
                        Restore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="tps-version-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="tps-version-empty-text">No versions saved yet</span>
              <span className="tps-version-empty-hint">
                Click &quot;Save Version&quot; to create a checkpoint
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Sortable block wrapper component
 * Provides drag handle and sortable functionality for blocks
 */
interface SortableBlockWrapperProps {
  id: string
  children: React.ReactNode
}

function SortableBlockWrapper({ id, children }: SortableBlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'tps-block-dragging' : ''}>
      <div className="tps-block-drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="6" r="1" />
          <circle cx="15" cy="6" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="9" cy="18" r="1" />
          <circle cx="15" cy="18" r="1" />
        </svg>
      </div>
      {children}
    </div>
  )
}

/**
 * Block renderer component
 */
interface BlockRendererProps {
  block: Block
  theme: 'light' | 'dark'
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
  onConfigureWidget: (block: WidgetBlock) => void
  /** For nested blocks inside columns */
  isNested?: boolean
  /** Filter state for reactive field linking */
  activeFilters?: ActiveFilter[]
  /** Callback when row is clicked in a widget */
  onWidgetRowClick?: (widgetBlockId: string, row: Record<string, unknown>) => void
  /** Get AI Analyst config for a datasource */
  getAiAnalystConfig?: (datasourceId?: string) => Record<string, unknown> | undefined
  /** Whether controls should be visible for this block */
  shouldShowControls?: (blockId: string) => boolean
  /** Callback when mouse enters block */
  onMouseEnter?: (blockId: string) => void
  /** Callback when mouse leaves block */
  onMouseLeave?: () => void
  /** Callback when block receives focus */
  onFocusIn?: (blockId: string) => void
  /** Callback when block loses focus */
  onFocusOut?: (event: React.FocusEvent, blockId: string) => void
}

function BlockRenderer({ block, theme, onUpdate, onDelete, onConfigureWidget, isNested, activeFilters, onWidgetRowClick, getAiAnalystConfig, shouldShowControls, onMouseEnter, onMouseLeave, onFocusIn, onFocusOut }: BlockRendererProps) {
  if (block.type === 'text') {
    return (
      <TextBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'heading') {
    return (
      <HeadingBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'divider') {
    return (
      <DividerBlockComponent
        block={block}
        onDelete={onDelete}
      />
    )
  }

  if (isWidgetBlock(block)) {
    return (
      <WidgetBlockComponent
        block={block}
        theme={theme}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onConfigure={onConfigureWidget}
        activeFilters={activeFilters}
        onRowClick={onWidgetRowClick}
        getAiAnalystConfig={getAiAnalystConfig}
        showControls={shouldShowControls?.(block.id)}
        onMouseEnter={onMouseEnter ? () => onMouseEnter(block.id) : undefined}
        onMouseLeave={onMouseLeave}
        onFocusIn={onFocusIn ? () => onFocusIn(block.id) : undefined}
        onFocusOut={onFocusOut ? (e: React.FocusEvent) => onFocusOut(e, block.id) : undefined}
      />
    )
  }

  if (block.type === 'image') {
    return (
      <ImageBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'callout') {
    return (
      <CalloutBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'columns') {
    return (
      <ColumnsBlockComponent
        block={block}
        theme={theme}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onConfigureWidget={onConfigureWidget}
        isNested={isNested}
        getAiAnalystConfig={getAiAnalystConfig}
      />
    )
  }

  if (block.type === 'stat') {
    return (
      <StatBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'progress') {
    return (
      <ProgressBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'spacer') {
    return (
      <SpacerBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'quote') {
    return (
      <QuoteBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  if (block.type === 'grid') {
    return (
      <GridBlockComponent
        block={block}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    )
  }

  return (
    <div className="tps-block">
      <span>
        Unknown block type:
        {block.type}
      </span>
    </div>
  )
}

/**
 * Grid block renderer - renders blocks with drag handles for grid mode
 */
function GridBlockRenderer({ block, theme, onUpdate, onDelete, onConfigureWidget, activeFilters, onWidgetRowClick: _onWidgetRowClick, getAiAnalystConfig, shouldShowControls }: BlockRendererProps) {
  const DragHandle = () => (
    <div className="tps-block-drag-handle" title="Drag to reorder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="6" r="1" />
        <circle cx="15" cy="6" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="18" r="1" />
        <circle cx="15" cy="18" r="1" />
      </svg>
    </div>
  )

  const DeleteButton = () => (
    <button
      type="button"
      className="tps-block-action tps-block-delete"
      title="Delete"
      onClick={() => onDelete(block.id)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  )

  if (isTextBlock(block)) {
    return (
      <div className="tps-block tps-block-text tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <textarea
          value={block.content}
          className="tps-block-input"
          placeholder="Type some text..."
          onChange={e => onUpdate(block.id, { content: e.target.value })}
        />
      </div>
    )
  }

  if (isHeadingBlock(block)) {
    return (
      <div className="tps-block tps-block-heading tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <input
          value={block.content}
          type="text"
          className={`tps-block-input tps-heading-${block.level}`}
          placeholder="Heading..."
          onChange={e => onUpdate(block.id, { content: e.target.value })}
        />
      </div>
    )
  }

  if (isWidgetBlock(block)) {
    const widgetSampleData = [
      { id: 1, product: 'Widget A', category: 'Electronics', sales: 1250, revenue: 31250 },
      { id: 2, product: 'Widget B', category: 'Electronics', sales: 980, revenue: 24500 },
      { id: 3, product: 'Gadget X', category: 'Home', sales: 750, revenue: 18750 },
      { id: 4, product: 'Gadget Y', category: 'Home', sales: 620, revenue: 15500 },
      { id: 5, product: 'Device Z', category: 'Office', sales: 1100, revenue: 27500 },
    ]

    const filteredData = activeFilters?.length
      ? widgetSampleData.filter(row =>
          activeFilters.every(filter => String(row[filter.field as keyof typeof row] ?? '') === filter.value),
        )
      : widgetSampleData

    const hasData = block.widgetId && block.widgetId !== ''

    return (
      <div className="tps-block tps-block-widget tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <button
            type="button"
            className="tps-block-action"
            title="Configure"
            onClick={() => onConfigureWidget(block)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
          <DeleteButton />
        </div>
        {block.showTitle !== false && (
          <div className="tps-widget-header">
            <input
              value={block.titleOverride || ''}
              type="text"
              className="tps-widget-title-input"
              placeholder="Widget Title"
              onChange={e => onUpdate(block.id, { titleOverride: e.target.value })}
            />
          </div>
        )}
        {!hasData ? (
          <div className="tps-widget-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            <span>No data configured</span>
            <button type="button" className="tps-btn tps-btn-sm tps-btn-primary" onClick={() => onConfigureWidget(block)}>
              Configure Widget
            </button>
          </div>
        ) : (
          <div className="tps-widget-content">
            <DataGrid
              widgetId={block.id}
              initialViewState={getWidgetState(block.id) ?? undefined}
              data={filteredData}
              theme={theme}
              showControls={shouldShowControls?.(block.id)}
              enableExport={false}
              enablePagination={false}
              enableSearch
              stripedRows
              enableVerticalResize={false}
              initialViewMode={shouldAutoShowAI(block) ? 'ai' : 'grid'}
              aiAnalyst={getAiAnalystConfig?.(block.metadata?.datasourceId as string)}
              onViewStateChange={state => saveWidgetState(block.id, state)}
            />
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'divider') {
    return (
      <div className="tps-block tps-block-divider tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <hr />
      </div>
    )
  }

  if (block.type === 'stat') {
    const statBlock = block as Block & { type: 'stat', value: string | number, label: string, prefix?: string, suffix?: string, size?: string, color?: string }
    return (
      <div className="tps-block tps-block-stat tps-grid-block" data-size={statBlock.size || 'medium'}>
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-stat-content">
          <div className="tps-stat-value-wrapper">
            {statBlock.prefix && <span className="tps-stat-prefix">{statBlock.prefix}</span>}
            <input
              type="text"
              className="tps-stat-value-input"
              value={statBlock.value}
              style={{ color: statBlock.color || undefined }}
              onChange={e => onUpdate(block.id, { value: e.target.value })}
            />
            {statBlock.suffix && <span className="tps-stat-suffix">{statBlock.suffix}</span>}
          </div>
          <input
            type="text"
            className="tps-stat-label-input"
            value={statBlock.label}
            placeholder="Label"
            onChange={e => onUpdate(block.id, { label: e.target.value })}
          />
        </div>
      </div>
    )
  }

  if (block.type === 'callout') {
    const calloutBlock = block as Block & { type: 'callout', content: string, style?: string, title?: string }
    return (
      <div className="tps-block tps-block-callout tps-grid-block" data-style={calloutBlock.style || 'info'}>
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-callout-content">
          {calloutBlock.title && <div className="tps-callout-title">{calloutBlock.title}</div>}
          <textarea
            value={calloutBlock.content}
            className="tps-callout-text"
            placeholder="Callout content..."
            onChange={e => onUpdate(block.id, { content: e.target.value })}
          />
        </div>
      </div>
    )
  }

  if (block.type === 'image') {
    const imageBlock = block as Block & { type: 'image', src: string, alt?: string, align?: string }
    return (
      <div className="tps-block tps-block-image tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        {!imageBlock.src ? (
          <div className="tps-image-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span>Add image URL</span>
            <input
              type="text"
              className="tps-input tps-image-url-input"
              placeholder="https://example.com/image.jpg"
              onBlur={e => onUpdate(block.id, { src: e.target.value })}
              onKeyUp={e => e.key === 'Enter' && onUpdate(block.id, { src: (e.target as HTMLInputElement).value })}
            />
          </div>
        ) : (
          <div className="tps-image-preview">
            <div className={`tps-image-preview-container tps-align-${imageBlock.align || 'center'}`}>
              <img src={imageBlock.src} alt={imageBlock.alt || ''} />
            </div>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'progress') {
    const progressBlock = block as Block & { type: 'progress', value: number, max?: number, label?: string, showValue?: boolean, color?: string, variant?: string, size?: string }
    const percentage = Math.round((progressBlock.value / (progressBlock.max || 100)) * 100)
    return (
      <div className="tps-block tps-block-progress tps-grid-block" data-variant={progressBlock.variant || 'bar'} data-size={progressBlock.size || 'medium'}>
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-progress-content">
          {progressBlock.label && <div className="tps-progress-label">{progressBlock.label}</div>}
          <div className="tps-progress-bar-container">
            <div
              className="tps-progress-bar-fill"
              style={{ width: `${percentage}%`, backgroundColor: progressBlock.color }}
            />
          </div>
          {progressBlock.showValue !== false && (
            <div className="tps-progress-value">
              {percentage}
              %
            </div>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'spacer') {
    const spacerBlock = block as Block & { type: 'spacer', height: number }
    return (
      <div className="tps-block tps-block-spacer tps-grid-block" style={{ height: spacerBlock.height }}>
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-spacer-indicator">
          <span>
            {spacerBlock.height}
            px
          </span>
        </div>
      </div>
    )
  }

  if (block.type === 'quote') {
    const quoteBlock = block as Block & { type: 'quote', content: string, author?: string, source?: string, style?: string }
    return (
      <div className="tps-block tps-block-quote tps-grid-block" data-style={quoteBlock.style || 'simple'}>
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-quote-content">
          <textarea
            value={quoteBlock.content}
            className="tps-quote-text"
            placeholder="Quote text..."
            onChange={e => onUpdate(block.id, { content: e.target.value })}
          />
          {(quoteBlock.author || quoteBlock.source) && (
            <div className="tps-quote-attribution">
              {quoteBlock.author && (
                <span className="tps-quote-author">
                  —
                  {quoteBlock.author}
                </span>
              )}
              {quoteBlock.source && (
                <span className="tps-quote-source">
                  ,
                  {quoteBlock.source}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'columns') {
    return (
      <div className="tps-block tps-block-columns tps-grid-block">
        <DragHandle />
        <div className="tps-block-actions">
          <DeleteButton />
        </div>
        <div className="tps-columns-placeholder">
          <span>Columns block (nested editing not supported in grid mode)</span>
        </div>
      </div>
    )
  }

  // Fallback for unknown block types
  return (
    <div className="tps-block tps-grid-block">
      <DragHandle />
      <div className="tps-block-actions">
        <DeleteButton />
      </div>
      <span>
        Unknown block type:
        {block.type}
      </span>
    </div>
  )
}

/**
 * Text block component
 */
function TextBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: TextBlock
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  return (
    <div className="tps-block tps-block-text">
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <RichTextEditor
        content={block.content}
        onChange={html => onUpdate(block.id, { content: html })}
        placeholder="Type something, or press / for commands..."
      />
    </div>
  )
}

/**
 * Heading block component
 */
function HeadingBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: HeadingBlock
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  return (
    <div className="tps-block tps-block-heading" data-level={block.level}>
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <input
        type="text"
        className="tps-block-input"
        value={block.content}
        onChange={e => onUpdate(block.id, { content: e.target.value })}
        placeholder="Heading..."
      />
    </div>
  )
}

/**
 * Divider block component
 */
function DividerBlockComponent({
  block,
  onDelete,
}: {
  block: Block
  onDelete: (blockId: string) => void
}) {
  return (
    <div className="tps-block tps-block-divider">
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <hr />
    </div>
  )
}

/**
 * Widget block component
 */
function WidgetBlockComponent({
  block,
  theme,
  onUpdate,
  onDelete,
  onConfigure,
  activeFilters = [],
  onRowClick,
  getAiAnalystConfig,
  showControls,
  onMouseEnter,
  onMouseLeave,
  onFocusIn,
  onFocusOut,
}: {
  block: WidgetBlock
  theme: 'light' | 'dark'
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
  onConfigure: (block: WidgetBlock) => void
  activeFilters?: ActiveFilter[]
  onRowClick?: (widgetBlockId: string, row: Record<string, unknown>) => void
  getAiAnalystConfig?: (datasourceId?: string) => Record<string, unknown> | undefined
  showControls?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocusIn?: () => void
  onFocusOut?: (event: React.FocusEvent) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const blockRef = useRef<HTMLDivElement>(null)

  // Get widget height style
  const heightStyle = useMemo(() => {
    if (!block.height)
      return '400px'
    return typeof block.height === 'number' ? `${block.height}px` : block.height
  }, [block.height])

  // Check if widget has data configured
  const hasWidgetData = Boolean(block.widgetId)

  // Filter data based on active filters
  const filteredData = useMemo(() => {
    if (!activeFilters || activeFilters.length === 0) {
      return widgetSampleData
    }
    return widgetSampleData.filter((row) => {
      return activeFilters.every((filter) => {
        const fieldValue = String(row[filter.field as keyof typeof row] ?? '')
        return fieldValue.toLowerCase().includes(filter.value.toLowerCase())
      })
    })
  }, [activeFilters])

  // Handle row click for filtering
  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    if (onRowClick) {
      onRowClick(block.id, row)
    }
  }, [block.id, onRowClick])

  // Handle configure button click - open modal
  const handleConfigure = () => {
    onConfigure(block)
  }

  // Handle retry on error
  const handleRetry = () => {
    setError(null)
    setIsLoading(true)
    // Simulate retry - in real implementation this would refetch data
    setTimeout(() => setIsLoading(false), 500)
  }

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsResizing(true)
    document.body.classList.add('tps-resizing')

    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const startHeight = blockRef.current?.offsetHeight || 400

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY
      const deltaY = currentY - startY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + deltaY))
      onUpdate(block.id, { height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
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
  }, [block.id, onUpdate])

  return (
    <div
      ref={blockRef}
      data-block-id={block.id}
      className={`tps-block tps-block-widget tps-block-resizable ${isResizing ? 'tps-block-resizing' : ''} ${showControls ? 'tps-block-controls-visible' : ''}`}
      style={{ minHeight: heightStyle, height: heightStyle }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action"
          onClick={handleConfigure}
          title="Configure widget"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Widget Title */}
      {block.showTitle !== false && (
        <div className="tps-widget-header">
          <input
            type="text"
            className="tps-widget-title-input"
            value={block.titleOverride || ''}
            onChange={e => onUpdate(block.id, { titleOverride: e.target.value })}
            placeholder="Widget Title"
          />
        </div>
      )}

      {/* Widget Loading State */}
      {isLoading && (
        <div className="tps-widget-loading">
          <div className="tps-spinner" />
          <span>Loading widget...</span>
        </div>
      )}

      {/* Widget Error State */}
      {!isLoading && error && (
        <div className="tps-widget-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button type="button" className="tps-btn tps-btn-sm tps-btn-secondary" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Widget Placeholder (no data configured) */}
      {!isLoading && !error && !hasWidgetData && (
        <div className="tps-widget-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span>No data configured</span>
          <button
            type="button"
            className="tps-btn tps-btn-sm tps-btn-primary"
            onClick={handleConfigure}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Configure Widget
          </button>
        </div>
      )}

      {/* Widget with Data (using sample data for now, filtered by active filters) */}
      {!isLoading && !error && hasWidgetData && (
        <div className={`tps-widget-content ${activeFilters && activeFilters.length > 0 ? 'tps-widget-linked' : ''}`}>
          <DataGrid
            widgetId={block.id}
            initialViewState={getWidgetState(block.id) ?? undefined}
            data={filteredData}
            theme={theme}
            showControls={showControls}
            enableExport={false}
            enablePagination={false}
            enableSearch={true}
            stripedRows={true}
            enableVerticalResize={false}
            initialHeight={350}
            minHeight={200}
            maxHeight={600}
            initialViewMode={shouldAutoShowAI(block) ? 'ai' : 'grid'}
            onCellClick={({ rowData }) => handleRowClick(rowData)}
            aiAnalyst={getAiAnalystConfig?.(block.metadata?.datasourceId as string)}
            onViewStateChange={state => saveWidgetState(block.id, state)}
          />
        </div>
      )}

      {/* Resize Handle */}
      <div
        className="tps-resize-handle-bottom"
        title="Drag to resize"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      />
    </div>
  )
}

/**
 * Image block component with drag-drop upload, shape, and aspect ratio controls
 */
function ImageBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: Block & {
    type: 'image'
    src: string
    alt?: string
    caption?: string
    align?: string
    width?: string | number
    height?: number
    shape?: 'rectangle' | 'circle' | 'rounded'
    aspectRatio?: 'free' | '1:1' | '16:9' | '4:3'
    objectFit?: 'cover' | 'contain' | 'fill'
  }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  const [urlInput, setUrlInput] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const blockRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onUpdate(block.id, { src: urlInput.trim() })
    }
  }

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer?.files[0]
    if (file && file.type.startsWith('image/')) {
      setIsLoading(true)
      const reader = new FileReader()
      reader.onload = () => {
        onUpdate(block.id, { src: reader.result as string })
        setIsLoading(false)
      }
      reader.onerror = () => {
        setIsLoading(false)
      }
      reader.readAsDataURL(file)
    }
  }, [block.id, onUpdate])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setIsLoading(true)
      const reader = new FileReader()
      reader.onload = () => {
        onUpdate(block.id, { src: reader.result as string })
        setIsLoading(false)
      }
      reader.onerror = () => {
        setIsLoading(false)
      }
      reader.readAsDataURL(file)
    }
  }, [block.id, onUpdate])

  // Get height style
  const heightStyle = useMemo(() => {
    if (!block.height)
      return undefined
    return typeof block.height === 'number' ? `${block.height}px` : block.height
  }, [block.height])

  // Get image container classes based on shape and aspect ratio
  const getImageContainerClasses = useMemo(() => {
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

    if (block.objectFit) {
      classes.push(`tps-image-fit-${block.objectFit}`)
    }

    return classes.join(' ')
  }, [block.align, block.shape, block.aspectRatio, block.objectFit])

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsResizing(true)
    document.body.classList.add('tps-resizing')

    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const startHeight = blockRef.current?.offsetHeight || 300
    const startWidth = blockRef.current?.offsetWidth || 400
    const aspectRatio = startWidth / startHeight

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY
      const deltaY = currentY - startY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + deltaY))

      // For images with shift key, maintain aspect ratio
      if (moveEvent.shiftKey) {
        const newWidth = newHeight * aspectRatio
        onUpdate(block.id, {
          height: newHeight,
          width: Math.max(MIN_WIDTH, newWidth),
        })
      }
      else {
        onUpdate(block.id, { height: newHeight })
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
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
  }, [block.id, onUpdate])

  // Clear image
  const handleClearImage = useCallback(() => {
    onUpdate(block.id, { src: '' })
    setUrlInput('')
  }, [block.id, onUpdate])

  return (
    <div
      ref={blockRef}
      data-block-id={block.id}
      className={`tps-block tps-block-image tps-block-resizable ${isResizing ? 'tps-block-resizing' : ''}`}
      style={{ height: heightStyle }}
    >
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Image dropzone when no src */}
      {!block.src ? (
        isLoading ? (
          <div className="tps-image-loading">
            <svg className="tps-image-loading-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="tps-image-loading-text">Loading image...</span>
          </div>
        ) : (
          <div
            className={`tps-image-dropzone ${isDragging ? 'tps-dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="tps-image-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="tps-image-dropzone-text">
              <strong>Drop an image</strong>
              {' '}
              or click to browse
            </div>
            <div className="tps-image-dropzone-hint">
              Supports JPG, PNG, GIF, WebP
            </div>
            <div className="tps-image-dropzone-or">or</div>
            <input
              type="text"
              className="tps-input tps-image-url-input"
              placeholder="Paste image URL..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onBlur={handleUrlSubmit}
              onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )
      ) : (
        <div className="tps-image-preview">
          <div className={getImageContainerClasses}>
            <img
              src={block.src}
              alt={block.alt || ''}
              className={block.width === 'full' ? 'tps-image-full' : ''}
              style={block.width && block.width !== 'full' ? { width: typeof block.width === 'number' ? `${block.width}px` : block.width } : undefined}
            />
          </div>
          <input
            type="text"
            className="tps-image-caption"
            value={block.caption || ''}
            onChange={e => onUpdate(block.id, { caption: e.target.value })}
            placeholder="Add a caption..."
          />

          {/* Image Toolbar */}
          <div className="tps-image-toolbar">
            {/* Alignment buttons */}
            <button
              type="button"
              className={`tps-image-align-btn ${block.align === 'left' ? 'tps-active' : ''}`}
              title="Align left"
              onClick={() => onUpdate(block.id, { align: 'left' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 10H3M21 6H3M21 14H3M17 18H3" />
              </svg>
            </button>
            <button
              type="button"
              className={`tps-image-align-btn ${block.align === 'center' || !block.align ? 'tps-active' : ''}`}
              title="Align center"
              onClick={() => onUpdate(block.id, { align: 'center' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 10H6M21 6H3M21 14H3M18 18H6" />
              </svg>
            </button>
            <button
              type="button"
              className={`tps-image-align-btn ${block.align === 'right' ? 'tps-active' : ''}`}
              title="Align right"
              onClick={() => onUpdate(block.id, { align: 'right' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10H7M21 6H3M21 14H3M21 18H7" />
              </svg>
            </button>

            <div className="tps-image-toolbar-divider" />

            {/* Shape buttons */}
            <button
              type="button"
              className={`tps-image-shape-btn ${!block.shape || block.shape === 'rectangle' ? 'tps-active' : ''}`}
              title="Rectangle"
              onClick={() => onUpdate(block.id, { shape: 'rectangle' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              className={`tps-image-shape-btn ${block.shape === 'rounded' ? 'tps-active' : ''}`}
              title="Rounded"
              onClick={() => onUpdate(block.id, { shape: 'rounded' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="4" />
              </svg>
            </button>
            <button
              type="button"
              className={`tps-image-shape-btn ${block.shape === 'circle' ? 'tps-active' : ''}`}
              title="Circle"
              onClick={() => onUpdate(block.id, { shape: 'circle' })}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
              </svg>
            </button>

            <div className="tps-image-toolbar-divider" />

            {/* Aspect ratio buttons */}
            <button
              type="button"
              className={`tps-image-aspect-btn ${!block.aspectRatio || block.aspectRatio === 'free' ? 'tps-active' : ''}`}
              title="Free aspect ratio"
              onClick={() => onUpdate(block.id, { aspectRatio: 'free' })}
            >
              Free
            </button>
            <button
              type="button"
              className={`tps-image-aspect-btn ${block.aspectRatio === '1:1' ? 'tps-active' : ''}`}
              title="Square (1:1)"
              onClick={() => onUpdate(block.id, { aspectRatio: '1:1' })}
            >
              1:1
            </button>
            <button
              type="button"
              className={`tps-image-aspect-btn ${block.aspectRatio === '16:9' ? 'tps-active' : ''}`}
              title="Widescreen (16:9)"
              onClick={() => onUpdate(block.id, { aspectRatio: '16:9' })}
            >
              16:9
            </button>
            <button
              type="button"
              className={`tps-image-aspect-btn ${block.aspectRatio === '4:3' ? 'tps-active' : ''}`}
              title="Standard (4:3)"
              onClick={() => onUpdate(block.id, { aspectRatio: '4:3' })}
            >
              4:3
            </button>

            <div className="tps-image-toolbar-divider" />

            {/* Clear button */}
            <button
              type="button"
              className="tps-image-clear-btn"
              title="Remove image"
              onClick={handleClearImage}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Resize Handle */}
      <div
        className="tps-resize-handle"
        title="Drag to resize (hold Shift for aspect ratio)"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      />
    </div>
  )
}

/**
 * Callout block component
 */
function CalloutBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: Block & { type: 'callout', content: string, style: string, title?: string }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  const getCalloutIcon = (style: string) => {
    switch (style) {
      case 'warning':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        )
      case 'success':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )
      case 'error':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        )
      case 'note':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )
      case 'tip':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
          </svg>
        )
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        )
    }
  }

  return (
    <div className="tps-block tps-block-callout" data-style={block.style || 'info'}>
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <div className="tps-callout-content">
        <div className="tps-callout-icon">
          {getCalloutIcon(block.style)}
        </div>
        <div className="tps-callout-body">
          <input
            type="text"
            className="tps-callout-title-input"
            value={block.title || ''}
            onChange={e => onUpdate(block.id, { title: e.target.value })}
            placeholder="Title (optional)"
          />
          <textarea
            className="tps-callout-text-input"
            value={block.content}
            onChange={e => onUpdate(block.id, { content: e.target.value })}
            placeholder="Write your callout content..."
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = `${target.scrollHeight}px`
            }}
          />
        </div>
      </div>
      <div className="tps-callout-style-selector">
        {(['info', 'warning', 'success', 'error', 'note', 'tip'] as const).map(style => (
          <button
            key={style}
            type="button"
            className={`tps-callout-style-btn ${block.style === style ? 'tps-active' : ''}`}
            data-style={style}
            title={style.charAt(0).toUpperCase() + style.slice(1)}
            onClick={() => onUpdate(block.id, { style })}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Columns block component with nested block support
 */
function ColumnsBlockComponent({
  block,
  theme,
  onUpdate,
  onDelete,
  onConfigureWidget,
  isNested,
  getAiAnalystConfig,
}: {
  block: Block & { type: 'columns', columns: Array<{ id: string, width: number, blocks: Block[] }>, gap?: number, height?: number }
  theme: 'light' | 'dark'
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
  onConfigureWidget: (block: WidgetBlock) => void
  isNested?: boolean
  getAiAnalystConfig?: (datasourceId?: string) => Record<string, unknown> | undefined
}) {
  const [isResizing, setIsResizing] = useState(false)
  const [activeColumnMenu, setActiveColumnMenu] = useState<number | null>(null)
  const blockRef = useRef<HTMLDivElement>(null)

  const getGapClass = (gap?: number) => {
    if (!gap)
      return 'medium'
    if (gap <= 8)
      return 'small'
    if (gap <= 16)
      return 'medium'
    return 'large'
  }

  // Get height style
  const heightStyle = useMemo(() => {
    if (!block.height)
      return undefined
    return typeof block.height === 'number' ? `${block.height}px` : block.height
  }, [block.height])

  const handleColumnCountChange = (count: number) => {
    const newColumns = Array.from({ length: count }, (_, i) =>
      i < block.columns.length
        ? block.columns[i]
        : { id: generateId(), width: 1, blocks: [] })
    onUpdate(block.id, { columns: newColumns })
  }

  // Handle adding a block to a specific column
  const handleAddBlockToColumn = (columnIndex: number, blockType: Block['type']) => {
    const newBlock = createBlock(blockType)
    const newColumns = block.columns.map((col, idx) => {
      if (idx === columnIndex) {
        return { ...col, blocks: [...col.blocks, newBlock] }
      }
      return col
    })
    onUpdate(block.id, { columns: newColumns })
    setActiveColumnMenu(null)
  }

  // Handle updating a nested block
  const handleNestedBlockUpdate = (columnIndex: number, blockId: string, updates: Partial<Block>) => {
    const newColumns = block.columns.map((col, idx) => {
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
    onUpdate(block.id, { columns: newColumns })
  }

  // Handle deleting a nested block
  const handleNestedBlockDelete = (columnIndex: number, blockId: string) => {
    const newColumns = block.columns.map((col, idx) => {
      if (idx === columnIndex) {
        return {
          ...col,
          blocks: col.blocks.filter(b => b.id !== blockId),
        }
      }
      return col
    })
    onUpdate(block.id, { columns: newColumns })
  }

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsResizing(true)
    document.body.classList.add('tps-resizing')

    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const startHeight = blockRef.current?.offsetHeight || 200

    const handleMouseMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY
      const deltaY = currentY - startY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight + deltaY))
      onUpdate(block.id, { height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
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
  }, [block.id, onUpdate])

  // Block type options for add block menu (excluding columns to prevent deep nesting)
  const blockTypeOptions: Array<{ type: Block['type'], label: string, icon: React.ReactNode }> = [
    {
      type: 'text',
      label: 'Text',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
      ),
    },
    {
      type: 'heading',
      label: 'Heading',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 4v16M18 4v16M6 12h12" />
        </svg>
      ),
    },
    {
      type: 'widget',
      label: 'Widget',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      ),
    },
    {
      type: 'image',
      label: 'Image',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      ),
    },
    {
      type: 'callout',
      label: 'Callout',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      ),
    },
    {
      type: 'divider',
      label: 'Divider',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 12h18" />
        </svg>
      ),
    },
  ]

  return (
    <div
      ref={blockRef}
      data-block-id={block.id}
      className={`tps-block tps-block-columns tps-block-resizable ${isResizing ? 'tps-block-resizing' : ''} ${isNested ? 'tps-block-nested' : ''}`}
      style={{ height: heightStyle }}
    >
      <div className="tps-block-actions">
        <button
          type="button"
          className="tps-block-action tps-block-delete"
          onClick={() => onDelete(block.id)}
          title="Delete block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
      <div className="tps-columns-container" data-gap={getGapClass(block.gap)}>
        {block.columns.map((column, colIndex) => (
          <div
            key={column.id}
            className="tps-column tps-column-dropzone"
            style={{ flex: column.width }}
          >
            {/* Render nested blocks */}
            {column.blocks.length > 0 ? (
              <div className="tps-column-blocks">
                {column.blocks.map(childBlock => (
                  <div key={childBlock.id} className="tps-nested-block-wrapper">
                    <BlockRenderer
                      block={childBlock}
                      theme={theme}
                      onUpdate={(blockId, updates) => handleNestedBlockUpdate(colIndex, blockId, updates)}
                      onDelete={blockId => handleNestedBlockDelete(colIndex, blockId)}
                      onConfigureWidget={onConfigureWidget}
                      isNested
                      getAiAnalystConfig={getAiAnalystConfig}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add block button/menu for this column */}
            {activeColumnMenu === colIndex ? (
              <div className="tps-column-add-block-menu">
                {blockTypeOptions.map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    className="tps-column-block-option"
                    onClick={() => handleAddBlockToColumn(colIndex, opt.type)}
                    title={opt.label}
                  >
                    {opt.icon}
                  </button>
                ))}
                <button
                  type="button"
                  className="tps-column-block-option tps-column-block-cancel"
                  onClick={() => setActiveColumnMenu(null)}
                  title="Cancel"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="tps-column-add-block"
                onClick={() => setActiveColumnMenu(colIndex)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Add block</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="tps-columns-controls">
        <span className="tps-columns-label">Columns:</span>
        {([2, 3, 4] as const).map(num => (
          <button
            key={num}
            type="button"
            className={`tps-columns-btn ${block.columns.length === num ? 'tps-active' : ''}`}
            onClick={() => handleColumnCountChange(num)}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Resize Handle */}
      <div
        className="tps-resize-handle-bottom"
        title="Drag to resize"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      />
    </div>
  )
}

/**
 * Stat block component - Big number display for infographics
 */
interface StatBlockProps {
  block: Block & { type: 'stat' }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}

function StatBlockComponent({ block, onUpdate, onDelete }: StatBlockProps) {
  const statBlock = block as Block & {
    type: 'stat'
    value: string | number
    label: string
    prefix?: string
    suffix?: string
    size?: 'small' | 'medium' | 'large' | 'xlarge'
    color?: string
    trend?: { direction: 'up' | 'down' | 'flat', value?: string, positive?: boolean }
  }

  return (
    <div className="tps-block tps-block-stat" data-size={statBlock.size || 'medium'}>
      <div className="tps-block-actions">
        <button type="button" className="tps-block-action tps-block-delete" onClick={() => onDelete(block.id)} title="Delete block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      <div className="tps-stat-content">
        <div className="tps-stat-value-wrapper">
          <input
            type="text"
            className="tps-stat-prefix-input"
            value={statBlock.prefix || ''}
            placeholder="$"
            onChange={e => onUpdate(block.id, { prefix: e.target.value })}
          />
          <input
            type="text"
            className="tps-stat-value-input"
            value={String(statBlock.value)}
            style={{ color: statBlock.color || undefined }}
            onChange={e => onUpdate(block.id, { value: e.target.value })}
          />
          <input
            type="text"
            className="tps-stat-suffix-input"
            value={statBlock.suffix || ''}
            placeholder="%"
            onChange={e => onUpdate(block.id, { suffix: e.target.value })}
          />
        </div>
        <input
          type="text"
          className="tps-stat-label-input"
          value={statBlock.label}
          placeholder="Label"
          onChange={e => onUpdate(block.id, { label: e.target.value })}
        />
        {statBlock.trend && (
          <div
            className={`tps-stat-trend ${
              statBlock.trend.direction === 'up' ? 'tps-stat-trend-up'
                : statBlock.trend.direction === 'down' ? 'tps-stat-trend-down' : 'tps-stat-trend-flat'
            } ${statBlock.trend.positive === false ? 'tps-stat-trend-negative' : ''}`}
          >
            {statBlock.trend.direction === 'up' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            )}
            {statBlock.trend.direction === 'down' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            )}
            {statBlock.trend.direction === 'flat' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
              </svg>
            )}
            <input
              type="text"
              className="tps-stat-trend-input"
              value={statBlock.trend.value || ''}
              placeholder="12%"
              onChange={e => onUpdate(block.id, { trend: { ...statBlock.trend!, value: e.target.value } })}
            />
          </div>
        )}
      </div>
      <div className="tps-stat-controls">
        <span className="tps-stat-controls-label">Size:</span>
        <div className="tps-stat-size-controls">
          {(['small', 'medium', 'large', 'xlarge'] as const).map(size => (
            <button
              key={size}
              type="button"
              className={`tps-stat-size-btn ${(statBlock.size || 'medium') === size ? 'tps-active' : ''}`}
              onClick={() => onUpdate(block.id, { size })}
            >
              {size.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
        <span className="tps-stat-controls-label" style={{ marginLeft: '0.5rem' }}>Trend:</span>
        <div className="tps-stat-trend-controls">
          <button
            type="button"
            className={`tps-stat-trend-btn ${!statBlock.trend ? 'tps-active' : ''}`}
            onClick={() => onUpdate(block.id, { trend: undefined })}
          >
            None
          </button>
          <button
            type="button"
            className={`tps-stat-trend-btn ${statBlock.trend?.direction === 'up' ? 'tps-active' : ''}`}
            onClick={() => onUpdate(block.id, { trend: { direction: 'up', value: statBlock.trend?.value || '', positive: true } })}
          >
            Up
          </button>
          <button
            type="button"
            className={`tps-stat-trend-btn ${statBlock.trend?.direction === 'down' ? 'tps-active' : ''}`}
            onClick={() => onUpdate(block.id, { trend: { direction: 'down', value: statBlock.trend?.value || '', positive: false } })}
          >
            Down
          </button>
          <button
            type="button"
            className={`tps-stat-trend-btn ${statBlock.trend?.direction === 'flat' ? 'tps-active' : ''}`}
            onClick={() => onUpdate(block.id, { trend: { direction: 'flat', value: statBlock.trend?.value || '' } })}
          >
            Flat
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Progress block component - Progress indicators
 */
interface ProgressBlockProps {
  block: Block & { type: 'progress' }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}

function ProgressBlockComponent({ block, onUpdate, onDelete }: ProgressBlockProps) {
  const progressBlock = block as Block & {
    type: 'progress'
    value: number
    max?: number
    label?: string
    showValue?: boolean
    color?: string
    variant?: 'bar' | 'circle' | 'semicircle'
    size?: 'small' | 'medium' | 'large'
  }

  const variant = progressBlock.variant || 'bar'
  const size = progressBlock.size || 'medium'
  const max = progressBlock.max || 100
  const percentage = Math.min(100, Math.max(0, (progressBlock.value / max) * 100))

  const circleSize = size === 'small' ? 80 : size === 'large' ? 160 : 120
  const circleCircumference = 339.292

  return (
    <div className="tps-block tps-block-progress" data-variant={variant} data-size={size}>
      <div className="tps-block-actions">
        <button type="button" className="tps-block-action tps-block-delete" onClick={() => onDelete(block.id)} title="Delete block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      <div className="tps-progress-content">
        <input
          type="text"
          className="tps-progress-label-input"
          value={progressBlock.label || ''}
          placeholder="Progress Label"
          onChange={e => onUpdate(block.id, { label: e.target.value })}
        />

        {/* Bar variant */}
        {variant === 'bar' && (
          <div className="tps-progress-bar-container">
            <div className="tps-progress-bar">
              <div
                className="tps-progress-fill"
                style={{
                  width: `${percentage}%`,
                  background: progressBlock.color || undefined,
                }}
              />
            </div>
            {progressBlock.showValue !== false && (
              <>
                <input
                  type="number"
                  className="tps-progress-value-input"
                  value={progressBlock.value}
                  min={0}
                  max={max}
                  onChange={e => onUpdate(block.id, { value: Number(e.target.value) })}
                />
                <span className="tps-progress-value">%</span>
              </>
            )}
          </div>
        )}

        {/* Circle variant */}
        {variant === 'circle' && (
          <div className="tps-progress-circle-container">
            <div className="tps-progress-circle">
              <svg width={circleSize} height={circleSize} viewBox="0 0 120 120">
                <circle
                  className="tps-progress-circle-bg"
                  cx="60"
                  cy="60"
                  r="54"
                  strokeWidth="12"
                />
                <circle
                  className="tps-progress-circle-fill"
                  cx="60"
                  cy="60"
                  r="54"
                  strokeWidth="12"
                  stroke={progressBlock.color || undefined}
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={circleCircumference * (1 - progressBlock.value / max)}
                />
              </svg>
              <span className="tps-progress-circle-value">
                {progressBlock.value}
                %
              </span>
            </div>
          </div>
        )}

        {/* Semicircle variant */}
        {variant === 'semicircle' && (
          <div className="tps-progress-semicircle-container">
            <div className="tps-progress-semicircle">
              <svg
                width={size === 'small' ? 100 : size === 'large' ? 200 : 150}
                height={size === 'small' ? 50 : size === 'large' ? 100 : 75}
                viewBox="0 0 150 75"
              >
                <path
                  className="tps-progress-circle-bg"
                  d="M 15 75 A 60 60 0 0 1 135 75"
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                <path
                  className="tps-progress-circle-fill"
                  d="M 15 75 A 60 60 0 0 1 135 75"
                  fill="none"
                  strokeWidth="12"
                  strokeLinecap="round"
                  stroke={progressBlock.color || undefined}
                  strokeDasharray="188.5"
                  strokeDashoffset={188.5 * (1 - progressBlock.value / max)}
                />
              </svg>
              <span className="tps-progress-semicircle-value">
                {progressBlock.value}
                %
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="tps-progress-controls">
        <span className="tps-progress-controls-label">Style:</span>
        <div className="tps-progress-variant-controls">
          {(['bar', 'circle', 'semicircle'] as const).map(v => (
            <button
              key={v}
              type="button"
              className={`tps-progress-variant-btn ${variant === v ? 'tps-active' : ''}`}
              onClick={() => onUpdate(block.id, { variant: v })}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span className="tps-progress-controls-label" style={{ marginLeft: '0.5rem' }}>Size:</span>
        <div className="tps-progress-size-controls">
          {(['small', 'medium', 'large'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`tps-progress-size-btn ${size === s ? 'tps-active' : ''}`}
              onClick={() => onUpdate(block.id, { size: s })}
            >
              {s.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Spacer block component - Vertical spacing
 */
interface SpacerBlockProps {
  block: Block & { type: 'spacer' }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}

function SpacerBlockComponent({ block, onUpdate, onDelete }: SpacerBlockProps) {
  const spacerBlock = block as Block & { type: 'spacer', height: number }

  return (
    <div className="tps-block tps-block-spacer" style={{ height: `${spacerBlock.height}px` }}>
      <div className="tps-block-actions">
        <button type="button" className="tps-block-action tps-block-delete" onClick={() => onDelete(block.id)} title="Delete block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      <div className="tps-spacer-content">
        <span className="tps-spacer-label">
          <input
            type="number"
            className="tps-spacer-height-input"
            value={spacerBlock.height}
            min={8}
            max={500}
            onChange={e => onUpdate(block.id, { height: Number(e.target.value) })}
          />
          px
        </span>
      </div>
    </div>
  )
}

/**
 * Quote block component - Testimonials and pull quotes
 */
interface QuoteBlockProps {
  block: Block & { type: 'quote' }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}

function QuoteBlockComponent({ block, onUpdate, onDelete }: QuoteBlockProps) {
  const quoteBlock = block as Block & {
    type: 'quote'
    content: string
    author?: string
    source?: string
    style?: 'simple' | 'bordered' | 'highlighted'
  }

  return (
    <div className="tps-block tps-block-quote" data-style={quoteBlock.style || 'simple'}>
      <div className="tps-block-actions">
        <button type="button" className="tps-block-action tps-block-delete" onClick={() => onDelete(block.id)} title="Delete block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      <div className="tps-quote-content">
        <svg className="tps-quote-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
        </svg>
        <textarea
          className="tps-quote-text-input"
          value={quoteBlock.content}
          placeholder="Enter your quote here..."
          onChange={e => onUpdate(block.id, { content: e.target.value })}
        />
        <div className="tps-quote-attribution">
          <input
            type="text"
            className="tps-quote-author-input"
            value={quoteBlock.author || ''}
            placeholder="Author name"
            onChange={e => onUpdate(block.id, { author: e.target.value })}
          />
          <input
            type="text"
            className="tps-quote-source-input"
            value={quoteBlock.source || ''}
            placeholder="Title, Company"
            onChange={e => onUpdate(block.id, { source: e.target.value })}
          />
        </div>
      </div>
      <div className="tps-quote-style-selector">
        <span className="tps-quote-style-label">Style:</span>
        {(['simple', 'bordered', 'highlighted'] as const).map(style => (
          <button
            key={style}
            type="button"
            className={`tps-quote-style-btn ${(quoteBlock.style || 'simple') === style ? 'tps-active' : ''}`}
            onClick={() => onUpdate(block.id, { style })}
          >
            {style.charAt(0).toUpperCase() + style.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Grid block component - Masonry-style flexible layout
 */
interface GridBlockProps {
  block: Block & { type: 'grid' }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}

type GridBlockType = Block & {
  type: 'grid'
  columns: number
  gap?: number
  rowHeight?: 'auto' | number
  items: Array<{ block: Block, colSpan?: number, rowSpan?: number }>
  dense?: boolean
}

function GridBlockComponent({ block, onUpdate, onDelete }: GridBlockProps) {
  const gridBlock = block as GridBlockType

  const handleAddItem = () => {
    const newBlock: Block = { id: generateId(), type: 'stat', value: '0', label: 'New Stat', size: 'medium' } as Block
    const newItem = { block: newBlock, colSpan: 1, rowSpan: 1 }
    onUpdate(block.id, { items: [...gridBlock.items, newItem] })
  }

  const handleItemSpan = (itemIndex: number, spanType: 'colSpan' | 'rowSpan', delta: number) => {
    const newItems = gridBlock.items.map((item, idx) => {
      if (idx === itemIndex) {
        const currentSpan = item[spanType] || 1
        const newSpan = Math.max(1, Math.min(gridBlock.columns, currentSpan + delta))
        return { ...item, [spanType]: newSpan }
      }
      return item
    })
    onUpdate(block.id, { items: newItems })
  }

  const handleItemDelete = (itemIndex: number) => {
    const newItems = gridBlock.items.filter((_, idx) => idx !== itemIndex)
    onUpdate(block.id, { items: newItems })
  }

  const handleItemBlockUpdate = (itemIndex: number, updates: Partial<Block>) => {
    const newItems = gridBlock.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, block: { ...item.block, ...updates } as Block }
      }
      return item
    })
    onUpdate(block.id, { items: newItems })
  }

  return (
    <div className="tps-block tps-block-grid-container" data-block-id={block.id}>
      <div className="tps-block-actions">
        <button type="button" className="tps-block-action tps-block-delete" onClick={() => onDelete(block.id)} title="Delete block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      {/* Grid Configuration Bar */}
      <div className="tps-grid-config">
        <label className="tps-grid-config-label">Columns:</label>
        <input
          type="number"
          className="tps-grid-config-input"
          value={gridBlock.columns}
          min={1}
          max={6}
          onChange={e => onUpdate(block.id, { columns: Math.min(6, Math.max(1, Number.parseInt(e.target.value) || 3)) })}
        />
        <label className="tps-grid-config-label">Gap:</label>
        <input
          type="number"
          className="tps-grid-config-input"
          value={gridBlock.gap || 16}
          min={0}
          max={48}
          onChange={e => onUpdate(block.id, { gap: Number.parseInt(e.target.value) || 16 })}
        />
        <label className="tps-grid-config-checkbox">
          <input
            type="checkbox"
            checked={gridBlock.dense || false}
            onChange={e => onUpdate(block.id, { dense: e.target.checked })}
          />
          Dense packing
        </label>
      </div>
      {/* Grid Layout */}
      <div
        className="tps-block-grid"
        data-columns={gridBlock.columns}
        data-dense={gridBlock.dense || false}
        style={{ gap: `${gridBlock.gap || 16}px` }}
      >
        {/* Grid Items */}
        {gridBlock.items.map((item, itemIndex) => (
          <div
            key={item.block.id}
            className="tps-grid-item"
            data-col-span={item.colSpan || 1}
            data-row-span={item.rowSpan || 1}
          >
            <div className="tps-grid-item-controls">
              <button
                type="button"
                className="tps-grid-item-btn"
                title="Decrease column span"
                onClick={() => handleItemSpan(itemIndex, 'colSpan', -1)}
              >
                −
              </button>
              <button
                type="button"
                className="tps-grid-item-btn"
                title="Increase column span"
                onClick={() => handleItemSpan(itemIndex, 'colSpan', 1)}
              >
                +
              </button>
              <button
                type="button"
                className="tps-grid-item-btn"
                title="Delete item"
                onClick={() => handleItemDelete(itemIndex)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="tps-grid-item-content">
              {/* Nested block content (simplified inline rendering) */}
              {item.block.type === 'text' && (
                <textarea
                  className="tps-text-input"
                  value={(item.block as { content: string }).content}
                  placeholder="Type your text here..."
                  onChange={e => handleItemBlockUpdate(itemIndex, { content: e.target.value })}
                />
              )}
              {item.block.type === 'heading' && (
                <input
                  type="text"
                  className={`tps-heading-input tps-heading-${(item.block as { level: number }).level}`}
                  value={(item.block as { content: string }).content}
                  placeholder="Heading..."
                  onChange={e => handleItemBlockUpdate(itemIndex, { content: e.target.value })}
                />
              )}
              {item.block.type === 'stat' && (
                <div className="tps-stat-content" data-size={(item.block as { size?: string }).size || 'medium'}>
                  <div className="tps-stat-value" style={(item.block as { color?: string }).color ? { color: (item.block as { color?: string }).color } : {}}>
                    {(item.block as { prefix?: string }).prefix && <span className="tps-stat-prefix">{(item.block as { prefix?: string }).prefix}</span>}
                    <input
                      type="text"
                      className="tps-stat-value-input"
                      value={String((item.block as { value: string | number }).value)}
                      placeholder="0"
                      onChange={e => handleItemBlockUpdate(itemIndex, { value: e.target.value })}
                    />
                    {(item.block as { suffix?: string }).suffix && <span className="tps-stat-suffix">{(item.block as { suffix?: string }).suffix}</span>}
                  </div>
                  <input
                    type="text"
                    className="tps-stat-label-input"
                    value={(item.block as { label: string }).label}
                    placeholder="Label"
                    onChange={e => handleItemBlockUpdate(itemIndex, { label: e.target.value })}
                  />
                </div>
              )}
              {item.block.type === 'progress' && (
                <div className="tps-progress-content" data-size={(item.block as { size?: string }).size || 'medium'}>
                  {(item.block as { variant?: string }).variant !== 'circle' && (item.block as { variant?: string }).variant !== 'semicircle' && (
                    <div className="tps-progress-bar-container">
                      <div
                        className="tps-progress-bar"
                        style={{
                          width: `${((item.block as { value: number }).value / ((item.block as { max?: number }).max || 100)) * 100}%`,
                          background: (item.block as { color?: string }).color || '#6366f1',
                        }}
                      />
                    </div>
                  )}
                  <input
                    type="range"
                    min={0}
                    max={(item.block as { max?: number }).max || 100}
                    value={(item.block as { value: number }).value}
                    onChange={e => handleItemBlockUpdate(itemIndex, { value: Number.parseInt(e.target.value) })}
                  />
                </div>
              )}
              {item.block.type === 'image' && (
                (item.block as { src: string }).src ? (
                  <div className="tps-image-preview">
                    <img src={(item.block as { src: string }).src} alt={(item.block as { alt?: string }).alt || ''} style={{ maxWidth: '100%', height: 'auto' }} />
                  </div>
                ) : (
                  <div className="tps-image-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <span>Image</span>
                  </div>
                )
              )}
              {!['text', 'heading', 'stat', 'progress', 'image'].includes(item.block.type) && (
                <div className="tps-grid-item-type-label">
                  {item.block.type}
                </div>
              )}
            </div>
          </div>
        ))}
        {/* Add Item Button */}
        <div className="tps-grid-add-item" onClick={handleAddItem}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Item
        </div>
      </div>
    </div>
  )
}

/**
 * Widget configuration modal
 */
interface WidgetConfigModalProps {
  title: string
  setTitle: (title: string) => void
  height: number
  setHeight: (height: number) => void
  visualizationType: 'table' | 'pivot' | 'chart'
  setVisualizationType: (type: 'table' | 'pivot' | 'chart') => void
  showTitle: boolean
  setShowTitle: (value: boolean) => void
  // Datasource selection
  datasourceId: string
  onDatasourceChange: (id: string) => void
  datasources: DatasourceConfig[]
  onClose: () => void
  onSave: () => void
}

function WidgetConfigModal({
  title,
  setTitle,
  height,
  setHeight,
  visualizationType,
  setVisualizationType,
  showTitle,
  setShowTitle,
  datasourceId,
  onDatasourceChange,
  datasources,
  onClose,
  onSave,
}: WidgetConfigModalProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave()
  }

  return (
    <div className="tps-modal-overlay" onClick={onClose}>
      <div className="tps-modal" onClick={e => e.stopPropagation()}>
        <div className="tps-modal-header">
          <h3 className="tps-modal-title">Configure Widget</h3>
          <button type="button" className="tps-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="tps-modal-body">
            <div className="tps-form-group">
              <label className="tps-label" htmlFor="widget-title">Widget Title</label>
              <input
                id="widget-title"
                type="text"
                className="tps-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Sales Overview"
              />
            </div>

            <div className="tps-form-group">
              <label className="tps-checkbox-label">
                <input
                  type="checkbox"
                  className="tps-checkbox"
                  checked={showTitle}
                  onChange={e => setShowTitle(e.target.checked)}
                />
                <span>Show widget title</span>
              </label>
            </div>

            <div className="tps-form-group">
              <label className="tps-label" htmlFor="widget-datasource">Data Source</label>
              <select
                id="widget-datasource"
                className="tps-select"
                value={datasourceId}
                onChange={e => onDatasourceChange(e.target.value)}
              >
                <option value="sample">Sample Data (Demo)</option>
                {datasources.map(ds => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                    {' '}
                    (
                    {ds.type}
                    )
                  </option>
                ))}
              </select>
              {datasourceId === 'sample' && (
                <p className="tps-form-hint">
                  Sample data shows a demo dataset. Select a connected data source to use real data.
                </p>
              )}
              {datasourceId !== 'sample' && datasources.length === 0 && (
                <p className="tps-form-hint tps-form-hint-warning">
                  No data sources connected. Add a data source from the sidebar first.
                </p>
              )}
            </div>

            <div className="tps-form-group">
              <label className="tps-label" htmlFor="widget-viz-type">Visualization Type</label>
              <select
                id="widget-viz-type"
                className="tps-select"
                value={visualizationType}
                onChange={e => setVisualizationType(e.target.value as 'table' | 'pivot' | 'chart')}
              >
                <option value="table">Table (DataGrid)</option>
                <option value="pivot">Pivot Table</option>
                <option value="chart">Chart</option>
              </select>
              {visualizationType !== 'table' && (
                <p className="tps-form-hint tps-form-hint-warning">
                  Only Table visualization is currently available. Other types coming soon.
                </p>
              )}
            </div>

            <div className="tps-form-group">
              <label className="tps-label" htmlFor="widget-height">Height (pixels)</label>
              <input
                id="widget-height"
                type="number"
                className="tps-input"
                value={height}
                onChange={e => setHeight(Number(e.target.value))}
                min={200}
                max={1000}
                step={50}
              />
            </div>
          </div>

          <div className="tps-modal-footer">
            <button type="button" className="tps-btn tps-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="tps-btn tps-btn-primary">
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Data source connection modal
 */
interface DatasourceModalProps {
  datasource: DatasourceConfig | null
  onClose: () => void
  onSave: (ds: DatasourceConfig) => void
  apiEndpoint?: string | null
  userKey?: string | null
  userId?: string | null
}

function DatasourceModal({ datasource, onClose, onSave, apiEndpoint, userKey, userId }: DatasourceModalProps) {
  const [name, setName] = useState(datasource?.name || '')
  const [type, setType] = useState<'postgres' | 'snowflake'>(
    (datasource?.type as 'postgres' | 'snowflake') || 'postgres',
  )
  // Postgres fields
  const [host, setHost] = useState(datasource?.host || '')
  const [port, setPort] = useState(datasource?.port || 5432)
  const [database, setDatabase] = useState(datasource?.database || '')
  const [username, setUsername] = useState(datasource?.username || '')
  const [password, setPassword] = useState(datasource?.password || '')
  // Snowflake fields
  const [account, setAccount] = useState(datasource?.account || '')
  const [warehouse, setWarehouse] = useState(datasource?.warehouse || '')
  const [schema, setSchema] = useState(datasource?.schema || '')
  const [role, setRole] = useState(datasource?.role || '')
  // Snowflake auth method
  const [authMethod, setAuthMethod] = useState<'password' | 'keypair' | 'externalbrowser'>(
    (datasource?.authMethod as 'password' | 'keypair' | 'externalbrowser') || 'password',
  )
  const [privateKey, setPrivateKey] = useState(datasource?.privateKey || '')
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState(datasource?.privateKeyPassphrase || '')
  // Test connection state
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestMessage('Testing connection...')

    // If no API endpoint, simulate for local-only mode
    if (!apiEndpoint || !userId) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      setTestStatus('success')
      setTestMessage('Connection test simulated (no API endpoint configured)')
      return
    }

    try {
      // First create a temporary datasource for testing
      const tempConfig = {
        name: name || 'Test Connection',
        type,
        authMethod: type === 'snowflake' ? authMethod : 'password',
        connectionConfig: type === 'postgres'
          ? { host, port, database, schema: schema || 'public' }
          : { account, warehouse, database, schema, role },
        credentials: type === 'postgres' || authMethod === 'password'
          ? { username, password }
          : authMethod === 'keypair'
            ? { username, privateKey, privateKeyPassphrase }
            : { username },
      }

      // Create datasource temporarily to test
      const createResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-datasource',
          userId,
          userKey: userKey || userId, // fallback to userId if no userKey
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
      const testResponse = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-datasource',
          datasourceId: tempDatasourceId,
          userId,
          userKey: userKey || userId,
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

      // Delete the temporary datasource
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-datasource',
          datasourceId: tempDatasourceId,
          userId,
        }),
      })

      if (testData.status?.connected) {
        setTestStatus('success')
        setTestMessage(`Connection successful! ${testData.status.version ? `(${testData.status.version})` : ''}`)
      }
      else {
        setTestStatus('error')
        setTestMessage(testData.status?.error || 'Connection failed')
      }
    }
    catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const now = new Date()
    const dsConfig: DatasourceConfig = {
      id: datasource?.id || generateId(),
      name: name.trim(),
      type,
      host: type === 'postgres' ? host : undefined,
      port: type === 'postgres' ? port : undefined,
      database: database || undefined,
      schema: schema || undefined,
      username: username || undefined,
      password: (type === 'postgres' || (type === 'snowflake' && authMethod === 'password')) ? password : undefined,
      account: type === 'snowflake' ? account : undefined,
      warehouse: type === 'snowflake' ? warehouse : undefined,
      role: type === 'snowflake' ? role : undefined,
      authMethod: type === 'snowflake' ? authMethod : 'password',
      privateKey: type === 'snowflake' && authMethod === 'keypair' ? privateKey : undefined,
      privateKeyPassphrase: type === 'snowflake' && authMethod === 'keypair' ? privateKeyPassphrase : undefined,
      createdAt: datasource?.createdAt || now,
      updatedAt: now,
    }
    onSave(dsConfig)
  }

  return (
    <div className="tps-modal-overlay" onClick={onClose}>
      <div className="tps-modal tps-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="tps-modal-header">
          <h3 className="tps-modal-title">
            {datasource ? 'Edit Data Source' : 'Add Data Source'}
          </h3>
          <button type="button" className="tps-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="tps-modal-body">
            <div className="tps-form-group">
              <label className="tps-label" htmlFor="ds-name">Connection Name</label>
              <input
                id="ds-name"
                type="text"
                className="tps-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Database"
                autoFocus
              />
            </div>

            <div className="tps-form-group">
              <label className="tps-label" htmlFor="ds-type">Database Type</label>
              <select
                id="ds-type"
                className="tps-select"
                value={type}
                onChange={e => setType(e.target.value as 'postgres' | 'snowflake')}
              >
                <option value="postgres">PostgreSQL</option>
                <option value="snowflake">Snowflake</option>
              </select>
            </div>

            {/* PostgreSQL Fields */}
            {type === 'postgres' && (
              <>
                <div className="tps-form-row">
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-host">Host</label>
                    <input
                      id="ds-host"
                      type="text"
                      className="tps-input"
                      value={host}
                      onChange={e => setHost(e.target.value)}
                      placeholder="localhost"
                    />
                  </div>
                  <div className="tps-form-group tps-form-group-small">
                    <label className="tps-label" htmlFor="ds-port">Port</label>
                    <input
                      id="ds-port"
                      type="number"
                      className="tps-input"
                      value={port}
                      onChange={e => setPort(Number(e.target.value))}
                      placeholder="5432"
                    />
                  </div>
                </div>

                <div className="tps-form-group">
                  <label className="tps-label" htmlFor="ds-database">Database</label>
                  <input
                    id="ds-database"
                    type="text"
                    className="tps-input"
                    value={database}
                    onChange={e => setDatabase(e.target.value)}
                    placeholder="mydb"
                  />
                </div>

                <div className="tps-form-row">
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-username">Username</label>
                    <input
                      id="ds-username"
                      type="text"
                      className="tps-input"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="postgres"
                    />
                  </div>
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-password">Password</label>
                    <input
                      id="ds-password"
                      type="password"
                      className="tps-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="********"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Snowflake Fields */}
            {type === 'snowflake' && (
              <>
                <div className="tps-form-group">
                  <label className="tps-label" htmlFor="ds-account">Account Identifier</label>
                  <input
                    id="ds-account"
                    type="text"
                    className="tps-input"
                    value={account}
                    onChange={e => setAccount(e.target.value)}
                    placeholder="xy12345.us-east-1"
                  />
                  <p className="tps-form-hint">
                    Your Snowflake account identifier (e.g., xy12345.us-east-1)
                  </p>
                </div>

                <div className="tps-form-row">
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-warehouse">Warehouse</label>
                    <input
                      id="ds-warehouse"
                      type="text"
                      className="tps-input"
                      value={warehouse}
                      onChange={e => setWarehouse(e.target.value)}
                      placeholder="COMPUTE_WH"
                    />
                  </div>
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-sf-database">Database</label>
                    <input
                      id="ds-sf-database"
                      type="text"
                      className="tps-input"
                      value={database}
                      onChange={e => setDatabase(e.target.value)}
                      placeholder="MY_DATABASE"
                    />
                  </div>
                </div>

                <div className="tps-form-row">
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-schema">Schema</label>
                    <input
                      id="ds-schema"
                      type="text"
                      className="tps-input"
                      value={schema}
                      onChange={e => setSchema(e.target.value)}
                      placeholder="PUBLIC"
                    />
                  </div>
                  <div className="tps-form-group tps-form-group-flex">
                    <label className="tps-label" htmlFor="ds-role">Role (optional)</label>
                    <input
                      id="ds-role"
                      type="text"
                      className="tps-input"
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      placeholder="ACCOUNTADMIN"
                    />
                  </div>
                </div>

                <div className="tps-form-group">
                  <label className="tps-label" htmlFor="ds-auth-method">Authentication Method</label>
                  <select
                    id="ds-auth-method"
                    className="tps-select"
                    value={authMethod}
                    onChange={e => setAuthMethod(e.target.value as 'password' | 'keypair' | 'externalbrowser')}
                  >
                    <option value="password">Username & Password</option>
                    <option value="keypair">Key Pair (RSA)</option>
                    <option value="externalbrowser">External Browser (SSO)</option>
                  </select>
                  <p className="tps-form-hint">
                    {authMethod === 'password' && 'Standard username and password authentication'}
                    {authMethod === 'keypair' && 'RSA key pair for server-to-server authentication'}
                    {authMethod === 'externalbrowser' && 'Opens browser for SSO login (local development only)'}
                  </p>
                </div>

                <div className="tps-form-group">
                  <label className="tps-label" htmlFor="ds-sf-username">Username</label>
                  <input
                    id="ds-sf-username"
                    type="text"
                    className="tps-input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="my_user"
                  />
                </div>

                {authMethod === 'password' && (
                  <div className="tps-form-group">
                    <label className="tps-label" htmlFor="ds-sf-password">Password</label>
                    <input
                      id="ds-sf-password"
                      type="password"
                      className="tps-input"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="********"
                    />
                  </div>
                )}

                {authMethod === 'keypair' && (
                  <>
                    <div className="tps-form-group">
                      <label className="tps-label" htmlFor="ds-sf-privatekey">Private Key (PEM)</label>
                      <textarea
                        id="ds-sf-privatekey"
                        className="tps-input tps-textarea"
                        value={privateKey}
                        onChange={e => setPrivateKey(e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        rows={4}
                      />
                      <p className="tps-form-hint">Paste your RSA private key in PEM format</p>
                    </div>
                    <div className="tps-form-group">
                      <label className="tps-label" htmlFor="ds-sf-passphrase">Key Passphrase (optional)</label>
                      <input
                        id="ds-sf-passphrase"
                        type="password"
                        className="tps-input"
                        value={privateKeyPassphrase}
                        onChange={e => setPrivateKeyPassphrase(e.target.value)}
                        placeholder="Leave empty if key is not encrypted"
                      />
                    </div>
                  </>
                )}

                {authMethod === 'externalbrowser' && (
                  <p className="tps-form-hint tps-form-hint-info">
                    When you test the connection, a browser window will open for SSO authentication.
                    This method only works in local development environments.
                  </p>
                )}
              </>
            )}

            {/* Test Connection Section */}
            <div className="tps-form-group">
              <div className="tps-test-connection">
                <button
                  type="button"
                  className="tps-btn tps-btn-secondary"
                  disabled={testStatus === 'testing'}
                  onClick={handleTestConnection}
                >
                  {testStatus === 'testing' ? (
                    <svg className="tps-spinner-inline" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  )}
                  Test Connection
                </button>
                {testMessage && (
                  <span
                    className={`tps-test-result ${
                      testStatus === 'success' ? 'tps-test-success' : ''
                    }${testStatus === 'error' ? 'tps-test-error' : ''}`}
                  >
                    {testMessage}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="tps-modal-footer">
            <button type="button" className="tps-btn tps-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="tps-btn tps-btn-primary" disabled={!name.trim()}>
              {datasource ? 'Save Changes' : 'Add Data Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Create a new block of the given type
 */
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

/**
 * Get initial blocks for a template
 */
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
