/**
 * MCP chart tools accept the D3 chart types by id or loose name, explain them in
 * text, and fall back to the nearest terminal card with a note.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTinyPivotMcpServer } from '../../packages/mcp/src/index'

const ROWS = [
  { country: 'France', rep: 'Avery', bookings: 300, quota: 250, year: 2025 },
  { country: 'Germany', rep: 'Blake', bookings: 120, quota: 200, year: 2025 },
  { country: 'Brazil', rep: 'Casey', bookings: 90, quota: 100, year: 2026 },
  { country: 'Atlantis', rep: 'Devon', bookings: 40, quota: 80, year: 2026 },
]

async function connect() {
  const { server } = createTinyPivotMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'terminal-host', version: '1.0.0' }, { capabilities: {} })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as Array<{ text: string }>).map(c => c.text).join('\n')
}

describe('d3 chart types over MCP', () => {
  beforeEach(() => {
    vi.stubEnv('TINYPIVOT_TELEMETRY', '0')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('accepts a loose name, draws a ranked text card with a fallback note, and flags unmatched regions', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: 'load_data',
      arguments: { name: 'acme-bookings', rows: ROWS, chartConfig: { type: 'world map', xAxisField: 'country', yAxisField: 'bookings' } },
    })
    const text = textOf(result)
    expect(result.isError).toBeFalsy()
    expect(text).toContain('Map drawn in TinyPivot; this text card ranks the regions instead.')
    expect(text).toContain('Takeaway (computed from the data): France leads')
    expect(text).toContain('Map warning')
    expect(text).toContain('"Atlantis"')
  })

  it('configures a bullet chart with a target field', async () => {
    const client = await connect()
    await client.callTool({ name: 'load_data', arguments: { name: 'acme-bookings', rows: ROWS } })
    const result = await client.callTool({
      name: 'configure_chart',
      arguments: { type: 'actual vs target', xAxisField: 'rep', yAxisField: 'bookings', targetField: 'quota' },
    })
    const text = textOf(result)
    expect(text).toContain('Configured **bullet** chart')
    expect(text).toContain('target = `quota`')
    expect(text).toContain('1 of 4 beat target')
    expect(text).toContain('Bullet chart drawn in TinyPivot')
  })

  it('rejects an unknown chart type with the list of types', async () => {
    const client = await connect()
    await client.callTool({ name: 'load_data', arguments: { name: 'acme-bookings', rows: ROWS } })
    const result = await client.callTool({
      name: 'configure_chart',
      arguments: { type: 'hologram', xAxisField: 'rep', yAxisField: 'bookings' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('Unknown chart type "hologram"')
    expect(textOf(result)).toContain('choropleth')
  })

  it('lists the new types in the chart tool schema', async () => {
    const client = await connect()
    const tool = (await client.listTools()).tools.find(t => t.name === 'configure_chart')!
    const schema = JSON.stringify(tool.inputSchema)
    for (const type of ['choropleth', 'bullet', 'radialBar', 'radialArea', 'slope', 'treemap', 'sunburst'])
      expect(schema).toContain(type)
    expect(schema).toContain('targetField')
    expect(schema).toContain('us-states')
  })
})
