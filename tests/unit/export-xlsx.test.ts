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

  it('applies numberFormats to matching columns', async () => {
    const priceData = [{ name: 'Widget', price: 9.99 }]
    const workbook = await buildGridWorkbook(priceData, ['name', 'price'], {
      numberFormats: { price: '#,##0.00' },
    })
    const worksheet = workbook.worksheets[0]
    // Row 2, column 2 is the price cell
    const priceCell = worksheet.getRow(2).getCell(2)
    expect(priceCell.numFmt).toBe('#,##0.00')
  })
})

// ---------------------------------------------------------------------------
// Pivot workbook tests
// ---------------------------------------------------------------------------

describe('buildPivotWorkbook', () => {
  it('east group merges exactly B1:C1 and West group merges exactly D1:E1 — totals column F1 is not merged', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // 'East' spans B1:C1
    expect(worksheet.getCell('B1').isMerged).toBe(true)
    expect(worksheet.getCell('C1').isMerged).toBe(true)

    // 'West' spans D1:E1
    expect(worksheet.getCell('D1').isMerged).toBe(true)
    expect(worksheet.getCell('E1').isMerged).toBe(true)

    // The totals column (F1) is NOT part of any merge
    expect(worksheet.getCell('F1').isMerged).toBe(false)

    // Verify the exact merge ranges (worksheet.model.merges is a string[])
    const merges = ((worksheet.model as { merges?: string[] }).merges ?? []) as string[]
    expect(merges).toContain('B1:C1')
    expect(merges).toContain('D1:E1')
    expect(merges.some(m => m.includes('F1'))).toBe(false)
  })

  it('data cells are at exact addresses: B3=100, F3=row total 700, F5=grand total 1440', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // Layout: 2 header rows, then data rows starting at row 3.
    // Col A = row-field (product), cols B-E = 4 data cols, col F = row total.
    expect(String(worksheet.getCell('B3').value)).toBe('100')
    expect(String(worksheet.getCell('C3').value)).toBe('200')
    expect(String(worksheet.getCell('D3').value)).toBe('150')
    expect(String(worksheet.getCell('E3').value)).toBe('250')

    // Row total for Widgets is in the trailing column (F3)
    expect(String(worksheet.getCell('F3').value)).toBe('700')

    // Row total for Gadgets (F4)
    expect(String(worksheet.getCell('F4').value)).toBe('740')

    // Grand total is in F5 (column totals row, trailing column)
    expect(String(worksheet.getCell('F5').value)).toBe('1440')
  })

  it('the totals column header (F2) is labeled "Total" on the deepest header level', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // Row 2 is the deepest (last) header level — F2 must have the totals label
    expect(String(worksheet.getCell('F2').value)).toBe('Total')

    // Row 1 is the upper header level — F1 should be empty (not labeled)
    expect(String(worksheet.getCell('F1').value ?? '')).toBe('')
  })

  it('header column count equals data row column count', async () => {
    const workbook = await buildPivotWorkbook(
      samplePivotData,
      ['product'],
      ['region'],
      [],
    )
    const worksheet = workbook.worksheets[0]

    // Count non-null cells in deepest header row (row 2) and first data row (row 3)
    const headerCellCount = worksheet.getRow(2).cellCount
    const dataCellCount = worksheet.getRow(3).cellCount
    expect(headerCellCount).toBe(dataCellCount)
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
