<script setup lang="ts">
import { formatCost } from '../../site/modelChart'
import { WAREHOUSE_STUDY, warehouseArms, warehouseResults, warehouseTasks } from '../../site/whitepaper'

/** White paper: the direct-warehouse benchmark's results by model and setup, and the questions behind them. */
</script>

<template>
  <figure class="whb">
    <p class="label whb-cap">
      BigQuery · {{ WAREHOUSE_STUDY.questions }} questions × {{ WAREHOUSE_STUDY.reps }} runs per model and setup · {{ WAREHOUSE_STUDY.date }}
    </p>
    <div class="whb-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">
              Model
            </th>
            <th v-for="arm in warehouseArms" :key="arm.id" scope="col" :class="{ 'col-direct': arm.id === 'direct' }">
              {{ arm.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in warehouseResults" :key="row.model">
            <th scope="row">
              <strong>{{ row.model }}</strong>
            </th>
            <td v-for="arm in warehouseArms" :key="arm.id" :class="{ 'col-direct': arm.id === 'direct' }">
              <span class="score">{{ row.arms[arm.id].correct }} / {{ WAREHOUSE_STUDY.runsPerArm }} correct</span>
              <span class="sub">{{ row.arms[arm.id].avgSec.toFixed(1) }}s per question · {{ formatCost(row.arms[arm.id].cost) }} for all {{ WAREHOUSE_STUDY.runsPerArm }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <figcaption class="whb-note">
      Time is the agent’s own wall-clock time per question, averaged over every run; cost is the API price of all
      {{ WAREHOUSE_STUDY.runsPerArm }} runs in that cell. Whole study: {{ WAREHOUSE_STUDY.totalRuns }} runs, {{ formatCost(WAREHOUSE_STUDY.totalCost) }}.
    </figcaption>

    <details class="whb-tasks">
      <summary class="mono">
        <span>The {{ WAREHOUSE_STUDY.questions }} questions and the trap in each</span>
        <span class="whb-ico" aria-hidden="true">+</span>
      </summary>
      <ol class="whb-task-list">
        <li v-for="task in warehouseTasks" :key="task.id">
          <strong>{{ task.title }}</strong>
          <p class="whb-prompt">
            “{{ task.prompt }}”
          </p>
          <p class="whb-trap">
            {{ task.trap }}
          </p>
        </li>
      </ol>
    </details>
  </figure>
</template>

<style scoped>
.whb {
  margin: 0;
  display: grid;
  gap: 12px;
}

.whb-scroll {
  overflow-x: auto;
  border: var(--line);
  background: var(--paper);
}

table {
  width: 100%;
  min-width: 560px;
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
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: 0;
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
  line-height: 1.35;
  color: var(--ink-muted);
}

.col-direct {
  background: var(--ledger);
}

.whb-note {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.whb-tasks {
  border: var(--line);
  background: var(--paper);
}

.whb-tasks summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  font-size: 0.82rem;
  font-weight: 700;
}

.whb-tasks summary::-webkit-details-marker {
  display: none;
}

.whb-tasks[open] .whb-ico {
  transform: rotate(45deg);
}

.whb-ico {
  font-size: 1.1rem;
  transition: transform 0.15s ease;
}

.whb-task-list {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 4px 16px 16px 36px;
}

.whb-task-list p {
  margin: 4px 0 0;
  font-size: 0.88rem;
  line-height: 1.5;
}

.whb-prompt {
  color: var(--ink);
}

.whb-trap {
  color: var(--ink-muted);
}
</style>
