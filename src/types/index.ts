/**
 * Vue Pivot Grid - Type Definitions
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
export type AggregationFunction = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'countDistinct'

export interface PivotField {
  field: string
  label?: string
}

export interface PivotValueField extends PivotField {
  aggregation: AggregationFunction
}

export interface PivotConfig {
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
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

