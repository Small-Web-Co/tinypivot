import type { DrillThroughResult } from '@smallwebco/tinypivot-core'
import type { NoteAttachment } from '../src/studio-protocol'

/**
 * Data the user sends back to the agent with a comment: a row they clicked, a pivot cell they
 * drilled into, or the view they are looking at. Kept to a small Markdown table, with the
 * dataset id so the agent can query the rest itself.
 */

const MAX_ROWS = 20
const MAX_COLUMNS = 12
const MAX_CELL_CHARS = 60

function cell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, MAX_CELL_CHARS)
}

export function rowsAsMarkdown(rows: Record<string, unknown>[], maxRows = MAX_ROWS): string {
  if (rows.length === 0)
    return '(no rows)'
  const columns = Object.keys(rows[0]).slice(0, MAX_COLUMNS)
  const lines = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.slice(0, maxRows).map(row => `| ${columns.map(column => cell(row[column])).join(' | ')} |`),
  ]
  if (rows.length > maxRows)
    lines.push(`(${(rows.length - maxRows).toLocaleString('en-US')} more rows)`)
  return lines.join('\n')
}

function datasetLine(name: string, id: string): string {
  return `Dataset "${name}"${id ? ` (\`${id}\`)` : ''}`
}

export function rowAttachment(name: string, id: string, rowIndex: number, row: Record<string, unknown>): NoteAttachment {
  return { label: `Row #${rowIndex + 1}`, text: `${datasetLine(name, id)}, row ${rowIndex + 1}:\n${rowsAsMarkdown([row])}` }
}

export function sliceAttachment(name: string, id: string, result: DrillThroughResult): NoteAttachment {
  const { descriptor } = result
  const slice = [...descriptor.rowPath, ...descriptor.columnPath].filter(Boolean).join(' / ') || 'total'
  return {
    label: `${slice} (${descriptor.rowCount.toLocaleString('en-US')} rows)`,
    text: [
      `${datasetLine(name, id)}, pivot cell ${slice}: ${descriptor.aggregation}(${descriptor.valueField}) = ${descriptor.formattedValue}, from ${descriptor.rowCount.toLocaleString('en-US')} rows.`,
      rowsAsMarkdown(result.rows),
    ].join('\n'),
  }
}

export function viewAttachment(name: string, id: string, view: string, rows: Record<string, unknown>[]): NoteAttachment {
  return {
    label: `${name} · ${view}`,
    text: `${datasetLine(name, id)}, shown as ${view}, ${rows.length.toLocaleString('en-US')} rows. First rows:\n${rowsAsMarkdown(rows, 10)}`,
  }
}
