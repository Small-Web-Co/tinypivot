import type { ChartThemePreset } from '@smallwebco/tinypivot-core'
import type { AddressInfo } from 'node:net'
import type { DatasetStore } from './store.js'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { INTERACTIVE_ROW_LIMIT } from './limits.js'
import { MODEL_CATALOG, tokensToUsd } from './pricing.js'
import { getCompanionSessionFile } from './tui.js'

export interface CompanionServerHandle {
  url: string
  port: number
  broadcastUpdate: () => void
  close: () => Promise<void>
}

export interface StartCompanionOptions {
  store: DatasetStore
  loadHtml: () => Promise<string>
  licenseKey?: string
  demoToken?: string
  port?: number
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
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
 * live-updating interactive TinyPivot Data IDE in a browser tab alongside the terminal.
 */
export async function startCompanionServer(options: StartCompanionOptions): Promise<CompanionServerHandle> {
  const sseClients = new Set<http.ServerResponse>()

  const broadcastUpdate = () => {
    const payload = buildFullCompanionPayload(options.store, undefined, options)
    if (!payload)
      return
    const frame = `event: update\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of sseClients) {
      try {
        res.write(frame)
      }
      catch {
        sseClients.delete(res)
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = urlObj.pathname

    res.setHeader('Cache-Control', 'no-store')

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
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      const dsId = urlObj.searchParams.get('datasetId') ?? undefined
      const payload = buildFullCompanionPayload(options.store, dsId, options)
      if (!payload) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Dataset not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(payload))
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
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ session: options.store.getSessionSavings() }))
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
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ chartTheme: isPro ? options.store.getVisualTheme() : 'code' }))
      return
    }

    if (req.method === 'POST' && pathname === '/api/local-action') {
      const body = await readJsonBody(req)
      const dsId = typeof body.datasetId === 'string' ? body.datasetId : undefined
      const result = options.store.recordLocalAction(dsId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
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
