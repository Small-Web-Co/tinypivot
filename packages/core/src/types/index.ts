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
  /** AI Data Analyst feature (Pro only) */
  aiAnalyst: boolean
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

// ============================================================================
// AI Data Analyst Types
// ============================================================================

/** Supported AI providers */
export type AIProvider = 'anthropic' | 'openai' | 'openrouter'

/** Result from a custom query executor */
export interface QueryExecutorResult {
  /** Query results as an array of records */
  data: Record<string, unknown>[]
  /** Number of rows returned */
  rowCount: number
  /** Whether results were truncated */
  truncated?: boolean
  /** Error message if query failed */
  error?: string
}

/** Custom function to execute SQL queries (e.g., using DuckDB client-side) */
export type QueryExecutor = (sql: string, table: string) => Promise<QueryExecutorResult>

/** Custom function to load data for a data source (called when user selects a source) */
export type DataSourceLoader = (dataSourceId: string) => Promise<{
  data: Record<string, unknown>[]
  schema?: AITableSchema
}>

/**
 * AI Analyst configuration passed to DataGrid
 *
 * ## Server-Side Mode (Recommended)
 *
 * Use a single `endpoint` that handles everything:
 *
 * ```typescript
 * // Frontend
 * <DataGrid
 *   :data="[]"
 *   :ai-analyst="{ endpoint: '/api/tinypivot' }"
 * />
 *
 * // Backend (Next.js App Router)
 * import { createTinyPivotHandler } from '@smallwebco/tinypivot-server'
 * export const POST = createTinyPivotHandler()
 * ```
 *
 * Set `DATABASE_URL` and `AI_API_KEY` in your environment.
 *
 * ## Demo Mode (Client-Side DuckDB)
 *
 * For demos, use `dataSources`, `queryExecutor`, and `dataSourceLoader`.
 * See the TinyPivot demo for an example.
 */
export interface AIAnalystConfig {
  /**
   * Enable the AI Analyst feature (default: true if endpoint is provided)
   */
  enabled?: boolean

  /**
   * TinyPivot API endpoint that handles everything:
   * - Table discovery
   * - Schema introspection
   * - Query execution
   * - AI chat
   *
   * Use with `createTinyPivotHandler` from @smallwebco/tinypivot-server.
   *
   * @example '/api/tinypivot'
   */
  endpoint?: string

  // === DEMO MODE: Client-side DuckDB ===

  /**
   * Available data sources (for demo/client-side mode only)
   * Not needed when using `endpoint` - tables are auto-discovered.
   */
  dataSources?: AIDataSource[]

  /**
   * Custom query executor (for client-side DuckDB demos)
   */
  queryExecutor?: QueryExecutor

  /**
   * Custom data source loader (for client-side DuckDB demos)
   */
  dataSourceLoader?: DataSourceLoader

  /**
   * Enable demo mode with canned responses (no real AI calls)
   */
  demoMode?: boolean

  // === Common options ===

  /**
   * Maximum rows to return from queries
   * @default 10000
   */
  maxRows?: number

  /**
   * Enable infinite scroll for "Full Data" feature
   * When enabled, data is fetched in batches as user scrolls
   * @default true
   */
  enableInfiniteScroll?: boolean

  /**
   * Number of rows to fetch per batch when infinite scroll is enabled
   * @default 1000
   */
  batchSize?: number

  /**
   * Session ID for conversation continuity
   */
  sessionId?: string

  /**
   * Persist conversations to localStorage
   * @default false
   */
  persistToLocalStorage?: boolean

  /**
   * AI model display name to show in the UI
   * Purely cosmetic - doesn't affect which model is used.
   * @example "Claude 3.5 Sonnet"
   */
  aiModelName?: string

  /**
   * AI API key for LLM requests (client-provided)
   *
   * When provided, this key is sent with chat requests and takes precedence
   * over the server's AI_API_KEY environment variable.
   *
   * Auto-detects provider from key format:
   * - `sk-ant-...` → Anthropic (Claude)
   * - `sk-or-...` → OpenRouter
   * - `sk-...` → OpenAI
   *
   * @example "sk-ant-api03-..."
   */
  apiKey?: string

  /**
   * Custom OpenAI-compatible base URL for AI requests.
   * When set, uses OpenAI chat completions format regardless of API key prefix.
   * API key becomes optional (for local LLMs that don't require auth).
   * @example "http://localhost:11434/v1" (Ollama - no key needed)
   * @example "https://my-resource.openai.azure.com/openai/deployments/gpt-4" (Azure)
   */
  aiBaseUrl?: string

  /**
   * AI model to use for chat requests.
   * Overrides server's default model. Optional - endpoint may have a default.
   * @example "llama3", "mistral", "gpt-4-turbo"
   */
  aiModel?: string

  /**
   * Datasource ID to use for queries (for server-managed datasources)
   * When set, the AI Analyst will use this datasource for table discovery and queries.
   * The endpoint must support datasource-aware operations.
   */
  datasourceId?: string

  /**
   * User ID for authenticated datasource operations
   */
  userId?: string

  /**
   * User key for credential decryption (required for user-managed datasources)
   */
  userKey?: string

  /**
   * When true, the component fills its parent container (for studio/embedded contexts).
   * Removes standalone sizing and makes the component adapt to parent dimensions.
   * @default true
   */
  embedded?: boolean
}

/** A database table/data source available for AI queries */
export interface AIDataSource {
  /** Unique identifier for this data source */
  id: string
  /** Database table name */
  table: string
  /** Display name shown in UI */
  name: string
  /** Description to help AI understand the data context */
  description?: string
  /** Column overrides for auto-discovered schema */
  columns?: AIColumnOverride[]
}

/** Override settings for auto-discovered columns */
export interface AIColumnOverride {
  /** Column name in the database */
  name: string
  /** Rich description to help AI understand the column */
  description?: string
  /** Hide this column from AI queries */
  hidden?: boolean
}

/** Schema for a database table (auto-discovered or provided) */
export interface AITableSchema {
  /** Table name */
  table: string
  /** Column definitions */
  columns: AIColumnSchema[]
}

/** Schema for a database column */
export interface AIColumnSchema {
  /** Column name */
  name: string
  /** Data type */
  type: 'string' | 'number' | 'date' | 'boolean' | 'unknown'
  /** Whether column allows null values */
  nullable: boolean
  /** Rich description for AI context */
  description?: string
}

/** A message in the AI conversation */
export interface AIMessage {
  /** Unique message identifier */
  id: string
  /** Message sender role */
  role: 'user' | 'assistant' | 'system'
  /** Message content */
  content: string
  /** Unix timestamp when message was created */
  timestamp: number
  /** Additional metadata about the message */
  metadata?: AIMessageMetadata
}

/** Metadata attached to AI messages */
export interface AIMessageMetadata {
  /** SQL query if this message triggered a database query */
  query?: string
  /** Number of rows returned */
  rowCount?: number
  /** Error message if query failed */
  error?: string
  /** Duration of query execution in ms */
  duration?: number
  /** Data source ID that was queried */
  dataSourceId?: string
  /** Query result data (for displaying in preview) */
  data?: Record<string, unknown>[]
}

/** A conversation session with the AI */
export interface AIConversation {
  /** Unique conversation identifier */
  id: string
  /** Messages in the conversation */
  messages: AIMessage[]
  /** Currently selected data source ID */
  dataSourceId?: string
  /** Unix timestamp when conversation was created */
  createdAt: number
  /** Unix timestamp when conversation was last updated */
  updatedAt: number
}

// ============================================================================
// AI Analyst API Contracts (for server package and custom implementations)
// ============================================================================

/** Request to execute a SQL query */
export interface QueryRequest {
  /** SQL query to execute (SELECT only) */
  sql: string
  /** Table name (for validation against whitelist) */
  table: string
  /** Parameterized values for the query */
  params?: unknown[]
}

/** Response from a SQL query execution */
export interface QueryResponse {
  /** Whether the query succeeded */
  success: boolean
  /** Query result data */
  data?: Record<string, unknown>[]
  /** Number of rows returned */
  rowCount?: number
  /** Error message if query failed */
  error?: string
  /** Whether results were truncated due to maxRows limit */
  truncated?: boolean
  /** Query execution time in ms */
  duration?: number
}

/** Response from a paginated SQL query execution */
export interface PaginatedQueryResponse {
  /** Whether the query succeeded */
  success: boolean
  /** Query result data */
  data: Record<string, unknown>[]
  /** Number of rows returned in this batch */
  rowCount: number
  /** Offset used for this query */
  offset: number
  /** Limit used for this query */
  limit: number
  /** Whether there are more rows to fetch */
  hasMore: boolean
  /** Query execution time in ms */
  duration?: number
  /** Error message if query failed */
  error?: string
}

/** Request to the AI proxy endpoint */
export interface AIProxyRequest {
  /** Conversation messages */
  messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>
  /** Model to use (optional, provider-specific default) */
  model?: string
}

/** Response from the AI proxy endpoint */
export interface AIProxyResponse {
  /** AI response content */
  content: string
  /** Error message if request failed */
  error?: string
}

/** Request to discover schema for tables */
export interface SchemaRequest {
  /** Table names to introspect */
  tables: string[]
}

/** Response with discovered schemas */
export interface SchemaResponse {
  /** Discovered table schemas */
  schemas: AITableSchema[]
  /** Error message if discovery failed */
  error?: string
}

// ============================================================================
// Unified Database Endpoint Types (for simplified databaseEndpoint mode)
// ============================================================================

/** Request to the unified database endpoint */
export interface DatabaseEndpointRequest {
  /** Action to perform */
  action: 'list-tables' | 'get-schema' | 'query'
  /** Table names for schema discovery (action: 'get-schema') */
  tables?: string[]
  /** SQL query (action: 'query') */
  sql?: string
  /** Primary table being queried (action: 'query') */
  table?: string
  /** Query parameters (action: 'query') */
  params?: unknown[]
}

/** Response from list-tables action */
export interface ListTablesResponse {
  /** List of available tables */
  tables: Array<{
    /** Table name */
    name: string
    /** Schema name (for databases that support schemas) */
    schema?: string
    /** Optional description for AI context */
    description?: string
  }>
  /** Error message if request failed */
  error?: string
}

// ============================================================================
// AI Analyst Event Types
// ============================================================================

/** Event emitted when AI loads data into the grid */
export interface AIDataLoadedEvent {
  /** The data that was loaded */
  data: Record<string, unknown>[]
  /** The SQL query that produced this data */
  query: string
  /** Data source that was queried */
  dataSourceId: string
  /** Number of rows returned */
  rowCount: number
}

/** Event emitted when the conversation updates */
export interface AIConversationUpdateEvent {
  /** The updated conversation */
  conversation: AIConversation
}

/** Event emitted when a query is executed */
export interface AIQueryExecutedEvent {
  /** The SQL query that was executed */
  query: string
  /** Number of rows returned */
  rowCount: number
  /** Query execution duration in ms */
  duration: number
  /** Data source that was queried */
  dataSourceId: string
  /** Whether the query succeeded */
  success: boolean
  /** Error message if query failed */
  error?: string
}

/** Event emitted when an AI error occurs */
export interface AIErrorEvent {
  /** Error message */
  message: string
  /** The query that caused the error (if applicable) */
  query?: string
  /** Error type classification */
  type: 'query' | 'ai' | 'network' | 'validation'
}
