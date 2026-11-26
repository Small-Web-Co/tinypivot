// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildStandaloneHtmlReport } from '../../packages/mcp/src/export-html'
import { HistoryStore } from '../../packages/mcp/src/history'
import { buildStepLineage, extractSqlLineage } from '../../packages/mcp/src/lineage'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'

describe('proof-of-work lineage & aggregation tracing', () => {
  it('extracts source tables, joins, WHERE filters, GROUP BY keys, and SQL aggregations while ignoring CTE names', () => {
    const sql = `
      WITH filtered AS (
        SELECT region, revenue, units
        FROM sales_q4
        JOIN regions_dim ON sales_q4.region = regions_dim.region
        WHERE revenue > 100 AND quarter = 'Q4'
      )
      SELECT region,
             ROUND(SUM(revenue), 2) AS total_rev,
             AVG(units) AS avg_units,
             COUNT(*) AS tx_count
      FROM filtered
      GROUP BY region
      ORDER BY total_rev DESC
    `
    const info = extractSqlLineage(sql)
    expect(info.sources).toEqual(['sales_q4', 'regions_dim'])
    expect(info.joins).toEqual(['regions_dim'])
    expect(info.whereClause).toContain('revenue > 100')
    expect(info.groupBy).toEqual(['region'])
    expect(info.aggregations).toEqual([
      'ROUND(SUM(revenue), 2) AS total_rev',
      'AVG(units) AS avg_units',
      'COUNT(*) AS tx_count',
    ])

    const singleArgRound = extractSqlLineage('SELECT region, ROUND(SUM(revenue)) AS revenue, SUM(units) AS units FROM sales_q4 GROUP BY region')
    expect(singleArgRound.aggregations).toEqual(['ROUND(SUM(revenue)) AS revenue', 'SUM(units) AS units'])
  })

  it('links aggregated steps back to upstream underlying rows and includes full lineage in offline HTML export', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-lineage-'))
    try {
      const history = new HistoryStore({ dir: tmpDir, enabled: true })
      const store = new DatasetStore()
      const rawRows = [
        { order_id: 1, region: 'West', revenue: 100 },
        { order_id: 2, region: 'West', revenue: 150 },
        { order_id: 3, region: 'East', revenue: 80 },
      ]
      const aggRows = [
        { region: 'West', total_rev: 250, orders: 2 },
        { region: 'East', total_rev: 80, orders: 1 },
      ]

      const rawDs = store.register({ id: 'raw_orders', name: 'Raw Orders', source: 'orders.csv', rows: rawRows, viewMode: 'grid' })
      const aggDs = store.register({
        id: 'region_totals',
        name: 'Revenue by Region',
        source: 'duckdb://query',
        rows: aggRows,
        viewMode: 'chart',
        chartConfig: {
          type: 'bar',
          xAxis: { field: 'region', role: 'dimension' },
          yAxis: { field: 'total_rev', role: 'measure', aggregation: 'sum' },
          options: { title: 'Revenue by Region', sortOrder: 'value-desc' },
        },
      })

      const studio = new Studio(store, { history, sessionId: 'lineage-proof' })
      studio.remember(rawDs, { kind: 'data', source: 'orders.csv' })
      const stepRaw = studio.recordDatasetStep(rawDs, { actor: 'agent', tool: 'load_file', ask: 'Revenue by region', file: '/tmp/orders.csv' })
      studio.remember(aggDs, { kind: 'query', source: 'SELECT region, SUM(revenue) AS total_rev, COUNT(*) AS orders FROM raw_orders GROUP BY region' })
      const stepAgg = studio.recordDatasetStep(aggDs, {
        actor: 'agent',
        tool: 'query',
        ask: 'Revenue by region',
        sql: 'SELECT region, SUM(revenue) AS total_rev, COUNT(*) AS orders FROM raw_orders GROUP BY region',
      })

      const lineage = buildStepLineage(stepAgg, studio.recentSteps())
      expect(lineage.upstreamSteps.map(s => s.id)).toEqual([stepRaw.id])
      expect(lineage.nodes.find(n => n.stage === 'source')?.summary).toContain('Raw Orders (3 rows)')
      expect(lineage.nodes.find(n => n.stage === 'sql')?.summary).toContain('GROUP BY region')
      expect(lineage.nodes.find(n => n.stage === 'dataframe')?.summary).toBe('3 → 2 rows')
      expect(lineage.nodes.find(n => n.stage === 'visual')?.summary).toBe('bar: sum(total_rev) by region')
      expect(lineage.nodes.find(n => n.stage === 'proof')?.summary).toMatch(/^#[0-9a-f]{8}$/)

      const html = await buildStandaloneHtmlReport(studio, { theme: 'paper' })
      expect(html).toContain('Raw Orders (3 rows)')
      expect(html).toContain('GROUP BY region')
      expect(html).toContain('3 → 2 rows')
      expect(html).toContain('Underlying Source Rows — Raw Orders')
      expect(html).toContain('order_id')
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
