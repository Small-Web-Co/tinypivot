<script setup lang="ts">
/**
 * The hero's picture of TinyPivot Studio: one question as the Studio shows it, from what was asked
 * to a checked answer. Static, with the figures from the recorded Acme session in the reel.
 */

interface Stage {
  tag: string
  title: string
  detail: string
  check?: string
}

const stages: Stage[] = [
  { tag: 'source', title: 'acme-orders.csv', detail: '44,714 rows × 13 columns', check: 'file unchanged' },
  { tag: 'sql', title: 'SELECT period, channel, sum(mrr) … GROUP BY 1, 2', detail: '40 rows', check: 'same rows on re-run' },
  { tag: 'chart', title: 'line: sum(mrr) by month, split by channel', detail: 'Partner, 2026' },
]
</script>

<template>
  <figure class="hq" aria-label="A question in TinyPivot Studio, from the question to a checked answer">
    <figcaption class="hq-bar">
      <span>TinyPivot Studio</span>
      <span>127.0.0.1</span>
    </figcaption>
    <div class="hq-body">
      <p class="hq-prompt">
        Which channel fell off in March 2026?
      </p>
      <p class="hq-meta">
        asked in Claude Code · 4 steps
      </p>
      <ol class="hq-stages">
        <li v-for="(stage, index) in stages" :key="stage.tag" class="hq-stage">
          <span class="hq-num" aria-hidden="true">{{ index + 1 }}</span>
          <div>
            <p class="hq-head">
              <span class="hq-tag">{{ stage.tag }}</span>
              <span class="hq-title">{{ stage.title }}</span>
            </p>
            <p class="hq-detail">
              {{ stage.detail }}<template v-if="stage.check">
                <span class="hq-ok"> · ✓ {{ stage.check }}</span>
              </template>
            </p>
          </div>
        </li>
        <li class="hq-stage hq-answer">
          <span class="hq-num" aria-hidden="true">4</span>
          <div>
            <p class="hq-head">
              <span class="hq-tag">answer</span>
            </p>
            <p class="hq-text">
              Partner fell to <mark title="In the data: mrr · 2026-03">163K</mark> in March, against about
              <mark title="In the data: average of the other months">920K</mark> in a normal month: a volume drop in every region.
            </p>
            <p class="hq-badge">
              ✓ 2 of 2 numbers found in the data
            </p>
          </div>
        </li>
      </ol>
    </div>
  </figure>
</template>

<style scoped>
.hq {
  margin: 0;
  border: var(--line);
  background: var(--paper-raised);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.45;
}

.hq-bar {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: var(--line);
  background: var(--ink);
  color: var(--paper);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.62rem;
}

.hq-body {
  display: grid;
  gap: 8px;
  padding: 14px 14px 16px;
}

.hq p {
  margin: 0;
}

.hq-prompt {
  padding-left: 10px;
  border-left: 3px solid var(--accent);
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.3;
  color: var(--ink);
}

.hq-meta {
  color: var(--ink-faint);
}

.hq-stages {
  position: relative;
  display: grid;
  gap: 10px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

/* The rail that joins the steps, from the source down to the answer. */
.hq-stages::before {
  content: '';
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 8px;
  width: 2px;
  background: var(--rule);
}

.hq-stage {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
}

.hq-num {
  position: relative;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--ink);
  background: var(--paper);
  font-size: 0.62rem;
  font-weight: 700;
}

.hq-answer .hq-num {
  border-color: var(--plus);
  color: var(--plus);
}

.hq-head {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.hq-tag {
  flex: none;
  padding: 0 4px;
  border: 1px solid var(--ink);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hq-title {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hq-detail {
  color: var(--ink-muted);
}

.hq-ok {
  color: var(--plus);
}

.hq-text {
  margin-top: 2px;
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.4;
  color: var(--ink);
}

.hq-text mark {
  background: none;
  color: inherit;
  text-decoration: underline 2px var(--plus);
  text-underline-offset: 3px;
}

.hq-badge {
  justify-self: start;
  display: inline-block;
  margin-top: 6px;
  padding: 2px 6px;
  border: 1px solid var(--plus);
  background: var(--ledger);
  color: var(--plus);
}
</style>
