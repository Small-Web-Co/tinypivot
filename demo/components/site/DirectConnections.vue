<script setup lang="ts">
import { CONNECT_COMMAND } from '../../site/install'
import { WAREHOUSE_BENCH, WAREHOUSE_BENEFITS, WAREHOUSE_SETUP_URL, warehouseHighlights, WAREHOUSES } from '../../site/warehouses'
import CopyCommand from './CopyCommand.vue'
import StatHighlights from './StatHighlights.vue'

/** Home section body: which warehouses TinyPivot queries directly, why that helps, and the measured gain. */
const highlights = warehouseHighlights()
</script>

<template>
  <div class="direct">
    <ul class="wh-list mono" aria-label="Warehouses TinyPivot queries directly">
      <li v-for="name in WAREHOUSES" :key="name" class="wh">
        {{ name }}
      </li>
    </ul>

    <ol class="benefits">
      <li v-for="(b, i) in WAREHOUSE_BENEFITS" :key="b.title" class="benefit">
        <span class="benefit-n mono">{{ String(i + 1).padStart(2, '0') }}</span>
        <h3 class="benefit-title">
          {{ b.title }}
        </h3>
        <p class="benefit-body">
          {{ b.body }}
        </p>
      </li>
    </ol>

    <StatHighlights :items="highlights" />

    <div class="connect">
      <p class="connect-lbl">
        Already signed in to a warehouse? This finds the sign-in and switches it on:
      </p>
      <CopyCommand source="direct-connections" option="connect" :command="CONNECT_COMMAND" />
    </div>

    <p class="foot">
      Measured with {{ WAREHOUSE_BENCH.model }} on {{ WAREHOUSE_BENCH.questions }} trap questions over BigQuery, two runs each.
      Time is the average per question; cost is all {{ WAREHOUSE_BENCH.runs }} runs at API prices. Every connector is tested against a live warehouse.
      <a :href="WAREHOUSE_SETUP_URL" class="text-link" target="_blank" rel="noopener">
        Setup for each warehouse →
      </a>
    </p>
  </div>
</template>

<style scoped>
.direct {
  display: grid;
  gap: 28px;
}

.wh-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
}

.wh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: var(--line);
  background: var(--paper-raised);
  font-size: 0.82rem;
  font-weight: 700;
}

.benefits {
  display: grid;
  list-style: none;
  border-top: var(--line);
}

.benefit {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 4px 12px;
  padding: 20px 0;
  border-bottom: var(--line);
}

.benefit-n {
  grid-row: span 2;
  padding-top: 6px;
  font-size: 0.78rem;
  color: var(--accent);
}

.benefit-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1.1;
}

.benefit-body {
  color: var(--ink-muted);
}

.connect {
  display: grid;
  gap: 10px;
  max-width: 44rem;
}

.connect-lbl {
  font-size: 0.92rem;
}

.foot {
  max-width: 52rem;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

@media (min-width: 680px) {
  .benefits {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 32px;
  }
}
</style>
