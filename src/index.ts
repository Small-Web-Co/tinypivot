/**
 * TinyPivot
 * A powerful Excel-like data grid and pivot table component for Vue 3
 *
 * @packageDocumentation
 */

// Components
// Styles - import in your app: import 'tinypivot/style.css'
import './style.css'

export { ColumnFilter, DataGrid, PivotConfig, PivotSkeleton } from './components'

// Composables
export {
  configureLicenseSecret,
  enableDemoMode,
  formatCellValue,
  getAggregationLabel,
  getColumnUniqueValues,
  setLicenseKey,
  useExcelGrid,
  useLicense,
  usePivotTable,
} from './composables'

// Types
export type {
  // Pivot Types
  AggregationFunction,
  CellClickEvent,
  // Grid Types
  ColumnStats,

  DataGridProps,
  FieldStats,
  // Event Types
  FilterEvent,
  GridOptions,
  LicenseInfo,
  // License Types
  LicenseType,
  PivotCell,
  PivotConfig as PivotConfigType,

  PivotField,
  PivotResult,

  PivotTableProps,
  PivotValueField,
  SelectionChangeEvent,
  SortEvent,
} from './types'
