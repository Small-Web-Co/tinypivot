/**
 * TinyPivot React
 * A powerful Excel-like data grid and pivot table component for React
 *
 * @packageDocumentation
 */

// Components
export { ColumnFilter, DataGrid, PivotConfig, PivotSkeleton } from './components'

// Hooks
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
} from './hooks'

// Re-export types from core
export type {
  // Pivot Types
  AggregationFunction,
  CellClickEvent,

  // Grid Types
  ColumnStats,
  CopyEvent,
  // Component Props Types
  DataGridProps,
  ExportEvent,
  ExportOptions,
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
  PivotResult,
  PivotTableProps,
  PivotValueField,
  RowSelectionChangeEvent,

  SelectionBounds,
  SelectionChangeEvent,
  SortEvent,
} from '@smallwebco/tinypivot-core'
