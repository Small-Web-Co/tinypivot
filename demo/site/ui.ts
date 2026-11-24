/** Content for the /ui page (React & Vue library). */

export type Framework = 'vue' | 'react'

export const frameworks = [
  { value: 'vue', label: 'Vue 3' },
  { value: 'react', label: 'React' },
] as const

export function packageFor(framework: Framework): string {
  return `@smallwebco/tinypivot-${framework}`
}

export function quickstartCode(framework: Framework): { install: string, usage: string, filename: string } {
  const pkg = packageFor(framework)
  if (framework === 'vue') {
    return {
      install: `pnpm add ${pkg}`,
      filename: 'App.vue',
      usage: `<script setup lang="ts">
import { DataGrid } from '${pkg}'
import '${pkg}/style.css'

const rows = [/* your data */]
</script>

<template>
  <DataGrid :data="rows" :show-pivot="true" />
</template>`,
    }
  }
  return {
    install: `pnpm add ${pkg}`,
    filename: 'App.tsx',
    usage: `import { DataGrid } from '${pkg}'
import '${pkg}/style.css'

const rows = [/* your data */]

export default function App() {
  return <DataGrid data={rows} showPivot />
}`,
  }
}

export function aiAnalystCode(framework: Framework): { code: string, filename: string } {
  const pkg = packageFor(framework)
  const config = `const aiAnalyst = {
  enabled: true,
  endpoint: '/api/tinypivot', // your server handler
  aiModelName: 'Claude Sonnet',
  persistToLocalStorage: true,
}`
  if (framework === 'vue') {
    return {
      filename: 'App.vue',
      code: `<script setup lang="ts">
import { DataGrid, setLicenseKey } from '${pkg}'
import '${pkg}/style.css'

setLicenseKey('YOUR_LICENSE_KEY')
${config}
</script>

<template>
  <DataGrid :data="rows" :ai-analyst="aiAnalyst" />
</template>`,
    }
  }
  return {
    filename: 'App.tsx',
    code: `import { DataGrid, setLicenseKey } from '${pkg}'
import '${pkg}/style.css'

setLicenseKey('YOUR_LICENSE_KEY')
${config}

export default function App() {
  return <DataGrid data={rows} aiAnalyst={aiAnalyst} />
}`,
  }
}

export const features = [
  { name: 'Excel-like grid', desc: 'Sort, filter, search (Ctrl+F), resize, paginate, copy cells.', tier: 'Free' },
  { name: 'Pivot table', desc: 'Drag-and-drop pivots with sum, totals and collapsible groups.', tier: 'Free' },
  { name: 'Calculated fields', desc: 'Formulas like margin or growth rate, no backend changes.', tier: 'Free' },
  { name: 'Core charts', desc: 'Bar, stacked bar, line, area, pie and donut from any pivot.', tier: 'Free' },
  { name: 'CSV export', desc: 'One click, custom filename.', tier: 'Free' },
  { name: 'Themes', desc: 'Light, dark, auto and 10 colour families.', tier: 'Free' },
  { name: 'Advanced pivots', desc: '9+ aggregations and drill-through to source rows.', tier: 'Pro' },
  { name: 'Excel export', desc: 'Formatted .xlsx output.', tier: 'Pro' },
  { name: 'AI Data Analyst', desc: 'Plain-English questions with your own model key.', tier: 'Pro' },
] as const

export const analystPoints = [
  { title: 'Bring your own key', body: 'OpenAI, Anthropic or OpenRouter. You control the model and the bill.' },
  { title: 'Data stays with you', body: 'Nothing passes through TinyPivot servers. SQL runs in DuckDB WASM or against your own Postgres.' },
  { title: 'Validated SQL', body: 'Questions become checked SQL, then a pivot or chart your users can keep exploring.' },
] as const

export const testimonials = [
  {
    quote: 'TinyPivot has been a great addition to our analytics platform, giving our customers intuitive, interactive data grid and pivot table capabilities without the overhead of building our own solution. Small Web Co has been incredibly responsive — actively listening to our use cases and shipping improvements quickly. It’s a high-quality, well-maintained library that delivers real value at a fraction of the cost of alternatives.',
    author: 'Kevin Tetz',
    role: 'CIO',
    href: 'https://www.vesselscale.com',
    site: 'vesselscale.com',
  },
  {
    quote: 'Thank you so much! We found Brice to be a highly skilled, meticulous, and helpful developer. We had the opportunity to use TinyPivot, which enabled our colleagues to generate and view analytics on orders, website traffic, and performance independently, without placing a strain on the company’s IT team. We even made modifications to the plugin to suit our specific needs.',
    author: 'Atlantis Headwear',
    role: 'CS',
    href: 'https://www.atlantisheadwear.com',
    site: 'atlantisheadwear.com',
  },
  {
    quote: 'Amazing plugin. I found it very easy to work with — it looks sleek and fits properly with Vuetify in terms of UI. We were looking into having better reporting on our system, and this plugin landed from heaven to aid the developers’ work. The fact that you can have pivot tables, graphs, and an export tool makes our managers’ life way easier when building reports.',
    author: 'Matias Nombarasco',
    role: 'Ozone Gliders LTD',
    href: 'https://www.flyozone.com',
    site: 'flyozone.com',
  },
] as const
