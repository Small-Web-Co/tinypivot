import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { StudioRun } from './runs'
import { runTitle } from './runs'

/**
 * Minimal, human-readable FYI description of the client-side JS/TS transformation
 * that shapes SQL rows into the rendered Chart or Pivot table, plus a Notebook Markdown exporter.
 */

export interface PipelineStepInfo {
  label: string
  value: string
}

export interface ChartPipelineSummary {
  /** Compact, scannable transformation steps shown as an FYI (Input -> Group -> Aggregate -> Sort -> Render). */
  steps: PipelineStepInfo[]
  /** Minimal read-only TypeScript snippet reproducing this chart/pivot in `@smallwebco/tinypivot-react`. */
  tsCode: string
}

const SORT_LABELS: Record<string, string> = {
  'value-desc': 'Descending by measure',
  'value-asc': 'Ascending by measure',
  'label-asc': 'Chronological / A–Z',
  'data': 'SQL row order',
}

export function describeChartPipeline(params: {
  datasetName: string
  rowCount: number
  columnCount: number
  viewMode: 'chart' | 'pivot' | 'grid'
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  filterFields?: string[]
}): ChartPipelineSummary {
  const { datasetName, rowCount, columnCount, viewMode, chartConfig, pivotConfig, filterFields } = params
  const steps: PipelineStepInfo[] = [
    {
      label: 'Input',
      value: `${datasetName} (${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}${columnCount ? ` × ${columnCount} cols` : ''})`,
    },
  ]

  if (filterFields?.length) {
    steps.push({ label: 'Filters', value: filterFields.join(', ') })
  }

  if (viewMode === 'pivot' && pivotConfig) {
    if (pivotConfig.rowFields?.length)
      steps.push({ label: 'Rows', value: pivotConfig.rowFields.join(' → ') })
    if (pivotConfig.columnFields?.length)
      steps.push({ label: 'Columns', value: pivotConfig.columnFields.join(' → ') })
    if (pivotConfig.valueFields?.length) {
      steps.push({
        label: 'Aggregate',
        value: pivotConfig.valueFields.map(v => `${v.aggregation}(${v.field})`).join(', '),
      })
    }
    steps.push({ label: 'Render', value: 'Pivot table (client-side aggregation)' })
  }
  else if (viewMode === 'chart' && chartConfig) {
    if (chartConfig.xAxis?.field)
      steps.push({ label: 'Group (X)', value: chartConfig.xAxis.field })
    if (chartConfig.yAxis?.field) {
      const agg = chartConfig.yAxis.aggregation ?? 'sum'
      steps.push({ label: 'Measure (Y)', value: `${agg}(${chartConfig.yAxis.field})` })
    }
    if (chartConfig.seriesField?.field)
      steps.push({ label: 'Series', value: chartConfig.seriesField.field })
    const sortKey = chartConfig.options?.sortOrder ?? 'value-desc'
    steps.push({ label: 'Sort', value: SORT_LABELS[sortKey] ?? sortKey })
    steps.push({
      label: 'Render',
      value: `${chartConfig.type ?? 'bar'} chart${chartConfig.options?.stacked ? ' (stacked)' : ''}`,
    })
  }
  else {
    steps.push({ label: 'Render', value: 'Data grid (no aggregation)' })
  }

  const tsCode = buildReactSnippet({ datasetName, viewMode, chartConfig, pivotConfig, filterFields })
  return { steps, tsCode }
}

/** Builds a compact, copyable React + TypeScript snippet reproducing the active chart/pivot. */
export function buildReactSnippet(params: {
  datasetName: string
  viewMode: 'chart' | 'pivot' | 'grid'
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  filterFields?: string[]
}): string {
  const { datasetName, viewMode, chartConfig, pivotConfig, filterFields } = params
  const spec = viewMode === 'pivot'
    ? pivotConfig
    : viewMode === 'chart'
      ? chartConfig
      : undefined
  const specName = viewMode === 'pivot' ? 'pivotConfig' : 'chartConfig'

  const lines: Array<string | null> = [
    `// Client-side JS/TS spec for "${datasetName}"`,
    spec ? `const ${specName} = ${JSON.stringify(spec, null, 2)} as const` : null,
    filterFields?.length ? `const filterFields = ${JSON.stringify(filterFields)}` : null,
    '',
    `<DataGrid`,
    `  data={rows}`,
    `  viewMode="${viewMode}"`,
    spec ? `  ${specName}={${specName}}` : null,
    filterFields?.length ? `  filterFields={filterFields}` : null,
    `/>`,
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}

/** Exports the entire Studio session train of thought as a clean Markdown notebook. */
export function exportNotebookMarkdown(runs: StudioRun[]): string {
  const lines: string[] = [
    '# TinyPivot Studio Notebook',
    '',
    `_Exported ${new Date().toLocaleString()}_`,
    '',
  ]

  runs.forEach((run, index) => {
    lines.push(`## ${index + 1}. ${runTitle(run)}`, '')
    const answer = [...run.steps].reverse().find(s => s.tool === 'reply')
    if (answer?.why) {
      lines.push(answer.why, '')
    }
    const outputs = run.steps.filter(s => s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile')
    for (const step of outputs) {
      const label = step.datasetName ?? step.why ?? step.tool
      const meta = [step.view, typeof step.rows === 'number' ? `${step.rows.toLocaleString()} rows` : null, step.editedAt ? 'edited' : null]
        .filter(Boolean)
        .join(' · ')
      lines.push(`### ${label}${meta ? ` (${meta})` : ''}`, '')
      const sql = step.formattedSql ?? step.editableSql ?? step.sql
      if (sql) {
        lines.push('```sql', sql.trim(), '```', '')
      }
      if (step.chartConfig || step.pivotConfig) {
        const spec = step.viewMode === 'pivot' ? step.pivotConfig : step.chartConfig
        if (spec) {
          lines.push('```json', JSON.stringify(spec, null, 2), '```', '')
        }
      }
    }
  })

  return lines.join('\n')
}
