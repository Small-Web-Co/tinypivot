import { percentChange } from './modelChart'

/** Direct warehouse connections (Pro): what they are for, and the measured gain behind the claim. */

export interface Warehouse {
  name: string
  /** True until the connector has passed a test against a real warehouse. */
  preview: boolean
}

export const WAREHOUSES: Warehouse[] = [
  { name: 'BigQuery', preview: false },
  { name: 'Postgres', preview: false },
  { name: 'Snowflake', preview: true },
  { name: 'Databricks', preview: true },
  { name: 'ClickHouse', preview: true },
  { name: 'MySQL & MariaDB', preview: true },
]

/** Per-warehouse sign-in and guard settings live in the MCP README. */
export const WAREHOUSE_SETUP_URL = 'https://github.com/Small-Web-Co/tinypivot/tree/master/packages/mcp#direct-connections-pro'

export const WAREHOUSE_BENEFITS = [
  {
    title: 'Totals over every row',
    body: 'The warehouse does the maths on the whole table. No 100-row command-line preview, no sampled export, nothing quietly cut off.',
  },
  {
    title: 'Nothing to export',
    body: 'No CSV copies on laptops to keep in sync. The agent sees the result, never the raw table.',
  },
  {
    title: 'The sign-in you already have',
    body: 'Reuses gcloud, the Snowflake and Databricks CLIs, and your MySQL and ClickHouse client settings. Setup saves a pointer to them, never a password.',
  },
  {
    title: 'Read-only, with a spend cap',
    body: 'One SELECT at a time, checked by the warehouse\'s own dry run or query plan before it runs, with a scan cap, a table allowlist and a tag on every query.',
  },
] as const

/**
 * Claude Haiku on 6 trap questions over BigQuery, 2 runs each (analysis/warehouse-benchmark).
 * Totals for all 12 runs.
 */
export const WAREHOUSE_BENCH = {
  model: 'Claude Haiku',
  questions: 6,
  runs: 12,
  arms: {
    cli: { label: 'Agent drives the bq command line', correct: 12, avgSec: 26.3, cost: 0.088 },
    export: { label: 'Export to a file, then TinyPivot', correct: 12, avgSec: 26.3, cost: 0.069 },
    direct: { label: 'TinyPivot queries BigQuery directly', correct: 12, avgSec: 18.8, cost: 0.0702 },
  },
} as const

export function warehouseHighlights() {
  const { cli, direct } = WAREHOUSE_BENCH.arms
  return [
    { value: `${-percentChange(cli.avgSec, direct.avgSec)}% faster`, label: 'per question than exporting first or letting the agent drive the bq command line' },
    { value: `${-percentChange(cli.cost, direct.cost)}% cheaper`, label: 'than the agent driving the bq command line, and the same as exporting first' },
    { value: `${direct.correct} / ${WAREHOUSE_BENCH.runs} correct`, label: 'in every setup: on these questions the gain is time and spend, not accuracy' },
  ]
}
