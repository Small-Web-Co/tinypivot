import type { ChartConfig } from '../../packages/core/src/types'
import { describe, expect, it } from 'vitest'
import { missingPeriods, reviewChart } from '../../packages/core/src/chart/review'

function chart(type: ChartConfig['type'], series = false): ChartConfig {
  return {
    type,
    xAxis: { field: 'x', label: 'x', role: 'dimension' },
    yAxis: { field: 'y', label: 'y', role: 'measure', aggregation: 'sum' },
    ...(series ? { seriesField: { field: 's', label: 's', role: 'dimension' } } : {}),
  } as ChartConfig
}

describe('reviewing a chart against charting practice', () => {
  it('passes a plain chart without comment', () => {
    const rows = ['2026-01', '2026-02', '2026-03'].map((x, i) => ({ x, y: i + 1 }))
    expect(reviewChart(rows, chart('line'))).toEqual([])
  })

  it('asks for fewer colours when a chart has more series than a reader can tell apart', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ x: 'A', s: `plan ${i}`, y: i }))
    expect(reviewChart(rows, chart('line', true)).map(advice => advice.rule)).toEqual(['too-many-colors'])
    expect(reviewChart(rows.slice(0, 6), chart('line', true))).toEqual([])
  })

  it('steers pies with many or near-equal slices to bars', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ x: `r${i}`, y: i + 1 }))
    expect(reviewChart(many, chart('pie'))[0].rule).toBe('pie-slices')
    const close = [{ x: 'EMEA', y: 100 }, { x: 'APAC', y: 98 }, { x: 'LATAM', y: 40 }]
    expect(reviewChart(close, chart('donut'))).toEqual([{ rule: 'pie-close-slices', message: 'EMEA and APAC differ by 2.0%, too little to see between two wedges: use a bar chart, or state the numbers.' }])
  })

  it('points out months or quarters missing from a time axis, and bars too many to read', () => {
    expect(missingPeriods(['2025-11', '2026-01', '2026-02', '2026-05'])).toEqual(['2025-12', '2026-03', '2026-04'])
    expect(missingPeriods(['2025 Q3', '2026 Q1', '2026 Q2'])).toEqual(['2025 Q4'])
    expect(missingPeriods(['EMEA', 'APAC', 'LATAM'])).toEqual([])
    const gaps = ['2026-01', '2026-02', '2026-04'].map(x => ({ x, y: 1 }))
    expect(reviewChart(gaps, chart('line'))[0].message).toBe('No rows for 2026-03, so the axis skips that period and the spacing misleads: add it with zero values.')
    const bars = Array.from({ length: 40 }, (_, i) => ({ x: `customer ${i}`, y: i }))
    expect(reviewChart(bars, chart('bar')).map(advice => advice.rule)).toEqual(['too-many-bars'])
  })
})
