/**
 * PageViewer Component
 * Read-only viewer for displaying shared/published pages without edit capabilities
 */
import type {
  Block,
  CalloutBlock,
  ColumnsBlock,
  HeadingBlock,
  ImageBlock,
  Page,
  PageShare,
  ProgressBlock,
  QuoteBlock,
  SpacerBlock,
  StatBlock,
  StorageAdapter,
  TextBlock,
  WidgetBlock,
  WidgetGridBlock,
} from '@smallwebco/tinypivot-studio'
import { DataGrid } from '@smallwebco/tinypivot-react'
import { useMemo } from 'react'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'
import '@smallwebco/tinypivot-react/style.css'

/**
 * Props for PageViewer component
 */
export interface PageViewerProps {
  /** The page to display */
  page: Page
  /** Share configuration (if viewing via share link) */
  share?: PageShare
  /** Storage adapter for fetching widget data */
  storage?: StorageAdapter
  /** API endpoint for server-side operations */
  apiEndpoint?: string
  /** User ID for authenticated viewers */
  userId?: string
  /** User key for credential encryption */
  userKey?: string
  /** Custom class name */
  className?: string
}

// Type guards for block rendering
function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'text'
}

function isHeadingBlock(block: Block): block is HeadingBlock {
  return block.type === 'heading'
}

function isWidgetBlock(block: Block): block is WidgetBlock {
  return block.type === 'widget'
}

function isWidgetGridBlock(block: Block): block is WidgetGridBlock {
  return block.type === 'widgetGrid'
}

function isCalloutBlock(block: Block): block is CalloutBlock {
  return block.type === 'callout'
}

function isDividerBlock(block: Block): block is Block & { type: 'divider' } {
  return block.type === 'divider'
}

function isImageBlock(block: Block): block is ImageBlock {
  return block.type === 'image'
}

function isColumnsBlock(block: Block): block is ColumnsBlock {
  return block.type === 'columns'
}

function isStatBlock(block: Block): block is StatBlock {
  return block.type === 'stat'
}

function isProgressBlock(block: Block): block is ProgressBlock {
  return block.type === 'progress'
}

function isSpacerBlock(block: Block): block is SpacerBlock {
  return block.type === 'spacer'
}

function isQuoteBlock(block: Block): block is QuoteBlock {
  return block.type === 'quote'
}

// Helper to get callout icon
function getCalloutIcon(style: CalloutBlock['style']): string {
  const icons: Record<CalloutBlock['style'], string> = {
    info: 'i',
    warning: '!',
    success: 'check',
    error: 'x',
    note: 'note',
    tip: 'tip',
  }
  return icons[style]
}

// Helper to get progress percentage
function getProgressPercentage(block: ProgressBlock): number {
  const max = block.max ?? 100
  return Math.min(100, Math.max(0, (block.value / max) * 100))
}

// Helper to get trend arrow
function getTrendArrow(direction: 'up' | 'down' | 'flat'): string {
  const arrows = { up: '↑', down: '↓', flat: '→' }
  return arrows[direction]
}

/**
 * PageViewer - Read-only viewer for shared/published pages
 *
 * Renders a page in view-only mode with support for all block types.
 * Supports interactive mode for viewers with 'interact' access level.
 *
 * @example
 * ```tsx
 * import { PageViewer } from '@smallwebco/tinypivot-studio-react'
 *
 * function SharedPage({ page, share }) {
 *   return (
 *     <PageViewer
 *       page={page}
 *       share={share}
 *     />
 *   )
 * }
 * ```
 */
export function PageViewer({
  page,
  share,
  className,
}: PageViewerProps) {
  // Interactive mode based on share settings
  const isInteractive = useMemo(() => {
    if (!share)
      return false
    return share.settings.accessLevel === 'interact'
  }, [share])

  // Check if export is allowed
  const allowExport = useMemo(() => {
    if (!share)
      return false
    return share.settings.allowExport
  }, [share])

  // Render blocks in read-only mode
  const renderableBlocks = useMemo(() => page.blocks || [], [page.blocks])

  // Render a single block
  const renderBlock = (block: Block) => {
    // Text block
    if (isTextBlock(block)) {
      return (
        <div
          key={block.id}
          className={`tps-viewer-text ${block.align ? `tps-viewer-text--${block.align}` : ''}`}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      )
    }

    // Heading block
    if (isHeadingBlock(block)) {
      const HeadingTag = `h${block.level}` as keyof JSX.IntrinsicElements
      return (
        <HeadingTag
          key={block.id}
          className={`tps-viewer-heading ${block.align ? `tps-viewer-heading--${block.align}` : ''}`}
        >
          {block.content}
        </HeadingTag>
      )
    }

    // Widget block
    if (isWidgetBlock(block)) {
      return (
        <div key={block.id} className="tps-viewer-widget">
          {block.showTitle !== false && (block.titleOverride || block.widgetId) && (
            <h3 className="tps-viewer-widget-title">
              {block.titleOverride || 'Widget'}
            </h3>
          )}
          <div
            className="tps-viewer-widget-content"
            style={{
              height: typeof block.height === 'number' ? `${block.height}px` : block.height,
            }}
          >
            <DataGrid
              data={[]}
              showControls={isInteractive}
              showPivot={false}
              enableExport={allowExport}
            />
          </div>
        </div>
      )
    }

    // Widget Grid block
    if (isWidgetGridBlock(block)) {
      return (
        <div
          key={block.id}
          className="tps-viewer-widget-grid"
          style={{
            '--columns': block.columns,
            '--gap': `${block.gap || 16}px`,
          } as React.CSSProperties}
        >
          {block.widgets.map(widget => (
            <div
              key={widget.widgetId}
              className="tps-viewer-grid-widget"
              style={{
                gridColumn: `span ${widget.width}`,
                gridRow: `span ${widget.height}`,
              }}
            >
              {widget.showTitle !== false && widget.titleOverride && (
                <h4 className="tps-viewer-widget-title">{widget.titleOverride}</h4>
              )}
              <DataGrid
                data={[]}
                showControls={isInteractive}
                showPivot={false}
                enableExport={allowExport}
              />
            </div>
          ))}
        </div>
      )
    }

    // Callout block
    if (isCalloutBlock(block)) {
      return (
        <div
          key={block.id}
          className={`tps-viewer-callout tps-viewer-callout--${block.style}`}
        >
          <span className="tps-viewer-callout-icon">
            {block.icon || getCalloutIcon(block.style)}
          </span>
          <div className="tps-viewer-callout-body">
            {block.title && (
              <strong className="tps-viewer-callout-title">{block.title}</strong>
            )}
            <div dangerouslySetInnerHTML={{ __html: block.content }} />
          </div>
        </div>
      )
    }

    // Divider block
    if (isDividerBlock(block)) {
      return <hr key={block.id} className="tps-viewer-divider" />
    }

    // Image block
    if (isImageBlock(block)) {
      return (
        <figure
          key={block.id}
          className={`tps-viewer-image ${block.align ? `tps-viewer-image--${block.align}` : ''}`}
        >
          <img
            src={block.src}
            alt={block.alt || ''}
            style={{
              width: typeof block.width === 'number' ? `${block.width}px` : block.width,
              height: block.height ? `${block.height}px` : undefined,
              objectFit: block.objectFit,
              borderRadius:
                block.shape === 'circle'
                  ? '50%'
                  : block.shape === 'rounded'
                    ? '8px'
                    : undefined,
            }}
          />
          {block.caption && (
            <figcaption className="tps-viewer-image-caption">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    }

    // Columns block
    if (isColumnsBlock(block)) {
      return (
        <div
          key={block.id}
          className="tps-viewer-columns"
          style={{ gap: `${block.gap || 16}px` }}
        >
          {block.columns.map(column => (
            <div
              key={column.id}
              className="tps-viewer-column"
              style={{ flex: column.width }}
            >
              {column.blocks.map(nestedBlock => (
                <div key={nestedBlock.id} className="tps-viewer-nested-block">
                  {/* Note: In production, this should use recursive rendering */}
                  {isTextBlock(nestedBlock) && (
                    <div dangerouslySetInnerHTML={{ __html: nestedBlock.content }} />
                  )}
                  {isHeadingBlock(nestedBlock) && (() => {
                    const NestedHeading = `h${nestedBlock.level}` as keyof JSX.IntrinsicElements
                    return <NestedHeading>{nestedBlock.content}</NestedHeading>
                  })()}
                </div>
              ))}
            </div>
          ))}
        </div>
      )
    }

    // Stat block
    if (isStatBlock(block)) {
      const trendClass = block.trend
        ? block.trend.positive ?? block.trend.direction === 'up'
          ? 'tps-viewer-stat-trend--positive'
          : 'tps-viewer-stat-trend--negative'
        : ''

      return (
        <div
          key={block.id}
          className={`tps-viewer-stat tps-viewer-stat--${block.size || 'medium'}`}
        >
          <div className="tps-viewer-stat-value" style={{ color: block.color }}>
            {block.prefix && (
              <span className="tps-viewer-stat-prefix">{block.prefix}</span>
            )}
            {block.value}
            {block.suffix && (
              <span className="tps-viewer-stat-suffix">{block.suffix}</span>
            )}
          </div>
          <div className="tps-viewer-stat-label">{block.label}</div>
          {block.trend && (
            <div className={`tps-viewer-stat-trend ${trendClass}`}>
              <span className="tps-viewer-stat-trend-arrow">
                {getTrendArrow(block.trend.direction)}
              </span>
              {block.trend.value && <span>{block.trend.value}</span>}
            </div>
          )}
        </div>
      )
    }

    // Progress block
    if (isProgressBlock(block)) {
      const percentage = getProgressPercentage(block)
      return (
        <div
          key={block.id}
          className={`tps-viewer-progress tps-viewer-progress--${block.variant || 'bar'}`}
        >
          {block.label && (
            <div className="tps-viewer-progress-label">{block.label}</div>
          )}
          {(block.variant === 'bar' || !block.variant) && (
            <div
              className={`tps-viewer-progress-bar tps-viewer-progress-bar--${block.size || 'medium'}`}
            >
              <div
                className="tps-viewer-progress-fill"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: block.color,
                }}
              />
            </div>
          )}
          {block.showValue && (
            <div className="tps-viewer-progress-value">
              {Math.round(percentage)}
              %
            </div>
          )}
        </div>
      )
    }

    // Spacer block
    if (isSpacerBlock(block)) {
      return (
        <div
          key={block.id}
          className="tps-viewer-spacer"
          style={{ height: `${block.height}px` }}
        />
      )
    }

    // Quote block
    if (isQuoteBlock(block)) {
      return (
        <blockquote
          key={block.id}
          className={`tps-viewer-quote tps-viewer-quote--${block.style || 'simple'}`}
        >
          <p className="tps-viewer-quote-content">{block.content}</p>
          {block.author && (
            <footer className="tps-viewer-quote-footer">
              <cite className="tps-viewer-quote-author">{block.author}</cite>
              {block.source && (
                <span className="tps-viewer-quote-source">
                  ,
                  {block.source}
                </span>
              )}
            </footer>
          )}
        </blockquote>
      )
    }

    // Unknown block type - render nothing
    return null
  }

  return (
    <div className={`tps-page-viewer ${className || ''}`}>
      {/* Header */}
      {page.title && (
        <header className="tps-viewer-header">
          <h1>{page.title}</h1>
          {page.description && (
            <p className="tps-viewer-description">{page.description}</p>
          )}
        </header>
      )}

      {/* Content */}
      <main className="tps-viewer-content">
        {renderableBlocks.map(block => (
          <div key={block.id} className="tps-viewer-block">
            {renderBlock(block)}
          </div>
        ))}
      </main>

      {/* Footer */}
      {share?.settings.showAuthor && page.createdBy && (
        <footer className="tps-viewer-footer">
          <span>
            Created by
            {page.createdBy}
          </span>
        </footer>
      )}

      {/* Styles */}
      <style>
        {`
        .tps-page-viewer {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        /* Header styles */
        .tps-viewer-header {
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .tps-viewer-header h1 {
          font-size: 2rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0 0 0.5rem;
        }

        .tps-viewer-description {
          color: #64748b;
          margin: 0;
          font-size: 1rem;
        }

        /* Block container */
        .tps-viewer-block {
          margin-bottom: 1.5rem;
        }

        /* Text block */
        .tps-viewer-text {
          line-height: 1.6;
          color: #334155;
        }

        .tps-viewer-text--center {
          text-align: center;
        }

        .tps-viewer-text--right {
          text-align: right;
        }

        /* Heading block */
        .tps-viewer-heading {
          color: #1e293b;
          margin: 1.5rem 0 0.75rem;
          font-weight: 600;
        }

        .tps-viewer-heading--center {
          text-align: center;
        }

        .tps-viewer-heading--right {
          text-align: right;
        }

        /* Widget block */
        .tps-viewer-widget {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          overflow: hidden;
        }

        .tps-viewer-widget-title {
          font-size: 1rem;
          font-weight: 500;
          color: #334155;
          margin: 0 0 1rem;
        }

        .tps-viewer-widget-content {
          min-height: 200px;
        }

        /* Widget Grid */
        .tps-viewer-widget-grid {
          display: grid;
          grid-template-columns: repeat(var(--columns, 2), 1fr);
          gap: var(--gap, 16px);
        }

        .tps-viewer-grid-widget {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          min-height: 200px;
        }

        /* Callout block */
        .tps-viewer-callout {
          display: flex;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 8px;
          border-left: 4px solid;
        }

        .tps-viewer-callout--info {
          background: #eff6ff;
          border-color: #3b82f6;
        }

        .tps-viewer-callout--warning {
          background: #fffbeb;
          border-color: #f59e0b;
        }

        .tps-viewer-callout--success {
          background: #f0fdf4;
          border-color: #22c55e;
        }

        .tps-viewer-callout--error {
          background: #fef2f2;
          border-color: #ef4444;
        }

        .tps-viewer-callout--note {
          background: #f8fafc;
          border-color: #64748b;
        }

        .tps-viewer-callout--tip {
          background: #fefce8;
          border-color: #eab308;
        }

        .tps-viewer-callout-icon {
          flex-shrink: 0;
          font-size: 1.25rem;
        }

        .tps-viewer-callout-title {
          display: block;
          margin-bottom: 0.25rem;
        }

        /* Divider block */
        .tps-viewer-divider {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 2rem 0;
        }

        /* Image block */
        .tps-viewer-image {
          margin: 1rem 0;
        }

        .tps-viewer-image--center {
          text-align: center;
        }

        .tps-viewer-image--right {
          text-align: right;
        }

        .tps-viewer-image img {
          max-width: 100%;
          height: auto;
        }

        .tps-viewer-image-caption {
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: #64748b;
          font-style: italic;
        }

        /* Columns block */
        .tps-viewer-columns {
          display: flex;
        }

        .tps-viewer-column {
          min-width: 0;
        }

        /* Stat block */
        .tps-viewer-stat {
          text-align: center;
          padding: 1rem;
        }

        .tps-viewer-stat--small .tps-viewer-stat-value {
          font-size: 1.5rem;
        }

        .tps-viewer-stat--medium .tps-viewer-stat-value {
          font-size: 2.5rem;
        }

        .tps-viewer-stat--large .tps-viewer-stat-value {
          font-size: 3.5rem;
        }

        .tps-viewer-stat--xlarge .tps-viewer-stat-value {
          font-size: 4.5rem;
        }

        .tps-viewer-stat-value {
          font-weight: 700;
          color: #1e293b;
          line-height: 1.2;
        }

        .tps-viewer-stat-prefix,
        .tps-viewer-stat-suffix {
          font-size: 0.6em;
          opacity: 0.8;
        }

        .tps-viewer-stat-label {
          color: #64748b;
          margin-top: 0.5rem;
        }

        .tps-viewer-stat-trend {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .tps-viewer-stat-trend--positive {
          color: #22c55e;
        }

        .tps-viewer-stat-trend--negative {
          color: #ef4444;
        }

        /* Progress block */
        .tps-viewer-progress {
          padding: 0.5rem 0;
        }

        .tps-viewer-progress-label {
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #334155;
        }

        .tps-viewer-progress-bar {
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .tps-viewer-progress-bar--small {
          height: 4px;
        }

        .tps-viewer-progress-bar--medium {
          height: 8px;
        }

        .tps-viewer-progress-bar--large {
          height: 12px;
        }

        .tps-viewer-progress-fill {
          height: 100%;
          background: #3b82f6;
          transition: width 0.3s ease;
        }

        .tps-viewer-progress-value {
          margin-top: 0.25rem;
          font-size: 0.875rem;
          color: #64748b;
        }

        /* Quote block */
        .tps-viewer-quote {
          margin: 1.5rem 0;
          padding: 1rem 1.5rem;
          font-style: italic;
        }

        .tps-viewer-quote--simple {
          border-left: 4px solid #e2e8f0;
          background: transparent;
        }

        .tps-viewer-quote--bordered {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }

        .tps-viewer-quote--highlighted {
          background: #f8fafc;
          border-radius: 8px;
        }

        .tps-viewer-quote-content {
          margin: 0 0 0.75rem;
          font-size: 1.125rem;
          color: #334155;
        }

        .tps-viewer-quote-footer {
          font-size: 0.875rem;
          color: #64748b;
          font-style: normal;
        }

        .tps-viewer-quote-author {
          font-weight: 500;
        }

        /* Footer */
        .tps-viewer-footer {
          margin-top: 3rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 0.875rem;
        }
      `}
      </style>
    </div>
  )
}
