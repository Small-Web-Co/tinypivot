#!/usr/bin/env node
import type { CompanionServerHandle } from './companion.js'
import { spawn } from 'node:child_process'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startCompanionServer } from './companion.js'
import { runInitCommand } from './init.js'
import { createTinyPivotMcpServer, loadAppHtml, resolveLicenseKey } from './server.js'
import { DatasetStore, FREE_TIER_ROW_LIMIT } from './store.js'

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

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === 'init') {
    await runInitCommand(args.slice(1))
    return
  }

  const licenseKey = resolveLicenseKey()
  const demoToken = process.env.TINYPIVOT_DEMO_TOKEN
  const isPro = Boolean((licenseKey && licenseKey.startsWith('TP-')) || demoToken)
  const store = new DatasetStore({
    maxRowsPerDataset: isPro ? Number.POSITIVE_INFINITY : FREE_TIER_ROW_LIMIT,
  })

  let appHtmlPath: string | undefined
  let port = process.env.TINYPIVOT_PORT ? Number(process.env.TINYPIVOT_PORT) : 0
  let disableCompanion = process.env.TINYPIVOT_NO_COMPANION === '1'
  let autoOpen = false
  const filesToLoad: string[] = []

  for (const arg of args) {
    if (arg.startsWith('--app-html=')) {
      appHtmlPath = arg.slice('--app-html='.length)
    }
    else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length)) || 0
    }
    else if (arg.startsWith('--theme=')) {
      const requestedTheme = arg.slice('--theme='.length)
      if (isPro || requestedTheme.trim().toLowerCase() === 'code') {
        store.setVisualTheme(requestedTheme)
      }
    }
    else if (arg === '--no-companion') {
      disableCompanion = true
    }
    else if (arg === '--open') {
      autoOpen = true
    }
    else if (!arg.startsWith('--')) {
      filesToLoad.push(arg)
    }
  }

  for (const filePath of filesToLoad) {
    try {
      const ds = await store.loadFromFile(filePath)
      const truncSuffix = ds.truncatedForFreeTier
        ? ` (truncated from ${ds.sourceTotalRows.toLocaleString()} — Free tier limit: ${FREE_TIER_ROW_LIMIT.toLocaleString()} rows)`
        : ''
      console.error(`[tinypivot-mcp] Loaded ${ds.name} (${ds.rows.length} rows)${truncSuffix}`)
    }
    catch (err) {
      console.error(`[tinypivot-mcp] Warning: failed to load "${filePath}":`, err instanceof Error ? err.message : err)
    }
  }

  let companion: CompanionServerHandle | undefined
  if (!disableCompanion) {
    try {
      companion = await startCompanionServer({
        store,
        loadHtml: () => loadAppHtml(appHtmlPath),
        licenseKey,
        demoToken,
        port,
      })
      console.error(`[tinypivot-mcp] Companion Data IDE ready at ${companion.url}`)
      if (autoOpen)
        openInBrowser(companion.url)
    }
    catch (err) {
      console.error('[tinypivot-mcp] Companion server disabled (could not bind localhost):', err instanceof Error ? err.message : err)
    }
  }

  const { server } = createTinyPivotMcpServer({
    store,
    appHtmlPath,
    licenseKey,
    demoToken,
    companionUrl: companion?.url,
    onStateChanged: () => companion?.broadcastUpdate(),
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[tinypivot-mcp] Ready on stdio (TinyPivot MCP App + Terminal Companion)')

  const cleanup = () => {
    void companion?.close().finally(() => process.exit(0))
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main().catch((err) => {
  console.error('[tinypivot-mcp] Fatal startup error:', err)
  process.exit(1)
})
