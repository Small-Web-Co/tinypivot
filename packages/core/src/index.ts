/**
 * TinyPivot Core
 * Framework-agnostic core logic for pivot tables and data grids
 *
 * @packageDocumentation
 */

// Export Utilities
export {
  copyToClipboard,
  exportPivotToCSV,
  exportToCSV,
  formatSelectionForClipboard,
} from './export'

export type { PivotExportData } from './export'

// License Management
export {
  canUsePivot,
  configureLicenseSecret,
  getDemoLicenseInfo,
  getFreeLicenseInfo,
  isPro,
  logProRequired,
  shouldShowWatermark,
  validateLicenseKey,
} from './license'

// Pivot Table Logic
export {
  addCalculatedField,
  aggregate,
  AGGREGATION_OPTIONS,
  CALCULATED_FIELD_PRESETS,
  computeAvailableFields,
  computePivotResult,
  evaluateFormula,
  evaluateSimpleFormula,
  formatAggregatedValue,
  formatCalculatedValue,
  // Calculated Fields & Formulas
  FORMULA_FUNCTIONS,
  generateStorageKey,
  getAggregationLabel,
  getAggregationSymbol,
  getUnassignedFields,
  isConfigValidForFields,
  isPivotConfigured,
  loadCalculatedFields,
  loadPivotConfig,
  parseFormula,
  // Simple Formula (field-level calculations)
  parseSimpleFormula,
  removeCalculatedField,
  // Calculated Fields Storage
  saveCalculatedFields,
  savePivotConfig,
  validateFormula,
  validateSimpleFormula,
} from './pivot'
export type { FormulaFunction } from './pivot'

// Types
export type {
  ActiveFilter,
  // Pivot Types
  AggregationFunction,
  CalculatedField,
  CellClickEvent,

  ColumnFilter,
  ColumnFilterValue,
  // Grid Types
  ColumnStats,
  CopyEvent,
  CustomAggregationFn,
  // Component Props Types
  DataGridProps,
  ExportEvent,
  ExportOptions,
  FieldStats,

  // Event Types
  FilterEvent,
  GridOptions,

  LicenseFeatures,
  LicenseInfo,
  // License Types
  LicenseType,

  NumericRange,
  // Feature Types
  PaginationOptions,
  PivotCell,
  PivotConfig,
  PivotField,
  PivotResult,
  PivotTableProps,

  PivotValueField,
  RowSelectionChangeEvent,
  SelectionBounds,
  SelectionChangeEvent,
  SortEvent,
} from './types'

// Type Guards
export { isNumericRange } from './types'
// Utility Functions
export {
  clamp,
  debounce,
  detectColumnType,
  detectFieldType,
  formatCellValue,
  formatNumber,
  getColumnUniqueValues,
  makeKey,
  naturalSort,
  parseKey,
} from './utils'
