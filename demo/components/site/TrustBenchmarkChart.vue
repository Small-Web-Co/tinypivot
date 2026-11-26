<script setup lang="ts">
import { computed, ref } from 'vue'
import { categoryBenchRows, TRUST_BENCH_TOTALS, trustBenchRows } from '../../site/whitepaper'

type MetricTab = 'accuracy' | 'efficiency' | 'categories'
const activeTab = ref<MetricTab>('accuracy')

interface BarGroup {
  id: string
  label: string
  sub: string
  baseline: number
  free: number | null
  pro: number
  delta: string
}

const accuracyGroups = computed<BarGroup[]>(() => [
  ...trustBenchRows.map((row) => {
    const diff = row.proPct - row.baselinePct
    return {
      id: row.id,
      label: row.shortLabel,
      sub: row.hardware,
      baseline: row.baselinePct,
      free: row.freePct,
      pro: row.proPct,
      delta: diff > 0 ? `+${diff} pts` : diff === 0 ? '100% parity' : `${diff} pts†`,
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

const categoryGroups = computed<BarGroup[]>(() =>
  categoryBenchRows.map(c => ({
    id: c.id,
    label: c.label,
    sub: c.sub,
    baseline: c.baselinePct,
    free: c.id === 'dabstep' ? null : c.freePct,
    pro: c.proPct,
    delta: c.delta,
  })),
)

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
    id: 'hard-ds-speed',
    label: 'All 5 Models · Hard Data Science Latency',
    metric: 'Avg seconds per task across 30 runs/arm (80% → 100% acc)',
    baselineVal: 39.7,
    proVal: 19.3,
    baselineText: '39.7s (Baseline · 80%)',
    proText: '19.3s (TP Pro · 100%)',
    delta: '2.1× faster (−51%)',
  },
  {
    id: 'inkling-speed',
    label: 'Inkling 2 Mini · Avg Latency & Output',
    metric: 'Mac local · 18 unhinted tasks (78% → 100% acc)',
    baselineVal: 46.1,
    proVal: 26.0,
    baselineText: '46.1s · 24.7k out',
    proText: '26.0s · 12.3k out',
    delta: '−44% faster · −50% out',
  },
  {
    id: 'deepseek-speed',
    label: 'DeepSeek V4.1 · Avg Latency & Turns',
    metric: 'DGX Spark · 18 unhinted tasks',
    baselineVal: 25.7,
    proVal: 15.6,
    baselineText: '25.7s · 4.94 turns',
    proText: '15.6s · 3.44 turns',
    delta: '−39% faster · −30% turns',
  },
  {
    id: 'deepseek-out',
    label: 'DeepSeek V4.1 · Output Tokens',
    metric: 'Total generated tokens across 18 tasks',
    baselineVal: 35.8,
    proVal: 18.7,
    baselineText: '35.8k (bare SQL)',
    proText: '18.7k (TP Pro)',
    delta: '−48% output tokens',
  },
  {
    id: 'sonnet-cost',
    label: 'Claude Sonnet 5.5 · API-Equiv Cost',
    metric: 'Published API pricing (warm cache*) · 18 tasks',
    baselineVal: 1.2202,
    proVal: 1.0134,
    baselineText: '$1.22 (Python · 20.0s)',
    proText: '$1.01 (TP Pro · 18.8s)',
    delta: '−17% cost · −6% faster',
  },
  {
    id: 'inkling-mem',
    label: 'Inkling 2 Mini · Repeat Schema Tokens',
    metric: 'Recursive Data Memory warm vs cold',
    baselineVal: 32.5,
    proVal: 17.1,
    baselineText: '32.5k (cold · 6 turns)',
    proText: '17.1k (warm · 3 turns)',
    delta: '−47% tokens · −50% turns',
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
          Accuracy (5 Models)
        </button>
        <button
          type="button"
          role="tab"
          class="tbchart-tab"
          :aria-selected="activeTab === 'efficiency'"
          @click="activeTab = 'efficiency'"
        >
          Speed, Turns &amp; Tokens
        </button>
        <button
          type="button"
          role="tab"
          class="tbchart-tab"
          :aria-selected="activeTab === 'categories'"
          @click="activeTab = 'categories'"
        >
          Categories &amp; DABstep
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'accuracy'" class="tbchart-body">
      <div class="tbchart-legend mono">
        <span><i class="swatch swatch-base" /> Baseline (Bare SQL / Python)</span>
        <span><i class="swatch swatch-free" /> TinyPivot Free</span>
        <span><i class="swatch swatch-pro" /> TinyPivot Pro</span>
      </div>

      <div class="col-chart col-chart-6">
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
            <div v-if="g.free !== null" class="col-bar-wrap">
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

    <div v-else-if="activeTab === 'efficiency'" class="tbchart-body">
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

    <div v-else class="tbchart-body">
      <div class="tbchart-legend mono">
        <span><i class="swatch swatch-base" /> Baseline</span>
        <span><i class="swatch swatch-free" /> TinyPivot Free (Bench v2)</span>
        <span><i class="swatch swatch-pro" /> TinyPivot Pro</span>
      </div>

      <div class="col-chart col-chart-4">
        <div
          v-for="g in categoryGroups"
          :key="g.id"
          class="col-group"
          :class="{ 'col-group-total': g.id === 'dabstep' }"
        >
          <span class="col-delta mono">{{ g.delta }}</span>
          <div class="col-bars" :class="{ 'col-bars-2': g.free === null }">
            <div class="col-bar-wrap">
              <span class="col-val mono">{{ g.baseline }}%</span>
              <div class="col-track">
                <div class="col-bar bar-base" :style="{ height: `${g.baseline}%` }" />
              </div>
            </div>
            <div v-if="g.free !== null" class="col-bar-wrap">
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
  display: flex;
  flex-wrap: wrap;
  border: var(--line);
  background: var(--paper-sunk, var(--ledger));
}

.tbchart-tab {
  padding: 6px 10px;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.66rem;
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
  gap: 10px;
}

.col-group {
  display: grid;
  gap: 8px;
  padding: 10px 8px;
  border: 1px solid var(--rule);
  background: var(--paper-raised, var(--paper));
}

.col-group-total {
  background: var(--ledger);
  border-color: var(--ink);
}

.col-delta {
  justify-self: start;
  padding: 2px 6px;
  border: 1px solid #1d7a4f;
  background: rgba(29, 122, 79, 0.1);
  color: #145a39;
  font-size: 0.62rem;
  font-weight: 700;
}

.col-bars {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  align-items: end;
}

.col-bars-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 110px;
  margin: 0 auto;
  width: 100%;
}

.col-bar-wrap {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.col-val {
  font-size: 0.62rem;
  color: var(--ink-muted);
}

.col-val-pro {
  font-weight: 700;
  color: #145a39;
}

.col-track {
  width: 100%;
  max-width: 30px;
  height: 108px;
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
  font-size: 0.7rem;
  color: var(--ink);
}

.col-x span {
  display: block;
  margin-top: 2px;
  font-size: 0.6rem;
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

@media (min-width: 680px) {
  .col-chart-6 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .col-chart-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .eff-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 980px) {
  .col-chart-6 {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
