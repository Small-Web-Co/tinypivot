import { describe, expect, it } from 'vitest'
import { CONNECT_COMMAND } from '../../demo/site/install'
import { WAREHOUSE_BENCH, warehouseHighlights, WAREHOUSES } from '../../demo/site/warehouses'

describe('home direct connections section', () => {
  it('quotes the measured BigQuery gain, rounded down', () => {
    expect(warehouseHighlights().map(h => h.value)).toEqual(['28% faster', '20% cheaper', '12 / 12 correct'])
  })

  it('claims no accuracy gain: every setup answered every run correctly', () => {
    for (const arm of Object.values(WAREHOUSE_BENCH.arms))
      expect(arm.correct).toBe(WAREHOUSE_BENCH.runs)
  })

  it('lists every warehouse TinyPivot queries directly', () => {
    expect(WAREHOUSES).toEqual(['BigQuery', 'Snowflake', 'Databricks', 'ClickHouse', 'MySQL & MariaDB', 'Postgres'])
  })

  it('offers the init command that switches on existing sign-ins', () => {
    expect(CONNECT_COMMAND).toBe('npx @smallwebco/tinypivot-mcp@latest init --connect')
  })
})
