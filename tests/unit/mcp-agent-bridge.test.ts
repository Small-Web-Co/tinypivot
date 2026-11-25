// @vitest-environment node
import type { CompanionServerHandle } from '../../packages/mcp/src/companion'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleAnalystAction } from '../../packages/mcp/src/analyst-endpoint'
import { commandEnablesChannel } from '../../packages/mcp/src/claude-channel'
import { startCompanionServer } from '../../packages/mcp/src/companion'
import { DuckDbRunner, quoteLiteral } from '../../packages/mcp/src/duckdb'
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

  it('answers an analyst question with the agent\'s reply, and records both in the trace', async () => {
    studio.agent.connect({ name: 'pi', push: (note) => {
      setTimeout(() => studio.reply('EMEA grew fastest.', note.id), 5)
      return true
    } })
    expect(await studio.ask('Which region grew fastest?')).toBe('EMEA grew fastest.')
    expect(studio.recentSteps().map(s => [s.actor, s.tool])).toEqual([['user', 'ask'], ['agent', 'reply']])
  })

  it('uses the host\'s own model when it offers sampling', async () => {
    const complete = vi.fn(async () => 'Sampled answer')
    studio.agent.connect({ name: 'sampling', complete })
    expect(await studio.ask('Why did March drop?', { turns: [{ role: 'user', content: 'Why did March drop?' }] })).toBe('Sampled answer')
    expect(complete).toHaveBeenCalledOnce()
  })

  it('says how to reach the agent when nothing connects live', async () => {
    studio.setAgentName('opencode')
    const answer = await studio.ask('Which plan churns most?')
    expect(answer).toContain('OpenCode is not connected to the Studio live')
    expect(studio.pendingNotes()[0]).toMatchObject({ kind: 'question', text: 'Which plan churns most?' })
  })

  it('gives up waiting after the limit', async () => {
    studio.agent.connect({ name: 'pi', push: () => true })
    expect(await studio.ask('Slow question', { waitMs: 10 })).toContain('still working on this')
  })
})

describe('aI Analyst endpoint', () => {
  it('lists loaded datasets as tables and runs SQL over them', async () => {
    const csv = path.join(dir, 'orders.csv')
    fs.writeFileSync(csv, 'region,mrr\nEMEA,10\nAPAC,5\nEMEA,7\n')
    const { dataset } = await studio.runQuery({ sql: `SELECT * FROM ${quoteLiteral(csv)}`, name: 'Orders', actor: 'agent' })

    const tables = await handleAnalystAction(studio, { action: 'list-tables' })
    expect(tables.body).toEqual({ tables: [{ name: dataset.id, description: 'Orders: 3 rows' }] })
    const schemas = await handleAnalystAction(studio, { action: 'get-schema', tables: [dataset.id] })
    expect(schemas.body).toMatchObject({ schemas: [{ table: dataset.id, columns: [{ name: 'region', type: 'string' }, { name: 'mrr', type: 'number' }] }] })

    const query = await handleAnalystAction(studio, { action: 'query', sql: `SELECT region, sum(mrr) AS mrr FROM ${dataset.id} GROUP BY 1 ORDER BY 2 DESC` })
    expect(query.body).toMatchObject({ success: true, rowCount: 2, data: [{ region: 'EMEA', mrr: 17 }, { region: 'APAC', mrr: 5 }] })
    expect((await handleAnalystAction(studio, { action: 'query', sql: 'DROP TABLE x' })).body).toMatchObject({ success: false })
  }, 30_000)

  it('sends chat to the agent with only the user\'s latest question', async () => {
    const pushed: string[] = []
    studio.agent.connect({ name: 'pi', push: (note, text) => {
      pushed.push(text)
      setTimeout(() => studio.reply('Sales.', note.id), 5)
      return true
    } })
    const result = await handleAnalystAction(studio, {
      action: 'chat',
      messages: [{ role: 'user', content: 'You are a data analyst... (long prompt)' }, { role: 'assistant', content: 'Ready.' }, { role: 'user', content: 'Which channel is biggest?' }],
    })
    expect(result.body).toEqual({ content: 'Sales.' })
    expect(pushed[0]).toBe('Question from the user in TinyPivot Studio: Which channel is biggest?')
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

    const answer = studio.ask('Which region is biggest?')
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 3000 })
    expect(sent[0].content).toContain('Which region is biggest?')
    expect(sent[0].options).toEqual({ triggerTurn: true, deliverAs: 'steer' })

    await handlers.get('agent_end')!({ messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: [{ type: 'text', text: 'North America, at 17.1M.' }] }] })
    expect(await answer).toBe('North America, at 17.1M.')

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

    const answer = studio.ask('Which region is biggest?')
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].content).toContain('Question from the user in TinyPivot Studio: Which region is biggest?')
    expect(events[0].meta.kind).toBe('question')

    await client.callTool({ name: 'studio_reply', arguments: { text: 'North America.', re: events[0].meta.message_id } })
    expect(await answer).toBe('North America.')
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
