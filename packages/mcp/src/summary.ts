import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { TerminalFormatOptions } from './card.js'
import type { ColumnSummary, StoredDataset } from './store.js'
import { buildChartStory, computePivotResult, describeUnmatchedRegions, processChartDataForChoropleth } from '@smallwebco/tinypivot-core'
import { buildBottomBorder, buildTopBorder, padEndVisual, padStartVisual, renderSparkline, truncateVisual, visualWidth } from './card.js'
import { DISTINCT_COUNT_CAP } from './store.js'
import { detectNonAdditiveSumWarning, formatTerminalChart } from './terminal-chart.js'

/** A grid this small is sent as its rows: the model needs the values, and they cost less than a re-query. */
export const SMALL_GRID_MAX_ROWS = 25
const SMALL_GRID_MAX_COLUMNS = 10

function tableCell(value: unknown): string {
  if (value === null || value === undefined)
    return ''
  const text = typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : String(value)
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** The rows of a small dataset in grid view, as a Markdown table. */
function smallGridTable(dataset: StoredDataset): string | null {
  if (dataset.viewMode !== 'grid' || dataset.rows.length > SMALL_GRID_MAX_ROWS || dataset.columns.length > SMALL_GRID_MAX_COLUMNS)
    return null
  const names = dataset.columns.map(column => column.name)
  if (names.length === 0)
    return null
  return [
    `| ${names.join(' | ')} |`,
    `|${names.map(() => '---').join('|')}|`,
    ...dataset.rows.map(row => `| ${names.map(name => tableCell(row[name])).join(' | ')} |`),
  ].join('\n')
}

/** The fenced pivot table for a dataset that is in pivot view with a value to aggregate. */
function pivotTableCard(dataset: StoredDataset, options: TerminalFormatOptions): string | null {
  const pivot = dataset.pivotConfig
  if (dataset.viewMode !== 'pivot' || !pivot?.valueFields?.length)
    return null
  const config: PivotConfig = {
    rowFields: [],
    columnFields: [],
    showRowTotals: true,
    showColumnTotals: true,
    ...pivot,
    valueFields: pivot.valueFields,
  }
  return formatPivotSummary(dataset, config, options.companionUrl, options).match(/```text[\s\S]*?```/)?.[0] ?? null
}

/** A column at the cap has at least that many values, so it reads as "1,000+". */
function formatDistinctCount(count: number): string {
  return count >= DISTINCT_COUNT_CAP ? `${DISTINCT_COUNT_CAP.toLocaleString('en-US')}+` : String(count)
}

/** Columns with this many values or fewer list them all, so the model can filter by exact value. */
const LISTED_VALUES_MAX = 5

/** Every column on one line: name, type, and either its values or how many there are. */
export function formatColumnNotes(columns: ColumnSummary[]): string {
  const notes = columns.map((column) => {
    const values = column.distinctCount <= LISTED_VALUES_MAX
      ? `: ${column.sampleValues.join(', ')}`
      : ` (${formatDistinctCount(column.distinctCount)} values)`
    return `\`${column.name}\` ${column.type}${values}`
  })
  return `Columns: ${notes.join(' · ') || 'none'}`
}

const REPRINT_NOTE = 'Show the card above to the user verbatim.'
const SHOWN_NOTES = {
  widget: 'The user already sees this in the TinyPivot view in the chat: do not repeat the card or a table of it. Reply with the takeaways.',
  pi: 'TinyPivot\'s pi extension already shows the user this card: do not repeat it or a table of it. Reply with the takeaways and the Studio link.',
}

/** What to tell the model about the card: repeat it in a terminal, leave it alone beside the widget. */
function cardNote(companionUrl: string | undefined, options: TerminalFormatOptions): string | null {
  if (options.shownBy)
    return SHOWN_NOTES[options.shownBy]
  return companionUrl && options.reprintNote !== false ? REPRINT_NOTE : null
}

/** The card for a dataset as it stands: its pivot table in pivot view, else its chart. */
export function datasetCard(dataset: StoredDataset, options: TerminalFormatOptions = {}): string | null {
  return pivotTableCard(dataset, options) ?? (formatTerminalChart(dataset, dataset.chartConfig, options) || null)
}

/** The title on a card's top edge, the part that identifies it. */
export function cardTitle(card: string): string | null {
  // eslint-disable-next-line no-control-regex
  return /╭─ (.+?) ─/.exec(card.replace(/\x1B\[[0-9;]*m/g, ''))?.[1] ?? null
}

/**
 * Plain-text lines about what a chart shows and leaves out: the computed
 * takeaway and any map labels that matched nothing. Same words as the chart.
 */
export function describeChartForText(rows: Record<string, unknown>[], config?: Partial<ChartConfig>): string[] {
  if (!config?.type || !config.xAxis || !config.yAxis)
    return []
  const full = config as ChartConfig
  const lines: string[] = []
  const story = full.options?.annotations === false ? null : buildChartStory(rows, full)
  if (story)
    lines.push(`Takeaway (computed from the data): ${story.headline}.`)
  if (full.type === 'choropleth') {
    const unmatched = describeUnmatchedRegions(processChartDataForChoropleth(rows, full))
    if (unmatched)
      lines.push(`> **Map warning**: ${unmatched}`)
  }
  return lines
}

export function formatDatasetSummary(
  dataset: StoredDataset,
  companionUrl?: string,
  options: TerminalFormatOptions = {},
): string {
  const cardOptions = { ...options, companionUrl: options.companionUrl ?? companionUrl }
  // A dataset opened in pivot view answers with the pivot table; anything else gets its chart.
  const chartBlock = smallGridTable(dataset) ?? datasetCard(dataset, cardOptions)
  const rowHeadline = dataset.truncatedForFreeTier
    ? `**${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows (Free tier limit)**`
    : `**${dataset.rows.length.toLocaleString()} rows**`
  const parts = [
    `Loaded **${dataset.name}** (\`${dataset.id}\`): ${rowHeadline}, ${dataset.columns.length} columns.`,
  ]

  if (dataset.truncatedForFreeTier) {
    parts.push(
      '',
      `> **Free tier:** showing the first ${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows, so totals cover only those. A license key unlocks every row: https://tiny-pivot.com/pricing`,
    )
  }

  const integrityWarning = detectNonAdditiveSumWarning(dataset, dataset.chartConfig)
  if (integrityWarning) {
    parts.push('', integrityWarning)
  }

  const chartText = describeChartForText(dataset.rows, dataset.chartConfig)
  if (chartText.length > 0)
    parts.push('', ...chartText)

  if (chartBlock) {
    parts.push('', chartBlock)
    const note = cardNote(companionUrl, options)
    if (note)
      parts.push(note)
  }

  parts.push('', formatColumnNotes(dataset.columns))

  // A card's footer already carries the Studio link; a small table as Markdown does not.
  if (companionUrl && !chartBlock?.includes(companionUrl))
    parts.push(`Studio: ${companionUrl}`)

  return parts.join('\n')
}

export function formatPivotSummary(
  dataset: StoredDataset,
  config: PivotConfig,
  companionUrl?: string,
  options: TerminalFormatOptions = {},
): string {
  const result = computePivotResult(dataset.rows, config)
  if (!result || result.rowHeaders.length === 0) {
    return `Configured pivot on **${dataset.name}**, but no rows matched.`
  }

  const maxRows = 16
  const maxCols = 6
  const rowFieldHeader = config.rowFields.join(' / ') || 'Row'
  const totalCols = result.data[0]?.length ?? 0
  const visibleCols = Math.min(totalCols, maxCols)
  const includeSparkline = visibleCols >= 3

  const colHeaders: string[] = []
  for (let c = 0; c < visibleCols; c++) {
    const parts = result.headers.map(level => level[c]).filter(Boolean)
    colHeaders.push(truncateVisual(parts.join(' · ') || `Col ${c + 1}`, 12))
  }

  const headers = [
    truncateVisual(rowFieldHeader, 20),
    ...colHeaders,
    ...(includeSparkline ? ['Trend'] : []),
    ...(config.showRowTotals ? ['Total'] : []),
  ]

  const visibleRows = Math.min(result.rowHeaders.length, maxRows)
  const dataRows: string[][] = []
  for (let r = 0; r < visibleRows; r++) {
    const label = truncateVisual(result.rowHeaders[r].join(' / '), 20)
    const slice = result.data[r].slice(0, visibleCols)
    const vals = slice.map(cell => cell.formattedValue || '—')
    const spark = includeSparkline
      ? [renderSparkline(slice.map(c => Number(c.value ?? 0)))]
      : []
    const total = config.showRowTotals && result.rowTotals[r]
      ? [result.rowTotals[r].formattedValue]
      : []
    dataRows.push([label, ...vals, ...spark, ...total])
  }

  let totalRow: string[] | null = null
  if (config.showColumnTotals && result.grandTotal) {
    const colTots = result.columnTotals.slice(0, visibleCols).map(c => c.formattedValue || '—')
    totalRow = [
      'Total',
      ...colTots,
      ...(includeSparkline ? [renderSparkline(result.columnTotals.slice(0, visibleCols).map(c => Number(c.value ?? 0)))] : []),
      ...(config.showRowTotals ? [result.grandTotal.formattedValue] : []),
    ]
  }

  // Compute exact visual column widths for rock-solid box-drawn alignment
  const widths = headers.map((h, i) => {
    const rowMax = Math.max(
      ...dataRows.map(r => visualWidth(r[i] ?? '')),
      totalRow ? visualWidth(totalRow[i] ?? '') : 0,
    )
    return Math.max(visualWidth(h), rowMax, i === 0 ? 8 : 5)
  })

  // Ensure card inner width is wide enough for title + badge + footer cleanly
  const computeInnerWidth = () =>
    widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * 3

  const effectiveLiveUrl = options.companionUrl ?? companionUrl
  const liveLabel = effectiveLiveUrl ? `↗ Live: ${effectiveLiveUrl}` : ''
  const minInner = Math.max(48, liveLabel ? visualWidth(liveLabel) + 2 : 0)
  const deficit = minInner - computeInnerWidth()
  if (deficit > 0) {
    widths[0] += deficit
  }

  const innerWidth = computeInnerWidth()
  const primaryVal = config.valueFields[0]
  const pivotTitle = primaryVal
    ? `${dataset.name} · ${primaryVal.aggregation}(${primaryVal.field})`
    : `${dataset.name} · Pivot`
  const rightBadge = result.grandTotal ? `Total ${result.grandTotal.formattedValue}` : `${dataset.rows.length.toLocaleString()} rows`

  const topTitleBorder = buildTopBorder(pivotTitle, rightBadge, innerWidth)
  const topColsRule = `├─${widths.map(w => '─'.repeat(w)).join('─┬─')}─┤`
  const midRule = `├─${widths.map(w => '─'.repeat(w)).join('─┼─')}─┤`
  const botColsRule = `├─${widths.map(w => '─'.repeat(w)).join('─┴─')}─┤`

  const formatRow = (cells: string[]) =>
    `│ ${cells.map((c, i) => (i === 0 ? padEndVisual(c, widths[i]) : padStartVisual(c, widths[i]))).join(' │ ')} │`

  const showBranding = options.showBranding !== false
  const metaRight = `${dataset.rows.length.toLocaleString()} rows · ${result.rowHeaders.length} groups`
  const metaLeft = showBranding ? 'tiny-pivot.com' : ''
  const footerLine = buildBottomBorder(metaLeft, metaRight, innerWidth)

  const tableLines = [
    '```text',
    topTitleBorder,
    topColsRule,
    formatRow(headers),
    midRule,
    ...dataRows.map(formatRow),
  ]
  if (totalRow) {
    tableLines.push(midRule, formatRow(totalRow))
  }
  tableLines.push(botColsRule)
  const hasFooterContent = result.rowHeaders.length > maxRows || totalCols > maxCols || showBranding || Boolean(liveLabel)
  if (hasFooterContent) {
    if (result.rowHeaders.length > maxRows || totalCols > maxCols) {
      const clipNotes: string[] = []
      if (result.rowHeaders.length > maxRows)
        clipNotes.push(`+${result.rowHeaders.length - maxRows} more rows`)
      if (totalCols > maxCols)
        clipNotes.push(`+${totalCols - maxCols} more cols`)
      const clipMsg = truncateVisual(`… ${clipNotes.join(', ')} (all interactive in TinyPivot)`, innerWidth)
      tableLines.push(`│ ${padEndVisual(clipMsg, innerWidth)} │`)
    }
    if (liveLabel) {
      tableLines.push(`│ ${padEndVisual(truncateVisual(liveLabel, innerWidth), innerWidth)} │`)
    }
    if (showBranding) {
      const leftTxt = 'tiny-pivot.com'
      const rightTxt = truncateVisual(metaRight, Math.max(4, innerWidth - visualWidth(leftTxt) - 2))
      const gap = Math.max(1, innerWidth - visualWidth(leftTxt) - visualWidth(rightTxt))
      tableLines.push(`│ ${leftTxt}${' '.repeat(gap)}${rightTxt} │`)
      tableLines.push(`╰${'─'.repeat(innerWidth + 2)}╯`)
    }
    else {
      tableLines.push(footerLine)
    }
  }
  else {
    tableLines.pop()
    tableLines.push(`╰─${widths.map(w => '─'.repeat(w)).join('─┴─')}─╯`)
  }
  if (options.raw) {
    tableLines.shift()
  }
  else {
    tableLines.push('```')
  }

  const headline = dataset.truncatedForFreeTier
    ? `Pivot on **${dataset.name}** (**first ${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows — Free tier subset**):`
    : `Pivot on **${dataset.name}** (${dataset.rows.length.toLocaleString()} source rows):`

  // The card itself notes clipped rows and carries the Studio link in its footer.
  const out = [headline, '', tableLines.join('\n')]
  const note = cardNote(companionUrl, options)
  if (note)
    out.push(note)

  return out.join('\n')
}
