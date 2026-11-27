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

/**
 * Dynamically import exceljs and return the module object that actually carries
 * the `Workbook` constructor.
 *
 * exceljs ships a Node build (`main`) and a browser UMD build (`browser`). Under
 * different bundlers the dynamic import resolves to different interop shapes —
 * the constructor may sit on the namespace itself, on `.default`, or on
 * `.default.default`. Probing for `Workbook` makes the loader correct for all of
 * them instead of assuming a single `.default` level (which works in Node tests
 * but silently fails in the browser).
 */
/**
 * Pick the object that actually carries the `Workbook` constructor out of an
 * imported exceljs module, probing the namespace, `.default`, and
 * `.default.default`. Exported for testing the interop shapes a bundler may
 * produce. Returns `undefined` when no candidate exposes `Workbook`.
 */
export function resolveExcelJS(mod: unknown): typeof ExcelJSType | undefined {
  const asRecord = mod as Record<string, unknown> | undefined
  const candidates = [
    asRecord,
    asRecord?.default,
    (asRecord?.default as Record<string, unknown> | undefined)?.default,
  ]
  const resolved = candidates.find(
    candidate => typeof (candidate as { Workbook?: unknown } | undefined)?.Workbook === 'function',
  )
  return resolved as typeof ExcelJSType | undefined
}

async function loadExcelJS(): Promise<typeof ExcelJSType> {
  const resolved = resolveExcelJS(await import('exceljs'))
  if (!resolved) {
    throw new TypeError('[TinyPivot] Failed to load exceljs: Workbook constructor not found on the imported module.')
  }
  return resolved
}

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

/**
 * Coerce a raw cell value into something exceljs can serialize.
 *
 * exceljs JSON-stringifies cell values internally, which throws on BigInt
 * ("Do not know how to serialize a BigInt"). DuckDB and other SQL sources
 * return integer columns as BigInt, so normalize those to a Number when they
 * fit in a safe integer, otherwise to a string to avoid silent precision loss.
 */
function normalizeCellValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString()
  }
  return value
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
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
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
    const rowValues = columns.map(col => normalizeCellValue(record[col]) ?? '')
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
// Source data sheet helper
// ============================================================================

export interface SourceData {
  rows: Record<string, unknown>[]
  columns: string[]
}

/**
 * Sanitize column names: fill empty names with Col1/Col2/etc.,
 * and de-duplicate by appending _2, _3, etc.
 */
function sanitizeColumns(columns: string[]): string[] {
  const result: string[] = []
  const seen = new Map<string, number>()

  for (let i = 0; i < columns.length; i++) {
    const raw = String(columns[i] ?? '').trim()
    const base = raw.length > 0 ? raw : `Col${i + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    result.push(count === 0 ? base : `${base}_${count + 1}`)
  }

  return result
}

/**
 * Write a "Source Data" sheet to the workbook, with an Excel Table when
 * there is at least one data row, or a plain header row otherwise.
 */
async function writeSourceDataSheet(
  workbook: ExcelJSType.Workbook,
  sourceData: SourceData,
): Promise<void> {
  const cols = sanitizeColumns(sourceData.columns)
  const sheet = workbook.addWorksheet('Source Data')

  if (sourceData.rows.length === 0) {
    // addTable requires >=1 data row -- just write a plain header row
    const headerRow = sheet.addRow(cols)
    applyHeaderStyle(headerRow)
    return
  }

  const dataRows = sourceData.rows.map(r =>
    sourceData.columns.map(c => normalizeCellValue(r[c]) ?? ''),
  )

  sheet.addTable({
    name: 'SourceData',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: cols.map(c => ({ name: c, filterButton: true })),
    rows: dataRows,
  } as ExcelJSType.TableProperties)

  // Auto-size columns from header + data
  const allValues = dataRows.map(r => r.map(v => String(v ?? '')))
  sheet.columns = cols.map((col, i) => {
    const colValues = allValues.map(r => r[i] ?? '')
    return { width: computeWidth([col, ...colValues]) }
  })
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

  // Data columns -- use last header level as column label source
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
 * Build an ExcelJS Workbook for a pivot table (no download -- testable).
 */
export async function buildPivotWorkbook(
  pivotData: PivotExportData,
  rowFields: string[],
  _columnFields: string[], // kept for API symmetry with exportPivotToCSV
  valueFields: PivotValueField[],
  options: XlsxExportOptions = {},
  sourceData?: SourceData,
): Promise<ExcelJSType.Workbook> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
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

  // Optionally add a second "Source Data" sheet
  const hasSourceData = sourceData && sourceData.rows.length > 0 && sourceData.columns.length > 0
  if (hasSourceData) {
    await writeSourceDataSheet(workbook, sourceData)
  }

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
  sourceData?: SourceData,
): Promise<void> {
  const workbook = await buildPivotWorkbook(pivotData, rowFields, columnFields, valueFields, options, sourceData)
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = options.filename ?? 'pivot-export.xlsx'
  downloadBuffer(buffer, filename)
}

// ============================================================================
// XLSX Read / Inspect helpers (shared by MCP & browser importers)
// ============================================================================

export interface XlsxReadResult {
  rows: Record<string, unknown>[]
  sheetName: string
  sheetNames: string[]
  headerRow?: number
  notes?: string[]
}

export interface XlsxSheetSummary {
  name: string
  rowCount: number
  headerRow: number
  columns: string[]
  notes: string[]
}

export interface XlsxInspectResult {
  sheetNames: string[]
  firstSheetName: string
  rowCount: number
  columns: string[]
  headerRow?: number
  notes?: string[]
  sheets?: XlsxSheetSummary[]
}

const UNIT_ONLY_RE = /^(?:\([^)]{1,24}\)|\[[^\]]{1,24}\])$/
const PURE_NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i

function extractRowValues(row: ExcelRow): unknown[] {
  const rawVals = Array.isArray(row.values) ? row.values.slice(1) : []
  return rawVals.map(coerceReadCell)
}

function scoreHeaderCandidate(cells: unknown[]): number {
  const nonEmpty = cells
    .map(c => (c === null || c === undefined ? '' : String(c).trim()))
    .filter(Boolean)
  if (nonEmpty.length === 0)
    return -1
  if (nonEmpty.length === 1)
    return 0.5
  let stringCount = 0
  let numericCount = 0
  let unitOnlyCount = 0
  const distinct = new Set<string>()
  for (const s of nonEmpty) {
    if (UNIT_ONLY_RE.test(s)) {
      unitOnlyCount++
    }
    else if (PURE_NUM_RE.test(s.replace(/,/g, ''))) {
      numericCount++
    }
    else {
      stringCount++
      distinct.add(s.toLowerCase())
    }
  }
  if (stringCount === 0 && unitOnlyCount > 0)
    return 1
  if (stringCount === 0)
    return 0.2
  return distinct.size * 3 + stringCount - numericCount * 1.5 - unitOnlyCount * 0.5
}

function detectWorksheetHeader(ws: ExcelWorksheet): { headerRow: number, rawHeaders: string[], notes: string[] } {
  const scanLimit = Math.min(ws.rowCount, 20)
  const candidates: Array<{ rowNum: number, cells: unknown[], score: number }> = []
  for (let r = 1; r <= scanLimit; r++) {
    const cells = extractRowValues(ws.getRow(r))
    const score = scoreHeaderCandidate(cells)
    if (score >= 0)
      candidates.push({ rowNum: r, cells, score })
  }
  if (candidates.length === 0)
    return { headerRow: 1, rawHeaders: [], notes: [] }

  let best = candidates[0]
  for (const cand of candidates) {
    if (cand.score > best.score + 0.5)
      best = cand
  }

  const notes: string[] = []
  for (const cand of candidates) {
    if (cand.rowNum >= best.rowNum)
      break
    const parts = cand.cells
      .map(c => (c === null || c === undefined ? '' : String(c).trim()))
      .filter(Boolean)
    if (parts.length > 0 && parts.some(p => !UNIT_ONLY_RE.test(p))) {
      const joined = parts.slice(0, 6).join(' · ')
      notes.push(joined.length > 220 ? `${joined.slice(0, 217)}...` : joined)
    }
  }

  // Trim trailing null cells so header length matches actual header columns
  let lastIdx = best.cells.length - 1
  while (lastIdx >= 0 && (best.cells[lastIdx] === null || best.cells[lastIdx] === ''))
    lastIdx--
  const trimmed = best.cells.slice(0, lastIdx + 1)
  const rawHeaders = sanitizeColumns(trimmed.map(cell => (cell === null || cell === undefined ? '' : String(cell))))
  return { headerRow: best.rowNum, rawHeaders, notes: notes.slice(0, 4) }
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer)
    return input
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
}

function coerceReadCell(value: unknown): unknown {
  if (value === null || value === undefined)
    return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (value instanceof Date)
    return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('result' in obj && obj.result !== undefined)
      return coerceReadCell(obj.result)
    if (Array.isArray(obj.richText))
      return obj.richText.map(part => String((part as { text?: unknown }).text ?? '')).join('')
    if (typeof obj.text === 'string')
      return obj.text
    if (typeof obj.formula === 'string')
      return null
  }
  return String(value)
}

/**
 * Inspect an XLSX buffer's sheets, auto-detected header rows, preamble notes, and column names
 * without materializing every row.
 */
export async function inspectXlsxBuffer(input: ArrayBuffer | Uint8Array): Promise<XlsxInspectResult> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(toArrayBuffer(input))
  const sheetNames = workbook.worksheets.map(ws => ws.name)
  const sheets: XlsxSheetSummary[] = workbook.worksheets.slice(0, 6).map((ws) => {
    const detected = detectWorksheetHeader(ws)
    return {
      name: ws.name,
      rowCount: Math.max(0, ws.rowCount - detected.headerRow),
      headerRow: detected.headerRow,
      columns: detected.rawHeaders,
      notes: detected.notes,
    }
  })
  const first = sheets.find(s => s.rowCount > 0 || s.columns.length > 0) ?? sheets[0]
  return {
    sheetNames,
    firstSheetName: first?.name ?? '',
    rowCount: first?.rowCount ?? 0,
    columns: first?.columns ?? [],
    headerRow: first?.headerRow ?? 1,
    notes: first?.notes ?? [],
    sheets,
  }
}

/**
 * Read a worksheet from an XLSX buffer into plain row objects, auto-detecting preamble title/note
 * rows above the real header row. Defaults to the first non-empty worksheet when `requestedSheet` is omitted.
 */
export async function readXlsxBuffer(
  input: ArrayBuffer | Uint8Array,
  requestedSheet?: string,
): Promise<XlsxReadResult> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(toArrayBuffer(input))
  const sheets = workbook.worksheets
  const sheetNames = sheets.map(ws => ws.name)
  if (sheets.length === 0)
    return { rows: [], sheetName: '', sheetNames: [] }

  const target = requestedSheet
    ? sheets.find(ws => ws.name.toLowerCase() === requestedSheet.trim().toLowerCase())
    : sheets.find(ws => ws.rowCount > 0) ?? sheets[0]
  if (!target)
    throw new Error(`Sheet "${requestedSheet}" not found. Available sheets: ${sheetNames.join(', ')}`)

  const { headerRow, rawHeaders: headers, notes } = detectWorksheetHeader(target)
  const rows: Record<string, unknown>[] = []
  target.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow || headers.length === 0)
      return
    const coerced = extractRowValues(row)
    const record: Record<string, unknown> = {}
    let hasValue = false
    for (let i = 0; i < headers.length; i++) {
      const val = i < coerced.length ? coerced[i] : null
      if (val !== null && val !== '')
        hasValue = true
      record[headers[i]] = val
    }
    if (hasValue)
      rows.push(record)
  })

  return { rows, sheetName: target.name, sheetNames, headerRow, notes }
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
