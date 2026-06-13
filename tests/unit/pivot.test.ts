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
  parsePathKey,
  pathKey,
  validateFormula,
  validateSimpleFormula,
} from '../../packages/core/src/pivot'
import { getDrillThroughRows } from '../../packages/core/src/pivot/drillthrough'

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

// ============================================================
// Task 1: pathKey / parsePathKey helpers
// ============================================================

describe('pathKey', () => {
  it('round-trips simple values', () => {
    const values = ['West', 'Widgets']
    expect(parsePathKey(pathKey(values))).toEqual(values)
  })

  it('round-trips a single value', () => {
    expect(parsePathKey(pathKey(['North']))).toEqual(['North'])
  })

  it('round-trips an empty array', () => {
    expect(parsePathKey(pathKey([]))).toEqual([])
  })

  it('round-trips values that contain pipe characters', () => {
    const values = ['West|East', 'Wid|||gets']
    expect(parsePathKey(pathKey(values))).toEqual(values)
  })

  it('round-trips values that contain empty strings', () => {
    const values = ['', 'Widgets', '']
    expect(parsePathKey(pathKey(values))).toEqual(values)
  })

  it('round-trips values that contain spaces and space-adjacent characters', () => {
    const values = ['New York', ' leading', 'trailing ']
    expect(parsePathKey(pathKey(values))).toEqual(values)
  })

  it('two different paths produce different keys', () => {
    expect(pathKey(['West', 'Widgets'])).not.toBe(pathKey(['West']))
    expect(pathKey(['A', 'B'])).not.toBe(pathKey(['AB']))
  })
})

// ============================================================
// Task 1: PivotRowMeta and collapse-aware computePivotResult
// ============================================================

/**
 * ~20 hand-written rows, 2 rowFields (region / product), 1 columnField (quarter), 1 value (sales).
 * Designed so math can be verified by hand.
 *
 * West/Widgets: Q1=100, Q2=200, Q3=300, Q4=400  → row sum=1000
 * West/Gadgets: Q1=50,  Q2=150, Q3=250, Q4=350  → row sum=800
 * West total:   Q1=150, Q2=350, Q3=550, Q4=750  → total=1800
 *
 * East/Widgets: Q1=80,  Q2=160, Q3=240, Q4=320  → row sum=800
 * East/Gadgets: Q1=40,  Q2=120, Q3=200, Q4=280  → row sum=640
 * East total:   Q1=120, Q2=280, Q3=440, Q4=600  → total=1440
 *
 * Grand total:  Q1=270, Q2=630, Q3=990, Q4=1350 → 3240
 */
const drillData: Record<string, unknown>[] = [
  // West / Widgets
  { region: 'West', product: 'Widgets', quarter: 'Q1', sales: 100 },
  { region: 'West', product: 'Widgets', quarter: 'Q2', sales: 200 },
  { region: 'West', product: 'Widgets', quarter: 'Q3', sales: 300 },
  { region: 'West', product: 'Widgets', quarter: 'Q4', sales: 400 },
  // West / Gadgets
  { region: 'West', product: 'Gadgets', quarter: 'Q1', sales: 50 },
  { region: 'West', product: 'Gadgets', quarter: 'Q2', sales: 150 },
  { region: 'West', product: 'Gadgets', quarter: 'Q3', sales: 250 },
  { region: 'West', product: 'Gadgets', quarter: 'Q4', sales: 350 },
  // East / Widgets
  { region: 'East', product: 'Widgets', quarter: 'Q1', sales: 80 },
  { region: 'East', product: 'Widgets', quarter: 'Q2', sales: 160 },
  { region: 'East', product: 'Widgets', quarter: 'Q3', sales: 240 },
  { region: 'East', product: 'Widgets', quarter: 'Q4', sales: 320 },
  // East / Gadgets
  { region: 'East', product: 'Gadgets', quarter: 'Q1', sales: 40 },
  { region: 'East', product: 'Gadgets', quarter: 'Q2', sales: 120 },
  { region: 'East', product: 'Gadgets', quarter: 'Q3', sales: 200 },
  { region: 'East', product: 'Gadgets', quarter: 'Q4', sales: 280 },
]

const drillConfig = {
  rowFields: ['region', 'product'],
  columnFields: ['quarter'],
  valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
  showRowTotals: false,
  showColumnTotals: false,
}

describe('computePivotResult – default multi-level output matches master (regression guard)', () => {
  /**
   * HARDCODED expected structure derived from master's leaf-only output.
   * master: rowKeys = unique makeKey(row, ['region','product']) sorted alphabetically.
   * For drillData (East/Gadgets, East/Widgets, West/Gadgets, West/Widgets) sorted:
   *   row 0: ['East', 'Gadgets']
   *   row 1: ['East', 'Widgets']
   *   row 2: ['West', 'Gadgets']
   *   row 3: ['West', 'Widgets']
   * Columns Q1..Q4 (sorted). Cell [row][col] = sales for that combination.
   *   East/Gadgets: Q1=40, Q2=120, Q3=200, Q4=280
   *   East/Widgets: Q1=80, Q2=160, Q3=240, Q4=320
   *   West/Gadgets: Q1=50, Q2=150, Q3=250, Q4=350
   *   West/Widgets: Q1=100, Q2=200, Q3=300, Q4=400
   */
  it('produces exactly 4 leaf rows (no injected group rows) — identical to master', () => {
    const result = computePivotResult(drillData, drillConfig)!
    expect(result.rowHeaders).toHaveLength(4)
    expect(result.rowHeaders[0]).toEqual(['East', 'Gadgets'])
    expect(result.rowHeaders[1]).toEqual(['East', 'Widgets'])
    expect(result.rowHeaders[2]).toEqual(['West', 'Gadgets'])
    expect(result.rowHeaders[3]).toEqual(['West', 'Widgets'])
  })

  it('cell values match master: East/Gadgets Q1=40, West/Widgets Q4=400', () => {
    const result = computePivotResult(drillData, drillConfig)!
    // Columns: Q1(idx 0), Q2(idx 1), Q3(idx 2), Q4(idx 3)
    expect(result.data[0][0].value).toBe(40) // East/Gadgets Q1
    expect(result.data[1][0].value).toBe(80) // East/Widgets Q1
    expect(result.data[2][0].value).toBe(50) // West/Gadgets Q1
    expect(result.data[3][0].value).toBe(100) // West/Widgets Q1
    expect(result.data[3][3].value).toBe(400) // West/Widgets Q4
  })

  it('two-arg and three-arg calls produce identical output (no-op options)', () => {
    const twoArgResult = computePivotResult(drillData, drillConfig)
    const threeArgResult = computePivotResult(drillData, drillConfig, {})
    expect(twoArgResult!.data).toEqual(threeArgResult!.data)
    expect(twoArgResult!.rowHeaders).toEqual(threeArgResult!.rowHeaders)
  })
})

describe('computePivotResult – rowMeta (no collapsedPaths)', () => {
  it('produces rowMeta parallel to rowHeaders', () => {
    const result = computePivotResult(drillData, drillConfig)
    expect(result).not.toBeNull()
    expect(result!.rowMeta).toHaveLength(result!.rowHeaders.length)
  })

  it('each rowMeta entry has required fields with correct types', () => {
    const result = computePivotResult(drillData, drillConfig)!
    for (const meta of result.rowMeta) {
      expect(Array.isArray(meta.path)).toBe(true)
      expect(typeof meta.key).toBe('string')
      expect(typeof meta.isSubtotal).toBe('boolean')
      expect(Array.isArray(meta.groupStarts)).toBe(true)
    }
  })

  it('no row is a subtotal when no collapsedPaths given', () => {
    const result = computePivotResult(drillData, drillConfig)!
    expect(result.rowMeta.every(m => !m.isSubtotal)).toBe(true)
  })

  it('east/Gadgets groupStarts includes depth-0 East group; East/Widgets groupStarts is empty', () => {
    const result = computePivotResult(drillData, drillConfig)!
    const egMeta = result.rowMeta[0] // East/Gadgets (first sorted row)
    const ewMeta = result.rowMeta[1] // East/Widgets
    expect(egMeta.groupStarts).toHaveLength(1)
    expect(egMeta.groupStarts[0]).toEqual({ depth: 0, path: ['East'], key: pathKey(['East']), isCollapsed: false })
    expect(ewMeta.groupStarts).toHaveLength(0)
  })

  it('west/Gadgets groupStarts includes depth-0 West group; West/Widgets groupStarts is empty', () => {
    const result = computePivotResult(drillData, drillConfig)!
    const wgMeta = result.rowMeta[2] // West/Gadgets
    const wwMeta = result.rowMeta[3] // West/Widgets
    expect(wgMeta.groupStarts).toHaveLength(1)
    expect(wgMeta.groupStarts[0]).toEqual({ depth: 0, path: ['West'], key: pathKey(['West']), isCollapsed: false })
    expect(wwMeta.groupStarts).toHaveLength(0)
  })

  it('single rowField → all rows have empty groupStarts (no collapsible groups)', () => {
    const config = {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: false,
    }
    const result = computePivotResult(drillData, config)!
    expect(result.rowMeta.every(m => m.groupStarts.length === 0)).toBe(true)
  })

  it('rowMeta path mirrors the rowHeaders values', () => {
    const result = computePivotResult(drillData, drillConfig)!
    for (let i = 0; i < result.rowHeaders.length; i++) {
      expect(result.rowMeta[i].path).toEqual(result.rowHeaders[i])
    }
  })

  it('rowMeta key equals pathKey(path)', () => {
    const result = computePivotResult(drillData, drillConfig)!
    for (const meta of result.rowMeta) {
      expect(meta.key).toBe(pathKey(meta.path))
    }
  })
})

describe('computePivotResult – collapse with sum aggregation', () => {
  const collapsedWest = new Set([pathKey(['West'])])

  it('collapses West: individual West leaf rows are omitted from output', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    const paths = result.rowMeta.map(m => m.path)
    // West/Widgets and West/Gadgets leaf rows should not appear as non-subtotal rows
    const westLeaves = paths.filter(p => p[0] === 'West' && p[1] !== '' && p[1] !== undefined)
    expect(westLeaves).toHaveLength(0)
  })

  it('collapses West: a subtotal row for West is present', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    const westSubtotal = result.rowMeta.find(m => m.path[0] === 'West' && m.isSubtotal)
    expect(westSubtotal).toBeDefined()
    expect(westSubtotal!.groupStarts[0].isCollapsed).toBe(true)
  })

  it('collapses West: row count is 3 (West-subtotal + East/Gadgets + East/Widgets)', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    expect(result.rowHeaders).toHaveLength(3)
  })

  it('collapses West: West Q1 cell equals sum of West/Widgets Q1 + West/Gadgets Q1 = 150', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    // Columns are Q1, Q2, Q3, Q4 (sorted)
    const q1Cell = result.data[westRowIdx][0]
    expect(q1Cell.value).toBe(150) // 100 + 50
  })

  it('collapses West: West Q3 cell equals 300 + 250 = 550', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    // Q1=idx0, Q2=idx1, Q3=idx2
    const q3Cell = result.data[westRowIdx][2]
    expect(q3Cell.value).toBe(550) // 300 + 250
  })

  it('east rows are unaffected when only West is collapsed (2 leaf rows, no injected group row)', () => {
    const result = computePivotResult(drillData, drillConfig, { collapsedPaths: collapsedWest })!
    const eastPaths = result.rowMeta.filter(m => m.path[0] === 'East')
    expect(eastPaths).toHaveLength(2)
    expect(eastPaths.every(m => !m.isSubtotal)).toBe(true)
  })
})

describe('computePivotResult – collapse with avg (NOT derivable from child cells)', () => {
  /**
   * West/Widgets sales: 100, 200, 300, 400  avg = 250
   * West/Gadgets sales: 50, 150, 250, 350   avg = 200
   * West combined sales: 100,200,300,400,50,150,250,350  avg = 225
   *
   * Note: avg(250, 200) = 225 here only by coincidence (equal counts).
   * The test verifies we aggregate over all source rows, not from child cells.
   *
   * For Q1 specifically:
   * West/Widgets Q1 = 100 (avg over 1 value = 100)
   * West/Gadgets Q1 = 50  (avg over 1 value = 50)
   * West Q1 combined = avg(100, 50) = 75
   */
  const avgConfig = {
    rowFields: ['region', 'product'],
    columnFields: ['quarter'],
    valueFields: [{ field: 'sales', aggregation: 'avg' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }
  const collapsedWest = new Set([pathKey(['West'])])

  it('west Q1 collapsed avg = 75 (average of all West Q1 source values, not avg of child avgs)', () => {
    const result = computePivotResult(drillData, avgConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    const q1Cell = result.data[westRowIdx][0]
    expect(q1Cell.value).toBe(75) // avg(100, 50) = 75
  })
})

describe('computePivotResult – collapse with median (NOT derivable from child cells)', () => {
  /**
   * Use a no-columnField config to simplify.
   * West sales (all quarters): Widgets=[100,200,300,400], Gadgets=[50,150,250,350]
   * Combined: [100,200,300,400,50,150,250,350] sorted = [50,100,150,200,250,300,350,400]
   * Median of 8 values = (200+250)/2 = 225
   *
   * Child medians: Widgets=250, Gadgets=200 → avg would be 225 here but only coincidentally;
   * the real test is that we compute over ALL source rows.
   */
  const medianConfig = {
    rowFields: ['region', 'product'],
    columnFields: [],
    valueFields: [{ field: 'sales', aggregation: 'median' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }
  const collapsedWest = new Set([pathKey(['West'])])

  it('west collapsed median = 225 (median over all 8 West source rows)', () => {
    const result = computePivotResult(drillData, medianConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    const cell = result.data[westRowIdx][0]
    expect(cell.value).toBe(225) // median([50,100,150,200,250,300,350,400])
  })
})

describe('computePivotResult – collapse with countDistinct (NOT derivable from child cells)', () => {
  /**
   * Use a special dataset where West/Widgets and West/Gadgets share distinct values.
   * West/Widgets sales: [1, 2, 3]   countDistinct = 3
   * West/Gadgets sales: [2, 3, 4]   countDistinct = 3
   * West combined: [1,2,3,2,3,4]   countDistinct = 4  (NOT 3+3=6, not avg 3)
   */
  const cdData: Record<string, unknown>[] = [
    { region: 'West', product: 'Widgets', sales: 1 },
    { region: 'West', product: 'Widgets', sales: 2 },
    { region: 'West', product: 'Widgets', sales: 3 },
    { region: 'West', product: 'Gadgets', sales: 2 },
    { region: 'West', product: 'Gadgets', sales: 3 },
    { region: 'West', product: 'Gadgets', sales: 4 },
    { region: 'East', product: 'Widgets', sales: 5 },
  ]
  const cdConfig = {
    rowFields: ['region', 'product'],
    columnFields: [],
    valueFields: [{ field: 'sales', aggregation: 'countDistinct' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }
  const collapsedWest = new Set([pathKey(['West'])])

  it('west collapsed countDistinct = 4 (distinct values across ALL West rows)', () => {
    const result = computePivotResult(cdData, cdConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    const cell = result.data[westRowIdx][0]
    expect(cell.value).toBe(4) // {1,2,3,4}
  })
})

describe('computePivotResult – nested collapse no-op', () => {
  /**
   * If West is already collapsed, collapsing West/Widgets is a no-op —
   * the output should be identical to collapsing West alone.
   */
  it('collapsing a child path under an already-collapsed parent has no additional effect', () => {
    const parentOnly = new Set([pathKey(['West'])])
    const parentAndChild = new Set([pathKey(['West']), pathKey(['West', 'Widgets'])])

    const resultParent = computePivotResult(drillData, drillConfig, { collapsedPaths: parentOnly })!
    const resultBoth = computePivotResult(drillData, drillConfig, { collapsedPaths: parentAndChild })!

    expect(resultParent.rowHeaders).toEqual(resultBoth.rowHeaders)
    expect(resultParent.data).toEqual(resultBoth.data)
  })
})

describe('computePivotResult – collapse with stdDev (NOT derivable from child cells)', () => {
  /**
   * stdDev requires the full population, not component stdDevs.
   * West/Widgets: [10, 20]  mean=15, stdDev=5
   * West/Gadgets: [10, 20]  mean=15, stdDev=5
   * West combined: [10, 20, 10, 20]
   *   mean = (10+20+10+20)/4 = 15
   *   squared diffs: [25, 25, 25, 25] → avg=25 → stdDev=5
   *
   * Now use asymmetric values so avg-of-child-stdDevs would differ:
   * West/Widgets: [0, 10]   mean=5, stdDev=5
   * West/Gadgets: [100, 110] mean=105, stdDev=5
   * West combined: [0, 10, 100, 110]
   *   mean = 55
   *   squared diffs: [3025, 2025, 2025, 3025] → avg=2525 → stdDev=√2525≈50.25
   *   Child stdDevs are both 5 → avg(5,5)=5, sum=10, neither equals 50.25
   */
  const stdDevData: Record<string, unknown>[] = [
    { region: 'West', product: 'Widgets', sales: 0 },
    { region: 'West', product: 'Widgets', sales: 10 },
    { region: 'West', product: 'Gadgets', sales: 100 },
    { region: 'West', product: 'Gadgets', sales: 110 },
    { region: 'East', product: 'Widgets', sales: 1 },
  ]
  const stdDevConfig = {
    rowFields: ['region', 'product'],
    columnFields: [],
    valueFields: [{ field: 'sales', aggregation: 'stdDev' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }
  const collapsedWest = new Set([pathKey(['West'])])

  it('west collapsed stdDev = √2525 (stdDev over all 4 West source rows, not avg of child stdDevs)', () => {
    const result = computePivotResult(stdDevData, stdDevConfig, { collapsedPaths: collapsedWest })!
    const westRowIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    const cell = result.data[westRowIdx][0]
    const expected = Math.sqrt(2525) // ≈ 50.249
    expect(cell.value).toBeCloseTo(expected, 5)
    // Verify it is NOT 5 (avg of children) or 10 (sum of children)
    expect(cell.value).not.toBeCloseTo(5, 1)
  })
})

describe('computePivotResult – column totals with collapse', () => {
  /**
   * Verify column totals are correct when a group is collapsed.
   * With West collapsed: colTotals should include West (via its collapsed group row)
   * + East leaf rows. So total should equal the grand total across all rows.
   *
   * No-column-field config for simplicity. All sales in one cell per row.
   * West (collapsed): sales = 150+350+800 = 1800 (sum over all West source rows per drillData)
   * East/Gadgets: 640, East/Widgets: 800
   * Column total (no colField, just one cell): 1800 + 640 + 800 = 3240
   */
  it('column total with collapsed West equals sum of West-subtotal + East leaf rows', () => {
    const noColConfig = {
      rowFields: ['region', 'product'],
      columnFields: [],
      valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
      showRowTotals: false,
      showColumnTotals: true,
    }
    const collapsedWest = new Set([pathKey(['West'])])
    const result = computePivotResult(drillData, noColConfig, { collapsedPaths: collapsedWest })!
    // columnTotals has 1 cell (single value field, no colFields)
    expect(result.columnTotals).toHaveLength(1)
    // West subtotal=1800, East/Gadgets=640, East/Widgets=800 → 3240
    expect(result.columnTotals[0].value).toBe(3240)
  })
})

describe('computePivotResult – 3-level row hierarchy', () => {
  /**
   * Three rowFields: region / product / quarter
   * Tabular form: only leaf rows in default output.
   * groupStarts carries depth info so the UI can place chevrons.
   * Collapse behavior:
   * - Collapse root (region) → one subtotal row padded to ['West','','']
   * - Collapse mid-level (region/product) → subtotal row padded to ['West','Widgets','']
   */
  const deepData: Record<string, unknown>[] = [
    { region: 'West', product: 'Widgets', quarter: 'Q1', sales: 10 },
    { region: 'West', product: 'Widgets', quarter: 'Q2', sales: 20 },
    { region: 'West', product: 'Gadgets', quarter: 'Q1', sales: 30 },
    { region: 'East', product: 'Widgets', quarter: 'Q1', sales: 5 },
  ]
  const deepConfig = {
    rowFields: ['region', 'product', 'quarter'],
    columnFields: [],
    valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }

  it('expanded: only leaf rows — groupStarts describes depth-0 and depth-1 boundaries', () => {
    const result = computePivotResult(deepData, deepConfig)!
    // All rows are leaf rows (no injected group rows)
    expect(result.rowMeta.every(m => !m.isSubtotal)).toBe(true)
    // First leaf (East/Widgets/Q1) starts depth-0 East and depth-1 East/Widgets groups
    const eastRow = result.rowMeta.find(m => m.path[0] === 'East')!
    expect(eastRow.groupStarts.map(g => g.depth)).toEqual([0, 1])
    // First West leaf starts depth-0 West group
    const firstWestRow = result.rowMeta.find(m => m.path[0] === 'West')!
    expect(firstWestRow.groupStarts.some(g => g.depth === 0 && g.path[0] === 'West')).toBe(true)
  })

  it('collapsing root region: one subtotal row remains for West, padded to full depth', () => {
    const collapsed = new Set([pathKey(['West'])])
    const result = computePivotResult(deepData, deepConfig, { collapsedPaths: collapsed })!
    const westRows = result.rowMeta.filter(m => m.path[0] === 'West')
    expect(westRows).toHaveLength(1)
    // Subtotal path is padded with empty strings to rowFields.length
    expect(westRows[0].path).toEqual(['West', '', ''])
    expect(westRows[0].isSubtotal).toBe(true)
    expect(westRows[0].groupStarts[0].isCollapsed).toBe(true)
  })

  it('collapsing root region: West subtotal row sales = sum of all West source rows', () => {
    const collapsed = new Set([pathKey(['West'])])
    const result = computePivotResult(deepData, deepConfig, { collapsedPaths: collapsed })!
    const westIdx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.isSubtotal)
    expect(result.data[westIdx][0].value).toBe(60) // 10+20+30
  })

  it('collapsing mid-level (West/Widgets): subtotal row padded, leaf rows for West/Gadgets and East remain', () => {
    const collapsed = new Set([pathKey(['West', 'Widgets'])])
    const result = computePivotResult(deepData, deepConfig, { collapsedPaths: collapsed })!
    // West/Widgets subtotal — path padded to 3 fields
    const westWidgetsSubtotal = result.rowMeta.filter(m => m.path[0] === 'West' && m.path[1] === 'Widgets' && m.isSubtotal)
    expect(westWidgetsSubtotal).toHaveLength(1)
    expect(westWidgetsSubtotal[0].path).toEqual(['West', 'Widgets', ''])
    // West/Widgets leaf rows (non-padded) should not appear
    const westWidgetsLeaves = result.rowMeta.filter(m => m.path[0] === 'West' && m.path[1] === 'Widgets' && !m.isSubtotal)
    expect(westWidgetsLeaves).toHaveLength(0)
  })

  it('collapsing mid-level (West/Widgets): subtotal value = 10 + 20 = 30', () => {
    const collapsed = new Set([pathKey(['West', 'Widgets'])])
    const result = computePivotResult(deepData, deepConfig, { collapsedPaths: collapsed })!
    const idx = result.rowMeta.findIndex(m => m.path[0] === 'West' && m.path[1] === 'Widgets' && m.isSubtotal)
    expect(result.data[idx][0].value).toBe(30) // 10+20
  })
})

// ============================================================
// Task 2: getDrillThroughRows
// ============================================================

/**
 * Re-use the drillData fixture from Task 1 (already defined above):
 *
 * West/Widgets: Q1=100, Q2=200, Q3=300, Q4=400
 * West/Gadgets: Q1=50,  Q2=150, Q3=250, Q4=350
 * East/Widgets: Q1=80,  Q2=160, Q3=240, Q4=320
 * East/Gadgets: Q1=40,  Q2=120, Q3=200, Q4=280
 */
const drillThroughConfig = {
  rowFields: ['region', 'product'],
  columnFields: ['quarter'],
  valueFields: [{ field: 'sales', aggregation: 'sum' as const }],
  showRowTotals: false,
  showColumnTotals: false,
}

describe('getDrillThroughRows – full path slice (West / Widgets × Q3)', () => {
  it('returns exactly the matching source row', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West', 'Widgets'],
      ['Q3'],
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({ region: 'West', product: 'Widgets', quarter: 'Q3', sales: 300 })
  })

  it('descriptor has correct rowPath, columnPath, valueField, aggregation', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West', 'Widgets'],
      ['Q3'],
    )
    expect(result.descriptor.rowPath).toEqual(['West', 'Widgets'])
    expect(result.descriptor.columnPath).toEqual(['Q3'])
    expect(result.descriptor.valueField).toBe('sales')
    expect(result.descriptor.aggregation).toBe('sum')
  })

  it('descriptor.rowCount equals rows.length', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West', 'Widgets'],
      ['Q3'],
    )
    expect(result.descriptor.rowCount).toBe(result.rows.length)
    expect(result.descriptor.rowCount).toBe(1)
  })

  it('descriptor.formattedValue is the formatted aggregation result — sum=300 → "300"', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West', 'Widgets'],
      ['Q3'],
    )
    // sum of [300] = 300, formatAggregatedValue(300, 'sum') = '300'
    expect(result.descriptor.formattedValue).toBe('300')
  })
})

describe('getDrillThroughRows – partial row path + full column path (West subtotal × Q1)', () => {
  it('returns all West×Q1 rows when only rowPath prefix ["West"] is given', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West'],
      ['Q1'],
    )
    // West/Widgets Q1=100, West/Gadgets Q1=50 → 2 rows
    expect(result.rows).toHaveLength(2)
    const sales = result.rows.map(r => r.sales as number).sort((a, b) => a - b)
    expect(sales).toEqual([50, 100])
  })

  it('descriptor.formattedValue for partial row path = sum(100, 50) = 150 → "150"', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['West'],
      ['Q1'],
    )
    expect(result.descriptor.formattedValue).toBe('150')
  })
})

describe('getDrillThroughRows – both paths empty (grand total)', () => {
  it('returns all 16 source rows when rowPath and columnPath are both empty', () => {
    const result = getDrillThroughRows(drillData, drillThroughConfig, [], [])
    expect(result.rows).toHaveLength(16)
  })

  it('grand total formattedValue = sum of all sales = 3240', () => {
    const result = getDrillThroughRows(drillData, drillThroughConfig, [], [])
    expect(result.descriptor.formattedValue).toBe('3,240')
  })
})

describe('getDrillThroughRows – zero-match slice', () => {
  it('returns empty rows array when no source rows match', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['South'], // No South region in drillData
      ['Q1'],
    )
    expect(result.rows).toHaveLength(0)
    expect(result.descriptor.rowCount).toBe(0)
  })

  it('zero-match formattedValue is "-" (null aggregation)', () => {
    const result = getDrillThroughRows(
      drillData,
      drillThroughConfig,
      ['South'],
      ['Q1'],
    )
    expect(result.descriptor.formattedValue).toBe('-')
  })
})

describe('getDrillThroughRows – formattedValue correctness for median', () => {
  /**
   * Use no-columnField config. West sales (all quarters, both products):
   * [100, 200, 300, 400, 50, 150, 250, 350] sorted = [50,100,150,200,250,300,350,400]
   * Median of 8 = (200+250)/2 = 225
   */
  const medianConfig = {
    rowFields: ['region', 'product'],
    columnFields: [],
    valueFields: [{ field: 'sales', aggregation: 'median' as const }],
    showRowTotals: false,
    showColumnTotals: false,
  }

  it('median formattedValue for West partial path = "225"', () => {
    const result = getDrillThroughRows(drillData, medianConfig, ['West'], [])
    // 8 rows: sorted [50,100,150,200,250,300,350,400], median = (200+250)/2 = 225
    expect(result.descriptor.formattedValue).toBe('225')
  })
})

describe('getDrillThroughRows – multi-valueField config picks the correct field', () => {
  /**
   * Config with two value fields: sales (sum) and sales again (count).
   * The caller specifies which valueField/aggregation represents the clicked cell.
   */
  const multiVFConfig = {
    rowFields: ['region'],
    columnFields: ['quarter'],
    valueFields: [
      { field: 'sales', aggregation: 'sum' as const },
      { field: 'sales', aggregation: 'count' as const },
    ],
    showRowTotals: false,
    showColumnTotals: false,
  }

  it('when valueFieldIndex=0 (sum), formattedValue uses sum aggregation', () => {
    // West × Q1: West/Widgets Q1=100, West/Gadgets Q1=50 → sum=150
    const result = getDrillThroughRows(drillData, multiVFConfig, ['West'], ['Q1'], 0)
    expect(result.descriptor.aggregation).toBe('sum')
    expect(result.descriptor.formattedValue).toBe('150')
  })

  it('when valueFieldIndex=1 (count), formattedValue uses count aggregation', () => {
    // West × Q1: 2 matching rows → count=2
    const result = getDrillThroughRows(drillData, multiVFConfig, ['West'], ['Q1'], 1)
    expect(result.descriptor.aggregation).toBe('count')
    expect(result.descriptor.formattedValue).toBe('2')
  })
})

describe('getDrillThroughRows – null value in row field (blank handling)', () => {
  /**
   * makeKey uses String(row[f] ?? '(blank)') — so null/undefined field values
   * become '(blank)' in the pivot key. The drill-through must match this behavior.
   */
  const nullData: Record<string, unknown>[] = [
    { region: null, product: 'Widgets', quarter: 'Q1', sales: 99 },
    { region: 'West', product: 'Widgets', quarter: 'Q1', sales: 100 },
  ]

  it('matches rows where the field value is null using the "(blank)" stringification', () => {
    const result = getDrillThroughRows(nullData, drillThroughConfig, ['(blank)', 'Widgets'], ['Q1'])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sales).toBe(99)
  })
})
