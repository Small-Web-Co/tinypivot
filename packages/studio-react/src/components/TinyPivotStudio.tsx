/**
 * TinyPivotStudio - Main React Component
 * The primary entry point for the TinyPivot Studio experience
 */
import type { DatasourceConfig, Page, StorageAdapter, WidgetConfig } from '@smallwebco/tinypivot-studio'

import { type StudioConfig, StudioProvider } from '../context'

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

  return (
    <StudioProvider config={config}>
      <div className={`tinypivot-studio ${className ?? ''}`}>
        <StudioLayout
          onPageSave={onPageSave}
          onWidgetSave={onWidgetSave}
        />
      </div>
    </StudioProvider>
  )
}

interface StudioLayoutProps {
  onPageSave?: (page: Page) => void
  onWidgetSave?: (widget: WidgetConfig) => void
}

/**
 * Internal layout component for the studio
 * Provides the sidebar and main content area structure
 */
function StudioLayout({ onPageSave: _onPageSave, onWidgetSave: _onWidgetSave }: StudioLayoutProps) {
  // TODO: Implement full layout with sidebar, main content area, etc.
  // - Page list in sidebar
  // - Widget library in sidebar
  // - Main editor area
  // - Use onPageSave and onWidgetSave callbacks when saving

  return (
    <div className="tinypivot-studio-layout">
      <aside className="tinypivot-studio-sidebar">
        {/* Page list, widget library */}
        <div className="tinypivot-studio-sidebar-section">Pages</div>
        <div className="tinypivot-studio-sidebar-section">Widgets</div>
      </aside>
      <main className="tinypivot-studio-main">
        {/* Empty state or page builder */}
        <EmptyState />
      </main>
    </div>
  )
}

/**
 * Empty state component displayed when no pages exist
 * Provides quick actions to get started
 */
function EmptyState() {
  return (
    <div className="tinypivot-studio-empty">
      <h2>TinyPivot Studio</h2>
      <p>You don&apos;t have any pages yet.</p>
      <button type="button">+ Create your first page</button>
      <div className="tinypivot-studio-empty-links">
        <a href="#">Connect to Snowflake</a>
        <a href="#">Try with sample data</a>
        <a href="#">Watch quick tutorial</a>
        <a href="#">Read the docs</a>
      </div>
    </div>
  )
}
