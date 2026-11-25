import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'
import { INTERACTIVE_ROW_LIMIT, ROW_PAGE_SIZE } from '../../packages/mcp/src/limits'

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

async function connectClient(capabilities: Record<string, unknown>, name = 'test-host') {
  const { server } = createTinyPivotMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name, version: '1.0.0' }, { capabilities })
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

    it('tells the model the user already sees the view, so it does not repeat the card', async () => {
      const client = await connectClient(uiCapabilities)
      const result = await client.callTool({ name: 'load_data', arguments: LOAD_ARGS })
      const text = (result.content as Array<{ text: string }>)[0].text

      expect(text).toContain('do not repeat the card')
      expect(text).not.toContain('Show the card above to the user verbatim.')
    })

    it('tells pi not to repeat the card its TinyPivot extension already draws', async () => {
      const client = await connectClient({}, 'pi')
      const result = await client.callTool({ name: 'load_data', arguments: LOAD_ARGS })
      const text = (result.content as Array<{ text: string }>)[0].text

      expect(text).toContain('pi extension already shows the user this card')
      expect(text).not.toContain('Show the card above to the user verbatim.')
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

describe('paging a large dataset into the widget', () => {
  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('serves rows page by page so the widget can load past its first request', async () => {
    const total = ROW_PAGE_SIZE + 40
    const { server } = createTinyPivotMcpServer({ licenseKey: 'TP-MCPP-TESTKEY1-20991231' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/ui': {} } } })
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    await client.callTool({
      name: 'load_data',
      arguments: { name: 'big', rows: Array.from({ length: total }, (_, i) => ({ id: i, mrr: i % 9 })) },
    })
    const page = async (offset: number) => (await client.callTool({
      name: 'fetch_dataset_rows',
      arguments: { offset, limit: ROW_PAGE_SIZE },
    })).structuredContent as { rows: Array<{ id: number }>, totalRows: number }

    const first = await page(0)
    const second = await page(ROW_PAGE_SIZE)
    expect(first.totalRows).toBe(total)
    expect(first.rows).toHaveLength(ROW_PAGE_SIZE)
    expect(second.rows.map(row => row.id)).toEqual(Array.from({ length: 40 }, (_, i) => ROW_PAGE_SIZE + i))
    expect(INTERACTIVE_ROW_LIMIT).toBeGreaterThanOrEqual(ROW_PAGE_SIZE)
  })
})

describe('what TinyPivot costs on every request', () => {
  /** Characters over 4: close enough to compare sizes, which is all these tests do. */
  const roughTokens = (value: unknown) => Math.round(JSON.stringify(value).length / 4)

  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    vi.stubEnv('DATABASE_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps tool definitions and instructions small', async () => {
    const client = await connectClient({})
    const { tools } = await client.listTools()
    const definitions = tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }))

    expect(roughTokens(definitions) + roughTokens(client.getInstructions())).toBeLessThan(2_500)
  })

  it('lists the Postgres tool only when a database is configured', async () => {
    const names = async () => (await (await connectClient({})).listTools()).tools.map(tool => tool.name)
    expect(await names()).not.toContain('query_postgres')

    vi.stubEnv('DATABASE_URL', 'postgres://reader@localhost:5432/analytics')
    expect(await names()).toContain('query_postgres')
  })

  it('does not ask the model for its own name on every call', async () => {
    const { tools } = await (await connectClient({})).listTools()
    for (const tool of tools)
      expect(Object.keys(tool.inputSchema.properties ?? {}), tool.name).not.toContain('model')
  })

  it('tells the model not to reprint cards when that setting is off', async () => {
    vi.stubEnv('TINYPIVOT_REPRINT_CARDS', '0')
    const client = await connectClient({})
    expect(client.getInstructions()).toContain('Do not reprint')
    expect(client.getInstructions()).not.toContain('show the returned')
  })
})

describe('small tables in replies', () => {
  it('still link to the Studio, so a pi session can find it', async () => {
    const { formatDatasetSummary } = await import('../../packages/mcp/src/summary')
    const { DatasetStore } = await import('../../packages/mcp/src/store')
    const ds = new DatasetStore().register({ name: 'Top', source: 'test', rows: [{ country: 'US', mrr: 10 }, { country: 'CA', mrr: 8 }], viewMode: 'grid' })
    const text = formatDatasetSummary(ds, 'http://127.0.0.1:47317')
    expect(text).toContain('| country | mrr |')
    expect(text).toContain('Studio: http://127.0.0.1:47317')
  })
})

describe('the theme slash command', () => {
  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
    vi.stubEnv('TINYPIVOT_LICENSE_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is listed as a prompt and completes theme names', async () => {
    const client = await connectClient({})
    expect((await client.listPrompts()).prompts.map(prompt => prompt.name)).toContain('theme')

    const completion = await client.complete({ ref: { type: 'ref/prompt', name: 'theme' }, argument: { name: 'name', value: 'crt' } })
    expect(completion.completion.values).toEqual(['crt-amber', 'crt-green'])
  })

  it('lists the themes when none is named, and needs Pro for the extra ones', async () => {
    const client = await connectClient({})
    const textOf = async (args: Record<string, string>) => {
      const { messages } = await client.getPrompt({ name: 'theme', arguments: args })
      return (messages[0].content as { text: string }).text
    }

    expect(await textOf({})).toContain('paper, greenbar, onebit')
    expect(await textOf({ name: 'Paper' })).toContain('require TinyPivot Pro')
  })
})
