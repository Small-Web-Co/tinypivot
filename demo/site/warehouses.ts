import type { WarehouseArmId, WarehouseArmResult } from './whitepaper'
import { percentChange } from './modelChart'
import { WAREHOUSE_LOCAL_STUDY, warehouseLocalResults, warehouseResults } from './whitepaper'

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
    title: '1-call schema & trap brief',
    body: 'profile() reads 0-scan metadata plus one aggregate probe per table to surface schemas, filter values, date ranges, join fan-out, NULL shares and mixed currencies before the first query.',
  },
  {
    title: 'The sign-in you already have',
    body: 'Reuses gcloud, the Snowflake and Databricks CLIs, and your MySQL and ClickHouse client settings. Setup saves a pointer to them, never a password.',
  },
  {
    title: 'Read-only, with a spend cap',
    body: 'Checked by the warehouse\'s own dry run or query plan before it runs, with a scan cap, a table allowlist, batched queries[] and a tag on every query.',
  },
] as const

/** The models in the white paper's BigQuery study, e.g. "Claude Haiku and Claude Sonnet". */
export const warehouseModels = warehouseResults.map(row => row.model).join(' and ')

/** Every model's runs added up for one setup; time is the average per question over all of them. */
export function warehouseTotal(arm: WarehouseArmId): WarehouseArmResult {
  const sum = (key: keyof WarehouseArmResult) => warehouseResults.reduce((total, row) => total + row.arms[arm][key], 0)
  return { correct: sum('correct'), avgSec: sum('avgSec') / warehouseResults.length, cost: sum('cost') }
}

/** Percent cost change of direct queries vs the agent driving the bq command line, per Claude model (negative means cheaper). */
export function directCostDeltaPct(): number[] {
  return warehouseResults.map(({ arms }) => Math.round(((arms.direct.cost - arms.cli.cost) / arms.cli.cost) * 100))
}

export function warehouseHighlights() {
  const [cli, exported, direct] = (['cli', 'export', 'direct'] as const).map(warehouseTotal)
  const costSavings = directCostDeltaPct().map(pct => -pct)
  const localSql = warehouseLocalResults.reduce((s, r) => s + r.arms.sql.correct, 0)
  const localDirect = warehouseLocalResults.reduce((s, r) => s + r.arms.direct.correct, 0)
  const localTotal = WAREHOUSE_LOCAL_STUDY.runsPerArm * warehouseLocalResults.length
  return [
    { value: `${-percentChange(cli.avgSec, direct.avgSec)}% faster`, label: `per question than the bq command line on Claude (${Math.min(...costSavings)}–${Math.max(...costSavings)}% less API spend)` },
    { value: `${-percentChange(exported.avgSec, direct.avgSec)}% faster`, label: 'than exporting to a file first and analysing that, the route TinyPivot Free has' },
    {
      value: `${Math.round((localSql / localTotal) * 100)}% → ${Math.round((localDirect / localTotal) * 100)}%`,
      label: `on small local models (Inkling 2 Mini & DeepSeek V4.1 Flash, ${localDirect}/${localTotal} correct vs ${localSql}/${localTotal} bare SQL, turns cut in half)`,
    },
  ]
}
