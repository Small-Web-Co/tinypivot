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
 *  3. For each route, call render(url) → renderToString() HTML fragment.
 *  4. Inject per-route <title>, meta description, canonical, JSON-LD into the
 *     built dist-demo/index.html shell, replacing <div id="app"></div>.
 *  5. Write the resulting HTML to dist-demo/<slug>/index.html (and
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

// All routes to prerender — must match demo/router/routes.ts
const ROUTES = [
  {
    url: '/',
    outFile: 'index.html',
    title: 'TinyPivot - Lightweight React & Vue Data Grid with Free Pivot Tables',
    description: 'Lightweight data grid for React and Vue with free pivot tables, Sum aggregation, totals, and calculated fields. Upgrade for charts, AI Analyst, advanced aggregations, and no watermark.',
    canonical: 'https://tiny-pivot.com/',
    jsonLd: null, // Home keeps its existing global JSON-LD from index.html
  },
  {
    url: '/vs-ag-grid',
    outFile: 'vs-ag-grid/index.html',
    title: 'TinyPivot vs AG Grid - Lightweight Pivot Table Comparison',
    description: 'Compare TinyPivot and AG Grid for React and Vue. TinyPivot is a focused data grid with free pivot tables and lifetime Pro licensing.',
    canonical: 'https://tiny-pivot.com/vs-ag-grid',
    jsonLd: null,
  },
  {
    url: '/best-react-pivot-table-libraries',
    outFile: 'best-react-pivot-table-libraries/index.html',
    title: 'Best React Pivot Table Libraries: How to Choose | TinyPivot',
    description: 'Compare the main approaches to adding pivot tables in React, from headless table libraries to batteries-included data grids.',
    canonical: 'https://tiny-pivot.com/best-react-pivot-table-libraries',
    jsonLd: makeArticleJsonLd('Best React Pivot Table Libraries: How to Choose', 'https://tiny-pivot.com/best-react-pivot-table-libraries'),
  },
  {
    url: '/best-vue-pivot-table-components',
    outFile: 'best-vue-pivot-table-components/index.html',
    title: 'Best Vue 3 Pivot Table Components: How to Choose | TinyPivot',
    description: 'Choose a Vue 3 pivot table component based on setup time, analytics features, customization needs, and licensing.',
    canonical: 'https://tiny-pivot.com/best-vue-pivot-table-components',
    jsonLd: makeArticleJsonLd('Best Vue 3 Pivot Table Components: How to Choose', 'https://tiny-pivot.com/best-vue-pivot-table-components'),
  },
  {
    url: '/ag-grid-alternatives',
    outFile: 'ag-grid-alternatives/index.html',
    title: 'AG Grid Alternatives for React and Vue | TinyPivot',
    description: 'Explore AG Grid alternatives for React and Vue when you want a focused data grid, pivot tables, and a simpler licensing model.',
    canonical: 'https://tiny-pivot.com/ag-grid-alternatives',
    jsonLd: makeArticleJsonLd('AG Grid Alternatives for React and Vue', 'https://tiny-pivot.com/ag-grid-alternatives'),
  },
  {
    url: '/react-data-grid-with-pivot-table',
    outFile: 'react-data-grid-with-pivot-table/index.html',
    title: 'Add a Data Grid with Pivot Tables to React | TinyPivot',
    description: 'Add an Excel-like React data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
    canonical: 'https://tiny-pivot.com/react-data-grid-with-pivot-table',
    jsonLd: makeArticleJsonLd('Add a Data Grid with Pivot Tables to React', 'https://tiny-pivot.com/react-data-grid-with-pivot-table'),
  },
  {
    url: '/vue-data-grid-with-pivot-table',
    outFile: 'vue-data-grid-with-pivot-table/index.html',
    title: 'Add a Data Grid with Pivot Tables to Vue 3 | TinyPivot',
    description: 'Add an Excel-like Vue 3 data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
    canonical: 'https://tiny-pivot.com/vue-data-grid-with-pivot-table',
    jsonLd: makeArticleJsonLd('Add a Data Grid with Pivot Tables to Vue 3', 'https://tiny-pivot.com/vue-data-grid-with-pivot-table'),
  },
  {
    url: '/embedded-ai-data-analyst-component',
    outFile: 'embedded-ai-data-analyst-component/index.html',
    title: 'Embed an AI Data Analyst in a React or Vue App | TinyPivot',
    description: 'Add natural-language data exploration to a React or Vue application with a BYOK AI Data Analyst and queries that run in your environment.',
    canonical: 'https://tiny-pivot.com/embedded-ai-data-analyst-component',
    jsonLd: makeArticleJsonLd('Embed an AI Data Analyst in a React or Vue App', 'https://tiny-pivot.com/embedded-ai-data-analyst-component'),
  },
  {
    url: '/vs-tanstack-table',
    outFile: 'vs-tanstack-table/index.html',
    title: 'TinyPivot vs TanStack Table | TinyPivot',
    description: 'Compare TinyPivot and TanStack Table for React or Vue: a batteries-included analytics component versus a flexible headless table foundation.',
    canonical: 'https://tiny-pivot.com/vs-tanstack-table',
    jsonLd: null,
  },
]

function makeArticleJsonLd(name, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': name,
    'url': url,
    'publisher': {
      '@type': 'Organization',
      'name': 'TinyPivot',
      'url': 'https://tiny-pivot.com',
    },
    'author': {
      '@type': 'Organization',
      'name': 'Small Web, LLC',
    },
  }, null, 2)
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
 */
function injectIntoHtml(baseHtml, route, renderedHtml) {
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
    '<div id="app"></div>',
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

  try {
    const { render } = await viteServer.ssrLoadModule('/entry-ssr.ts')

    for (const route of ROUTES) {
      console.log(`[prerender] Rendering ${route.url}`)
      let renderedHtml = ''

      try {
        renderedHtml = await render(route.url)
      }
      catch (err) {
        console.warn(`[prerender] SSR render failed for ${route.url}, using shell: ${err.message}`)
        // Fall back to an empty shell — meta tags + hydration still work
        renderedHtml = ''
      }

      const html = injectIntoHtml(baseHtml, route, renderedHtml)

      const outPath = resolve(DIST, route.outFile)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, html, 'utf-8')
      console.log(`[prerender] Wrote ${route.outFile}`)
    }
  }
  finally {
    await viteServer.close()
  }

  console.log('[prerender] Done. All routes prerendered.')
}

main().catch((err) => {
  console.error('[prerender] Fatal error:', err)
  process.exit(1)
})
