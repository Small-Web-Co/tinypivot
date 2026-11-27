<script setup lang="ts">
import { ref } from 'vue'
import { buildModelChartRows, metricColumns } from '../../site/modelChart'

const rows = buildModelChartRows()
const hovered = ref<string | null>(null)
</script>

<template>
  <figure class="mc" aria-label="Accuracy, time and cost for five AI models, alone and with TinyPivot Pro">
    <div class="mc-legend mono" aria-hidden="true">
      <span class="mc-key"><i class="mc-swatch mc-alone" />AI model alone</span>
      <span class="mc-key"><i class="mc-swatch mc-pro" />With TinyPivot Pro</span>
    </div>

    <div class="mc-grid" role="table">
      <div class="mc-row mc-head" role="row">
        <span class="mc-model-h mono" role="columnheader">Model</span>
        <span v-for="col in metricColumns" :key="col.id" class="mc-col-h" role="columnheader">
          <strong>{{ col.title }}</strong>
          <span class="mono">{{ col.unit }}</span>
        </span>
      </div>

      <div
        v-for="row in rows"
        :key="row.id"
        class="mc-row"
        :class="{ 'mc-row-hover': hovered === row.id }"
        role="row"
        @mouseenter="hovered = row.id"
        @mouseleave="hovered = null"
      >
        <div class="mc-model" role="rowheader">
          <span class="mc-model-name">{{ row.model }}</span>
          <span class="mc-model-where mono">{{ row.where }}</span>
        </div>

        <div v-for="col in metricColumns" :key="col.id" class="mc-cell" role="cell">
          <span class="mc-cell-title mono">{{ col.title }}</span>
          <div class="mc-bar-row" :title="`${row.model} alone: ${row.cells[col.id].alone.text}`">
            <span class="mc-track"><span class="mc-fill mc-alone" :style="{ width: `${row.cells[col.id].alone.pct}%` }" /></span>
            <span class="mc-val mono">{{ row.cells[col.id].alone.text }}</span>
          </div>
          <div class="mc-bar-row" :title="`${row.model} with TinyPivot Pro: ${row.cells[col.id].pro.text}`">
            <span class="mc-track"><span class="mc-fill mc-pro" :style="{ width: `${row.cells[col.id].pro.pct}%` }" /></span>
            <span class="mc-val mc-val-pro mono">{{ row.cells[col.id].pro.text }}</span>
          </div>
          <span
            v-if="row.cells[col.id].change"
            class="mc-change mono"
            :class="{ 'mc-better': row.cells[col.id].better === true, 'mc-worse': row.cells[col.id].better === false }"
          >
            <span v-if="row.cells[col.id].rose !== null" class="mc-arrow" aria-hidden="true">{{ row.cells[col.id].rose ? '▲' : '▼' }}</span>{{ row.cells[col.id].change }}
          </span>
        </div>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.mc {
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
}

.mc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 10px 16px;
  border-bottom: var(--line);
  font-size: 0.72rem;
}

.mc-key {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.mc-swatch {
  display: inline-block;
  width: 14px;
  height: 10px;
  border: 1px solid var(--ink);
}

.mc-alone {
  background: #b9b3a4;
}

.mc-pro {
  background: #1d7a4f;
}

.mc-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--rule);
}

.mc-row:last-child {
  border-bottom: 0;
}

.mc-row-hover {
  background: var(--paper-raised);
}

.mc-head {
  display: none;
}

.mc-model {
  grid-column: 1 / -1;
  display: grid;
  gap: 2px;
}

.mc-model-name {
  font-family: var(--font-display);
  font-size: 1.3rem;
  line-height: 1.1;
}

.mc-model-where {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.mc-cell {
  display: grid;
  gap: 4px;
  align-content: start;
  min-width: 0;
}

.mc-cell-title {
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.mc-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.6rem;
  align-items: center;
  gap: 5px;
}

.mc-track {
  height: 10px;
  background: rgba(0, 0, 0, 0.04);
}

.mc-fill {
  display: block;
  height: 100%;
  min-width: 2px;
  border-right: 1px solid var(--ink);
}

.mc-val {
  font-size: 0.66rem;
  color: var(--ink-muted);
  text-align: right;
}

.mc-val-pro {
  font-weight: 700;
  color: var(--ink);
}

.mc-change {
  font-size: 0.66rem;
  color: var(--ink-muted);
}

.mc-arrow {
  margin-right: 0.4ch;
}

.mc-better {
  color: var(--plus);
  font-weight: 700;
}

.mc-worse {
  color: var(--minus);
}

@media (min-width: 860px) {
  .mc-row {
    grid-template-columns: 11rem repeat(3, minmax(0, 1fr));
    gap: 0 28px;
    align-items: start;
  }

  .mc-model {
    grid-column: auto;
  }

  .mc-bar-row {
    grid-template-columns: minmax(0, 1fr) 4.2rem;
    gap: 8px;
  }

  .mc-val,
  .mc-change {
    font-size: 0.72rem;
  }

  .mc-head {
    display: grid;
    align-items: end;
    padding-top: 12px;
    padding-bottom: 10px;
    border-bottom: var(--line);
  }

  .mc-model-h {
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .mc-col-h {
    display: grid;
    gap: 2px;
  }

  .mc-col-h strong {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 400;
  }

  .mc-col-h .mono {
    font-size: 0.64rem;
    color: var(--ink-muted);
  }

  .mc-cell-title {
    display: none;
  }
}
</style>
