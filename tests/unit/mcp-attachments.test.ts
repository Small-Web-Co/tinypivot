import { describe, expect, it } from 'vitest'
import { describeChart, describePivot, viewAttachment } from '../../packages/mcp/app/attachments'

const ROWS = [
  { region: 'EMEA', channel: 'Partner', mrr: 1200 },
  { region: 'APAC', channel: 'Sales', mrr: 900 },
]

describe('what the Studio attaches when the user sends the current view', () => {
  it('describes a pivot by its layout instead of pasting source rows', () => {
    const attachment = viewAttachment('Acme orders', 'ds-1', {
      mode: 'pivot',
      pivotConfig: { rowFields: ['region'], columnFields: ['channel'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
    }, ROWS)

    expect(attachment.label).toBe('Acme orders · pivot table')
    expect(attachment.text).toBe('Dataset "Acme orders" (`ds-1`), shown as a pivot table: sum(mrr) by region × channel.')
    expect(attachment.text).not.toContain('EMEA')
  })

  it('describes a chart by its type and axes', () => {
    const attachment = viewAttachment('Acme orders', 'ds-1', {
      mode: 'chart',
      chartConfig: { type: 'line', xAxis: { field: 'period', role: 'dimension' }, yAxis: { field: 'mrr', role: 'measure', aggregation: 'sum' }, seriesField: { field: 'year', role: 'dimension' } },
    }, ROWS)

    expect(attachment.label).toBe('Acme orders · line chart')
    expect(attachment.text).toContain('shown as a line chart of sum(mrr) by period, split by year.')
  })

  it('sends sample rows for the plain table, and for a pivot that has no values yet', () => {
    expect(viewAttachment('Acme orders', 'ds-1', { mode: 'grid' }, ROWS).text).toContain('| EMEA | Partner | 1200 |')
    expect(viewAttachment('Acme orders', 'ds-1', { mode: 'pivot', pivotConfig: { rowFields: ['region'] } }, ROWS).text).toContain('First rows:')
  })

  it('names pivot and chart layouts briefly', () => {
    expect(describePivot({ valueFields: [{ field: 'mrr', aggregation: 'avg' }] })).toBe('avg(mrr)')
    expect(describePivot(undefined)).toBeUndefined()
    expect(describeChart({ type: 'pie' })).toBe('pie chart')
  })
})
