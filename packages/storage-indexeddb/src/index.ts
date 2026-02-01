/**
 * TinyPivot IndexedDB Storage
 * Browser-based storage adapter for TinyPivot Studio using IndexedDB
 *
 * @packageDocumentation
 */

// Export the main adapter factory
export { createIndexedDBStorage } from './adapter'
export type { IndexedDBStorageOptions } from './adapter'

// Export schema constants and types
export { DB_NAME, DB_VERSION, MAX_VERSIONS_PER_PAGE } from './schema'
export type { TinyPivotDBSchema } from './schema'

// Re-export storage types for convenience
export type {
  Page,
  PageCreateInput,
  PageListFilter,
  PageListItem,
  PageShare,
  PageShareSettings,
  PageSnapshot,
  PageUpdateInput,
  PageVersion,
  PaginatedResult,
  StorageAdapter,
  WidgetConfig,
  WidgetCreateInput,
  WidgetUpdateInput,
} from '@smallwebco/tinypivot-studio'
