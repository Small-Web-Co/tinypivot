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
import { DataGrid } from '@smallwebco/tinypivot-react'
import { generateId, isWidgetBlock } from '@smallwebco/tinypivot-studio'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { type StudioConfig, StudioProvider, useStudioContext } from '../context'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'

// Widget sample data - used when no data source is configured
const widgetSampleData = [
  { id: 1, product: 'Widget A', category: 'Electronics', sales: 1250, revenue: 31250 },
  { id: 2, product: 'Widget B', category: 'Electronics', sales: 980, revenue: 24500 },
  { id: 3, product: 'Gadget X', category: 'Home', sales: 750, revenue: 18750 },
  { id: 4, product: 'Gadget Y', category: 'Home', sales: 620, revenue: 15500 },
  { id: 5, product: 'Device Z', category: 'Office', sales: 1100, revenue: 27500 },
]

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
      />

      <main className="tps-main">
        {!storage ? (
          <NoStorageState />
        ) : currentPage ? (
          <PageEditor
            page={currentPage}
            theme={theme}
            onUpdatePage={handleUpdatePage}
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
}

function Sidebar({
  pages,
  currentPageId,
  isLoading,
  onSelectPage,
  onDeletePage,
  onCreatePage,
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
}

function PageEditor({ page, theme, onUpdatePage }: PageEditorProps) {
  const [title, setTitle] = useState(page.title)
  const [blocks, setBlocks] = useState<Block[]>(page.blocks)
  const [showBlockMenu, setShowBlockMenu] = useState(false)

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
        <div className="tps-blocks">
          {blocks.map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
              theme={theme}
              onUpdate={handleBlockUpdate}
              onDelete={handleBlockDelete}
            />
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
}

function BlockRenderer({ block, theme, onUpdate, onDelete }: BlockRendererProps) {
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
}: {
  block: WidgetBlock
  theme: 'light' | 'dark'
  onUpdate: (blockId: string, updates: Partial<Block>) => void
  onDelete: (blockId: string) => void
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

  // Handle configure button click - toggle sample data
  const handleConfigure = () => {
    onUpdate(block.id, { widgetId: block.widgetId ? '' : 'sample' })
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
