#!/usr/bin/env node
/**
 * Captures TinyPivot Studio for the homepage and its reel.
 *
 *   node scripts/reel/shoot-studio.mjs <data.csv> <output-dir>
 *
 * Starts the built MCP server the way a harness does (over stdio), makes the tool calls an agent
 * would, each with its `why`, then plays the user's side in the Studio page: a note to the agent
 * and an edited query. Real product screens, not mock-ups. The data folder's path is shown as
 * `~/<folder>/` so no local path appears in the images.
 * Build first: `pnpm build && pnpm build:mcp`. Set TINYPIVOT_LICENSE_KEY for the full file and themes.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const [dataPath, outputDir] = process.argv.slice(2)
if (!dataPath || !outputDir) {
  console.error('Usage: node scripts/reel/shoot-studio.mjs <data.csv> <output-dir>')
  process.exit(1)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MCP_DIR = join(ROOT, 'packages/mcp')
const VIEWPORT = { width: 1280, height: 800 }
const SETTLE_MS = 1600
const filePath = resolve(dataPath)
const dataFolder = `${dirname(filePath)}/`
const shownFolder = `~/${basename(dirname(filePath))}/`
const file = filePath.replace(/'/g, '\'\'')

/** The agent's side of the session. */
const AGENT_CALLS = [
  { name: 'set_visual_theme', arguments: { theme: 'crt-amber' } },
  { name: 'load_file', arguments: { filePath, name: 'Acme orders', viewMode: 'grid', why: 'Load the order export to see what columns and periods it covers' } },
  { name: 'profile', arguments: { why: 'Check ranges and empty values before aggregating' } },
  {
    name: 'query',
    arguments: {
      sql: `SELECT period, year, sum(mrr) AS mrr\nFROM '${file}'\nGROUP BY 1, 2\nORDER BY 1`,
      name: 'MRR by month',
      why: 'Trend of monthly MRR to compare 2025 with 2026',
      chartConfig: { type: 'line', xAxisField: 'period', yAxisField: 'mrr', aggregation: 'sum' },
    },
  },
  {
    name: 'query',
    arguments: {
      sql: `SELECT region, channel, sum(mrr) AS mrr, count(*) AS orders\nFROM '${file}'\nWHERE year = 2026\nGROUP BY 1, 2`,
      name: '2026 MRR by region and channel',
      why: 'Find which region and channel drive 2026 growth',
      pivotConfig: { rowFields: ['region'], columnFields: ['channel'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
    },
  },
  { name: 'configure_chart', arguments: { type: 'bar', xAxisField: 'region', yAxisField: 'mrr', seriesField: 'channel', aggregation: 'sum', why: 'Show the regional split as stacked bars for the summary' } },
]

/** The MCP SDK is a dependency of packages/mcp only, so it is resolved from there. */
async function importSdk(subpath) {
  const require = createRequire(pathToFileURL(join(MCP_DIR, 'package.json')))
  return import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${subpath}`)))
}

/** A server with its own history and settings, so shooting never touches the user's. */
async function connectServer(home) {
  const { Client } = await importSdk('client/index.js')
  const { StdioClientTransport } = await importSdk('client/stdio.js')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(MCP_DIR, 'dist/cli.js')],
    env: {
      ...process.env,
      TINYPIVOT_TELEMETRY: '0',
      TINYPIVOT_OPEN_STUDIO: '0',
      XDG_DATA_HOME: join(home, 'data'),
      XDG_CONFIG_HOME: join(home, 'config'),
    },
  })
  const client = new Client({ name: 'reel-shoot', version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)
  return client
}

function studioUrlFrom(result) {
  const text = result.content.map(part => part.text ?? '').join('\n')
  const url = text.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
  if (!url)
    throw new Error('The tool reply did not include the Studio address.')
  return url
}

async function shoot(page, name) {
  await page.evaluate(([from, to]) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.includes(from))
        node.nodeValue = node.nodeValue.split(from).join(to)
    }
    for (const field of document.querySelectorAll('textarea'))
      field.value = field.value.split(from).join(to)
  }, [dataFolder, shownFolder])
  await page.mouse.move(VIEWPORT.width - 4, VIEWPORT.height - 4)
  await page.waitForTimeout(250)
  const path = join(outputDir, `${name}.jpg`)
  await page.screenshot({ path, type: 'jpeg', quality: 84 })
  console.log(`wrote ${path}`)
}

mkdirSync(outputDir, { recursive: true })
const home = mkdtempSync(join(tmpdir(), 'tinypivot-shoot-'))
const client = await connectServer(home)
let studioUrl
for (const call of AGENT_CALLS) {
  const result = await client.callTool(call)
  if (result.isError)
    throw new Error(`${call.name} failed: ${result.content[0]?.text}`)
  studioUrl ??= call.name === 'load_file' ? studioUrlFrom(result) : undefined
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 })
await page.goto(studioUrl, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.tp-studio-step')
await page.waitForTimeout(SETTLE_MS)
const step = text => page.locator('.tp-studio-step-btn', { hasText: text })
const open = () => page.getByRole('button', { name: 'Open', exact: true }).click()

// The user's note about the double-counted channel.
await step('Trend of monthly MRR').click()
await page.getByRole('button', { name: 'Ask agent about this' }).click()
await page.locator('.tp-studio-note-input').fill('Exclude the Partner channel, it is double counted')
await page.getByRole('button', { name: 'Send to agent' }).click()
await page.waitForSelector('.tp-studio-step-user')

await open()
await page.waitForTimeout(SETTLE_MS)
await shoot(page, 'trace')

await page.getByRole('button', { name: 'Edit & run SQL' }).click()
const editor = page.locator('.tp-studio-sql-input')
await editor.fill((await editor.inputValue()).replace('GROUP BY 1, 2', 'WHERE channel <> \'Partner\'\nGROUP BY 1, 2'))
await page.locator('.tp-studio-name').fill('MRR by month, no Partner')
await shoot(page, 'edit')

await page.getByRole('button', { name: /^Run/ }).click()
await page.waitForSelector('.tp-studio-step-user .tp-studio-tag:text("sql")')
await page.waitForTimeout(SETTLE_MS)
await step('Trend of monthly MRR').click()
await shoot(page, 'rerun')

await step('Find which region and channel').click()
await open()
await page.waitForTimeout(SETTLE_MS)
await shoot(page, 'pivot')

await page.getByRole('button', { name: 'Ask agent about this' }).click()
await page.locator('.tp-studio-note-input').fill('Split 2026 by plan too, and flag any month where Sales fell more than 10%.')
await shoot(page, 'note')

await page.getByRole('tab', { name: /History/ }).click()
await page.getByRole('tab', { name: 'Rows' }).click()
await page.waitForTimeout(SETTLE_MS)
await shoot(page, 'history')

await browser.close()
await client.close()
rmSync(home, { recursive: true, force: true })
process.exit(0)
