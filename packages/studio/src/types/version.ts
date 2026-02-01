/**
 * Version Types for TinyPivot Studio
 * Defines types for page version history and change tracking
 */

import type { Block } from './block'
import type { ThemeConfig } from './theme'
import type { WidgetConfig } from './widget'

/**
 * Maximum number of versions to keep per page
 * Older versions will be pruned when this limit is reached
 */
export const MAX_VERSIONS_PER_PAGE = 20

/**
 * A version of a page (snapshot in time)
 */
export interface PageVersion {
  /** Unique version identifier */
  id: string
  /** Page ID this version belongs to */
  pageId: string
  /** Version number (incremental, 1-based) */
  version: number
  /** Page title at this version */
  title: string
  /** Page description at this version */
  description?: string
  /** Page content blocks at this version */
  blocks: Block[]
  /** Widgets at this version */
  widgets?: WidgetConfig[]
  /** Theme at this version */
  theme?: ThemeConfig
  /** Timestamp when this version was created */
  createdAt: Date
  /** User ID who created this version */
  createdBy?: string
  /** Description of changes made in this version */
  changeDescription?: string
  /** Size of the version data in bytes (for quota tracking) */
  sizeBytes?: number
  /** Hash of the content (for comparison) */
  contentHash?: string
}

/**
 * Summary of a version (for list views without full content)
 */
export interface PageVersionSummary {
  /** Unique version identifier */
  id: string
  /** Page ID this version belongs to */
  pageId: string
  /** Version number */
  version: number
  /** Page title at this version */
  title: string
  /** Timestamp when this version was created */
  createdAt: Date
  /** User ID who created this version */
  createdBy?: string
  /** Description of changes */
  changeDescription?: string
  /** Number of blocks in this version */
  blockCount: number
  /** Number of widgets in this version */
  widgetCount: number
}

/**
 * Diff between two versions
 */
export interface VersionDiff {
  /** ID of the older version */
  fromVersionId: string
  /** ID of the newer version */
  toVersionId: string
  /** Changes to the title */
  titleChanged: boolean
  /** Changes to the description */
  descriptionChanged: boolean
  /** Block IDs that were added */
  blocksAdded: string[]
  /** Block IDs that were removed */
  blocksRemoved: string[]
  /** Block IDs that were modified */
  blocksModified: string[]
  /** Widget IDs that were added */
  widgetsAdded: string[]
  /** Widget IDs that were removed */
  widgetsRemoved: string[]
  /** Widget IDs that were modified */
  widgetsModified: string[]
  /** Whether the theme changed */
  themeChanged: boolean
}

/**
 * Options for creating a new version
 */
export interface CreateVersionOptions {
  /** Description of changes made */
  changeDescription?: string
  /** User ID who created this version */
  createdBy?: string
  /** Force creation even if no changes detected */
  force?: boolean
}

/**
 * Options for restoring a version
 */
export interface RestoreVersionOptions {
  /** User ID performing the restore */
  restoredBy?: string
  /** Create a new version before restoring (backup current state) */
  backupCurrent?: boolean
  /** Description for the backup version if created */
  backupDescription?: string
}

/**
 * Calculate content hash for a page version
 * Used to detect if content has actually changed
 */
export function calculateContentHash(blocks: Block[], widgets?: WidgetConfig[]): string {
  const content = JSON.stringify({ blocks, widgets })
  // Simple hash - in production you might want to use a proper hash function
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Estimate the size of a version in bytes
 */
export function estimateVersionSize(version: Partial<PageVersion>): number {
  return new Blob([JSON.stringify(version)]).size
}
