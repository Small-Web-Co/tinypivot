<script setup lang="ts">
import { BENCHMARK, benchmarkSetups } from '../../site/benchmark'

const fmt = (n: number) => n.toLocaleString('en-US')
const usd = (n: number | null) => (n === null ? 'too big' : `$${n.toFixed(2)}`)
</script>

<template>
  <figure class="bench">
    <div class="bench-scroll">
      <table>
        <caption class="label">
          Cost of {{ BENCHMARK.questions }} questions · {{ BENCHMARK.harness }}, {{ BENCHMARK.model }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Setup
            </th>
            <th scope="col">
              {{ fmt(BENCHMARK.smallRows) }} rows
            </th>
            <th scope="col">
              {{ fmt(BENCHMARK.largeRows) }} rows
            </th>
            <th scope="col">
              Right
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in benchmarkSetups" :key="item.id" :class="{ ours: item.id === 'tinypivot' }">
            <th scope="row">
              {{ item.label }}
            </th>
            <td>{{ usd(item.smallCost) }}</td>
            <td>{{ usd(item.largeCost) }}</td>
            <td>{{ item.correct }}/{{ BENCHMARK.questions }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <figcaption class="bench-note">
      Average of two runs, cost from Claude Code's own accounting. Reading the rows: the model declined to add up
      {{ fmt(BENCHMARK.smallRows) }} rows by hand for two of the three questions. The {{ fmt(BENCHMARK.largeRows) }}-row file
      is about a million tokens and does not fit in context.
    </figcaption>
  </figure>
</template>

<style scoped>
.bench {
  min-width: 0;
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
}

.bench-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

caption {
  padding: 12px 14px;
  border-bottom: var(--line);
  text-align: left;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  white-space: nowrap;
}

thead th {
  font-size: 0.66rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

th:first-child {
  text-align: left;
}

/* Setup names wrap so the figures keep their columns on narrow screens. */
tbody th {
  font-weight: 500;
  white-space: normal;
}

tr.ours {
  background: var(--ledger);
}

tr.ours th,
tr.ours td {
  font-weight: 700;
}

@media (max-width: 480px) {
  table {
    font-size: 0.72rem;
  }

  th,
  td {
    padding: 9px 7px;
  }
}

.bench-note {
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--ink-muted);
}
</style>
