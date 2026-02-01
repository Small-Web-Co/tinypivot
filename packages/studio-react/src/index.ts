/**
 * TinyPivot Studio React
 * React components for building data studio applications with saved views and dashboards
 *
 * @packageDocumentation
 */

// Context and provider
export { StudioProvider, useStudioContext } from './context'

export type { StudioConfig, StudioContextValue, StudioProviderProps } from './context'

// Placeholder exports - components will be implemented in subsequent tasks
export const STUDIO_REACT_VERSION = '1.0.64'

// Hooks
export { useStudio } from './hooks'
// Re-export core studio types
export type {
  ColumnInfo,
  Dashboard,
  DashboardLayout,
  DashboardWidget,
  DatasourceAdapter,
  DatasourceConfig,
  QueryResult,
  SavedView,
  StorageAdapter,
  TableInfo,
  WidgetPosition,
  WidgetSize,
} from '@smallwebco/tinypivot-studio'

export {
  createEmptyDashboard,
  createEmptyView,
  generateId,
} from '@smallwebco/tinypivot-studio'

// Components will be added here
// export { TinyPivotStudio } from './components/TinyPivotStudio'
// export { ViewEditor } from './components/ViewEditor'
// export { DashboardEditor } from './components/DashboardEditor'
