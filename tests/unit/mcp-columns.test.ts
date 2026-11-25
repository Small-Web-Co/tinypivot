import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DatasetStore, formatDatasetSummary } from '../../packages/mcp/src/index'
import { describeFilters, DISTINCT_COUNT_CAP, filterRows, inferColumns } from '../../packages/mcp/src/store'

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

describe('loading only the rows a question is about', () => {
  const rows = [
    { year: 2025, channel: 'Partner', mrr: 10 },
    { year: 2026, channel: 'Partner', mrr: 20 },
    { year: 2026, channel: 'Sales', mrr: 30 },
    { year: '2026', channel: 'Partner', mrr: 40 },
  ]

  it('keeps rows that match every filter, comparing numbers and text alike', () => {
    const kept = filterRows(rows, [{ field: 'year', equals: [2026] }, { field: 'channel', equals: ['Partner'] }])
    expect(kept.map(row => row.mrr)).toEqual([20, 40])
  })

  it('accepts several values for one field and returns everything with no filters', () => {
    expect(filterRows(rows, [{ field: 'channel', equals: ['Sales', 'Partner'] }])).toHaveLength(4)
    expect(filterRows(rows, [])).toEqual(rows)
    expect(filterRows(rows, [{ field: 'missing', equals: ['x'] }])).toEqual([])
  })

  it('names the filtered dataset after its filters', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-where-'))
    const file = path.join(dir, 'orders.csv')
    await fs.writeFile(file, 'year,channel,mrr\n2025,Partner,10\n2026,Partner,20\n2026,Sales,30\n')

    const dataset = await new DatasetStore().loadFromFile(file, undefined, { where: [{ field: 'year', equals: [2026] }] })
    expect(dataset.rows).toHaveLength(2)
    expect(dataset.name).toBe('orders.csv (year = 2026)')
    expect(describeFilters([{ field: 'channel', equals: ['Partner', 'Sales'] }])).toBe('channel = Partner or Sales')

    await fs.rm(dir, { recursive: true, force: true })
  })
})
