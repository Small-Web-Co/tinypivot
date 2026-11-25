<script setup lang="ts">
/**
 * The hero: three real TinyPivot charts, drawn live by the library from the recorded Acme session's
 * totals, each with its question and an answer whose numbers the Studio's checker finds in the data.
 * It turns every few seconds, each chart in another TinyPivot theme; hovering or focusing it holds
 * the current one, and it never turns for visitors who prefer reduced motion.
 */
import type { D3ChartSpec } from '@smallwebco/tinypivot-core/d3'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { markClaims } from '../../../packages/mcp/app/runs'
import D3Chart from '../../../packages/vue/src/components/D3Chart.vue'
import { heroSlides, slideClaims, slideTheme } from '../../site/heroCharts'
import { themeName } from '../../site/reel/scenes'

const HOLD_MS = 7000

const facts = [
  { value: '44,714', label: 'rows read on your machine' },
  { value: '0', label: 'raw rows sent to the model' },
  { value: '✓', label: 'every number checked against the data' },
] as const

const active = ref(0)
const held = ref(false)
const slide = computed(() => heroSlides[active.value])
const spec = computed<D3ChartSpec>(() => ({ config: slide.value.config, data: slide.value.rows, theme: slideTheme(slide.value), animate: true }))
const claims = computed(() => slideClaims(slide.value))
const answer = computed(() => markClaims(slide.value.answer, claims.value))
const found = computed(() => claims.value.filter(claim => claim.status === 'found').length)
const surface = computed(() => ({ background: spec.value.theme.surface }))

let timer: ReturnType<typeof setInterval> | undefined

function show(index: number) {
  active.value = (index + heroSlides.length) % heroSlides.length
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  timer = setInterval(() => {
    if (!held.value && document.visibilityState === 'visible')
      show(active.value + 1)
  }, HOLD_MS)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <figure
    class="hc"
    aria-label="Three questions answered with TinyPivot charts, each answer checked against the data"
    @mouseenter="held = true"
    @mouseleave="held = false"
    @focusin="held = true"
    @focusout="held = false"
  >
    <figcaption class="hc-bar">
      <span>TinyPivot Studio</span>
      <span>127.0.0.1</span>
    </figcaption>

    <div class="hc-question">
      <p class="hc-prompt">
        {{ slide.question }}
      </p>
      <p class="hc-meta">
        {{ slide.askedIn }} · {{ themeName(slide.theme) }} theme
      </p>
    </div>

    <div class="hc-chart" :style="surface">
      <D3Chart :key="slide.id" :spec="spec" />
    </div>

    <div class="hc-answer">
      <p class="hc-text">
        <template v-for="(piece, index) in answer" :key="index">
          <template v-if="typeof piece === 'string'">
            {{ piece }}
          </template>
          <mark v-else :class="`hc-claim-${piece.status}`" :title="piece.where ? `In the data: ${piece.where}` : undefined">{{ piece.text }}</mark>
        </template>
      </p>
      <p class="hc-badge">
        ✓ {{ found }} of {{ claims.length }} numbers found in the data
      </p>
    </div>

    <div class="hc-tabs" role="tablist" aria-label="Questions">
      <button
        v-for="(item, index) in heroSlides"
        :key="item.id"
        type="button"
        role="tab"
        class="hc-tab"
        :aria-selected="index === active"
        @click="show(index)"
      >
        {{ item.config.type === 'choropleth' ? 'Map' : item.config.type === 'slope' ? 'Slope' : 'Bullet' }}
      </button>
    </div>

    <ul class="hc-facts">
      <li v-for="fact in facts" :key="fact.label">
        <strong>{{ fact.value }}</strong>
        <span>{{ fact.label }}</span>
      </li>
    </ul>
  </figure>
</template>

<style scoped>
.hc {
  margin: 0;
  border: 2px solid var(--ink);
  background: var(--paper-raised);
  box-shadow: 6px 6px 0 var(--ink);
}

.hc-bar {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--ink);
  color: var(--paper);
  font: 500 0.72rem/1 var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hc-question {
  padding: 16px 18px 10px;
}

.hc-prompt {
  margin: 0;
  padding-left: 12px;
  border-left: 4px solid var(--accent);
  font: 400 1.45rem/1.2 var(--font-display);
}

.hc-meta {
  margin: 6px 0 0;
  color: var(--ink-muted);
  font: 0.78rem/1.4 var(--font-mono);
}

/* The chart sits on its theme's own surface, edge to edge, like a screen in the window. */
.hc-chart {
  height: 300px;
  padding: 10px 12px 6px;
  border-block: 2px solid var(--ink);
  transition: background 300ms ease;
}

.hc-chart :deep(.vpg-d3-host) {
  min-height: 0;
}

.hc-answer {
  padding: 12px 18px 6px;
}

.hc-text {
  margin: 0;
  font: 1.05rem/1.45 var(--font-body);
}

.hc-text mark {
  background: none;
  color: inherit;
  text-decoration: underline 2px var(--ink-muted);
  text-underline-offset: 4px;
}

.hc-claim-found {
  text-decoration-color: var(--plus);
}

.hc-badge {
  display: inline-block;
  margin: 8px 0 0;
  padding: 3px 10px;
  border: 1.5px solid var(--plus);
  background: var(--ledger);
  color: var(--plus);
  font: 0.78rem/1.5 var(--font-mono);
}

.hc-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 18px 14px;
}

.hc-tab {
  padding: 4px 12px;
  border: 1.5px solid var(--ink);
  background: transparent;
  color: var(--ink);
  font: 500 0.7rem/1.4 var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.hc-tab[aria-selected='true'] {
  background: var(--ink);
  color: var(--paper);
}

.hc-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  border-top: 2px solid var(--ink);
  list-style: none;
}

.hc-facts li {
  display: grid;
  gap: 2px;
  padding: 10px 14px;
  border-right: 2px solid var(--ink);
}

.hc-facts li:last-child {
  border-right: 0;
}

.hc-facts strong {
  font: 400 1.5rem/1 var(--font-display);
}

.hc-facts span {
  color: var(--ink-muted);
  font: 0.68rem/1.35 var(--font-mono);
  letter-spacing: 0.04em;
}
</style>
