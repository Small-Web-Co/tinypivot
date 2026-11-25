import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'

const WIDGET_ONLY_TOOLS = ['fetch_dataset_rows', 'set_session_model', 'record_local_action', 'get_datasets_state']
const ROWS = Array.from({ length: 300 }, (_, i) => ({
  month: ['Jan', 'Feb', 'Mar'][i % 3],
  region: i % 2 ? 'EMEA' : 'APAC',
  mrr: 1000 + i,
}))
const LOAD_ARGS = {
  name: 'acme-orders',
  rows: ROWS,
  chartConfig: { type: 'bar', xAxisField: 'month', yAxisField: 'mrr', aggregation: 'sum' },
}

async function connectClient(capabilities: Record<string, unknown>) {
  const { server } = createTinyPivotMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

describe('what a data tool hands back depends on whether the host renders the widget', () => {
  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('terminal host with no MCP Apps support', () => {
    it('returns the text card alone, so the widget payload never reaches the model', async () => {
      const client = await connectClient({})
      const result = await client.callTool({ name: 'load_data', arguments: LOAD_ARGS })

      expect(result.structuredContent).toBeUndefined()
      const content = result.content as Array<{ type: string, text: string }>
      expect(content).toHaveLength(1)
      expect(content[0].text).toContain('```text')
      // 300 rows went in; the reply is a summary, not the rows.
      expect(JSON.stringify(result).length).toBeLessThan(6000)
      expect(JSON.stringify(result)).not.toContain('previewRows')
    })

    it('does not list the widget-only tools', async () => {
      const client = await connectClient({})
      const names = (await client.listTools()).tools.map(tool => tool.name)

      expect(names).toEqual(expect.arrayContaining(['load_data', 'load_file', 'configure_chart', 'configure_pivot']))
      for (const tool of WIDGET_ONLY_TOOLS)
        expect(names).not.toContain(tool)
    })
  })

  describe('host that renders MCP Apps', () => {
    const uiCapabilities = { extensions: { 'io.modelcontextprotocol/ui': {} } }

    it('includes the widget payload next to the text', async () => {
      const client = await connectClient(uiCapabilities)
      const result = await client.callTool({ name: 'load_data', arguments: LOAD_ARGS })
      const payload = result.structuredContent as { previewRows: unknown[], totalRows: number }

      expect(payload.totalRows).toBe(ROWS.length)
      expect(payload.previewRows.length).toBeGreaterThan(0)
      expect((result.content as Array<{ text: string }>)[0].text).toContain('acme-orders')
    })

    it('keeps the widget-only tools available', async () => {
      const client = await connectClient(uiCapabilities)
      const names = (await client.listTools()).tools.map(tool => tool.name)

      expect(names).toEqual(expect.arrayContaining(WIDGET_ONLY_TOOLS))
    })
  })
})

describe('the card a load answers with', () => {
  const textOf = (result: unknown) => ((result as { content: Array<{ text: string }> }).content[0].text)

  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is the pivot table when the load asks for a pivot and no chart', async () => {
    const client = await connectClient({})
    const result = await client.callTool({
      name: 'load_data',
      arguments: {
        name: 'acme-orders',
        rows: ROWS,
        pivotConfig: { rowFields: ['region'], columnFields: ['month'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
      },
    })

    expect(textOf(result)).toContain('│ region')
    expect(textOf(result)).toContain('Trend')
    expect(textOf(result)).toContain('Columns:')
  })

  it('is the chart when a chart is asked for, even alongside a pivot', async () => {
    const client = await connectClient({})
    const result = await client.callTool({
      name: 'load_data',
      arguments: {
        ...LOAD_ARGS,
        pivotConfig: { rowFields: ['region'], columnFields: ['month'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
      },
    })

    expect(textOf(result)).toContain('· Bar')
    expect(textOf(result)).not.toContain('Trend')
  })
})
