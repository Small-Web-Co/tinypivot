<script setup lang="ts">
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TrustBenchmarkTable from '../components/site/TrustBenchmarkTable.vue'
import { architecturePillars, hardTrapCases, TRUST_BENCH_DATE, whitepaperHeroStats } from '../site/whitepaper'
</script>

<template>
  <main class="wp">
    <section class="wp-hero desk">
      <div class="wrap">
        <RetroWindow title="WHITE PAPER · TINYPIVOT TRUST LAYER">
          <div class="wp-hero-inner">
            <p class="label">
              Technical White Paper · {{ TRUST_BENCH_DATE }} · Reproducible Benchmarks
            </p>
            <h1 class="display wp-title">
              The Trust Layer for <em>AI Data Analysis.</em>
            </h1>
            <p class="lede">
              LLMs are great at writing SQL and Python — until a silent many-to-many join doubles revenue,
              an unweighted average hides Simpson’s paradox, or a broken 54/46 A/B test gets shipped as a win.
              We built a local, deterministic DuckDB + statistical verification layer inside TinyPivot MCP and
              tested it across four models from a Mac-local small model to frontier Claude Sonnet.
            </p>
            <div class="wp-stats">
              <div v-for="stat in whitepaperHeroStats" :key="stat.label" class="wp-stat">
                <span class="wp-stat-val mono">{{ stat.value }}</span>
                <span class="wp-stat-lbl">{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </RetroWindow>
      </div>
    </section>

    <section class="block">
      <div class="wrap wp-prose">
        <p class="label">
          01 · The Problem
        </p>
        <h2 class="heading">
          Why agents get numbers <em>silently wrong.</em>
        </h2>
        <p>
          Most AI analytics tools focus on generating prettier charts faster. That misses the real reason data
          leaders still rebuild AI output in Excel before a board meeting: <strong>silent analytical failure</strong>.
          A query that throws a syntax error is harmless — the model fixes it in one retry. A query that runs
          cleanly in 12 ms while silently multiplying revenue by 2.1×, dropping 40% of NULL rows on <code>!=</code>,
          or celebrating a p-hacked A/B segment is dangerous because the LLM presents it with complete confidence.
        </p>
        <p>
          Existing tools split into three incomplete worlds: cloud notebooks (upload sensitive files, no runtime
          statistical oracle), heavy enterprise semantic layers (weeks of YAML modeling + cloud warehouse), and
          raw database MCP servers (read-only security checks only, zero analytical or statistical guardrails).
        </p>
      </div>
    </section>

    <section id="benchmarks" class="block wp-bench-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            02 · Empirical Proof (4 Models × 3 Arms)
          </p>
          <h2 class="heading">
            Higher accuracy <em>and</em> fewer tokens.
          </h2>
          <p class="lede">
            We first tested simple single-table SQL traps — and threw them out because modern 2026 models already
            ace textbook SQL. Instead, we built six enterprise-scale (2,000 to 20,000 row) Data Science and
            multi-table BI traps with exact mathematical ground-truth oracles, then ran every model head-to-head
            across Baseline (<code>bare-sql</code> or <code>Python/Bash</code>), <strong>TinyPivot Free</strong>,
            and <strong>TinyPivot Pro</strong>.
          </p>
        </header>

        <TrustBenchmarkTable />

        <div class="wp-findings">
          <article class="wp-finding">
            <h3 class="mono">
              1. Small local models jump +50 points
            </h3>
            <p>
              On a local Mac model (<code>Inkling 2 Mini</code>, fast non-thinking mode), accuracy jumped from
              <strong>2/6 (33%)</strong> on bare SQL and Free to <strong>5/6 (83%)</strong> on Pro — matching
              frontier Claude Sonnet running vanilla Python/Bash. On the confounded-discount task, both bare SQL
              and Free failed after 9 turns while Pro solved it in 5 turns (29s, −46% tokens vs. Free).
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              2. Frontier Sonnet beats Python on accuracy &amp; cost
            </h3>
            <p>
              Normally, verification layers add turns and cost. On Claude Sonnet, TinyPivot Pro achieved
              <strong>6/6 (100%)</strong> vs. <strong>5/6 (83%)</strong> for vanilla Python/Bash while costing
              <strong>$0.5407 vs. $0.5677</strong> (−4.8% cheaper than Python, −40.4% cheaper than Free).
              Adding zero-param column auto-inference to <code>analyze</code> alone cut Sonnet Pro tokens by 26%.
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              3. DeepSeek V4.1 hits 100% with −41% tokens on A/B
            </h3>
            <p>
              On a local DGX Spark cluster (<code>DeepSeek V4.1 Flash 1017</code>), Pro lifted accuracy from
              <strong>83% → 100%</strong> and cut total tokens <strong>−14.1%</strong> vs. Free. On the broken
              A/B test, Pro solved it in 3 turns / 14.5k tokens / 18.2s — <strong>−41% fewer tokens and 60% faster
                than bare DuckDB SQL</strong>.
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              4. Recursive Data Memory compounds over time
            </h3>
            <p>
              Every time an <code>[AUDIT]</code> warning catches a trap or a human edits SQL in TinyPivot Studio,
              a compact schema-fingerprinted lesson is stored locally. On repeat inquiries against the same schema,
              <code>Inkling 2 Mini</code> dropped from 6 turns / 32.5k tokens (Free) to 4 turns / 22.7k (Pro cold)
              to <strong>3 turns / 17.1k tokens (−47%)</strong> with Recursive Memory warm.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            03 · The Six Hard Traps
          </p>
          <h2 class="heading">
            What we tested <em>under the hood.</em>
          </h2>
        </header>
        <div class="wp-traps">
          <article v-for="item in hardTrapCases" :key="item.id" class="wp-trap">
            <h3 class="mono">
              {{ item.name }}
            </h3>
            <p><strong>Trap:</strong> {{ item.trap }}</p>
            <p><strong>Typical LLM failure:</strong> {{ item.failureMode }}</p>
            <p class="wp-guard">
              <strong>TinyPivot guardrail:</strong> {{ item.tinypivotGuard }}
            </p>
          </article>
        </div>
      </div>
    </section>

    <section class="block wp-arch-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            04 · Architecture
          </p>
          <h2 class="heading">
            Neuro-symbolic analytics in <em>under 2,500 schema tokens.</em>
          </h2>
          <p class="lede">
            TinyPivot stays fast and local by pairing an LLM’s reasoning with deterministic DuckDB &amp; TypeScript
            verification — keeping raw rows off the wire and out of context.
          </p>
        </header>
        <ol class="wp-pillars">
          <li v-for="p in architecturePillars" :key="p.n" class="wp-pillar">
            <span class="mono wp-pillar-n">{{ p.n }}</span>
            <h3>{{ p.title }}</h3>
            <p>{{ p.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="block">
      <div class="wrap wp-prose">
        <p class="label">
          05 · Why Free Includes Unlimited Local Rows
        </p>
        <h2 class="heading">
          Never truncate <em>a trust tool.</em>
        </h2>
        <p>
          An analyst evaluating a trust layer on a 15,000-row CSV should never see partial totals.
          <strong>TinyPivot Free includes unlimited local rows</strong> (up to DuckDB’s safe memory cap), charts,
          pivots, DuckDB SQL, Studio IDE + Proof-of-Work Lineage, basic SQL guardrails, offline HTML export, and
          <code>analyze(explain_change, ab_test)</code> — with no signup or trial clock.
        </p>
        <p>
          <strong>TinyPivot Pro</strong> gates the enterprise trust &amp; data science engine: deep relational and
          statistical audits (join fan-out, chasm traps, partial trailing periods, silent NULL drops, extreme
          outliers), the full <code>analyze</code> shelf (SRM + Holm-Bonferroni, controlled multivariate regression,
          right-censored cohorts, seasonal change-points), Recursive Data Memory, closed-loop claim verification,
          editorial themes, white-label HTML &amp; Excel exports, and direct PostgreSQL.
        </p>
        <div class="wp-cta">
          <InstallBox
            source="whitepaper"
            prominent
            action-label="Try TinyPivot MCP free · unlimited local rows"
            action-meta="10s setup"
          />
          <div class="wp-cta-links">
            <router-link to="/pricing" class="btn btn-solid">
              Compare Free vs. Pro
            </router-link>
            <router-link to="/docs" class="btn">
              Read MCP Docs
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
  max-width: 66ch;
}

.wp-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-top: 28px;
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
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
}

.wp-stat-lbl {
  display: block;
  margin-top: 4px;
  font-size: 0.84rem;
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

.wp-bench-section {
  background: var(--ledger);
  border-top: var(--line);
  border-bottom: var(--line);
}

.wp-findings {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 24px;
}

@media (min-width: 720px) {
  .wp-findings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.wp-finding {
  padding: 18px;
  border: var(--line);
  background: var(--paper);
}

.wp-finding h3 {
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.wp-finding p {
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--ink-muted);
}

.wp-traps {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 720px) {
  .wp-traps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1080px) {
  .wp-traps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.wp-trap {
  padding: 18px;
  border: var(--line);
  background: var(--paper);
  display: grid;
  gap: 8px;
}

.wp-trap h3 {
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  color: var(--accent, var(--ink));
}

.wp-trap p {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ink-muted);
}

.wp-guard {
  padding-top: 8px;
  border-top: 1px dashed var(--rule);
  color: var(--ink) !important;
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
</style>
