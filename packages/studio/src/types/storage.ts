/**
 * Storage Types for TinyPivot Studio
 * Defines the interface for persisting pages, widgets, versions, and shares
 */

import type { Page, PageCreateInput, PageListItem, PageSnapshot, PageUpdateInput } from './page'
import type { PageShare, PageShareSettings } from './share'
import type { PageVersion } from './version'
import type { WidgetConfig, WidgetCreateInput, WidgetUpdateInput } from './widget'

/**
 * Filter options for listing pages
 */
export interface PageListFilter {
  /** Filter by published status */
  published?: boolean
  /** Filter by archived status */
  archived?: boolean
  /** Filter by creator */
  createdBy?: string
  /** Filter by tags (any match) */
  tags?: string[]
  /** Search in title and description */
  search?: string
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title'
  /** Sort direction */
  sortDirection?: 'asc' | 'desc'
  /** Pagination offset */
  offset?: number
  /** Pagination limit */
  limit?: number
}

/**
 * Result of a paginated list query
 */
export interface PaginatedResult<T> {
  /** Items in this page */
  items: T[]
  /** Total number of items matching the filter */
  total: number
  /** Current offset */
  offset: number
  /** Current limit */
  limit: number
  /** Whether there are more items */
  hasMore: boolean
}

/**
 * Storage adapter interface for TinyPivot Studio
 * Implement this interface to provide custom storage backends
 * (e.g., IndexedDB for local storage, PostgreSQL for server-side)
 */
export interface StorageAdapter {
  // ============================================================================
  // Page Operations
  // ============================================================================

  /**
   * List all pages matching the filter criteria
   */
  listPages: (filter?: PageListFilter) => Promise<PaginatedResult<PageListItem>>

  /**
   * Get a page by ID with full content
   */
  getPage: (id: string) => Promise<Page | null>

  /**
   * Get a page by slug with full content
   */
  getPageBySlug: (slug: string) => Promise<Page | null>

  /**
   * Create a new page
   */
  createPage: (input: PageCreateInput) => Promise<Page>

  /**
   * Update an existing page
   */
  updatePage: (id: string, input: PageUpdateInput) => Promise<Page>

  /**
   * Delete a page and all associated data (versions, shares)
   */
  deletePage: (id: string) => Promise<void>

  /**
   * Duplicate a page with a new ID and slug
   */
  duplicatePage: (id: string, newTitle?: string) => Promise<Page>

  // ============================================================================
  // Widget Operations
  // ============================================================================

  /**
   * List all widgets, optionally filtered by page
   */
  listWidgets: (pageId?: string) => Promise<WidgetConfig[]>

  /**
   * Get a widget by ID
   */
  getWidget: (id: string) => Promise<WidgetConfig | null>

  /**
   * Create a new widget
   */
  createWidget: (input: WidgetCreateInput) => Promise<WidgetConfig>

  /**
   * Update an existing widget
   */
  updateWidget: (id: string, input: WidgetUpdateInput) => Promise<WidgetConfig>

  /**
   * Delete a widget
   */
  deleteWidget: (id: string) => Promise<void>

  /**
   * Duplicate a widget with a new ID
   */
  duplicateWidget: (id: string, newName?: string) => Promise<WidgetConfig>

  // ============================================================================
  // Version Operations
  // ============================================================================

  /**
   * List all versions for a page
   */
  listVersions: (pageId: string) => Promise<PageVersion[]>

  /**
   * Get a specific version by ID
   */
  getVersion: (versionId: string) => Promise<PageVersion | null>

  /**
   * Create a new version (snapshot) of a page
   */
  createVersion: (pageId: string, description?: string) => Promise<PageVersion>

  /**
   * Restore a page to a specific version
   */
  restoreVersion: (pageId: string, versionId: string) => Promise<Page>

  /**
   * Delete a specific version
   */
  deleteVersion: (versionId: string) => Promise<void>

  /**
   * Delete old versions beyond the maximum limit
   * Called automatically when creating new versions
   */
  pruneVersions: (pageId: string) => Promise<void>

  // ============================================================================
  // Share Operations
  // ============================================================================

  /**
   * Get share settings for a page
   */
  getShareSettings: (pageId: string) => Promise<PageShareSettings | null>

  /**
   * Update share settings for a page
   */
  updateShareSettings: (pageId: string, settings: Partial<PageShareSettings>) => Promise<PageShareSettings>

  /**
   * Get a share by token
   */
  getShareByToken: (token: string) => Promise<PageShare | null>

  /**
   * Create a new share link for a page
   */
  createShare: (pageId: string, settings?: Partial<PageShareSettings>) => Promise<PageShare>

  /**
   * Revoke a share link
   */
  revokeShare: (token: string) => Promise<void>

  /**
   * Revoke all share links for a page
   */
  revokeAllShares: (pageId: string) => Promise<void>

  /**
   * Record a view on a shared page
   */
  recordShareView: (token: string) => Promise<void>

  // ============================================================================
  // Snapshot Operations (for version restore preview)
  // ============================================================================

  /**
   * Get a page snapshot for a specific version
   */
  getSnapshot: (versionId: string) => Promise<PageSnapshot | null>

  // ============================================================================
  // Utility Operations
  // ============================================================================

  /**
   * Check if a slug is available
   */
  isSlugAvailable: (slug: string, excludePageId?: string) => Promise<boolean>

  /**
   * Generate a unique slug from a title
   */
  generateSlug: (title: string) => Promise<string>

  /**
   * Initialize the storage (create tables, indices, etc.)
   */
  initialize: () => Promise<void>

  /**
   * Close the storage connection
   */
  close: () => Promise<void>

  /**
   * Clear all data (use with caution!)
   */
  clear: () => Promise<void>
}

/**
 * Events emitted by the storage adapter
 */
export interface StorageEvents {
  /** Emitted when a page is created */
  'page:created': { page: Page }
  /** Emitted when a page is updated */
  'page:updated': { page: Page }
  /** Emitted when a page is deleted */
  'page:deleted': { pageId: string }
  /** Emitted when a widget is created */
  'widget:created': { widget: WidgetConfig }
  /** Emitted when a widget is updated */
  'widget:updated': { widget: WidgetConfig }
  /** Emitted when a widget is deleted */
  'widget:deleted': { widgetId: string }
  /** Emitted when a version is created */
  'version:created': { version: PageVersion }
  /** Emitted when a share is created */
  'share:created': { share: PageShare }
  /** Emitted when a share is revoked */
  'share:revoked': { token: string }
}

/**
 * Storage adapter with event support
 */
export interface StorageAdapterWithEvents extends StorageAdapter {
  /** Subscribe to storage events */
  on: <K extends keyof StorageEvents>(event: K, handler: (data: StorageEvents[K]) => void) => void
  /** Unsubscribe from storage events */
  off: <K extends keyof StorageEvents>(event: K, handler: (data: StorageEvents[K]) => void) => void
}
