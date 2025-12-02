/**
 * TinyPivot React
 * A powerful Excel-like data grid and pivot table component for React
 *
 * @packageDocumentation
 */

// Components
export { DataGrid, ColumnFilter, PivotConfig, PivotSkeleton } from './components'

// Hooks
export {
  useExcelGrid,
  usePivotTable,
  useLicense,
  setLicenseKey,
  configureLicenseSecret,
  enableDemoMode,
  getColumnUniqueValues,
  formatCellValue,
  getAggregationLabel,
  exportToCSV,
  exportPivotToCSV,
  copyToClipboard,
  formatSelectionForClipboard,
  usePagination,
  useGlobalSearch,
  useRowSelection,
  useColumnResize,
} from './hooks'

// Re-export types from core
export type {
  // Grid Types
  ColumnStats,
  GridOptions,

  // Pivot Types
  AggregationFunction,
  PivotField,
  PivotValueField,
  PivotConfig as PivotConfigType,
  PivotCell,
  PivotResult,
  FieldStats,

  // Component Props Types
  DataGridProps,
  PivotTableProps,

  // License Types
  LicenseType,
  LicenseInfo,

  // Event Types
  FilterEvent,
  SortEvent,
  CellClickEvent,
  SelectionChangeEvent,
  RowSelectionChangeEvent,
  ExportEvent,
  CopyEvent,

  // Feature Types
  PaginationOptions,
  ExportOptions,
  SelectionBounds,
} from '@smallwebco/tinypivot-core'

