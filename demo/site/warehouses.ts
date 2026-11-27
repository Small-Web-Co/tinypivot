import type { WarehouseArmId, WarehouseArmResult } from './whitepaper'
import { percentChange } from './modelChart'
import { WAREHOUSE_STUDY, warehouseResults } from './whitepaper'

/** Direct warehouse connections (Pro): what they are for, and the measured gain behind the claim. */

export const WAREHOUSES = ['BigQuery', 'Snowflake', 'Databricks', 'ClickHouse', 'MySQL & MariaDB', 'Postgres'] as const

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

/** The models in the white paper's BigQuery study, e.g. "Claude Haiku and Claude Sonnet". */
export const warehouseModels = warehouseResults.map(row => row.model).join(' and ')

/** Every model's runs added up for one setup; time is the average per question over all of them. */
export function warehouseTotal(arm: WarehouseArmId): WarehouseArmResult {
  const sum = (key: keyof WarehouseArmResult) => warehouseResults.reduce((total, row) => total + row.arms[arm][key], 0)
  return { correct: sum('correct'), avgSec: sum('avgSec') / warehouseResults.length, cost: sum('cost') }
}

/** How much more direct queries cost than the agent driving the bq command line, per model, in whole percent. */
export function directExtraCostPct(): number[] {
  return warehouseResults.map(({ arms }) => Math.round(((arms.direct.cost - arms.cli.cost) / arms.cli.cost) * 100))
}

export function warehouseHighlights() {
  const [cli, exported, direct] = (['cli', 'export', 'direct'] as const).map(warehouseTotal)
  const extraCost = directExtraCostPct()
  const runs = WAREHOUSE_STUDY.runsPerArm * warehouseResults.length
  return [
    { value: `${-percentChange(cli.avgSec, direct.avgSec)}% faster`, label: 'per question than the agent driving the bq command line itself' },
    { value: `${-percentChange(exported.avgSec, direct.avgSec)}% faster`, label: 'than exporting to a file first and analysing that, the route TinyPivot Free has' },
    {
      value: `${direct.correct} / ${runs} correct`,
      label: `as in every other setup: the gain is time, not accuracy, at ${Math.min(...extraCost)}–${Math.max(...extraCost)}% more API spend than the command line`,
    },
  ]
}
