#!/usr/bin/env node
/**
 * Mobile layout check for the built marketing site (run after `pnpm build:demo`).
 *
 * Serves dist-demo/ with `vite preview`, opens every URL in sitemap.xml at
 * 375×812 and fails when:
 *  - the page is wider than the viewport (sideways scrolling), or
 *  - on `/`, the hero install "Copy" button is below the first screen.
 *
 * Uses playwright-core with the locally installed Chrome (or CHROME_PATH).
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEWPORT = { width: 375, height: 812 }

function sitemapPaths() {
  const xml = readFileSync(resolve(ROOT, 'dist-demo/sitemap.xml'), 'utf-8')
  return [...xml.matchAll(/<loc>https:\/\/tiny-pivot\.com([^<]*)<\/loc>/g)].map(m => m[1] || '/')
}

async function launchBrowser() {
  const executablePath = process.env.CHROME_PATH
  return executablePath
    ? chromium.launch({ executablePath })
    : chromium.launch({ channel: 'chrome' })
}

async function checkPage(page, baseUrl, path) {
  await page.goto(baseUrl + path, { waitUntil: 'networkidle' })
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    copyBottom: document.querySelector('#install .install-copy')?.getBoundingClientRect().bottom ?? null,
  }))
  const problems = []
  if (layout.scrollWidth > layout.clientWidth)
    problems.push(`page is ${layout.scrollWidth}px wide in a ${layout.clientWidth}px viewport`)
  if (path === '/' && (layout.copyBottom === null || layout.copyBottom > VIEWPORT.height))
    problems.push(`install Copy button is not on the first screen (bottom: ${layout.copyBottom})`)
  return problems
}

async function main() {
  const server = await preview({ configFile: resolve(ROOT, 'vite.demo.config.ts'), preview: { port: 0 } })
  const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, '')
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: VIEWPORT, isMobile: true, hasTouch: true })

  let failures = 0
  try {
    for (const path of sitemapPaths()) {
      const problems = await checkPage(page, baseUrl, path)
      failures += problems.length
      console.log(`${problems.length ? '✗' : '✓'} ${path}${problems.map(p => `\n    ${p}`).join('')}`)
    }
  }
  finally {
    await browser.close()
    await new Promise(done => server.httpServer.close(done))
  }

  if (failures) {
    console.error(`\n${failures} mobile layout problem(s).`)
    process.exit(1)
  }
  console.log('\nAll pages fit a 375px viewport.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
