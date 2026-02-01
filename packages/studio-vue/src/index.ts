/**
 * TinyPivot Studio Vue
 * Vue 3 components for building data studio applications with saved views and dashboards
 *
 * @packageDocumentation
 */

// Composables
export * from './composables'

// Re-export useful types from core
export type {
  DatasourceConfig,
  Page,
  StorageAdapter,
  WidgetConfig,
} from '@smallwebco/tinypivot-studio'

// Re-export utility functions from core
export {
  createEmptyDashboard,
  createEmptyView,
  generateId,
} from '@smallwebco/tinypivot-studio'

// Package version
export const STUDIO_VUE_VERSION = '1.0.64'

// Components will be added here
// export { TinyPivotStudio } from './components/TinyPivotStudio.vue'
// export { ViewEditor } from './components/ViewEditor.vue'
// export { DashboardEditor } from './components/DashboardEditor.vue'
