<script setup lang="ts">
import { estimateTokens, EXAMPLE_WORKLOAD as workload } from '../../site/savings'

const e = estimateTokens(workload)
const savedPct = Math.floor(e.savedShare * 1000) / 10
const fmt = (n: number) => n.toLocaleString('en-US')

const lines = [
  { sign: '-', label: `${fmt(workload.rows)} rows pasted into context`, tokens: e.pasted },
  { sign: '-', label: `${workload.followUps} follow-ups re-read them (cached)`, tokens: e.rereads },
  { sign: '-', label: `${workload.followUps} tables rewritten by the model`, tokens: e.rewrites },
  { sign: '+', label: `${workload.followUps + 1} tinypivot replies, re-read (cached)`, tokens: e.withInput },
  { sign: '+', label: 'chart cards reprinted by the model', tokens: e.withOutput },
] as const
</script>

<template>
  <figure class="receipt">
    <figcaption class="receipt-head">
      <span>{{ fmt(workload.rows) }} rows × {{ workload.cols }} cols · {{ workload.followUps }} follow-up questions</span>
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
      <span class="tok">{{ fmt(e.totalSaved) }} <small>tok · {{ savedPct }}%</small></span>
    </div>
  </figure>
</template>

<style scoped>
/* A strip of green-bar printer paper: tractor-feed holes, striped rows. */
.receipt {
  position: relative;
  min-width: 0;
  margin: 0;
  padding: 0 22px;
  border: var(--line);
  background: #f6f3ea;
  box-shadow: var(--shadow);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.receipt::before,
.receipt::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 21px;
  background: radial-gradient(circle, var(--paper-sunk) 0 4px, transparent 4.5px) center / 21px 24px repeat-y;
}

.receipt::before {
  left: 0;
  border-right: 1px dashed var(--rule);
}

.receipt::after {
  right: 0;
  border-left: 1px dashed var(--rule);
}

.receipt-head {
  padding: 12px 10px;
  border-bottom: 2px dashed var(--ink);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.receipt-lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.receipt-lines li,
.receipt-total {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  gap: 8px;
  align-items: baseline;
  padding: 9px 10px;
}

.receipt-lines li:nth-child(odd) {
  background: var(--ledger);
}

.sign {
  font-weight: 700;
}

.minus .sign,
.minus .tok {
  color: var(--minus);
}

.minus .tok {
  text-decoration: line-through;
}

.plus .sign,
.plus .tok {
  color: var(--plus);
  font-weight: 700;
}

.tok {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.receipt-total {
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 14px 10px;
  border-top: 2px dashed var(--ink);
  font-weight: 700;
}

.receipt-total .tok {
  font-family: var(--font-dot);
  font-size: 2.2rem;
  line-height: 1;
  color: var(--plus);
}

.receipt-total small {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--ink-muted);
}

@media (min-width: 640px) {
  .receipt {
    font-size: 0.88rem;
  }
}
</style>
