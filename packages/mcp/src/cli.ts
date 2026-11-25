#!/usr/bin/env node
import type { ChartThemePreset } from '@smallwebco/tinypivot-core'
import type { CompanionServerHandle } from './companion.js'
import { spawn } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CHART_THEME_IDS, TERMINAL_PALETTES } from '@smallwebco/tinypivot-core'
import { startCompanionServer } from './companion.js'
import { runInitCommand } from './init.js'
import { createTinyPivotMcpServer, isMcpLicenseKey, loadAppHtml, resolveLicenseKey } from './server.js'
import { DatasetStore, FREE_TIER_ROW_LIMIT, getPreferencesPath, loadSavedVisualTheme, parseDelimitedText, saveVisualThemePreference } from './store.js'
import { Studio } from './studio.js'
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

/**
 * The Studio's usual port. Keeping it stable lets a Studio tab left open from an earlier session
 * reconnect on its own; when it is taken (another agent session), a free port is used instead.
 */
const STUDIO_PORT = 47317
/** How long to wait for an open Studio tab to reconnect before opening a new one. */
const STUDIO_RECONNECT_MS = 2500

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

function swatchBlock(rgb: [number, number, number]): string {
  return `\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m██\x1B[0m`
}

function formatThemeRow(id: ChartThemePreset, active: ChartThemePreset, selected: boolean, useColor: boolean): string {
  const pal = TERMINAL_PALETTES[id]
  const pointer = selected ? '›' : ' '
  const dot = id === active ? '●' : ' '
  const swatches = useColor
    ? `${swatchBlock(pal.series[0])} ${swatchBlock(pal.series[1])} ${swatchBlock(pal.series[2])}`
    : '■■■'
  const idCol = id.padEnd(11)
  const labelCol = pal.label.padEnd(11)
  const suffix = id === active ? ' (active)' : ''
  const line = `  ${pointer} ${dot} ${swatches}  ${idCol} ${labelCol}${suffix}`
  return useColor && selected ? `\x1B[1m${line}\x1B[0m` : line
}

async function runInteractiveThemePicker(active: ChartThemePreset): Promise<ChartThemePreset | null> {
  const themes = CHART_THEME_IDS
  let cursor = Math.max(0, themes.indexOf(active))
  const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)
  const totalLines = themes.length + 4
  let rendered = false

  const draw = () => {
    if (rendered) {
      process.stdout.write(`\x1B[${totalLines}A`)
    }
    rendered = true
    const out = [
      '\x1B[2K\x1B[1mTinyPivot MCP — Choose Visual Theme\x1B[0m  (↑/↓ move, Enter select, q cancel)',
      '\x1B[2K',
      ...themes.map((id, idx) => `\x1B[2K${formatThemeRow(id, active, idx === cursor, useColor)}`),
      '\x1B[2K',
      `\x1B[2K  Saves to ${getPreferencesPath()} (applies across all MCP sessions, Studio & TUI)`,
    ]
    process.stdout.write(`${out.join('\n')}\n`)
  }

  return new Promise((resolve) => {
    process.stdout.write('\x1B[?25l')
    draw()
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const finish = (choice: ChartThemePreset | null) => {
      process.stdin.off('data', onKey)
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\x1B[?25h')
      resolve(choice)
    }

    const onKey = (key: string) => {
      if (key === 'q' || key === '\u0003' || key === '\x1B') {
        finish(null)
        return
      }
      if (key === '\r' || key === '\n') {
        finish(themes[cursor])
        return
      }
      if (key === '\x1B[A' || key === 'k') {
        cursor = (cursor - 1 + themes.length) % themes.length
        draw()
      }
      else if (key === '\x1B[B' || key === 'j') {
        cursor = (cursor + 1) % themes.length
        draw()
      }
    }

    process.stdin.on('data', onKey)
  })
}

async function runThemeCommand(args: string[]): Promise<void> {
  const validSet = new Set<string>(CHART_THEME_IDS)
  const requested = args[0]?.trim().toLowerCase()
  const active = (process.env.TINYPIVOT_THEME?.trim().toLowerCase() && validSet.has(process.env.TINYPIVOT_THEME.trim().toLowerCase()))
    ? process.env.TINYPIVOT_THEME.trim().toLowerCase() as ChartThemePreset
    : (loadSavedVisualTheme() ?? 'code')
  const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)

  if (!requested && process.stdin.isTTY && process.stdout.isTTY) {
    console.log('')
    const picked = await runInteractiveThemePicker(active)
    console.log('')
    if (!picked) {
      console.log('Theme unchanged.')
      return
    }
    saveVisualThemePreference(picked)
    console.log(`✓ Default TinyPivot theme set to "${picked}" (${TERMINAL_PALETTES[picked].label})`)
    if (process.env.TINYPIVOT_THEME) {
      console.log(`  Note: TINYPIVOT_THEME=${process.env.TINYPIVOT_THEME} in your shell/harness env overrides preferences.json.`)
    }
    return
  }

  if (!requested || requested === '-h' || requested === '--help' || requested === 'list') {
    console.log('\nTinyPivot MCP — Visual Themes\n')
    for (const id of CHART_THEME_IDS) {
      console.log(formatThemeRow(id, active, false, useColor))
    }
    console.log(`\nPreferences file: ${getPreferencesPath()}`)
    if (process.env.TINYPIVOT_THEME) {
      console.log(`Note: TINYPIVOT_THEME=${process.env.TINYPIVOT_THEME} is set in env and overrides preferences.json.`)
    }
    console.log('\nUsage: npx @smallwebco/tinypivot-mcp theme [theme-id]\n')
    return
  }

  if (!validSet.has(requested)) {
    console.error(`Unknown theme "${requested}". Available themes: ${CHART_THEME_IDS.join(', ')}`)
    process.exit(1)
  }

  saveVisualThemePreference(requested as ChartThemePreset)
  console.log(`✓ Default TinyPivot theme set to "${requested}" (${TERMINAL_PALETTES[requested as ChartThemePreset].label}) — saved to ${getPreferencesPath()}`)
  console.log('  Applies immediately on next TinyPivot MCP turn, Studio load, or TUI launch.')
}

function printRootHelp(): void {
  console.log(`
TinyPivot MCP — Data Analysis Studio & Terminal Charts for AI Agents

Commands:
  tinypivot-mcp init [options]       Configure Claude Code, Claude Desktop, pi, Cursor, OpenCode, Codex & Antigravity
  tinypivot-mcp theme [id]           Interactive arrow-key theme picker (or set theme directly)
  tinypivot-mcp tui                  Attach a live truecolor split-pane TUI (Ghostty/tmux)
  <cmd> | tinypivot-mcp [options]    Pipe CSV/TSV/JSON/JSONL directly from psql, duckdb, bq, etc.

Options:
  --theme=<id>                       Visual theme (${CHART_THEME_IDS.join(', ')})
  --pivot                            Also print a framed sparkline pivot table on stdin pipe
  --open                             Open TinyPivot Studio in your browser now
  --port=<n>                         Serve the Studio on this localhost port (default 47317)
  --name=<title>                     Dataset title for piped stdin / loaded files
`.trim())
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '-h' || args[0] === '--help') {
    printRootHelp()
    return
  }
  if (args[0] === 'init') {
    await runInitCommand(args.slice(1))
    return
  }
  if (args[0] === 'tui' || args[0] === 'attach') {
    await runTuiCommand(args.slice(1))
    return
  }
  if (args[0] === 'theme' || args[0] === 'themes') {
    await runThemeCommand(args.slice(1))
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
  let port = process.env.TINYPIVOT_PORT ? Number(process.env.TINYPIVOT_PORT) : STUDIO_PORT
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

  const studio = new Studio(store)
  const startCompanion = (onPort: number) => startCompanionServer({
    store,
    studio,
    loadHtml: () => loadAppHtml(appHtmlPath),
    licenseKey,
    demoToken,
    port: onPort,
  })

  /** Opens the Studio unless a tab from an earlier session reconnects first. */
  const openStudioIfNoTab = (handle: CompanionServerHandle) => {
    setTimeout(() => {
      if (handle.clientCount() === 0)
        openInBrowser(handle.url)
    }, STUDIO_RECONNECT_MS).unref()
  }

  const ensureCompanionStarted = (openStudio = autoOpen): Promise<CompanionServerHandle | undefined> => {
    if (disableCompanion)
      return Promise.resolve(undefined)
    if (companion)
      return Promise.resolve(companion)
    if (companionPromise)
      return companionPromise
    companionPromise = startCompanion(port)
      .catch((err) => {
        if (explicitPort || process.env.TINYPIVOT_PORT)
          throw err
        return startCompanion(0)
      })
      .then((handle) => {
        companion = handle
        console.error(`[tinypivot-mcp] TinyPivot Studio ready at ${handle.url}`)
        if (autoOpen)
          openInBrowser(handle.url)
        else if (openStudio)
          openStudioIfNoTab(handle)
        return handle
      })
      .catch((err) => {
        console.error('[tinypivot-mcp] Studio disabled (could not bind localhost):', err instanceof Error ? err.message : err)
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

    const useTtyColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR)
    let liveCompanionUrl: string | undefined
    if ((autoOpen || explicitPort) && !disableCompanion) {
      const handle = await ensureCompanionStarted()
      liveCompanionUrl = handle?.url
    }

    const fmtOpts = {
      showBranding: !isPro,
      companionUrl: liveCompanionUrl,
      colorTheme: useTtyColor ? store.getVisualTheme() : undefined,
      raw: useTtyColor,
    }
    const chartCard = formatTerminalChart(ds, ds.chartConfig, fmtOpts)
    if (chartCard) {
      console.log(chartCard)
    }
    else {
      console.log(formatDatasetSummary(ds, liveCompanionUrl, fmtOpts))
    }

    if (showPivotOutput && ds.pivotConfig?.valueFields?.length) {
      const pivotCard = formatPivotSummary(ds, {
        rowFields: ds.pivotConfig.rowFields ?? [],
        columnFields: ds.pivotConfig.columnFields ?? [],
        valueFields: ds.pivotConfig.valueFields,
        showRowTotals: ds.pivotConfig.showRowTotals ?? true,
        showColumnTotals: ds.pivotConfig.showColumnTotals ?? true,
      }, liveCompanionUrl, fmtOpts)
      console.log(`\n${pivotCard}`)
    }

    if (liveCompanionUrl) {
      console.error(`[tinypivot-mcp] Serving live Studio at ${liveCompanionUrl} (press Ctrl+C to stop)`)
      await new Promise<void>(() => {})
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
    studio,
    appHtmlPath,
    licenseKey,
    demoToken,
    companionUrl: companion?.url,
    ensureCompanion: disableCompanion
      ? undefined
      // A terminal agent's first data step opens the Studio, unless TINYPIVOT_OPEN_STUDIO=0.
      : async () => (await ensureCompanionStarted(process.env.TINYPIVOT_OPEN_STUDIO !== '0'))?.url,
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
