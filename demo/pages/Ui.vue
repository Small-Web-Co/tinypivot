<script setup lang="ts">
import type { Framework } from '../site/ui'
import { DataGrid } from 'tinypivot'
import { computed, ref } from 'vue'
import ChartGlyphs from '../components/site/ChartGlyphs.vue'
import CodeBlock from '../components/site/CodeBlock.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import SegmentedControl from '../components/site/SegmentedControl.vue'
import { galleryCharts, generateAcmeBookings, generateRunningLog } from '../site/chartGallery'
import { aiAnalystCode, analystPoints, features, frameworks, quickstartCode, testimonials } from '../site/ui'
import { aiAnalystConfig, dateFormats, demoChartConfig, numberFormats, themeChoices, useLiveDemo } from '../site/useLiveDemo'

const framework = ref<Framework>('vue')
const quickstart = computed(() => quickstartCode(framework.value))
const analyst = computed(() => aiAnalystCode(framework.value))

const { isMounted, rows, pageSize, theme, numberFormat, dateFormat } = useLiveDemo()

// D3 chart gallery: fake Acme bookings, one chart at a time, any theme.
const galleryData = { acme: generateAcmeBookings(), running: generateRunningLog() }
const galleryChartId = ref(galleryCharts[0].id)
const galleryTheme = ref(theme.value)
const galleryVariant = ref<'editorial' | 'deck'>('editorial')
const galleryChart = computed(() => galleryCharts.find(c => c.id === galleryChartId.value) ?? galleryCharts[0])
// The chosen style goes into the chart options, as a host app would set it.
const galleryConfig = computed(() => ({
  ...galleryChart.value.config,
  options: { ...galleryChart.value.config.options, variant: galleryVariant.value },
}))
</script>

<template>
  <main>
    <section class="ui-hero desk">
      <div class="wrap">
        <RetroWindow title="tinypivot-ui — React &amp; Vue 3">
          <div class="ui-hero-grid">
            <div class="ui-hero-copy">
              <p class="label">
                TinyPivot UI · React &amp; Vue 3
              </p>
              <h1 class="display">
                The grid, pivots and charts, <em>inside your app.</em>
              </h1>
              <p class="lede">
                The same engine as the MCP server, as a component. Excel-like grid, free pivot tables and charts,
                and an optional AI analyst. One-time licenses, no per-seat pricing.
              </p>
            </div>
            <div class="ui-hero-actions">
              <SegmentedControl v-model="framework" :options="frameworks" label="Framework" />
              <CodeBlock :code="quickstart.install" filename="terminal" />
              <div class="ui-hero-links">
                <a href="#demo" class="btn btn-solid">Try the live demo</a>
                <router-link to="/pricing?product=ui" class="btn btn-ghost">
                  Licenses from $49
                </router-link>
              </div>
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <section id="demo" class="block demo" aria-labelledby="demo-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            Live demo · 10,000 rows
          </p>
          <h2 id="demo-title" class="heading">
            Click Pivot, Chart or AI. <em>Every Pro feature is unlocked here.</em>
          </h2>
        </header>

        <div class="demo-controls">
          <label class="demo-select">
            <span class="label">Numbers</span>
            <select v-model="numberFormat">
              <option v-for="f in numberFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </label>
          <label class="demo-select">
            <span class="label">Dates</span>
            <select v-model="dateFormat">
              <option v-for="f in dateFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </label>
          <label class="demo-select">
            <span class="label">Theme</span>
            <select v-model="theme">
              <option v-for="t in themeChoices" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </label>
        </div>

        <RetroWindow title="sales.csv — 10,000 rows" flush>
          <div class="demo-frame">
            <DataGrid
              v-if="isMounted"
              :data="rows"
              :show-pivot="true"
              font-size="sm"
              :enable-export="true"
              :enable-search="true"
              :enable-pagination="true"
              :page-size="pageSize"
              :enable-column-resize="true"
              :enable-clipboard="true"
              :theme="theme"
              :striped-rows="true"
              :number-format="numberFormat"
              :date-format="dateFormat"
              export-filename="tinypivot-demo.csv"
              :ai-analyst="aiAnalystConfig"
              :chart-config="demoChartConfig"
            />
            <p v-else class="demo-loading mono">
              Loading 10,000 rows…
            </p>
          </div>
        </RetroWindow>
      </div>
    </section>

    <section id="d3-charts" class="block demo" aria-labelledby="d3-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            Chart gallery · fictional Acme bookings and a running log
          </p>
          <h2 id="d3-title" class="heading">
            Maps, bullets, radials and treemaps. <em>Every theme, same data.</em>
          </h2>
        </header>

        <div class="demo-controls">
          <div class="gallery-tabs" role="tablist" aria-label="Chart type">
            <button
              v-for="chart in galleryCharts"
              :key="chart.id"
              type="button"
              role="tab"
              class="btn btn-ghost gallery-tab"
              :aria-selected="chart.id === galleryChartId"
              @click="galleryChartId = chart.id"
            >
              {{ chart.label }}
            </button>
          </div>
          <label class="demo-select">
            <span class="label">Style</span>
            <select v-model="galleryVariant">
              <option value="editorial">Editorial</option>
              <option value="deck">Deck</option>
            </select>
          </label>
          <label class="demo-select">
            <span class="label">Theme</span>
            <select v-model="galleryTheme">
              <option v-for="t in themeChoices" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </label>
        </div>

        <RetroWindow :title="`${galleryChart.data === 'acme' ? 'acme-bookings.csv' : 'running-log.csv'} — ${galleryChart.label}`" flush>
          <div class="demo-frame gallery-frame" :data-gallery-chart="galleryChart.id">
            <DataGrid
              v-if="isMounted"
              :key="`${galleryChart.id}-${galleryVariant}`"
              :data="galleryData[galleryChart.data]"
              :show-pivot="true"
              view-mode="chart"
              font-size="sm"
              :theme="galleryTheme"
              :chart-config="galleryConfig"
            />
          </div>
        </RetroWindow>
      </div>
    </section>

    <section id="quickstart" class="block" aria-labelledby="qs-title">
      <div class="wrap two-col">
        <header class="section-head">
          <p class="label">
            Quick start
          </p>
          <h2 id="qs-title" class="heading">
            Install, import, <em>pass your rows.</em>
          </h2>
          <p class="lede">
            Same API in both packages. No peer dependencies beyond {{ framework === 'vue' ? 'Vue' : 'React' }}.
          </p>
          <SegmentedControl v-model="framework" :options="frameworks" label="Framework" class="qs-switch" />
        </header>
        <div class="stack">
          <CodeBlock :code="quickstart.install" filename="terminal" />
          <CodeBlock :code="quickstart.usage" :filename="quickstart.filename" />
        </div>
      </div>
    </section>

    <section class="block features" aria-labelledby="features-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            What's included
          </p>
          <h2 id="features-title" class="heading">
            Most of it is <em>free.</em>
          </h2>
        </header>
        <ChartGlyphs class="chart-types" />
        <ul class="feature-list ledger">
          <li v-for="f in features" :key="f.name" class="feature">
            <span class="feature-name">{{ f.name }}</span>
            <span class="feature-desc">{{ f.desc }}</span>
            <span class="feature-tier" :class="f.tier.toLowerCase()">{{ f.tier }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section id="ai-analyst" class="block" aria-labelledby="ai-title">
      <div class="wrap two-col">
        <header class="section-head">
          <p class="label">
            AI Data Analyst · Pro
          </p>
          <h2 id="ai-title" class="heading">
            Let your users <em>ask the data.</em>
          </h2>
          <ul class="points">
            <li v-for="p in analystPoints" :key="p.title">
              <strong>{{ p.title }}.</strong> {{ p.body }}
            </li>
          </ul>
          <a
            href="https://github.com/Small-Web-Co/tinypivot/tree/master/examples/ai-analyst-demo"
            class="text-link"
            rel="noopener"
          >Full example with Postgres and DuckDB →</a>
        </header>
        <CodeBlock :code="analyst.code" :filename="analyst.filename" />
      </div>
    </section>

    <section class="block quotes" aria-labelledby="quotes-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            In production
          </p>
          <h2 id="quotes-title" class="heading">
            Teams that ship <em>self-serve analytics.</em>
          </h2>
        </header>
        <div class="quote-grid">
          <figure v-for="t in testimonials" :key="t.author" class="quote">
            <blockquote>{{ t.quote }}</blockquote>
            <figcaption>
              <strong>{{ t.author }}</strong> · {{ t.role }} ·
              <a :href="t.href" rel="noopener">{{ t.site }}</a>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>

    <section class="block closing">
      <div class="wrap closing-row">
        <h2 class="heading">
          Free to ship. <em>$49 once</em> for Pro.
        </h2>
        <router-link to="/pricing?product=ui" class="btn btn-solid">
          See licenses
        </router-link>
      </div>
    </section>
  </main>
</template>

<style scoped>
.ui-hero {
  padding: 20px 0 32px;
}

.ui-hero-grid,
.two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
}

.ui-hero-copy,
.ui-hero-actions,
.stack {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.ui-hero-links {
  display: grid;
  gap: 10px;
}

.section-head {
  display: grid;
  gap: 14px;
  max-width: 40rem;
  margin-bottom: 28px;
}

.two-col .section-head {
  margin-bottom: 0;
}

.qs-switch {
  max-width: 260px;
}

.demo {
  border-bottom: var(--line);
}

.demo-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.demo-select {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.demo-select select {
  width: 100%;
  min-height: var(--tap);
  padding: 0 10px;
  border: var(--line);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.gallery-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gallery-tab[aria-selected='true'] {
  background: var(--ink, currentColor);
  color: var(--paper, #fff);
}

.demo-frame {
  min-width: 0;
  height: 70vh;
  min-height: 460px;
  max-height: 760px;
  overflow: hidden;
  background: var(--win);
}

.demo-loading {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--win-muted);
  font-size: 0.85rem;
}

.quotes,
.closing {
  border-top: var(--line);
}

.chart-types {
  margin-bottom: 36px;
}

.feature-list {
  display: grid;
  list-style: none;
  border-top: var(--line);
}

.feature {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 16px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--rule);
}

.feature-name {
  font-size: 1.1rem;
}

.feature-desc {
  grid-row: 2;
  color: var(--ink-muted);
  font-size: 0.98rem;
}

.feature-tier {
  grid-row: 1 / span 2;
  align-self: center;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.feature-tier.free {
  color: var(--plus);
  font-weight: 700;
}

.feature-tier.pro {
  padding: 3px 8px;
  border: var(--line);
}

.points {
  display: grid;
  gap: 10px;
  list-style: none;
  color: var(--ink-muted);
}

.points strong {
  color: var(--ink);
  font-weight: 500;
}

.text-link {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--accent);
  text-underline-offset: 4px;
}

.quote-grid {
  display: grid;
  gap: 20px;
}

.quote {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 22px;
  border: var(--line);
  background: var(--paper);
}

.quote blockquote {
  font-size: 1.05rem;
  line-height: 1.5;
}

.quote figcaption {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--ink-muted);
}

.closing-row {
  display: grid;
  gap: 20px;
  justify-items: start;
}

@media (min-width: 640px) {
  .ui-hero-links {
    grid-auto-flow: column;
    justify-content: start;
  }
}

@media (min-width: 768px) {
  .ui-hero {
    padding: 48px 0 64px;
  }

  .feature-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 32px;
  }

  .closing-row {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}

@media (min-width: 1024px) {
  .ui-hero-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    align-items: end;
    gap: 56px;
  }

  .two-col {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: 56px;
    align-items: start;
  }

  .quote-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
