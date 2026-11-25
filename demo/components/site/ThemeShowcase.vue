<script setup lang="ts">
import type { DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { StoredDataset } from '../../../packages/mcp/src/store'
import { TERMINAL_PALETTES } from '@smallwebco/tinypivot-core'
import { DataGrid } from 'tinypivot'
import { computed, ref } from 'vue'
import { visualWidth } from '../../../packages/mcp/src/card'
import { formatPivotSummary } from '../../../packages/mcp/src/summary'
import { formatTerminalChart } from '../../../packages/mcp/src/terminal-chart'
import { showcaseChart, showcasePivot, showcaseRows, showcaseThemes } from '../../site/showcase'
import { tintTerminal } from '../../site/terminal'
import SegmentedControl from './SegmentedControl.vue'

/**
 * The real library on both sides: the DataGrid component on the left, and on the
 * right the exact text the MCP server prints for the same data, tinted with the
 * same theme's terminal palette.
 */
const views = [
  { value: 'chart', label: 'Chart' },
  { value: 'pivot', label: 'Pivot' },
  { value: 'grid', label: 'Table' },
] as const

const themeId = ref(showcaseThemes[0].id)
const view = ref<DataGridViewMode>('chart')
const theme = computed(() => showcaseThemes.find(t => t.id === themeId.value) ?? showcaseThemes[0])

const dataset = { name: 'Acme revenue', rows: showcaseRows } as unknown as StoredDataset
/** The MCP wraps its cards in a Markdown code fence for chat; a terminal shows only what is inside. */
function terminalCard(text: string): string {
  const lines = text.split('\n')
  const open = lines.findIndex(line => line.startsWith('```'))
  const close = lines.findIndex((line, index) => index > open && line.startsWith('```'))
  return open >= 0 && close > open ? lines.slice(open + 1, close).join('\n') : text
}

const terminalChart = terminalCard(formatTerminalChart(dataset, showcaseChart, { showBranding: true }))
const terminalPivot = terminalCard(formatPivotSummary(dataset, showcasePivot as PivotConfig, undefined, { showBranding: true }))

const terminalText = computed(() => (view.value === 'pivot' ? terminalPivot : terminalChart))
const terminalHtml = computed(() => tintTerminal(terminalText.value))
/** Widest line, so CSS can size the type to fit the pane without wrapping the card. */
const terminalCols = computed(() => Math.max(...terminalText.value.split('\n').map(visualWidth)))

const rgb = (value: readonly number[]) => `rgb(${value.join(' ')})`
const terminalStyle = computed(() => {
  const palette = TERMINAL_PALETTES[theme.value.chart]
  return {
    '--t-text': rgb(palette.text),
    '--t-frame': rgb(palette.border),
    '--t-mark': rgb(palette.accent),
    '--t-muted': rgb(palette.muted),
    '--t-cols': String(terminalCols.value),
  }
})
</script>

<template>
  <div class="showcase">
    <div class="showcase-controls">
      <div class="theme-chips" role="radiogroup" aria-label="Theme">
        <button
          v-for="t in showcaseThemes"
          :key="t.id"
          type="button"
          role="radio"
          class="theme-chip"
          :class="{ classic: !t.isNew }"
          :aria-checked="t.id === themeId"
          @click="themeId = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <SegmentedControl v-model="view" :options="views" label="View" class="view-switch" />
    </div>

    <div class="showcase-panes">
      <figure class="pane">
        <figcaption class="pane-cap">
          <span class="label">Rich</span>
          <span>Web app · Antigravity · Claude Desktop · Cursor</span>
        </figcaption>
        <div class="pane-grid">
          <DataGrid
            :data="showcaseRows"
            :theme="theme.grid"
            :chart-theme="theme.chart"
            :view-mode="view"
            :chart-config="showcaseChart"
            :pivot-config="showcasePivot"
            :initial-height="380"
            :enable-vertical-resize="false"
            :enable-pagination="false"
            :enable-search="false"
            :enable-export="false"
            font-size="sm"
          />
        </div>
      </figure>

      <figure class="pane">
        <figcaption class="pane-cap">
          <span class="label">Terminal</span>
          <span>Claude Code · pi · OpenCode · Rex</span>
        </figcaption>
        <!-- eslint-disable-next-line vue/no-v-html -- our own formatter output, HTML-escaped above -->
        <pre class="terminal" :style="terminalStyle" tabindex="0" v-html="terminalHtml" />
      </figure>
    </div>
  </div>
</template>

<style scoped>
.showcase {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.showcase-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.theme-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.theme-chips::-webkit-scrollbar {
  display: none;
}

.theme-chip {
  flex: none;
  min-height: var(--tap);
  padding: 0 14px;
  border: var(--line);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.theme-chip.classic {
  border-style: dashed;
  font-weight: 500;
}

.theme-chip[aria-checked='true'] {
  background: var(--ink);
  color: var(--paper);
  box-shadow: 3px 3px 0 var(--accent);
}

.view-switch {
  max-width: 320px;
}

.showcase-panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.pane {
  container-type: inline-size;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.pane-cap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.pane-grid {
  min-width: 0;
}

/* Show the result, not the builder: hide the grid's own toolbars and side panels. */
.pane-grid :deep(.vpg-data-grid) {
  margin-bottom: 0;
}

.pane-grid :deep(.vpg-toolbar),
.pane-grid :deep(.vpg-chart-type-bar),
.pane-grid :deep(.vpg-chart-fields-panel),
.pane-grid :deep(.vpg-chart-config-panel),
.pane-grid :deep(.vpg-pivot-config-panel),
.pane-grid :deep(.vpg-skeleton-header),
.pane-grid :deep(.vpg-config-bar),
.pane-grid :deep(.vpg-watermark),
.pane-grid :deep(.vpg-demo-banner) {
  display: none !important;
}

.pane-grid :deep(.vpg-chart-builder-content) {
  display: flex !important;
}

.pane-grid :deep(.vpg-chart-preview-panel),
.pane-grid :deep(.vpg-pivot-main) {
  flex: 1 1 100% !important;
  width: 100% !important;
  min-height: 0 !important;
  border: 0 !important;
}

.terminal {
  min-width: 0;
  min-height: 100%;
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  border: var(--line);
  background: #0e0e0e;
  color: var(--t-text);
  /* Monospace advance is 0.6em: size the type so the widest line fills the pane. */
  font-size: clamp(7px, calc((100cqi - 34px) / var(--t-cols) / 0.6), 13px);
  line-height: 1.35;
}

.terminal :deep(.t-frame) {
  color: var(--t-frame);
}

.terminal :deep(.t-mark) {
  color: var(--t-mark);
}

@media (min-width: 640px) {
  .showcase-controls {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

}

@media (min-width: 1024px) {
  .showcase-panes {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  }
}
</style>
