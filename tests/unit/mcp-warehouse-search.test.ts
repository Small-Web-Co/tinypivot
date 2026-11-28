import type { WarehouseConnector, WarehouseTableSchema } from '../../packages/mcp/src/warehouse'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { backtickName } from '../../packages/mcp/src/warehouse'
import { createWarehouseSessionCache, profileWarehouse } from '../../packages/mcp/src/warehouse-profile'
import { rankWarehouseSchemas, tokenizeIdentifier } from '../../packages/mcp/src/warehouse-search'

function makeEnterpriseCatalog(): WarehouseTableSchema[] {
  const schemas: WarehouseTableSchema[] = [
    {
      name: 'billing.subscription_mrr_daily',
      rowCount: 1_500_000,
      columns: [
        { name: 'subscription_id', type: 'STRING' },
        { name: 'account_id', type: 'STRING' },
        { name: 'mrr_usd', type: 'NUMERIC' },
        { name: 'churn_reason', type: 'STRING' },
        { name: 'snapshot_date', type: 'DATE' },
      ],
    },
    {
      name: 'billing.invoices',
      rowCount: 420_000,
      columns: [
        { name: 'invoice_id', type: 'STRING' },
        { name: 'account_id', type: 'STRING' },
        { name: 'amount_due', type: 'NUMERIC' },
        { name: 'currency', type: 'STRING' },
      ],
    },
    {
      name: 'marketing.ad_spend_daily',
      rowCount: 95_000,
      columns: [
        { name: 'campaign_id', type: 'STRING' },
        { name: 'channel', type: 'STRING' },
        { name: 'impressions', type: 'INT64' },
        { name: 'clicks', type: 'INT64' },
        { name: 'spend_usd', type: 'NUMERIC' },
      ],
    },
  ]
  for (let i = 0; i < 497; i++) {
    schemas.push({
      name: `ops_archive.sensor_log_${i}`,
      rowCount: 10_000 + i,
      columns: [
        { name: 'sensor_id', type: 'STRING' },
        { name: 'reading_value', type: 'FLOAT64' },
        { name: 'recorded_at', type: 'TIMESTAMP' },
      ],
    })
  }
  return schemas
}

describe('warehouse BM25 catalog search', () => {
  it('tokenizes snake_case, camelCase, and dotted table identifiers cleanly', () => {
    expect(tokenizeIdentifier('billing.subscriptionMrr_daily')).toEqual(['billing', 'subscription', 'mrr', 'daily'])
  })

  it('finds the right tables in a 500-table warehouse via BM25', () => {
    const catalog = makeEnterpriseCatalog()
    const hits = rankWarehouseSchemas(catalog, 'churn mrr subscription', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].schema.name).toBe('billing.subscription_mrr_daily')
    expect(hits[0].matchedColumns).toContain('churn_reason')
  })

  it('supports profile(warehouse, query="...") on Free tier with 0 data scans', async () => {
    const catalog = makeEnterpriseCatalog()
    const queries: string[] = []
    const connector: WarehouseConnector = {
      id: 'bigquery',
      label: 'BigQuery',
      toolName: 'query_bigquery',
      sqlHint: 'GoogleSQL',
      freeAlternative: 'export with bq',
      maxRows: 5000,
      concurrent: true,
      dialect: { quoteName: backtickName },
      listTables: async () => catalog.map(s => s.name),
      describeTables: async () => catalog,
      query: async (sql) => {
        queries.push(sql)
        return { rows: [], truncated: false }
      },
    }

    // Direct helper on Free: 0 SQL probes, finds top matching table out of 500
    const out = await profileWarehouse(connector, {
      query: 'ad spend clicks impressions',
      isPro: false,
      cache: createWarehouseSessionCache(),
    })
    expect(queries).toHaveLength(0)
    expect(out).toContain('Matched 1 of 500 **BigQuery** tables for "ad spend clicks impressions"')
    expect(out).toContain('`marketing.ad_spend_daily`')

    // End-to-end MCP tool call on Free tier (no license key)
    const { server } = createTinyPivotMcpServer({ warehouses: [connector] })
    const [ct, st] = InMemoryTransport.createLinkedPair()
    await server.connect(st)
    const client = new Client({ name: 'test-free', version: '1.0.0' })
    await client.connect(ct)

    const res = await client.callTool({
      name: 'profile',
      arguments: { warehouse: 'bigquery', query: 'subscription mrr churn' },
    })
    expect(res.isError).toBeFalsy()
    const txt = (res.content as Array<{ text?: string }>).map(c => c.text ?? '').join('\n')
    expect(txt).toContain('`billing.subscription_mrr_daily`')
    await client.close()
  })
})
