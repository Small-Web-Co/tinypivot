#!/usr/bin/env node
/**
 * Renders demo/public/favicon.svg to the PNG sizes referenced in demo/index.html.
 * Run after changing the SVG: node scripts/build-favicons.mjs
 * Uses playwright-core with the locally installed Chrome (or CHROME_PATH).
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../demo/public')
const SIZES = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
]

const svg = readFileSync(resolve(PUBLIC, 'favicon.svg'), 'utf-8')
const executablePath = process.env.CHROME_PATH
const browser = await (executablePath ? chromium.launch({ executablePath }) : chromium.launch({ channel: 'chrome' }))

for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: resolve(PUBLIC, file), clip: { x: 0, y: 0, width: size, height: size } })
  await page.close()
  console.log(`wrote demo/public/${file}`)
}

await browser.close()
