<script setup lang="ts">
import { internalTestCatalog, TRUST_BENCH_DATE, TRUST_BENCH_TOTALS, trustBenchRows } from '../../site/whitepaper'
</script>

<template>
  <figure class="tbench">
    <p class="label tbench-cap">
      INTERNAL CONTROLLED BENCHMARK · 18 Unhinted Tasks (Routine BI · Relational · Hard DS) · {{ TRUST_BENCH_DATE }} · 5 Models × 3 Arms ({{ TRUST_BENCH_TOTALS.totalRuns }} Runs)
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
              Baseline → Pro Impact
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
              <dl class="impact-list">
                <div>
                  <dt>Acc</dt>
                  <dd>{{ row.impact.accuracy }}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{{ row.impact.speed }}</dd>
                </div>
                <div>
                  <dt>Tok</dt>
                  <dd>{{ row.impact.tokens }}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{{ row.impact.cost }}</dd>
                </div>
              </dl>
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
              +{{ TRUST_BENCH_TOTALS.proPct - TRUST_BENCH_TOTALS.baselinePct }} pts overall · −{{ TRUST_BENCH_TOTALS.speedupPct }}% faster avg ({{ TRUST_BENCH_TOTALS.baselineAvgSec }}s → {{ TRUST_BENCH_TOTALS.proAvgSec }}s) · 2.1× faster Hard DS
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Mobile cards: 3-across arms + 2x2 Speed / Tokens / Accuracy / Cost impact grid -->
    <div class="tbench-cards">
      <article v-for="row in trustBenchRows" :key="row.id" class="tb-card">
        <div class="tb-card-head">
          <strong>{{ row.model }}</strong>
          <span class="sub">{{ row.hardware }} · vs {{ row.baselineLabel }}</span>
        </div>
        <div class="tb-arms-3">
          <div class="tb-arm-cell">
            <span class="tb-arm-lbl">Baseline</span>
            <span class="score">{{ row.baselineScore }} ({{ row.baselinePct }}%)</span>
            <span class="tb-arm-short">{{ row.baselineShort }}</span>
          </div>
          <div class="tb-arm-cell">
            <span class="tb-arm-lbl">TP Free</span>
            <span class="score">{{ row.freeScore }} ({{ row.freePct }}%)</span>
            <span class="tb-arm-short">{{ row.freeShort }}</span>
          </div>
          <div class="tb-arm-cell col-pro">
            <span class="tb-arm-lbl">TP Pro</span>
            <span class="score">{{ row.proScore }} ({{ row.proPct }}%)</span>
            <span class="tb-arm-short">{{ row.proShort }}</span>
          </div>
        </div>
        <dl class="tb-impact-grid">
          <div class="tb-impact-cell">
            <dt>Accuracy</dt>
            <dd>{{ row.impact.accuracy }}</dd>
          </div>
          <div class="tb-impact-cell">
            <dt>Speed</dt>
            <dd>{{ row.impact.speed }}</dd>
          </div>
          <div class="tb-impact-cell">
            <dt>Tokens</dt>
            <dd>{{ row.impact.tokens }}</dd>
          </div>
          <div class="tb-impact-cell">
            <dt>Cost</dt>
            <dd>{{ row.impact.cost }}</dd>
          </div>
        </dl>
      </article>
      <div class="tb-card tb-card-total">
        <div class="tb-card-head">
          <strong>Combined ({{ TRUST_BENCH_TOTALS.totalModelTasks }} tasks/arm)</strong>
        </div>
        <div class="tb-arms-3">
          <div class="tb-arm-cell">
            <span class="tb-arm-lbl">Baseline</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.baselinePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.baselinePct }}%)</span>
          </div>
          <div class="tb-arm-cell">
            <span class="tb-arm-lbl">TP Free</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.freePassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.freePct }}%)</span>
          </div>
          <div class="tb-arm-cell col-pro">
            <span class="tb-arm-lbl">TP Pro</span>
            <span class="score">{{ TRUST_BENCH_TOTALS.proPassed }}/{{ TRUST_BENCH_TOTALS.totalModelTasks }} ({{ TRUST_BENCH_TOTALS.proPct }}%)</span>
          </div>
        </div>
      </div>
    </div>

    <details class="catalog-drawer">
      <summary class="mono">
        <span>Inspect all 18 exact internal benchmark tasks (6 Routine BI · 6 Relational Analytics · 6 Hard Data Science)</span>
        <span class="drawer-ico" aria-hidden="true">+</span>
      </summary>
      <div class="catalog-list">
        <article v-for="task in internalTestCatalog" :key="task.id" class="catalog-item">
          <div class="catalog-top mono">
            <strong>{{ task.title }}</strong>
            <span class="catalog-cat">{{ task.category }}</span>
          </div>
          <p class="catalog-prompt">
            <q>{{ task.prompt }}</q>
          </p>
          <p class="catalog-meta">
            <strong>Trap:</strong> {{ task.trap }}
          </p>
          <p class="catalog-meta catalog-guard">
            <strong>TinyPivot guard:</strong> {{ task.guardrail }}
          </p>
        </article>
      </div>
    </details>

    <figcaption class="tbench-note">
      <strong>Local overhead &amp; fairness:</strong> DuckDB audits add ~5–15 ms per query (<code>analyze</code> ~10–40 ms) while TinyPivot Free tool schemas stay strictly <strong>&lt; 2,500 tokens</strong>. On Claude Code, <strong>TinyPivot Free</strong> runs additively alongside built-in <code>Bash</code> (matching real installs) and lifts overall accuracy monotonically from <strong>91% → 93% Free → 100% Pro</strong> (zero regressions on any model), while <strong>TinyPivot Pro</strong> ran MCP-only (<code>Bash</code> disabled) and hit <strong>90/90 (100%)</strong> — <strong>25% faster overall</strong> (25.3s → 19.0s/task) and <strong>2.1× faster on Hard Data Science</strong> (39.7s → 19.3s/task) with −32% fewer Hard DS output tokens.
      <strong>*Cloud API-equiv:</strong> Claude 5.5 arms ran via local Claude Code subscription ($0 extra spend) with costs calculated from published Anthropic API token rates; Sonnet &amp; Opus reflect warm-session prompt caching (90% cache-read discount on repeated tool schemas).
      <strong>†Imputed local API pricing:</strong> Local models ran at $0 marginal cost on local hardware; API-equivalent figures are imputed from exact recorded prompt/completion tokens using realistic multi-turn prefix caching at published 2026 <code>DeepSeek-Flash</code> Peak rates ($0.30/1M uncached in, $0.006/1M cache hit, $1.20/1M out) for DeepSeek V4.1 and comparable small-fast cloud API rates ($0.15/1M in, $0.075/1M cached, $0.60/1M out; GPT-4o-mini tier) for Inkling 2 Mini.
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
  padding: 14px;
  border-bottom: 1px solid var(--rule);
  display: grid;
  gap: 10px;
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
  font-size: 0.86rem;
  color: var(--ink);
}

.tb-arms-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.tb-arm-cell {
  padding: 8px 7px;
  border: 1px solid var(--rule);
  display: grid;
  gap: 2px;
  min-width: 0;
}

.tb-arm-lbl {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
}

.tb-arm-short {
  font-size: 0.64rem;
  line-height: 1.3;
  color: var(--ink-muted);
}

.tb-impact-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.tb-impact-cell {
  padding: 6px 8px;
  border: 1px dashed var(--rule);
  background: var(--paper-raised, var(--paper));
}

.tb-impact-cell dt {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent, var(--ink-muted));
}

.tb-impact-cell dd {
  margin: 2px 0 0;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--ink);
  font-weight: 600;
}

.impact-list {
  margin: 0;
  display: grid;
  gap: 3px;
}

.impact-list > div {
  display: grid;
  grid-template-columns: 3.1rem minmax(0, 1fr);
  gap: 6px;
  align-items: baseline;
}

.impact-list dt {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent, var(--ink-muted));
}

.impact-list dd {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.35;
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

.catalog-drawer {
  border-top: var(--line);
  background: var(--paper);
}

.catalog-drawer summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
}

.catalog-drawer summary::-webkit-details-marker {
  display: none;
}

.catalog-drawer summary:hover {
  background: var(--ledger);
}

.drawer-ico {
  font-size: 1rem;
  color: var(--accent, var(--ink));
  transition: transform 0.2s;
}

.catalog-drawer[open] .drawer-ico {
  transform: rotate(45deg);
}

.catalog-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 0 14px 16px;
}

.catalog-item {
  padding: 10px 12px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  display: grid;
  gap: 5px;
}

.catalog-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  font-size: 0.72rem;
}

.catalog-top strong {
  color: var(--ink);
}

.catalog-cat {
  font-size: 0.64rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent, var(--ink-muted));
}

.catalog-prompt {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--ink);
}

.catalog-meta {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.catalog-guard {
  color: #145a39;
}

@media (min-width: 760px) {
  .catalog-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tbench-scroll {
    display: block;
  }

  .tbench-cards {
    display: none;
  }
}
</style>
