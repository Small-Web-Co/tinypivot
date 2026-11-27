<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import HarnessReel from '../components/HarnessReel.vue'
import HeroCharts from '../components/site/HeroCharts.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TestimonialCarousel from '../components/site/TestimonialCarousel.vue'
import { benchmarkHeadline } from '../site/benchmark'
import { homeGainCards } from '../site/whitepaper'

// The showcase loads the real grid and chart library, so it is fetched in the
// browser only and kept out of the prerendered HTML and the first bundle.
const ThemeShowcase = defineAsyncComponent(() => import('../components/site/ThemeShowcase.vue'))
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const facts = ['TinyPivot Free · unlimited rows', 'runs locally', 'no signup', 'no API key']

// The hero's fine print comes from the measured benchmark shown in the savings section.
const headline = benchmarkHeadline()

const heroPoints = [
  '100% verified accuracy on silent SQL, join & statistical traps (91% → 100%)',
  '2.1× faster data science — lifts local models like Inkling 2 Mini +22 pts with −50% output tokens',
  'Runs 100% locally on CSV, Parquet, JSON & Excel with < 2,500 Free schema tokens',
] as const

const capabilities = [
  {
    n: '01',
    title: 'Trust & SQL guardrails',
    body: 'Silent-when-clean DuckDB audits catch join fan-out, chasm traps, unweighted rate averages, partial trailing months, NULL drops and extreme outliers before the model answers.',
  },
  {
    n: '02',
    title: '1-call Data Science shelf',
    body: 'Deterministic A/B testing (with SRM + Holm-Bonferroni), controlled multivariate regression, right-censored cohorts, seasonal anomaly detection, and Kitagawa mix-vs-rate decomposition.',
  },
  {
    n: '03',
    title: 'Proof-of-Work Studio & Memory',
    body: 'Unlimited local rows in TinyPivot Free with clickable lineage, underlying rows, and offline HTML export. TinyPivot Pro adds Recursive Data Memory that learns your schemas to cut tokens on repeat work, plus Excel & Postgres.',
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
                The Trust Layer &amp; Data IDE for AI Agents.
              </p>
              <h1 class="display hero-title">
                Verified Data Analysis inside <em>your favorite AI Agent.</em>
              </h1>
              <p class="lede">
                Built for Claude, Cursor, Antigravity, Codex and pi — trusted across 53,000+ npm downloads.
                TinyPivot pairs local DuckDB + deterministic SQL &amp; statistical guardrails with D3.js charts and pivots for
                <mark class="hl">verified accuracy</mark>, <mark class="hl">lower token cost</mark>,
                <mark class="hl">local privacy</mark>, and <mark class="hl">Proof-of-Work lineage</mark>.
              </p>
              <ul class="hero-points">
                <li v-for="point in heroPoints" :key="point">
                  {{ point }}
                </li>
              </ul>
              <div id="install" class="hero-install">
                <InstallBox
                  source="hero"
                  prominent
                  action-label="Get started · run once"
                  action-meta="10s setup"
                />
                <ul class="facts" aria-label="Free tier">
                  <li v-for="fact in facts" :key="fact">
                    {{ fact }}
                  </li>
                </ul>
              </div>
              <div class="hero-meta-links">
                <a href="#savings" class="hero-fine">
                  Measured across local &amp; frontier models: higher accuracy, 2.1× faster Hard DS, up to 50% fewer output tokens.
                  See the gains ↓
                </a>
                <router-link to="/whitepaper" class="hero-why-link">
                  Read the Technical White Paper →
                </router-link>
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
      <div class="wrap savings-stack">
        <header class="section-head savings-head">
          <p class="label">
            Measured, not modelled · Cost, Tokens &amp; Accuracy
          </p>
          <h2 id="savings-title" class="heading">
            Higher accuracy <em>and lower token cost.</em>
          </h2>
          <p class="lede">
            Verification usually adds tokens. TinyPivot does the opposite: deterministic DuckDB audits and 1-call statistical
            tools eliminate trial-and-error Python turns, while <strong>Recursive Data Memory</strong> learns your schemas to
            cut repeat spend by <strong>47%</strong>.
          </p>
        </header>

        <div class="gain-grid">
          <article v-for="card in homeGainCards" :key="card.id" class="gain-card">
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
          </article>
        </div>

        <div class="proof-cards">
          <router-link to="/whitepaper" class="proof-card">
            <p class="label">
              Proof 01 · Technical White Paper &amp; Official PDF
            </p>
            <h3 class="proof-title">
              Full Internal &amp; Independent Public Benchmarks
            </h3>
            <p class="proof-body">
              See exact accuracy, speed, token, and cost lifts across <strong>Thinking Machines Inkling 2 Mini</strong>,
              <strong>DeepSeek V4.1</strong>, and <strong>Claude 5.5</strong> — plus how TinyPivot ranks against published
              leaders on independent multi-file data lakes and financial reasoning leaderboards.
            </p>
            <span class="text-link">Read the White Paper &amp; download PDF →</span>
          </router-link>

          <router-link to="/docs#savings" class="proof-card">
            <p class="label">
              Proof 02 · Everyday BI Cost &amp; Token Calculator
            </p>
            <h3 class="proof-title">
              {{ headline.cheaperThanPythonPct }}% cheaper than Python · 92.9% fewer context tokens
            </h3>
            <p class="proof-body">
              Measured on a {{ headline.largeRows.toLocaleString('en-US') }}-row dataset in Claude Code (5.6¢ vs. 6.6¢ per question)
              with 0 raw rows pasted into context. Includes the greenbar token receipt and interactive workload calculator.
            </p>
            <span class="text-link">Inspect cost breakdown &amp; run the calculator →</span>
          </router-link>
        </div>
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

.hl {
  padding: 0 3px;
  margin: 0 -1px;
  border-radius: 2px;
  background: linear-gradient(
    104deg,
    transparent 0.8%,
    rgba(255, 214, 70, 0.78) 2.6%,
    rgba(255, 226, 106, 0.68) 94%,
    transparent 98.5%
  );
  color: var(--ink);
  font-weight: 500;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
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

.hero-meta-links {
  display: grid;
  gap: 6px;
}

.hero-fine {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.hero-why-link {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--accent);
  text-underline-offset: 4px;
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
