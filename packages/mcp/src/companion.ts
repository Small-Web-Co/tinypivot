import type { ChartThemePreset } from '@smallwebco/tinypivot-core'
import type { AddressInfo } from 'node:net'
import type { DatasetStore } from './store.js'
import type { NoteAttachment, StudioNote } from './studio-protocol.js'
import type { Studio } from './studio.js'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { handleAnalystAction } from './analyst-endpoint.js'
import { INTERACTIVE_ROW_LIMIT } from './limits.js'
import { MODEL_CATALOG, tokensToUsd } from './pricing.js'
import { STUDIO_HEADER } from './studio-protocol.js'
import { getCompanionSessionFile } from './tui.js'

export interface CompanionServerHandle {
  url: string
  port: number
  broadcastUpdate: () => void
  /** Browser tabs connected to the live stream right now. */
  clientCount: () => number
  close: () => Promise<void>
}

export interface StartCompanionOptions {
  store: DatasetStore
  loadHtml: () => Promise<string>
  licenseKey?: string
  demoToken?: string
  port?: number
  /** Trace, notes and history shown in the Studio; without one the Studio routes answer 404. */
  studio?: Studio
}

/**
 * Only this machine, on this server's own address, may use the API. Checking Host stops DNS
 * rebinding. Writes from a browser must come from the Studio's own page (browsers always send
 * Origin on cross-site POSTs); writes from local tools without an Origin, such as the pi
 * extension, must carry the Studio header.
 */
export function isAllowedRequest(
  request: { method?: string, host?: string, origin?: string, studioHeader?: string },
  port: number,
): boolean {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]
  if (!request.host || !allowedHosts.includes(request.host))
    return false
  if (request.method === 'GET' || request.method === 'HEAD')
    return true
  if (request.origin)
    return allowedHosts.some(host => request.origin === `http://${host}`)
  return request.studioHeader === '1'
}

function parseAttachment(value: unknown): NoteAttachment | undefined {
  const { label, text } = (value ?? {}) as { label?: unknown, text?: unknown }
  return typeof label === 'string' && typeof text === 'string' && text.trim() ? { label, text } : undefined
}

/** Holds an SSE stream open as a live way to reach the agent until the extension disconnects. */
function openAgentStream(studio: Studio, agentName: string, req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
  res.write(': connected\n\n')
  const disconnect = studio.agent.connect({
    name: agentName,
    push: (note: StudioNote, text: string) => {
      if (res.writableEnded)
        return false
      res.write(`event: message\ndata: ${JSON.stringify({ id: note.id, kind: note.kind, text })}\n\n`)
      return true
    },
  })
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000)
  keepAlive.unref()
  req.on('close', () => {
    clearInterval(keepAlive)
    disconnect()
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const MAX_SQL_CHARS = 20_000
const MAX_NOTE_CHARS = 2_000

const MAX_BODY_BYTES = 256 * 1024

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        resolve({})
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        resolve(text ? JSON.parse(text) as Record<string, unknown> : {})
      }
      catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function buildFullCompanionPayload(
  store: DatasetStore,
  datasetId: string | undefined,
  opts: { licenseKey?: string, demoToken?: string },
) {
  const ds = store.get(datasetId)
  if (!ds)
    return null
  const session = store.getSessionSavings()
  const turnTokensSaved = ds.ingestionMode === 'direct'
    ? Math.max(0, ds.estimatedDatasetTokens - 150)
    : 0
  const validMcpKey = opts.licenseKey && (opts.licenseKey.startsWith('TP-MCPP-') || opts.licenseKey.startsWith('TP-MCPT-'))
    ? opts.licenseKey
    : null
  const isPro = Boolean(validMcpKey || opts.demoToken)
  return {
    datasetId: ds.id,
    name: ds.name,
    source: ds.source,
    totalRows: ds.rows.length,
    sourceTotalRows: ds.sourceTotalRows,
    truncatedForFreeTier: ds.truncatedForFreeTier,
    tier: isPro ? 'pro' : 'free',
    rows: ds.rows.slice(0, INTERACTIVE_ROW_LIMIT),
    hasMoreRows: false,
    columns: ds.columns,
    viewMode: ds.viewMode,
    pivotConfig: ds.pivotConfig ?? null,
    chartConfig: ds.chartConfig ?? null,
    chartTheme: isPro ? store.getVisualTheme() : 'code',
    datasets: store.listMetadata(),
    licenseKey: validMcpKey,
    demoToken: opts.demoToken ?? null,
    modelCatalog: MODEL_CATALOG,
    tokenStats: {
      ingestionMode: ds.ingestionMode,
      rawBytes: ds.rawBytes,
      estimatedDatasetTokens: ds.estimatedDatasetTokens,
      summaryTokens: 150,
      turnTokensSaved,
      turnUsdSaved: tokensToUsd(turnTokensSaved, session.model.ratePerMillion),
      session,
    },
  }
}

/**
 * Localhost companion HTTP + SSE server so terminal-first harnesses
 * (Claude Code, OpenCode, pi, Rex, Ghostty, Codex CLI) get the exact same
 * live-updating interactive TinyPivot Studio in a browser tab alongside the terminal.
 */
export async function startCompanionServer(options: StartCompanionOptions): Promise<CompanionServerHandle> {
  const sseClients = new Set<http.ServerResponse>()

  const send = (event: string, payload: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of sseClients) {
      try {
        res.write(frame)
      }
      catch {
        sseClients.delete(res)
      }
    }
  }

  const broadcastUpdate = () => {
    const payload = buildFullCompanionPayload(options.store, undefined, options)
    if (payload)
      send('update', payload)
  }

  const { studio } = options
  studio?.subscribe(() => send('studio', studio.snapshot()))

  /** Studio writes: the user's own SQL, notes for the agent, and reopening saved pulls. */
  const handleStudioPost = async (pathname: string, body: Record<string, unknown>, res: http.ServerResponse) => {
    if (!studio)
      return sendJson(res, 404, { error: 'Studio is not available.' })
    if (pathname === '/api/studio/query') {
      const sql = typeof body.sql === 'string' ? body.sql.trim() : ''
      if (!sql || sql.length > MAX_SQL_CHARS)
        return sendJson(res, 400, { error: 'Send one SELECT statement.' })
      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : undefined
      try {
        const viewFromStepId = typeof body.fromStepId === 'string' ? body.fromStepId : undefined
        const { dataset, truncated } = await studio.runQuery({ sql, name, actor: 'user', viewFromStepId })
        broadcastUpdate()
        return sendJson(res, 200, { datasetId: dataset.id, rows: dataset.rows.length, truncated })
      }
      catch (error) {
        return sendJson(res, 400, { error: errorMessage(error) })
      }
    }
    if (pathname === '/api/studio/note') {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text || text.length > MAX_NOTE_CHARS)
        return sendJson(res, 400, { error: `Write a note of up to ${MAX_NOTE_CHARS.toLocaleString('en-US')} characters.` })
      const note = studio.addNote(text, {
        stepId: typeof body.stepId === 'string' ? body.stepId : undefined,
        attachment: parseAttachment(body.attachment),
      })
      return sendJson(res, 200, { note })
    }
    if (pathname === '/api/studio/note/delete') {
      return sendJson(res, 200, { removed: typeof body.id === 'string' && studio.removeNote(body.id) })
    }
    if (pathname === '/api/studio/reply') {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text)
        return sendJson(res, 400, { error: 'Send the reply text.' })
      studio.reply(text.slice(0, 20_000), typeof body.re === 'string' ? body.re : undefined)
      return sendJson(res, 200, { ok: true })
    }
    if (pathname === '/api/studio/agent-status') {
      studio.setAgentBusy(body.busy === true)
      return sendJson(res, 200, { ok: true })
    }
    if (pathname === '/api/studio/analyst') {
      const result = await handleAnalystAction(studio, body)
      return sendJson(res, result.status, result.body)
    }
    if (pathname === '/api/studio/show') {
      try {
        const dataset = await studio.showStep(String(body.stepId ?? ''))
        broadcastUpdate()
        return sendJson(res, 200, { datasetId: dataset.id })
      }
      catch (error) {
        return sendJson(res, 400, { error: errorMessage(error) })
      }
    }
    if (pathname === '/api/studio/open') {
      try {
        const dataset = await studio.reopen(String(body.id ?? ''), { actor: 'user' })
        broadcastUpdate()
        return sendJson(res, 200, { datasetId: dataset.id })
      }
      catch (error) {
        return sendJson(res, 400, { error: errorMessage(error) })
      }
    }
    return sendJson(res, 404, { error: 'Not found' })
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = urlObj.pathname

    res.setHeader('Cache-Control', 'no-store')
    const port = (server.address() as AddressInfo).port
    const allowed = isAllowedRequest({
      method: req.method,
      host: req.headers.host,
      origin: req.headers.origin,
      studioHeader: req.headers[STUDIO_HEADER] as string | undefined,
    }, port)
    if (!allowed)
      return sendJson(res, 403, { error: 'Forbidden' })

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const html = await options.loadHtml()
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      res.write('retry: 2000\n\n')
      if (studio)
        res.write(`event: studio\ndata: ${JSON.stringify(studio.snapshot())}\n\n`)
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    // A local agent extension (pi) listens here and puts Studio messages into its conversation.
    if (req.method === 'GET' && pathname === '/api/studio/agent-stream') {
      if (!studio || req.headers[STUDIO_HEADER] !== '1')
        return sendJson(res, 403, { error: 'Forbidden' })
      const agentName = (urlObj.searchParams.get('agent') || 'agent').slice(0, 40)
      openAgentStream(studio, agentName, req, res)
      return
    }

    if (req.method === 'GET' && pathname === '/api/studio') {
      return studio ? sendJson(res, 200, studio.snapshot()) : sendJson(res, 404, { error: 'Studio is not available.' })
    }

    if (req.method === 'POST' && pathname.startsWith('/api/studio/')) {
      await handleStudioPost(pathname, await readJsonBody(req), res)
      return
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const dsId = urlObj.searchParams.get('datasetId') ?? undefined
      const payload = buildFullCompanionPayload(options.store, dsId, options)
      if (!payload) {
        sendJson(res, 404, { error: 'Dataset not found' })
        return
      }
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && pathname === '/api/model') {
      const body = await readJsonBody(req)
      if (typeof body.model === 'string') {
        options.store.setActiveModel(
          body.model,
          typeof body.customRatePerMillion === 'number' ? body.customRatePerMillion : undefined,
        )
      }
      sendJson(res, 200, { session: options.store.getSessionSavings() })
      return
    }

    if (req.method === 'POST' && pathname === '/api/theme') {
      const body = await readJsonBody(req)
      const isPro = Boolean(
        (options.licenseKey && (options.licenseKey.startsWith('TP-MCPP-') || options.licenseKey.startsWith('TP-MCPT-')))
        || options.demoToken,
      )
      if (typeof body.theme === 'string') {
        const requested = body.theme as ChartThemePreset
        if (isPro || requested === 'code') {
          options.store.setVisualTheme(requested)
        }
      }
      sendJson(res, 200, { chartTheme: isPro ? options.store.getVisualTheme() : 'code' })
      return
    }

    if (req.method === 'POST' && pathname === '/api/local-action') {
      const body = await readJsonBody(req)
      const dsId = typeof body.datasetId === 'string' ? body.datasetId : undefined
      const result = options.store.recordLocalAction(dsId)
      sendJson(res, 200, result)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo
  const url = `http://127.0.0.1:${address.port}`

  // Record active localhost session so `tinypivot-mcp tui` auto-attaches in a Ghostty/tmux split pane
  const sessionFile = getCompanionSessionFile()
  try {
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })
    await fs.writeFile(sessionFile, `${JSON.stringify({ url, port: address.port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  }
  catch {}

  let closePromise: Promise<void> | null = null

  return {
    url,
    port: address.port,
    broadcastUpdate,
    clientCount: () => sseClients.size,
    close: () => {
      if (closePromise)
        return closePromise
      closePromise = (async () => {
        for (const client of sseClients) {
          try {
            client.end()
          }
          catch {}
        }
        sseClients.clear()

        await new Promise<void>((resolve) => {
          server.close(() => resolve())
        })

        // Clean up companion.json only if this process still owns it
        try {
          const raw = await fs.readFile(sessionFile, 'utf8')
          const parsed = JSON.parse(raw) as { pid?: number }
          if (parsed.pid === process.pid) {
            await fs.unlink(sessionFile)
          }
        }
        catch {
          // Ignore if already removed or overwritten
        }
      })()
      return closePromise
    },
  }
}
