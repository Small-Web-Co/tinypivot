<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  dabstepLeaderboardBars,
  dabstepSampleTasks,
  kramaBenchRows,
  kramaLeaderboardBars,
  kramaSampleTasks,
} from '../../site/whitepaper'

type DabMetric = 'hard' | 'easy'
const dabMetric = ref<DabMetric>('hard')

const dabColumns = computed(() => {
  const list = dabstepLeaderboardBars.map(item => ({
    ...item,
    activeScore: dabMetric.value === 'hard' ? item.score : (item.easyScore ?? item.score),
  }))
  return dabMetric.value === 'hard'
    ? list
    : [...list].sort((a, b) => b.activeScore - a.activeScore)
})
</script>

<template>
  <div class="ext-stack">
    <!-- External Benchmark 1: MIT KramaBench (ICLR 2026) -->
    <figure class="ext-panel" aria-label="External Benchmark 1: MIT KramaBench (ICLR 2026) Side-by-Side Column Chart">
      <div class="ext-head">
        <div>
          <span class="ext-badge mono">EXTERNAL PUBLIC BENCHMARK 01 · CONTROLLED SAME-MODEL A/B</span>
          <h3>
            <a href="https://kramabench.org/" target="_blank" rel="noopener">MIT KramaBench (ICLR 2026)</a> — Direct Comparison vs. Published Leaders
          </h3>
          <p class="ext-sub">
            62 real-world tasks across 4 multi-file data lakes (Environment, Wildfire, Archaeology, Biomedical · <code>.csv</code>, <code>.xlsx</code>, <code>.json</code>, <code>.gpkg</code>),
            scored verbatim with MIT’s deterministic metrics (<a href="https://github.com/mitdbg/Kramabench" target="_blank" rel="noopener"><code>mitdbg/Kramabench</code></a> ·
            <a href="https://openreview.net/forum?id=fZfUdeCC5X" target="_blank" rel="noopener">ICLR 2026 Paper</a>).
            Side-by-side columns compare 4-domain weighted scores across our controlled A/B runs and the published leaders on <code>kramabench.org</code>.
          </p>
        </div>
      </div>

      <div class="ext-legend mono">
        <span><i class="sw sw-tp" /> TinyPivot Pro (v0.8.5)</span>
        <span><i class="sw sw-base" /> Same-Model Vanilla Baseline</span>
        <span><i class="sw sw-leader" /> Published Leaderboard Leaders</span>
        <span><i class="sw-dash" /> Dashed line: Published #1 RADAR (71.2%)</span>
      </div>

      <div class="col-scroll">
        <div class="col-stage">
          <div class="col-plot-wrap">
            <div class="grid-line" style="bottom: 100%">
              <span class="mono">100%</span>
            </div>
            <div class="grid-line" style="bottom: 50%">
              <span class="mono">50%</span>
            </div>
            <div class="ref-line" style="bottom: 71.2%">
              <span class="ref-axis mono">71.2%</span>
            </div>
            <div class="col-bars-row col-grid-7">
              <div
                v-for="item in kramaLeaderboardBars"
                :key="item.id"
                class="vcol-bar-cell"
                :class="`vcol-${item.kind}`"
              >
                <div class="vcol-head" :style="{ bottom: `calc(${item.score}% + 4px)` }">
                  <span
                    v-if="item.badge"
                    class="vcol-badge mono"
                    :class="`badge-${item.kind}`"
                  >{{ item.badge }}</span>
                  <span class="vcol-val mono" :class="{ 'val-tp': item.kind === 'tinypivot' }">{{ item.score.toFixed(1) }}%</span>
                </div>
                <div
                  class="vcol-bar"
                  :class="`fill-${item.kind}`"
                  :style="{ height: `${item.score}%` }"
                  :title="`${item.label} (${item.model}): ${item.score.toFixed(1)}% — ${item.note}`"
                />
              </div>
            </div>
          </div>
          <div class="col-labels-row col-grid-7">
            <div
              v-for="item in kramaLeaderboardBars"
              :key="`${item.id}-lbl`"
              class="vcol-foot"
              :class="`vcol-${item.kind}`"
            >
              <strong class="vcol-name">{{ item.shortLabel }}</strong>
              <span class="vcol-mod mono">{{ item.shortModel }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ext-cards mono">
        <div v-for="row in kramaBenchRows" :key="row.model" class="ext-card">
          <strong>{{ row.model }}</strong>
          <div class="ext-card-scores">
            <span class="val-tp">{{ row.overall }}</span>
            <span>{{ row.speed }}</span>
          </div>
          <span class="ext-card-note">{{ row.domains }}</span>
          <span class="ext-card-note">{{ row.note }}</span>
        </div>
      </div>

      <details class="sample-drawer">
        <summary class="mono">
          <span>Inspect sample MIT KramaBench tasks tested (8 representative examples across all 4 domains)</span>
          <span class="drawer-ico" aria-hidden="true">+</span>
        </summary>
        <div class="sample-list">
          <div v-for="t in kramaSampleTasks" :key="t.id" class="sample-item">
            <div class="sample-top mono">
              <code>{{ t.id }}</code>
              <span class="sample-tag">{{ t.tag }}</span>
            </div>
            <p class="sample-q">
              {{ t.prompt }}
            </p>
            <p class="sample-exp mono">
              Expected: <code>{{ t.expected }}</code>
            </p>
          </div>
        </div>
      </details>
    </figure>

    <!-- External Benchmark 2: Adyen / Hugging Face DABstep (450 Blind Tasks) -->
    <figure class="ext-panel" aria-label="External Benchmark 2: Official 450-Task Adyen DABstep Side-by-Side Column Chart">
      <div class="ext-head ext-head-split">
        <div>
          <span class="ext-badge mono">EXTERNAL PUBLIC BENCHMARK 02 · OFFICIAL 450-TASK BLIND LEADERBOARD</span>
          <h3>
            <a href="https://huggingface.co/spaces/adyen/DABstep" target="_blank" rel="noopener">Adyen / Hugging Face <code>adyen/DABstep</code></a> — Side-by-Side vs. Validated Top 5
          </h3>
          <p class="ext-sub">
            450 blind questions (72 Easy, 378 Hard) over a 22 MB payments ledger (<code>payments.csv</code>, 138k rows) + 1,000 nested JSON fee rules,
            scored blindly by Adyen and published in <code>adyen/DABstep</code> <code>data/task_scores/</code>.
            Toggle between <strong>Hard Accuracy</strong> (primary ranking) and <strong>Easy Accuracy</strong>.
          </p>
        </div>
        <div class="ext-tabs" role="tablist" aria-label="DABstep accuracy split">
          <button
            type="button"
            role="tab"
            class="ext-tab mono"
            :aria-selected="dabMetric === 'hard'"
            @click="dabMetric = 'hard'"
          >
            Hard (Primary)
          </button>
          <button
            type="button"
            role="tab"
            class="ext-tab mono"
            :aria-selected="dabMetric === 'easy'"
            @click="dabMetric = 'easy'"
          >
            Easy (72 Tasks)
          </button>
        </div>
      </div>

      <div class="ext-legend mono">
        <span><i class="sw sw-tp" /> TinyPivot Pro (Live Adyen Submissions)</span>
        <span><i class="sw sw-leader" /> Validated Leaderboard Top 5</span>
        <span><i class="sw sw-base" /> Official Adyen Reference Baseline</span>
        <span>
          <i class="sw-dash" />
          {{ dabMetric === 'hard' ? 'Dashed line: Adyen ReACT Baseline (19.8%)' : 'Dashed line: Adyen ReACT Baseline (81.9%)' }}
        </span>
      </div>

      <div class="col-scroll">
        <div class="col-stage">
          <div class="col-plot-wrap">
            <div class="grid-line" style="bottom: 100%">
              <span class="mono">100%</span>
            </div>
            <div class="grid-line" style="bottom: 50%">
              <span class="mono">50%</span>
            </div>
            <div
              class="ref-line"
              :style="{ bottom: dabMetric === 'hard' ? '19.8%' : '81.9%' }"
            >
              <span class="ref-axis mono">
                {{ dabMetric === 'hard' ? '19.8%' : '81.9%' }}
              </span>
            </div>
            <div class="col-bars-row col-grid-9">
              <div
                v-for="item in dabColumns"
                :key="item.id"
                class="vcol-bar-cell"
                :class="`vcol-${item.kind}`"
              >
                <div class="vcol-head" :style="{ bottom: `calc(${item.activeScore}% + 4px)` }">
                  <span
                    v-if="item.badge"
                    class="vcol-badge mono"
                    :class="`badge-${item.kind}`"
                  >{{ dabMetric === 'easy' && item.id === 'dab-sonnet-tp' ? '#1 Easy!' : item.badge }}</span>
                  <span class="vcol-val mono" :class="{ 'val-tp': item.kind === 'tinypivot' }">{{ item.activeScore.toFixed(1) }}%</span>
                </div>
                <div
                  class="vcol-bar"
                  :class="`fill-${item.kind}`"
                  :style="{ height: `${item.activeScore}%` }"
                  :title="`${item.label} (${item.model}): ${item.secondary}`"
                />
              </div>
            </div>
          </div>
          <div class="col-labels-row col-grid-9">
            <div
              v-for="item in dabColumns"
              :key="`${item.id}-lbl`"
              class="vcol-foot"
              :class="`vcol-${item.kind}`"
            >
              <strong class="vcol-name">{{ item.shortLabel }}</strong>
              <span class="vcol-mod mono">{{ item.shortModel }}</span>
              <span class="vcol-sub mono">
                {{ dabMetric === 'hard' ? `Easy ${item.easyScore?.toFixed(1)}%` : `Hard ${item.score.toFixed(1)}%` }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p class="ext-disclosure mono">
        <strong>Honest attribution:</strong> On <code>adyen/DABstep</code>, Sonnet 5.5’s 97.2% Easy (#1) / 68.8% Hard (#3-equiv, ahead of GPT-5 57.7% &amp; Google DS-STAR 45.2%) reflects strong base-model reasoning paired with TinyPivot’s DuckDB workflow (our 10-task Dev A/B showed 90% parity on Sonnet, 80% parity on Opus, and <strong>+10 pts on Haiku 5.5</strong>, 60% → 70%). Our controlled same-model Internal Suite (91% → 100%) and MIT KramaBench A/B (77.3% → 80.9%, Haiku +6.1 pts) isolate TinyPivot’s direct lift.
      </p>

      <details class="sample-drawer">
        <summary class="mono">
          <span>Inspect all 10 official labeled <code>adyen/DABstep</code> Dev tasks (3 Easy · 7 Hard)</span>
          <span class="drawer-ico" aria-hidden="true">+</span>
        </summary>
        <div class="sample-list">
          <div v-for="t in dabstepSampleTasks" :key="t.id" class="sample-item">
            <div class="sample-top mono">
              <code>{{ t.id }}</code>
              <span class="sample-tag">{{ t.tag }}</span>
            </div>
            <p class="sample-q">
              {{ t.prompt }}
            </p>
            <p class="sample-exp mono">
              Expected: <code>{{ t.expected }}</code>
            </p>
          </div>
        </div>
      </details>
    </figure>
  </div>
</template>

<style scoped>
.ext-stack {
  display: grid;
  gap: 24px;
}

.ext-panel {
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.ext-head {
  padding: 18px 18px 14px;
  border-bottom: var(--line);
}

.ext-head-split {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px 18px;
}

.ext-badge {
  display: inline-block;
  padding: 2px 7px;
  margin-bottom: 8px;
  border: 1px solid var(--ink);
  background: var(--ledger);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ink);
}

.ext-head h3 {
  font-size: 1.15rem;
  margin: 0 0 6px;
}

.ext-head h3 a,
.ext-sub a {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ext-sub {
  margin: 0;
  max-width: 72ch;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.ext-sub code,
.ext-disclosure code,
.sample-drawer code {
  padding: 0 4px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  font-family: var(--font-mono);
  font-size: 0.84em;
}

.ext-tabs {
  display: flex;
  flex-shrink: 0;
  border: var(--line);
  background: var(--paper-sunk, var(--ledger));
}

.ext-tab {
  padding: 6px 10px;
  border: 0;
  background: transparent;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
  cursor: pointer;
}

.ext-tab[aria-selected='true'] {
  background: var(--ink);
  color: var(--paper);
}

.ext-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-raised, var(--paper));
  font-size: 0.68rem;
  color: var(--ink-muted);
}

.ext-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
}

.sw-tp,
.fill-tinypivot {
  background: #1d7a4f;
}

.sw-base,
.fill-baseline {
  background: #b9b3a4;
}

.sw-leader,
.fill-leader {
  background: #33312d;
}

.sw-dash {
  display: inline-block;
  width: 14px;
  height: 0;
  border-top: 2px dashed #c44a1d;
}

/* Side-by-side vertical column chart */
.col-scroll {
  overflow-x: auto;
  padding: 18px 18px 16px 46px;
  background: var(--paper);
}

.col-stage {
  min-width: 660px;
}

.col-plot-wrap {
  position: relative;
  height: 190px;
  margin-top: 44px;
  border-bottom: 1.5px solid var(--ink);
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed rgba(0, 0, 0, 0.14);
  pointer-events: none;
}

.grid-line span {
  position: absolute;
  left: -34px;
  top: -7px;
  font-size: 0.58rem;
  color: var(--ink-muted);
}

.ref-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1.5px dashed #c44a1d;
  pointer-events: none;
  z-index: 2;
}

.ref-axis {
  position: absolute;
  left: -40px;
  top: -7px;
  color: #b03d14;
  font-size: 0.58rem;
  font-weight: 700;
}

.col-bars-row,
.col-labels-row {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 8px;
}

.col-bars-row {
  height: 100%;
  align-items: end;
}

.col-grid-7 {
  grid-template-columns: repeat(7, minmax(80px, 1fr));
}

.col-grid-9 {
  grid-template-columns: repeat(9, minmax(66px, 1fr));
}

.vcol-bar-cell {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.vcol-tinypivot {
  background: rgba(29, 122, 79, 0.06);
}

.vcol-head {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  z-index: 4;
}

.vcol-badge {
  padding: 1px 4px;
  font-size: 0.54rem;
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid var(--rule);
  background: var(--ledger);
  color: var(--ink-muted);
}

.badge-tinypivot {
  border-color: #1d7a4f;
  background: #e2f2e9;
  color: #145a39;
}

.vcol-val {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.vcol-bar {
  width: 68%;
  max-width: 54px;
  min-height: 4px;
  border: 1px solid var(--ink);
  border-bottom: 0;
  transition: height 0.25s ease;
}

.vcol-foot {
  padding: 8px 3px 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.vcol-name {
  font-size: 0.72rem;
  line-height: 1.15;
  color: var(--ink);
}

.vcol-mod {
  font-size: 0.6rem;
  line-height: 1.15;
  color: var(--ink-muted);
}

.vcol-sub {
  font-size: 0.56rem;
  color: #145a39;
}

.val-tp {
  color: #145a39;
  font-weight: 700;
}

.ext-cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--rule);
  background: var(--paper-raised, var(--paper));
}

.ext-card {
  padding: 10px 12px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  display: grid;
  gap: 4px;
  font-size: 0.72rem;
}

.ext-card strong {
  color: var(--ink);
  font-size: 0.78rem;
}

.ext-card-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--ink-muted);
}

.ext-card-note {
  font-size: 0.66rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.ext-disclosure {
  margin: 0;
  padding: 12px 18px;
  border-top: 1px solid var(--rule);
  background: var(--ledger);
  font-size: 0.68rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.ext-disclosure strong {
  color: var(--ink);
}

.sample-drawer {
  border-top: var(--line);
  background: var(--paper);
}

.sample-drawer summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
}

.sample-drawer summary::-webkit-details-marker {
  display: none;
}

.sample-drawer summary:hover {
  background: var(--ledger);
}

.drawer-ico {
  font-size: 1rem;
  color: var(--accent, var(--ink));
  transition: transform 0.2s;
}

.sample-drawer[open] .drawer-ico {
  transform: rotate(45deg);
}

.sample-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 0 18px 18px;
}

.sample-item {
  padding: 10px 12px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  display: grid;
  gap: 5px;
}

.sample-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  font-size: 0.68rem;
}

.sample-tag {
  color: var(--accent, var(--ink-muted));
  font-weight: 600;
}

.sample-q {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--ink);
}

.sample-exp {
  margin: 0;
  font-size: 0.68rem;
  color: var(--ink-muted);
}

@media (min-width: 780px) {
  .ext-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sample-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
