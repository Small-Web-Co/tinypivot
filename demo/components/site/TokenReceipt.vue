<script setup lang="ts">
/**
 * Worked example using the /docs calculator's assumptions:
 * ~5 tokens per cell, cached re-reads billed at 10%, ~600 output tokens per rewritten table.
 */
const ROWS = 2000
const COLS = 6
const FOLLOW_UPS = 5
const TOKENS_PER_CELL = 5
const CACHED_REREAD = 0.1
const OUTPUT_PER_REWRITE = 600
const SCHEMA_SUMMARY = 200

const pasted = ROWS * COLS * TOKENS_PER_CELL
const rereads = pasted * CACHED_REREAD * FOLLOW_UPS
const rewrites = OUTPUT_PER_REWRITE * FOLLOW_UPS
const without = pasted + rereads + rewrites
const saved = without - SCHEMA_SUMMARY
const savedPct = Math.floor((saved / without) * 1000) / 10

const lines = [
  { sign: '-', label: `${ROWS.toLocaleString('en-US')} rows pasted into context`, tokens: pasted },
  { sign: '-', label: `${FOLLOW_UPS} follow-ups re-read them (cached)`, tokens: rereads },
  { sign: '-', label: `${FOLLOW_UPS} tables rewritten by the model`, tokens: rewrites },
  { sign: '+', label: 'tinypivot.load_file schema summary', tokens: SCHEMA_SUMMARY },
  { sign: '+', label: `${FOLLOW_UPS} follow-ups as local clicks`, tokens: 0 },
] as const

const fmt = (n: number) => n.toLocaleString('en-US')
</script>

<template>
  <figure class="receipt">
    <figcaption class="receipt-head">
      <span>{{ ROWS.toLocaleString('en-US') }} rows × {{ COLS }} cols · {{ FOLLOW_UPS }} follow-up questions</span>
    </figcaption>
    <ol class="receipt-lines">
      <li v-for="line in lines" :key="line.label" :class="line.sign === '-' ? 'minus' : 'plus'">
        <span class="sign" aria-hidden="true">{{ line.sign }}</span>
        <span class="what">{{ line.label }}</span>
        <span class="tok">{{ fmt(line.tokens) }}</span>
      </li>
    </ol>
    <div class="receipt-total">
      <span class="what">Context you don't pay for</span>
      <span class="tok">{{ fmt(saved) }} <small>tok · {{ savedPct }}%</small></span>
    </div>
  </figure>
</template>

<style scoped>
.receipt {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--win-rule);
  border-radius: var(--radius);
  background: var(--win);
  color: var(--win-ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.receipt-head {
  padding: 12px 16px;
  border-bottom: 1px solid var(--win-rule);
  color: var(--win-muted);
  font-size: 0.72rem;
}

.receipt-lines {
  margin: 0;
  padding: 8px 0;
  list-style: none;
}

.receipt-lines li,
.receipt-total {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 10px;
  align-items: baseline;
  padding: 6px 16px;
}

.minus {
  background: rgb(248 113 113 / 0.07);
}

.minus .sign {
  color: #f87171;
}

.plus {
  background: rgb(52 211 153 / 0.07);
}

.plus .sign {
  color: var(--win-accent);
}

.minus .tok {
  color: #fca5a5;
  text-decoration: line-through;
  text-decoration-color: rgb(248 113 113 / 0.5);
}

.plus .tok {
  color: var(--win-accent);
}

.tok {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.receipt-total {
  grid-template-columns: 1fr auto;
  padding: 14px 16px;
  border-top: 1px dashed var(--win-rule);
  font-size: 0.9rem;
}

.receipt-total .tok {
  color: var(--win-accent);
  font-size: 1.05rem;
  font-weight: 500;
}

.receipt-total small {
  color: var(--win-muted);
  font-size: 0.7rem;
}

@media (min-width: 640px) {
  .receipt {
    font-size: 0.88rem;
  }
}
</style>
