/**
 * TinyPivot Core - XLSX Export Utilities
 * Styled Excel export for flat grids and pivot tables.
 * ExcelJS is dynamically imported to keep it out of the main bundle.
 */
import type ExcelJSType from 'exceljs'
import type { PivotValueField, XlsxExportOptions } from '../types'
import type { PivotExportData } from './index'

// ============================================================================
// Shared style helpers
// ============================================================================

const HEADER_FILL_ARGB = 'FFEEEEEE'
const TOTAL_FILL_ARGB = 'FFDDE3EA'
const MAX_COLUMN_WIDTH = 50
const MIN_COLUMN_WIDTH = 8

type ExcelWorksheet = ExcelJSType.Worksheet
type ExcelRow = ExcelJSType.Row

function applyHeaderStyle(row: ExcelRow): void {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } }
  })
}

function applyTotalStyle(row: ExcelRow): void {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL_ARGB } }
  })
}

function computeWidth(values: string[]): number {
  const max = values.reduce((acc, v) => Math.max(acc, (v ?? '').length), 0)
  return Math.min(Math.max(max + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
}

function freezeHeaderRow(worksheet: ExcelWorksheet): void {
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
}

// ============================================================================
// Flat grid workbook builder
// ============================================================================

/**
 * Build an ExcelJS Workbook for a flat grid (no download — testable).
 */
export async function buildGridWorkbook<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options: XlsxExportOptions = {},
): Promise<ExcelJSType.Workbook> {
  const { default: ExcelJSModule } = await import('exceljs')
  const workbook = new ExcelJSModule.Workbook()
  const sheetName = options.sheetName ?? 'Sheet1'
  const worksheet = workbook.addWorksheet(sheetName)

  // Compute column widths from header + data values
  worksheet.columns = columns.map((col) => {
    const dataValues = data.map(row => String(row[col] ?? ''))
    const width = computeWidth([col, ...dataValues])
    return { header: col, key: col, width }
  })

  // Style the header row
  const headerRow = worksheet.getRow(1)
  applyHeaderStyle(headerRow)
  freezeHeaderRow(worksheet)

  // Add data rows with optional number formats
  const formats = options.numberFormats
  for (const record of data) {
    const rowValues = columns.map(col => record[col] ?? '')
    const row = worksheet.addRow(rowValues)

    if (formats) {
      row.eachCell((cell, colNumber) => {
        const col = columns[colNumber - 1]
        if (col && formats[col]) {
          cell.numFmt = formats[col]
        }
      })
    }
  }

  return workbook
}

/**
 * Export a flat grid to XLSX and trigger a browser download.
 */
export async function exportToXLSX<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options: XlsxExportOptions = {},
): Promise<void> {
  const workbook = await buildGridWorkbook(data, columns, options)
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = options.filename ?? 'export.xlsx'
  downloadBuffer(buffer, filename)
}

// ============================================================================
// Pivot workbook builder
// ============================================================================

/**
 * Apply merged cell spans for a single pivot header level.
 * Consecutive identical values in the level are merged into one cell.
 */
function applyHeaderLevelMerges(
  worksheet: ExcelWorksheet,
  headerRow: string[],
  level: number,
  rowHeaderColCount: number,
): void {
  let spanStart = 0
  let spanValue = headerRow[0]

  for (let i = 1; i <= headerRow.length; i++) {
    const atEnd = i === headerRow.length
    const valueChanged = !atEnd && headerRow[i] !== spanValue

    if (atEnd || valueChanged) {
      const spanLength = i - spanStart
      if (spanLength > 1) {
        const excelRow = level + 1 // 1-based
        const startCol = rowHeaderColCount + spanStart + 1 // 1-based
        const endCol = rowHeaderColCount + i // 1-based (inclusive)
        worksheet.mergeCells(excelRow, startCol, excelRow, endCol)
      }
      spanStart = i
      if (!atEnd) {
        spanValue = headerRow[i]
      }
    }
  }
}

/**
 * Write all header levels for a pivot worksheet, applying merges.
 */
function writePivotHeaders(
  worksheet: ExcelWorksheet,
  headers: string[][],
  rowFields: string[],
  rowHeaderColCount: number,
  showRowTotals: boolean | undefined,
  rowTotals: Array<{ formattedValue: string }> | undefined,
  valueFields: import('../types').PivotValueField[],
): void {
  const hasTotalsCol = showRowTotals && rowTotals && rowTotals.length > 0
  const totalsLabel = valueFields.length === 1
    ? `Total (${valueFields[0].aggregation})`
    : 'Total'

  for (let level = 0; level < headers.length; level++) {
    const isDeepest = level === headers.length - 1
    const headerValues = [
      ...Array.from({ length: rowHeaderColCount }, (_, i) =>
        isDeepest ? (rowFields[i] ?? '') : ''),
      ...headers[level],
    ]
    if (hasTotalsCol) {
      headerValues.push(isDeepest ? totalsLabel : '')
    }
    const row = worksheet.addRow(headerValues)
    applyHeaderStyle(row)

    if (headers[level].length > 1) {
      applyHeaderLevelMerges(worksheet, headers[level], level, rowHeaderColCount)
    }
  }
}

/**
 * Write data rows for a pivot worksheet.
 */
function writePivotDataRows(
  worksheet: ExcelWorksheet,
  rowHeaders: string[][],
  data: Array<Array<{ formattedValue: string }>>,
  rowTotals: Array<{ formattedValue: string }> | undefined,
  showRowTotals: boolean | undefined,
  rowHeaderColCount: number,
): void {
  for (let rowIdx = 0; rowIdx < rowHeaders.length; rowIdx++) {
    const rowHeader = rowHeaders[rowIdx] ?? []
    const rowData = data[rowIdx] ?? []

    const cells: (string | number)[] = []
    for (let i = 0; i < rowHeaderColCount; i++) {
      cells.push(rowHeader[i] ?? '')
    }
    for (const cell of rowData) {
      cells.push(cell?.formattedValue ?? '')
    }
    if (showRowTotals && rowTotals?.[rowIdx]) {
      cells.push(rowTotals[rowIdx].formattedValue ?? '')
    }

    worksheet.addRow(cells)
  }
}

/**
 * Write the column totals row (last row) with bold+fill styling.
 */
function writePivotColumnTotals(
  worksheet: ExcelWorksheet,
  columnTotals: Array<{ formattedValue: string }>,
  grandTotal: { formattedValue: string } | undefined,
  showRowTotals: boolean | undefined,
  rowHeaderColCount: number,
): void {
  const totalsRowValues: string[] = ['Total']
  for (let i = 1; i < rowHeaderColCount; i++) {
    totalsRowValues.push('')
  }
  for (const cell of columnTotals) {
    totalsRowValues.push(cell?.formattedValue ?? '')
  }
  if (showRowTotals && grandTotal) {
    totalsRowValues.push(grandTotal.formattedValue ?? '')
  }

  const totalsRow = worksheet.addRow(totalsRowValues)
  applyTotalStyle(totalsRow)
}

/**
 * Compute reasonable column widths for a pivot worksheet.
 */
function computePivotColumnWidths(
  pivotData: PivotExportData,
  rowFields: string[],
  rowHeaderColCount: number,
): number[] {
  const widths: number[] = []

  // Row header columns
  for (let i = 0; i < rowHeaderColCount; i++) {
    const values = [rowFields[i] ?? '', ...pivotData.rowHeaders.map(rh => rh[i] ?? '')]
    widths.push(computeWidth(values))
  }

  // Data columns — use last header level as column label source
  const lastHeaderLevel = pivotData.headers[pivotData.headers.length - 1] ?? []
  const colCount = pivotData.data[0]?.length ?? lastHeaderLevel.length
  for (let c = 0; c < colCount; c++) {
    const colHeader = lastHeaderLevel[c] ?? ''
    const dataValues = pivotData.data.map(row => row[c]?.formattedValue ?? '')
    widths.push(computeWidth([colHeader, ...dataValues]))
  }

  return widths
}

/**
 * Build an ExcelJS Workbook for a pivot table (no download — testable).
 */
export async function buildPivotWorkbook(
  pivotData: PivotExportData,
  rowFields: string[],
  _columnFields: string[], // kept for API symmetry with exportPivotToCSV
  valueFields: PivotValueField[],
  options: XlsxExportOptions = {},
): Promise<ExcelJSType.Workbook> {
  const { default: ExcelJSModule } = await import('exceljs')
  const workbook = new ExcelJSModule.Workbook()
  const sheetName = options.sheetName ?? 'Pivot'
  const worksheet = workbook.addWorksheet(sheetName)

  const {
    headers,
    rowHeaders,
    data,
    rowTotals,
    columnTotals,
    grandTotal,
    showRowTotals,
    showColumnTotals,
  } = pivotData

  const rowHeaderColCount = rowFields.length || 1

  // Write column headers (with merges)
  if (headers.length > 0) {
    writePivotHeaders(worksheet, headers, rowFields, rowHeaderColCount, showRowTotals, rowTotals, valueFields)
  }
  else {
    // Simple single-level header
    const simpleHeaderValues: string[] = [
      ...rowFields,
      ...(valueFields.map(vf => `${vf.field} (${vf.aggregation})`)),
    ]
    if (showRowTotals && rowTotals && rowTotals.length > 0) {
      simpleHeaderValues.push('Total')
    }
    const headerRow = worksheet.addRow(simpleHeaderValues)
    applyHeaderStyle(headerRow)
  }

  // Freeze after header rows
  const headerRowCount = headers.length || 1
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowCount }]

  // Write data rows
  writePivotDataRows(worksheet, rowHeaders, data, rowTotals, showRowTotals, rowHeaderColCount)

  // Write column totals row
  if (showColumnTotals && columnTotals && columnTotals.length > 0) {
    writePivotColumnTotals(worksheet, columnTotals, grandTotal, showRowTotals, rowHeaderColCount)
  }

  // Set column widths
  const widths = computePivotColumnWidths(pivotData, rowFields, rowHeaderColCount)
  worksheet.columns = widths.map(w => ({ width: w }))

  return workbook
}

/**
 * Export a pivot table to XLSX and trigger a browser download.
 */
export async function exportPivotToXLSX(
  pivotData: PivotExportData,
  rowFields: string[],
  columnFields: string[],
  valueFields: PivotValueField[],
  options: XlsxExportOptions = {},
): Promise<void> {
  const workbook = await buildPivotWorkbook(pivotData, rowFields, columnFields, valueFields, options)
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = options.filename ?? 'pivot-export.xlsx'
  downloadBuffer(buffer, filename)
}

// ============================================================================
// Download helper
// ============================================================================

/**
 * Trigger a browser file download from a buffer.
 */
function downloadBuffer(buffer: ArrayBuffer | SharedArrayBuffer | Buffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
