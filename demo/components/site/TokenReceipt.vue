<script setup lang="ts">
import { estimateTokens, EXAMPLE_WORKLOAD as workload } from '../../site/savings'

const e = estimateTokens(workload)
const savedPct = Math.floor(e.savedShare * 1000) / 10
const fmt = (n: number) => n.toLocaleString('en-US')

/** Each line's tokens, under the way of working that spends them: pasting rows, or TinyPivot. */
const lines = [
  { label: `${fmt(workload.rows)} rows pasted into context`, pasting: e.pasted },
  { label: `${workload.followUps} follow-ups re-read them (cached)`, pasting: e.rereads },
  { label: `${workload.followUps} tables rewritten by the model`, pasting: e.rewrites },
  { label: `${workload.followUps + 1} TinyPivot replies, re-read (cached)`, tinypivot: e.withInput },
  { label: 'chart cards reprinted by the model', tinypivot: e.withOutput },
] as const
const pastingTotal = e.pasted + e.rereads + e.rewrites
const tinypivotTotal = e.withInput + e.withOutput
</script>

<template>
  <figure class="receipt">
    <figcaption class="receipt-head">
      <span>{{ fmt(workload.rows) }} rows × {{ workload.cols }} cols · {{ workload.followUps }} follow-up questions</span>
    </figcaption>
    <table class="receipt-lines">
      <thead>
        <tr>
          <th scope="col">
            Tokens
          </th>
          <th scope="col" class="tok">
            Pasting
          </th>
          <th scope="col" class="tok">
            TinyPivot
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in lines" :key="line.label">
          <th scope="row" class="what">
            {{ line.label }}
          </th>
          <td class="tok pasting">
            {{ 'pasting' in line ? fmt(line.pasting) : '' }}
          </td>
          <td class="tok tinypivot">
            {{ 'tinypivot' in line ? fmt(line.tinypivot) : '' }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="what">
            Total
          </th>
          <td class="tok pasting">
            {{ fmt(pastingTotal) }}
          </td>
          <td class="tok tinypivot">
            {{ fmt(tinypivotTotal) }}
          </td>
        </tr>
      </tfoot>
    </table>
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
  width: 100%;
  border-collapse: collapse;
}

.receipt-lines th,
.receipt-lines td {
  padding: 9px 10px;
  font-weight: 400;
  text-align: left;
  vertical-align: baseline;
}

.receipt-lines thead th {
  padding-block: 8px;
  border-bottom: 1px solid var(--rule);
  color: var(--ink-muted);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.receipt-lines tbody tr:nth-child(odd) {
  background: var(--ledger);
}

.receipt-lines tfoot th,
.receipt-lines tfoot td {
  border-top: 1px solid var(--rule);
  font-weight: 700;
}

.pasting {
  color: var(--minus);
}

.tinypivot {
  color: var(--plus);
  font-weight: 700;
}

.tok {
  text-align: right !important;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.receipt-total {
  display: grid;
  gap: 8px;
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
