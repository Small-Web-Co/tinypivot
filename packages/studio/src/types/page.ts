/**
 * Page Types for TinyPivot Studio
 * Defines the structure for pages (documents) that contain blocks and widgets
 */

import type { Block } from './block'
import type { ThemeConfig } from './theme'
import type { WidgetConfig } from './widget'

/**
 * Template types for quick page creation
 */
export type PageTemplate = 'blank' | 'article' | 'dashboard' | 'report' | 'infographic'

/**
 * Layout mode for page editing
 */
export type LayoutMode = 'linear' | 'grid'

/**
 * A field link allows widgets on a page to be connected
 * When a filter is applied to the source widget, it propagates to linked widgets
 */
export interface FieldLink {
  /** Source widget ID */
  sourceWidgetId: string
  /** Source field name */
  sourceField: string
  /** Target widget ID */
  targetWidgetId: string
  /** Target field name */
  targetField: string
}

/**
 * A filter that applies to the entire page
 * Can be used to create interactive dashboards with global controls
 */
export interface PageFilter {
  /** Unique filter identifier */
  id: string
  /** Display label for the filter */
  label: string
  /** Field name to filter on */
  field: string
  /** Filter type */
  type: 'select' | 'multiSelect' | 'dateRange' | 'numberRange' | 'search'
  /** Widget IDs this filter applies to (empty means all) */
  targetWidgetIds?: string[]
  /** Default value for the filter */
  defaultValue?: unknown
  /** Available options for select/multiSelect (if not auto-derived from data) */
  options?: Array<{ label: string, value: unknown }>
}

/**
 * Complete page configuration
 * A page is a document containing blocks arranged vertically
 */
export interface Page {
  /** Unique page identifier */
  id: string
  /** Page title */
  title: string
  /** Optional description/subtitle */
  description?: string
  /** URL-friendly slug for the page */
  slug: string
  /** Template this page was created from */
  template?: PageTemplate
  /** Layout mode: linear (stacked blocks) or grid (masonry layout) */
  layoutMode?: LayoutMode
  /** Theme configuration for this page */
  theme?: ThemeConfig
  /** Ordered list of content blocks */
  blocks: Block[]
  /** Widgets used by this page (embedded for standalone use) */
  widgets?: WidgetConfig[]
  /** Page-level filters */
  filters?: PageFilter[]
  /** Field links between widgets */
  fieldLinks?: FieldLink[]
  /** Whether the page is published */
  published: boolean
  /** Whether the page is archived */
  archived: boolean
  /** Timestamp when the page was created */
  createdAt: Date
  /** Timestamp when the page was last updated */
  updatedAt: Date
  /** Timestamp when the page was published */
  publishedAt?: Date
  /** User ID who created the page */
  createdBy?: string
  /** User ID who last updated the page */
  updatedBy?: string
  /** Tags for organization */
  tags?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Input for creating a new page
 */
export interface PageCreateInput {
  /** Page title */
  title: string
  /** Optional description */
  description?: string
  /** URL-friendly slug (auto-generated if not provided) */
  slug?: string
  /** Template to use */
  template?: PageTemplate
  /** Theme configuration */
  theme?: ThemeConfig
  /** Initial blocks */
  blocks?: Block[]
  /** User ID who created the page */
  createdBy?: string
  /** Tags for organization */
  tags?: string[]
}

/**
 * Input for updating an existing page
 */
export interface PageUpdateInput {
  /** Page title */
  title?: string
  /** Optional description */
  description?: string
  /** URL-friendly slug */
  slug?: string
  /** Layout mode: linear (stacked blocks) or grid (masonry layout) */
  layoutMode?: LayoutMode
  /** Theme configuration */
  theme?: ThemeConfig
  /** Ordered list of content blocks */
  blocks?: Block[]
  /** Widgets used by this page */
  widgets?: WidgetConfig[]
  /** Page-level filters */
  filters?: PageFilter[]
  /** Field links between widgets */
  fieldLinks?: FieldLink[]
  /** Whether the page is published */
  published?: boolean
  /** Whether the page is archived */
  archived?: boolean
  /** User ID who updated the page */
  updatedBy?: string
  /** Tags for organization */
  tags?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * A snapshot of a page at a specific point in time
 * Used for version history
 */
export interface PageSnapshot {
  /** Unique snapshot identifier */
  id: string
  /** Page ID this snapshot belongs to */
  pageId: string
  /** Version number (incremental) */
  version: number
  /** Page title at this version */
  title: string
  /** Page blocks at this version */
  blocks: Block[]
  /** Widgets at this version */
  widgets?: WidgetConfig[]
  /** Timestamp when this snapshot was created */
  createdAt: Date
  /** User ID who created this version */
  createdBy?: string
  /** Optional change description */
  changeDescription?: string
}

/**
 * Page list item for display in lists (without full content)
 */
export interface PageListItem {
  /** Unique page identifier */
  id: string
  /** Page title */
  title: string
  /** Optional description */
  description?: string
  /** URL-friendly slug */
  slug: string
  /** Template used */
  template?: PageTemplate
  /** Whether the page is published */
  published: boolean
  /** Whether the page is archived */
  archived: boolean
  /** Timestamp when the page was created */
  createdAt: Date
  /** Timestamp when the page was last updated */
  updatedAt: Date
  /** User ID who created the page */
  createdBy?: string
  /** Tags for organization */
  tags?: string[]
}
