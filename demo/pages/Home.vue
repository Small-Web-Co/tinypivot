<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import HarnessReel from '../components/HarnessReel.vue'
import ContextMeter from '../components/site/ContextMeter.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TokenReceipt from '../components/site/TokenReceipt.vue'
import { EXAMPLE_RATE, EXAMPLE_WORKLOAD, exampleSavings, formatUsd } from '../site/savings'

// The showcase loads the real grid and chart library, so it is fetched in the
// browser only and kept out of the prerendered HTML and the first bundle.
const ThemeShowcase = defineAsyncComponent(() => import('../components/site/ThemeShowcase.vue'))
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const facts = ['free', 'runs locally', 'no signup', 'no API key']

// Hero figures: the same worked example as the receipt further down the page.
const savings = exampleSavings()
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const heroProof = {
  percent: savings.percent,
  usd: formatUsd(savings.usd),
  rows: fmt(EXAMPLE_WORKLOAD.rows),
  followUps: EXAMPLE_WORKLOAD.followUps,
  model: EXAMPLE_RATE.name,
}

const capabilities = [
  {
    n: '01',
    title: 'Any database',
    body: 'Pipe CSV or JSON from BigQuery, Snowflake, DuckDB, MySQL or Databricks, or the output of any other MCP tool. Pro adds a read-only Postgres connector.',
  },
  {
    n: '02',
    title: 'Exact numbers',
    body: 'Sums, medians and percent-of-total are computed by the TinyPivot engine, not estimated by the model. No arithmetic hallucinations.',
  },
  {
    n: '03',
    title: 'Drill-through & Excel',
    body: 'Double-click any cell to see the rows behind it, then export a formatted .xlsx. Both in Pro; charts and sum pivots are free up to 2,500 rows.',
  },
] as const
</script>

<template>
  <main>
    <section class="hero desk">
      <div class="wrap">
        <RetroWindow title="README — tinypivot">
          <div class="hero-grid">
            <div class="hero-copy">
              <p class="label">
                MCP server for AI coding agents
              </p>
              <h1 class="display">
                Stop spending tokens on <em>reading data.</em>
              </h1>
              <p class="lede">
                Paste query results into chat and you pay for every row, again on every follow-up.
                TinyPivot keeps the rows on your machine, draws the chart and pivot inside Claude, Cursor,
                Antigravity, OpenCode and pi, and sends the model a short summary instead.
              </p>
              <a href="#savings" class="hero-proof">
                <span class="hero-stats">
                  <span class="hero-stat">
                    <strong>{{ heroProof.percent }}<span class="hero-unit">%</span></strong>
                    fewer tokens
                  </span>
                  <span class="hero-stat">
                    <strong>{{ heroProof.usd }}</strong>
                    saved per analysis
                  </span>
                </span>
                <span class="hero-fine">
                  Example: {{ heroProof.rows }} rows, {{ heroProof.followUps }} follow-ups, {{ heroProof.model }} prices.
                  See the math ↓
                </span>
              </a>
            </div>
            <div id="install" class="hero-install">
              <InstallBox source="hero" />
              <ul class="facts" aria-label="Free tier">
                <li v-for="fact in facts" :key="fact">
                  {{ fact }}
                </li>
              </ul>
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <section class="block reel" aria-labelledby="reel-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            In the harness
          </p>
          <h2 id="reel-title" class="heading">
            Charts, pivots and drill-through <em>where the conversation already is.</em>
          </h2>
        </header>
        <RetroWindow title="tinypivot — recorded sessions" flush>
          <HarnessReel />
        </RetroWindow>
      </div>
    </section>

    <section id="themes" class="block themes" aria-labelledby="themes-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            Live · the real library
          </p>
          <h2 id="themes-title" class="heading">
            One theme, <em>every surface.</em>
          </h2>
          <p class="lede">
            Pick a theme. The grid, the pivot and the chart restyle together, and the terminal prints the same data in the same colours.
            Rich surfaces get crisp flat marks, smooth lines and hover detail; the terminal gets the best it can draw.
          </p>
        </header>
        <ThemeShowcase v-if="isMounted" />
        <p v-else class="themes-loading mono">
          Loading the live grid…
        </p>
      </div>
    </section>

    <section id="savings" class="block savings" aria-labelledby="savings-title">
      <div class="wrap savings-grid">
        <div>
          <p class="label">
            The receipt
          </p>
          <h2 id="savings-title" class="heading">
            The model needs the shape of your data, <em>not every row.</em>
          </h2>
          <p class="lede">
            Pasting a query result into chat bills you for every cell, then again on each follow-up.
            With TinyPivot the rows stream straight to the UI, and re-slicing them is a local click.
          </p>
          <router-link to="/docs#savings" class="text-link">
            Run the numbers for your own workload →
          </router-link>
        </div>
        <TokenReceipt />
      </div>
      <div class="wrap savings-meter">
        <ContextMeter />
      </div>
    </section>

    <section class="block" aria-labelledby="caps-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            What it does
          </p>
          <h2 id="caps-title" class="heading">
            Small tool, <em>serious analysis.</em>
          </h2>
        </header>
        <ol class="caps">
          <li v-for="cap in capabilities" :key="cap.n" class="cap">
            <span class="cap-n mono">{{ cap.n }}</span>
            <h3 class="cap-title">
              {{ cap.title }}
            </h3>
            <p class="cap-body">
              {{ cap.body }}
            </p>
          </li>
        </ol>
      </div>
    </section>

    <section class="block closing desk" aria-labelledby="closing-title">
      <div class="wrap closing-grid">
        <RetroWindow title="install.sh">
          <div class="closing-stack">
            <h2 id="closing-title" class="heading">
              Install once. <em>Every harness gets it.</em>
            </h2>
            <InstallBox source="closing" />
          </div>
        </RetroWindow>
        <router-link to="/ui" class="app-link">
          <span class="label">Building an app?</span>
          <span class="app-link-title">TinyPivot UI: the same grid, pivots and charts for React &amp; Vue 3 →</span>
        </router-link>
      </div>
    </section>
  </main>
</template>

<style scoped>
.hero {
  padding: 20px 0 32px;
}

/* Inside a window the install box sits flat; the window carries the shadow. */
.hero :deep(.install),
.closing :deep(.install) {
  box-shadow: none;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}

.hero-copy {
  display: grid;
  gap: 16px;
}

.hero .lede {
  font-size: 1.08rem;
}

.hero-proof {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: var(--line);
  background: var(--ledger);
  font-family: var(--font-mono);
  text-decoration: none;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.hero-stat {
  display: grid;
  gap: 2px;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.hero-stat + .hero-stat {
  padding-left: 12px;
  border-left: var(--line);
}

.hero-stat strong {
  font-family: var(--font-dot);
  font-size: clamp(2rem, 9vw, 3rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  color: var(--ink);
}

/* The dot-matrix face draws "%" too loosely to read at a glance, so the unit uses the mono face. */
.hero-unit {
  font-family: var(--font-mono);
  font-size: 0.62em;
  font-weight: 700;
}

.hero-fine {
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 14px;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

.facts li::before {
  content: '✓ ';
  color: var(--accent);
}

.section-head {
  display: grid;
  gap: 12px;
  max-width: 40rem;
  margin-bottom: 32px;
}

.themes {
  border-top: var(--line);
}

.themes-loading {
  min-height: 420px;
  font-size: 0.8rem;
  color: var(--ink-muted);
}

.savings {
  border-top: var(--line);
  border-bottom: var(--line);
}

.savings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 32px;
}

.savings-meter {
  margin-top: 40px;
}

.savings-grid > div {
  display: grid;
  gap: 16px;
  align-content: start;
}

.text-link {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--accent);
  text-underline-offset: 4px;
}

.caps {
  display: grid;
  list-style: none;
  border-top: var(--line);
}

.cap {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 4px 12px;
  padding: 22px 0;
  border-bottom: var(--line);
}

.cap-n {
  grid-row: span 2;
  padding-top: 6px;
  font-size: 0.78rem;
  color: var(--accent);
}

.cap-title {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
}

.cap-body {
  color: var(--ink-muted);
}

.closing {
  margin-top: 8px;
  border-top: var(--line);
  border-bottom: 0;
}

.closing-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
  max-width: 800px;
}

.closing-stack {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.app-link {
  display: grid;
  gap: 6px;
  padding: 20px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
}

.app-link:hover {
  background: var(--ledger);
}

.app-link-title {
  font-size: 1.1rem;
}

@media (min-width: 768px) {
  .hero {
    padding: 48px 0 64px;
  }

  .hero .lede {
    font-size: 1.2rem;
  }

  .caps {
    grid-template-columns: repeat(3, 1fr);
    gap: 0 32px;
    border-top: 0;
  }

  .cap {
    grid-template-columns: 1fr;
    align-content: start;
    gap: 10px;
    padding: 24px 0 0;
    border-top: var(--line);
    border-bottom: 0;
  }

  .cap-n {
    grid-row: auto;
    padding-top: 0;
  }
}

@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: end;
    gap: 56px;
  }

  .savings-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    align-items: center;
    gap: 64px;
  }
}
</style>
