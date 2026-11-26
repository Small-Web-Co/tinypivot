<script setup lang="ts">
import { TRUST_BENCH_DATE, TRUST_BENCH_TOTALS, trustBenchRows } from '../../site/whitepaper'
</script>

<template>
  <figure class="tbench">
    <p class="label tbench-cap">
      Hard 6-Task Data Science &amp; BI Trap Benchmark · {{ TRUST_BENCH_DATE }} · Local &amp; Frontier Models
    </p>

    <!-- Desktop table -->
    <div class="tbench-scroll">
      <table>
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
              +{{ TRUST_BENCH_TOTALS.proPct - TRUST_BENCH_TOTALS.baselinePct }} pts vs baseline · lower output/cost on Pro
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Mobile stacked cards (zero horizontal clipping) -->
    <div class="tbench-cards">
      <article v-for="row in trustBenchRows" :key="row.id" class="tb-card">
        <div class="tb-card-head">
          <strong>{{ row.model }}</strong>
          <span class="sub">{{ row.hardware }} · vs {{ row.baselineLabel }}</span>
        </div>
        <div class="tb-card-arms">
          <div class="tb-arm">
            <span class="tb-arm-lbl">Baseline</span>
            <span class="score">{{ row.baselineScore }} ({{ row.baselinePct }}%)</span>
            <span class="sub">{{ row.baselineMeta }}</span>
          </div>
          <div class="tb-arm">
            <span class="tb-arm-lbl">Free</span>
            <span class="score">{{ row.freeScore }} ({{ row.freePct }}%)</span>
            <span class="sub">{{ row.freeMeta }}</span>
          </div>
          <div class="tb-arm col-pro">
            <span class="tb-arm-lbl">Pro</span>
            <span class="score">{{ row.proScore }} ({{ row.proPct }}%)</span>
            <span class="sub">{{ row.proMeta }}</span>
          </div>
        </div>
        <p class="tb-card-lift">
          {{ row.proHighlight }}
        </p>
      </article>
      <div class="tb-card tb-card-total">
        <div class="tb-card-head">
          <strong>Combined ({{ TRUST_BENCH_TOTALS.totalModelTasks }} tasks/arm)</strong>
        </div>
        <div class="tb-card-arms">
          <div class="tb-arm">
            <span class="tb-arm-lbl">Baseline</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.baselinePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.baselinePct }}%)</span>
          </div>
          <div class="tb-arm">
            <span class="tb-arm-lbl">Free</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.freePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.freePct }}%)</span>
          </div>
          <div class="tb-arm col-pro">
            <span class="tb-arm-lbl">Pro</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.proPassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.proPct }}%)</span>
          </div>
        </div>
      </div>
    </div>

    <figcaption class="tbench-note">
      <strong>*Why billed cost and output tokens drop even when raw total tokens look higher:</strong>
      On Claude, <em>raw tok</em> includes 90%-discounted prompt-cache reads of the MCP tool definitions, while 1-call <code>analyze</code> eliminates expensive output tokens spent writing &amp; debugging Python — making Sonnet Pro cheaper than vanilla Python ($0.54 vs. $0.57).
      On local models, <code>bare-sql</code> exposes only 1 raw SQL tool (~300 schema tokens) vs. TinyPivot's full 10-tool Studio; Pro still cuts generated <em>out</em> tokens up to 21% vs. <code>bare-sql</code> and total tokens up to 14% vs. Free.
    </figcaption>
  </figure>
</template>

<style scoped>
.tbench {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.tbench-cap {
  padding: 12px 14px;
  border-bottom: var(--line);
  margin: 0;
}

.tbench-scroll {
  display: none;
  overflow-x: auto;
  max-width: 100%;
}

.tbench-cards {
  display: grid;
  font-family: var(--font-mono);
  font-size: 0.74rem;
}

.tb-card {
  padding: 12px 14px;
  border-bottom: 1px solid var(--rule);
  display: grid;
  gap: 8px;
}

.tb-card:last-child {
  border-bottom: 0;
}

.tb-card-total {
  border-top: var(--line);
  background: var(--paper);
}

.tb-card-head strong {
  display: block;
  font-size: 0.8rem;
  color: var(--ink);
}

.tb-card-arms {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.tb-arm {
  padding: 7px 8px;
  border: 1px solid var(--rule);
  min-width: 0;
}

.tb-arm-lbl {
  display: block;
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  margin-bottom: 2px;
}

.tb-card-lift {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--ink);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 0.76rem;
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
  font-size: 0.66rem;
  font-weight: 400;
  line-height: 1.35;
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
  font-size: 0.69rem;
  line-height: 1.55;
  color: var(--ink-muted);
}

.tbench-note code {
  padding: 0 3px;
  border: 1px solid var(--rule);
  background: var(--ledger);
}

@media (min-width: 760px) {
  .tbench-scroll {
    display: block;
  }

  .tbench-cards {
    display: none;
  }
}
</style>
