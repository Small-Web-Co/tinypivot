#!/usr/bin/env node
import type { CompanionServerHandle } from './companion.js'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startCompanionServer } from './companion.js'
import { runInitCommand } from './init.js'
import { createTinyPivotMcpServer, isMcpLicenseKey, loadAppHtml, resolveLicenseKey } from './server.js'
import { DatasetStore, FREE_TIER_ROW_LIMIT, parseDelimitedText } from './store.js'
import { formatDatasetSummary, formatPivotSummary, formatTerminalChart } from './summary.js'
import { runTuiCommand } from './tui.js'

function openInBrowser(url: string) {
  const cmd = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.unref()
  }
  catch {
    // Non-fatal if browser cannot be opened automatically
  }
}

function normalizeJsonRow(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { value: input ?? null }
  return input as Record<string, unknown>
}

function parsePipedStdinData(rawText: string): { rows: Record<string, unknown>[], format: 'json' | 'jsonl' | 'tsv' | 'csv' } {
  const cleaned = rawText.charCodeAt(0) === 0xFEFF ? rawText.slice(1) : rawText
  const trimmed = cleaned.trim()
  if (!trimmed)
    return { rows: [], format: 'csv' }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return { rows: parsed.map(normalizeJsonRow), format: 'json' }
      }
      if (parsed && typeof parsed === 'object') {
        const firstArray = Object.values(parsed as Record<string, unknown>).find(v => Array.isArray(v)) as unknown[] | undefined
        if (firstArray)
          return { rows: firstArray.map(normalizeJsonRow), format: 'json' }
        return { rows: [normalizeJsonRow(parsed)], format: 'json' }
      }
    }
    catch {
      // Fall through to try JSONL / NDJSON
    }

    const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      try {
        const jsonlRows = lines.map(line => normalizeJsonRow(JSON.parse(line)))
        return { rows: jsonlRows, format: 'jsonl' }
      }
      catch {
        // Not valid JSONL — fall through to delimited parser
      }
    }
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ''
  const tabCount = (firstLine.match(/\t/g) ?? []).length
  const commaCount = (firstLine.match(/,/g) ?? []).length
  if (tabCount > 0 && tabCount >= commaCount) {
    return { rows: parseDelimitedText(cleaned, '\t'), format: 'tsv' }
  }
  return { rows: parseDelimitedText(cleaned, ','), format: 'csv' }
}

function looksLikeMcpJsonRpc(chunkText: string): boolean {
  const trimmed = chunkText.trimStart()
  if (trimmed.startsWith('Content-Length:'))
    return true
  return trimmed.startsWith('{') && /"jsonrpc"\s*:\s*"2\.0"/.test(trimmed)
}

interface StdinProbeResult {
  mode: 'mcp' | 'pipe' | 'empty'
  buffered: Buffer
  ended: boolean
}

function probeNonTtyStdin(): Promise<StdinProbeResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let settled = false

    const finish = (mode: StdinProbeResult['mode'], ended: boolean) => {
      if (settled)
        return
      settled = true
      process.stdin.off('data', onData)
      process.stdin.off('end', onEnd)
      process.stdin.off('error', onError)
      process.stdin.pause()
      resolve({ mode, buffered: Buffer.concat(chunks), ended })
    }

    const onData = (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      chunks.push(buf)
      totalBytes += buf.length
      const preview = Buffer.concat(chunks).toString('utf8')
      const trimmed = preview.trimStart()
      if (!trimmed)
        return
      if (looksLikeMcpJsonRpc(trimmed)) {
        finish('mcp', false)
        return
      }
      // Once we have a complete first line or >512 bytes without JSON-RPC markers, treat as piped data
      if (trimmed.includes('\n') || totalBytes >= 512 || (!trimmed.startsWith('{') && !trimmed.startsWith('C'))) {
        finish('pipe', false)
      }
    }

    const onEnd = () => {
      const combined = Buffer.concat(chunks)
      const text = combined.toString('utf8').trim()
      if (!text) {
        finish('empty', true)
        return
      }
      finish(looksLikeMcpJsonRpc(text) ? 'mcp' : 'pipe', true)
    }

    const onError = () => finish('empty', true)

    process.stdin.on('data', onData)
    process.stdin.on('end', onEnd)
    process.stdin.on('error', onError)
    process.stdin.resume()
  })
}

async function readRemainingStdin(initial: Buffer, alreadyEnded: boolean): Promise<string> {
  if (alreadyEnded)
    return initial.toString('utf8')
  const chunks: Buffer[] = initial.length > 0 ? [initial] : []
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk)
    })
    process.stdin.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.once('error', reject)
    process.stdin.resume()
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === 'init') {
    await runInitCommand(args.slice(1))
    return
  }
  if (args[0] === 'tui' || args[0] === 'attach') {
    await runTuiCommand(args.slice(1))
    return
  }

  const rawLicenseKey = resolveLicenseKey()
  const licenseKey = isMcpLicenseKey(rawLicenseKey) ? rawLicenseKey : undefined
  const demoToken = process.env.TINYPIVOT_DEMO_TOKEN
  const isPro = Boolean(licenseKey || demoToken)
  const store = new DatasetStore({
    maxRowsPerDataset: isPro ? Number.POSITIVE_INFINITY : FREE_TIER_ROW_LIMIT,
  })

  let appHtmlPath: string | undefined
  let explicitPort = false
  let port = process.env.TINYPIVOT_PORT ? Number(process.env.TINYPIVOT_PORT) : 0
  let disableCompanion = process.env.TINYPIVOT_NO_COMPANION === '1'
  let autoOpen = false
  let forceStdinPipe = false
  let showPivotOutput = false
  let datasetName: string | undefined
  const filesToLoad: string[] = []

  for (const arg of args) {
    if (arg.startsWith('--app-html=')) {
      appHtmlPath = arg.slice('--app-html='.length)
    }
    else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length)) || 0
      explicitPort = true
    }
    else if (arg.startsWith('--theme=')) {
      const requestedTheme = arg.slice('--theme='.length)
      if (isPro || requestedTheme.trim().toLowerCase() === 'code') {
        store.setVisualTheme(requestedTheme)
      }
    }
    else if (arg.startsWith('--name=')) {
      datasetName = arg.slice('--name='.length).trim() || undefined
    }
    else if (arg === '--no-companion') {
      disableCompanion = true
    }
    else if (arg === '--open') {
      autoOpen = true
    }
    else if (arg === '--stdin' || arg === '-') {
      forceStdinPipe = true
    }
    else if (arg === '--pivot') {
      showPivotOutput = true
    }
    else if (!arg.startsWith('--')) {
      filesToLoad.push(arg)
    }
  }

  // Lazy / idempotent Companion server manager so we never bind unused ports
  let companion: CompanionServerHandle | undefined
  let companionPromise: Promise<CompanionServerHandle | undefined> | null = null

  const ensureCompanionStarted = (): Promise<CompanionServerHandle | undefined> => {
    if (disableCompanion)
      return Promise.resolve(undefined)
    if (companion)
      return Promise.resolve(companion)
    if (companionPromise)
      return companionPromise
    companionPromise = startCompanionServer({
      store,
      loadHtml: () => loadAppHtml(appHtmlPath),
      licenseKey,
      demoToken,
      port,
    })
      .then((handle) => {
        companion = handle
        console.error(`[tinypivot-mcp] Companion Data IDE ready at ${handle.url}`)
        if (autoOpen)
          openInBrowser(handle.url)
        return handle
      })
      .catch((err) => {
        console.error('[tinypivot-mcp] Companion server disabled (could not bind localhost):', err instanceof Error ? err.message : err)
        return undefined
      })
    return companionPromise
  }

  let shuttingDown = false
  const cleanup = () => {
    if (shuttingDown)
      return
    shuttingDown = true
    void (companion?.close() ?? Promise.resolve()).finally(() => process.exit(0))
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Detect piped CSV/TSV/JSON/JSONL on stdin without breaking MCP JSON-RPC stdio hosts
  let probe: StdinProbeResult | null = null
  if (forceStdinPipe) {
    const raw = await readRemainingStdin(Buffer.alloc(0), false)
    probe = { mode: raw.trim() ? 'pipe' : 'empty', buffered: Buffer.from(raw, 'utf8'), ended: true }
  }
  else if (!process.stdin.isTTY && filesToLoad.length === 0) {
    probe = await probeNonTtyStdin()
  }

  if (probe?.mode === 'pipe') {
    const rawText = await readRemainingStdin(probe.buffered, probe.ended)
    const { rows, format } = parsePipedStdinData(rawText)
    if (rows.length === 0) {
      console.error('[tinypivot-mcp] No tabular rows detected on stdin.')
      process.exit(1)
    }

    const ds = store.register({
      name: datasetName || `stdin (${format.toUpperCase()})`,
      source: `stdin:${format}`,
      ingestionMode: 'direct',
      rows,
    })

    const truncSuffix = ds.truncatedForFreeTier
      ? ` (truncated from ${ds.sourceTotalRows.toLocaleString()} — Free tier limit: ${FREE_TIER_ROW_LIMIT.toLocaleString()} rows)`
      : ''
    console.error(`[tinypivot-mcp] Loaded ${ds.name} (${ds.rows.length.toLocaleString()} rows)${truncSuffix}`)

    const chartCard = formatTerminalChart(ds, ds.chartConfig, { showBranding: !isPro })
    if (chartCard) {
      console.log(chartCard)
    }
    else {
      console.log(formatDatasetSummary(ds, undefined, { showBranding: !isPro }))
    }

    if (showPivotOutput && ds.pivotConfig?.valueFields?.length) {
      const pivotCard = formatPivotSummary(ds, {
        rowFields: ds.pivotConfig.rowFields ?? [],
        columnFields: ds.pivotConfig.columnFields ?? [],
        valueFields: ds.pivotConfig.valueFields,
        showRowTotals: ds.pivotConfig.showRowTotals ?? true,
        showColumnTotals: ds.pivotConfig.showColumnTotals ?? true,
      }, undefined, { showBranding: !isPro })
      console.log(`\n${pivotCard}`)
    }

    if ((autoOpen || explicitPort) && !disableCompanion) {
      const handle = await ensureCompanionStarted()
      if (handle) {
        console.error(`[tinypivot-mcp] Serving live Companion IDE at ${handle.url} (press Ctrl+C to stop)`)
        await new Promise<void>(() => {})
      }
    }
    return
  }

  if (probe?.mode === 'empty') {
    return
  }

  for (const filePath of filesToLoad) {
    try {
      const ds = await store.loadFromFile(filePath, datasetName)
      const truncSuffix = ds.truncatedForFreeTier
        ? ` (truncated from ${ds.sourceTotalRows.toLocaleString()} — Free tier limit: ${FREE_TIER_ROW_LIMIT.toLocaleString()} rows)`
        : ''
      console.error(`[tinypivot-mcp] Loaded ${ds.name} (${ds.rows.length} rows)${truncSuffix}`)
    }
    catch (err) {
      console.error(`[tinypivot-mcp] Warning: failed to load "${filePath}":`, err instanceof Error ? err.message : err)
    }
  }

  // Start Companion eagerly only when user explicitly asks (--open, --port=, or CLI files passed).
  // Otherwise bind lazily on-demand only when a data tool runs in a terminal-only MCP host.
  const eagerCompanion = autoOpen || explicitPort || filesToLoad.length > 0
  if (eagerCompanion && !disableCompanion) {
    await ensureCompanionStarted()
  }

  const { server } = createTinyPivotMcpServer({
    store,
    appHtmlPath,
    licenseKey,
    demoToken,
    companionUrl: companion?.url,
    ensureCompanion: disableCompanion
      ? undefined
      : async () => (await ensureCompanionStarted())?.url,
    onStateChanged: () => companion?.broadcastUpdate(),
  })

  let transport: StdioServerTransport
  if (probe?.mode === 'mcp') {
    const passthrough = new PassThrough()
    if (probe.buffered.length > 0)
      passthrough.write(probe.buffered)
    if (probe.ended)
      passthrough.end()
    else
      process.stdin.pipe(passthrough)
    transport = new StdioServerTransport(passthrough, process.stdout)
  }
  else {
    transport = new StdioServerTransport()
  }

  transport.onclose = cleanup
  await server.connect(transport)
  console.error('[tinypivot-mcp] Ready on stdio (TinyPivot MCP App + Lazy Companion)')

  // Shut down Companion and exit cleanly whenever the MCP host drops stdio
  if (probe?.ended) {
    setTimeout(cleanup, 100)
  }
  else {
    process.stdin.once('end', cleanup)
    process.stdin.once('close', cleanup)
  }
}

main().catch((err) => {
  console.error('[tinypivot-mcp] Fatal startup error:', err)
  process.exit(1)
})
