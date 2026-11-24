import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { StoredDataset } from './store.js'
import { computePivotResult, processChartData } from '@smallwebco/tinypivot-core'

const BLOCK_FULL = '█'
const BLOCK_HALF = '▌'

function formatCompactNumber(val: number): string {
  if (!Number.isFinite(val))
    return '0'
  if (Math.abs(val) >= 1_000_000)
    return `${(val / 1_000_000).toFixed(2)}M`
  if (Math.abs(val) >= 1000)
    return Math.round(val).toLocaleString('en-US')
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}

/**
 * Render a crisp Unicode horizontal bar chart directly in terminal output
 * so CLI harnesses (Claude Code, OpenCode, pi, Rex, Ghostty) get an immediate visual answer.
 */
export function formatTerminalChart(dataset: StoredDataset, chartConfig?: Partial<ChartConfig>): string {
  if (!chartConfig?.xAxis || !chartConfig?.yAxis || dataset.rows.length === 0)
    return ''

  const fullConfig: ChartConfig = {
    type: chartConfig.type ?? 'bar',
    xAxis: chartConfig.xAxis,
    yAxis: chartConfig.yAxis,
    seriesField: chartConfig.seriesField,
    options: chartConfig.options,
  }

  const processed = processChartData(dataset.rows, fullConfig)
  if (!processed.categories.length || !processed.series.length)
    return ''

  // Sum across stacked series per X category for a clean terminal overview
  const entries = processed.categories.map((cat, idx) => {
    const total = processed.series.reduce((sum, s) => sum + (Number(s.data[idx]) || 0), 0)
    return { label: String(cat), value: total }
  }).slice(0, 14)

  const maxVal = Math.max(...entries.map(e => Math.abs(e.value)), 1)
  const labelWidth = Math.min(20, Math.max(...entries.map(e => e.label.length), 6))
  const barWidth = 28

  const lines = [
    '```text',
    chartConfig.options?.title || `${dataset.name}: ${chartConfig.yAxis.field} by ${chartConfig.xAxis.field}`,
    '─'.repeat(labelWidth + barWidth + 14),
  ]

  for (const entry of entries) {
    const label = entry.label.length > labelWidth
      ? `${entry.label.slice(0, labelWidth - 1)}…`
      : entry.label.padEnd(labelWidth)
    const ratio = Math.max(0, Math.abs(entry.value) / maxVal)
    const fullCount = Math.floor(ratio * barWidth)
    const hasHalf = (ratio * barWidth - fullCount) >= 0.45
    const bar = `${BLOCK_FULL.repeat(fullCount)}${hasHalf ? BLOCK_HALF : ''}` || '▏'
    lines.push(`${label} │ ${bar.padEnd(barWidth)} ${formatCompactNumber(entry.value)}`)
  }

  if (processed.categories.length > entries.length) {
    lines.push(`… +${processed.categories.length - entries.length} more categories`)
  }
  lines.push('```')
  return lines.join('\n')
}

export function formatDatasetSummary(dataset: StoredDataset, companionUrl?: string): string {
  const cols = dataset.columns
    .map(c => `- \`${c.name}\` (${c.type}, ${c.distinctCount} distinct; e.g. ${c.sampleValues.slice(0, 3).join(', ')})`)
    .join('\n')

  const chartBlock = formatTerminalChart(dataset, dataset.chartConfig)
  const rowHeadline = dataset.truncatedForFreeTier
    ? `**${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows (Free tier limit)**`
    : `**${dataset.rows.length.toLocaleString()} rows**`
  const parts = [
    `Loaded dataset **${dataset.name}** (\`${dataset.id}\`) — ${rowHeadline}, ${dataset.columns.length} columns.`,
    `Source: ${dataset.source}`,
  ]

  if (dataset.truncatedForFreeTier) {
    parts.push(
      '',
      `> **Notice (Free tier row limit):** Showing the first **${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows**. Charts, pivots, and totals reflect this ${dataset.rows.length.toLocaleString()}-row subset only. Set \`TINYPIVOT_LICENSE_KEY\` for full unlimited rows: https://tiny-pivot.com/mcp`,
    )
  }

  if (chartBlock) {
    parts.push('', chartBlock)
  }

  parts.push('', 'Columns:', cols || '(no columns)')

  if (companionUrl) {
    parts.push('', `Interactive Data IDE (live-updating): ${companionUrl}`)
  }

  return parts.join('\n')
}

export function formatPivotSummary(dataset: StoredDataset, config: PivotConfig, companionUrl?: string): string {
  const result = computePivotResult(dataset.rows, config)
  if (!result || result.rowHeaders.length === 0) {
    return `Configured pivot on **${dataset.name}**, but no rows matched.`
  }

  const maxRows = 20
  const maxCols = 10
  const rowFieldHeader = config.rowFields.join(' / ') || 'Row'
  const totalCols = result.data[0]?.length ?? 0
  const visibleCols = Math.min(totalCols, maxCols)
  const colHeaders: string[] = []
  for (let c = 0; c < visibleCols; c++) {
    const parts = result.headers.map(level => level[c]).filter(Boolean)
    colHeaders.push(parts.join(' · ') || `Col ${c + 1}`)
  }
  const headerCells = [rowFieldHeader, ...colHeaders, ...(config.showRowTotals ? ['Total'] : [])]

  const lines: string[] = [
    dataset.truncatedForFreeTier
      ? `Pivot on **${dataset.name}** (**first ${dataset.rows.length.toLocaleString()} of ${dataset.sourceTotalRows.toLocaleString()} rows — Free tier subset**):`
      : `Pivot on **${dataset.name}** (${dataset.rows.length.toLocaleString()} source rows):`,
    '',
    `| ${headerCells.join(' | ')} |`,
    `| ${headerCells.map(() => '---').join(' | ')} |`,
  ]

  const visibleRows = Math.min(result.rowHeaders.length, maxRows)
  for (let r = 0; r < visibleRows; r++) {
    const label = result.rowHeaders[r].join(' / ')
    const vals = result.data[r].slice(0, visibleCols).map(cell => cell.formattedValue || '—')
    const total = config.showRowTotals && result.rowTotals[r] ? [result.rowTotals[r].formattedValue] : []
    lines.push(`| ${[label, ...vals, ...total].join(' | ')} |`)
  }

  if (result.rowHeaders.length > maxRows) {
    lines.push(`_…and ${result.rowHeaders.length - maxRows} more rows visible interactively in TinyPivot._`)
  }

  if (config.showColumnTotals && result.grandTotal) {
    lines.push('', `**Grand Total:** ${result.grandTotal.formattedValue}`)
  }

  if (companionUrl) {
    lines.push('', `Interactive Data IDE (live-updating): ${companionUrl}`)
  }

  return lines.join('\n')
}
