<script setup lang="ts">
import { TRUST_BENCH_DATE, TRUST_BENCH_TOTALS, trustBenchRows } from '../../site/whitepaper'
</script>

<template>
  <figure class="tbench">
    <div class="tbench-scroll">
      <table>
        <caption class="label">
          Hard 6-Task Data Science &amp; BI Trap Benchmark · {{ TRUST_BENCH_DATE }} · Local &amp; Frontier Models
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Model
            </th>
            <th scope="col">
              Baseline
            </th>
            <th scope="col">
              TinyPivot Free
            </th>
            <th scope="col" class="col-pro">
              TinyPivot Pro
            </th>
            <th scope="col">
              Measured Pro Lift
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in trustBenchRows" :key="row.id">
            <th scope="row">
              <strong>{{ row.model }}</strong>
              <span class="sub">{{ row.hardware }} · vs {{ row.baselineLabel }}</span>
            </th>
            <td>
              <span class="score">{{ row.baselineScore }} ({{ row.baselinePct }}%)</span>
              <span class="sub">{{ row.baselineMeta }}</span>
            </td>
            <td>
              <span class="score">{{ row.freeScore }} ({{ row.freePct }}%)</span>
              <span class="sub">{{ row.freeMeta }}</span>
            </td>
            <td class="col-pro">
              <span class="score">{{ row.proScore }} ({{ row.proPct }}%)</span>
              <span class="sub">{{ row.proMeta }}</span>
            </td>
            <td class="lift">
              {{ row.proHighlight }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="totals">
            <th scope="row">
              Combined ({{ TRUST_BENCH_TOTALS.totalModelTasks }} tasks/arm)
            </th>
            <td>{{ TRUST_BENCH_TOTALS.baselinePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.baselinePct }}%)</td>
            <td>{{ TRUST_BENCH_TOTALS.freePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.freePct }}%)</td>
            <td class="col-pro">
              {{ TRUST_BENCH_TOTALS.proPassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.proPct }}%)
            </td>
            <td class="lift">
              +{{ TRUST_BENCH_TOTALS.proPct - TRUST_BENCH_TOTALS.baselinePct }} pts vs baseline · fewer tokens than Free on all 4 models
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <figcaption class="tbench-note">
      Six enterprise-scale traps (SRM + 12-segment p-hacking, confounded OLS reversal, right-censored cohorts, seasonal structural break, 3-table chasm trap, Kitagawa mix-vs-rate).
      Local models tested in fast non-thinking mode against bare DuckDB SQL; cloud models tested in headless Claude Code against Python/Bash.
    </figcaption>
  </figure>
</template>

<style scoped>
.tbench {
  min-width: 0;
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
}

.tbench-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.76rem;
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
  text-align: left;
  vertical-align: top;
}

thead th {
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
  white-space: nowrap;
}

tbody th strong {
  display: block;
  font-weight: 700;
  color: var(--ink);
}

.score {
  display: block;
  font-weight: 700;
  white-space: nowrap;
}

.sub {
  display: block;
  margin-top: 2px;
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--ink-muted);
}

.col-pro {
  background: var(--ledger);
}

.lift {
  font-size: 0.72rem;
  color: var(--ink);
}

tfoot .totals th,
tfoot .totals td {
  border-top: var(--line);
  border-bottom: 0;
  font-weight: 700;
}

.tbench-note {
  padding: 12px 14px;
  border-top: var(--line);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--ink-muted);
}
</style>
