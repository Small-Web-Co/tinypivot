import type { BigQueryClientLike, BigQueryConfig, BigQueryJobLike, TableReference } from '../../packages/mcp/src/bigquery'
import type { DuckDbRunner } from '../../packages/mcp/src/duckdb'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bigQueryConfigFromEnv,
  bigQueryConnector,
  checkDryRun,
  formatBytes,
  isAllowedTable,
  toBigQueryPlainValue,
} from '../../packages/mcp/src/bigquery'
import { HistoryStore } from '../../packages/mcp/src/history'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { warehousesFromEnv } from '../../packages/mcp/src/server'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'
import { QueryRefused } from '../../packages/mcp/src/warehouse'
import { installTestLicenseKeypair } from '../helpers/license'

const CONFIG: BigQueryConfig = {
  projectId: 'acme-analytics',
  maxBytes: 10_000_000_000,
  maxRows: 3,
  timeoutMs: 5_000,
}

const ORDERS: TableReference = { projectId: 'acme-analytics', datasetId: 'sales', tableId: 'orders' }

interface FakeOptions {
  statementType?: string
  bytes?: number
  tables?: TableReference[]
  rows?: Record<string, unknown>[]
}

/** Stands in for Google's client: answers dry runs from `options`, real runs with `rows`. */
function fakeClient(options: FakeOptions = {}) {
  const jobs: Array<Record<string, unknown>> = []
  const client: BigQueryClientLike = {
    async createQueryJob(jobOptions) {
      jobs.push(jobOptions)
      const job: BigQueryJobLike = {
        metadata: jobOptions.dryRun
          ? { statistics: { query: { statementType: options.statementType ?? 'SELECT', totalBytesProcessed: String(options.bytes ?? 2_500_000), referencedTables: options.tables ?? [ORDERS] } } }
          : {},
        async getQueryResults({ maxResults }) {
          return [(options.rows ?? []).slice(0, maxResults)]
        },
      }
      return [job]
    },
    async getDatasets() {
      return [[{ id: 'sales' }, { id: 'marketing' }]]
    },
    dataset(id) {
      return { getTables: async () => [[{ id: id === 'sales' ? 'orders' : 'campaigns' }]] }
    },
  }
  return { client, jobs }
}

describe('bigQuery connector', () => {
  it('runs a dry run first, then the query with the scan cap set on the job', async () => {
    const { client, jobs } = fakeClient({ rows: [{ region: 'EMEA', mrr: 120 }] })
    const result = await bigQueryConnector(CONFIG, async () => client).query('SELECT region, SUM(mrr) AS mrr FROM sales.orders GROUP BY 1;')

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ dryRun: true, useLegacySql: false })
    expect(jobs[0].query).not.toContain(';')
    expect(jobs[1]).toMatchObject({ maximumBytesBilled: '10000000000', labels: { client: 'tinypivot' } })
    expect(jobs[1].dryRun).toBeUndefined()
    expect(result).toEqual({ rows: [{ region: 'EMEA', mrr: 120 }], truncated: false, note: 'BigQuery scanned 2.5 MB (limit 10 GB).' })
  })

  it('refuses anything but a single SELECT before running it', async () => {
    for (const statementType of ['INSERT', 'DELETE', 'CREATE_TABLE', 'SCRIPT']) {
      const { client, jobs } = fakeClient({ statementType })
      await expect(bigQueryConnector(CONFIG, async () => client).query('SELECT 1')).rejects.toThrow(`read this as ${statementType}`)
      expect(jobs).toHaveLength(1)
    }
  })

  it('refuses writes by their text before asking BigQuery for anything', async () => {
    const { client, jobs } = fakeClient({ statementType: 'SELECT' })
    await expect(bigQueryConnector(CONFIG, async () => client).query('DELETE FROM sales.orders WHERE true')).rejects.toBeInstanceOf(QueryRefused)
    expect(jobs).toHaveLength(0)
  })

  it('refuses a query that would scan more than the limit', () => {
    expect(() => checkDryRun({ query: { statementType: 'SELECT', totalBytesProcessed: '12000000000' } }, CONFIG))
      .toThrow('would scan 12 GB, over the 10 GB limit')
  })

  it('marks a cut result as truncated and keeps only the row limit', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const result = await bigQueryConnector(CONFIG, async () => fakeClient({ rows }).client).query('SELECT id FROM sales.orders')
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(3)
  })

  it('only reads allowed tables when an allowlist is set', () => {
    expect(isAllowedTable(ORDERS, undefined, 'acme-analytics')).toBe(true)
    expect(isAllowedTable(ORDERS, ['sales'], 'acme-analytics')).toBe(true)
    expect(isAllowedTable(ORDERS, ['sales.orders'], 'acme-analytics')).toBe(true)
    expect(isAllowedTable(ORDERS, ['acme-analytics.sales.orders'], 'other')).toBe(true)
    expect(isAllowedTable(ORDERS, ['marketing'], 'acme-analytics')).toBe(false)
    expect(isAllowedTable({ ...ORDERS, projectId: 'someone-else' }, ['sales'], 'acme-analytics')).toBe(false)
    expect(() => checkDryRun({ query: { statementType: 'SELECT', referencedTables: [ORDERS] } }, { ...CONFIG, allowed: ['marketing'] }))
      .toThrow('`acme-analytics.sales.orders` is not in TINYPIVOT_BIGQUERY_ALLOWED')
  })

  it('lists tables from the allowlist, or from every dataset', async () => {
    const { client } = fakeClient()
    expect(await bigQueryConnector(CONFIG, async () => client).listTables()).toEqual(['sales.orders', 'marketing.campaigns'])
    expect(await bigQueryConnector({ ...CONFIG, allowed: ['sales'] }, async () => client).listTables()).toEqual(['sales.orders'])
    expect(await bigQueryConnector({ ...CONFIG, allowed: ['sales.orders'] }, async () => client).listTables()).toEqual(['sales.orders'])
  })

  it('turns BigQuery values into plain numbers and strings', () => {
    class Big {
      constructor(private readonly v: string) {}
      toString() {
        return this.v
      }
    }
    expect(toBigQueryPlainValue({ value: '2026-03-01' })).toBe('2026-03-01')
    expect(toBigQueryPlainValue(new Big('1234.50'))).toBe(1234.5)
    expect(toBigQueryPlainValue(42)).toBe(42)
    expect(toBigQueryPlainValue(null)).toBeNull()
    expect(toBigQueryPlainValue(['a', 'b'])).toBe('["a","b"]')
  })

  it('is configured from the environment only when a project is set', () => {
    expect(bigQueryConfigFromEnv({})).toBeUndefined()
    expect(bigQueryConfigFromEnv({ TINYPIVOT_BIGQUERY_PROJECT: 'acme', TINYPIVOT_BIGQUERY_MAX_GB: '5', TINYPIVOT_BIGQUERY_ALLOWED: 'sales, marketing.campaigns' }))
      .toMatchObject({ projectId: 'acme', maxBytes: 5_000_000_000, allowed: ['sales', 'marketing.campaigns'] })
    expect(bigQueryConfigFromEnv({ TINYPIVOT_BIGQUERY_PROJECT: 'acme', TINYPIVOT_BIGQUERY_MAX_GB: 'lots' })?.maxBytes).toBe(50_000_000_000)
    expect(warehousesFromEnv({ TINYPIVOT_BIGQUERY_PROJECT: 'acme', DATABASE_URL: 'postgres://x' }).map(w => w.toolName))
      .toEqual(['query_postgres', 'query_bigquery'])
  })

  it('formats byte counts for people', () => {
    expect(formatBytes(950)).toBe('950 B')
    expect(formatBytes(2_500_000)).toBe('2.5 MB')
    expect(formatBytes(50_000_000_000)).toBe('50 GB')
  })
})

describe('query_bigquery tool', () => {
  let signer: ReturnType<typeof installTestLicenseKeypair>
  let dir: string

  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    signer = installTestLicenseKeypair()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-warehouse-'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    signer.restore()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  /** DuckDB that fails if asked to run anything: warehouse SQL must never run locally. */
  const noLocalDuck = { run: async () => { throw new Error('ran in local DuckDB') } } as unknown as DuckDbRunner

  async function connect(licenseKey: string | undefined, options: FakeOptions = {}, studio?: Studio) {
    const fake = fakeClient(options)
    const { server } = createTinyPivotMcpServer({
      licenseKey,
      ...(studio ? { store: studio.store, studio } : {}),
      warehouses: [bigQueryConnector(CONFIG, async () => fake.client)],
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return { client, jobs: fake.jobs }
  }

  const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
    (result.content as Array<{ text: string }>).map(part => part.text).join('\n')

  it('is listed only when a BigQuery project is configured', async () => {
    const { client } = await connect(undefined)
    const tool = (await client.listTools()).tools.find(t => t.name === 'query_bigquery')
    expect(tool?.description).toMatch(/^Run a read-only SELECT in BigQuery/)
    expect(warehousesFromEnv({})).toEqual([])
  })

  it('tells Free users how to use the data without running anything', async () => {
    const { client, jobs } = await connect(undefined)
    const result = await client.callTool({ name: 'query_bigquery', arguments: { sql: 'SELECT 1', why: 'test' } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('bq query --format=csv')
    expect(jobs).toHaveLength(0)
  })

  it('charts the result for Pro and says what the query scanned', async () => {
    const rows = [{ region: 'EMEA', mrr: 120 }, { region: 'APAC', mrr: 80 }]
    const { client } = await connect(signer.signLicense('MCPP'), { rows })
    const result = await client.callTool({
      name: 'query_bigquery',
      arguments: { sql: 'SELECT region, SUM(mrr) AS mrr FROM sales.orders GROUP BY 1', why: 'MRR by region' },
    })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toContain('BigQuery scanned 2.5 MB')
  })

  it('tells the model to aggregate in BigQuery when the result is cut', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i, mrr: i }))
    const { client } = await connect(signer.signLicense('MCPP'), { rows })
    const result = await client.callTool({ name: 'query_bigquery', arguments: { sql: 'SELECT id, mrr FROM sales.orders', why: 'rows' } })
    expect(text(result)).toContain('Aggregate in the BigQuery SQL')
  })

  it('reports BigQuery refusals as a tool error', async () => {
    const { client } = await connect(signer.signLicense('MCPP'), { statementType: 'DELETE' })
    const result = await client.callTool({ name: 'query_bigquery', arguments: { sql: 'SELECT 1', why: 'x' } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('BigQuery query failed: Only a single read-only SELECT')
  })

  it('re-checks a BigQuery step in BigQuery, not in the local DuckDB', async () => {
    const studio = new Studio(new DatasetStore(), { history: new HistoryStore({ dir }), duck: noLocalDuck })
    const rows = [{ region: 'EMEA', mrr: 120 }]
    const { client, jobs } = await connect(signer.signLicense('MCPP'), { rows }, studio)
    const sql = 'SELECT region, SUM(mrr) AS mrr FROM sales.orders GROUP BY 1'
    await client.callTool({ name: 'query_bigquery', arguments: { sql, why: 'MRR by region' } })

    const step = studio.recentSteps().at(-1)!
    expect(step).toMatchObject({ tool: 'query_bigquery', rows: 1 })
    expect(await studio.verifyStep(step.id)).toEqual([{ kind: 'rerun', ok: true, detail: 'Same 1 rows, same values.' }])
    // The query and its re-check; Pro audit probes are separate jobs.
    expect(jobs.filter(job => !job.dryRun && job.query === sql)).toHaveLength(2)
  })
})
