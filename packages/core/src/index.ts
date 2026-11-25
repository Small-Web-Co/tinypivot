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
  getLatestConversationData,
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
  aggregateByCategory,
  aggregateValues,
  analyzeFieldsForChart,
  buildChartStory,
  BULLET_MAX_ROWS,
  BULLET_NEAR_RATIO,
  CHART_AGGREGATIONS,
  CHART_COLORS,
  CHART_FONT_MONO,
  CHART_FONT_SANS,
  CHART_FONT_SERIF,
  CHART_THEME_IDS,
  CHART_THEME_PRESETS,
  CHART_TYPE_IDS,
  CHART_TYPES,
  chartFootnote,
  chartKicker,
  commonLabelPrefix,
  compareLabels,
  createDefaultChartConfig,
  describeUnmatchedRegions,
  detectFieldRole,
  detectGeography,
  formatChartValue,
  formatCompactChartValue,
  formatFieldLabel,
  generateChartStorageKey,
  getChartGuidance,
  getChartRenderer,
  getChartThemeColors,
  getChartTypeInfo,
  getChartZoneLabels,
  getD3ChartTheme,
  getEffectiveChartOptions,
  HIERARCHY_MAX_LEAVES,
  isChartConfigValid,
  isD3ChartType,
  loadChartConfig,
  matchRegion,
  matchRegions,
  mixColor,
  normalizeRegionName,
  processChartData,
  processChartDataForBullet,
  processChartDataForChoropleth,
  processChartDataForHeatmap,
  processChartDataForHierarchy,
  processChartDataForPie,
  processChartDataForScatter,
  processChartDataForSlope,
  regionDisplayName,
  resolveChartSortOrder,
  resolveChartType,
  saveChartConfig,
  sortCategoryEntries,
  US_STATE_ROWS,
} from './chart'

export type {
  BulletData,
  BulletRow,
  BulletStatus,
  CategoryEntry,
  ChartStory,
  ChoroplethData,
  D3ChartTheme,
  HierarchyData,
  HierarchyNode,
  MatchedRegion,
  RegionKind,
  RegionMatch,
  RegionMatchResult,
  ResolvedGeography,
  SlopeData,
  SlopeRow,
} from './chart'
export type { HeatmapSeriesData, ScatterPoint, ScatterSeriesData } from './chart'

// Export Utilities
export {
  buildGridWorkbook,
  buildPivotWorkbook,
  copyToClipboard,
  exportPivotToCSV,
  exportPivotToXLSX,
  exportToCSV,
  exportToXLSX,
  formatSelectionForClipboard,
} from './export'

export type { PivotExportData, SourceData } from './export'

// License Management
export {
  canUseAIAnalyst,
  canUseCharts,
  canUseDrillThrough,
  canUsePivot,
  canUseXlsxExport,
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
  // Axis value filters
  applyFieldFilters,
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
  // Drill-Through
  getDrillThroughRows,
  getFieldUniqueValues,
  getUnassignedFields,
  isConfigValidForFields,
  isPivotConfigured,
  loadCalculatedFields,
  loadPivotConfig,
  parseFormula,
  parsePathKey,
  // Simple Formula (field-level calculations)
  parseSimpleFormula,
  pathKey,
  removeCalculatedField,
  // Calculated Fields Storage
  saveCalculatedFields,
  savePivotConfig,
  stringifyPivotValue,
  validateFormula,
  validateSimpleFormula,
} from './pivot'
export type { ComputePivotOptions, FormulaFunction } from './pivot'

// Grouped pivot layout helpers
export { computeRowSpans } from './pivot/rowspan'

export type { RowSpanCell } from './pivot/rowspan'

// Unified themes
export {
  chartGlowApplies,
  chartPatternFill,
  getChartLook,
  isDarkTheme,
  isUnifiedTheme,
  resolveChartTheme,
  TERMINAL_PALETTES,
  UNIFIED_THEME_IDS,
} from './theme'
export type {
  ChartFillMode,
  ChartGlow,
  ChartLook,
  ChartPatternStyle,
  Rgb,
  TerminalPalette,
  UnifiedThemeId,
} from './theme'

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
  ApexChartKind,
  CalculatedField,
  CellClickEvent,
  // Chart Types
  ChartAggregation,
  ChartConfig,
  ChartData,
  ChartExtraSlot,
  ChartField,
  ChartFieldInfo,
  ChartGeography,
  ChartOptions,
  ChartRenderer,
  ChartSeries,
  ChartSizeSlot,
  ChartSortOrder,
  ChartTerminalFallback,
  ChartThemePreset,
  ChartType,

  ChartTypeInfo,
  ChartZoneLabels,
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
  DataGridViewMode,
  DateFormat,
  DateRange,
  DrillThroughDescriptor,
  DrillThroughResult,

  ExportEvent,
  ExportOptions,
  FieldRole,
  FieldRoleOverrides,
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
  PivotGroupStart,
  PivotLayout,
  PivotResult,
  PivotRowMeta,
  PivotTableProps,
  PivotValueField,
  QueryRequest,
  QueryResponse,
  ResolvedTheme,
  RowSelectionChangeEvent,
  SchemaRequest,
  SchemaResponse,
  SelectionBounds,
  SelectionChangeEvent,
  SortEvent,
  Theme,
  XlsxExportOptions,
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
  formatDate,
  formatNumber,
  getColumnUniqueValues,
  getDatePlaceholder,
  makeKey,
  naturalSort,
  parseDateInput,
  parseKey,
} from './utils'
