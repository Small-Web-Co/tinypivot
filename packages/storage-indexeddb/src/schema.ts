/**
 * IndexedDB Schema Definition
 * Defines the database structure for TinyPivot Studio storage
 */

import type {
  Page,
  PageShare,
  PageVersion,
  WidgetConfig,
} from '@smallwebco/tinypivot-studio'
import type { DBSchema } from 'idb'

/** Database name for TinyPivot Studio */
export const DB_NAME = 'tinypivot-studio'

/** Current database version */
export const DB_VERSION = 1

/** Maximum versions to keep per page */
export const MAX_VERSIONS_PER_PAGE = 20

/**
 * Stored page record in IndexedDB
 * Dates are serialized as ISO strings for storage
 */
export interface StoredPage extends Omit<Page, 'createdAt' | 'updatedAt' | 'publishedAt'> {
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

/**
 * Stored widget record in IndexedDB
 * Dates are serialized as ISO strings for storage
 */
export interface StoredWidget extends Omit<WidgetConfig, 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
  /** Page ID this widget belongs to (for indexing) */
  pageId?: string
}

/**
 * Stored version record in IndexedDB
 * Dates are serialized as ISO strings for storage
 */
export interface StoredVersion extends Omit<PageVersion, 'createdAt'> {
  createdAt: string
}

/**
 * Stored share record in IndexedDB
 * Dates are serialized as ISO strings for storage
 */
export interface StoredShare extends Omit<PageShare, 'createdAt' | 'lastAccessedAt' | 'settings'> {
  createdAt: string
  lastAccessedAt?: string
  settings: Omit<PageShare['settings'], 'expiresAt'> & {
    expiresAt?: string
  }
}

/**
 * IndexedDB Schema for TinyPivot Studio
 */
export interface TinyPivotDBSchema extends DBSchema {
  /**
   * Pages store - contains page documents with blocks and metadata
   */
  pages: {
    key: string
    value: StoredPage
    indexes: {
      /** Index by slug for URL-based lookups */
      'by-slug': string
      /** Index by updated timestamp for sorting */
      'by-updated': string
      /** Index by created timestamp for sorting */
      'by-created': string
    }
  }

  /**
   * Widgets store - contains widget configurations
   */
  widgets: {
    key: string
    value: StoredWidget
    indexes: {
      /** Index by page ID for page-specific queries */
      'by-page': string
      /** Index by datasource for datasource-related operations */
      'by-datasource': string
    }
  }

  /**
   * Versions store - contains page version history
   */
  versions: {
    key: string
    value: StoredVersion
    indexes: {
      /** Index by page ID for listing versions */
      'by-page': string
      /** Compound index for page + version number (for ordering) */
      'by-page-version': [string, number]
      /** Index by created timestamp */
      'by-created': string
    }
  }

  /**
   * Shares store - contains share links and settings
   */
  shares: {
    key: string
    value: StoredShare
    indexes: {
      /** Index by page ID for listing shares per page */
      'by-page': string
      /** Index by token for URL-based lookups */
      'by-token': string
    }
  }
}

/**
 * Convert a Page to its stored format (dates to strings)
 */
export function toStoredPage(page: Page): StoredPage {
  return {
    ...page,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    publishedAt: page.publishedAt?.toISOString(),
  }
}

/**
 * Convert a stored page back to Page format (strings to dates)
 */
export function fromStoredPage(stored: StoredPage): Page {
  return {
    ...stored,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    publishedAt: stored.publishedAt ? new Date(stored.publishedAt) : undefined,
  }
}

/**
 * Convert a WidgetConfig to its stored format
 */
export function toStoredWidget(widget: WidgetConfig, pageId?: string): StoredWidget {
  return {
    ...widget,
    pageId,
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
  }
}

/**
 * Convert a stored widget back to WidgetConfig format
 */
export function fromStoredWidget(stored: StoredWidget): WidgetConfig {
  const { pageId: _, ...widget } = stored
  return {
    ...widget,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
  }
}

/**
 * Convert a PageVersion to its stored format
 */
export function toStoredVersion(version: PageVersion): StoredVersion {
  return {
    ...version,
    createdAt: version.createdAt.toISOString(),
  }
}

/**
 * Convert a stored version back to PageVersion format
 */
export function fromStoredVersion(stored: StoredVersion): PageVersion {
  return {
    ...stored,
    createdAt: new Date(stored.createdAt),
  }
}

/**
 * Convert a PageShare to its stored format
 */
export function toStoredShare(share: PageShare): StoredShare {
  return {
    ...share,
    createdAt: share.createdAt.toISOString(),
    lastAccessedAt: share.lastAccessedAt?.toISOString(),
    settings: {
      ...share.settings,
      expiresAt: share.settings.expiresAt?.toISOString(),
    },
  }
}

/**
 * Convert a stored share back to PageShare format
 */
export function fromStoredShare(stored: StoredShare): PageShare {
  return {
    ...stored,
    createdAt: new Date(stored.createdAt),
    lastAccessedAt: stored.lastAccessedAt ? new Date(stored.lastAccessedAt) : undefined,
    settings: {
      ...stored.settings,
      expiresAt: stored.settings.expiresAt ? new Date(stored.settings.expiresAt) : undefined,
    },
  }
}
