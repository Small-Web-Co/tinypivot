import type { PivotExportData } from '../../packages/core/src/export'
/**
 * Unit tests for XLSX export functions
 * Uses buildGridWorkbook / buildPivotWorkbook directly to avoid triggering downloads.
 */
import { describe, expect, it } from 'vitest'
import { buildGridWorkbook, buildPivotWorkbook } from '../../packages/core/src/export/xlsx'
import { canUseXlsxExport, getFreeLicenseInfo } from '../../packages/core/src/license'

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleData = [
  { name: 'Alice', age: 30, city: 'New York' },
  { name: 'Bob', age: 25, city: 'London' },
  { name: 'Charlie', age: 35, city: 'Paris' },
]
const sampleColumns = ['name', 'age', 'city']

const samplePivotData: PivotExportData = {
  headers: [
    ['East', 'East', 'West', 'West'],
    ['Q1', 'Q2', 'Q1', 'Q2'],
  ],
  rowHeaders: [['Widgets'], ['Gadgets']],
  data: [
    [{ formattedValue: '100' }, { formattedValue: '200' }, { formattedValue: '150' }, { formattedValue: '250' }],
    [{ formattedValue: '110' }, { formattedValue: '210' }, { formattedValue: '160' }, { formattedValue: '260' }],
  ],
  rowTotals: [{ formattedValue: '700' }, { formattedValue: '740' }],
  columnTotals: [
    { formattedValue: '210' },
    { formattedValue: '410' },
    { formattedValue: '310' },
    { formattedValue: '510' },
  ],
  grandTotal: { formattedValue: '1440' },
  showRowTotals: true,
  showColumnTotals: true,
}

// ---------------------------------------------------------------------------
// Grid workbook tests
// ---------------------------------------------------------------------------

describe('buildGridWorkbook', () => {
  it('header row contains correct column names', async () => {
    const workbook = await buildGridWorkbook(sampleData, sampleColumns)
    const worksheet = workbook.worksheets[0]
    const headerRow = worksheet.getRow(1)

    const headers: string[] = []
    headerRow.eachCell((cell) => {
      headers.push(String(cell.value))
    })

    expect(headers).toEqual(sampleColumns)
  })

  it('workbook has correct row count (header + N data rows)', async () => {
    const workbook = await buildGridWorkbook(sampleData, sampleColumns)
    const worksheet = workbook.worksheets[0]

    // rowCount includes all used rows
    expect(worksheet.rowCount).toBe(sampleData.length + 1)
  })

  it('row 2 matches the first data record', async () => {
    const workbook = await buildGridWorkbook(sampleData, sampleColumns)
    const worksheet = workbook.worksheets[0]
    const dataRow = worksheet.getRow(2)

    const values: unknown[] = []
    dataRow.eachCell((cell) => {
      values.push(cell.value)
    })

    const firstRecord = sampleData[0]
    expect(values[0]).toBe(firstRecord.name)
    expect(values[1]).toBe(firstRecord.age)
    expect(values[2]).toBe(firstRecord.city)
  })

  it('header row cells are bold', async () => {
    const workbook = await buildGridWorkbook(sampleData, sampleColumns)
    const worksheet = workbook.worksheets[0]
    const headerRow = worksheet.getRow(1)

    headerRow.eachCell((cell) => {
      expect(cell.font?.bold).toBe(true)
    })
  })

  it('uses custom sheetName option', async () => {
    const workbook = await buildGridWorkbook(sampleData, sampleColumns, { sheetName: 'MySheet' })
    expect(workbook.worksheets[0].name).toBe('MySheet')
  })

  it('handles empty data without throwing', async () => {
    const workbook = await buildGridWorkbook([], sampleColumns)
    const worksheet = workbook.worksheets[0]
    expect(worksheet.rowCount).toBe(1) // header only
  })
})

// ---------------------------------------------------------------------------
// Pivot workbook tests
// ---------------------------------------------------------------------------

describe('buildPivotWorkbook', () => {
  it('has at least one merged cell range for spanning header groups', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // ExcelJS exposes merges as a flat map; check it is non-empty
    const merges = (worksheet as any)._merges as Record<string, unknown>
    expect(Object.keys(merges).length).toBeGreaterThan(0)
  })

  it('a known data cell value exists in the sheet', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // Data starts at row 3 (2 header levels), col 2 (1 rowHeader col)
    const dataRow = worksheet.getRow(3)
    const cellValues: string[] = []
    dataRow.eachCell((cell) => {
      cellValues.push(String(cell.value ?? ''))
    })
    expect(cellValues).toContain('100')
  })

  it('column totals row (last row) has bold cells', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]
    const lastRow = worksheet.getRow(worksheet.rowCount)

    lastRow.eachCell((cell) => {
      if (cell.value !== null && cell.value !== '') {
        expect(cell.font?.bold).toBe(true)
      }
    })
  })

  it('worksheet has correct number of data rows', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]
    // 2 header rows + 2 data rows + 1 totals row = 5
    expect(worksheet.rowCount).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// License tests
// ---------------------------------------------------------------------------

describe('canUseXlsxExport', () => {
  it('returns false for free license', () => {
    const freeInfo = getFreeLicenseInfo()
    expect(canUseXlsxExport(freeInfo)).toBe(false)
  })

  it('returns true for demo license', () => {
    // getDemoLicenseInfo requires the correct demo secret hash, which is not
    // available in unit tests. Test the license shape directly instead.
    const demoLicenseDirectly = {
      type: 'free' as const,
      isValid: true,
      features: {
        pivot: true,
        advancedAggregations: true,
        percentageMode: true,
        sessionPersistence: true,
        noWatermark: false,
        charts: true,
        aiAnalyst: true,
        drillThrough: true,
        xlsxExport: true,
      },
    }
    expect(canUseXlsxExport(demoLicenseDirectly)).toBe(true)
  })

  it('returns false for license with xlsxExport: false', () => {
    const customInfo = {
      type: 'free' as const,
      isValid: true,
      features: {
        pivot: true,
        advancedAggregations: false,
        percentageMode: false,
        sessionPersistence: false,
        noWatermark: false,
        charts: false,
        aiAnalyst: false,
        drillThrough: false,
        xlsxExport: false,
      },
    }
    expect(canUseXlsxExport(customInfo)).toBe(false)
  })
})
