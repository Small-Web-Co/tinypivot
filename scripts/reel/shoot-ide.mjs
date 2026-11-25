#!/usr/bin/env node
/**
 * Captures the interactive Data IDE for the homepage reel.
 *
 *   node scripts/reel/shoot-ide.mjs <data.csv> <output-dir>
 *
 * Starts the built MCP server the way a harness does (over stdio), sends it the same kind of
 * tool calls an agent would, and screenshots the live Data IDE after each one. The IDE is the
 * view desktop hosts embed inline, so these are real product screens, not mock-ups.
 * Build first: `pnpm build && pnpm build:mcp`. Set TINYPIVOT_LICENSE_KEY for the full file.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const [dataPath, outputDir] = process.argv.slice(2)
if (!dataPath || !outputDir) {
  console.error('Usage: node scripts/reel/shoot-ide.mjs <data.csv> <output-dir>')
  process.exit(1)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MCP_DIR = join(ROOT, 'packages/mcp')
const VIEWPORT = { width: 1280, height: 800 }
const SETTLE_MS = 1800
const filePath = resolve(dataPath)

/** Each shot: the tool call that sets the view up, and an optional tab to switch to first. */
const SHOTS = [
  {
    name: 'area',
    call: {
      name: 'load_file',
      arguments: {
        filePath,
        name: 'Acme Orders',
        chartConfig: { type: 'area', xAxisField: 'period', yAxisField: 'mrr', aggregation: 'sum', title: 'MRR per month' },
      },
    },
  },
  {
    name: 'stacked',
    call: {
      name: 'configure_chart',
      arguments: { type: 'stackedBar', xAxisField: 'region', yAxisField: 'mrr', aggregation: 'sum', seriesField: 'plan', title: 'MRR by region and plan' },
    },
  },
  {
    name: 'pivot',
    call: {
      name: 'configure_pivot',
      arguments: { rowFields: ['plan'], columnFields: ['channel'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
    },
  },
  { name: 'grid', tab: 'Data' },
  {
    name: 'partner',
    call: {
      name: 'load_file',
      arguments: {
        filePath,
        name: 'Partner orders, 2026',
        where: [{ field: 'channel', equals: ['Partner'] }, { field: 'year', equals: [2026] }],
        chartConfig: { type: 'bar', xAxisField: 'period', yAxisField: 'order_id', aggregation: 'count', title: 'Partner orders per month, 2026' },
      },
    },
  },
]

/** The MCP SDK is a dependency of packages/mcp only, so it is resolved from there. */
async function importSdk(subpath) {
  const require = createRequire(pathToFileURL(join(MCP_DIR, 'package.json')))
  return import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${subpath}`)))
}

async function connectServer() {
  const { Client } = await importSdk('client/index.js')
  const { StdioClientTransport } = await importSdk('client/stdio.js')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(MCP_DIR, 'dist/cli.js')],
    env: { ...process.env, TINYPIVOT_THEME: 'crt-amber', TINYPIVOT_TELEMETRY: '0' },
  })
  const client = new Client({ name: 'reel-shoot', version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)
  return client
}

function ideUrlFrom(result) {
  const text = result.content.map(part => part.text ?? '').join('\n')
  const url = text.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
  if (!url)
    throw new Error('The tool reply did not include the Data IDE address.')
  return url
}

mkdirSync(outputDir, { recursive: true })
const client = await connectServer()
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 })

for (const shot of SHOTS) {
  if (shot.call) {
    const result = await client.callTool(shot.call)
    if (page.url() === 'about:blank')
      await page.goto(ideUrlFrom(result), { waitUntil: 'networkidle' })
  }
  if (shot.tab)
    await page.getByText(shot.tab, { exact: true }).first().click()
  await page.waitForTimeout(SETTLE_MS)
  const path = join(outputDir, `${shot.name}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: 82 })
  console.log(`wrote ${path}`)
}

await browser.close()
await client.close()
process.exit(0)
