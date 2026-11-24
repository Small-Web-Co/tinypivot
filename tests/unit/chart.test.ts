/**
 * Unit tests for chart field role detection and overrides
 */
import { describe, expect, it } from 'vitest'
import { analyzeFieldsForChart, detectFieldRole, processChartData } from '../../packages/core/src/chart'

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
})
