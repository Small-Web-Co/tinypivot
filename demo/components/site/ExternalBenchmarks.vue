<script setup lang="ts">
import {
  dabstepLeaderboardBars,
  dabstepSampleTasks,
  kramaBenchRows,
  kramaLeaderboardBars,
  kramaSampleTasks,
} from '../../site/whitepaper'
</script>

<template>
  <div class="ext-stack">
    <!-- External Benchmark 1: MIT KramaBench (ICLR 2026) -->
    <figure class="ext-panel" aria-label="External Benchmark 1: MIT KramaBench (ICLR 2026) Leaderboard Comparison">
      <div class="ext-head">
        <div>
          <span class="ext-badge mono">EXTERNAL PUBLIC BENCHMARK 01 · CONTROLLED SAME-MODEL A/B</span>
          <h3>
            <a href="https://kramabench.org/" target="_blank" rel="noopener">MIT KramaBench (ICLR 2026)</a> — Multi-File Data Lakes
          </h3>
          <p class="ext-sub">
            62 real-world tasks across 4 multi-file data lakes (Environment, Wildfire, Archaeology, Biomedical · <code>.csv</code>, <code>.xlsx</code>, <code>.json</code>, <code>.gpkg</code>),
            scored verbatim with MIT’s deterministic metrics (<a href="https://github.com/mitdbg/Kramabench" target="_blank" rel="noopener"><code>mitdbg/Kramabench</code></a> ·
            <a href="https://openreview.net/forum?id=fZfUdeCC5X" target="_blank" rel="noopener">ICLR 2026 Paper</a>).
            Bars compare 4-domain weighted scores across our controlled A/B runs and published public leaders on <code>kramabench.org</code>.
          </p>
        </div>
      </div>

      <div class="ext-legend mono">
        <span><i class="sw sw-tp" /> TinyPivot Pro (v0.8.5)</span>
        <span><i class="sw sw-base" /> Same-Model Vanilla Baseline</span>
        <span><i class="sw sw-leader" /> Published Leaderboard Leaders</span>
      </div>

      <div class="lb-bars">
        <div
          v-for="item in kramaLeaderboardBars"
          :key="item.id"
          class="lb-row"
          :class="`lb-row-${item.kind}`"
        >
          <div class="lb-meta">
            <div class="lb-title-line">
              <strong>{{ item.label }}</strong>
              <span class="lb-model mono">{{ item.model }}</span>
            </div>
            <span class="lb-note">{{ item.note }}</span>
          </div>
          <div class="lb-bar-col">
            <div class="lb-track">
              <div class="lb-fill" :class="`fill-${item.kind}`" :style="{ width: `${item.score}%` }" />
            </div>
            <div class="lb-val-line mono">
              <strong :class="{ 'val-tp': item.kind === 'tinypivot' }">{{ item.score.toFixed(1) }}%</strong>
              <span v-if="item.secondary" class="lb-sec">{{ item.secondary }}</span>
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
    <figure class="ext-panel" aria-label="External Benchmark 2: Official 450-Task Adyen DABstep Leaderboard">
      <div class="ext-head">
        <div>
          <span class="ext-badge mono">EXTERNAL PUBLIC BENCHMARK 02 · OFFICIAL 450-TASK BLIND LEADERBOARD</span>
          <h3>
            <a href="https://huggingface.co/spaces/adyen/DABstep" target="_blank" rel="noopener">Adyen / Hugging Face <code>adyen/DABstep</code></a> — Financial Multi-Step Reasoning
          </h3>
          <p class="ext-sub">
            450 blind questions (72 Easy, 378 Hard) over a 22 MB payments ledger (<code>payments.csv</code>, 138k rows) + 1,000 nested JSON fee rules,
            scored blindly by Adyen and published in <code>adyen/DABstep</code> <code>data/task_scores/</code>.
            Bars rank by <strong>Hard-Level Accuracy (%)</strong> — the leaderboard’s primary metric.
          </p>
        </div>
      </div>

      <div class="ext-legend mono">
        <span><i class="sw sw-tp" /> TinyPivot Pro (Live Adyen Submissions)</span>
        <span><i class="sw sw-leader" /> Validated Leaderboard Top Leaders</span>
        <span><i class="sw sw-base" /> Official Adyen Reference Baseline</span>
      </div>

      <div class="lb-bars">
        <div
          v-for="item in dabstepLeaderboardBars"
          :key="item.id"
          class="lb-row"
          :class="`lb-row-${item.kind}`"
        >
          <div class="lb-meta">
            <div class="lb-title-line">
              <strong>{{ item.label }}</strong>
              <span class="lb-model mono">{{ item.model }}</span>
            </div>
            <span class="lb-note">{{ item.note }}</span>
          </div>
          <div class="lb-bar-col">
            <div class="lb-track">
              <div class="lb-fill" :class="`fill-${item.kind}`" :style="{ width: `${item.score}%` }" />
            </div>
            <div class="lb-val-line mono">
              <strong :class="{ 'val-tp': item.kind === 'tinypivot' }">{{ item.score.toFixed(1) }}% Hard</strong>
              <span v-if="item.secondary" class="lb-sec">{{ item.secondary }}</span>
            </div>
          </div>
        </div>
      </div>

      <p class="ext-disclosure mono">
        <strong>Honest attribution:</strong> On <code>adyen/DABstep</code>, Sonnet 5.5’s 97.2% Easy / 68.8% Hard score reflects strong base-model reasoning alongside TinyPivot’s DuckDB workflow (our controlled 10-task Dev A/B showed 90% parity on Sonnet, 80% parity on Opus, and <strong>+10 pts on Haiku 5.5</strong>, 60% → 70%). Our controlled same-model Internal Suite (91% → 100%) and MIT KramaBench A/B (77.3% → 80.9%, Haiku +6.1 pts) isolate TinyPivot’s direct lift.
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

.lb-bars {
  display: grid;
}

.lb-row {
  display: grid;
  gap: 8px 16px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--rule);
  align-items: center;
}

.lb-row-tinypivot {
  background: rgba(29, 122, 79, 0.07);
}

.lb-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.lb-title-line strong {
  font-size: 0.86rem;
  color: var(--ink);
}

.lb-model {
  font-size: 0.7rem;
  color: var(--ink-muted);
}

.lb-note {
  display: block;
  margin-top: 2px;
  font-size: 0.74rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.lb-bar-col {
  display: grid;
  gap: 5px;
}

.lb-track {
  height: 14px;
  background: rgba(0, 0, 0, 0.06);
  border: 1px solid var(--rule);
}

.lb-fill {
  height: 100%;
  border-right: 1px solid var(--ink);
}

.lb-val-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 0.72rem;
}

.val-tp {
  color: #145a39;
  font-weight: 700;
}

.lb-sec {
  font-size: 0.66rem;
  color: var(--ink-muted);
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
  .lb-row {
    grid-template-columns: minmax(260px, 1.05fr) minmax(280px, 1.25fr);
  }

  .ext-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sample-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
