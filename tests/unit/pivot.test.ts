/**
 * Unit tests for pivot table functions
 */
import { describe, expect, it } from 'vitest'
import {
  aggregate,
  computeAvailableFields,
  computePivotResult,
  evaluateFormula,
  formatAggregatedValue,
  formatCalculatedValue,
  getAggregationLabel,
  getAggregationSymbol,
  getUnassignedFields,
  isPivotConfigured,
  parseFormula,
  validateFormula,
  validateSimpleFormula,
} from '../../packages/core/src/pivot'

describe('aggregate', () => {
  it('should calculate sum', () => {
    expect(aggregate([1, 2, 3, 4, 5], 'sum')).toBe(15)
  })

  it('should calculate count', () => {
    expect(aggregate([1, 2, 3], 'count')).toBe(3)
  })

  it('should calculate average', () => {
    expect(aggregate([10, 20, 30], 'avg')).toBe(20)
  })

  it('should calculate min', () => {
    expect(aggregate([5, 2, 8, 1, 9], 'min')).toBe(1)
  })

  it('should calculate max', () => {
    expect(aggregate([5, 2, 8, 1, 9], 'max')).toBe(9)
  })

  it('should calculate countDistinct', () => {
    expect(aggregate([1, 2, 2, 3, 3, 3], 'countDistinct')).toBe(3)
  })

  it('should calculate median for odd count', () => {
    expect(aggregate([1, 2, 3, 4, 5], 'median')).toBe(3)
  })

  it('should calculate median for even count', () => {
    expect(aggregate([1, 2, 3, 4], 'median')).toBe(2.5)
  })

  it('should calculate percentOfTotal', () => {
    const values = [25]
    const grandTotal = 100
    expect(aggregate(values, 'percentOfTotal', grandTotal)).toBe(25)
  })

  it('should return null for empty values', () => {
    expect(aggregate([], 'sum')).toBe(null)
    expect(aggregate([], 'avg')).toBe(null)
  })
})

describe('formatAggregatedValue', () => {
  it('should format count as integer', () => {
    expect(formatAggregatedValue(100.5, 'count')).toBe('101')
  })

  it('should format percentOfTotal with %', () => {
    expect(formatAggregatedValue(25.5, 'percentOfTotal')).toBe('25.5%')
  })

  it('should format large numbers with commas', () => {
    const result = formatAggregatedValue(1000000, 'sum')
    expect(result).toMatch(/1,000,000/)
  })

  it('should return dash for null', () => {
    expect(formatAggregatedValue(null, 'sum')).toBe('-')
  })
})

describe('getAggregationLabel', () => {
  it('should return correct labels', () => {
    expect(getAggregationLabel('sum')).toBe('Sum')
    expect(getAggregationLabel('avg')).toBe('Average')
    expect(getAggregationLabel('countDistinct')).toBe('Count Distinct')
  })

  it('should use custom label for custom aggregation', () => {
    expect(getAggregationLabel('custom', 'My Custom')).toBe('My Custom')
  })
})

describe('getAggregationSymbol', () => {
  it('should return correct symbols', () => {
    expect(getAggregationSymbol('sum')).toBe('Σ')
    expect(getAggregationSymbol('count')).toBe('#')
    expect(getAggregationSymbol('avg')).toBe('x̄')
  })
})

describe('parseFormula', () => {
  it('should parse simple formula', () => {
    const result = parseFormula('SUM(revenue)')
    expect(result).toEqual([{ fn: 'SUM', field: 'revenue' }])
  })

  it('should parse formula with multiple functions', () => {
    const result = parseFormula('SUM(revenue) / SUM(units)')
    expect(result).toEqual([
      { fn: 'SUM', field: 'revenue' },
      { fn: 'SUM', field: 'units' },
    ])
  })

  it('should handle different aggregation functions', () => {
    const result = parseFormula('AVG(price) + MIN(cost) - MAX(discount)')
    expect(result).toHaveLength(3)
    expect(result[0].fn).toBe('AVG')
    expect(result[1].fn).toBe('MIN')
    expect(result[2].fn).toBe('MAX')
  })
})

describe('evaluateFormula', () => {
  it('should evaluate simple formula', () => {
    const aggregatedValues = { 'SUM(revenue)': 100, 'SUM(units)': 10 }
    const result = evaluateFormula('SUM(revenue) / SUM(units)', aggregatedValues)
    expect(result).toBe(10)
  })

  it('should return null if any value is null', () => {
    const aggregatedValues = { 'SUM(revenue)': null, 'SUM(units)': 10 }
    const result = evaluateFormula('SUM(revenue) / SUM(units)', aggregatedValues)
    expect(result).toBe(null)
  })

  it('should handle multiplication', () => {
    const aggregatedValues = { 'SUM(revenue)': 100 }
    const result = evaluateFormula('SUM(revenue) * 100', aggregatedValues)
    expect(result).toBe(10000)
  })
})

describe('formatCalculatedValue', () => {
  it('should format as percent', () => {
    expect(formatCalculatedValue(25.5, 'percent')).toBe('25.50%')
  })

  it('should format as currency', () => {
    const result = formatCalculatedValue(1000, 'currency')
    expect(result).toMatch(/\$1,000/)
  })

  it('should format as number by default', () => {
    const result = formatCalculatedValue(1234.5678, 'number', 2)
    expect(result).toMatch(/1,234\.57/)
  })

  it('should return dash for null', () => {
    expect(formatCalculatedValue(null)).toBe('-')
  })
})

describe('validateFormula', () => {
  it('should accept valid formula', () => {
    const result = validateFormula('SUM(revenue) / SUM(units)', ['revenue', 'units'])
    expect(result).toBe(null)
  })

  it('should reject empty formula', () => {
    const result = validateFormula('', ['revenue'])
    expect(result).toBe('Formula cannot be empty')
  })

  it('should reject formula without functions', () => {
    const result = validateFormula('revenue + units', ['revenue', 'units'])
    expect(result).toBe('Formula must contain at least one function like SUM(field)')
  })

  it('should reject unknown fields', () => {
    const result = validateFormula('SUM(unknown)', ['revenue'])
    expect(result).toBe('Unknown field: unknown')
  })
})

describe('validateSimpleFormula', () => {
  it('should accept valid simple formula', () => {
    const result = validateSimpleFormula('revenue / units', ['revenue', 'units'])
    expect(result).toBe(null)
  })

  it('should reject empty formula', () => {
    const result = validateSimpleFormula('', ['revenue'])
    expect(result).toBe('Formula is required')
  })

  it('should reject unknown fields', () => {
    const result = validateSimpleFormula('revenue / unknown', ['revenue', 'units'])
    expect(result).toBe('Unknown field: unknown')
  })
})

describe('computeAvailableFields', () => {
  it('should compute field stats from data', () => {
    const data = [
      { name: 'A', amount: 100 },
      { name: 'B', amount: 200 },
    ]
    const result = computeAvailableFields(data)
    expect(result).toHaveLength(2)
    expect(result.find(f => f.field === 'name')?.isNumeric).toBe(false)
    expect(result.find(f => f.field === 'amount')?.isNumeric).toBe(true)
  })

  it('should return empty for empty data', () => {
    expect(computeAvailableFields([])).toEqual([])
  })
})

describe('getUnassignedFields', () => {
  it('should return fields not in config', () => {
    const availableFields = [
      { field: 'region', type: 'string' as const, uniqueCount: 3, isNumeric: false },
      { field: 'product', type: 'string' as const, uniqueCount: 5, isNumeric: false },
      { field: 'sales', type: 'number' as const, uniqueCount: 100, isNumeric: true },
    ]
    const result = getUnassignedFields(
      availableFields,
      ['region'],
      [],
      [{ field: 'sales', aggregation: 'sum' }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].field).toBe('product')
  })
})

describe('isPivotConfigured', () => {
  it('should return true when configured', () => {
    const config = {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: false,
    }
    expect(isPivotConfigured(config)).toBe(true)
  })

  it('should return false when not configured', () => {
    const config = {
      rowFields: [],
      columnFields: [],
      valueFields: [],
      showRowTotals: false,
      showColumnTotals: false,
    }
    expect(isPivotConfigured(config)).toBe(false)
  })

  it('should return false when only dimension fields', () => {
    const config = {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [],
      showRowTotals: false,
      showColumnTotals: false,
    }
    expect(isPivotConfigured(config)).toBe(false)
  })
})

describe('computePivotResult', () => {
  const sampleData = [
    { region: 'North', product: 'A', sales: 100 },
    { region: 'North', product: 'B', sales: 200 },
    { region: 'South', product: 'A', sales: 150 },
    { region: 'South', product: 'B', sales: 250 },
  ]

  it('should compute basic pivot', () => {
    const config = {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: false,
    }
    const result = computePivotResult(sampleData, config)

    expect(result).not.toBe(null)
    expect(result!.rowHeaders).toHaveLength(2)
    expect(result!.data).toHaveLength(2)
  })

  it('should compute pivot with row and column fields', () => {
    const config = {
      rowFields: ['region'],
      columnFields: ['product'],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: false,
    }
    const result = computePivotResult(sampleData, config)

    expect(result).not.toBe(null)
    expect(result!.headers.length).toBeGreaterThan(0)
  })

  it('should return null for unconfigured pivot', () => {
    const config = {
      rowFields: [],
      columnFields: [],
      valueFields: [],
      showRowTotals: false,
      showColumnTotals: false,
    }
    expect(computePivotResult(sampleData, config)).toBe(null)
  })

  it('should return null for empty data', () => {
    const config = {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: false,
    }
    expect(computePivotResult([], config)).toBe(null)
  })

  it('should compute row totals when enabled', () => {
    const config = {
      rowFields: ['region'],
      columnFields: ['product'],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: true,
      showColumnTotals: false,
    }
    const result = computePivotResult(sampleData, config)

    expect(result).not.toBe(null)
    expect(result!.rowTotals.length).toBeGreaterThan(0)
  })

  it('should compute column totals when enabled', () => {
    const config = {
      rowFields: ['region'],
      columnFields: ['product'],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: true,
    }
    const result = computePivotResult(sampleData, config)

    expect(result).not.toBe(null)
    expect(result!.columnTotals.length).toBeGreaterThan(0)
  })
})
