<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'

interface GuideSection {
  title: string
  paragraphs: string[]
  bullets?: string[]
}

interface Guide {
  title: string
  eyebrow: string
  description: string
  intro: string
  sections: GuideSection[]
}

const props = defineProps<{
  slug: string
}>()

const guides: Record<string, Guide> = {
  'best-react-pivot-table-libraries': {
    title: 'Best React Pivot Table Libraries: How to Choose',
    eyebrow: 'React Guide',
    description: 'Compare the main approaches to adding pivot tables in React, from headless table libraries to batteries-included data grids.',
    intro: 'The best React pivot table library depends on whether you want a focused component, a fully custom table foundation, or an enterprise grid suite. This guide explains the tradeoffs and where TinyPivot fits.',
    sections: [
      {
        title: 'Start with the product decision',
        paragraphs: ['A pivot table is usually part of a larger analytics workflow. Before comparing packages, decide whether your users need a ready-made grid, a toolkit for building a custom table, or a broad enterprise platform.'],
        bullets: [
          'Choose a focused component when you want filtering, sorting, CSV export, and pivoting without assembling the interface yourself.',
          'Choose a headless library when custom rendering matters more than built-in analytics controls.',
          'Choose an enterprise suite when you need a much wider feature surface and have the budget for it.',
        ],
      },
      {
        title: 'Where TinyPivot fits',
        paragraphs: ['TinyPivot is a focused React data grid with free pivot tables. The free tier includes Sum aggregation, totals, calculated fields, filtering, sorting, and CSV export. Pro adds advanced aggregations, charts, an optional BYOK AI Data Analyst, and watermark removal.'],
        bullets: ['Dedicated React package with TypeScript types', 'Pass an array of objects and render a DataGrid', 'Lifetime Pro licensing instead of a recurring subscription'],
      },
      {
        title: 'When to look elsewhere',
        paragraphs: ['TinyPivot is intentionally smaller in scope than a full enterprise grid. If your application requires server-side row grouping, master-detail views, Angular support, or a deeply custom headless rendering layer, compare broader alternatives before committing.'],
      },
    ],
  },
  'best-vue-pivot-table-components': {
    title: 'Best Vue 3 Pivot Table Components: How to Choose',
    eyebrow: 'Vue 3 Guide',
    description: 'Choose a Vue 3 pivot table component based on setup time, analytics features, customization needs, and licensing.',
    intro: 'Vue teams often face a choice between building a pivot interface from smaller primitives and adopting a complete grid component. TinyPivot is designed for teams that want a working analytics surface quickly.',
    sections: [
      {
        title: 'What to compare',
        paragraphs: ['A useful Vue pivot table comparison should cover the whole workflow, not just aggregation output. Look at filtering, field configuration, totals, calculated fields, export, theming, and the work required to ship a polished interface.'],
        bullets: ['Vue 3 Composition API compatibility', 'TypeScript support', 'Drag-and-drop pivot configuration', 'Clear free and paid boundaries'],
      },
      {
        title: 'Where TinyPivot fits',
        paragraphs: ['TinyPivot provides a dedicated Vue 3 package with the same product behavior as its React package. The free tier includes an Excel-like grid and pivot tables with Sum aggregation. Pro unlocks richer analytics features while keeping setup small.'],
      },
      {
        title: 'When to look elsewhere',
        paragraphs: ['Choose a more expansive grid suite if your team needs enterprise-only workflows beyond TinyPivot’s focused scope. Choose smaller primitives if every part of the table interface must be custom-built.'],
      },
    ],
  },
  'ag-grid-alternatives': {
    title: 'AG Grid Alternatives for React and Vue',
    eyebrow: 'Comparison Guide',
    description: 'Explore AG Grid alternatives for React and Vue when you want a focused data grid, pivot tables, and a simpler licensing model.',
    intro: 'AG Grid is a capable enterprise grid. It is also more product than many application teams need. If your requirement is a lightweight data grid with pivot tables, compare alternatives by scope, integration effort, and licensing model.',
    sections: [
      {
        title: 'Choose based on the job',
        paragraphs: ['The right alternative depends on what you are building. A dashboard with filtering, exports, pivot tables, and charts has different needs from a spreadsheet editor or a server-driven enterprise reporting platform.'],
        bullets: ['Use TinyPivot for a focused React or Vue analytics component with free pivoting.', 'Use a headless table library when you want to design and assemble the interface yourself.', 'Use a broad enterprise grid when advanced server-side and spreadsheet-style workflows justify the larger surface area.'],
      },
      {
        title: 'Why teams consider TinyPivot',
        paragraphs: ['TinyPivot aims for a narrower, easier-to-adopt feature set: an Excel-like grid, free pivot tables, calculated fields, 22 themes, Pro charts, and an optional BYOK AI Data Analyst. Pro licenses are lifetime purchases.'],
      },
      {
        title: 'Compare the details',
        paragraphs: ['For a direct feature-by-feature discussion, read the TinyPivot vs AG Grid page. It includes the cases where AG Grid remains the better choice.'],
      },
    ],
  },
  'react-data-grid-with-pivot-table': {
    title: 'Add a Data Grid with Pivot Tables to React',
    eyebrow: 'React Tutorial',
    description: 'Add an Excel-like React data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
    intro: 'TinyPivot is designed to make a common dashboard requirement pleasantly short: pass your records to one React component, then let users search, filter, export, and build pivot tables.',
    sections: [
      {
        title: 'Install the React package',
        paragraphs: ['Install @smallwebco/tinypivot-react, import DataGrid and the stylesheet, then pass an array of flat objects. Object keys become columns automatically, so a basic integration does not need a column schema.'],
      },
      {
        title: 'What users get in the free tier',
        paragraphs: ['The free tier includes the core grid and pivot workflow: sorting, filtering, search, CSV export, keyboard navigation, Sum aggregation, row and column totals, and calculated fields.'],
      },
      {
        title: 'Upgrade when the product needs more',
        paragraphs: ['Pro adds advanced aggregations, a drag-and-drop chart builder, an optional AI Data Analyst, and watermark removal. The same React component exposes the upgraded capabilities after license activation.'],
      },
    ],
  },
  'vue-data-grid-with-pivot-table': {
    title: 'Add a Data Grid with Pivot Tables to Vue 3',
    eyebrow: 'Vue 3 Tutorial',
    description: 'Add an Excel-like Vue 3 data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
    intro: 'TinyPivot gives Vue 3 applications a complete grid and pivot workflow through one component. It is intended for dashboards, internal tools, and embedded analytics views that should be useful immediately.',
    sections: [
      {
        title: 'Install the Vue package',
        paragraphs: ['Install @smallwebco/tinypivot-vue, import DataGrid and the stylesheet, then bind your array of flat records to the data prop. TinyPivot derives columns from the objects by default.'],
      },
      {
        title: 'Start with free pivot tables',
        paragraphs: ['Users can search, sort, filter, export, and build pivot tables with Sum aggregation and totals in the free tier. Calculated fields support common derived metrics such as profit margin.'],
      },
      {
        title: 'Use Pro for richer analytics',
        paragraphs: ['Pro adds advanced aggregations, charts, an optional BYOK AI Data Analyst, and watermark removal. A TinyPivot license works with both the Vue and React packages.'],
      },
    ],
  },
  'embedded-ai-data-analyst-component': {
    title: 'Embed an AI Data Analyst in a React or Vue App',
    eyebrow: 'AI Analytics Guide',
    description: 'Add natural-language data exploration to a React or Vue application with a BYOK AI Data Analyst and queries that run in your environment.',
    intro: 'An embedded AI Data Analyst can let users ask plain-English questions about application data without learning SQL. TinyPivot Pro combines that workflow with a grid, pivot tables, and charts.',
    sections: [
      {
        title: 'Use your own AI provider',
        paragraphs: ['TinyPivot follows a bring-your-own-key model. Your application configures the endpoint and provider integration, which gives you control over model choice, cost, and operational boundaries.'],
      },
      {
        title: 'Keep query execution in your environment',
        paragraphs: ['TinyPivot can generate SQL from the available schema while your application executes queries against its own backend or a client-side engine such as DuckDB WASM. That keeps data processing under your control.'],
      },
      {
        title: 'Return results to a useful analytics surface',
        paragraphs: ['Generated results appear in the same grid where users can continue exploring with filters, pivot tables, and charts. The goal is not a detached chatbot; it is a faster route into analysis.'],
      },
    ],
  },
  'vs-tanstack-table': {
    title: 'TinyPivot vs TanStack Table',
    eyebrow: 'Comparison Guide',
    description: 'Compare TinyPivot and TanStack Table for React or Vue: a batteries-included analytics component versus a flexible headless table foundation.',
    intro: 'TinyPivot and TanStack Table solve different problems. TanStack Table is a strong choice for custom table experiences. TinyPivot is a strong choice when you want an analytics-ready grid with pivot tables already assembled.',
    sections: [
      {
        title: 'Choose TanStack Table for control',
        paragraphs: ['TanStack Table is headless. Your team controls markup, rendering, styling, and the surrounding interaction design. That is valuable when a table must fit a highly specific product experience.'],
      },
      {
        title: 'Choose TinyPivot for a finished workflow',
        paragraphs: ['TinyPivot ships an Excel-like grid, search, filtering, export, keyboard navigation, pivot tables, totals, calculated fields, and themes. Pro adds advanced aggregations, charts, and an optional AI Data Analyst.'],
      },
      {
        title: 'Measure engineering time as well as bundle size',
        paragraphs: ['A smaller primitive is not always the smallest product decision. Compare the time required to assemble pivot controls, styling, exports, and analytics features against the focused component approach.'],
      },
    ],
  },
  'react-pivot-table-no-watermark': {
    title: 'React Pivot Table Without Watermark',
    eyebrow: 'React Feature Guide',
    description: 'Remove the TinyPivot watermark in React with a one-time Pro license. Get full aggregations, charts, AI Analyst, and XLSX export — no subscription.',
    intro: 'TinyPivot ships a fully functional React pivot table in its free tier, including sorting, filtering, search, pagination, CSV export, calculated fields, and 22 themes. The free tier displays a small watermark. A one-time Pro license removes it permanently.',
    sections: [
      {
        title: 'What the free tier includes',
        paragraphs: ['The free tier of TinyPivot for React is a complete data grid with a built-in pivot workflow. It is not a crippled trial: sorting, filtering, search, pagination, column resize, calculated fields, and CSV export are all available at no cost.', 'The pivot table in the free tier supports Sum aggregation with row and column totals. The free tier also includes 22 built-in themes, so the component can match your application\'s design without writing custom CSS.'],
        bullets: [
          'Sort, filter, search, and paginate any array of records',
          'Sum aggregation with row and column totals in the pivot view',
          'Calculated fields for derived metrics such as margin or variance',
          'CSV export and column resize included',
          '22 built-in themes including dark and light variants',
        ],
      },
      {
        title: 'How the watermark works',
        paragraphs: ['The free tier renders a small "TinyPivot" watermark inside the component. It does not obscure your data or prevent interaction. It is visible to your users and signals that the free edition is in use.', 'The watermark is removed as soon as a valid Pro license key is applied. No rebuild or code change is needed beyond supplying the key.'],
      },
      {
        title: 'Remove the watermark with a Pro license',
        paragraphs: ['TinyPivot Pro is a one-time perpetual purchase — not a subscription. Licenses are available at three tiers: Single ($49), Unlimited ($149), and Team ($399). A license covers both the React and Vue packages.'],
        bullets: [
          'Single ($49): one production domain, watermark removed',
          'Unlimited ($149): unlimited domains, watermark removed',
          'Team ($399): unlimited domains plus team seat coverage',
        ],
      },
      {
        title: 'What else Pro unlocks',
        paragraphs: ['Removing the watermark is one benefit of Pro. The license also unlocks the full aggregation set (Count, Count Distinct, Average, Min, Max, Median, Standard Deviation), a drag-and-drop chart builder, pivot drill-through to underlying rows, styled XLSX export, and session persistence that remembers a user\'s pivot configuration across page loads.', 'Pro also includes an optional AI Data Analyst. It follows a bring-your-own-key model, so you configure the provider — OpenAI, Anthropic, or OpenRouter — and TinyPivot routes natural-language queries through your own API key.'],
      },
      {
        title: 'Install TinyPivot in a React project',
        paragraphs: ['TinyPivot for React ships as @smallwebco/tinypivot-react. The bundle is approximately 40 KB gzipped. Pass an array of flat objects to the DataGrid component and it derives columns automatically — no schema definition required for a basic integration.'],
      },
    ],
  },
  'vue-pivot-table-free': {
    title: 'Vue 3 Pivot Table Component — Free Tier Guide',
    eyebrow: 'Vue 3 Feature Guide',
    description: 'Get a free Vue 3 pivot table with sorting, filtering, CSV export, and Sum aggregation. Upgrade once for advanced analytics — no recurring subscription.',
    intro: 'TinyPivot for Vue 3 ships as @smallwebco/tinypivot-vue and includes a complete data grid plus a pivot table in its free tier. No account required, no time limit. The free tier adds a small watermark; a one-time Pro license removes it and unlocks advanced analytics.',
    sections: [
      {
        title: 'What is free in TinyPivot for Vue 3',
        paragraphs: ['The free tier is not a restricted preview — it is a production-ready Vue 3 data grid and pivot table. You get sorting, filtering, search, pagination, column resize, calculated fields, CSV export, and 22 built-in themes at no cost.', 'The pivot workflow in the free tier supports Sum aggregation with row and column totals. Users can drag fields to build pivot views interactively, and the component derives columns from your array of records without a schema definition.'],
        bullets: [
          'Sort, filter, search, and paginate any data source',
          'Sum aggregation with row and column totals in the pivot view',
          'Calculated fields for metrics like margin, ratio, or growth',
          'CSV export and column resize built in',
          '22 themes including dark and light variants — no custom CSS needed',
        ],
      },
      {
        title: 'Install in a Vue 3 project',
        paragraphs: ['Install @smallwebco/tinypivot-vue, import the DataGrid component and its stylesheet, then bind your data array to the data prop. The component is built for Vue 3 Composition API and ships with TypeScript types.', 'The bundle is approximately 50 KB gzipped for the Vue package. It has no mandatory peer dependencies beyond Vue 3 itself.'],
      },
      {
        title: 'Free tier watermark',
        paragraphs: ['The free tier renders a small "TinyPivot" watermark inside the component. It does not block data or interactions — it signals that the free edition is active. A Pro license removes it immediately without requiring a code change beyond supplying the key.'],
      },
      {
        title: 'What Pro adds',
        paragraphs: ['Pro is a one-time perpetual purchase with three tiers: Single ($49), Unlimited ($149), and Team ($399). One license covers both @smallwebco/tinypivot-vue and @smallwebco/tinypivot-react.', 'Pro unlocks the full aggregation set (Count, Count Distinct, Average, Min, Max, Median, Standard Deviation), a drag-and-drop chart builder, pivot drill-through to underlying rows, styled XLSX export, session persistence, and an optional BYOK AI Data Analyst that supports OpenAI, Anthropic, and OpenRouter.'],
      },
      {
        title: 'Nuxt 3 compatibility',
        paragraphs: ['TinyPivot renders client-side. In a Nuxt 3 project, wrap the DataGrid in a <ClientOnly> tag or use the component inside a client-only plugin to avoid SSR hydration issues. No additional configuration is required.'],
      },
    ],
  },
}

const guide = computed(() => guides[props.slug] ?? guides['ag-grid-alternatives'])

function updateMetadata() {
  document.title = `${guide.value.title} | TinyPivot`

  const description = document.querySelector('meta[name="description"]')
  description?.setAttribute('content', guide.value.description)

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', `https://tiny-pivot.com/${props.slug}`)
}

onMounted(updateMetadata)
watch(() => props.slug, updateMetadata)
</script>

<template>
  <div class="guide-page">
    <nav class="nav">
      <div class="nav-content">
        <RouterLink to="/" class="logo">
          <span class="logo-mark">▦</span>
          <span>TinyPivot</span>
        </RouterLink>
        <div class="nav-links">
          <RouterLink to="/#demo">
            Live Demo
          </RouterLink>
          <RouterLink to="/vs-ag-grid">
            vs AG Grid
          </RouterLink>
          <RouterLink to="/#pricing">
            Pricing
          </RouterLink>
        </div>
      </div>
    </nav>

    <main>
      <section class="hero">
        <div class="eyebrow">
          {{ guide.eyebrow }}
        </div>
        <h1>{{ guide.title }}</h1>
        <p>{{ guide.intro }}</p>
        <div class="hero-actions">
          <RouterLink to="/#demo" class="btn btn-primary">
            Try the Live Demo
          </RouterLink>
          <RouterLink to="/#pricing" class="btn btn-secondary">
            See Lifetime Pricing
          </RouterLink>
        </div>
      </section>

      <section class="guide-content">
        <article>
          <section v-for="section in guide.sections" :key="section.title" class="content-section">
            <h2>{{ section.title }}</h2>
            <p v-for="paragraph in section.paragraphs" :key="paragraph">
              {{ paragraph }}
            </p>
            <ul v-if="section.bullets">
              <li v-for="bullet in section.bullets" :key="bullet">
                {{ bullet }}
              </li>
            </ul>
          </section>

          <section class="install-section">
            <h2>Try TinyPivot in your framework</h2>
            <p>Both packages expose the same product behavior and include TypeScript support.</p>
            <div class="install-grid">
              <div>
                <h3>React</h3>
                <code>pnpm add @smallwebco/tinypivot-react</code>
              </div>
              <div>
                <h3>Vue 3</h3>
                <code>pnpm add @smallwebco/tinypivot-vue</code>
              </div>
            </div>
          </section>
        </article>

        <aside>
          <h2>Explore TinyPivot</h2>
          <RouterLink to="/vs-ag-grid">
            TinyPivot vs AG Grid
          </RouterLink>
          <RouterLink to="/ag-grid-alternatives">
            AG Grid alternatives
          </RouterLink>
          <RouterLink to="/best-react-pivot-table-libraries">
            React pivot table guide
          </RouterLink>
          <RouterLink to="/best-vue-pivot-table-components">
            Vue 3 pivot table guide
          </RouterLink>
          <RouterLink to="/vs-tanstack-table">
            TinyPivot vs TanStack Table
          </RouterLink>
          <a href="https://github.com/Small-Web-Co/tinypivot" target="_blank" rel="noopener">GitHub documentation</a>
        </aside>
      </section>

      <section class="cta">
        <h2>Start free. Upgrade when your analytics surface grows.</h2>
        <p>Free pivot tables for React and Vue 3, with lifetime Pro licensing for advanced features.</p>
        <RouterLink to="/#demo" class="btn btn-primary">
          Open the Demo
        </RouterLink>
      </section>
    </main>

    <footer>
      <span>TinyPivot</span>
      <span>React and Vue 3 data grids with free pivot tables</span>
    </footer>
  </div>
</template>

<style scoped>
.guide-page { min-height: 100vh; background: #0a0a0f; color: #e2e8f0; }
.nav { position: sticky; top: 0; z-index: 10; background: rgba(10, 10, 15, 0.92); border-bottom: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(12px); }
.nav-content { max-width: 1120px; margin: 0 auto; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.logo, .nav-links a, aside a { color: #e2e8f0; text-decoration: none; }
.logo { display: flex; gap: 0.5rem; align-items: center; font-weight: 700; }
.logo-mark { color: #10b981; font-size: 1.5rem; }
.nav-links { display: flex; gap: 1.5rem; font-size: 0.9rem; }
.nav-links a:hover, aside a:hover { color: #10b981; }
.hero { max-width: 900px; margin: 0 auto; padding: 7rem 2rem 5rem; text-align: center; }
.eyebrow { display: inline-block; margin-bottom: 1.25rem; padding: 0.4rem 0.85rem; border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 999px; color: #10b981; background: rgba(16, 185, 129, 0.1); font-size: 0.85rem; }
h1 { margin: 0; font-size: clamp(2.5rem, 7vw, 4.5rem); line-height: 1.05; letter-spacing: -0.04em; }
.hero p { max-width: 760px; margin: 1.5rem auto 0; color: #94a3b8; font-size: 1.2rem; }
.hero-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.8rem; margin-top: 2rem; }
.btn { display: inline-flex; padding: 0.75rem 1.15rem; border-radius: 0.5rem; color: white; text-decoration: none; font-weight: 600; }
.btn-primary { background: #059669; }
.btn-secondary { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.07); }
.guide-content { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 3rem; max-width: 1120px; margin: 0 auto; padding: 0 2rem 5rem; }
.content-section, .install-section { padding: 1.5rem 0; border-top: 1px solid rgba(255, 255, 255, 0.12); }
h2 { margin: 0 0 0.9rem; font-size: 1.65rem; }
h3 { margin: 0 0 0.6rem; color: #a7f3d0; }
p, li { color: #a8b3c5; line-height: 1.75; }
ul { padding-left: 1.2rem; }
li { margin: 0.4rem 0; }
aside { align-self: start; position: sticky; top: 5rem; display: grid; gap: 0.8rem; padding: 1.25rem; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 0.75rem; background: rgba(255, 255, 255, 0.03); }
aside h2 { font-size: 1rem; }
aside a { color: #94a3b8; font-size: 0.9rem; }
.install-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.install-grid div { padding: 1rem; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 0.5rem; background: rgba(255, 255, 255, 0.03); }
code { color: #6ee7b7; font-size: 0.82rem; white-space: nowrap; }
.cta { padding: 5rem 2rem; text-align: center; background: rgba(16, 185, 129, 0.08); }
.cta p { margin-bottom: 1.5rem; }
footer { display: flex; justify-content: space-between; gap: 1rem; max-width: 1120px; margin: 0 auto; padding: 2rem; color: #64748b; font-size: 0.85rem; }
@media (max-width: 760px) {
  .nav-links { gap: 0.8rem; font-size: 0.78rem; }
  .guide-content { grid-template-columns: 1fr; }
  aside { position: static; }
  .install-grid { grid-template-columns: 1fr; }
  footer { flex-direction: column; }
}
</style>
