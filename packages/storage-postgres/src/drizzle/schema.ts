/**
 * Drizzle Schema for TinyPivot Postgres Storage
 * Defines table structures for pages, widgets, versions, and shares
 *
 * All tables are prefixed with 'tinypivot_' to avoid conflicts with other tables
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

// =============================================================================
// Pages Table
// =============================================================================

/**
 * Pages table - stores page documents with blocks and metadata
 */
export const pages = pgTable(
  'tinypivot_pages',
  {
    /** Unique page identifier (UUID) */
    id: varchar('id', { length: 36 }).primaryKey(),
    /** Page title */
    title: varchar('title', { length: 255 }).notNull(),
    /** Optional description/subtitle */
    description: text('description'),
    /** URL-friendly slug (unique) */
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    /** Template this page was created from */
    template: varchar('template', { length: 50 }),
    /** Theme configuration (JSON) */
    theme: jsonb('theme'),
    /** Ordered list of content blocks (JSON) */
    blocks: jsonb('blocks').notNull().default([]),
    /** Widgets used by this page (JSON) */
    widgets: jsonb('widgets').default([]),
    /** Page-level filters (JSON) */
    filters: jsonb('filters').default([]),
    /** Field links between widgets (JSON) */
    fieldLinks: jsonb('field_links').default([]),
    /** Whether the page is published */
    published: boolean('published').notNull().default(false),
    /** Whether the page is archived */
    archived: boolean('archived').notNull().default(false),
    /** Timestamp when the page was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Timestamp when the page was last updated */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Timestamp when the page was published */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    /** User ID who created the page */
    createdBy: varchar('created_by', { length: 255 }),
    /** User ID who last updated the page */
    updatedBy: varchar('updated_by', { length: 255 }),
    /** Tags for organization (JSON array) */
    tags: jsonb('tags').default([]),
    /** Custom metadata (JSON) */
    metadata: jsonb('metadata').default({}),
  },
  table => ({
    slugIdx: index('tinypivot_pages_slug_idx').on(table.slug),
    createdAtIdx: index('tinypivot_pages_created_at_idx').on(table.createdAt),
    updatedAtIdx: index('tinypivot_pages_updated_at_idx').on(table.updatedAt),
    publishedIdx: index('tinypivot_pages_published_idx').on(table.published),
    archivedIdx: index('tinypivot_pages_archived_idx').on(table.archived),
    createdByIdx: index('tinypivot_pages_created_by_idx').on(table.createdBy),
  }),
)

// =============================================================================
// Widgets Table
// =============================================================================

/**
 * Widgets table - stores widget configurations
 */
export const widgets = pgTable(
  'tinypivot_widgets',
  {
    /** Unique widget identifier (UUID) */
    id: varchar('id', { length: 36 }).primaryKey(),
    /** Display name for the widget */
    name: varchar('name', { length: 255 }).notNull(),
    /** Optional description */
    description: text('description'),
    /** Data source identifier */
    datasourceId: varchar('datasource_id', { length: 255 }).notNull(),
    /** SQL query or query identifier (JSON) */
    query: jsonb('query'),
    /** Type of visualization */
    visualization: varchar('visualization', { length: 50 }).notNull(),
    /** Table configuration (JSON) */
    tableConfig: jsonb('table_config'),
    /** Pivot configuration (JSON) */
    pivotConfig: jsonb('pivot_config'),
    /** Chart configuration (JSON) */
    chartConfig: jsonb('chart_config'),
    /** KPI configuration (JSON) */
    kpiConfig: jsonb('kpi_config'),
    /** Active filters applied to the widget (JSON) */
    filters: jsonb('filters').default([]),
    /** Timestamp when the widget was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Timestamp when the widget was last updated */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** User ID who created the widget */
    createdBy: varchar('created_by', { length: 255 }),
  },
  table => ({
    datasourceIdx: index('tinypivot_widgets_datasource_idx').on(table.datasourceId),
    createdAtIdx: index('tinypivot_widgets_created_at_idx').on(table.createdAt),
  }),
)

// =============================================================================
// Versions Table
// =============================================================================

/**
 * Versions table - stores page version history
 */
export const versions = pgTable(
  'tinypivot_versions',
  {
    /** Unique version identifier (UUID) */
    id: varchar('id', { length: 36 }).primaryKey(),
    /** Page ID this version belongs to (FK) */
    pageId: varchar('page_id', { length: 36 }).notNull(),
    /** Version number (incremental, 1-based) */
    version: integer('version').notNull(),
    /** Page title at this version */
    title: varchar('title', { length: 255 }).notNull(),
    /** Page description at this version */
    description: text('description'),
    /** Page content blocks at this version (JSON) */
    blocks: jsonb('blocks').notNull().default([]),
    /** Widgets at this version (JSON) */
    widgets: jsonb('widgets').default([]),
    /** Theme at this version (JSON) */
    theme: jsonb('theme'),
    /** Timestamp when this version was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** User ID who created this version */
    createdBy: varchar('created_by', { length: 255 }),
    /** Description of changes made in this version */
    changeDescription: text('change_description'),
  },
  table => ({
    pageIdIdx: index('tinypivot_versions_page_id_idx').on(table.pageId),
    createdAtIdx: index('tinypivot_versions_created_at_idx').on(table.createdAt),
    pageVersionUnique: uniqueIndex('tinypivot_versions_page_version_unique').on(table.pageId, table.version),
  }),
)

// =============================================================================
// Shares Table
// =============================================================================

/**
 * Shares table - stores share links and settings
 */
export const shares = pgTable(
  'tinypivot_shares',
  {
    /** Unique share identifier (UUID) */
    id: varchar('id', { length: 36 }).primaryKey(),
    /** Page ID being shared (FK) */
    pageId: varchar('page_id', { length: 36 }).notNull(),
    /** Unique share token (used in URL) */
    token: varchar('token', { length: 64 }).notNull().unique(),
    /** Share settings (JSON) */
    settings: jsonb('settings').notNull(),
    /** Number of times this share has been viewed */
    viewCount: integer('view_count').notNull().default(0),
    /** Timestamp when the share was created */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Timestamp when the share was last accessed */
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    /** User ID who created the share */
    createdBy: varchar('created_by', { length: 255 }),
    /** Whether the share is currently active */
    active: boolean('active').notNull().default(true),
    /** Reason for deactivation (if applicable) */
    deactivationReason: varchar('deactivation_reason', { length: 50 }),
  },
  table => ({
    pageIdIdx: index('tinypivot_shares_page_id_idx').on(table.pageId),
    tokenIdx: index('tinypivot_shares_token_idx').on(table.token),
    activeIdx: index('tinypivot_shares_active_idx').on(table.active),
  }),
)

// =============================================================================
// Type Exports for Drizzle Inference
// =============================================================================

/** Inferred type for selecting a page record */
export type SelectPage = typeof pages.$inferSelect
/** Inferred type for inserting a page record */
export type InsertPage = typeof pages.$inferInsert

/** Inferred type for selecting a widget record */
export type SelectWidget = typeof widgets.$inferSelect
/** Inferred type for inserting a widget record */
export type InsertWidget = typeof widgets.$inferInsert

/** Inferred type for selecting a version record */
export type SelectVersion = typeof versions.$inferSelect
/** Inferred type for inserting a version record */
export type InsertVersion = typeof versions.$inferInsert

/** Inferred type for selecting a share record */
export type SelectShare = typeof shares.$inferSelect
/** Inferred type for inserting a share record */
export type InsertShare = typeof shares.$inferInsert
