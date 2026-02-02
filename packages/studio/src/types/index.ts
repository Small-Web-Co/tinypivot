/**
 * TinyPivot Studio - Type Definitions
 * Re-exports all types from the studio package
 */

// Block types
export type {
  BaseBlock,
  Block,
  BlockType,
  CalloutBlock,
  CalloutStyle,
  Column,
  ColumnsBlock,
  DividerBlock,
  GridPosition,
  HeadingBlock,
  ImageAspectRatio,
  ImageBlock,
  ImageObjectFit,
  ImageShape,
  ProgressBlock,
  QuoteBlock,
  QuoteStyle,
  SpacerBlock,
  StatBlock,
  TextBlock,
  WidgetBlock,
  WidgetGridBlock,
  WidgetGridPosition,
} from './block'

export {
  isCalloutBlock,
  isColumnsBlock,
  isDividerBlock,
  isHeadingBlock,
  isImageBlock,
  isProgressBlock,
  isQuoteBlock,
  isSpacerBlock,
  isStatBlock,
  isTextBlock,
  isWidgetBlock,
  isWidgetGridBlock,
} from './block'
// Datasource types
export type {
  ColumnSchema,
  ConnectionStatus,
  DatasourceAdapter,
  DatasourceAdapterFactory,
  DatasourceConfig,
  DatasourceInfo,
  DatasourceRegistry,
  DatasourceType,
  ForeignKeyInfo,
  QueryColumn,
  QueryResult,
  QueryValidation,
  TableSchema,
} from './datasource'

// Page types
export type {
  FieldLink,
  LayoutMode,
  Page,
  PageCreateInput,
  PageFilter,
  PageListItem,
  PageSnapshot,
  PageTemplate,
  PageUpdateInput,
} from './page'

// Share types
export type {
  PageShare,
  PageShareSettings,
  ShareAccessLevel,
  ShareAnalytics,
  ShareBranding,
  ShareVisibility,
} from './share'
export {
  createDefaultShareSettings,
  generateShareToken,
  isShareValid,
  isValidShareToken,
} from './share'

// Storage types
export type {
  PageListFilter,
  PaginatedResult,
  StorageAdapter,
  StorageAdapterWithEvents,
  StorageEvents,
} from './storage'

// Theme types
export type {
  FontFamily,
  Theme,
  ThemeConfig,
  ThemePreset,
} from './theme'

export { DEFAULT_THEMES, mergeThemeWithDefaults } from './theme'
// Version types
export type {
  CreateVersionOptions,
  PageVersion,
  PageVersionSummary,
  RestoreVersionOptions,
  VersionDiff,
} from './version'

export {
  calculateContentHash,
  estimateVersionSize,
  MAX_VERSIONS_PER_PAGE,
} from './version'
// Widget types
export type {
  KPIConfig,
  TableConfig,
  WidgetConfig,
  WidgetCreateInput,
  WidgetFilter,
  WidgetUpdateInput,
  WidgetVisualization,
} from './widget'
