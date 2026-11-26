import type { DuckDbRunner } from '../../packages/mcp/src/duckdb'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildReactSnippet,
  describeChartPipeline,
  exportNotebookMarkdown,
} from '../../packages/mcp/app/chartTransform'
import { HistoryStore } from '../../packages/mcp/src/history'
import { groupRuns } from '../../packages/mcp/src/runs'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'

const SAMPLE_ROWS = [
  { region: 'West', revenue: 120, units: 10 },
  { region: 'East', revenue: 80, units: 6 },
  { region: 'South', revenue: 40, units: 3 },
  { region: 'North', revenue: 200, units: 15 },
]

describe('minimal read-only Chart JS FYI & Notebook Markdown export', () => {
  it('describes a chart pipeline cleanly in human-readable steps + copyable TS', () => {
    const summary = describeChartPipeline({
      datasetName: 'Revenue by Region',
      rowCount: 4,
      columnCount: 3,
      viewMode: 'chart',
      chartConfig: {
        type: 'bar',
        xAxis: { field: 'region', role: 'dimension' },
        yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
        options: { sortOrder: 'value-desc' },
      },
      filterFields: ['region'],
    })

    expect(summary.steps.map(s => s.label)).toEqual(['Input', 'Filters', 'Group (X)', 'Measure (Y)', 'Sort', 'Render'])
    expect(summary.steps.find(s => s.label === 'Measure (Y)')?.value).toBe('sum(revenue)')
    expect(summary.tsCode).toContain('<DataGrid')
    expect(summary.tsCode).toContain('chartConfig')
  })

  it('describes a pivot pipeline cleanly and exports Notebook Markdown', () => {
    const pivotSummary = describeChartPipeline({
      datasetName: 'Sales Pivot',
      rowCount: 48,
      columnCount: 5,
      viewMode: 'pivot',
      pivotConfig: {
        rowFields: ['region'],
        columnFields: ['quarter'],
        valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      },
    })
    expect(pivotSummary.steps.some(s => s.label === 'Rows' && s.value === 'region')).toBe(true)
    expect(pivotSummary.steps.some(s => s.label === 'Aggregate' && s.value === 'sum(revenue)')).toBe(true)

    const snippet = buildReactSnippet({
      datasetName: 'Sales Pivot',
      viewMode: 'pivot',
      pivotConfig: { rowFields: ['region'] },
    })
    expect(snippet).toContain('pivotConfig')

    const runs = groupRuns([
      {
        id: 's1',
        at: new Date().toISOString(),
        actor: 'agent',
        tool: 'query',
        ask: 'Top regions?',
        datasetName: 'Regions',
        sql: 'SELECT * FROM sales',
        chartConfig: { type: 'bar' },
        rows: 4,
        view: 'bar chart',
      },
      { id: 's2', at: new Date().toISOString(), actor: 'agent', tool: 'reply', ask: 'Top regions?', why: '**North** leads with **$200**.' },
    ])
    const md = exportNotebookMarkdown(runs)
    expect(md).toContain('## 1. Top regions?')
    expect(md).toContain('```sql')
    expect(md).toContain('```json')
  })
})

describe('studio SQL step edits, revision history, and preservation across chat turns', () => {
  it('maintains user SQL edits on an earlier step when new chat turns arrive, and supports lossless restore', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-studio-rev-'))
    try {
      const store = new DatasetStore()
      const history = new HistoryStore({ dir, enabled: true })
      const fakeDuck = {
        run: async (sql: string) => ({
          rows: sql.includes('LIMIT 2') ? SAMPLE_ROWS.slice(0, 2) : SAMPLE_ROWS,
          truncated: false,
        }),
      } as unknown as DuckDbRunner

      const studio = new Studio(store, { history, duck: fakeDuck, sessionId: 'rev-test' })
      const ds1 = store.register({ id: 'q1', name: 'Regions', source: 'SELECT * FROM sales', rows: SAMPLE_ROWS, viewMode: 'chart' })
      const step1 = studio.recordDatasetStep(ds1, { actor: 'agent', tool: 'query', ask: 'Show regions', sql: 'SELECT * FROM sales' })
      studio.reply('North leads with $200.')

      // User edits step 1 SQL in place
      const updated = await studio.updateStepSql(step1.id, 'SELECT * FROM sales LIMIT 2')
      expect(updated.step.id).toBe(step1.id)
      expect(updated.step.sql).toBe('SELECT * FROM sales LIMIT 2')
      expect(updated.step.rows).toBe(2)
      expect(updated.step.revisions).toHaveLength(1)
      expect(updated.step.revisions?.[0].sql).toBe('SELECT * FROM sales')

      // Subsequent chat turn arrives from agent — step 1's SQL edit & revisions remain intact!
      const ds2 = store.register({ id: 'q2', name: 'Units', source: 'SELECT region, units FROM sales', rows: SAMPLE_ROWS, viewMode: 'chart' })
      studio.recordDatasetStep(ds2, { actor: 'agent', tool: 'query', ask: 'Now show units', sql: 'SELECT region, units FROM sales' })
      studio.reply('North has 15 units.')

      const snap = studio.snapshot()
      const preserved = snap.steps.find(s => s.id === step1.id)
      expect(preserved?.sql).toBe('SELECT * FROM sales LIMIT 2')
      expect(preserved?.revisions?.length).toBe(1)

      // Non-mutating Notebook hydration fetches step 1's edited rows cleanly
      const hydrated = await studio.getStepDataset(step1.id)
      expect(hydrated.dataset.rows).toHaveLength(2)

      // Restore step 1 back to revision 0 (original SQL)
      const restored = await studio.restoreStepRevision(step1.id, 0)
      expect(restored.step.sql).toBe('SELECT * FROM sales')
      expect(restored.step.rows).toBe(4)
      expect(restored.step.revisions?.length).toBe(2)
    }
    finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
