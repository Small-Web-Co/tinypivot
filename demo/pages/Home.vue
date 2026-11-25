<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import HarnessReel from '../components/HarnessReel.vue'
import BenchmarkTable from '../components/site/BenchmarkTable.vue'
import HeroCharts from '../components/site/HeroCharts.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TokenReceipt from '../components/site/TokenReceipt.vue'
import { benchmarkHeadline } from '../site/benchmark'

// The showcase loads the real grid and chart library, so it is fetched in the
// browser only and kept out of the prerendered HTML and the first bundle.
const ThemeShowcase = defineAsyncComponent(() => import('../components/site/ThemeShowcase.vue'))
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const facts = ['free', 'runs locally', 'no signup', 'no API key']

// The hero's fine print comes from the measured benchmark shown in the savings section.
const headline = benchmarkHeadline()

const heroPoints = ['Exact totals, computed on your machine', 'Every figure in the answer checked', 'Every step with its SQL, in the Studio'] as const

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
                Data analysis studio for AI agents
              </p>
              <h1 class="display">
                Ask your data in any agent. <em>Every number checked.</em>
              </h1>
              <p class="lede">
                TinyPivot runs the numbers on your machine, draws the chart, and checks each figure in the agent's answer
                against the data. It never sends your raw rows to the model. Works in Claude Code, Cursor, pi, OpenCode and Antigravity.
              </p>
              <ul class="hero-points">
                <li v-for="point in heroPoints" :key="point">
                  {{ point }}
                </li>
              </ul>
              <a href="#savings" class="hero-fine">
                Measured in Claude Code: {{ headline.cheaperThanPythonPct }}% cheaper than an agent writing Python
                on a {{ headline.largeRows.toLocaleString('en-US') }}-row file, with {{ headline.correct }}/{{ headline.questions }} exact answers.
                Benchmark ↓
              </a>
            </div>
            <div class="hero-side">
              <HeroCharts class="hero-charts" />
              <div id="install" class="hero-install">
                <InstallBox source="hero" />
                <ul class="facts" aria-label="Free tier">
                  <li v-for="fact in facts" :key="fact">
                    {{ fact }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <section id="studio" class="block reel" aria-labelledby="reel-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            In the harness · TinyPivot Studio
          </p>
          <h2 id="reel-title" class="heading">
            Progress in the chat, <em>the full view a click away.</em>
          </h2>
          <p class="lede">
            Recorded sessions in each agent. The Studio opens beside the terminal with every step and the SQL behind it, takes your next question straight to the agent, and checks every number in the answer against the data.
          </p>
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
            Measured, not modelled
          </p>
          <h2 id="savings-title" class="heading">
            What a question <em>actually costs.</em>
          </h2>
          <p class="lede">
            The same three questions about the same data, asked in each setup. Most agents answer data questions by
            writing Python; TinyPivot did the same work for {{ headline.cheaperThanPythonPct }}% less on the
            {{ headline.largeRows.toLocaleString('en-US') }}-row file ({{ headline.cheaperThanPythonSmallPct }}% less on the small one),
            with every figure right, and you get the chart and the SQL instead of a script to read.
            Reading the rows into the chat costs about twice as much and got {{ headline.pastedCorrect }} of {{ headline.questions }} right.
          </p>
          <router-link to="/docs#savings" class="text-link">
            Run the numbers for your own workload →
          </router-link>
        </div>
        <BenchmarkTable />
      </div>
      <div class="wrap savings-meter">
        <p class="label">
          Where the tokens go when you paste rows
        </p>
        <TokenReceipt />
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

/* Install first on a phone; beside the copy, the Studio card leads and install sits under it. */
.hero-side {
  display: grid;
  gap: 20px;
  align-content: start;
}

.hero-charts {
  order: 2;
}

.hero .lede {
  font-size: 1.08rem;
}

.hero-points {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: var(--line);
  background: var(--ledger);
  list-style: none;
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

.hero-points li::before {
  content: '› ';
  color: var(--accent);
  font-weight: 700;
}

.hero-fine {
  font-family: var(--font-mono);
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
  display: grid;
  gap: 16px;
  max-width: 560px;
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
    align-items: start;
    gap: 56px;
  }

  .hero-charts {
    order: 0;
  }

  .savings-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    align-items: center;
    gap: 64px;
  }
}
</style>
