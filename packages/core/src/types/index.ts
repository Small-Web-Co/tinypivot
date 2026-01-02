/**
 * TinyPivot Core - Type Definitions
 * Framework-agnostic types used across Vue and React packages
 */

// Grid Types
export interface NumericRange {
  min: number | null
  max: number | null
}

export interface ColumnStats {
  uniqueValues: string[]
  totalCount: number
  nullCount: number
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed'
  /** Min value for numeric columns */
  numericMin?: number
  /** Max value for numeric columns */
  numericMax?: number
}

/** Filter value can be either selected values or numeric range */
export type ColumnFilterValue = string[] | NumericRange

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
 * @param values - Array of numeric values to aggregate
 * @param allFieldValues - Optional: all values across fields for cross-field calculations
 * @returns Aggregated value or null
 */
export type CustomAggregationFn = (
  values: number[],
  allFieldValues?: Record<string, number[]>
) => number | null

export interface PivotValueField extends PivotField {
  aggregation: AggregationFunction
  /** Custom aggregation function (required when aggregation is 'custom') */
  customFn?: CustomAggregationFn
  /** Custom label for the aggregation (used with 'custom' aggregation) */
  customLabel?: string
  /** Custom symbol for the aggregation (used with 'custom' aggregation) */
  customSymbol?: string
}

/**
 * Calculated field that computes values from other aggregated fields
 * Supports formulas like "SUM(Revenue) / SUM(Units)"
 */
export interface CalculatedField {
  /** Unique identifier for the calculated field */
  id: string
  /** Display name for the calculated field */
  name: string
  /** Formula expression (e.g., "SUM(revenue) / SUM(units) * 100") */
  formula: string
  /** How to format the result */
  formatAs?: 'number' | 'percent' | 'currency'
  /** Number of decimal places */
  decimals?: number
}

export interface PivotConfig {
  rowFields: string[]
  columnFields: string[]
  valueFields: PivotValueField[]
  showRowTotals: boolean
  showColumnTotals: boolean
  /** Calculated fields that derive values from other aggregations */
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

export interface LicenseFeatures {
  pivot: boolean
  advancedAggregations: boolean
  percentageMode: boolean
  sessionPersistence: boolean
  noWatermark: boolean
  /** Chart builder feature (Pro only) */
  charts: boolean
}

export interface LicenseInfo {
  type: LicenseType
  isValid: boolean
  expiresAt?: Date
  features: LicenseFeatures
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

// Feature options types
export interface PaginationOptions {
  pageSize?: number
  currentPage?: number
}

export interface ExportOptions {
  filename?: string
  includeHeaders?: boolean
  delimiter?: string
}

export interface SelectionBounds {
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

// Filter state
export interface ColumnFilter {
  id: string
  value: ColumnFilterValue
}

export interface ActiveFilter {
  column: string
  values: string[]
  /** Numeric range filter (only for numeric columns) */
  numericRange?: NumericRange
}

/** Type guard to check if filter value is a numeric range */
export function isNumericRange(value: ColumnFilterValue): value is NumericRange {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && ('min' in value || 'max' in value)
}

// Chart Types
export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'bubble'
  | 'heatmap'
  | 'radar'

export type ChartAggregation = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'countDistinct'

/** Field classification for chart building */
export type FieldRole = 'dimension' | 'measure' | 'temporal'

/** A field configured for chart use */
export interface ChartField {
  field: string
  label?: string
  role: FieldRole
  /** Aggregation to apply (for measures) */
  aggregation?: ChartAggregation
}

/** Chart configuration built via drag and drop */
export interface ChartConfig {
  /** Chart type to render */
  type: ChartType
  /** Field for X-axis (category/dimension) */
  xAxis?: ChartField
  /** Field for Y-axis (measure/value) */
  yAxis?: ChartField
  /** Field for series/grouping (creates multiple series) */
  seriesField?: ChartField
  /** Field for bubble size (scatter/bubble charts) */
  sizeField?: ChartField
  /** Field for color encoding */
  colorField?: ChartField
  /** Additional configuration options */
  options?: ChartOptions
}

/** Visual and display options for charts */
export interface ChartOptions {
  /** Show data labels on chart */
  showDataLabels?: boolean
  /** Show legend */
  showLegend?: boolean
  /** Legend position */
  legendPosition?: 'top' | 'bottom' | 'left' | 'right'
  /** Enable chart animations */
  animated?: boolean
  /** Custom color palette */
  colors?: string[]
  /** Chart title */
  title?: string
  /** X-axis title */
  xAxisTitle?: string
  /** Y-axis title */
  yAxisTitle?: string
  /** Stacking mode for bar/area charts */
  stacked?: boolean
  /** Show grid lines */
  showGrid?: boolean
  /** Enable zoom */
  enableZoom?: boolean
  /** Number format for values */
  valueFormat?: 'number' | 'percent' | 'currency'
  /** Decimal places for values */
  decimals?: number
}

/** Information about a field for chart building */
export interface ChartFieldInfo {
  field: string
  label: string
  role: FieldRole
  /** Data type detected from values */
  dataType: 'string' | 'number' | 'date' | 'boolean'
  /** Number of unique values (useful for dimension suitability) */
  uniqueCount: number
  /** Sample values for preview */
  sampleValues: unknown[]
  /** Min value (for numeric fields) */
  min?: number
  /** Max value (for numeric fields) */
  max?: number
}

/** Chart type metadata for UI */
export interface ChartTypeInfo {
  type: ChartType
  label: string
  icon: string
  description: string
  /** Required field roles */
  requiredFields: FieldRole[]
  /** Optional field roles */
  optionalFields: FieldRole[]
  /** Guidance text for building this chart */
  guidance: string
  /** Best suited for this type of analysis */
  bestFor: string[]
}

/** Pre-processed data ready for chart rendering */
export interface ChartData {
  /** Category labels (x-axis values) */
  categories: string[]
  /** Data series */
  series: ChartSeries[]
}

/** A single data series for charts */
export interface ChartSeries {
  name: string
  data: number[]
  /** For bubble charts: additional data dimensions */
  extra?: Record<string, unknown>[]
}
