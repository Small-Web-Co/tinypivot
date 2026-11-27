<script setup lang="ts">
import HarnessReel from '../components/HarnessReel.vue'
import HeroCharts from '../components/site/HeroCharts.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TestimonialCarousel from '../components/site/TestimonialCarousel.vue'
import { benchmarkHeadline } from '../site/benchmark'
import { NPM_DOWNLOADS } from '../site/ui'
import { homeGainCards, smallModelCards } from '../site/whitepaper'

const facts = ['Free · unlimited rows', 'runs on your machine', 'no signup', 'no API key']

const agents = ['Claude Code', 'Cursor', 'Codex', 'Antigravity', 'pi'] as const

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
    claim: 'Stays on your computer.',
    detail: 'Files are queried locally. The AI sees results, not your raw data.',
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
          <div class="hero-grid">
            <div class="hero-copy">
              <p class="label">
                TinyPivot · the data-analysis sidecar for AI agents
              </p>
              <h1 class="display hero-title">
                Ask your AI about your data. <em>Get answers you can check.</em>
              </h1>
              <p class="lede">
                TinyPivot runs alongside Claude, Cursor, Codex and other AI agents as a sidecar for data work. It queries your
                spreadsheets and data files on your machine, catches the math mistakes AI quietly makes, and shows the SQL behind every number.
              </p>
              <div class="hero-trust">
                <p class="hero-trust-stat">
                  <span class="hero-trust-num mono">{{ NPM_DOWNLOADS }}</span>
                  <span class="hero-trust-lbl">npm downloads</span>
                </p>
                <p class="hero-trust-agents mono">
                  <span class="hero-trust-k">Works with</span>
                  <span v-for="agent in agents" :key="agent" class="hero-trust-agent">{{ agent }}</span>
                </p>
              </div>
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
                <InstallBox
                  source="hero"
                  prominent
                  action-label="Get started · run once"
                  action-meta="10s setup"
                />
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
        <header class="section-head">
          <p class="label">
            Also good to know · smaller models
          </p>
          <h2 id="small-title" class="heading">
            Frontier-level answers <em>from cheaper models.</em>
          </h2>
          <p class="lede">
            TinyPivot does the exact maths and the checking, so the model only has to reason. Small, local and open-weight models gain
            the most, which makes them practical for data work you’d rather not pay frontier prices for, including as a subagent.
          </p>
        </header>
        <div class="small-grid">
          <article v-for="card in smallModelCards" :key="card.model" class="small-card">
            <p class="small-where mono">
              {{ card.where }}
            </p>
            <h3 class="small-model">
              {{ card.model }}
            </h3>
            <p class="small-val mono">
              {{ card.headline }}
            </p>
            <p class="small-detail">
              {{ card.detail }}
            </p>
          </article>
        </div>
        <p class="small-foot">
          Frontier models were already at 100%; TinyPivot kept them there, answered hard statistics questions about 20% faster, and cut
          their cost by 17–39%. Accuracy is on our 18-task suite with TinyPivot Pro. *API-equivalent cost.
          <router-link to="/whitepaper#internal" class="text-link">
            See every model’s results →
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
              Install once and Claude Code, Cursor, Codex, Antigravity or pi can query your CSV, Excel, Parquet and JSON
              files locally, with built-in checks, one-step statistics, and a Studio window that shows every chart and the SQL behind it.
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

    <section class="block closing desk" aria-labelledby="closing-title">
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

.hero-install {
  margin-top: 4px;
}

.hero-side {
  display: grid;
  align-content: start;
}

.hero-title {
  font-size: clamp(2.15rem, 6.2vw, 3.25rem);
  line-height: 1.04;
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

.hero-trust {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 22px;
  padding: 12px 16px;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
}

.hero-trust-stat {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.hero-trust-num {
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
}

.hero-trust-lbl {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
}

.hero-trust-agents {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 0.72rem;
}

.hero-trust-k {
  margin-right: 2px;
  color: var(--ink-muted);
}

.hero-trust-agent {
  padding: 1px 6px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  color: var(--ink);
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

.small-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.small-card {
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 16px 18px;
  border: 1px solid var(--ink);
  background: var(--paper);
}

.small-where {
  margin: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
}

.small-model {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 400;
}

.small-val {
  margin: 4px 0 2px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #145a39;
}

.small-detail {
  font-size: 0.88rem;
  line-height: 1.45;
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
  .gain-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .small-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .product-grid {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    align-items: start;
  }
}

@media (min-width: 1024px) {
  .hero-grid {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    align-items: start;
    gap: 44px;
  }

  .proof-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
}
</style>
