<script setup lang="ts">
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TrustBenchmarkChart from '../components/site/TrustBenchmarkChart.vue'
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
              whale outliers invert a regional ranking, or a broken 52.5/47.5 A/B test gets shipped as a win.
              We built a local, deterministic DuckDB + statistical verification layer inside TinyPivot MCP and
              tested it across five models (from a Mac-local model and DGX Spark to Claude Haiku 5.5, Sonnet 5.5,
              and Opus 5.5) on 18 unhinted BI &amp; Data Science tasks plus the official Adyen/Hugging Face
              <code>adyen/DABstep</code> benchmark.
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
            02 · Empirical Proof (5 Models × 18 Unhinted Tasks + Official DABstep)
          </p>
          <h2 class="heading">
            Higher accuracy, <em>fewer turns</em> &amp; 2.1× faster Data Science.
          </h2>
          <p class="lede">
            Every prompt is written the way a real stakeholder asks — <strong>zero hints</strong> about traps,
            outliers, or statistical checks. We evaluated 18 realistic tasks spanning <strong>Routine BI</strong> (6),
            <strong>Relational Analytics</strong> (6), and <strong>Hard Data Science</strong> (6) across 5 models
            (270 runs), plus the external <strong>Adyen / Hugging Face <code>adyen/DABstep</code> Dev</strong>
            benchmark (10 official tasks over a 22 MB payments ledger, 60 runs scored with Adyen’s verbatim scorer).
          </p>
        </header>

        <TrustBenchmarkChart />
        <TrustBenchmarkTable />

        <div class="wp-findings">
          <article class="wp-finding">
            <h3 class="mono">
              1. Local models run 39%–45% faster with half the output tokens
            </h3>
            <p>
              On a DGX Spark cluster (<code>DeepSeek V4.1 Flash 1017</code>), <strong>TinyPivot Pro</strong> hit
              <strong>18/18 (100%)</strong> while cutting latency <strong>−39%</strong> (25.7s → 15.6s; <strong>3.4× faster</strong>
              on Hard DS), turns <strong>−30%</strong> (4.94 → 3.44), and output tokens <strong>−48%</strong>.
              On Mac-local <code>Inkling 2 Mini</code>, accuracy rose <strong>78% → 89% (+11.1 pts)</strong> while cutting
              latency <strong>−45%</strong> (46.1s → 25.2s; <strong>4.0× faster</strong> on Hard DS) and output tokens <strong>−50%</strong>.
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              2. Claude Haiku 5.5 hits 100% — matching Sonnet &amp; Opus for pennies
            </h3>
            <p>
              Unhinted vanilla <code>Claude Haiku 5.5</code> missed whale outliers, subtle 20-segment SRM, and
              right-censored cohorts (<strong>15/18, 83.3%</strong>). With <strong>TinyPivot Pro</strong>, Haiku jumped
              <strong>+16.7 pts to 18/18 (100%)</strong>, ran <strong>5% faster</strong> (12.5s vs. 13.1s; 23% faster on Hard DS),
              and cost just <strong>$0.083 API-equiv</strong> across all 18 tasks (+0.05¢/task over text-only Python).
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              3. Frontier Sonnet 5.5 &amp; Opus 5.5 cut Hard DS latency &amp; warm cost
            </h3>
            <p>
              On <code>Claude Sonnet 5.5</code>, <strong>TinyPivot Pro</strong> matched <strong>18/18 (100%)</strong> while
              running <strong>6% faster overall</strong> (18.8s vs. 20.0s; <strong>21% faster on Hard DS</strong>) at
              <strong>$1.01 vs. $1.22</strong> warm-cache API-equiv (−17%) plus live Studio charts &amp; lineage.
              <code>Claude Opus 5.5</code> ran <strong>20% faster on Hard DS</strong> (2.9× faster on confounded OLS) at
              <strong>−41% warm API-equiv cost</strong> ($1.38 vs. $2.32).
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              4. Verified on external Adyen/Hugging Face DABstep + Recursive Memory
            </h3>
            <p>
              On the public <code>adyen/DABstep</code> Dev benchmark (22 MB <code>payments.csv</code> + 1,000 nested JSON fee rules),
              <strong>TinyPivot Pro</strong> lifted 3-model accuracy from <strong>76.7% → 80.0%</strong> (Hard tasks
              <strong>76.2% → 81.0%</strong>, Haiku <strong>60% → 70%</strong>) using Adyen’s verbatim scorer. And on repeat
              inquiries against the same schema, local <strong>Recursive Data Memory</strong> cuts Inkling tokens a further
              <strong>−47%</strong> (6 → 3 turns).
            </p>
          </article>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            03 · The 18 Unhinted Tasks (Routine BI · Relational · Hard DS)
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
          05 · Why TinyPivot Free Includes Unlimited Local Rows
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
            action-label="Try TinyPivot Free · unlimited local rows"
            action-meta="10s setup"
          />
          <div class="wp-cta-links">
            <router-link to="/pricing" class="btn btn-solid">
              Compare TinyPivot Free vs. Pro
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
