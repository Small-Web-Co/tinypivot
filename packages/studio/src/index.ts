/**
 * TinyPivot Studio
 * Core logic for building data studio applications with saved views, dashboards, and collaborative analytics
 *
 * @packageDocumentation
 */

// Re-export core types that are extended by studio
// Import types from core for re-export
import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'

export type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'

// Storage adapter interface - to be implemented by storage packages
export interface StorageAdapter {
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

// Datasource adapter interface - to be implemented by datasource packages
export interface DatasourceAdapter {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isConnected: () => boolean
  listTables: () => Promise<TableInfo[]>
  getTableSchema: (tableName: string) => Promise<ColumnInfo[]>
  executeQuery: (query: string) => Promise<QueryResult>
}

// Core types
export interface SavedView {
  id: string
  name: string
  description?: string
  datasourceId: string
  query?: string
  pivotConfig?: PivotConfig
  chartConfig?: ChartConfig
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

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTimeMs: number
}

// Utility functions
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

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
