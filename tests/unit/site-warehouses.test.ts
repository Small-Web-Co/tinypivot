import { describe, expect, it } from 'vitest'
import { CONNECT_COMMAND } from '../../demo/site/install'
import { directExtraCostPct, warehouseHighlights, warehouseModels, WAREHOUSES, warehouseTotal } from '../../demo/site/warehouses'
import { WAREHOUSE_STUDY, warehouseArms, warehouseResults, warehouseTasks } from '../../demo/site/whitepaper'

describe('home direct connections section', () => {
  it('quotes the measured BigQuery gain, speed rounded down and extra cost stated', () => {
    expect(warehouseHighlights().map(h => h.value)).toEqual(['27% faster', '61% faster', '32 / 32 correct'])
    expect(warehouseHighlights()[2].label).toContain('4–15% more API spend')
  })

  it('claims no accuracy gain: every setup answered every run correctly', () => {
    for (const row of warehouseResults) {
      for (const arm of Object.values(row.arms))
        expect(arm.correct).toBe(WAREHOUSE_STUDY.runsPerArm)
    }
  })

  it('reports that direct queries cost more than the command line on every model', () => {
    expect(directExtraCostPct()).toEqual([15, 4])
    expect(warehouseTotal('direct').cost).toBeGreaterThan(warehouseTotal('cli').cost)
  })

  it('lists every warehouse TinyPivot queries directly', () => {
    expect(WAREHOUSES).toEqual(['BigQuery', 'Snowflake', 'Databricks', 'ClickHouse', 'MySQL & MariaDB', 'Postgres'])
  })

  it('offers the init command that switches on existing sign-ins', () => {
    expect(CONNECT_COMMAND).toBe('npx @smallwebco/tinypivot-mcp@latest init --connect')
  })
})

describe('white paper warehouse study', () => {
  it('has one result per model and setup, and run counts that add up', () => {
    expect(warehouseModels).toBe('Claude Haiku and Claude Sonnet')
    expect(warehouseTasks).toHaveLength(WAREHOUSE_STUDY.questions)
    expect(WAREHOUSE_STUDY.runsPerArm).toBe(WAREHOUSE_STUDY.questions * WAREHOUSE_STUDY.reps)
    expect(WAREHOUSE_STUDY.totalRuns).toBe(WAREHOUSE_STUDY.runsPerArm * warehouseArms.length * warehouseResults.length)
  })

  it('totals the API spend of every cell', () => {
    const cells = warehouseResults.flatMap(row => Object.values(row.arms))
    expect(cells.reduce((sum, arm) => sum + arm.cost, 0)).toBeCloseTo(WAREHOUSE_STUDY.totalCost, 2)
  })
})
