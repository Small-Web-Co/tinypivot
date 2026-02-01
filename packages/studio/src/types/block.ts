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
  | 'stat'
  | 'progress'
  | 'spacer'
  | 'quote'
  | 'grid'

/**
 * Grid position for blocks in grid layout mode
 */
export interface GridPosition {
  /** Column position (0-based) */
  x: number
  /** Row position (0-based) */
  y: number
  /** Width in grid units (1-12) */
  w: number
  /** Height in grid units */
  h: number
}

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
  /** Grid position when in grid layout mode */
  gridPosition?: GridPosition
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
 * Image shape options
 */
export type ImageShape = 'rectangle' | 'circle' | 'rounded'

/**
 * Image aspect ratio presets
 */
export type ImageAspectRatio = 'free' | '1:1' | '16:9' | '4:3'

/**
 * Image object fit options
 */
export type ImageObjectFit = 'cover' | 'contain' | 'fill'

/**
 * Image block for static images
 */
export interface ImageBlock extends BaseBlock {
  type: 'image'
  /** Image source URL (can be URL or base64 data URL) */
  src: string
  /** Alt text for accessibility */
  alt?: string
  /** Optional caption */
  caption?: string
  /** Image width (pixels, percent, or 'full') */
  width?: string | number
  /** Image height in pixels */
  height?: number
  /** Image alignment */
  align?: 'left' | 'center' | 'right'
  /** Image shape (rectangle, circle, or rounded corners) */
  shape?: ImageShape
  /** Aspect ratio constraint */
  aspectRatio?: ImageAspectRatio
  /** How the image should fit within its container */
  objectFit?: ImageObjectFit
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
 * Stat block for displaying big numbers with labels
 * Ideal for KPI displays in infographics
 */
export interface StatBlock extends BaseBlock {
  type: 'stat'
  /** The main value to display (e.g., "1.2M", "42%", "500") */
  value: string | number
  /** Label describing the stat (e.g., "Total Revenue") */
  label: string
  /** Prefix displayed before the value (e.g., "$") */
  prefix?: string
  /** Suffix displayed after the value (e.g., "%", "K", "M") */
  suffix?: string
  /** Size of the stat display */
  size?: 'small' | 'medium' | 'large' | 'xlarge'
  /** Custom color for the value text */
  color?: string
  /** Optional trend indicator */
  trend?: {
    /** Direction of the trend */
    direction: 'up' | 'down' | 'flat'
    /** Trend value to display (e.g., "12%") */
    value?: string
    /** Whether the direction is positive (green for up, red for down when true) */
    positive?: boolean
  }
}

/**
 * Progress block for showing completion or percentage
 * Supports bar, circle, and semicircle variants
 */
export interface ProgressBlock extends BaseBlock {
  type: 'progress'
  /** Current value (0-100 by default) */
  value: number
  /** Maximum value (defaults to 100) */
  max?: number
  /** Optional label above the progress indicator */
  label?: string
  /** Whether to show the percentage value */
  showValue?: boolean
  /** Custom color for the progress fill */
  color?: string
  /** Visual variant of the progress indicator */
  variant?: 'bar' | 'circle' | 'semicircle'
  /** Size of the progress indicator */
  size?: 'small' | 'medium' | 'large'
}

/**
 * Spacer block for adding vertical space
 */
export interface SpacerBlock extends BaseBlock {
  type: 'spacer'
  /** Height in pixels */
  height: number
}

/**
 * Quote block style options
 */
export type QuoteStyle = 'simple' | 'bordered' | 'highlighted'

/**
 * Quote block for testimonials and pull quotes
 */
export interface QuoteBlock extends BaseBlock {
  type: 'quote'
  /** The quote content */
  content: string
  /** Author of the quote */
  author?: string
  /** Source or attribution (e.g., "CEO, Acme Corp") */
  source?: string
  /** Visual style of the quote */
  style?: QuoteStyle
}

/**
 * Grid item definition - a block with positioning
 */
export interface GridItem {
  /** The block to display */
  block: Block
  /** Column span (defaults to 1) */
  colSpan?: number
  /** Row span (defaults to 1) */
  rowSpan?: number
  /** Explicit column start position (1-based, for manual placement) */
  colStart?: number
  /** Explicit row start position (1-based, for manual placement) */
  rowStart?: number
}

/**
 * Grid block for masonry-style layouts
 * Supports auto-flow and manual placement of items
 */
export interface GridBlock extends BaseBlock {
  type: 'grid'
  /** Number of columns in the grid */
  columns: number
  /** Gap between grid items in pixels */
  gap?: number
  /** Row height ('auto' for content-based, or fixed pixel value) */
  rowHeight?: 'auto' | number
  /** Items in the grid with their span configurations */
  items: GridItem[]
  /** Whether to use dense packing (fills holes in the grid) */
  dense?: boolean
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
  | StatBlock
  | ProgressBlock
  | SpacerBlock
  | QuoteBlock
  | GridBlock

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

/**
 * Type guard to check if a block is a StatBlock
 */
export function isStatBlock(block: Block): block is StatBlock {
  return block.type === 'stat'
}

/**
 * Type guard to check if a block is a ProgressBlock
 */
export function isProgressBlock(block: Block): block is ProgressBlock {
  return block.type === 'progress'
}

/**
 * Type guard to check if a block is a SpacerBlock
 */
export function isSpacerBlock(block: Block): block is SpacerBlock {
  return block.type === 'spacer'
}

/**
 * Type guard to check if a block is a QuoteBlock
 */
export function isQuoteBlock(block: Block): block is QuoteBlock {
  return block.type === 'quote'
}

/**
 * Type guard to check if a block is a GridBlock
 */
export function isGridBlock(block: Block): block is GridBlock {
  return block.type === 'grid'
}
