/**
 * TinyPivot Core - Export Utilities
 * CSV export, clipboard operations - no framework dependencies
 */
import type { ExportOptions, PivotValueField, SelectionBounds } from '../types'

/**
 * Pivot table export interface
 */
export interface PivotExportData {
  headers: string[][]
  rowHeaders: string[][]
  data: Array<Array<{ formattedValue: string }>>
  rowTotals?: Array<{ formattedValue: string }>
  columnTotals?: Array<{ formattedValue: string }>
  grandTotal?: { formattedValue: string }
  showRowTotals?: boolean
  showColumnTotals?: boolean
}

/**
 * Escape CSV value
 */
function escapeCSV(value: unknown, delimiter = ','): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * CSV Export functionality
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: string[],
  options: ExportOptions = {}
): void {
  const { filename = 'export.csv', includeHeaders = true, delimiter = ',' } = options

  const rows: string[] = []

  if (includeHeaders) {
    rows.push(columns.map(col => escapeCSV(col, delimiter)).join(delimiter))
  }

  for (const row of data) {
    const values = columns.map(col => escapeCSV(row[col], delimiter))
    rows.push(values.join(delimiter))
  }

  const csvContent = rows.join('\n')
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;')
}

/**
 * Export pivot table to CSV
 */
export function exportPivotToCSV(
  pivotData: PivotExportData,
  rowFields: string[],
  _columnFields: string[],
  valueFields: PivotValueField[],
  options: ExportOptions = {}
): void {
  const { filename = 'pivot-export.csv', delimiter = ',' } = options

  const rows: string[] = []
  const { headers, rowHeaders, data, rowTotals, columnTotals, grandTotal, showRowTotals, showColumnTotals } =
    pivotData

  // Calculate number of row header columns
  const rowHeaderColCount = rowFields.length || 1

  // Build column headers
  if (headers.length > 0) {
    // Multi-level column headers
    for (let level = 0; level < headers.length; level++) {
      const headerRow: string[] = []
      // Empty cells for row field columns
      for (let i = 0; i < rowHeaderColCount; i++) {
        headerRow.push(level === headers.length - 1 ? escapeCSV(rowFields[i] || '', delimiter) : '')
      }
      // Column header values
      for (const val of headers[level]) {
        headerRow.push(escapeCSV(val, delimiter))
      }
      // Row totals header
      if (showRowTotals && rowTotals && rowTotals.length > 0) {
        if (level === headers.length - 1) {
          for (const vf of valueFields) {
            headerRow.push(escapeCSV(`Total (${vf.aggregation})`, delimiter))
          }
        } else {
          for (let i = 0; i < valueFields.length; i++) {
            headerRow.push('')
          }
        }
      }
      rows.push(headerRow.join(delimiter))
    }
  } else {
    // Simple header with value fields only
    const headerRow: string[] = []
    for (let i = 0; i < rowHeaderColCount; i++) {
      headerRow.push(escapeCSV(rowFields[i] || '', delimiter))
    }
    for (const vf of valueFields) {
      headerRow.push(escapeCSV(`${vf.field} (${vf.aggregation})`, delimiter))
    }
    if (showRowTotals && rowTotals && rowTotals.length > 0) {
      headerRow.push(escapeCSV('Total', delimiter))
    }
    rows.push(headerRow.join(delimiter))
  }

  // Build data rows
  for (let rowIdx = 0; rowIdx < rowHeaders.length; rowIdx++) {
    const csvRow: string[] = []

    // Row headers
    const rowHeader = rowHeaders[rowIdx] || []
    for (let i = 0; i < rowHeaderColCount; i++) {
      csvRow.push(escapeCSV(rowHeader[i] || '', delimiter))
    }

    // Data cells
    const rowData = data[rowIdx] || []
    for (const cell of rowData) {
      csvRow.push(escapeCSV(cell?.formattedValue || '', delimiter))
    }

    // Row total
    if (showRowTotals && rowTotals && rowTotals[rowIdx]) {
      csvRow.push(escapeCSV(rowTotals[rowIdx].formattedValue || '', delimiter))
    }

    rows.push(csvRow.join(delimiter))
  }

  // Column totals row
  if (showColumnTotals && columnTotals && columnTotals.length > 0) {
    const totalsRow: string[] = []
    // Label for totals row
    totalsRow.push(escapeCSV('Total', delimiter))
    for (let i = 1; i < rowHeaderColCount; i++) {
      totalsRow.push('')
    }
    // Column total values
    for (const cell of columnTotals) {
      totalsRow.push(escapeCSV(cell?.formattedValue || '', delimiter))
    }
    // Grand total
    if (showRowTotals && grandTotal) {
      totalsRow.push(escapeCSV(grandTotal.formattedValue || '', delimiter))
    }
    rows.push(totalsRow.join(delimiter))
  }

  const csvContent = rows.join('\n')
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;')
}

/**
 * Download file helper
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
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

/**
 * Copy text to clipboard
 */
export function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: Error) => void
): void {
  navigator.clipboard.writeText(text).then(onSuccess).catch(onError)
}

/**
 * Format selected cells for clipboard (tab-separated)
 */
export function formatSelectionForClipboard<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
  selectionBounds: SelectionBounds
): string {
  const { minRow, maxRow, minCol, maxCol } = selectionBounds
  const lines: string[] = []

  for (let r = minRow; r <= maxRow; r++) {
    const row = rows[r]
    if (!row) continue
    const values: string[] = []
    for (let c = minCol; c <= maxCol; c++) {
      const colId = columns[c]
      if (!colId) continue
      const value = row[colId]
      values.push(value === null || value === undefined ? '' : String(value))
    }
    lines.push(values.join('\t'))
  }

  return lines.join('\n')
}

