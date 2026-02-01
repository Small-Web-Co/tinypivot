/**
 * TinyPivotStudio - Main React Component
 * The primary entry point for the TinyPivot Studio experience
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
import { generateId, isWidgetBlock } from '@smallwebco/tinypivot-studio'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type StudioConfig, StudioProvider, useStudioContext } from '../context'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'
import '@smallwebco/tinypivot-react/style.css'

// LocalStorage key for datasources
const DATASOURCES_STORAGE_KEY = 'tinypivot-datasources'

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
  const { storage } = useStudioContext()

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
  const [widgetConfigUseSampleData, setWidgetConfigUseSampleData] = useState(true)
  const [widgetConfigVisualizationType, setWidgetConfigVisualizationType] = useState<'table' | 'pivot' | 'chart'>('table')
  const [widgetConfigShowTitle, setWidgetConfigShowTitle] = useState(true)

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
    setWidgetConfigUseSampleData(Boolean(block.widgetId))
    setWidgetConfigVisualizationType((block.metadata?.visualizationType as 'table' | 'pivot' | 'chart') || 'table')
    setWidgetConfigShowTitle(block.showTitle !== false)
    setShowWidgetConfigModal(true)
  }, [])

  const closeWidgetConfigModal = useCallback(() => {
    setShowWidgetConfigModal(false)
    setWidgetConfigBlockId(null)
    setWidgetConfigTitle('')
    setWidgetConfigHeight(400)
    setWidgetConfigUseSampleData(true)
    setWidgetConfigVisualizationType('table')
    setWidgetConfigShowTitle(true)
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
          useSampleData={widgetConfigUseSampleData}
          setUseSampleData={setWidgetConfigUseSampleData}
          visualizationType={widgetConfigVisualizationType}
          setVisualizationType={setWidgetConfigVisualizationType}
          showTitle={widgetConfigShowTitle}
          setShowTitle={setWidgetConfigShowTitle}
          onClose={closeWidgetConfigModal}
          onSave={() => {
            if (!widgetConfigBlockId || !currentPage)
              return

            const updates: Partial<WidgetBlock> = {
              titleOverride: widgetConfigTitle || undefined,
              height: widgetConfigHeight,
              widgetId: widgetConfigUseSampleData ? 'sample' : '',
              showTitle: widgetConfigShowTitle,
              metadata: {
                visualizationType: widgetConfigVisualizationType,
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
        />
      )}
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
              className="tps-page-item"
              onClick={() => onEditDatasource(ds)}
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
}

function PageEditor({ page, theme, onUpdatePage, onConfigureWidget }: PageEditorProps) {
  const [title, setTitle] = useState(page.title)
  const [blocks, setBlocks] = useState<Block[]>(page.blocks)
  const [showBlockMenu, setShowBlockMenu] = useState(false)

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
    const newBlocks = blocks.map((block): Block =>
      block.id === blockId ? { ...block, ...updates } as Block : block,
    )
    setBlocks(newBlocks)
    onUpdatePage({ ...page, title, blocks: newBlocks })
  }

  // Handle block deletion
  const handleBlockDelete = (blockId: string) => {
    const newBlocks = blocks.filter(block => block.id !== blockId)
    setBlocks(newBlocks)
    onUpdatePage({ ...page, title, blocks: newBlocks })
  }

  // Handle add block
  const handleAddBlock = (type: Block['type']) => {
    const newBlock = createBlock(type)
    const newBlocks = [...blocks, newBlock]
    setBlocks(newBlocks)
    setShowBlockMenu(false)
    onUpdatePage({ ...page, title, blocks: newBlocks })
  }

  // Handle drag end for reordering blocks
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
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
      </div>

      <div className="tps-editor-content">
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
                  />
                </SortableBlockWrapper>
              ))}

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
          </SortableContext>
        </DndContext>
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
}

function BlockRenderer({ block, theme, onUpdate, onDelete, onConfigureWidget }: BlockRendererProps) {
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
      <textarea
        className="tps-block-input"
        value={block.content}
        onChange={e => onUpdate(block.id, { content: e.target.value })}
        placeholder="Type some text..."
        rows={1}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement
          target.style.height = 'auto'
          target.style.height = `${target.scrollHeight}px`
        }}
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
}: {
  block: WidgetBlock
  theme: 'light' | 'dark'
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
  onConfigure: (block: WidgetBlock) => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get widget height style
  const heightStyle = useMemo(() => {
    if (!block.height)
      return '400px'
    return typeof block.height === 'number' ? `${block.height}px` : block.height
  }, [block.height])

  // Check if widget has data configured
  const hasWidgetData = Boolean(block.widgetId)

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

  return (
    <div className="tps-block tps-block-widget" style={{ minHeight: heightStyle }}>
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

      {/* Widget with Data (using sample data for now) */}
      {!isLoading && !error && hasWidgetData && (
        <div className="tps-widget-content">
          <DataGrid
            data={widgetSampleData}
            theme={theme}
            enableExport={false}
            enablePagination={false}
            enableSearch={true}
            stripedRows={true}
            initialHeight={350}
            minHeight={200}
            maxHeight={600}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Image block component
 */
function ImageBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: Block & { type: 'image', src: string, alt?: string, caption?: string, align?: string, width?: string | number }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  const [urlInput, setUrlInput] = useState('')

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onUpdate(block.id, { src: urlInput.trim() })
    }
  }

  return (
    <div className="tps-block tps-block-image">
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

      {/* Image placeholder when no src */}
      {!block.src ? (
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
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onBlur={handleUrlSubmit}
            onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
          />
        </div>
      ) : (
        <div className="tps-image-preview">
          <div className={`tps-image-preview-container tps-align-${block.align || 'center'}`}>
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
          <div className="tps-image-controls">
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
          </div>
        </div>
      )}
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
 * Columns block component
 */
function ColumnsBlockComponent({
  block,
  onUpdate,
  onDelete,
}: {
  block: Block & { type: 'columns', columns: Array<{ id: string, width: number, blocks: Block[] }>, gap?: number }
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
}) {
  const getGapClass = (gap?: number) => {
    if (!gap)
      return 'medium'
    if (gap <= 8)
      return 'small'
    if (gap <= 16)
      return 'medium'
    return 'large'
  }

  const handleColumnCountChange = (count: number) => {
    const newColumns = Array.from({ length: count }, (_, i) =>
      i < block.columns.length
        ? block.columns[i]
        : { id: generateId(), width: 1, blocks: [] })
    onUpdate(block.id, { columns: newColumns })
  }

  return (
    <div className="tps-block tps-block-columns">
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
        {block.columns.map((column, idx) => (
          <div
            key={column.id}
            className="tps-column"
            style={{ flex: column.width }}
          >
            <div className="tps-column-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <div>
                Column
                {' '}
                {idx + 1}
              </div>
            </div>
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
  useSampleData: boolean
  setUseSampleData: (value: boolean) => void
  visualizationType: 'table' | 'pivot' | 'chart'
  setVisualizationType: (type: 'table' | 'pivot' | 'chart') => void
  showTitle: boolean
  setShowTitle: (value: boolean) => void
  onClose: () => void
  onSave: () => void
}

function WidgetConfigModal({
  title,
  setTitle,
  height,
  setHeight,
  useSampleData,
  setUseSampleData,
  visualizationType,
  setVisualizationType,
  showTitle,
  setShowTitle,
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
              <label className="tps-label">Data Source</label>
              <label className="tps-checkbox-label">
                <input
                  type="checkbox"
                  className="tps-checkbox"
                  checked={useSampleData}
                  onChange={e => setUseSampleData(e.target.checked)}
                />
                <span>Use sample data</span>
              </label>
              <p className="tps-form-hint">
                Sample data shows a demo dataset. Connect a data source in the future to use real data.
              </p>
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
}

function DatasourceModal({ datasource, onClose, onSave }: DatasourceModalProps) {
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
  // Test connection state
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestMessage('Testing connection...')
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    // Simulate success
    setTestStatus('success')
    setTestMessage('Connection successful!')
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
      password: password || undefined,
      account: type === 'snowflake' ? account : undefined,
      warehouse: type === 'snowflake' ? warehouse : undefined,
      role: type === 'snowflake' ? role : undefined,
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

                <div className="tps-form-row">
                  <div className="tps-form-group tps-form-group-flex">
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
                  <div className="tps-form-group tps-form-group-flex">
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
                </div>
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
      return { id, type: 'image', src: '', alt: '', caption: '', align: 'center' }
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
