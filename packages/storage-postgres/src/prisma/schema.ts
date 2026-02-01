/**
 * Prisma Schema Definition for TinyPivot Postgres Storage
 *
 * This file contains the Prisma schema as a string constant that can be
 * used to generate a Prisma client for TinyPivot storage.
 *
 * To use this schema:
 * 1. Copy the PRISMA_SCHEMA constant to your project's schema.prisma file
 * 2. Run `prisma generate` to generate the client
 * 3. Run `prisma db push` or `prisma migrate dev` to create the tables
 *
 * Note: This is provided for compatibility with projects that prefer Prisma
 * over Drizzle ORM. The primary schema is the Drizzle schema in ./drizzle/schema.ts
 */

/**
 * Prisma schema string for TinyPivot storage tables
 *
 * @example
 * ```ts
 * import { PRISMA_SCHEMA } from '@smallwebco/tinypivot-storage-postgres/prisma'
 * import { writeFileSync } from 'fs'
 *
 * // Append to your existing schema.prisma
 * writeFileSync('prisma/tinypivot.prisma', PRISMA_SCHEMA)
 * ```
 */
export const PRISMA_SCHEMA = `
// TinyPivot Storage Models
// Generated from @smallwebco/tinypivot-storage-postgres

/// Page documents with blocks and metadata
model TinypivotPage {
  /// Unique page identifier (UUID)
  id          String    @id @db.VarChar(36)
  /// Page title
  title       String    @db.VarChar(255)
  /// Optional description/subtitle
  description String?   @db.Text
  /// URL-friendly slug (unique)
  slug        String    @unique @db.VarChar(255)
  /// Template this page was created from
  template    String?   @db.VarChar(50)
  /// Theme configuration (JSON)
  theme       Json?
  /// Ordered list of content blocks (JSON)
  blocks      Json      @default("[]")
  /// Widgets used by this page (JSON)
  widgets     Json?     @default("[]")
  /// Page-level filters (JSON)
  filters     Json?     @default("[]")
  /// Field links between widgets (JSON)
  fieldLinks  Json?     @default("[]") @map("field_links")
  /// Whether the page is published
  published   Boolean   @default(false)
  /// Whether the page is archived
  archived    Boolean   @default(false)
  /// Timestamp when the page was created
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  /// Timestamp when the page was last updated
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  /// Timestamp when the page was published
  publishedAt DateTime? @map("published_at") @db.Timestamptz
  /// User ID who created the page
  createdBy   String?   @map("created_by") @db.VarChar(255)
  /// User ID who last updated the page
  updatedBy   String?   @map("updated_by") @db.VarChar(255)
  /// Tags for organization (JSON array)
  tags        Json?     @default("[]")
  /// Custom metadata (JSON)
  metadata    Json?     @default("{}")

  // Relations
  versions TinypivotVersion[]
  shares   TinypivotShare[]

  @@index([slug])
  @@index([createdAt])
  @@index([updatedAt])
  @@index([published])
  @@index([archived])
  @@index([createdBy])
  @@map("tinypivot_pages")
}

/// Widget configurations
model TinypivotWidget {
  /// Unique widget identifier (UUID)
  id            String   @id @db.VarChar(36)
  /// Display name for the widget
  name          String   @db.VarChar(255)
  /// Optional description
  description   String?  @db.Text
  /// Data source identifier
  datasourceId  String   @map("datasource_id") @db.VarChar(255)
  /// SQL query or query identifier (JSON)
  query         Json?
  /// Type of visualization
  visualization String   @db.VarChar(50)
  /// Table configuration (JSON)
  tableConfig   Json?    @map("table_config")
  /// Pivot configuration (JSON)
  pivotConfig   Json?    @map("pivot_config")
  /// Chart configuration (JSON)
  chartConfig   Json?    @map("chart_config")
  /// KPI configuration (JSON)
  kpiConfig     Json?    @map("kpi_config")
  /// Active filters applied to the widget (JSON)
  filters       Json?    @default("[]")
  /// Timestamp when the widget was created
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  /// Timestamp when the widget was last updated
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  /// User ID who created the widget
  createdBy     String?  @map("created_by") @db.VarChar(255)

  @@index([datasourceId])
  @@index([createdAt])
  @@map("tinypivot_widgets")
}

/// Page version history
model TinypivotVersion {
  /// Unique version identifier (UUID)
  id                String   @id @db.VarChar(36)
  /// Page ID this version belongs to
  pageId            String   @map("page_id") @db.VarChar(36)
  /// Version number (incremental, 1-based)
  version           Int
  /// Page title at this version
  title             String   @db.VarChar(255)
  /// Page description at this version
  description       String?  @db.Text
  /// Page content blocks at this version (JSON)
  blocks            Json     @default("[]")
  /// Widgets at this version (JSON)
  widgets           Json?    @default("[]")
  /// Theme at this version (JSON)
  theme             Json?
  /// Timestamp when this version was created
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  /// User ID who created this version
  createdBy         String?  @map("created_by") @db.VarChar(255)
  /// Description of changes made in this version
  changeDescription String?  @map("change_description") @db.Text

  // Relations
  page TinypivotPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@unique([pageId, version])
  @@index([pageId])
  @@index([createdAt])
  @@map("tinypivot_versions")
}

/// Share links and settings
model TinypivotShare {
  /// Unique share identifier (UUID)
  id                 String    @id @db.VarChar(36)
  /// Page ID being shared
  pageId             String    @map("page_id") @db.VarChar(36)
  /// Unique share token (used in URL)
  token              String    @unique @db.VarChar(64)
  /// Share settings (JSON)
  settings           Json
  /// Number of times this share has been viewed
  viewCount          Int       @default(0) @map("view_count")
  /// Timestamp when the share was created
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz
  /// Timestamp when the share was last accessed
  lastAccessedAt     DateTime? @map("last_accessed_at") @db.Timestamptz
  /// User ID who created the share
  createdBy          String?   @map("created_by") @db.VarChar(255)
  /// Whether the share is currently active
  active             Boolean   @default(true)
  /// Reason for deactivation (if applicable)
  deactivationReason String?   @map("deactivation_reason") @db.VarChar(50)

  // Relations
  page TinypivotPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId])
  @@index([token])
  @@index([active])
  @@map("tinypivot_shares")
}
`

/**
 * SQL migration script for creating TinyPivot tables
 * This can be used directly with raw SQL if not using Prisma/Drizzle migrations
 */
export const SQL_MIGRATION = `
-- TinyPivot Storage Tables
-- Generated from @smallwebco/tinypivot-storage-postgres

-- Pages table
CREATE TABLE IF NOT EXISTS tinypivot_pages (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  slug VARCHAR(255) NOT NULL UNIQUE,
  template VARCHAR(50),
  theme JSONB,
  blocks JSONB NOT NULL DEFAULT '[]',
  widgets JSONB DEFAULT '[]',
  filters JSONB DEFAULT '[]',
  field_links JSONB DEFAULT '[]',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS tinypivot_pages_slug_idx ON tinypivot_pages(slug);
CREATE INDEX IF NOT EXISTS tinypivot_pages_created_at_idx ON tinypivot_pages(created_at);
CREATE INDEX IF NOT EXISTS tinypivot_pages_updated_at_idx ON tinypivot_pages(updated_at);
CREATE INDEX IF NOT EXISTS tinypivot_pages_published_idx ON tinypivot_pages(published);
CREATE INDEX IF NOT EXISTS tinypivot_pages_archived_idx ON tinypivot_pages(archived);
CREATE INDEX IF NOT EXISTS tinypivot_pages_created_by_idx ON tinypivot_pages(created_by);

-- Widgets table
CREATE TABLE IF NOT EXISTS tinypivot_widgets (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  datasource_id VARCHAR(255) NOT NULL,
  query JSONB,
  visualization VARCHAR(50) NOT NULL,
  table_config JSONB,
  pivot_config JSONB,
  chart_config JSONB,
  kpi_config JSONB,
  filters JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS tinypivot_widgets_datasource_idx ON tinypivot_widgets(datasource_id);
CREATE INDEX IF NOT EXISTS tinypivot_widgets_created_at_idx ON tinypivot_widgets(created_at);

-- Versions table
CREATE TABLE IF NOT EXISTS tinypivot_versions (
  id VARCHAR(36) PRIMARY KEY,
  page_id VARCHAR(36) NOT NULL REFERENCES tinypivot_pages(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  blocks JSONB NOT NULL DEFAULT '[]',
  widgets JSONB DEFAULT '[]',
  theme JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  change_description TEXT,
  UNIQUE(page_id, version)
);

CREATE INDEX IF NOT EXISTS tinypivot_versions_page_id_idx ON tinypivot_versions(page_id);
CREATE INDEX IF NOT EXISTS tinypivot_versions_created_at_idx ON tinypivot_versions(created_at);

-- Shares table
CREATE TABLE IF NOT EXISTS tinypivot_shares (
  id VARCHAR(36) PRIMARY KEY,
  page_id VARCHAR(36) NOT NULL REFERENCES tinypivot_pages(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  settings JSONB NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivation_reason VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS tinypivot_shares_page_id_idx ON tinypivot_shares(page_id);
CREATE INDEX IF NOT EXISTS tinypivot_shares_token_idx ON tinypivot_shares(token);
CREATE INDEX IF NOT EXISTS tinypivot_shares_active_idx ON tinypivot_shares(active);
`
