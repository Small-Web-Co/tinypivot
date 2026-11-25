/**
 * Unit tests for chart field role detection and overrides
 */
import { describe, expect, it } from 'vitest'
import { analyzeFieldsForChart, detectFieldRole, processChartData, resolveChartSortOrder } from '../../packages/core/src/chart'

describe('detectFieldRole', () => {
  it('should classify high-cardinality numbers as measure', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ revenue: i * 100.5 }))
    expect(detectFieldRole(data, 'revenue')).toBe('measure')
  })

  it('should classify string fields as dimension', () => {
    const data = [
      { category: 'A' },
      { category: 'B' },
      { category: 'C' },
    ]
    expect(detectFieldRole(data, 'category')).toBe('dimension')
  })

  it('should classify date fields as temporal', () => {
    const data = [
      { date: '2024-01-15' },
      { date: '2024-02-20' },
      { date: '2024-03-10' },
    ]
    expect(detectFieldRole(data, 'date')).toBe('temporal')
  })

  it('should return dimension for empty data', () => {
    expect(detectFieldRole([], 'anything')).toBe('dimension')
  })

  it('should return dimension for all-null column', () => {
    const data = [{ val: null }, { val: null }, { val: undefined }]
    expect(detectFieldRole(data, 'val')).toBe('dimension')
  })

  describe('jS number heuristic', () => {
    it('should classify low-cardinality JS numbers as measure', () => {
      // Likert scale: 5 unique values across 24 rows — would previously be "dimension"
      const data = Array.from({ length: 24 }, (_, i) => ({
        score: (i % 5) + 1,
      }))
      expect(detectFieldRole(data, 'score')).toBe('measure')
    })

    it('should still classify low-cardinality numeric strings as dimension', () => {
      // Same data but as strings — heuristic should not upgrade these
      const data = Array.from({ length: 24 }, (_, i) => ({
        score: String((i % 5) + 1),
      }))
      expect(detectFieldRole(data, 'score')).toBe('dimension')
    })

    it('should handle Company Size example from the issue', () => {
      const data = [
        { companySize: 50 },
        { companySize: 100 },
        { companySize: 200 },
        { companySize: 500 },
        { companySize: 50 },
        { companySize: 100 },
      ]
      expect(detectFieldRole(data, 'companySize')).toBe('measure')
    })
  })

  describe('fieldRoleOverrides', () => {
    it('should override auto-detected role to measure', () => {
      // Numeric strings that would normally be classified as dimension
      const data = Array.from({ length: 24 }, (_, i) => ({
        score: String((i % 5) + 1),
      }))
      const overrides = { score: 'measure' as const }
      expect(detectFieldRole(data, 'score', overrides)).toBe('measure')
    })

    it('should override auto-detected role to dimension', () => {
      // High-cardinality numbers that would normally be classified as measure
      const data = Array.from({ length: 50 }, (_, i) => ({ id: i }))
      const overrides = { id: 'dimension' as const }
      expect(detectFieldRole(data, 'id', overrides)).toBe('dimension')
    })

    it('should override auto-detected role to temporal', () => {
      const data = [{ year: 2020 }, { year: 2021 }, { year: 2022 }]
      const overrides = { year: 'temporal' as const }
      expect(detectFieldRole(data, 'year', overrides)).toBe('temporal')
    })

    it('should not affect fields without overrides', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({
        revenue: i * 100.5,
        category: 'A',
      }))
      const overrides = { category: 'measure' as const }
      expect(detectFieldRole(data, 'revenue', overrides)).toBe('measure')
      expect(detectFieldRole(data, 'category', overrides)).toBe('measure')
    })

    it('should work with empty overrides', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({ revenue: i * 100.5 }))
      expect(detectFieldRole(data, 'revenue', {})).toBe('measure')
    })

    it('should work with undefined overrides', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({ revenue: i * 100.5 }))
      expect(detectFieldRole(data, 'revenue', undefined)).toBe('measure')
    })
  })
})

describe('analyzeFieldsForChart', () => {
  it('should apply overrides to field analysis', () => {
    const data = Array.from({ length: 24 }, (_, i) => ({
      category: `Cat ${i % 3}`,
      score: (i % 5) + 1,
      questionOrder: (i % 3) + 1,
    }))

    // Without overrides: score is already measure (JS numbers), questionOrder too
    const withoutOverrides = analyzeFieldsForChart(data)
    const scoreField = withoutOverrides.find(f => f.field === 'score')
    expect(scoreField?.role).toBe('measure')

    // With overrides: force questionOrder to dimension
    const withOverrides = analyzeFieldsForChart(data, { questionOrder: 'dimension' })
    const questionOrderField = withOverrides.find(f => f.field === 'questionOrder')
    expect(questionOrderField?.role).toBe('dimension')

    // Score should remain measure
    const scoreFieldOverridden = withOverrides.find(f => f.field === 'score')
    expect(scoreFieldOverridden?.role).toBe('measure')
  })

  it('should return empty array for empty data', () => {
    expect(analyzeFieldsForChart([])).toEqual([])
    expect(analyzeFieldsForChart([], { foo: 'measure' })).toEqual([])
  })
})

describe('processChartData sorting', () => {
  const projectRows = [
    { project: 'Alpha', revenue: 100 },
    { project: 'Beta', revenue: 500 },
    { project: 'Gamma', revenue: 250 },
  ]

  it('defaults non-temporal bar charts to descending value order', () => {
    const res = processChartData(projectRows, {
      type: 'bar',
      xAxis: { field: 'project', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      options: {},
    })
    expect(res.categories).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(res.series[0].data).toEqual([500, 250, 100])
  })

  it('sorts ascending when sortOrder is value-asc', () => {
    const res = processChartData(projectRows, {
      type: 'bar',
      xAxis: { field: 'project', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      options: { sortOrder: 'value-asc' },
    })
    expect(res.categories).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(res.series[0].data).toEqual([100, 250, 500])
  })

  it('preserves input DataGrid row order when sortOrder is data', () => {
    const res = processChartData(projectRows, {
      type: 'bar',
      xAxis: { field: 'project', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      options: { sortOrder: 'data' },
    })
    expect(res.categories).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('keeps temporal categories chronological by default', () => {
    const monthly = [
      { month: '2026-03', hours: 10 },
      { month: '2026-01', hours: 50 },
      { month: '2026-02', hours: 25 },
    ]
    const res = processChartData(monthly, {
      type: 'stackedBar',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'hours', role: 'measure', aggregation: 'sum' },
      options: {},
    })
    expect(res.categories).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('sorts month names and quarter+year temporal labels chronologically', () => {
    const months = [
      { month: 'Mar 2026', revenue: 300 },
      { month: 'Jan 2026', revenue: 100 },
      { month: 'Feb 2026', revenue: 200 },
      { month: 'Dec 2025', revenue: 400 },
    ]
    const monthRes = processChartData(months, {
      type: 'stackedBar',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      options: {},
    })
    expect(monthRes.categories).toEqual(['Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026'])

    const quarters = [
      { period: 'Q2 2026', revenue: 200 },
      { period: 'Q4 2025', revenue: 500 },
      { period: 'Q1 2026', revenue: 100 },
    ]
    const quarterRes = processChartData(quarters, {
      type: 'stackedBar',
      xAxis: { field: 'period', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      options: {},
    })
    expect(quarterRes.categories).toEqual(['Q4 2025', 'Q1 2026', 'Q2 2026'])
  })
})

describe('processChartData stackedBar multi-series alignment & zero-filling', () => {
  const sparseMultiSeriesRows = [
    // East total: Enterprise 100 + Growth 50 = 150 (missing Starter)
    { region: 'East', segment: 'Enterprise', revenue: 100 },
    { region: 'East', segment: 'Growth', revenue: 50 },
    // West total: Enterprise 200 + Growth 150 + Starter 100 = 450
    { region: 'West', segment: 'Enterprise', revenue: 200 },
    { region: 'West', segment: 'Growth', revenue: 150 },
    { region: 'West', segment: 'Starter', revenue: 100 },
    // North total: Starter 300 (missing Enterprise & Growth)
    { region: 'North', segment: 'Starter', revenue: 300 },
    // South total: Enterprise 80 + Growth 20 (plus a null cell that must not skew count/avg)
    { region: 'South', segment: 'Enterprise', revenue: 80 },
    { region: 'South', segment: 'Growth', revenue: 20 },
    { region: 'South', segment: 'Starter', revenue: null },
  ]

  it('aligns every series 1:1 with sorted categories by stacked total (value-desc) and zero-fills sparse cells', () => {
    const res = processChartData(sparseMultiSeriesRows, {
      type: 'stackedBar',
      xAxis: { field: 'region', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'segment', role: 'dimension' },
      options: {},
    })

    // Stacked totals: West (450) > North (300) > East (150) > South (100)
    expect(res.categories).toEqual(['West', 'North', 'East', 'South'])
    expect(res.series).toHaveLength(3)

    const byName = Object.fromEntries(res.series.map(s => [s.name, s.data]))
    expect(byName.Enterprise).toEqual([200, 0, 100, 80])
    expect(byName.Growth).toEqual([150, 0, 50, 20])
    expect(byName.Starter).toEqual([100, 300, 0, 0])

    // Every series aligns 1:1 with categories and contains finite numbers (never null/undefined/NaN)
    for (const s of res.series) {
      expect(s.data).toHaveLength(res.categories.length)
      for (const v of s.data) {
        expect(typeof v).toBe('number')
        expect(Number.isFinite(v)).toBe(true)
      }
    }

    // Column totals match descending order
    const totals = res.categories.map((_, idx) =>
      res.series.reduce((acc, s) => acc + s.data[idx], 0),
    )
    expect(totals).toEqual([450, 300, 150, 100])
  })

  it('reorders categories and every series identically when sorting ascending (value-asc)', () => {
    const res = processChartData(sparseMultiSeriesRows, {
      type: 'stackedBar',
      xAxis: { field: 'region', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'segment', role: 'dimension' },
      options: { sortOrder: 'value-asc' },
    })

    expect(res.categories).toEqual(['South', 'East', 'North', 'West'])
    const byName = Object.fromEntries(res.series.map(s => [s.name, s.data]))
    expect(byName.Enterprise).toEqual([80, 100, 0, 200])
    expect(byName.Growth).toEqual([20, 50, 0, 150])
    expect(byName.Starter).toEqual([0, 0, 300, 100])
  })

  it('does not let null or empty measure cells skew avg aggregation while still zero-filling missing cells', () => {
    const rows = [
      { quarter: 'Q1', region: 'West', revenue: 100 },
      { quarter: 'Q1', region: 'West', revenue: null },
      { quarter: 'Q1', region: 'West', revenue: '' },
      { quarter: 'Q1', region: 'East', revenue: 50 },
      { quarter: 'Q2', region: 'West', revenue: 200 },
    ]
    const res = processChartData(rows, {
      type: 'stackedBar',
      xAxis: { field: 'quarter', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'avg' },
      seriesField: { field: 'region', role: 'dimension' },
      options: {},
    })

    expect(res.categories).toEqual(['Q1', 'Q2'])
    const byName = Object.fromEntries(res.series.map(s => [s.name, s.data]))
    // Avg of [100] must be 100, NOT 100/3 = 33.33
    expect(byName.West).toEqual([100, 200])
    // Missing Q2/East cell is zero-filled as 0
    expect(byName.East).toEqual([50, 0])
  })

  it('resolves default sortOrder for stackedBar (categorical vs temporal vs explicit)', () => {
    expect(resolveChartSortOrder({ type: 'stackedBar' }, ['West', 'East', 'North'])).toBe('value-desc')
    expect(resolveChartSortOrder({ type: 'stackedBar' }, ['Q1', 'Q2', 'Q3', 'Q4'])).toBe('label-asc')
    expect(resolveChartSortOrder({ type: 'stackedBar', options: { sortOrder: 'data' } }, ['West', 'East'])).toBe('data')
  })
})

describe('counting a column that holds text', () => {
  const orders = [
    { month: 'Jan', channel: 'Partner', order_id: 'ORD-1' },
    { month: 'Jan', channel: 'Sales', order_id: 'ORD-2' },
    { month: 'Feb', channel: 'Partner', order_id: 'ORD-3' },
    { month: 'Feb', channel: 'Partner', order_id: 'ORD-3' },
    { month: 'Feb', channel: 'Sales', order_id: '' },
  ]
  const config = (aggregation: 'count' | 'countDistinct' | 'sum') => ({
    type: 'bar' as const,
    xAxis: { field: 'month', role: 'dimension' as const },
    yAxis: { field: 'order_id', role: 'measure' as const, aggregation },
  })

  it('counts rows per category, skipping blanks', () => {
    const res = processChartData(orders, config('count'))
    expect(res.categories).toEqual(['Jan', 'Feb'])
    expect(res.series[0].data).toEqual([2, 2])
  })

  it('counts distinct text values', () => {
    const res = processChartData(orders, config('countDistinct'))
    expect(res.series[0].data).toEqual([2, 1])
  })

  it('still leaves text out of numeric aggregations', () => {
    expect(processChartData(orders, config('sum')).categories).toEqual([])
  })
})

describe('missing values in category charts', () => {
  // 2026 has no rows for March, so its line should break there instead of dropping to zero.
  const rows = [
    { month: 'Jan', year: '2025', mrr: 10 },
    { month: 'Feb', year: '2025', mrr: 12 },
    { month: 'Mar', year: '2025', mrr: 14 },
    { month: 'Jan', year: '2026', mrr: 20 },
    { month: 'Feb', year: '2026', mrr: 0 },
  ]
  const config = {
    type: 'line' as const,
    xAxis: { field: 'month', role: 'dimension' as const },
    yAxis: { field: 'mrr', role: 'measure' as const, aggregation: 'sum' as const },
    seriesField: { field: 'year', role: 'dimension' as const },
    options: { sortOrder: 'data' as const },
  }

  it('reports a category with no rows as null, and a real zero as zero', () => {
    const res = processChartData(rows, config)
    expect(res.categories).toEqual(['Jan', 'Feb', 'Mar'])
    expect(res.series.find(s => s.name === '2025')?.data).toEqual([10, 12, 14])
    expect(res.series.find(s => s.name === '2026')?.data).toEqual([20, 0, null])
  })

  it('still orders categories by total when one series is missing a value', () => {
    const res = processChartData(rows, { ...config, options: { sortOrder: 'value-desc' as const } })
    expect(res.categories).toEqual(['Jan', 'Mar', 'Feb'])
  })
})
