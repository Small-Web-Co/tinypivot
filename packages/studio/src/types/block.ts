/**
 * Block Types for TinyPivot Studio
 * Defines the structure for content blocks that compose pages
 * Based on a block-based document editing paradigm
 */

/**
 * All possible block types in a page
 */
export type BlockType =
  | 'text'
  | 'heading'
  | 'widget'
  | 'widgetGrid'
  | 'callout'
  | 'divider'
  | 'image'
  | 'columns'

/**
 * Base properties shared by all blocks
 */
export interface BaseBlock {
  /** Unique block identifier */
  id: string
  /** Type discriminator for the block */
  type: BlockType
  /** Optional CSS classes to apply */
  className?: string
  /** Arbitrary metadata for extensibility */
  metadata?: Record<string, unknown>
}

/**
 * Rich text block for paragraphs and inline content
 */
export interface TextBlock extends BaseBlock {
  type: 'text'
  /** Text content (supports basic markdown or HTML) */
  content: string
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
}

/**
 * Heading block for section titles
 */
export interface HeadingBlock extends BaseBlock {
  type: 'heading'
  /** Heading text */
  content: string
  /** Heading level (1-6) */
  level: 1 | 2 | 3 | 4 | 5 | 6
  /** Text alignment */
  align?: 'left' | 'center' | 'right'
}

/**
 * Single widget block - displays one widget at full width
 */
export interface WidgetBlock extends BaseBlock {
  type: 'widget'
  /** Reference to the widget configuration */
  widgetId: string
  /** Optional height override (pixels or CSS value) */
  height?: string | number
  /** Title override for this instance */
  titleOverride?: string
  /** Whether to show the widget title */
  showTitle?: boolean
}

/**
 * Widget position within a grid
 */
export interface WidgetGridPosition {
  /** Widget ID */
  widgetId: string
  /** Column position (0-based) */
  x: number
  /** Row position (0-based) */
  y: number
  /** Width in grid units */
  width: number
  /** Height in grid units */
  height: number
  /** Title override for this instance */
  titleOverride?: string
  /** Whether to show the widget title */
  showTitle?: boolean
}

/**
 * Widget grid block - displays multiple widgets in a flexible grid layout
 */
export interface WidgetGridBlock extends BaseBlock {
  type: 'widgetGrid'
  /** Number of columns in the grid */
  columns: number
  /** Row height in pixels */
  rowHeight?: number
  /** Gap between widgets in pixels */
  gap?: number
  /** Widgets positioned within the grid */
  widgets: WidgetGridPosition[]
}

/**
 * Callout style options
 */
export type CalloutStyle = 'info' | 'warning' | 'success' | 'error' | 'note' | 'tip'

/**
 * Callout block for highlighted information
 */
export interface CalloutBlock extends BaseBlock {
  type: 'callout'
  /** Callout content */
  content: string
  /** Visual style */
  style: CalloutStyle
  /** Optional title */
  title?: string
  /** Optional icon name */
  icon?: string
}

/**
 * Divider block for visual separation
 */
export interface DividerBlock extends BaseBlock {
  type: 'divider'
  /** Divider style */
  style?: 'solid' | 'dashed' | 'dotted'
  /** Margin above and below (pixels) */
  margin?: number
}

/**
 * Image block for static images
 */
export interface ImageBlock extends BaseBlock {
  type: 'image'
  /** Image source URL */
  src: string
  /** Alt text for accessibility */
  alt?: string
  /** Optional caption */
  caption?: string
  /** Image width (pixels, percent, or 'full') */
  width?: string | number
  /** Image alignment */
  align?: 'left' | 'center' | 'right'
}

/**
 * A column within a columns block
 */
export interface Column {
  /** Unique column identifier */
  id: string
  /** Column width as a fraction (e.g., 1, 2, 3 for 1/3, 2/3 splits) */
  width: number
  /** Blocks nested within this column */
  blocks: Block[]
}

/**
 * Columns block for multi-column layouts
 */
export interface ColumnsBlock extends BaseBlock {
  type: 'columns'
  /** Column definitions with their nested content */
  columns: Column[]
  /** Gap between columns in pixels */
  gap?: number
  /** Vertical alignment of column contents */
  verticalAlign?: 'top' | 'center' | 'bottom'
}

/**
 * Union type of all block types
 */
export type Block =
  | TextBlock
  | HeadingBlock
  | WidgetBlock
  | WidgetGridBlock
  | CalloutBlock
  | DividerBlock
  | ImageBlock
  | ColumnsBlock

/**
 * Type guard to check if a block is a TextBlock
 */
export function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'text'
}

/**
 * Type guard to check if a block is a HeadingBlock
 */
export function isHeadingBlock(block: Block): block is HeadingBlock {
  return block.type === 'heading'
}

/**
 * Type guard to check if a block is a WidgetBlock
 */
export function isWidgetBlock(block: Block): block is WidgetBlock {
  return block.type === 'widget'
}

/**
 * Type guard to check if a block is a WidgetGridBlock
 */
export function isWidgetGridBlock(block: Block): block is WidgetGridBlock {
  return block.type === 'widgetGrid'
}

/**
 * Type guard to check if a block is a CalloutBlock
 */
export function isCalloutBlock(block: Block): block is CalloutBlock {
  return block.type === 'callout'
}

/**
 * Type guard to check if a block is a DividerBlock
 */
export function isDividerBlock(block: Block): block is DividerBlock {
  return block.type === 'divider'
}

/**
 * Type guard to check if a block is an ImageBlock
 */
export function isImageBlock(block: Block): block is ImageBlock {
  return block.type === 'image'
}

/**
 * Type guard to check if a block is a ColumnsBlock
 */
export function isColumnsBlock(block: Block): block is ColumnsBlock {
  return block.type === 'columns'
}
