/**
 * TinyPivot React
 * A powerful Excel-like data grid and pivot table component for React
 *
 * @packageDocumentation
 */

// Components
export { AIAnalyst, ColumnFilter, DataGrid, PivotConfig, PivotSkeleton } from './components'

// Hooks
export {
  configureLicenseSecret,
  copyToClipboard,
  enableDemoMode,
  exportPivotToCSV,
  exportPivotToXLSX,
  exportToCSV,
  exportToXLSX,
  formatCellValue,
  formatSelectionForClipboard,
  getAggregationLabel,
  getColumnUniqueValues,
  setLicenseKey,
  useAIAnalyst,
  useColumnResize,
  useExcelGrid,
  useGlobalSearch,
  useLicense,
  usePagination,
  usePivotTable,
  useRowSelection,
} from './hooks'
export type { UseAIAnalystOptions } from './hooks'

// Re-export types from core
export type {
  // Pivot Types
  AggregationFunction,
  // AI Data Analyst Types
  AIAnalystConfig,
  AIColumnSchema,
  AIConversation,
  AIConversationUpdateEvent,
  AIDataLoadedEvent,
  AIDataSource,
  AIErrorEvent,
  AIMessage,
  AIMessageMetadata,
  AIQueryExecutedEvent,

  AITableSchema,
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
  XlsxExportOptions,
} from '@smallwebco/tinypivot-core'
