/**
 * TinyPivot Core
 * Framework-agnostic core logic for pivot tables and data grids
 *
 * @packageDocumentation
 */

// AI Data Analyst
export {
  // Session management
  addMessageToConversation,
  // Prompt engineering
  buildResultsSummary,
  buildSystemPrompt,
  buildUserMessage,
  createAssistantMessage,
  createConversation,
  createSystemMessage,
  createUserMessage,
  // Demo mode
  DEMO_DATA_SOURCES,
  DEMO_SCENARIOS,
  DEMO_SCHEMAS,
  deserializeConversation,
  extractSQLFromResponse,
  findDemoResponse,
  generateMessageId,
  generateSessionId,
  getConversationStats,
  getDefaultDemoResponse,
  getDemoSchema,
  getInitialDemoData,
  getMessagesForAPI,
  serializeConversation,
  setConversationDataSource,
  stripSQLFromContent,
  trimConversation,
  validateSQLSafety,
} from './ai'
export type { DemoScenario, DemoTrigger } from './ai'

// Chart Utilities
export {
  aggregateValues,
  analyzeFieldsForChart,
  CHART_AGGREGATIONS,
  CHART_COLORS,
  CHART_TYPES,
  createDefaultChartConfig,
  detectFieldRole,
  formatFieldLabel,
  generateChartStorageKey,
  getChartGuidance,
  getChartTypeInfo,
  isChartConfigValid,
  loadChartConfig,
  processChartData,
  processChartDataForHeatmap,
  processChartDataForPie,
  processChartDataForScatter,
  saveChartConfig,
} from './chart'

export type { HeatmapSeriesData, ScatterPoint, ScatterSeriesData } from './chart'

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
  canUseAIAnalyst,
  canUseCharts,
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
  // AI Data Analyst Types
  AIAnalystConfig,
  AIColumnOverride,

  AIColumnSchema,
  AIConversation,
  AIConversationUpdateEvent,
  AIDataLoadedEvent,
  AIDataSource,
  AIErrorEvent,
  AIMessage,
  AIMessageMetadata,
  AIProvider,

  AIProxyRequest,
  AIProxyResponse,
  AIQueryExecutedEvent,
  AITableSchema,
  CalculatedField,
  CellClickEvent,
  // Chart Types
  ChartAggregation,
  ChartConfig,
  ChartData,
  ChartField,

  ChartFieldInfo,
  ChartOptions,

  ChartSeries,
  ChartType,
  ChartTypeInfo,

  ColumnFilter,
  ColumnFilterValue,
  // Grid Types
  ColumnStats,
  CopyEvent,
  CustomAggregationFn,
  // Unified Database Endpoint Types
  DatabaseEndpointRequest,
  // Component Props Types
  DataGridProps,
  DateFormat,
  DateRange,

  ExportEvent,
  ExportOptions,
  FieldRole,
  FieldStats,
  // Event Types
  FilterEvent,

  GridOptions,
  LicenseFeatures,
  LicenseInfo,
  // License Types
  LicenseType,
  ListTablesResponse,
  NumberFormat,
  NumericRange,
  // Feature Types
  PaginationOptions,
  PivotCell,
  PivotConfig,
  PivotField,
  PivotResult,
  PivotTableProps,
  PivotValueField,
  QueryRequest,
  QueryResponse,
  RowSelectionChangeEvent,
  SchemaRequest,
  SchemaResponse,
  SelectionBounds,
  SelectionChangeEvent,
  SortEvent,
} from './types'
// Type Guards
export { isDateRange, isNumericRange } from './types'
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
