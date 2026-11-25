import type { ChartThemePreset } from '@smallwebco/tinypivot-core'
import type { AddressInfo } from 'node:net'
import type { DatasetStore } from './store.js'
import type { NoteAttachment, StudioNote } from './studio-protocol.js'
import type { Studio } from './studio.js'
import fsSync, { unwatchFile, watchFile } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { INTERACTIVE_ROW_LIMIT } from './limits.js'
import { MODEL_CATALOG, tokensToUsd } from './pricing.js'
import { getPreferencesPath } from './store.js'
import { STUDIO_HEADER } from './studio-protocol.js'
import { cardTitle, datasetCard } from './summary.js'
import { getCompanionSessionFile, isProcessAlive } from './tui.js'

export interface CompanionServerHandle {
  /** The server's origin, for API calls. */
  url: string
  /** The address to give the user: this conversation's Studio, wherever its server is running. */
  link: string
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
  /**
   * How long the server stays up after the last Studio tab closes. Only counts once a tab has
   * connected, so a Live link printed in a card keeps working until someone opens it. 0 keeps it up.
   */
  idleStopMs?: number
  /** Called once the server has closed itself: the user pressed Stop, or every tab stayed closed. */
  onStopped?: (reason: 'stopped' | 'idle') => void
  /** How often to look for a theme saved elsewhere (another Studio, pi, an agent), in ms. */
  themeWatchMs?: number
}

/** Where each running Studio records its address, by conversation, so links can find it. */
function studiosDir(): string {
  return path.join(path.dirname(getCompanionSessionFile()), 'studios')
}

/** Records this conversation's Studio address; returns the file to remove when it stops. */
function registerStudio(sessionId: string, url: string): string | undefined {
  const file = path.join(studiosDir(), `${sessionId}.json`)
  try {
    fsSync.mkdirSync(path.dirname(file), { recursive: true })
    fsSync.writeFileSync(file, `${JSON.stringify({ url, pid: process.pid })}\n`)
    return file
  }
  catch {
    return undefined
  }
}

/** The address of the running Studio for a conversation, or undefined when it has stopped. */
export async function liveStudioUrl(sessionId: string): Promise<string | undefined> {
  try {
    const entry = JSON.parse(await fs.readFile(path.join(studiosDir(), `${sessionId}.json`), 'utf8')) as { url?: string, pid?: number }
    return entry.url && typeof entry.pid === 'number' && isProcessAlive(entry.pid) ? entry.url : undefined
  }
  catch {
    return undefined
  }
}

const STOPPED_STUDIO_PAGE = `<!doctype html><meta charset="utf-8"><title>TinyPivot Studio stopped</title>
<body style="font:15px/1.55 system-ui,sans-serif;max-width:34rem;margin:20vh auto;padding:0 24px;color:#334155">
<h1 style="font-size:16px">This TinyPivot Studio has stopped</h1>
<p>The conversation this link belongs to is not running a Studio now. Ask your agent to open TinyPivot again; its reply has the new link.</p>`

/** The license key when it is one for the MCP server (Pro or team), otherwise null. */
function validMcpKey(licenseKey?: string): string | null {
  return licenseKey && (licenseKey.startsWith('TP-MCPP-') || licenseKey.startsWith('TP-MCPT-')) ? licenseKey : null
}

/** Whether this Studio may use the Pro features, such as the extra themes. */
function isProCompanion(options: { licenseKey?: string, demoToken?: string }): boolean {
  return Boolean(validMcpKey(options.licenseKey) || options.demoToken)
}

/** The page with the saved theme in a meta tag, so its first paint is already in that theme. */
export function withThemeMeta(html: string, theme: ChartThemePreset): string {
  return html.replace('<head>', `<head><meta name="tinypivot-theme" content="${theme}">`)
}

/** A theme saved by another Studio, pi or an agent shows up in open tabs within this long. */
const THEME_WATCH_MS = 1000

/** Long enough to reload the page or reopen a tab without losing the Studio. */
export const STUDIO_IDLE_STOP_MS = 2 * 60 * 1000

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
      res.write(`event: message\ndata: ${JSON.stringify({ id: note.id, text })}\n\n`)
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

/** The coloured card of the loaded dataset whose card carries `title`. */
function colouredCard(store: DatasetStore, title: string, companionUrl: string, isPro: boolean): string | null {
  if (!title)
    return null
  for (const meta of store.listMetadata()) {
    const dataset = store.get(meta.id)
    if (!dataset)
      continue
    const card = datasetCard(dataset, { colorTheme: store.getVisualTheme(), raw: true, companionUrl, showBranding: !isPro })
    if (card && cardTitle(card) === title)
      return card
  }
  return null
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
/** A dropped file: big enough for a typical export or screenshot, small enough to hold in memory. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const MAX_BODY_BYTES = 256 * 1024

/** The request body, or null when it is larger than `limit` bytes or the upload fails. */
function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(null))
  })
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req, MAX_BODY_BYTES)
  try {
    const text = body?.toString('utf8').trim()
    return text ? JSON.parse(text) as Record<string, unknown> : {}
  }
  catch {
    return {}
  }
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
  const isPro = isProCompanion(opts)
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
    licenseKey: validMcpKey(opts.licenseKey),
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
      try {
        const note = studio.addNote(text, {
          stepId: typeof body.stepId === 'string' ? body.stepId : undefined,
          attachment: parseAttachment(body.attachment),
          fileIds: Array.isArray(body.fileIds) ? body.fileIds.filter((id): id is string => typeof id === 'string') : undefined,
        })
        return sendJson(res, 200, { note })
      }
      catch (error) {
        return sendJson(res, 409, { error: errorMessage(error) })
      }
    }
    if (pathname === '/api/studio/verify') {
      try {
        return sendJson(res, 200, { checks: await studio.verifyStep(String(body.stepId ?? '')) })
      }
      catch (error) {
        return sendJson(res, 400, { error: errorMessage(error) })
      }
    }
    if (pathname === '/api/studio/reply') {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text)
        return sendJson(res, 400, { error: 'Send the reply text.' })
      studio.reply(text.slice(0, 20_000))
      return sendJson(res, 200, { ok: true })
    }
    if (pathname === '/api/studio/agent-status') {
      studio.setAgentBusy(body.busy === true)
      return sendJson(res, 200, { ok: true })
    }
    if (pathname === '/api/studio/show') {
      try {
        const viewMode = body.viewMode === 'grid' || body.viewMode === 'chart' || body.viewMode === 'pivot' ? body.viewMode : undefined
        const dataset = await studio.showStep(String(body.stepId ?? ''), { viewMode })
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

  /** Set once listening; read from here because server.address() is null once closing starts. */
  let listenPort = 0
  let closePromise: Promise<void> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const preferencesPath = getPreferencesPath()
  let shownTheme = options.store.getVisualTheme()
  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = urlObj.pathname

    res.setHeader('Cache-Control', 'no-store')
    const allowed = isAllowedRequest({
      method: req.method,
      host: req.headers.host,
      origin: req.headers.origin,
      studioHeader: req.headers[STUDIO_HEADER] as string | undefined,
    }, listenPort)
    if (!allowed)
      return sendJson(res, 403, { error: 'Forbidden' })

    // A link names its conversation. Another conversation's link is forwarded to the server that
    // has it, or answered with a page saying that Studio has stopped: never with this one's data.
    const linkSession = /^\/s\/([\w-]+)\/?$/.exec(pathname)?.[1]
    if (req.method === 'GET' && linkSession && linkSession !== studio?.sessionId) {
      const target = await liveStudioUrl(linkSession)
      if (target) {
        res.writeHead(302, { Location: `${target}/s/${linkSession}` })
        res.end()
        return
      }
      res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(STOPPED_STUDIO_PAGE)
      return
    }

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || linkSession)) {
      const html = withThemeMeta(await options.loadHtml(), isProCompanion(options) ? options.store.getVisualTheme() : 'code')
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
      clearTimeout(idleTimer)
      req.on('close', () => {
        sseClients.delete(res)
        armIdleStop()
      })
      return
    }

    // The Studio's Stop button: close this server. The agent keeps its tools; its next TinyPivot call starts a new Studio.
    if (req.method === 'POST' && pathname === '/api/studio/stop') {
      sendJson(res, 200, { stopped: true })
      setImmediate(() => void stopSelf('stopped'))
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

    // The pi extension draws TinyPivot cards; this hands it a card in full colour, found by its title.
    if (req.method === 'GET' && pathname === '/api/studio/card') {
      const title = urlObj.searchParams.get('title') ?? ''
      const ansi = colouredCard(options.store, title, studio ? `http://127.0.0.1:${listenPort}/s/${studio.sessionId}` : `http://127.0.0.1:${listenPort}`, isProCompanion(options))
      return ansi ? sendJson(res, 200, { ansi }) : sendJson(res, 404, { error: 'No card with that title.' })
    }

    if (req.method === 'GET' && pathname === '/api/studio') {
      return studio ? sendJson(res, 200, studio.snapshot()) : sendJson(res, 404, { error: 'Studio is not available.' })
    }

    // A file dropped into the Studio: the raw bytes, its name in a header. Messages refer to it by the id returned.
    if (req.method === 'POST' && pathname === '/api/studio/upload') {
      if (!studio)
        return sendJson(res, 404, { error: 'Studio is not available.' })
      const bytes = await readBody(req, MAX_UPLOAD_BYTES)
      if (!bytes)
        return sendJson(res, 413, { error: `Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` })
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'file'))
      return sendJson(res, 200, { file: studio.saveFile(name, bytes) })
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
      const isPro = isProCompanion(options)
      if (typeof body.theme === 'string') {
        const requested = body.theme as ChartThemePreset
        if (isPro || requested === 'code') {
          options.store.setVisualTheme(requested)
          followTheme()
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
  listenPort = address.port
  const url = `http://127.0.0.1:${address.port}`
  const registration = studio ? registerStudio(studio.sessionId, url) : undefined

  // Record active localhost session so `tinypivot-mcp tui` auto-attaches in a Ghostty/tmux split pane
  const sessionFile = getCompanionSessionFile()
  try {
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })
    await fs.writeFile(sessionFile, `${JSON.stringify({ url, port: address.port, pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  }
  catch {}

  function closeServer(): Promise<void> {
    if (closePromise)
      return closePromise
    clearTimeout(idleTimer)
    unwatchFile(preferencesPath, followTheme)
    if (registration)
      void fs.rm(registration, { force: true })
    closePromise = (async () => {
      for (const client of sseClients) {
        try {
          client.end()
        }
        catch {}
      }
      sseClients.clear()

      // Agent streams and keep-alive sockets stay open on their own; close them so this resolves.
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
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
  }

  async function stopSelf(reason: 'stopped' | 'idle') {
    await closeServer()
    options.onStopped?.(reason)
  }

  /** Repaints open tabs when the saved theme changes, wherever it was picked. */
  function followTheme() {
    const theme = options.store.getVisualTheme()
    if (theme === shownTheme)
      return
    shownTheme = theme
    broadcastUpdate()
  }

  /** After the last tab closes, stop unless one comes back within the grace period. */
  function armIdleStop() {
    clearTimeout(idleTimer)
    if (!options.idleStopMs || sseClients.size > 0 || closePromise)
      return
    idleTimer = setTimeout(() => void stopSelf('idle'), options.idleStopMs)
    idleTimer.unref()
  }

  watchFile(preferencesPath, { interval: options.themeWatchMs ?? THEME_WATCH_MS, persistent: false }, followTheme)

  return {
    url,
    link: studio ? `${url}/s/${studio.sessionId}` : url,
    port: address.port,
    broadcastUpdate,
    clientCount: () => sseClients.size,
    close: closeServer,
  }
}
