<script setup lang="ts">
import HarnessReel from '../components/HarnessReel.vue'
import CopyCommand from '../components/site/CopyCommand.vue'
import HeroCharts from '../components/site/HeroCharts.vue'
import InstallBox from '../components/site/InstallBox.vue'
import ModelComparisonChart from '../components/site/ModelComparisonChart.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import RotatingWord from '../components/site/RotatingWord.vue'
import TestimonialCarousel from '../components/site/TestimonialCarousel.vue'
import { benchmarkHeadline } from '../site/benchmark'
import { modelChartHighlights } from '../site/modelChart'
import { NPM_DOWNLOADS } from '../site/ui'
import { homeGainCards, TRUST_BENCH_TOTALS, trustBenchRows } from '../site/whitepaper'

const facts = ['Free · unlimited rows', 'runs on your machine', 'no signup', 'no API key']

const heroWords = ['check.', 'trust.', 'visualize.', 'reproduce.'] as const

const modelHighlights = modelChartHighlights()
const opusCostCut = (() => {
  const opus = trustBenchRows.find(r => r.id === 'opus')!
  return Math.floor((1 - opus.proCost / opus.baselineCost) * 100)
})()

// The cost proof card quotes the measured benchmark from the docs calculator.
const headline = benchmarkHeadline()

// Three plain-language claims, each with a link to the evidence behind it.
const heroProof = [
  {
    claim: 'Catches the quiet mistakes.',
    detail: '91% → 100% correct across 5 AI models on 18 analysis tasks with hidden traps.',
    to: '/whitepaper#internal',
    link: 'See the tests',
  },
  {
    claim: 'Twice as fast on hard questions.',
    detail: 'A/B tests, regressions and cohorts run in one step, not rounds of trial-and-error code.',
    to: '/whitepaper#internal',
    link: 'See the timings',
  },
  {
    claim: 'Costs less to run.',
    detail: `${opusCostCut}% off Claude Opus's bill on the same tasks, and up to half the output tokens on smaller models.`,
    to: '/whitepaper#internal',
    link: 'See the costs',
  },
  {
    claim: 'Your raw data stays put.',
    detail: 'Queries run on your machine or in your database. The AI sees results, not raw rows.',
    to: '/privacy',
    link: 'What stays local',
  },
] as const

const capabilities = [
  {
    n: '01',
    title: 'A second pair of eyes',
    body: 'A query can run without errors and still be wrong: a join that double-counts revenue, a month that is only half over, an average of percentages. TinyPivot checks every query and stays quiet unless something is actually off.',
  },
  {
    n: '02',
    title: 'Statistics in one step',
    body: 'A/B tests, regressions, cohort retention and anomaly detection run as single, tested tools. No improvised Python, no guessing at the method.',
  },
  {
    n: '03',
    title: 'Work you can check',
    body: 'Every chart and number links to its SQL and the rows behind it, in a Studio window beside your agent. Pro also remembers your data between sessions, so repeat questions cost fewer tokens.',
  },
] as const
</script>

<template>
  <main>
    <section class="hero desk">
      <div class="wrap">
        <RetroWindow title="README — tinypivot">
          <template #corner>
            <p class="hero-npm mono">
              <span class="hero-npm-num">{{ NPM_DOWNLOADS }}</span>
              <span class="hero-npm-lbl">npm downloads</span>
            </p>
          </template>
          <div class="hero-grid">
            <div class="hero-copy">
              <p class="label">
                TinyPivot · the data-analysis sidecar for AI agents
              </p>
              <h1 class="display hero-title">
                Ask your AI about your data. <em>Get answers you can <RotatingWord :words="heroWords" /></em>
              </h1>
              <p class="lede">
                TinyPivot runs alongside Claude, Cursor, Codex and other AI agents as a sidecar for data work. It works with any data
                your agent can reach: spreadsheets and files, Snowflake, BigQuery, Postgres, APIs or another MCP server. It catches
                the math mistakes AI quietly makes and shows the SQL behind every number.
              </p>
              <ul class="hero-proof">
                <li v-for="point in heroProof" :key="point.claim">
                  <strong>{{ point.claim }}</strong>
                  {{ point.detail }}
                  <router-link :to="point.to" class="hero-proof-link">
                    {{ point.link }} →
                  </router-link>
                </li>
              </ul>
              <div id="install" class="hero-install">
                <p class="hero-install-k mono">
                  Get started · paste in your terminal
                </p>
                <CopyCommand source="hero" />
                <p class="hero-install-note mono">
                  Sets up Claude Code, Claude Desktop, Cursor, Codex, OpenCode, Antigravity and pi.
                  <a href="#install-options" class="hero-proof-link">Other ways to install ↓</a>
                </p>
                <ul class="facts" aria-label="At a glance">
                  <li v-for="fact in facts" :key="fact">
                    {{ fact }}
                  </li>
                </ul>
              </div>
            </div>
            <div class="hero-side">
              <HeroCharts class="hero-charts" />
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <TestimonialCarousel />

    <section class="block caps-section" aria-labelledby="caps-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            What your agent gets
          </p>
          <h2 id="caps-title" class="heading">
            Three things AI analysis <em>usually lacks.</em>
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

    <section id="studio" class="block reel" aria-labelledby="reel-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            See it work · recorded sessions
          </p>
          <h2 id="reel-title" class="heading">
            Answers in the chat, <em>the proof one click away.</em>
          </h2>
          <p class="lede">
            Real sessions in each agent. The Studio opens beside the terminal with every step and its SQL, and checks each number in the answer against the data.
          </p>
        </header>
        <RetroWindow title="tinypivot — recorded sessions" flush>
          <HarnessReel />
        </RetroWindow>
      </div>
    </section>

    <section id="savings" class="block savings" aria-labelledby="savings-title">
      <div class="wrap savings-stack">
        <header class="section-head savings-head">
          <p class="label">
            The evidence · measured, with the method published
          </p>
          <h2 id="savings-title" class="heading">
            More accurate, faster, <em>and cheaper to run.</em>
          </h2>
          <p class="lede">
            Checking work usually costs extra tokens. Here it saves them: one tested tool call replaces several rounds of
            trial-and-error code. Tap any result to see how it was measured.
          </p>
        </header>

        <div class="gain-grid">
          <router-link v-for="card in homeGainCards" :key="card.id" :to="card.to" class="gain-card">
            <p class="label gain-kicker">
              {{ card.kicker }}
            </p>
            <p class="mono gain-val">
              {{ card.headline }}
            </p>
            <div class="gain-bars mono">
              <div class="gain-bar-row">
                <span class="gain-bar-lbl">{{ card.beforeLabel }}</span>
                <div class="gain-track">
                  <div class="gain-fill gain-fill-base" :style="{ width: `${card.beforePct}%` }" />
                </div>
              </div>
              <div class="gain-bar-row">
                <span class="gain-bar-lbl gain-bar-pro">{{ card.afterLabel }}</span>
                <div class="gain-track">
                  <div class="gain-fill gain-fill-pro" :style="{ width: `${card.afterPct}%` }" />
                </div>
              </div>
            </div>
            <p class="gain-detail">
              {{ card.detail }}
            </p>
            <span class="text-link gain-link">How we measured this →</span>
          </router-link>
        </div>

        <div class="proof-cards">
          <router-link to="/whitepaper" class="proof-card">
            <p class="label">
              White paper · web &amp; PDF
            </p>
            <h3 class="proof-title">
              The full method and every result
            </h3>
            <p class="proof-body">
              18 tasks across 5 models, plus two independent public benchmarks from MIT and Adyen.
              Every prompt, model and score is published, including where TinyPivot made no difference.
            </p>
            <span class="text-link">Read the white paper →</span>
          </router-link>

          <router-link to="/docs#savings" class="proof-card">
            <p class="label">
              Cost calculator
            </p>
            <h3 class="proof-title">
              {{ headline.cheaperThanPythonPct }}% cheaper per question than Python
            </h3>
            <p class="proof-body">
              Measured on a {{ headline.largeRows.toLocaleString('en-US') }}-row dataset in Claude Code, with no raw rows
              pasted into the conversation. Plug in your own workload to see what it would cost you.
            </p>
            <span class="text-link">Open the calculator →</span>
          </router-link>
        </div>
      </div>
    </section>

    <section id="small-models" class="block small-models" aria-labelledby="small-title">
      <div class="wrap">
        <header class="section-head small-head">
          <p class="label">
            Head to head · {{ TRUST_BENCH_TOTALS.models }} models × {{ TRUST_BENCH_TOTALS.tasksPerModel }} data tasks
          </p>
          <h2 id="small-title" class="heading">
            Same models, same tasks. <em>With and without TinyPivot.</em>
          </h2>
          <p class="lede">
            Each model got the same {{ TRUST_BENCH_TOTALS.tasksPerModel }} data-analysis tasks, every one hiding a common trap: a join
            that double-counts, a month that is only half over, an uneven A/B split. It ran them once on its own and once with
            TinyPivot Pro. We measured how many answers were right, how long each task took, and what it cost.
          </p>
        </header>
        <ul class="small-highlights">
          <li v-for="item in modelHighlights" :key="item.value">
            <span class="small-hl-val mono">{{ item.value }}</span>
            <span class="small-hl-lbl">{{ item.label }}</span>
          </li>
        </ul>
        <ModelComparisonChart />
        <p class="small-foot">
          Small and open-weight models gain the most: TinyPivot does the exact maths and the checking, so the model only has to
          reason. Opus and Sonnet were already at 100% and stayed there. Cost is the API price for all
          {{ TRUST_BENCH_TOTALS.tasksPerModel }} tasks. †Inkling and DeepSeek ran on our own hardware for $0; their cost is what the
          same tokens would cost at each model's API rates.
          <router-link to="/whitepaper#internal" class="text-link">
            Every run, task and prompt →
          </router-link>
        </p>
      </div>
    </section>

    <section id="products" class="block products" aria-labelledby="products-title">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            Where TinyPivot runs
          </p>
          <h2 id="products-title" class="heading">
            Built for your agent. <em>Also available for your app.</em>
          </h2>
        </header>
        <div class="product-grid">
          <article class="product-card product-main">
            <p class="label product-for">
              For AI agents · the main product
            </p>
            <h3 class="product-name">
              TinyPivot MCP + Studio
            </h3>
            <p class="product-body">
              Install once and Claude Code, Cursor, Codex, Antigravity or pi can analyze any data they can reach, from
              spreadsheets and files to Snowflake, BigQuery and Postgres, with built-in checks, one-step statistics, and a Studio window that shows every chart and the SQL behind it.
            </p>
            <p class="product-price mono">
              Free to start · Pro from $149/yr
            </p>
            <div class="product-links">
              <a href="#install" class="btn btn-solid">Install</a>
              <router-link to="/docs" class="btn">
                Docs
              </router-link>
            </div>
          </article>
          <article class="product-card product-side">
            <p class="label product-for">
              Also available · for your web app
            </p>
            <h3 class="product-name">
              TinyPivot UI for React &amp; Vue 3
            </h3>
            <p class="product-body">
              An Excel-like data grid with pivot tables, charts and an optional AI analyst (bring your own API key),
              ready to drop into your product. One-time license, no per-seat fees.
            </p>
            <p class="product-price mono">
              Free tier · licenses from $49
            </p>
            <div class="product-links">
              <router-link to="/ui#demo" class="btn btn-solid">
                Try the live demo
              </router-link>
              <router-link to="/pricing?product=ui" class="btn">
                Pricing
              </router-link>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section id="install-options" class="block closing desk" aria-labelledby="closing-title">
      <div class="wrap closing-grid">
        <RetroWindow title="install.sh">
          <div class="closing-stack">
            <h2 id="closing-title" class="heading">
              Install once. <em>Every agent gets it.</em>
            </h2>
            <InstallBox source="closing" />
          </div>
        </RetroWindow>
      </div>
    </section>
  </main>
</template>

<style scoped>
.hero {
  padding: 20px 0 32px;
}

/* Inside the closing window the install box sits flat; the hero install box keeps its hard shadow as the primary CTA. */
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
  gap: 14px;
  align-content: start;
}

.hero-side {
  display: grid;
  align-content: start;
}

.hero-title {
  font-size: clamp(2.15rem, 6.2vw, 2.7rem);
  line-height: 1.04;
}

.hero-title em {
  display: block;
}

.hero .lede {
  font-size: 1.02rem;
  line-height: 1.6;
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

.savings {
  border-top: var(--line);
  border-bottom: var(--line);
}

.savings-stack {
  display: grid;
  gap: 28px;
}

.savings-head {
  margin-bottom: 0;
  max-width: 50rem;
}

.gain-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.gain-card {
  padding: 16px 18px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: 10px;
  align-content: start;
}

.gain-kicker {
  margin: 0;
}

.gain-val {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--ink);
}

.gain-bars {
  display: grid;
  gap: 7px;
}

.gain-bar-row {
  display: grid;
  gap: 3px;
}

.gain-bar-lbl {
  font-size: 0.68rem;
  color: var(--ink-muted);
}

.gain-bar-pro {
  font-weight: 700;
  color: #145a39;
}

.gain-track {
  height: 11px;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--rule);
}

.gain-fill {
  height: 100%;
  border-right: 1px solid var(--ink);
}

.gain-fill-base {
  background: #b9b3a4;
}

.gain-fill-pro {
  background: #1d7a4f;
}

.gain-detail {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--ink-muted);
}

.proof-cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.proof-card {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 22px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
}

.proof-card:hover {
  background: var(--ledger);
}

.proof-title {
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 400;
  line-height: 1.15;
  color: var(--ink);
}

.proof-body {
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--ink-muted);
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

.hero-proof {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: var(--line);
  background: var(--ledger);
  list-style: none;
  font-size: 0.92rem;
  line-height: 1.45;
}

.hero-proof li {
  color: var(--ink-muted);
}

.hero-proof strong {
  color: var(--ink);
  font-weight: 600;
}

.hero-proof-link {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--accent);
  white-space: nowrap;
  text-underline-offset: 3px;
}

.products,
.caps-section {
  border-top: var(--line);
}

.product-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.product-card {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 22px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
}

.product-for {
  margin: 0;
  color: var(--accent);
}

.product-name {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
}

.product-body {
  color: var(--ink-muted);
  line-height: 1.55;
}

.product-price {
  font-size: 0.78rem;
  color: var(--ink);
}

.product-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

a.gain-card {
  text-decoration: none;
  color: inherit;
}

a.gain-card:hover {
  background: var(--ledger);
}

.gain-link {
  font-size: 0.74rem;
}

.product-side {
  background: transparent;
  box-shadow: none;
  border-style: dashed;
}

.product-side .product-name {
  font-size: 1.35rem;
}

/* The evidence section above already draws the rule between them. */
.savings + .products {
  border-top: 0;
}

.small-models + .products {
  border-top: var(--line);
}

.small-models {
  border-top: 0;
}

.hero-npm {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  white-space: nowrap;
}

.hero-npm-num {
  font-size: 0.82rem;
  font-weight: 700;
}

.hero-npm-lbl {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}

.hero-install {
  display: grid;
  gap: 10px;
  margin-top: 4px;
}

.hero-install-k {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}

.hero-install-note {
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.small-head {
  max-width: 50rem;
}

.small-highlights {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 20px;
  list-style: none;
}

.small-highlights li {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-left: 4px solid #1d7a4f;
  background: var(--paper-raised);
}

.small-hl-val {
  font-size: 1.2rem;
  font-weight: 700;
  color: #145a39;
}

.small-hl-lbl {
  font-size: 0.86rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.small-foot {
  margin-top: 16px;
  max-width: 52rem;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

@media (min-width: 768px) {
  .hero {
    padding: 32px 0 48px;
  }

  .hero .lede {
    font-size: 1.12rem;
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

@media (min-width: 680px) {
  .small-highlights {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .gain-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-grid {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    align-items: start;
  }
}

@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    align-items: start;
    gap: 44px;
  }

  .proof-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
}
</style>
