import type { ChartConfig, DataGridViewMode, DrillThroughResult, PivotConfig } from '@smallwebco/tinypivot-core'
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

/** What the user is looking at, so the agent can tell which of its views the message is about. */
export interface AttachedView {
  mode: DataGridViewMode
  pivotConfig?: Partial<PivotConfig>
  chartConfig?: Partial<ChartConfig>
}

/** "sum(mrr) by region × channel" for a pivot, or undefined while it has no values. */
export function describePivot(config: Partial<PivotConfig> | undefined): string | undefined {
  const values = (config?.valueFields ?? []).map(value => `${value.aggregation}(${value.field})`)
  if (values.length === 0)
    return undefined
  const rows = config?.rowFields?.join(', ')
  const columns = config?.columnFields?.join(', ')
  const by = [rows, columns].filter(Boolean).join(' × ')
  return `${values.join(', ')}${by ? ` by ${by}` : ''}`
}

/** "line chart of sum(mrr) by period, split by year", or just the type while it has no axes. */
export function describeChart(config: Partial<ChartConfig> | undefined): string {
  const type = `${config?.type ?? 'bar'} chart`
  const y = config?.yAxis && `${config.yAxis.aggregation ?? 'sum'}(${config.yAxis.field})`
  if (!y)
    return type
  const x = config?.xAxis ? ` by ${config.xAxis.field}` : ''
  const series = config?.seriesField ? `, split by ${config.seriesField.field}` : ''
  return `${type} of ${y}${x}${series}`
}

/**
 * The view the user is looking at. A pivot or chart is described by its layout, which the agent
 * can rebuild or query from the dataset id; only the plain table sends sample rows.
 */
export function viewAttachment(name: string, id: string, view: AttachedView, rows: Record<string, unknown>[]): NoteAttachment {
  const pivot = view.mode === 'pivot' ? describePivot(view.pivotConfig) : undefined
  if (pivot)
    return { label: `${name} · pivot table`, text: `${datasetLine(name, id)}, shown as a pivot table: ${pivot}.` }
  if (view.mode === 'chart') {
    const chart = describeChart(view.chartConfig)
    return { label: `${name} · ${view.chartConfig?.type ?? 'bar'} chart`, text: `${datasetLine(name, id)}, shown as a ${chart}.` }
  }
  return {
    label: `${name} · table`,
    text: `${datasetLine(name, id)}, shown as a table, ${rows.length.toLocaleString('en-US')} rows. First rows:\n${rowsAsMarkdown(rows, 10)}`,
  }
}
