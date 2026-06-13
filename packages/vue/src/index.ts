/**
 * TinyPivot Vue
 * A powerful Excel-like data grid and pivot table component for Vue 3
 *
 * @packageDocumentation
 */

// Components
// Styles - import in your app: import '@tinypivot/vue/style.css'
import './style.css'

export { ColumnFilter, DataGrid, PivotConfig, PivotSkeleton } from './components'

// Composables
export {
  configureLicenseSecret,
  copyToClipboard,
  enableDemoMode,
  exportPivotToCSV,
  exportToCSV,
  formatCellValue,
  formatSelectionForClipboard,
  getAggregationLabel,
  getColumnUniqueValues,
  setLicenseKey,
  useColumnResize,
  useExcelGrid,
  useGlobalSearch,
  useLicense,
  usePagination,
  usePivotTable,
  useRowSelection,
} from './composables'

// Re-export types from core
export type {
  // Pivot Types
  AggregationFunction,
  // AI Data Analyst Types
  AIAnalystConfig,
  CellClickEvent,

  // Grid Types
  ColumnStats,
  CopyEvent,
  // Component Props Types
  DataGridProps,
  // Drill-through types
  DrillThroughDescriptor,
  DrillThroughResult,
  ExportEvent,
  ExportOptions,
  FieldRoleOverrides,
  FieldStats,
  // Event Types
  FilterEvent,

  GridOptions,
  LicenseInfo,

  // License Types
  LicenseType,
  // Feature Types
  PaginationOptions,

  PivotCell,
  PivotConfig as PivotConfigType,
  PivotField,
  PivotGroupStart,
  PivotResult,
  PivotRowMeta,
  PivotTableProps,
  PivotValueField,
  RowSelectionChangeEvent,

  SelectionBounds,
  SelectionChangeEvent,
  SortEvent,
} from '@smallwebco/tinypivot-core'
