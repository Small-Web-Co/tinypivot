#!/usr/bin/env node
/**
 * Post-build prerender script for the TinyPivot demo site.
 *
 * Runs after `vite build --config vite.demo.config.ts` and produces a static
 * HTML file for each marketing route inside dist-demo/.
 *
 * Strategy:
 *  1. Start a Vite SSR dev-server (no output dir) pointed at the demo root.
 *  2. Load demo/entry-ssr.ts via ssrLoadModule — this avoids executing
 *     browser-only code at module level (duckdb-wasm, vercel analytics).
 *  3. Load demo/router/routes.ts via ssrLoadModule to derive the ROUTES list
 *     automatically — no more hardcoded list that must stay in sync.
 *  4. For each route, call render(url) → renderToString() HTML fragment.
 *  5. Inject per-route <title>, meta description, canonical, JSON-LD into the
 *     built dist-demo/index.html shell, replacing <div id="app"></div>.
 *  6. Write the resulting HTML to dist-demo/<slug>/index.html (and
 *     dist-demo/index.html for the root route).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = resolve(ROOT, 'dist-demo')
const BASE_URL = 'https://tiny-pivot.com'

/**
 * Routes excluded from prerender (e.g. post-purchase redirect, app pages).
 * All other routes defined in router/routes.ts will be prerendered.
 */
const EXCLUDED_PATHS = new Set(['/success'])

function makeArticleJsonLd(title, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': title,
    'url': url,
    'publisher': {
      '@type': 'Organization',
      'name': 'TinyPivot',
      'url': BASE_URL,
    },
    'author': {
      '@type': 'Organization',
      'name': 'Small Web, LLC',
    },
  }, null, 2)
}

/**
 * Derive the prerender route descriptor from a raw route definition.
 * Guide routes (those whose path matches a marketingGuides slug) get
 * Article JSON-LD; all others get null.
 */
function buildRouteDescriptor(routeDef, guideSlugSet) {
  const path = routeDef.path
  const meta = routeDef.meta ?? {}
  const title = meta.title ?? ''
  const description = meta.description ?? ''
  const canonical = BASE_URL + (path === '/' ? '/' : path)
  const outFile = path === '/' ? 'index.html' : `${path.replace(/^\//, '')}/index.html`
  const jsonLd = guideSlugSet.has(path.replace(/^\//, ''))
    ? makeArticleJsonLd(title, canonical)
    : null

  return { url: path, outFile, title, description, canonical, jsonLd }
}

/**
 * Inject per-route meta + SSR content into the base HTML template.
 * Replaces:
 *  - <title>...</title>
 *  - meta[name="description"] content attribute
 *  - meta[name="title"] content attribute
 *  - <link rel="canonical"> href attribute
 *  - og:title, og:description, og:url
 *  - twitter:title, twitter:description, twitter:url
 *  - Adds per-route JSON-LD (article schema for guide pages)
 *  - Replaces <div id="app"></div> with rendered HTML
 *
 * Throws if the <div id="app"></div> marker is missing — that indicates a
 * broken build template that would silently ship an un-hydrated page.
 */
function injectIntoHtml(baseHtml, route, renderedHtml) {
  const APP_MARKER = '<div id="app"></div>'
  if (!baseHtml.includes(APP_MARKER)) {
    throw new Error(
      `[prerender] Template is missing "${APP_MARKER}" — the build template has changed. `
      + 'Update prerender.mjs to match the new marker.',
    )
  }

  let html = baseHtml

  // Title
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(route.title)}</title>`,
  )

  // meta name="title"
  html = html.replace(
    /(<meta name="title" content=")[^"]*(")/,
    `$1${escapeHtml(route.title)}$2`,
  )

  // meta name="description"
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${escapeHtml(route.description)}$2`,
  )

  // canonical
  html = html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${route.canonical}$2`,
  )

  // og:title
  html = html.replace(
    /(<meta property="og:title" content=")[^"]*(")/,
    `$1${escapeHtml(route.title)}$2`,
  )

  // og:description
  html = html.replace(
    /(<meta property="og:description" content=")[^"]*(")/,
    `$1${escapeHtml(route.description)}$2`,
  )

  // og:url
  html = html.replace(
    /(<meta property="og:url" content=")[^"]*(")/,
    `$1${route.canonical}$2`,
  )

  // twitter:title
  html = html.replace(
    /(<meta name="twitter:title" content=")[^"]*(")/,
    `$1${escapeHtml(route.title)}$2`,
  )

  // twitter:description
  html = html.replace(
    /(<meta name="twitter:description" content=")[^"]*(")/,
    `$1${escapeHtml(route.description)}$2`,
  )

  // twitter:url
  html = html.replace(
    /(<meta name="twitter:url" content=")[^"]*(")/,
    `$1${route.canonical}$2`,
  )

  // Inject per-route JSON-LD before closing </head> (guide pages only)
  if (route.jsonLd) {
    const scriptTag = `\n  <script type="application/ld+json">\n  ${route.jsonLd}\n  </script>`
    html = html.replace('</head>', `${scriptTag}\n</head>`)
  }

  // Replace empty app div with SSR content
  html = html.replace(
    APP_MARKER,
    `<div id="app" data-v-app="">${renderedHtml}</div>`,
  )

  return html
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function main() {
  console.log('[prerender] Starting SSR prerender...')

  // Read the built index.html as the base template
  const baseHtml = readFileSync(resolve(DIST, 'index.html'), 'utf-8')

  // Validate the app marker before spending time rendering all routes
  const APP_MARKER = '<div id="app"></div>'
  if (!baseHtml.includes(APP_MARKER)) {
    console.error(
      `[prerender] FATAL: dist-demo/index.html is missing "${APP_MARKER}". `
      + 'The build template has changed — update prerender.mjs to match.',
    )
    process.exit(1)
  }

  // Create a Vite SSR server to load and render Vue components
  const viteServer = await createServer({
    plugins: [vue()],
    root: resolve(ROOT, 'demo'),
    envDir: ROOT,
    base: '/',
    resolve: {
      alias: {
        '@': resolve(ROOT, 'packages/vue/src'),
        'tinypivot/style.css': resolve(ROOT, 'packages/vue/src/style.css'),
        'tinypivot': resolve(ROOT, 'packages/vue/src/index.ts'),
        '@smallwebco/tinypivot-core': resolve(ROOT, 'packages/core/src/index.ts'),
        // Stub browser-only modules — these are only called in lifecycle hooks,
        // so stubs are safe for SSR rendering.
        '@duckdb/duckdb-wasm': resolve(ROOT, 'scripts/stubs/duckdb-wasm.mjs'),
        '@vercel/analytics': resolve(ROOT, 'scripts/stubs/vercel-analytics.mjs'),
      },
    },
    define: {
      __AI_MODEL__: JSON.stringify('AI Assistant'),
    },
    server: { middlewareMode: true },
    appType: 'custom',
    ssr: {
      // Externalize node-compatible packages so Vite doesn't try to bundle them.
      // Vue and vue-router ship ESM+CJS builds that Node can load directly.
      external: ['vue', 'vue-router', '@vue/server-renderer', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom', '@vue/shared'],
    },
    logLevel: 'warn',
  })

  const failures = []

  try {
    const { render } = await viteServer.ssrLoadModule('/entry-ssr.ts')

    // Load route definitions from the single source of truth.
    // marketingGuides is used to identify which routes get Article JSON-LD.
    const { routeDefinitions, marketingGuides } = await viteServer.ssrLoadModule('/router/routes.ts')

    const guideSlugSet = new Set(marketingGuides.map(g => g.slug))

    // Build descriptors for every route, excluding non-public paths
    const ROUTES = routeDefinitions
      .filter(r => !EXCLUDED_PATHS.has(r.path))
      .map(r => buildRouteDescriptor(r, guideSlugSet))

    console.log(`[prerender] Found ${ROUTES.length} routes to prerender`)

    for (const route of ROUTES) {
      console.log(`[prerender] Rendering ${route.url}`)

      let renderedHtml
      try {
        renderedHtml = await render(route.url)
      }
      catch (err) {
        console.error(`[prerender] SSR render FAILED for ${route.url}: ${err.message}`)
        failures.push({ url: route.url, error: err.message })
        continue
      }

      let html
      try {
        html = injectIntoHtml(baseHtml, route, renderedHtml)
      }
      catch (err) {
        console.error(`[prerender] HTML injection FAILED for ${route.url}: ${err.message}`)
        failures.push({ url: route.url, error: err.message })
        continue
      }

      const outPath = resolve(DIST, route.outFile)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, html, 'utf-8')
      console.log(`[prerender] Wrote ${route.outFile}`)
    }
  }
  finally {
    await viteServer.close()
  }

  if (failures.length > 0) {
    console.error('\n[prerender] BUILD FAILED — the following routes did not prerender:')
    for (const f of failures) {
      console.error(`  ${f.url}: ${f.error}`)
    }
    process.exit(1)
  }

  console.log('[prerender] Done. All routes prerendered.')
}

main().catch((err) => {
  console.error('[prerender] Fatal error:', err)
  process.exit(1)
})
