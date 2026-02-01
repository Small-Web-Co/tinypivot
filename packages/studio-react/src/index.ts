/**
 * TinyPivot Studio React
 * React components for building data studio applications with saved views and dashboards
 *
 * @packageDocumentation
 */

// Components
export { TinyPivotStudio } from './components'
export type { TinyPivotStudioProps } from './components'

// Context and provider
export { StudioProvider, useStudioContext } from './context'
export type { StudioConfig, StudioContextValue, StudioProviderProps } from './context'

// Hooks
export { useStudio } from './hooks'

// Package version
export const STUDIO_REACT_VERSION = '1.0.64'

// Re-export core studio types
export type {
  ColumnInfo,
  Dashboard,
  DashboardLayout,
  DashboardWidget,
  DatasourceAdapter,
  DatasourceConfig,
  Page,
  QueryResult,
  SavedView,
  StorageAdapter,
  TableInfo,
  WidgetConfig,
  WidgetPosition,
  WidgetSize,
} from '@smallwebco/tinypivot-studio'

export {
  createEmptyDashboard,
  createEmptyView,
  generateId,
} from '@smallwebco/tinypivot-studio'
