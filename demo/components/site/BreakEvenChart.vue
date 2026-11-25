<script setup lang="ts">
import { computed, useId } from 'vue'
import { breakEvenMonth } from '../../site/charts'
import { formatUsd } from '../../site/savings'

/** Twelve months of cumulative savings against a one-off cost, drawn for a dark panel. */
const props = defineProps<{
  monthlySaving: number
  cost: number
  costLabel: string
}>()

const MONTHS = 12
const PLOT = { left: 4, top: 10, width: 256, height: 84 }
const BAR_WIDTH = 15
const STEP = PLOT.width / MONTHS

const patternId = useId()
const paysBackIn = computed(() => breakEvenMonth(props.monthlySaving, props.cost, MONTHS))
const scaleMax = computed(() => Math.max(props.monthlySaving * MONTHS, props.cost * 1.25))
const toY = (value: number) => PLOT.top + PLOT.height - (value / scaleMax.value) * PLOT.height

const bars = computed(() => Array.from({ length: MONTHS }, (_, i) => {
  const month = i + 1
  const y = toY(props.monthlySaving * month)
  return {
    month,
    x: PLOT.left + i * STEP + (STEP - BAR_WIDTH) / 2,
    y,
    height: Math.max(1, PLOT.top + PLOT.height - y),
    paid: paysBackIn.value !== null && month >= paysBackIn.value,
  }
}))

const summary = computed(() => paysBackIn.value === null
  ? `At this volume ${props.costLabel} does not pay back within a year.`
  : `${props.costLabel} pays for itself in month ${paysBackIn.value}; ${formatUsd(props.monthlySaving * MONTHS)} saved over the year.`)
</script>

<template>
  <figure class="breakeven">
    <figcaption class="breakeven-cap">
      {{ summary }}
    </figcaption>
    <svg viewBox="0 0 264 112" role="img" :aria-label="summary" shape-rendering="crispEdges">
      <defs>
        <pattern :id="patternId" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" class="ink" />
          <rect x="2" y="2" width="2" height="2" class="ink" />
        </pattern>
      </defs>
      <rect
        v-for="bar in bars"
        :key="bar.month"
        :x="bar.x"
        :y="bar.y"
        :width="BAR_WIDTH"
        :height="bar.height"
        :fill="bar.paid ? undefined : `url(#${patternId})`"
        :class="{ paid: bar.paid }"
      />
      <line :x1="PLOT.left" :x2="PLOT.left + PLOT.width" :y1="toY(cost)" :y2="toY(cost)" class="cost-line" />
      <text :x="PLOT.left" :y="toY(cost) - 3" class="cost-text">{{ costLabel }}</text>
      <line :x1="PLOT.left" :x2="PLOT.left + PLOT.width" :y1="PLOT.top + PLOT.height" :y2="PLOT.top + PLOT.height" class="axis" />
      <text
        v-for="bar in bars"
        :key="`m${bar.month}`"
        :x="bar.x + BAR_WIDTH / 2"
        y="106"
        text-anchor="middle"
        class="tick"
      >{{ bar.month }}</text>
    </svg>
  </figure>
</template>

<style scoped>
.breakeven {
  display: grid;
  gap: 10px;
  margin: 0;
}

.breakeven-cap {
  font-size: 0.95rem;
  color: var(--win-ink);
}

svg {
  display: block;
  width: 100%;
  height: auto;
}

.ink {
  fill: var(--win-ink);
}

.paid {
  fill: var(--win-accent);
}

.cost-line {
  stroke: #fbbf24;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.axis {
  stroke: var(--win-muted);
  stroke-width: 1;
}

.cost-text,
.tick {
  font-family: var(--font-mono);
  font-size: 6.5px;
}

.cost-text {
  fill: #fbbf24;
}

.tick {
  fill: var(--win-muted);
}
</style>
