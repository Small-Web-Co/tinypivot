<script setup lang="ts">
import ExternalBenchmarks from '../components/site/ExternalBenchmarks.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TrustBenchmarkChart from '../components/site/TrustBenchmarkChart.vue'
import TrustBenchmarkTable from '../components/site/TrustBenchmarkTable.vue'
import WarehouseBenchmark from '../components/site/WarehouseBenchmark.vue'
import { WAREHOUSES } from '../site/warehouses'
import { architecturePillars, TRUST_BENCH_DATE, WAREHOUSE_STUDY, warehouseArms, warehouseFindings, whitepaperHeroStats } from '../site/whitepaper'

// The page reads top to bottom: what is tested → why it matters → how → results → how it works → tiers.
const contents = [
  { id: 'products', title: 'What TinyPivot is', why: 'The two products, and which one these tests measure.' },
  { id: 'problem', title: 'The problem', why: 'What a “silent mistake” is and why it matters.' },
  { id: 'method', title: 'How we tested', why: 'The two test tracks and the three setups we compare.' },
  { id: 'internal', title: 'Results on our own tasks', why: 'Full control, so TinyPivot’s effect is isolated.' },
  { id: 'external', title: 'Results on public benchmarks', why: 'Problems we didn’t write, next to published leaders.' },
  { id: 'warehouses', title: 'Results on a live warehouse', why: 'Querying BigQuery directly, against the command line and exporting first.' },
  { id: 'architecture', title: 'How it works', why: 'The four pieces behind the results.' },
  { id: 'tiers', title: 'Free vs Pro', why: 'What each tier includes, and how to try it.' },
] as const

/** A section's number, "06", from its place in the contents. */
function sectionNo(id: typeof contents[number]['id']): string {
  return String(contents.findIndex(c => c.id === id) + 1).padStart(2, '0')
}

const arms = [
  {
    name: 'Baseline',
    body: 'The AI agent on its own. Claude models used their built-in Python and shell tools; the two local models, which don’t have those tools, got plain SQL over the same files.',
  },
  {
    name: 'TinyPivot Free',
    body: 'The free tier added alongside the agent’s own tools, the way a normal install works.',
  },
  {
    name: 'TinyPivot Pro',
    body: 'The full checks and statistics. On our own tasks Pro ran on its own, with shell access turned off, so every answer came through TinyPivot.',
  },
] as const

const silentMistakes = [
  'A join that matches each order to several rows and inflates revenue 2.25×.',
  'A filter that silently drops the 40% of rows with a missing value.',
  'An average of percentages that ignores how big each group is.',
  'A month that is six days old, compared against full months.',
  'An A/B test whose groups were split unevenly, so its result can’t be trusted.',
] as const

const takeaways = [
  'Accuracy rose with each step, on every model: 91% on their own, 93% with Free, 100% with Pro. Free never made a model worse.',
  'The hardest statistics questions changed most: 80% → 100% correct, and 2.1× faster on average.',
  'Local models gained the most. DeepSeek V4.1 on a DGX Spark also reached 100%, 39% faster.',
  'Claude Haiku went from 83% to 100%, level with Sonnet and Opus, for under 9¢ across all 18 tasks.',
  'Sonnet and Opus were already at 100%. TinyPivot kept them there and lowered their cost by 17–39%.',
] as const
</script>

<template>
  <main class="wp">
    <section class="wp-hero desk">
      <div class="wrap">
        <RetroWindow title="WHITE PAPER · TINYPIVOT">
          <div class="wp-hero-inner">
            <p class="label">
              White paper · updated {{ TRUST_BENCH_DATE }}
            </p>
            <h1 class="display wp-title">
              Can you trust an AI agent <em>with your numbers?</em>
            </h1>
            <p class="lede">
              AI agents write SQL and Python fluently, but they still make quiet mistakes: double-counting revenue through a join,
              comparing a half-finished month with full ones, misreading an A/B test. The query runs, the answer looks right, and it’s wrong.
              This paper measures how much TinyPivot reduces those mistakes, on our own tests and on two independent public benchmarks.
            </p>
            <div class="wp-hero-actions">
              <a href="/TinyPivot-Trust-Layer-Whitepaper.pdf" target="_blank" rel="noopener" class="btn btn-solid">
                Download the PDF ↓
              </a>
              <a href="#internal" class="btn">
                Jump to results
              </a>
            </div>
            <p class="label wp-stats-cap">
              Key findings · tap one for the detail
            </p>
            <div class="wp-stats">
              <a v-for="stat in whitepaperHeroStats" :key="stat.label" :href="stat.to" class="wp-stat">
                <span class="wp-stat-val mono">{{ stat.value }}</span>
                <span class="wp-stat-lbl">{{ stat.label }}</span>
              </a>
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <!-- Contents: explains the order of the page so readers can skip to what they care about -->
    <nav class="block wp-toc-section" aria-labelledby="toc-title">
      <div class="wrap">
        <div class="wp-toc">
          <div class="wp-toc-intro">
            <p id="toc-title" class="label">
              How this paper is organized
            </p>
            <p>
              We start with what’s being tested and why, then how, then the results: our own tasks first, because they isolate
              TinyPivot’s effect, then independent benchmarks to show it holds up on problems we didn’t design.
            </p>
          </div>
          <ol class="wp-toc-list">
            <li v-for="(item, i) in contents" :key="item.id">
              <a :href="`#${item.id}`">
                <span class="mono wp-toc-n">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="wp-toc-title">{{ item.title }}</span>
                <span class="wp-toc-why">{{ item.why }}</span>
              </a>
            </li>
          </ol>
        </div>
      </div>
    </nav>

    <!-- 01: The two products -->
    <section id="products" class="block wp-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('products') }} · What TinyPivot is
          </p>
          <h2 class="heading">
            Two products, <em>one engine.</em>
          </h2>
        </header>
        <div class="wp-two">
          <article class="wp-product wp-product-tested">
            <span class="proc-badge mono">TESTED IN THIS PAPER</span>
            <h3>TinyPivot MCP + Studio</h3>
            <p>
              An add-on for AI agents such as Claude Code, Cursor, Codex, Antigravity and pi. It gives the agent fast SQL over
              any data it can reach (files, spreadsheets, warehouses and APIs), automatic checks, one-step statistics, and a Studio window showing every chart with the SQL behind it.
              Every result in this paper measures this product.
            </p>
            <router-link to="/docs" class="text-link">
              Read the MCP docs →
            </router-link>
          </article>
          <article class="wp-product">
            <span class="proc-badge mono">FOR YOUR APP</span>
            <h3>TinyPivot UI for React &amp; Vue 3</h3>
            <p>
              The same grid, pivot and chart engine as a component you embed in your own product, with an optional AI analyst
              that uses your API key. It isn’t part of these benchmarks.
            </p>
            <router-link to="/ui" class="text-link">
              See TinyPivot UI →
            </router-link>
          </article>
        </div>
      </div>
    </section>

    <!-- 02: The problem -->
    <section id="problem" class="block wp-section">
      <div class="wrap">
        <div class="wp-prose">
          <p class="label">
            {{ sectionNo('problem') }} · The problem
          </p>
          <h2 class="heading">
            The mistakes that matter <em>don’t throw errors.</em>
          </h2>
          <p>
            A syntax error is harmless: the model sees it and fixes it in seconds. The mistakes that matter run cleanly and return a
            believable number. For example:
          </p>
          <ul class="wp-list">
            <li v-for="m in silentMistakes" :key="m">
              {{ m }}
            </li>
          </ul>
          <p>
            These are why teams still rebuild AI output in a spreadsheet before it reaches leadership. TinyPivot’s job is to catch them
            before the model answers.
          </p>
        </div>
      </div>
    </section>

    <!-- 03: Method -->
    <section id="method" class="block wp-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('method') }} · How we tested
          </p>
          <h2 class="heading">
            Two tracks, <em>three setups.</em>
          </h2>
          <p class="lede">
            Our own tasks let us control everything and isolate TinyPivot’s effect. Public benchmarks check that the effect holds up on
            problems someone else wrote. Prompts never hint at the trap.
          </p>
        </header>

        <div class="wp-process-grid">
          <article class="wp-process-card">
            <span class="proc-badge mono">TRACK A · OUR OWN TASKS</span>
            <h3>18 tasks with hidden traps, 5 models</h3>
            <p>
              Written like real requests from a manager: 6 routine reports, 6 multi-table questions and 6 hard statistics problems.
              Run on two local models (Inkling 2 Mini, DeepSeek V4.1) and three Claude models (Haiku, Sonnet, Opus): 270 runs in total.
            </p>
            <a href="#internal" class="text-link">See the results →</a>
          </article>
          <article class="wp-process-card">
            <span class="proc-badge mono">TRACK B · PUBLIC BENCHMARKS</span>
            <h3>MIT KramaBench and Adyen DABstep</h3>
            <p>
              Independent datasets and scoring we had no hand in. On KramaBench we ran each model with and without TinyPivot (372 runs).
              On DABstep, Adyen scored our three submissions blind on its 450-question leaderboard.
            </p>
            <a href="#external" class="text-link">See the results →</a>
          </article>
        </div>

        <div class="wp-arms">
          <p class="label">
            The three setups we compare on each model
          </p>
          <dl class="wp-arms-list">
            <div v-for="arm in arms" :key="arm.name" class="wp-arm">
              <dt class="mono">
                {{ arm.name }}
              </dt>
              <dd>{{ arm.body }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <!-- 04: Internal results -->
    <section id="internal" class="block wp-bench-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('internal') }} · Results · our own tasks
          </p>
          <h2 class="heading">
            Every model reached <em>100% with TinyPivot Pro.</em>
          </h2>
          <p class="lede">
            Five models, three setups, 18 tasks each. Overall accuracy went from 91% to 93% with Free and 100% with Pro.
          </p>
        </header>

        <div class="wp-spotlight">
          <p class="mono wp-spotlight-tag">
            BIGGEST JUMP · A SMALL MODEL ON A MAC
          </p>
          <p class="wp-spotlight-body">
            Thinking Machines <strong>Inkling 2 Mini</strong> went from <strong>78% to 100%</strong>, matching Claude Opus 5.5 on this suite,
            while getting <strong>44% faster</strong> and using <strong>half the output tokens</strong>, at no cloud cost.
          </p>
        </div>

        <p class="wp-howto">
          <strong>How to read the chart:</strong> each group is one model, ordered from the smallest (running on a laptop) on the left
          to the largest cloud model on the right; the last group combines all five. Inside every group the bars are always in the same
          order: Baseline, then Free, then Pro. The figure above a group is Pro’s gain over Baseline.
          The other tabs show speed and results by type of task.
        </p>

        <TrustBenchmarkChart />

        <div class="wp-takeaways">
          <p class="label">
            What the results show
          </p>
          <ul class="wp-list">
            <li v-for="t in takeaways" :key="t">
              {{ t }}
            </li>
          </ul>
        </div>

        <details class="wp-more">
          <summary class="mono">
            <span>Full per-model table, timings, costs and all 18 prompts</span>
            <span class="wp-more-ico" aria-hidden="true">+</span>
          </summary>
          <div class="wp-more-body">
            <TrustBenchmarkTable />
          </div>
        </details>
      </div>
    </section>

    <!-- 05: External benchmarks -->
    <section id="external" class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('external') }} · Results · independent public benchmarks
          </p>
          <h2 class="heading">
            It holds up on problems <em>we didn’t write.</em>
          </h2>
          <p class="lede">
            Two public benchmarks, each with its own data and scoring. On MIT’s KramaBench we ran the same models with and without
            TinyPivot, so you can see the direct gain. On Adyen’s DABstep, Adyen scored our answers blind, and we show them next to the
            leaderboard’s top entries. Most of those are large research systems built for the benchmark; TinyPivot is a single add-on.
          </p>
        </header>

        <ExternalBenchmarks />
      </div>
    </section>

    <!-- Direct warehouse connections -->
    <section id="warehouses" class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('warehouses') }} · Results · direct warehouse connections
          </p>
          <h2 class="heading">
            The same answers, <em>found faster.</em>
          </h2>
          <p class="lede">
            Querying BigQuery directly did not make Claude more accurate: every setup answered all {{ WAREHOUSE_STUDY.totalRuns }} runs correctly.
            It made it faster than the agent driving the bq command line itself, and much faster than exporting first, for a little more API spend than the command line.
          </p>
        </header>

        <div class="wp-prose wp-warehouse-method">
          <p>
            We built a fake Acme warehouse in BigQuery: 2.7 million orders (203 MB), 3.1 million shipments, 400,000 customers and
            35,000 days of campaign stats. The {{ WAREHOUSE_STUDY.questions }} questions are ones you can’t answer by looking at rows: the
            table is far bigger than the command line’s 100-row preview and TinyPivot’s 5,000-row result limit, and each question hides
            a trap such as a join that double-counts, a 12-day month, missing values or mixed currencies. We worked out every expected answer in
            BigQuery ourselves, and a script scores each reply against it, with tolerances and the caveats a correct answer must mention.
            Prompts never hint at the trap.
          </p>
          <p>
            Claude Haiku and Claude Sonnet each answered every question twice in each setup, run headless through Claude Code with
            TinyPivot MCP 0.9.1, on {{ WAREHOUSE_STUDY.date }}.
          </p>
        </div>

        <div class="wp-arms">
          <p class="label">
            The three setups
          </p>
          <dl class="wp-arms-list">
            <div v-for="arm in warehouseArms" :key="arm.id" class="wp-arm">
              <dt class="mono">
                {{ arm.name }}
              </dt>
              <dd>{{ arm.body }}</dd>
            </div>
          </dl>
        </div>

        <WarehouseBenchmark class="wp-warehouse-table" />

        <div class="wp-takeaways">
          <p class="label">
            What the results show
          </p>
          <ul class="wp-list">
            <li v-for="f in warehouseFindings" :key="f">
              {{ f }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 06: Architecture -->
    <section id="architecture" class="block wp-arch-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('architecture') }} · How it works
          </p>
          <h2 class="heading">
            Four small pieces, <em>all on your machine.</em>
          </h2>
          <p class="lede">
            The AI does the reasoning; TinyPivot does the arithmetic and the checking with DuckDB, a fast local database. No notebook servers or extra services,
            and your raw files never leave your computer.
          </p>
        </header>
        <ol class="wp-pillars">
          <li v-for="p in architecturePillars" :key="p.n" class="wp-pillar">
            <span class="mono wp-pillar-n">{{ p.n }}</span>
            <h3>{{ p.title }}</h3>
            <p>{{ p.summary }}</p>
            <details class="wp-pillar-more">
              <summary class="mono">
                Technical detail
              </summary>
              <p>{{ p.body }}</p>
            </details>
          </li>
        </ol>
      </div>
    </section>

    <!-- 07: Free vs Pro + CTA -->
    <section id="tiers" class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            {{ sectionNo('tiers') }} · Free vs Pro
          </p>
          <h2 class="heading">
            Free never cuts off your data. <em>Pro adds the deep checks.</em>
          </h2>
          <p class="lede">
            A tool meant to check your numbers shouldn’t truncate them, so Free has no row limit, no signup and no trial clock.
          </p>
        </header>
        <div class="wp-two">
          <article class="wp-product">
            <span class="proc-badge mono">TINYPIVOT FREE</span>
            <p>
              Unlimited local rows; SQL over CSV, Parquet, JSON and Excel; charts and pivots; whole-folder scanning; the Studio with
              links from every number to its SQL; offline HTML export; basic checks; and two analysis tools (explain a change, A/B test).
            </p>
          </article>
          <article class="wp-product wp-product-tested">
            <span class="proc-badge mono">TINYPIVOT PRO · FROM $149/YR</span>
            <p>
              Everything in Free, plus the deep checks (double-counting joins, half-finished periods, dropped missing values, outliers),
              the full statistics shelf, cross-file join discovery, memory between sessions, answer verification, 10 themes,
              white-label HTML and Excel export, and direct read-only queries to {{ WAREHOUSES.join(', ') }}.
            </p>
          </article>
        </div>
        <div class="wp-cta">
          <InstallBox
            source="whitepaper"
            prominent
            action-label="Try TinyPivot Free"
            action-meta="10s setup"
          />
          <div class="wp-cta-links">
            <a href="/TinyPivot-Trust-Layer-Whitepaper.pdf" target="_blank" rel="noopener" class="btn btn-solid">
              Download the PDF ↓
            </a>
            <router-link to="/pricing" class="btn">
              Compare plans
            </router-link>
            <router-link to="/docs" class="btn">
              MCP docs
            </router-link>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.wp-hero {
  padding-top: 32px;
  padding-bottom: 40px;
}

.wp-hero-inner {
  padding: clamp(22px, 4vw, 44px);
}

.wp-title {
  margin-top: 12px;
  max-width: 15ch;
}

.wp-hero .lede {
  margin-top: 16px;
  max-width: 68ch;
}

.wp-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}

.wp-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-top: 24px;
}

@media (min-width: 560px) {
  .wp-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .wp-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.wp-stat {
  padding: 14px 16px;
  border: var(--line);
  background: var(--ledger);
}

.wp-stat-val {
  display: block;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink);
}

.wp-stat-lbl {
  display: block;
  margin-top: 4px;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

.wp-prose {
  max-width: 74ch;
}

.wp-prose p + p {
  margin-top: 16px;
}

.wp-prose code {
  padding: 1px 5px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  font-family: var(--font-mono);
  font-size: 0.86em;
}

.wp-process-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 24px;
}

@media (min-width: 720px) {
  .wp-process-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.wp-process-card {
  padding: 18px 20px;
  border: var(--line);
  background: var(--ledger);
  display: grid;
  gap: 8px;
}

.proc-badge {
  justify-self: start;
  padding: 2px 7px;
  border: 1px solid var(--ink);
  background: var(--paper);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.wp-process-card h3 {
  margin: 0;
  font-size: 1.05rem;
}

.wp-process-card p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.wp-process-card code {
  padding: 0 4px;
  border: 1px solid var(--rule);
  background: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.wp-spotlight {
  padding: 16px 18px;
  margin-bottom: 20px;
  border: var(--line);
  border-left: 4px solid #1d7a4f;
  background: var(--paper);
  display: grid;
  gap: 6px;
}

.wp-spotlight-tag {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #145a39;
}

.wp-spotlight-body {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--ink);
}

.wp-spotlight-body code {
  padding: 0 4px;
  border: 1px solid var(--rule);
  background: var(--ledger);
  font-family: var(--font-mono);
  font-size: 0.86em;
}

.wp-bench-section {
  background: var(--ledger);
  border-top: var(--line);
  border-bottom: var(--line);
}

.wp-warehouse-method {
  margin-top: 8px;
}

.wp-warehouse-table {
  margin-top: 24px;
}

.wp-arch-section {
  background: var(--ledger);
  border-top: var(--line);
  border-bottom: var(--line);
}

.wp-pillars {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 720px) {
  .wp-pillars {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.wp-pillar {
  padding: 20px;
  border: var(--line);
  background: var(--paper);
}

.wp-pillar-n {
  font-size: 0.75rem;
  color: var(--ink-muted);
}

.wp-pillar h3 {
  margin: 6px 0 8px;
  font-size: 1.05rem;
}

.wp-pillar p {
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--ink-muted);
}

.wp-cta {
  margin-top: 28px;
  display: grid;
  gap: 16px;
}

.wp-cta-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.wp-stats-cap {
  margin-top: 26px;
}

a.wp-stat {
  text-decoration: none;
  color: inherit;
}

a.wp-stat:hover {
  background: var(--paper);
}

.wp-stats {
  margin-top: 10px;
}

.wp-toc-section {
  border-top: var(--line);
  border-bottom: var(--line);
  padding-top: 32px;
  padding-bottom: 32px;
}

.wp-toc {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

.wp-toc-intro {
  display: grid;
  gap: 10px;
  align-content: start;
}

.wp-toc-intro p:not(.label) {
  color: var(--ink-muted);
  line-height: 1.55;
}

.wp-toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border-top: 1px solid var(--rule);
}

.wp-toc-list a {
  display: grid;
  grid-template-columns: 2.2rem minmax(0, 1fr);
  gap: 0 8px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--rule);
  color: inherit;
  text-decoration: none;
}

.wp-toc-list a:hover {
  background: var(--ledger);
}

.wp-toc-n {
  grid-row: span 2;
  padding-top: 2px;
  font-size: 0.75rem;
  color: var(--accent);
}

.wp-toc-title {
  font-weight: 600;
}

.wp-toc-why {
  font-size: 0.86rem;
  color: var(--ink-muted);
}

@media (min-width: 860px) {
  .wp-toc {
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: 40px;
  }
}

.wp-section + .wp-section {
  border-top: var(--line);
}

.wp-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 720px) {
  .wp-two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.wp-product {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 20px;
  border: var(--line);
  background: var(--paper);
}

.wp-product-tested {
  border-left: 4px solid #1d7a4f;
}

.wp-product h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1.15;
}

.wp-product p {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--ink-muted);
}

.text-link {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--accent);
  text-underline-offset: 4px;
}

.wp-list {
  display: grid;
  gap: 8px;
  margin: 14px 0 16px;
  padding: 0;
  list-style: none;
}

.wp-list li {
  position: relative;
  padding-left: 18px;
  line-height: 1.5;
}

.wp-list li::before {
  content: '›';
  position: absolute;
  left: 2px;
  color: var(--accent);
  font-weight: 700;
}

.wp-process-card .text-link {
  margin-top: 2px;
}

.wp-arms {
  margin-top: 24px;
  display: grid;
  gap: 10px;
}

.wp-arms-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin: 0;
}

@media (min-width: 860px) {
  .wp-arms-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.wp-arm {
  padding: 14px 16px;
  border: 1px solid var(--rule);
  background: var(--paper);
}

.wp-arm dt {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wp-arm dd {
  margin: 6px 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.wp-howto {
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px dashed var(--ink);
  background: var(--paper);
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.wp-howto strong {
  color: var(--ink);
}

.wp-takeaways {
  margin-top: 24px;
  padding: 18px 20px;
  border: var(--line);
  background: var(--paper);
}

.wp-takeaways .wp-list {
  margin-bottom: 0;
}

.wp-more {
  margin-top: 18px;
  border: var(--line);
  background: var(--paper);
}

.wp-more summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  list-style: none;
  font-size: 0.82rem;
  font-weight: 700;
}

.wp-more summary::-webkit-details-marker {
  display: none;
}

.wp-more[open] .wp-more-ico {
  transform: rotate(45deg);
}

.wp-more-ico {
  font-size: 1.1rem;
  transition: transform 0.15s ease;
}

.wp-more-body {
  padding: 0 12px 12px;
}

.wp-pillar-more {
  margin-top: 10px;
}

.wp-pillar-more summary {
  cursor: pointer;
  font-size: 0.74rem;
  color: var(--accent);
}

.wp-pillar-more p {
  margin-top: 8px;
  font-size: 0.85rem;
}
</style>
