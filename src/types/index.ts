/**
 * TinyPivot - Type Definitions
 */

// Grid Types
export interface ColumnStats {
  uniqueValues: string[]
  totalCount: number
  nullCount: number
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed'
}

export interface GridOptions<T = Record<string, unknown>> {
  data: T[]
  columns?: string[]
  enableSorting?: boolean
  enableFiltering?: boolean
  pageSize?: number
}

// Pivot Table Types
export type AggregationFunction = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'countDistinct' | 'median' | 'stdDev' | 'percentOfTotal' | 'custom'

export interface PivotField {
  field: string
  label?: string
}

/**
 * Custom aggregation function signature
 */
export type CustomAggregationFn = (
  values: number[],
  allFieldValues?: Record<string, number[]>
) => number | null

export interface PivotValueField extends PivotField {
  aggregation: AggregationFunction
  customFn?: CustomAggregationFn
  customLabel?: string
  customSymbol?: string
}

/**
 * Calculated field that computes values from other aggregated fields
 */
export interface CalculatedField {
  id: string
  name: string
  formula: string
  formatAs?: 'number' | 'percent' | 'currency'
  decimals?: number
}

export interface PivotConfig {
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
  calculatedFields?: CalculatedField[]
}

export interface PivotCell {
  value: number | null
  count: number
  formattedValue: string
}

export interface PivotResult {
  headers: string[][]
  rowHeaders: string[][]
  data: PivotCell[][]
  rowTotals: PivotCell[]
  columnTotals: PivotCell[]
  grandTotal: PivotCell
}

export interface FieldStats {
  field: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed'
  uniqueCount: number
  isNumeric: boolean
}

// Component Props Types
export interface DataGridProps {
  data: Record<string, unknown>[]
  loading?: boolean
  rowHeight?: number
  headerHeight?: number
  fontSize?: 'xs' | 'sm' | 'base'
  licenseKey?: string
  // Feature toggles
  showPivot?: boolean
  enableExport?: boolean
  enableSearch?: boolean
  enablePagination?: boolean
  pageSize?: number
  enableRowSelection?: boolean
  enableColumnResize?: boolean
  enableClipboard?: boolean
  theme?: 'light' | 'dark' | 'auto'
  stripedRows?: boolean
  exportFilename?: string
  // Vertical resize
  enableVerticalResize?: boolean
  initialHeight?: number
  minHeight?: number
  maxHeight?: number
}

export interface PivotTableProps {
  result: PivotResult
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
  fontSize?: 'xs' | 'sm' | 'base'
}

// License Types
export type LicenseType = 'free' | 'pro-single' | 'pro-unlimited' | 'pro-team'

export interface LicenseInfo {
  type: LicenseType
  isValid: boolean
  expiresAt?: Date
  features: {
    pivot: boolean
    advancedAggregations: boolean
    percentageMode: boolean
    sessionPersistence: boolean
    noWatermark: boolean
  }
}

// Event Types
export interface FilterEvent {
  columnId: string
  values: string[]
}

export interface SortEvent {
  columnId: string
  direction: 'asc' | 'desc' | null
}

export interface CellClickEvent {
  rowIndex: number
  colIndex: number
  value: unknown
  rowData: Record<string, unknown>
}

export interface SelectionChangeEvent {
  cells: Array<{ row: number, col: number }>
  values: unknown[]
}

export interface RowSelectionChangeEvent {
  selectedIndices: number[]
  selectedRows: Record<string, unknown>[]
}

export interface ExportEvent {
  rowCount: number
  filename: string
}

export interface CopyEvent {
  text: string
  cellCount: number
}

// Feature composables types
export interface PaginationOptions {
  pageSize?: number
  currentPage?: number
}

export interface ExportOptions {
  filename?: string
  includeHeaders?: boolean
  delimiter?: string
}
