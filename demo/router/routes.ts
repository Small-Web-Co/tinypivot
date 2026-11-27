import { privacyPolicy, termsOfService } from '../site/legal'

/**
 * Shared route definitions — used by both the client router and the SSR prerender.
 * Extracted so the SSR entry can reuse them without the DOM-touching beforeEach guard.
 */
export const marketingGuides = [
  {
    slug: 'best-react-pivot-table-libraries',
    title: 'Best React Pivot Table Libraries: How to Choose | TinyPivot',
    description: 'Compare the main approaches to adding pivot tables in React, from headless table libraries to batteries-included data grids.',
  },
  {
    slug: 'best-vue-pivot-table-components',
    title: 'Best Vue 3 Pivot Table Components: How to Choose | TinyPivot',
    description: 'Choose a Vue 3 pivot table component based on setup time, analytics features, customization needs, and licensing.',
  },
  {
    slug: 'ag-grid-alternatives',
    title: 'AG Grid Alternatives for React and Vue | TinyPivot',
    description: 'Explore AG Grid alternatives for React and Vue when you want a focused data grid, pivot tables, and a simpler licensing model.',
  },
  {
    slug: 'react-data-grid-with-pivot-table',
    title: 'Add a Data Grid with Pivot Tables to React | TinyPivot',
    description: 'Add an Excel-like React data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
  },
  {
    slug: 'vue-data-grid-with-pivot-table',
    title: 'Add a Data Grid with Pivot Tables to Vue 3 | TinyPivot',
    description: 'Add an Excel-like Vue 3 data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
  },
  {
    slug: 'embedded-ai-data-analyst-component',
    title: 'Embed an AI Data Analyst in a React or Vue App | TinyPivot',
    description: 'Add natural-language data exploration to a React or Vue application with a BYOK AI Data Analyst and queries that run in your environment.',
  },
  {
    slug: 'vs-tanstack-table',
    title: 'TinyPivot vs TanStack Table | TinyPivot',
    description: 'Compare TinyPivot and TanStack Table for React or Vue: a batteries-included analytics component versus a flexible headless table foundation.',
  },
  {
    slug: 'react-pivot-table-no-watermark',
    title: 'React Pivot Table Without Watermark | TinyPivot',
    description: 'Remove the TinyPivot watermark in React with a one-time Pro license. Get full aggregations, charts, AI Analyst, and XLSX export — no subscription.',
  },
  {
    slug: 'vue-pivot-table-free',
    title: 'Vue 3 Pivot Table Component — Free Tier Guide | TinyPivot',
    description: 'Get a free Vue 3 pivot table with sorting, filtering, CSV export, and Sum aggregation. Upgrade once for advanced analytics — no recurring subscription.',
  },
  {
    slug: 'react-datagrid-csv-export',
    title: 'React Data Grid with CSV Export | TinyPivot',
    description: 'React data grid with built-in CSV export. TinyPivot includes one-click export in the free tier alongside sorting, filtering, search, and pivot tables.',
  },
  {
    slug: 'vue-datagrid-filter-sort-search',
    title: 'Vue Data Grid with Filter, Sort, and Search | TinyPivot',
    description: 'Vue 3 data grid with built-in filtering, sorting, and full-text search. Free tier in TinyPivot — no configuration, no plugins, no subscription required.',
  },
  {
    slug: 'react-datagrid-calculated-fields',
    title: 'React Data Grid with Calculated Fields | TinyPivot',
    description: 'Add calculated fields to a React data grid for free with TinyPivot. Define derived metrics like margin or growth rate — no backend changes required.',
  },
  {
    slug: 'vue-datagrid-column-resize',
    title: 'Vue 3 Data Grid with Column Resize | TinyPivot',
    description: 'Vue 3 data grid with built-in column resize. TinyPivot includes drag-to-resize in the free tier — no configuration, no plugins, no subscription.',
  },
  {
    slug: 'nextjs-datagrid-pivot-table',
    title: 'Next.js Data Grid with Pivot Table | TinyPivot',
    description: 'Add a data grid and pivot table to a Next.js app with TinyPivot React. Free tier includes sorting, filtering, CSV export, and Sum aggregation — no subscription.',
  },
] as const

/**
 * Anchors from the old single-page site. Published package versions, READMEs and
 * upgrade prompts link to these, so they must keep landing somewhere useful.
 */
export const legacyAnchors: Readonly<Record<string, string>> = {
  '/#pricing': '/pricing?product=ui',
  '/#demo': '/ui#demo',
  '/#features': '/ui',
  '/#quickstart': '/ui#quickstart',
  '/#ai-analyst': '/ui#ai-analyst',
  '/docs#pricing': '/pricing',
}

export type MarketingGuideSlug = typeof marketingGuides[number]['slug']

export const routeDefinitions = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/Home.vue'),
    meta: {
      title: 'TinyPivot — The Data-Analysis Sidecar for AI Agents',
      description: 'TinyPivot runs alongside Claude, Cursor, Codex and other AI agents as a sidecar for data work: it works with any data your agent can reach, from spreadsheets to Snowflake, catches the math mistakes AI quietly makes, and shows the SQL behind every number. 53,000+ npm downloads.',
    },
  },
  {
    path: '/ui',
    name: 'ui',
    component: () => import('../pages/Ui.vue'),
    meta: {
      title: 'TinyPivot UI — React & Vue 3 Data Grid, Pivot Tables, Charts & AI Analyst',
      description: 'Lightweight React and Vue 3 data grid with free pivot tables, charts, calculated fields and a BYOK AI Data Analyst. One-time licenses from $49.',
    },
  },
  {
    path: '/docs',
    name: 'docs',
    component: () => import('../pages/Docs.vue'),
    meta: {
      title: 'TinyPivot MCP Docs — Setup, Tools & Token Savings Calculator',
      description: 'Add TinyPivot to Claude Code, Cursor, Codex, Antigravity, OpenCode or pi with one command. Setup, prompts to try, tool reference and a token savings calculator.',
    },
  },
  {
    path: '/whitepaper',
    name: 'whitepaper',
    component: () => import('../pages/Whitepaper.vue'),
    meta: {
      title: 'Can You Trust an AI Agent With Your Numbers? — White Paper & Benchmarks | TinyPivot',
      description: 'How much TinyPivot reduces silent AI analysis mistakes: 91% → 100% across 5 models on 18 trap-laden tasks, 72.5% → 75.2% on MIT KramaBench, and blind-scored Adyen DABstep submissions.',
    },
  },
  {
    path: '/pricing',
    name: 'pricing',
    component: () => import('../pages/Pricing.vue'),
    meta: {
      title: 'TinyPivot Pricing — AI Agent Sidecar & React/Vue Library',
      description: 'TinyPivot Free: unlimited rows, charts, pivots and the Studio, with no signup. Pro adds deep checks, one-step statistics, memory, Excel export and Postgres, from $149/year or $399 once. React & Vue library licenses from $49.',
    },
  },
  {
    path: '/mcp',
    redirect: (to: { hash: string }) => ({ path: '/docs', hash: to.hash }),
  },
  {
    path: '/vs-ag-grid',
    name: 'vs-ag-grid',
    component: () => import('../pages/VsAgGrid.vue'),
    meta: {
      title: 'TinyPivot vs AG Grid - Lightweight Pivot Table Comparison',
      description: 'Compare TinyPivot and AG Grid for React and Vue. TinyPivot is a focused data grid with free pivot tables and lifetime Pro licensing.',
    },
  },
  {
    path: '/privacy',
    name: 'privacy',
    component: () => import('../pages/Legal.vue'),
    props: { doc: privacyPolicy },
    meta: {
      title: 'Privacy policy | TinyPivot',
      description: 'What TinyPivot sends and what stays on your computer: anonymous MCP usage statistics, payments through Stripe, and the tiny-pivot.com website.',
    },
  },
  {
    path: '/terms',
    name: 'terms',
    component: () => import('../pages/Legal.vue'),
    props: { doc: termsOfService },
    meta: {
      title: 'Terms of service | TinyPivot',
      description: 'The terms for using TinyPivot: the MCP server and Studio, the React and Vue libraries, paid plans and the tiny-pivot.com website.',
    },
  },
  ...marketingGuides.map(guide => ({
    path: `/${guide.slug}`,
    name: guide.slug,
    component: () => import('../pages/MarketingGuide.vue'),
    props: { slug: guide.slug },
    meta: {
      title: guide.title,
      description: guide.description,
    },
  })),
]
