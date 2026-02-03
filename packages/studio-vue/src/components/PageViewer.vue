<script setup lang="ts">
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
import { DataGrid } from '@smallwebco/tinypivot-vue'
import { computed } from 'vue'

// Import styles
import '@smallwebco/tinypivot-studio/style.css'
import '@smallwebco/tinypivot-vue/style.css'

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
}

const props = defineProps<PageViewerProps>()

// Interactive mode based on share settings
const isInteractive = computed(() => {
  if (!props.share)
    return false
  return props.share.settings.accessLevel === 'interact'
})

// Check if export is allowed
const allowExport = computed(() => {
  if (!props.share)
    return false
  return props.share.settings.allowExport
})

// Render blocks in read-only mode
const renderableBlocks = computed(() => props.page.blocks || [])

// Helper to get heading tag
function getHeadingTag(level: 1 | 2 | 3 | 4 | 5 | 6): string {
  return `h${level}`
}

// Helper to get callout icon
function getCalloutIcon(style: CalloutBlock['style']): string {
  const icons: Record<CalloutBlock['style'], string> = {
    info: 'ℹ️',
    warning: '⚠️',
    success: '✅',
    error: '❌',
    note: '📝',
    tip: '💡',
  }
  return icons[style]
}

// Helper to get callout class
function getCalloutClass(style: CalloutBlock['style']): string {
  return `tps-viewer-callout--${style}`
}

// Helper to get progress percentage
function getProgressPercentage(block: ProgressBlock): number {
  const max = block.max ?? 100
  return Math.min(100, Math.max(0, (block.value / max) * 100))
}

// Helper to get stat size class
function getStatSizeClass(size: StatBlock['size']): string {
  return `tps-viewer-stat--${size || 'medium'}`
}

// Helper to get trend class
function getTrendClass(trend: StatBlock['trend']): string {
  if (!trend)
    return ''
  const direction = trend.direction
  const isPositive = trend.positive ?? (direction === 'up')
  return isPositive ? 'tps-viewer-stat-trend--positive' : 'tps-viewer-stat-trend--negative'
}

// Helper to get trend arrow
function getTrendArrow(direction: 'up' | 'down' | 'flat'): string {
  const arrows = { up: '↑', down: '↓', flat: '→' }
  return arrows[direction]
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

// Export PDF handler
function handleExportPDF() {
  window.print()
}
</script>

<template>
  <div class="tps-page-viewer">
    <!-- Header -->
    <header v-if="page.title" class="tps-viewer-header">
      <div class="tps-viewer-header-content">
        <h1>{{ page.title }}</h1>
        <p v-if="page.description" class="tps-viewer-description">
          {{ page.description }}
        </p>
      </div>
      <button
        v-if="allowExport"
        class="tps-btn-export"
        @click="handleExportPDF"
      >
        Export PDF
      </button>
    </header>

    <!-- Content -->
    <main class="tps-viewer-content">
      <div
        v-for="block in renderableBlocks"
        :key="block.id"
        class="tps-viewer-block"
      >
        <!-- Text block -->
        <div
          v-if="isTextBlock(block)"
          class="tps-viewer-text"
          :class="{ [`tps-viewer-text--${block.align}`]: block.align }"
          v-html="block.content"
        />

        <!-- Heading block -->
        <component
          :is="getHeadingTag(block.level)"
          v-else-if="isHeadingBlock(block)"
          class="tps-viewer-heading"
          :class="{ [`tps-viewer-heading--${block.align}`]: block.align }"
        >
          {{ block.content }}
        </component>

        <!-- Widget block -->
        <div v-else-if="isWidgetBlock(block)" class="tps-viewer-widget">
          <h3 v-if="block.showTitle !== false && (block.titleOverride || block.widgetId)" class="tps-viewer-widget-title">
            {{ block.titleOverride || 'Widget' }}
          </h3>
          <div class="tps-viewer-widget-content" :style="{ height: typeof block.height === 'number' ? `${block.height}px` : block.height }">
            <DataGrid
              :data="[]"
              :show-controls="isInteractive"
              :show-pivot="false"
              :enable-export="allowExport"
            />
          </div>
        </div>

        <!-- Widget Grid block -->
        <div v-else-if="isWidgetGridBlock(block)" class="tps-viewer-widget-grid" :style="{ '--columns': block.columns, '--gap': `${block.gap || 16}px` }">
          <div
            v-for="widget in block.widgets"
            :key="widget.widgetId"
            class="tps-viewer-grid-widget"
            :style="{
              gridColumn: `span ${widget.width}`,
              gridRow: `span ${widget.height}`,
            }"
          >
            <h4 v-if="widget.showTitle !== false && widget.titleOverride" class="tps-viewer-widget-title">
              {{ widget.titleOverride }}
            </h4>
            <DataGrid
              :data="[]"
              :show-controls="isInteractive"
              :show-pivot="false"
              :enable-export="allowExport"
            />
          </div>
        </div>

        <!-- Callout block -->
        <div
          v-else-if="isCalloutBlock(block)"
          class="tps-viewer-callout"
          :class="getCalloutClass(block.style)"
        >
          <span class="tps-viewer-callout-icon">{{ block.icon || getCalloutIcon(block.style) }}</span>
          <div class="tps-viewer-callout-body">
            <strong v-if="block.title" class="tps-viewer-callout-title">{{ block.title }}</strong>
            <div v-html="block.content" />
          </div>
        </div>

        <!-- Divider block -->
        <hr v-else-if="isDividerBlock(block)" class="tps-viewer-divider">

        <!-- Image block -->
        <figure
          v-else-if="isImageBlock(block)"
          class="tps-viewer-image"
          :class="{ [`tps-viewer-image--${block.align}`]: block.align }"
        >
          <img
            :src="block.src"
            :alt="block.alt || ''"
            :style="{
              width: typeof block.width === 'number' ? `${block.width}px` : block.width,
              height: block.height ? `${block.height}px` : undefined,
              objectFit: block.objectFit,
              borderRadius: block.shape === 'circle' ? '50%' : block.shape === 'rounded' ? '8px' : undefined,
            }"
          >
          <figcaption v-if="block.caption" class="tps-viewer-image-caption">
            {{ block.caption }}
          </figcaption>
        </figure>

        <!-- Columns block -->
        <div
          v-else-if="isColumnsBlock(block)"
          class="tps-viewer-columns"
          :style="{ gap: `${block.gap || 16}px` }"
        >
          <div
            v-for="column in block.columns"
            :key="column.id"
            class="tps-viewer-column"
            :style="{ flex: column.width }"
          >
            <!-- Recursively render nested blocks -->
            <div
              v-for="nestedBlock in column.blocks"
              :key="nestedBlock.id"
              class="tps-viewer-nested-block"
            >
              <!-- Note: In production, this should use a recursive component -->
              <div v-if="isTextBlock(nestedBlock)" v-html="nestedBlock.content" />
              <component
                :is="getHeadingTag(nestedBlock.level)"
                v-else-if="isHeadingBlock(nestedBlock)"
              >
                {{ nestedBlock.content }}
              </component>
            </div>
          </div>
        </div>

        <!-- Stat block -->
        <div
          v-else-if="isStatBlock(block)"
          class="tps-viewer-stat"
          :class="getStatSizeClass(block.size)"
        >
          <div class="tps-viewer-stat-value" :style="{ color: block.color }">
            <span v-if="block.prefix" class="tps-viewer-stat-prefix">{{ block.prefix }}</span>
            {{ block.value }}
            <span v-if="block.suffix" class="tps-viewer-stat-suffix">{{ block.suffix }}</span>
          </div>
          <div class="tps-viewer-stat-label">
            {{ block.label }}
          </div>
          <div
            v-if="block.trend"
            class="tps-viewer-stat-trend"
            :class="getTrendClass(block.trend)"
          >
            <span class="tps-viewer-stat-trend-arrow">{{ getTrendArrow(block.trend.direction) }}</span>
            <span v-if="block.trend.value">{{ block.trend.value }}</span>
          </div>
        </div>

        <!-- Progress block -->
        <div
          v-else-if="isProgressBlock(block)"
          class="tps-viewer-progress"
          :class="`tps-viewer-progress--${block.variant || 'bar'}`"
        >
          <div v-if="block.label" class="tps-viewer-progress-label">
            {{ block.label }}
          </div>
          <div
            v-if="block.variant === 'bar' || !block.variant"
            class="tps-viewer-progress-bar"
            :class="`tps-viewer-progress-bar--${block.size || 'medium'}`"
          >
            <div
              class="tps-viewer-progress-fill"
              :style="{ width: `${getProgressPercentage(block)}%`, backgroundColor: block.color }"
            />
          </div>
          <div v-if="block.showValue" class="tps-viewer-progress-value">
            {{ Math.round(getProgressPercentage(block)) }}%
          </div>
        </div>

        <!-- Spacer block -->
        <div
          v-else-if="isSpacerBlock(block)"
          class="tps-viewer-spacer"
          :style="{ height: `${block.height}px` }"
        />

        <!-- Quote block -->
        <blockquote
          v-else-if="isQuoteBlock(block)"
          class="tps-viewer-quote"
          :class="`tps-viewer-quote--${block.style || 'simple'}`"
        >
          <p class="tps-viewer-quote-content">
            {{ block.content }}
          </p>
          <footer v-if="block.author" class="tps-viewer-quote-footer">
            <cite class="tps-viewer-quote-author">{{ block.author }}</cite>
            <span v-if="block.source" class="tps-viewer-quote-source">, {{ block.source }}</span>
          </footer>
        </blockquote>
      </div>
    </main>

    <!-- Footer -->
    <footer v-if="share?.settings.showAuthor && page.createdBy" class="tps-viewer-footer">
      <span>Created by {{ page.createdBy }}</span>
    </footer>
  </div>
</template>

<style scoped>
.tps-page-viewer {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Header styles */
.tps-viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e2e8f0;
}

.tps-viewer-header-content {
  flex: 1;
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

.tps-btn-export {
  padding: 0.5rem 1rem;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.tps-btn-export:hover {
  background: #4338ca;
}

@media print {
  .tps-btn-export {
    display: none !important;
  }
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

/* Spacer block */
.tps-viewer-spacer {
  /* Height is set inline */
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
</style>
