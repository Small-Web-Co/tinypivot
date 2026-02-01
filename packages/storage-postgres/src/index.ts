/**
 * TinyPivot Postgres Storage
 * PostgreSQL storage adapter for TinyPivot Studio
 *
 * This package provides:
 * - A client-side storage adapter that communicates with a REST API
 * - Drizzle ORM schema definitions for PostgreSQL tables
 * - Prisma schema for compatibility
 *
 * @packageDocumentation
 */

// Export the client-side adapter
export { createPostgresStorage } from './adapter'

// Export Drizzle schema
export {
  pages,
  shares,
  versions,
  widgets,
} from './drizzle'

export type {
  InsertPage,
  InsertShare,
  InsertVersion,
  InsertWidget,
  SelectPage,
  SelectShare,
  SelectVersion,
  SelectWidget,
} from './drizzle'
// Export Prisma schema as a subpath
export { PRISMA_SCHEMA, SQL_MIGRATION } from './prisma/schema'

// Export types
export type {
  ApiResponse,
  HttpMethod,
  PostgresServerOptions,
  PostgresStorageOptions,
} from './types'
export { PostgresStorageError } from './types'

// Re-export types from the studio package for convenience
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
