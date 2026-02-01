/**
 * TinyPivot Studio
 * Core logic for building data studio applications with saved views, dashboards, and collaborative analytics
 *
 * @packageDocumentation
 */

// Export editor configuration
export * from './editor'

// Export all types from the types directory
export * from './types'

// Export all utilities from the utils directory
export * from './utils'

/**
 * CSS Styles
 *
 * Import the CSS file in your application to style the Studio components:
 *
 * @example
 * ```ts
 * import '@smallwebco/tinypivot-studio/style.css'
 * ```
 *
 * The styles use the `tps-` prefix (TinyPivot Studio) for all CSS classes.
 * Dark mode is supported via the `.tps-theme-dark` class.
 */

// Re-export core types that are extended by studio
export type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'

// ============================================================================
// Legacy Types (kept for backwards compatibility)
// These will be deprecated in favor of the new types in ./types
// ============================================================================

// Legacy Storage adapter interface - to be implemented by storage packages
export interface LegacyStorageAdapter {
  // Views
  getViews: () => Promise<SavedView[]>
  getView: (id: string) => Promise<SavedView | null>
  saveView: (view: SavedView) => Promise<SavedView>
  deleteView: (id: string) => Promise<void>

  // Dashboards
  getDashboards: () => Promise<Dashboard[]>
  getDashboard: (id: string) => Promise<Dashboard | null>
  saveDashboard: (dashboard: Dashboard) => Promise<Dashboard>
  deleteDashboard: (id: string) => Promise<void>
}

// Legacy Datasource adapter interface - to be implemented by datasource packages
export interface LegacyDatasourceAdapter {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isConnected: () => boolean
  listTables: () => Promise<TableInfo[]>
  getTableSchema: (tableName: string) => Promise<ColumnInfo[]>
  executeQuery: (query: string) => Promise<LegacyQueryResult>
}

// Legacy Core types
export interface SavedView {
  id: string
  name: string
  description?: string
  datasourceId: string
  query?: string
  pivotConfig?: import('@smallwebco/tinypivot-core').PivotConfig
  chartConfig?: import('@smallwebco/tinypivot-core').ChartConfig
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export interface Dashboard {
  id: string
  name: string
  description?: string
  layout: DashboardLayout
  widgets: DashboardWidget[]
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export interface DashboardLayout {
  columns: number
  rows: number
}

export interface DashboardWidget {
  id: string
  viewId: string
  position: WidgetPosition
  size: WidgetSize
}

export interface WidgetPosition {
  x: number
  y: number
}

export interface WidgetSize {
  width: number
  height: number
}

export interface TableInfo {
  name: string
  schema?: string
  type: 'table' | 'view'
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
}

export interface LegacyQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTimeMs: number
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Generate a unique ID for entities
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create an empty SavedView with default values
 * @deprecated Use PageCreateInput instead
 */
export function createEmptyView(datasourceId: string): SavedView {
  const now = new Date()
  return {
    id: generateId(),
    name: 'Untitled View',
    datasourceId,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Create an empty Dashboard with default values
 * @deprecated Use PageCreateInput with dashboard template instead
 */
export function createEmptyDashboard(): Dashboard {
  const now = new Date()
  return {
    id: generateId(),
    name: 'Untitled Dashboard',
    layout: { columns: 12, rows: 6 },
    widgets: [],
    createdAt: now,
    updatedAt: now,
  }
}
