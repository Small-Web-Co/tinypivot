/**
 * TinyPivot Core
 * Framework-agnostic core logic for pivot tables and data grids
 *
 * @packageDocumentation
 */

// Types
export type {
  // Grid Types
  ColumnStats,
  GridOptions,

  // Pivot Types
  AggregationFunction,
  PivotField,
  PivotValueField,
  PivotConfig,
  PivotCell,
  PivotResult,
  FieldStats,

  // Component Props Types
  DataGridProps,
  PivotTableProps,

  // License Types
  LicenseType,
  LicenseInfo,
  LicenseFeatures,

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
  ColumnFilter,
  ActiveFilter,
} from './types'

// Utility Functions
export {
  detectColumnType,
  detectFieldType,
  getColumnUniqueValues,
  formatCellValue,
  formatNumber,
  makeKey,
  parseKey,
  naturalSort,
  debounce,
  clamp,
} from './utils'

// Pivot Table Logic
export {
  aggregate,
  formatAggregatedValue,
  getAggregationLabel,
  getAggregationSymbol,
  AGGREGATION_OPTIONS,
  computeAvailableFields,
  getUnassignedFields,
  isPivotConfigured,
  computePivotResult,
  generateStorageKey,
  savePivotConfig,
  loadPivotConfig,
  isConfigValidForFields,
} from './pivot'

// License Management
export {
  validateLicenseKey,
  configureLicenseSecret,
  getDemoLicenseInfo,
  getFreeLicenseInfo,
  canUsePivot,
  isPro,
  shouldShowWatermark,
  logProRequired,
} from './license'

// Export Utilities
export {
  exportToCSV,
  exportPivotToCSV,
  copyToClipboard,
  formatSelectionForClipboard,
} from './export'
export type { PivotExportData } from './export'

