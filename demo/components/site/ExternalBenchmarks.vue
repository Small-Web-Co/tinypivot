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

const dabColumns = computed(() =>
  dabstepLeaderboardBars.map(item => ({
    ...item,
    activeScore: dabMetric.value === 'hard' ? item.score : (item.easyScore ?? item.score),
  })),
)
</script>

<template>
  <div class="ext-stack">
    <!-- Architecture Weight Disclosure: Lightweight MCP vs Heavy Benchmark Harnesses -->
    <div class="weight-banner">
      <div class="weight-col weight-us">
        <span class="weight-tag mono">TINYPIVOT · ONE SMALL ADD-ON</span>
        <p>
          A single local tool the agent can call: SQL over your files, Excel and folder reading, and automatic checks.
          No notebook servers, no extra AI judges, no team of agents, and nothing tuned for these benchmarks.
        </p>
      </div>
      <div class="weight-col weight-them">
        <span class="weight-tag mono">PUBLISHED LEADERS · PURPOSE-BUILT RESEARCH SYSTEMS</span>
        <p>
          Systems such as RADAR, TalkTask, smolagents, NVIDIA KGMON and Google DS-STAR use teams of planner, coder and checker agents,
          notebook sandboxes and repeated search, engineered to score as high as possible on a leaderboard.
        </p>
      </div>
    </div>

    <!-- External Benchmark 1: MIT KramaBench (ICLR 2026) -->
    <figure id="kramabench" class="ext-panel" aria-label="External Benchmark 1: MIT KramaBench (ICLR 2026) Like-for-Like Stacked Lift Column Chart">
      <div class="ext-head">
        <div>
          <span class="ext-badge mono">PUBLIC BENCHMARK 01 · SAME MODEL, WITH AND WITHOUT TINYPIVOT</span>
          <h3>
            <a href="https://kramabench.org/" target="_blank" rel="noopener">MIT KramaBench (ICLR 2026)</a> — what TinyPivot adds to each model
          </h3>
          <p class="ext-sub">
            62 real-world questions over 4 collections of messy files (environment, wildfire, archaeology and biomedical data in
            <code>.csv</code>, <code>.xlsx</code>, <code>.json</code> and <code>.gpkg</code>), scored with MIT’s own published checker
            (<a href="https://github.com/mitdbg/Kramabench" target="_blank" rel="noopener"><code>mitdbg/Kramabench</code></a> ·
            <a href="https://openreview.net/forum?id=fZfUdeCC5X" target="_blank" rel="noopener">ICLR 2026 paper</a>).
          </p>
        </div>
      </div>

      <p class="ext-howto">
        <strong>How to read this chart:</strong> columns are grouped by model family, not ranked by score, so each TinyPivot result
        stands next to published systems built on the same family of model. In each group our columns come first, then the published
        systems. In a TinyPivot column, the sand part is the model on its own and the green cap is what TinyPivot added.
        Dark columns are published leaderboard systems, and the dashed line marks the published #1, RADAR, at 71.2%.
      </p>
      <div class="ext-legend mono">
        <span><i class="sw sw-base" /> Same-Model Vanilla Base</span>
        <span><i class="sw sw-tp" /> TinyPivot Pro Lift (Stacked on Base)</span>
        <span><i class="sw sw-leader" /> Published Heavy-Instrumentation Leaders</span>
        <span><i class="sw-dash" /> Published #1 RADAR (71.2%)</span>
      </div>

      <div class="col-container">
        <div class="group-bar group-bar-6 mono">
          <span class="group-pill group-pill-3">Claude Family · Like-for-Like</span>
          <span class="group-pill group-pill-3">DeepSeek-V4 Family · Like-for-Like</span>
        </div>

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
          <div class="col-bars-row col-grid-6">
            <div
              v-for="(item, idx) in kramaLeaderboardBars"
              :key="item.id"
              class="vcol-bar-cell"
              :class="[`vcol-${item.kind}`, { 'vcol-split-left': idx === 3 }]"
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
                v-if="item.baseScore !== undefined"
                class="vcol-bar vcol-stacked"
                :style="{ height: `${item.score}%` }"
                :title="`${item.label} (${item.model}): ${item.baseScore.toFixed(1)}% Vanilla → ${item.score.toFixed(1)}% TinyPivot Pro (+${(item.score - item.baseScore).toFixed(1)} pts) — ${item.note}`"
              >
                <div
                  class="stack-lift"
                  :style="{ height: `${Math.max(5, ((item.score - item.baseScore) / item.score) * 100)}%` }"
                />
                <div
                  class="stack-base"
                  :style="{ height: `${(item.baseScore / item.score) * 100}%` }"
                >
                  <span class="stack-base-lbl mono">{{ item.baseScore.toFixed(1) }}%</span>
                </div>
              </div>
              <div
                v-else
                class="vcol-bar"
                :class="`fill-${item.kind}`"
                :style="{ height: `${item.score}%` }"
                :title="`${item.label} (${item.model}): ${item.score.toFixed(1)}% — ${item.note}`"
              />
            </div>
          </div>
        </div>
        <div class="col-labels-row col-grid-6">
          <div
            v-for="(item, idx) in kramaLeaderboardBars"
            :key="`${item.id}-lbl`"
            class="vcol-foot"
            :class="[`vcol-${item.kind}`, { 'vcol-split-left': idx === 3 }]"
          >
            <strong class="vcol-name">{{ item.shortLabel }}</strong>
            <span class="vcol-mod mono">{{ item.shortModel }}</span>
            <span v-if="item.instrumentation" class="vcol-inst mono" :class="{ 'inst-tp': item.kind === 'tinypivot' }">
              {{ item.instrumentation }}
            </span>
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
    <figure id="dabstep" class="ext-panel" aria-label="External Benchmark 2: Official 450-Task Adyen DABstep Column Chart">
      <div class="ext-head ext-head-split">
        <div>
          <span class="ext-badge mono">PUBLIC BENCHMARK 02 · 450 QUESTIONS, SCORED BLIND BY ADYEN</span>
          <h3>
            <a href="https://huggingface.co/spaces/adyen/DABstep" target="_blank" rel="noopener">Adyen / Hugging Face <code>adyen/DABstep</code></a> — our submissions vs. the leaderboard
          </h3>
          <p class="ext-sub">
            450 questions (72 Easy, 378 Hard) about a 138,000-row payments file and 1,000 fee rules. Adyen holds the answers and
            scores every submission; the scores are published in <code>adyen/DABstep</code>. The leaderboard ranks by the Hard tier.
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
            Easy (#1: 97.2%)
          </button>
        </div>
      </div>

      <p class="ext-howto">
        <strong>How to read this chart:</strong> the three columns on the left are our submissions, from the strongest model
        (Claude Sonnet) to the smallest (DeepSeek, running locally at no cloud cost). The four on the right are Adyen’s own reference
        agent followed by leaderboard systems, in rank order from #5 up to #1. Each system uses a different model, so unlike
        KramaBench this isn’t a with-and-without comparison: gaps reflect both the model and the tooling. The dashed line is Adyen’s
        reference agent. Use the toggle to switch between the Hard and Easy tiers.
      </p>
      <div class="ext-legend mono">
        <span><i class="sw sw-tp" /> TinyPivot Pro (Lightweight MCP)</span>
        <span><i class="sw sw-base" /> Official Adyen ReACT Baseline</span>
        <span><i class="sw sw-leader" /> Heavy Benchmark Agents (Multi-Agent / Iterative)</span>
        <span>
          <i class="sw-dash" />
          {{ dabMetric === 'hard' ? 'Adyen ReACT Base (19.8%)' : 'Adyen ReACT Base (81.9%)' }}
        </span>
      </div>

      <div class="col-container">
        <div class="group-bar group-bar-7 mono">
          <span class="group-pill group-pill-3">Lightweight TinyPivot MCP</span>
          <span class="group-pill group-pill-4">Baseline &amp; Heavy Benchmark Agents</span>
        </div>

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
          <div class="col-bars-row col-grid-7">
            <div
              v-for="(item, idx) in dabColumns"
              :key="item.id"
              class="vcol-bar-cell"
              :class="[`vcol-${item.kind}`, { 'vcol-split-left': idx === 3 }]"
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
        <div class="col-labels-row col-grid-7">
          <div
            v-for="(item, idx) in dabColumns"
            :key="`${item.id}-lbl`"
            class="vcol-foot"
            :class="[`vcol-${item.kind}`, { 'vcol-split-left': idx === 3 }]"
          >
            <strong class="vcol-name">{{ item.shortLabel }}</strong>
            <span class="vcol-mod mono">{{ item.shortModel }}</span>
            <span class="vcol-sub mono">
              {{ dabMetric === 'hard' ? `Easy ${item.easyScore?.toFixed(1)}%` : `Hard ${item.score.toFixed(1)}%` }}
            </span>
          </div>
        </div>
      </div>

      <p class="ext-disclosure mono">
        <strong>Honest attribution:</strong> On <code>adyen/DABstep</code>, Sonnet 5.5’s 97.2% Easy (#1) / 68.8% Hard (#3-equiv, ahead of heavy CambioML GPT-5 57.7% &amp; Google DS-STAR 45.2%) pairs strong base-model reasoning with TinyPivot’s lightweight DuckDB MCP (our 10-task Dev A/B showed 90% parity on Sonnet, 80% parity on Opus, and <strong>+10 pts lift on Haiku 5.5</strong>, 60% → 70%). Our stacked MIT KramaBench columns (372 runs) and Internal Suite (91% → 100%) isolate TinyPivot’s direct lift over identical models.
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
  gap: 20px;
}

/* Lightweight MCP vs Heavy Instrumentation banner */
.weight-banner {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.weight-col {
  padding: 14px 16px;
  border: var(--line);
  background: var(--paper);
  display: grid;
  gap: 6px;
}

.weight-us {
  border-left: 4px solid #1d7a4f;
  background: rgba(29, 122, 79, 0.05);
}

.weight-them {
  border-left: 4px solid #33312d;
  background: var(--ledger);
}

.weight-tag {
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--ink);
}

.weight-us .weight-tag {
  color: #145a39;
}

.weight-col p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.48;
  color: var(--ink-muted);
}

.weight-col strong {
  color: var(--ink);
}

.weight-col code {
  padding: 0 4px;
  border: 1px solid var(--rule);
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.84em;
}

.ext-panel {
  margin: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.ext-head {
  padding: 16px 16px 14px;
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
  font-size: 1.12rem;
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
  max-width: 74ch;
  font-size: 0.86rem;
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
  font-size: 0.64rem;
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
  gap: 6px 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-raised, var(--paper));
  font-size: 0.66rem;
  color: var(--ink-muted);
}

.ext-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid var(--ink);
}

.sw-tp,
.fill-tinypivot,
.stack-lift {
  background: #1d7a4f;
}

.sw-base,
.fill-baseline,
.stack-base {
  background: #c7c0b1;
}

.sw-leader,
.fill-leader {
  background: #33312d;
}

.sw-dash {
  display: inline-block;
  width: 13px;
  height: 0;
  border-top: 2px dashed #c44a1d;
}

/* Zero-scroll responsive side-by-side column chart */
.col-container {
  padding: 14px 10px 14px 34px;
  background: var(--paper);
}

.group-bar {
  display: grid;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.group-bar-6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.group-bar-7 {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.group-pill {
  padding: 3px 6px;
  text-align: center;
  border-bottom: 1.5px solid var(--rule);
  background: var(--ledger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-pill-3 {
  grid-column: span 3;
}

.group-pill-4 {
  grid-column: span 4;
}

.col-plot-wrap {
  position: relative;
  height: 176px;
  margin-top: 40px;
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
  left: -30px;
  top: -6px;
  font-size: 0.52rem;
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
  left: -32px;
  top: -6px;
  color: #b03d14;
  font-size: 0.52rem;
  font-weight: 700;
}

.col-bars-row,
.col-labels-row {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 4px;
}

.col-bars-row {
  height: 100%;
  align-items: end;
}

.col-grid-6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.col-grid-7 {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.vcol-bar-cell {
  position: relative;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.vcol-split-left {
  border-left: 1px dashed var(--rule);
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
  padding: 1px 3px;
  font-size: 0.46rem;
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid var(--rule);
  background: var(--ledger);
  color: var(--ink-muted);
}

.badge-tinypivot {
  border-color: #1d7a4f;
  background: #dff2e8;
  color: #145a39;
}

.vcol-val {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.vcol-bar {
  width: 72%;
  max-width: 58px;
  min-height: 4px;
  border: 1px solid var(--ink);
  border-bottom: 0;
  transition: height 0.25s ease;
}

.vcol-stacked {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}

.stack-lift {
  width: 100%;
  min-height: 4px;
  border-bottom: 1px solid var(--ink);
}

.stack-base {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stack-base-lbl {
  display: none;
  font-size: 0.56rem;
  font-weight: 600;
  color: #3a362e;
}

.vcol-foot {
  padding: 6px 2px 4px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
}

.vcol-name {
  font-size: 0.62rem;
  line-height: 1.15;
  color: var(--ink);
}

.vcol-mod {
  font-size: 0.52rem;
  line-height: 1.15;
  color: var(--ink-muted);
}

.vcol-inst {
  display: none;
  font-size: 0.52rem;
  line-height: 1.15;
  color: var(--ink-muted);
}

.inst-tp {
  color: #145a39;
  font-weight: 600;
}

.vcol-sub {
  font-size: 0.48rem;
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
  padding: 14px 16px;
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
  padding: 12px 16px;
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
  padding: 12px 16px;
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
  padding: 0 16px 16px;
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

@media (min-width: 680px) {
  .weight-banner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .col-container {
    padding: 16px 20px 16px 48px;
  }

  .group-bar {
    gap: 10px;
    font-size: 0.62rem;
  }

  .col-plot-wrap {
    height: 196px;
    margin-top: 44px;
  }

  .grid-line span {
    left: -36px;
    font-size: 0.58rem;
  }

  .ref-axis {
    left: -42px;
    font-size: 0.58rem;
  }

  .col-bars-row,
  .col-labels-row {
    gap: 10px;
  }

  .vcol-badge {
    padding: 1px 5px;
    font-size: 0.56rem;
  }

  .vcol-val {
    font-size: 0.74rem;
  }

  .stack-base-lbl {
    display: block;
  }

  .vcol-name {
    font-size: 0.76rem;
  }

  .vcol-mod {
    font-size: 0.62rem;
  }

  .vcol-inst {
    display: block;
    font-size: 0.56rem;
    margin-top: 1px;
  }

  .vcol-sub {
    font-size: 0.58rem;
  }

  .ext-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sample-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.ext-howto {
  margin: 14px 16px 0;
  padding: 10px 12px;
  border: 1px dashed var(--ink);
  background: var(--paper);
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.ext-howto strong {
  color: var(--ink);
}
</style>
