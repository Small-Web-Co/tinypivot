import { describe, expect, it } from 'vitest'
import { buildModelChartRows, formatCost, modelChartHighlights, percentChange } from '../../demo/site/modelChart'

describe('home model comparison chart', () => {
  const rows = buildModelChartRows()
  const row = (id: string) => rows.find(r => r.id === id)!

  it('shows every model with accuracy, time and cost', () => {
    expect(rows.map(r => r.id)).toEqual(['inkling', 'deepseek', 'haiku', 'sonnet', 'opus'])
    expect(row('inkling').cells.accuracy.change).toBe('+22 pts')
    expect(row('opus').cells.accuracy.change).toBe('already 100%')
  })

  it('scales bars to the largest value in each column', () => {
    expect(row('inkling').cells.time.alone?.pct).toBe(100)
    expect(row('opus').cells.cost.alone?.pct).toBe(100)
    expect(row('haiku').cells.cost.pro?.pct).toBeLessThan(5)
  })

  it('reports local models as free to run instead of imputed API prices', () => {
    const cost = row('deepseek').cells.cost
    expect(cost.alone).toBeNull()
    expect(cost.note).toContain('$0')
  })

  it('labels slowdowns and cost increases honestly', () => {
    expect(row('opus').cells.time).toMatchObject({ change: '2% more', better: false, rose: true })
    expect(row('haiku').cells.cost).toMatchObject({ change: '12% more', better: false })
    expect(row('opus').cells.cost).toMatchObject({ change: '39% less', better: true, rose: false })
  })

  it('never overstates the highlights', () => {
    expect(percentChange(46.1, 26.0)).toBe(-43)
    expect(formatCost(0.083)).toBe('8¢')
    expect(formatCost(2.32)).toBe('$2.32')
    expect(modelChartHighlights().map(h => h.value)).toEqual(['78% → 100%', '43% less time', 'under 4% of the cost'])
  })
})
