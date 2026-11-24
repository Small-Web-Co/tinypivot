<script setup lang="ts">
import { computed, reactive } from 'vue'
import {
  estimateTokens,
  formatTokens,
  formatUsd,
  modelRates,
  usdSavedPerAnalysis,
  WEEKS_PER_MONTH,
} from '../../site/savings'

const PRO_MONTHLY_USD = 19

const input = reactive({
  rows: 2000,
  cols: 8,
  followUps: 4,
  perWeek: 20,
  people: 1,
  cached: true,
})

const sliders = [
  { key: 'rows', label: 'Rows per result', min: 250, max: 10000, step: 250 },
  { key: 'cols', label: 'Columns', min: 2, max: 30, step: 1 },
  { key: 'followUps', label: 'Follow-up questions', min: 1, max: 10, step: 1 },
  { key: 'perWeek', label: 'Analyses per person / week', min: 5, max: 80, step: 5 },
  { key: 'people', label: 'People', min: 1, max: 25, step: 1 },
] as const

const estimate = computed(() => estimateTokens(input))
const analysesPerMonth = computed(() => input.perWeek * WEEKS_PER_MONTH * input.people)

const byModel = computed(() => {
  const rows = modelRates.map((rate) => {
    const perAnalysis = usdSavedPerAnalysis(estimate.value, rate)
    return { name: rate.name, perAnalysis, monthly: perAnalysis * analysesPerMonth.value }
  })
  const max = Math.max(...rows.map(r => r.monthly), PRO_MONTHLY_USD)
  return rows.map(r => ({ ...r, pct: Math.max(2, (r.monthly / max) * 100) }))
})

const reference = computed(() => byModel.value[1])
const proMarkerPct = computed(() => {
  const max = Math.max(...byModel.value.map(r => r.monthly), PRO_MONTHLY_USD)
  return (PRO_MONTHLY_USD / max) * 100
})
</script>

<template>
  <div class="calc">
    <form class="calc-inputs" @submit.prevent>
      <label v-for="s in sliders" :key="s.key" class="calc-field">
        <span class="calc-field-top">
          <span>{{ s.label }}</span>
          <output class="mono">{{ input[s.key].toLocaleString('en-US') }}</output>
        </span>
        <input v-model.number="input[s.key]" type="range" :min="s.min" :max="s.max" :step="s.step">
      </label>
      <label class="calc-check">
        <input v-model="input.cached" type="checkbox">
        <span>Prompt caching on (follow-ups re-read input at 10%)</span>
      </label>
    </form>

    <div class="calc-out">
      <dl class="calc-metrics">
        <div>
          <dt class="label">
            Tokens saved / analysis
          </dt>
          <dd>{{ formatTokens(estimate.totalSaved) }}</dd>
        </div>
        <div>
          <dt class="label">
            Saved / month · {{ reference.name }}
          </dt>
          <dd>{{ formatUsd(reference.monthly) }}</dd>
        </div>
        <div>
          <dt class="label">
            Analyses / month
          </dt>
          <dd>{{ Math.round(analysesPerMonth).toLocaleString('en-US') }}</dd>
        </div>
      </dl>

      <div class="calc-models">
        <p class="label calc-models-head">
          <span>Monthly savings by model</span>
          <span class="calc-pro-key">┊ Pro ${{ PRO_MONTHLY_USD }}/mo</span>
        </p>
        <div v-for="row in byModel" :key="row.name" class="calc-model">
          <span class="calc-model-name">{{ row.name }}</span>
          <span class="calc-model-val mono">{{ formatUsd(row.monthly) }}</span>
          <span class="calc-track">
            <span class="calc-bar" :style="{ width: `${row.pct}%` }" />
            <span class="calc-pro" :style="{ left: `${proMarkerPct}%` }" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calc {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper);
}

.calc-inputs {
  display: grid;
  gap: 18px;
  padding: 20px;
  border-bottom: 1px solid var(--rule-strong);
}

.calc-field {
  display: grid;
  gap: 6px;
  font-size: 0.98rem;
}

.calc-field-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.calc-field output {
  font-size: 0.85rem;
  font-weight: 500;
}

input[type='range'] {
  width: 100%;
  height: 28px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.calc-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.95rem;
  color: var(--ink-muted);
}

.calc-check input {
  width: 20px;
  height: 20px;
  margin-top: 3px;
  flex: none;
  accent-color: var(--accent);
}

.calc-out {
  display: grid;
  gap: 24px;
  padding: 20px;
  background: var(--win);
  color: var(--win-ink);
}

.calc-out .label {
  color: var(--win-muted);
}

.calc-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
}

.calc-metrics dd {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 500;
  color: var(--win-accent);
}

.calc-models {
  display: grid;
  gap: 12px;
}

.calc-models-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.calc-pro-key {
  color: #fbbf24 !important;
}

.calc-model {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 12px;
  font-size: 0.9rem;
}

.calc-model-val {
  color: var(--win-accent);
}

.calc-track {
  position: relative;
  grid-column: 1 / -1;
  height: 8px;
  border-radius: 2px;
  background: var(--win-raised);
}

.calc-bar {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: var(--win-accent);
  transition: width 0.25s;
}

.calc-pro {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 0;
  border-left: 1px dashed #fbbf24;
}

@media (min-width: 900px) {
  .calc {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  }

  .calc-inputs {
    border-right: 1px solid var(--rule-strong);
    border-bottom: 0;
  }

  .calc-inputs,
  .calc-out {
    padding: 28px;
  }
}
</style>
