import { describe, expect, it } from 'vitest'
import { CONNECT_COMMAND } from '../../demo/site/install'
import { directCostDeltaPct, warehouseHighlights, warehouseModels, WAREHOUSES, warehouseTotal } from '../../demo/site/warehouses'
import {
  WAREHOUSE_LOCAL_STUDY,
  WAREHOUSE_STUDY,
  warehouseArms,
  warehouseLocalArms,
  warehouseLocalResults,
  warehouseResults,
  warehouseTasks,
} from '../../demo/site/whitepaper'

describe('home direct connections section', () => {
  it('quotes the measured BigQuery gain: faster and cheaper on Claude, 88% -> 100% on local models', () => {
    expect(warehouseHighlights().map(h => h.value)).toEqual(['46% faster', '71% faster', '88% → 100%'])
    expect(warehouseHighlights()[0].label).toContain('20–25% less API spend')
  })

  it('keeps Claude accuracy level across setups and reports cheaper direct spend on both Claude models', () => {
    for (const row of warehouseResults) {
      for (const arm of Object.values(row.arms))
        expect(arm.correct).toBe(WAREHOUSE_STUDY.runsPerArm)
    }
    expect(directCostDeltaPct()).toEqual([-25, -20])
    expect(warehouseTotal('direct').cost).toBeLessThan(warehouseTotal('cli').cost)
  })

  it('lists every warehouse TinyPivot queries directly', () => {
    expect(WAREHOUSES).toEqual(['BigQuery', 'Snowflake', 'Databricks', 'ClickHouse', 'MySQL & MariaDB', 'Postgres'])
  })

  it('offers the init command that switches on existing sign-ins', () => {
    expect(CONNECT_COMMAND).toBe('npx @smallwebco/tinypivot-mcp@latest init --connect')
  })
})

describe('white paper warehouse study', () => {
  it('has one result per model and setup, and run counts that add up across Claude and local models', () => {
    expect(warehouseModels).toBe('Claude Haiku and Claude Sonnet')
    expect(warehouseTasks).toHaveLength(WAREHOUSE_STUDY.questions)
    expect(WAREHOUSE_STUDY.runsPerArm).toBe(WAREHOUSE_STUDY.questions * WAREHOUSE_STUDY.reps)
    expect(WAREHOUSE_STUDY.totalRuns).toBe(WAREHOUSE_STUDY.runsPerArm * warehouseArms.length * warehouseResults.length)
    expect(WAREHOUSE_LOCAL_STUDY.totalRuns).toBe(WAREHOUSE_LOCAL_STUDY.runsPerArm * warehouseLocalArms.length * warehouseLocalResults.length)
    for (const row of warehouseLocalResults) {
      expect(row.arms.direct.correct).toBe(WAREHOUSE_LOCAL_STUDY.runsPerArm)
      expect(row.arms.direct.correct).toBeGreaterThan(row.arms.sql.correct)
    }
  })

  it('totals the API spend of every Claude cell', () => {
    const cells = warehouseResults.flatMap(row => Object.values(row.arms))
    expect(cells.reduce((sum, arm) => sum + arm.cost, 0)).toBeCloseTo(WAREHOUSE_STUDY.totalCost, 2)
  })
})
