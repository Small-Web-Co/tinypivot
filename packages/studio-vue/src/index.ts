/**
 * TinyPivot Studio Vue
 * Vue 3 components for building data studio applications with saved views and dashboards
 *
 * @packageDocumentation
 */

// Re-export core studio types
export type {
  ColumnInfo,
  Dashboard,
  DashboardLayout,
  DashboardWidget,
  DatasourceAdapter,
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

// Placeholder exports - components will be implemented in subsequent tasks
export const STUDIO_VUE_VERSION = '1.0.64'

// Composables will be added here
// export { useStudio } from './composables/useStudio'

// Components will be added here
// export { TinyPivotStudio } from './components/TinyPivotStudio.vue'
// export { ViewEditor } from './components/ViewEditor.vue'
// export { DashboardEditor } from './components/DashboardEditor.vue'
