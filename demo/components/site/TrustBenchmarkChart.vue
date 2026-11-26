<script setup lang="ts">
import { computed, ref } from 'vue'
import { TRUST_BENCH_TOTALS, trustBenchRows } from '../../site/whitepaper'

type MetricTab = 'accuracy' | 'efficiency'
const activeTab = ref<MetricTab>('accuracy')

interface BarGroup {
  id: string
  label: string
  sub: string
  baseline: number
  free: number
  pro: number
  delta: string
}

const accuracyGroups = computed<BarGroup[]>(() => [
  ...trustBenchRows.map((row) => {
    const diff = row.proPct - row.baselinePct
    return {
      id: row.id,
      label: row.id === 'inkling'
        ? 'Inkling 2 Mini'
        : row.id === 'deepseek'
          ? 'DeepSeek V4.1'
          : row.id === 'haiku'
            ? 'Claude Haiku 4.5'
            : 'Claude Sonnet',
      sub: row.hardware,
      baseline: row.baselinePct,
      free: row.freePct,
      pro: row.proPct,
      delta: diff > 0 ? `+${diff} pts` : '100% parity',
    }
  }),
  {
    id: 'combined',
    label: 'Combined',
    sub: `${TRUST_BENCH_TOTALS.totalModelTasks} tasks/arm`,
    baseline: TRUST_BENCH_TOTALS.baselinePct,
    free: TRUST_BENCH_TOTALS.freePct,
    pro: TRUST_BENCH_TOTALS.proPct,
    delta: `+${TRUST_BENCH_TOTALS.proPct - TRUST_BENCH_TOTALS.baselinePct} pts`,
  },
])

interface EfficiencyItem {
  id: string
  label: string
  metric: string
  baselineVal: number
  proVal: number
  baselineText: string
  proText: string
  delta: string
}

const efficiencyItems: readonly EfficiencyItem[] = [
  {
    id: 'sonnet-cost',
    label: 'Claude Sonnet · Total Cost',
    metric: 'USD across 6 traps',
    baselineVal: 0.5677,
    proVal: 0.5407,
    baselineText: '$0.57 (Python)',
    proText: '$0.54 (TP Pro)',
    delta: '−4.8% vs Python',
  },
  {
    id: 'deepseek-speed',
    label: 'DeepSeek V4.1 · Avg Speed',
    metric: 'Seconds per task',
    baselineVal: 40.0,
    proVal: 36.2,
    baselineText: '40.0s (bare SQL)',
    proText: '36.2s (TP Pro)',
    delta: '10% faster',
  },
  {
    id: 'deepseek-out',
    label: 'DeepSeek V4.1 · Output Tokens',
    metric: 'Generated tokens across 6 traps',
    baselineVal: 19.9,
    proVal: 15.7,
    baselineText: '19.9k (bare SQL)',
    proText: '15.7k (TP Pro)',
    delta: '−21% output',
  },
  {
    id: 'inkling-mem',
    label: 'Inkling 2 Mini · Repeat Schema Tokens',
    metric: 'Recursive Data Memory warm vs cold',
    baselineVal: 32.5,
    proVal: 17.1,
    baselineText: '32.5k (cold)',
    proText: '17.1k (warm)',
    delta: '−47% tokens',
  },
]
</script>

<template>
  <figure class="tbchart" aria-label="Grouped column chart comparing Baseline, TinyPivot Free, and TinyPivot Pro">
    <div class="tbchart-head">
      <div>
        <p class="label">
          Visual Comparison · Baseline vs. TinyPivot Free vs. TinyPivot Pro
        </p>
      </div>
      <div class="tbchart-tabs" role="tablist" aria-label="Benchmark chart view">
        <button
          type="button"
          role="tab"
          class="tbchart-tab"
          :aria-selected="activeTab === 'accuracy'"
          @click="activeTab = 'accuracy'"
        >
          Accuracy (%)
        </button>
        <button
          type="button"
          role="tab"
          class="tbchart-tab"
          :aria-selected="activeTab === 'efficiency'"
          @click="activeTab = 'efficiency'"
        >
          Speed, Tokens &amp; Cost
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'accuracy'" class="tbchart-body">
      <div class="tbchart-legend mono">
        <span><i class="swatch swatch-base" /> Baseline (Bare SQL / Python)</span>
        <span><i class="swatch swatch-free" /> TinyPivot Free</span>
        <span><i class="swatch swatch-pro" /> TinyPivot Pro</span>
      </div>

      <div class="col-chart">
        <div
          v-for="g in accuracyGroups"
          :key="g.id"
          class="col-group"
          :class="{ 'col-group-total': g.id === 'combined' }"
        >
          <span class="col-delta mono">{{ g.delta }}</span>
          <div class="col-bars">
            <div class="col-bar-wrap">
              <span class="col-val mono">{{ g.baseline }}%</span>
              <div class="col-track">
                <div class="col-bar bar-base" :style="{ height: `${g.baseline}%` }" />
              </div>
            </div>
            <div class="col-bar-wrap">
              <span class="col-val mono">{{ g.free }}%</span>
              <div class="col-track">
                <div class="col-bar bar-free" :style="{ height: `${g.free}%` }" />
              </div>
            </div>
            <div class="col-bar-wrap">
              <span class="col-val col-val-pro mono">{{ g.pro }}%</span>
              <div class="col-track">
                <div class="col-bar bar-pro" :style="{ height: `${g.pro}%` }" />
              </div>
            </div>
          </div>
          <div class="col-x">
            <strong>{{ g.label }}</strong>
            <span>{{ g.sub }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="tbchart-body">
      <div class="tbchart-legend mono">
        <span><i class="swatch swatch-base" /> Baseline (Lower is better)</span>
        <span><i class="swatch swatch-pro" /> TinyPivot Pro</span>
      </div>

      <div class="eff-grid">
        <div v-for="item in efficiencyItems" :key="item.id" class="eff-card">
          <div class="eff-top">
            <div>
              <strong>{{ item.label }}</strong>
              <span class="eff-sub">{{ item.metric }}</span>
            </div>
            <span class="col-delta mono">{{ item.delta }}</span>
          </div>
          <div class="eff-bars">
            <div class="eff-row">
              <span class="eff-row-lbl mono">{{ item.baselineText }}</span>
              <div class="eff-track">
                <div class="eff-bar bar-base" style="width: 100%" />
              </div>
            </div>
            <div class="eff-row">
              <span class="eff-row-lbl eff-row-pro mono">{{ item.proText }}</span>
              <div class="eff-track">
                <div
                  class="eff-bar bar-pro"
                  :style="{ width: `${Math.round((item.proVal / item.baselineVal) * 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.tbchart {
  margin: 0 0 20px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.tbchart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 12px 14px;
  border-bottom: var(--line);
}

.tbchart-tabs {
  display: inline-flex;
  border: var(--line);
  background: var(--paper-sunk, var(--ledger));
}

.tbchart-tab {
  padding: 6px 12px;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
  cursor: pointer;
}

.tbchart-tab[aria-selected='true'] {
  background: var(--ink);
  color: var(--paper);
}

.tbchart-body {
  padding: 16px 14px 18px;
  display: grid;
  gap: 16px;
}

.tbchart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  font-size: 0.68rem;
  color: var(--ink-muted);
}

.tbchart-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
}

.swatch-base,
.bar-base {
  background: #b9b3a4;
}

.swatch-free,
.bar-free {
  background: #e2c07d;
}

.swatch-pro,
.bar-pro {
  background: #1d7a4f;
}

.col-chart {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.col-group {
  display: grid;
  gap: 8px;
  padding: 12px 10px 10px;
  border: 1px solid var(--rule);
  background: var(--paper-raised, var(--paper));
}

.col-group-total {
  grid-column: 1 / -1;
  background: var(--ledger);
  border-color: var(--ink);
}

.col-delta {
  justify-self: start;
  padding: 2px 6px;
  border: 1px solid #1d7a4f;
  background: rgba(29, 122, 79, 0.1);
  color: #145a39;
  font-size: 0.64rem;
  font-weight: 700;
}

.col-bars {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: end;
}

.col-bar-wrap {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.col-val {
  font-size: 0.64rem;
  color: var(--ink-muted);
}

.col-val-pro {
  font-weight: 700;
  color: #145a39;
}

.col-track {
  width: 100%;
  max-width: 34px;
  height: 112px;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: 1px solid var(--ink);
}

.col-bar {
  width: 100%;
  border: 1px solid var(--ink);
  border-bottom: 0;
  transition: height 0.25s ease;
}

.col-x {
  text-align: center;
  font-family: var(--font-mono);
}

.col-x strong {
  display: block;
  font-size: 0.72rem;
  color: var(--ink);
}

.col-x span {
  display: block;
  margin-top: 2px;
  font-size: 0.62rem;
  color: var(--ink-muted);
}

.eff-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.eff-card {
  padding: 12px;
  border: 1px solid var(--rule);
  display: grid;
  gap: 10px;
}

.eff-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.eff-top strong {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--ink);
}

.eff-sub {
  display: block;
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.eff-bars {
  display: grid;
  gap: 6px;
}

.eff-row {
  display: grid;
  gap: 3px;
}

.eff-row-lbl {
  font-size: 0.68rem;
  color: var(--ink-muted);
}

.eff-row-pro {
  font-weight: 700;
  color: #145a39;
}

.eff-track {
  height: 12px;
  background: rgba(0, 0, 0, 0.05);
}

.eff-bar {
  height: 100%;
  border: 1px solid var(--ink);
}

@media (min-width: 760px) {
  .col-chart {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
  }

  .col-group-total {
    grid-column: auto;
  }

  .eff-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
