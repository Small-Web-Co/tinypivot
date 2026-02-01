/**
 * Widget Types for TinyPivot Studio
 * Defines the configuration and structure for data visualization widgets
 */

import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'

/**
 * Types of visualizations a widget can display
 */
export type WidgetVisualization = 'table' | 'pivot' | 'chart' | 'kpi'

/**
 * Configuration for table visualization
 */
export interface TableConfig {
  /** Columns to display (empty means all) */
  columns?: string[]
  /** Column to sort by */
  sortColumn?: string
  /** Sort direction */
  sortDirection?: 'asc' | 'desc'
  /** Enable row selection */
  enableRowSelection?: boolean
  /** Rows per page */
  pageSize?: number
  /** Enable filtering */
  enableFiltering?: boolean
  /** Enable search */
  enableSearch?: boolean
  /** Row height in pixels */
  rowHeight?: number
  /** Font size */
  fontSize?: 'xs' | 'sm' | 'base'
  /** Show striped rows */
  stripedRows?: boolean
}

/**
 * Configuration for KPI (Key Performance Indicator) widget
 */
export interface KPIConfig {
  /** Field to aggregate for the main value */
  valueField: string
  /** Aggregation function to apply */
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'countDistinct'
  /** Label displayed above the value */
  label: string
  /** Value format */
  format?: 'number' | 'currency' | 'percent'
  /** Number of decimal places */
  decimals?: number
  /** Currency code for currency format */
  currencyCode?: string
  /** Prefix to display before value */
  prefix?: string
  /** Suffix to display after value */
  suffix?: string
  /** Field to compare against (for trend indicator) */
  comparisonField?: string
  /** Comparison aggregation */
  comparisonAggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max'
  /** Whether an increase is positive (green) or negative (red) */
  increaseIsPositive?: boolean
  /** Icon name to display */
  icon?: string
  /** Color theme */
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

/**
 * Complete widget configuration
 * A widget represents a single data visualization unit that can be placed on a page
 */
export interface WidgetConfig {
  /** Unique widget identifier */
  id: string
  /** Display name for the widget */
  name: string
  /** Optional description */
  description?: string
  /** Data source identifier this widget queries */
  datasourceId: string
  /** SQL query or query identifier */
  query?: string
  /** Type of visualization */
  visualization: WidgetVisualization
  /** Table configuration (when visualization is 'table') */
  tableConfig?: TableConfig
  /** Pivot configuration (when visualization is 'pivot') */
  pivotConfig?: PivotConfig
  /** Chart configuration (when visualization is 'chart') */
  chartConfig?: ChartConfig
  /** KPI configuration (when visualization is 'kpi') */
  kpiConfig?: KPIConfig
  /** Active filters applied to the widget data */
  filters?: WidgetFilter[]
  /** Timestamp when the widget was created */
  createdAt: Date
  /** Timestamp when the widget was last updated */
  updatedAt: Date
  /** User ID who created the widget */
  createdBy?: string
}

/**
 * Filter applied to widget data
 */
export interface WidgetFilter {
  /** Field to filter on */
  field: string
  /** Filter operator */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains' | 'startsWith' | 'endsWith' | 'isNull' | 'isNotNull'
  /** Filter value(s) */
  value: unknown
}

/**
 * Input for creating a new widget
 */
export interface WidgetCreateInput {
  /** Display name for the widget */
  name: string
  /** Optional description */
  description?: string
  /** Data source identifier */
  datasourceId: string
  /** SQL query or query identifier */
  query?: string
  /** Type of visualization */
  visualization: WidgetVisualization
  /** Table configuration */
  tableConfig?: TableConfig
  /** Pivot configuration */
  pivotConfig?: PivotConfig
  /** Chart configuration */
  chartConfig?: ChartConfig
  /** KPI configuration */
  kpiConfig?: KPIConfig
  /** User ID who created the widget */
  createdBy?: string
}

/**
 * Input for updating an existing widget
 */
export interface WidgetUpdateInput {
  /** Display name for the widget */
  name?: string
  /** Optional description */
  description?: string
  /** SQL query or query identifier */
  query?: string
  /** Type of visualization */
  visualization?: WidgetVisualization
  /** Table configuration */
  tableConfig?: TableConfig
  /** Pivot configuration */
  pivotConfig?: PivotConfig
  /** Chart configuration */
  chartConfig?: ChartConfig
  /** KPI configuration */
  kpiConfig?: KPIConfig
  /** Active filters */
  filters?: WidgetFilter[]
}
