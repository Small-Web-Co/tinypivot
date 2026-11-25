import { describe, expect, it } from 'vitest'
import { DatasetStore, formatDatasetSummary } from '../../packages/mcp/src/index'
import { DISTINCT_COUNT_CAP, inferColumns } from '../../packages/mcp/src/store'

/** A date-ordered export: every early row shares the same year and month. */
function sortedOrders(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    order_id: `ORD-${i}`,
    year: i < count / 2 ? 2025 : 2026,
    month: ['Jan', 'Feb', 'Mar', 'Apr'][Math.floor((i / count) * 4)],
    mrr: 100 + (i % 7),
  }))
}

describe('column summaries describe the whole dataset', () => {
  it('counts distinct values past the first rows of a sorted file', () => {
    const columns = inferColumns(sortedOrders(4000))
    const byName = Object.fromEntries(columns.map(column => [column.name, column]))

    expect(byName.year.distinctCount).toBe(2)
    expect(byName.month.distinctCount).toBe(4)
    expect(byName.mrr.distinctCount).toBe(7)
    expect(byName.year.type).toBe('number')
  })

  it('stops counting at the cap and reports it as a lower bound', () => {
    const rows = sortedOrders(DISTINCT_COUNT_CAP + 500)
    const orderId = inferColumns(rows).find(column => column.name === 'order_id')
    expect(orderId?.distinctCount).toBe(DISTINCT_COUNT_CAP)

    const dataset = new DatasetStore().register({ name: 'orders', source: 'test', rows })
    const summary = formatDatasetSummary(dataset)
    expect(summary).toContain('`order_id` (string, 1,000+ distinct')
    expect(summary).toContain('`year` (number, 2 distinct')
  })
})
