/**
 * Vue Pivot Grid
 * A powerful Excel-like data grid and pivot table component for Vue 3
 *
 * @packageDocumentation
 */

// Components
export { DataGrid, ColumnFilter, PivotConfig, PivotSkeleton } from './components'

// Composables
export {
  useExcelGrid,
  usePivotTable,
  useLicense,
  setLicenseKey,
  generateLicenseKey,
  enableDemoMode,
  getColumnUniqueValues,
  formatCellValue,
  getAggregationLabel,
} from './composables'

// Types
export type {
  // Grid Types
  ColumnStats,
  GridOptions,
  DataGridProps,

  // Pivot Types
  AggregationFunction,
  PivotField,
  PivotValueField,
  PivotConfig as PivotConfigType,
  PivotCell,
  PivotResult,
  PivotTableProps,
  FieldStats,

  // License Types
  LicenseType,
  LicenseInfo,

  // Event Types
  FilterEvent,
  SortEvent,
  CellClickEvent,
  SelectionChangeEvent,
} from './types'

// Styles - import in your app: import 'vue-pivot-grid/style.css'
import './style.css'

