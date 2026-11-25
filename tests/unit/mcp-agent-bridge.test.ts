// @vitest-environment node
import type { CompanionServerHandle } from '../../packages/mcp/src/companion'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandEnablesChannel } from '../../packages/mcp/src/claude-channel'
import { startCompanionServer } from '../../packages/mcp/src/companion'
import { DuckDbRunner } from '../../packages/mcp/src/duckdb'
import { HistoryStore } from '../../packages/mcp/src/history'
import { buildPiExtensionSource } from '../../packages/mcp/src/pi-extension'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'

let dir: string
let studio: Studio

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-bridge-'))
  studio = new Studio(new DatasetStore(), { history: new HistoryStore({ dir: path.join(dir, 'history') }), duck: new DuckDbRunner() })
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('sending to the agent', () => {
  it('goes straight into the conversation when a live connector takes it, and is queued otherwise', () => {
    const queued = studio.addNote('Use net revenue')
    expect(queued.delivery).toBe('queued')

    const pushed: string[] = []
    const disconnect = studio.agent.connect({ name: 'pi', push: (_note, text) => pushed.push(text) > 0 })
    const live = studio.addNote('Split by plan', { attachment: { label: 'Row #3', text: 'region=EMEA, mrr=1800' } })
    expect(live.delivery).toBe('live')
    expect(pushed[0]).toContain('Split by plan\nAttached (Row #3):\nregion=EMEA, mrr=1800')
    expect(studio.snapshot().agent.live).toEqual(['pi'])
    expect(studio.pendingNotes().map(n => n.text)).toEqual(['Use net revenue'])

    disconnect()
    expect(studio.snapshot().agent.live).toEqual([])
  })
})

describe('claude Code channels', () => {
  it('counts only a Claude Code command line that names this server in a channel flag', () => {
    expect(commandEnablesChannel('claude --dangerously-load-development-channels server:tinypivot', 'tinypivot')).toBe(true)
    expect(commandEnablesChannel('node /usr/bin/claude --channels plugin:tinypivot@tinypivot', 'tinypivot')).toBe(true)
    expect(commandEnablesChannel('claude --channels server:other', 'tinypivot')).toBe(false)
    expect(commandEnablesChannel('claude --resume', 'tinypivot')).toBe(false)
  })
})

describe('pi extension bridge', () => {
  let handle: CompanionServerHandle

  afterEach(async () => {
    await handle?.close()
  })

  it('puts Studio messages into the pi session and sends the agent\'s answer back', async () => {
    handle = await startCompanionServer({ store: studio.store, studio, loadHtml: async () => '' })
    const js = ts.transpileModule(buildPiExtensionSource(), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    const file = path.join(dir, 'tinypivot-pi.mjs')
    fs.writeFileSync(file, js)
    const extension = (await import(pathToFileURL(file).href)).default as (pi: unknown) => void

    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>()
    const sent: Array<{ content: string, options: unknown }> = []
    extension({
      on: (name: string, fn: (event: unknown, ctx?: unknown) => unknown) => handlers.set(name, fn),
      sendMessage: (message: { content: string }, options: unknown) => sent.push({ content: message.content, options }),
      registerCommand: () => {},
    })

    // pi learns the Studio address from a TinyPivot tool reply.
    handlers.get('tool_execution_end')!({ toolName: 'codemode', result: { content: [{ type: 'text', text: `Loaded. Studio: ${handle.url}` }] } }, { hasUI: false })
    await vi.waitFor(() => expect(studio.snapshot().agent.live).toEqual(['pi']), { timeout: 3000 })
    // pi reports when it is working, so the Studio can show progress.
    await vi.waitFor(() => expect(studio.snapshot().agent.busy).toBe(true), { timeout: 3000 })
    await handlers.get('agent_settled')!({})
    expect(studio.snapshot().agent.busy).toBe(false)

    expect(studio.addNote('Which region is biggest?').delivery).toBe('live')
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 3000 })
    expect(sent[0].content).toBe('Message from the user in TinyPivot Studio: Which region is biggest?')
    expect(sent[0].options).toEqual({ triggerTurn: true, deliverAs: 'steer' })

    // The turn the message started ends; its answer lands in the trace.
    await handlers.get('agent_end')!({ messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: [{ type: 'text', text: 'North America, at 17.1M.' }] }] })
    await vi.waitFor(() => expect(studio.recentSteps().at(-1)).toMatchObject({ actor: 'agent', tool: 'reply', why: 'North America, at 17.1M.' }), { timeout: 3000 })

    handlers.get('session_shutdown')!({})
    await vi.waitFor(() => expect(studio.snapshot().agent.live).toEqual([]), { timeout: 3000 })
  }, 20_000)
})

describe('claude Code channel server', () => {
  it('declares the channel, pushes Studio messages as channel events, and takes answers through studio_reply', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { createTinyPivotMcpServer } = await import('../../packages/mcp/src/server')
    const { server } = createTinyPivotMcpServer({ store: studio.store, studio, claudeChannel: true })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'claude-code', version: '2.2.0' }, { capabilities: {} })
    const events: Array<{ content: string, meta: Record<string, string> }> = []
    client.fallbackNotificationHandler = async (notification) => {
      if (notification.method === 'notifications/claude/channel')
        events.push(notification.params as { content: string, meta: Record<string, string> })
    }
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    expect(client.getServerCapabilities()?.experimental).toEqual({ 'claude/channel': {} })
    expect(client.getInstructions()).toContain('studio_reply')
    expect(studio.snapshot().agent).toEqual({ name: 'Claude Code', live: ['Claude Code channel'], busy: false })

    studio.addNote('Which region is biggest?')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].content).toContain('Message from the user in TinyPivot Studio: Which region is biggest?')
    expect(events[0].meta.message_id).toMatch(/^note-/)

    await client.callTool({ name: 'studio_reply', arguments: { text: 'North America.' } })
    expect(studio.recentSteps().at(-1)).toMatchObject({ actor: 'agent', tool: 'reply', why: 'North America.' })
  })

  it('offers no reply tool without a channel', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js')
    const { createTinyPivotMcpServer } = await import('../../packages/mcp/src/server')
    const { server } = createTinyPivotMcpServer({ store: studio.store, studio, claudeChannel: false })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'claude-code', version: '2.2.0' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name)).not.toContain('studio_reply')
    expect(client.getServerCapabilities()?.experimental).toBeUndefined()
    // The Studio offers the command that restarts into the same conversation with the channel on.
    expect(studio.snapshot().agent.hint?.command).toBe('claude --continue --dangerously-load-development-channels server:tinypivot')
  })
})

describe('agent answers', () => {
  it('leave out the terminal cards the agent echoed, which the Studio already shows', async () => {
    const { withoutCards } = await import('../../packages/mcp/src/studio')
    const answer = 'Yes, March.\n\n```text\n╭─ Partner ─╮\n│ 163,459 │\n╰──────╯\n```\n\nEvery region drops.'
    expect(withoutCards(answer)).toBe('Yes, March.\n\nEvery region drops.')
    expect(withoutCards('```text\nplain block\n```')).toBe('```text\nplain block\n```')
  })
})

describe('pi extension cards', () => {
  it('make the Studio address in a card a clickable terminal link', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-pi-card-'))
    const file = path.join(dir, 'tinypivot-pi.mjs')
    fs.writeFileSync(file, ts.transpileModule(buildPiExtensionSource(), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
    const extension = (await import(pathToFileURL(file).href)).default as (pi: unknown) => void
    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>()
    let renderer: ((entry: { data: unknown }) => { render: (width: number) => string[] } | undefined) | undefined
    const entries: unknown[] = []
    extension({
      on: (name: string, fn: (event: unknown, ctx?: unknown) => unknown) => handlers.set(name, fn),
      registerEntryRenderer: (_type: string, fn: typeof renderer) => { renderer = fn },
      appendEntry: (_type: string, data: unknown) => entries.push(data),
      registerCommand: () => {},
    })
    const card = ['```text', '╭─ MRR ─────────╮', '│ ↗ Live: http://127.0.0.1:47317 │', '╰───────────────╯', '```'].join('\n')
    await handlers.get('tool_execution_end')!({ toolName: 'tinypivot_load_file', result: { content: [{ type: 'text', text: card }] } }, { hasUI: true })
    handlers.get('session_shutdown')!({})
    const lines = renderer!({ data: entries[0] })!.render(80)
    expect(lines.join('\n')).toContain('\u001B]8;;http://127.0.0.1:47317\u001B\\http://127.0.0.1:47317\u001B]8;;\u001B\\')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('pi extension coloured cards', () => {
  let handle: CompanionServerHandle

  afterEach(async () => {
    await handle?.close()
  })

  it('draws cards from codemode in the Studio\'s full colour', async () => {
    const { formatTerminalChart } = await import('../../packages/mcp/src/terminal-chart')
    const rows = ['A', 'B'].flatMap(s => ['2026-01', '2026-02', '2026-03'].map((month, i) => ({ month, s, v: i + (s === 'A' ? 1 : 3) })))
    const chartConfig = { type: 'line' as const, xAxis: { field: 'month', role: 'dimension' as const }, yAxis: { field: 'v', role: 'measure' as const, aggregation: 'sum' as const }, seriesField: { field: 's', role: 'dimension' as const } }
    const dataset = studio.store.register({ name: 'Trend', source: 'test', rows, viewMode: 'chart', chartConfig })
    studio.store.setVisualTheme('crt-amber')
    handle = await startCompanionServer({ store: studio.store, studio, loadHtml: async () => '', licenseKey: 'TP-MCPP-TESTKEY1-20991231' })

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-pi-colour-'))
    const file = path.join(dir, 'tinypivot-pi.mjs')
    fs.writeFileSync(file, ts.transpileModule(buildPiExtensionSource(), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
    const extension = (await import(pathToFileURL(file).href)).default as (pi: unknown) => void
    const handlers = new Map<string, (event: unknown, ctx?: unknown) => unknown>()
    let renderer: ((entry: { data: unknown }) => { render: (width: number) => string[] } | undefined) | undefined
    const entries: unknown[] = []
    extension({
      on: (name: string, fn: (event: unknown, ctx?: unknown) => unknown) => handlers.set(name, fn),
      registerEntryRenderer: (_type: string, fn: typeof renderer) => { renderer = fn },
      appendEntry: (_type: string, data: unknown) => entries.push(data),
      sendMessage: () => {},
      registerCommand: () => {},
    })
    const plainCard = formatTerminalChart(dataset, chartConfig, { companionUrl: handle.url, showBranding: false })
    await handlers.get('tool_execution_end')!({ toolName: 'codemode', result: { content: [{ type: 'text', text: `Loaded.\n${plainCard}` }] } }, { hasUI: true })
    handlers.get('session_shutdown')!({})

    const lines = renderer!({ data: entries[0] })!.render(100).join('\n')
    // The second amber series colour only appears when the Studio coloured the card by series.
    expect(lines).toContain('\u001B[38;2;255;122;26m')
    fs.rmSync(dir, { recursive: true, force: true })
  }, 20_000)
})
