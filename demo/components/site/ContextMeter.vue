<script setup lang="ts">
import type { UnitSegment } from '../../site/charts'
import { allocateCells } from '../../site/charts'
import { estimateTokens, EXAMPLE_WORKLOAD as workload } from '../../site/savings'
import UnitGrid from './UnitGrid.vue'

/**
 * Same workload as the receipt, drawn to one scale: each square is the same
 * number of tokens in both panels, so the difference is the honest picture.
 */
const COLS = 40
const ROWS = 25
const CELLS = COLS * ROWS

const e = estimateTokens(workload)
const withoutTotal = e.withoutInput + e.rewrites
const tokensPerCell = withoutTotal / CELLS

const pastedSegments: UnitSegment[] = [
  { label: 'Rows pasted in', value: e.pasted, fill: 'ink' },
  { label: 'Re-read on follow-ups', value: e.rereads, fill: 'dither' },
  { label: 'Tables rewritten', value: e.rewrites, fill: 'accent' },
]
const summarySegments: UnitSegment[] = [
  { label: 'Schema summary', value: e.withInput, fill: 'ink' },
]

const panels = [
  { id: 'pasted', title: 'Pasted into chat', total: withoutTotal, cells: allocateCells(pastedSegments, tokensPerCell, CELLS) },
  { id: 'tinypivot', title: 'With TinyPivot', total: e.withInput, cells: allocateCells(summarySegments, tokensPerCell, CELLS) },
] as const

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
</script>

<template>
  <figure class="meter">
    <figcaption class="meter-cap">
      <span class="label">Context used · same scale</span>
      <span class="meter-scale">1 square = {{ fmt(tokensPerCell) }} tokens</span>
    </figcaption>

    <div class="meter-panels">
      <section v-for="panel in panels" :key="panel.id" class="meter-panel" :class="panel.id">
        <header class="meter-head">
          <h3 class="meter-title">
            {{ panel.title }}
          </h3>
          <p class="meter-total">
            {{ fmt(panel.total) }} <small>tokens</small>
          </p>
        </header>
        <UnitGrid
          :cols="COLS"
          :rows="ROWS"
          :segments="panel.cells"
          :label="`${panel.title}: ${fmt(panel.total)} tokens, ${panel.cells.reduce((a, c) => a + c.cells, 0)} of ${CELLS} squares filled`"
        />
        <ul class="meter-legend">
          <li v-for="segment in panel.cells" :key="segment.label">
            <span class="swatch" :class="segment.fill" aria-hidden="true" />
            {{ segment.label }} · {{ fmt(segment.value) }}
          </li>
        </ul>
      </section>
    </div>
  </figure>
</template>

<style scoped>
.meter {
  min-width: 0;
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
}

.meter-cap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
  padding: 12px 16px;
  border-bottom: var(--line);
}

.meter-scale {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.meter-panels {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.meter-panel {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  padding: 18px 16px 20px;
}

.meter-panel + .meter-panel {
  border-top: var(--line);
}

.meter-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
}

.meter-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 400;
  line-height: 1.1;
}

.meter-total {
  font-family: var(--font-dot);
  font-size: 1.9rem;
  line-height: 1;
}

.tinypivot .meter-total {
  color: var(--plus);
}

.meter-total small {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-muted);
}

.meter-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.meter-legend li {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.swatch {
  width: 12px;
  height: 12px;
  flex: none;
  border: 1px solid var(--ink);
}

.swatch.ink {
  background: var(--ink);
}

.swatch.dither {
  background: var(--dither-ink);
}

.swatch.accent {
  border-color: var(--accent);
  background: var(--accent);
}

@media (min-width: 900px) {
  .meter-panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .meter-panel {
    padding: 24px 24px 26px;
  }

  .meter-panel + .meter-panel {
    border-top: 0;
    border-left: var(--line);
  }
}
</style>
