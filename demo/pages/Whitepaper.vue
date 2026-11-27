<script setup lang="ts">
import ExternalBenchmarks from '../components/site/ExternalBenchmarks.vue'
import InstallBox from '../components/site/InstallBox.vue'
import RetroWindow from '../components/site/RetroWindow.vue'
import TrustBenchmarkChart from '../components/site/TrustBenchmarkChart.vue'
import TrustBenchmarkTable from '../components/site/TrustBenchmarkTable.vue'
import { architecturePillars, TRUST_BENCH_DATE, whitepaperHeroStats } from '../site/whitepaper'
</script>

<template>
  <main class="wp">
    <!-- Hero + Abstract: Benefits first, then clear path through process & evidence -->
    <section class="wp-hero desk">
      <div class="wrap">
        <RetroWindow title="TECHNICAL WHITE PAPER · TINYPIVOT TRUST LAYER">
          <div class="wp-hero-inner">
            <p class="label">
              Technical White Paper · {{ TRUST_BENCH_DATE }} · Internal &amp; External Benchmarks
            </p>
            <h1 class="display wp-title">
              The Trust Layer for <em>AI Data Analysis.</em>
            </h1>
            <p class="lede">
              <strong>Abstract —</strong> AI agents write fluent SQL and Python, yet silently double revenue on many-to-many joins,
              ship broken 52.5/47.5 A/B tests, or burn dozens of turns wrestling with multi-sheet Excel files.
              TinyPivot MCP adds a lightweight, 100% local DuckDB + statistical verification layer (&lt; 2,500 Free schema tokens, zero Jupyter/VLM bloat)
              that catches silent analytical failures before the model answers — making fast and local models dramatically more accurate, faster, and cheaper.
            </p>
            <div class="wp-hero-actions">
              <a href="/TinyPivot-Trust-Layer-Whitepaper.pdf" target="_blank" rel="noopener" class="btn btn-solid">
                Download Official PDF ↓
              </a>
              <a href="#internal" class="btn">
                Internal Bench
              </a>
              <a href="#external" class="btn">
                External Leaderboards
              </a>
            </div>
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

    <!-- 01: Executive Benefits & Evaluation Process -->
    <section class="block">
      <div class="wrap">
        <div class="wp-prose">
          <p class="label">
            01 · Why It Matters &amp; How We Evaluated It
          </p>
          <h2 class="heading">
            Catch silent wrong math — <em>and prove it honestly.</em>
          </h2>
          <p>
            A SQL syntax error is harmless; the model fixes it in two seconds. The real reason data leaders still rebuild AI output
            in Excel before a board meeting is <strong>silent analytical failure</strong>: queries that execute cleanly in 12 ms while
            multiplying revenue 2.25× on a fan-out join, dropping 40% of NULL rows on <code>!=</code>, averaging percentages unweighted,
            or celebrating a p-hacked A/B segment.
          </p>
          <p>
            To measure whether a lightweight local MCP actually solves this — without hiding behind a stronger base model — we keep our
            evidence strictly separated into two tracks:
          </p>
        </div>

        <div class="wp-process-grid">
          <article class="wp-process-card">
            <span class="proc-badge mono">TRACK A · INTERNAL CONTROLLED SUITE</span>
            <h3>18 Unhinted BI, Relational &amp; Hard DS Tasks</h3>
            <p>
              <strong>Purpose:</strong> Isolate TinyPivot’s exact lift on real-world analytical traps across 5 models
              (Thinking Machines <code>Inkling 2 Mini</code>, DGX Spark <code>DeepSeek V4.1</code>, <code>Claude Haiku 5.5</code>,
              <code>Sonnet 5.5</code>, and <code>Opus 5.5</code> — 270 controlled runs). Prompts contain <strong>zero hints</strong>.
            </p>
          </article>
          <article class="wp-process-card">
            <span class="proc-badge mono">TRACK B · EXTERNAL PUBLIC BENCHMARKS</span>
            <h3>MIT KramaBench (ICLR 2026) &amp; Adyen DABstep</h3>
            <p>
              <strong>Purpose:</strong> Verify zero-bloat generality on independent third-party datasets we did not write —
              combining a <strong>3-model same-model controlled A/B</strong> on MIT’s multi-file data lakes (372 runs across Sonnet 5.5, Haiku 5.5 &amp; local DeepSeek V4.1) with
              <strong>three live 450-task blind leaderboard submissions</strong> scored directly by Adyen.
            </p>
          </article>
        </div>
      </div>
    </section>

    <!-- 02: Internal Controlled Benchmark -->
    <section id="internal" class="block wp-bench-section">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            02 · Track A — Internal Controlled Benchmark (5 Models × 18 Unhinted Tasks = 270 Runs)
          </p>
          <h2 class="heading">
            Monotonic lift from 91% → 93% Free → <em>100% Pro.</em>
          </h2>
          <p class="lede">
            Every task is phrased like a real stakeholder ask across <strong>Routine BI (6)</strong>,
            <strong>Relational Analytics (6)</strong>, and <strong>Hard Data Science (6)</strong>.
            Expand the collapsible catalog below the table to read all 18 exact prompts.
          </p>
        </header>

        <div class="wp-spotlight">
          <p class="mono wp-spotlight-tag">
            STANDOUT RESULT · THINKING MACHINES INKLING 2 MINI (MAC LOCAL · $0 CLOUD SPEND)
          </p>
          <p class="wp-spotlight-body">
            Adding TinyPivot Pro lifted Mac-local <strong>Thinking Machines Inkling 2 Mini</strong> by
            <strong>+22.2 percentage points</strong> (<code>78% → 83% Free → 100% Pro</code>, matching frontier Opus 5.5),
            cut latency <strong>−44%</strong> (<code>46.1s → 26.0s/task</code>; <strong>3.8× faster</strong> on Hard Data Science),
            and cut output tokens in half (<strong>−50%</strong>) — with local Recursive Data Memory trimming repeat schema tokens another <strong>−47%</strong>.
          </p>
        </div>

        <TrustBenchmarkChart />
        <TrustBenchmarkTable />

        <div class="wp-findings">
          <article class="wp-finding">
            <h3 class="mono">
              1. Local &amp; open-weights models hit 100% — 39%–44% faster
            </h3>
            <p>
              On DGX Spark (<code>DeepSeek V4.1 Flash 1017</code>), <strong>TinyPivot Pro</strong> hit <strong>18/18 (100%)</strong> while cutting latency
              <strong>−39%</strong> (25.7s → 15.6s; <strong>3.4× faster</strong> on Hard DS), turns <strong>−30%</strong> (4.94 → 3.44), output tokens <strong>−48%</strong>, and imputed DeepSeek-Flash API cost <strong>−7%</strong> ($0.055 vs. $0.059†; $0 local).
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              2. Claude Haiku 5.5 climbs 83% → 89% Free → 100% Pro for pennies
            </h3>
            <p>
              Unhinted vanilla <code>Claude Haiku 5.5</code> missed whale outliers, subtle 20-segment SRM, and
              right-censored cohorts (<strong>15/18, 83%</strong>). Adding <strong>TinyPivot Free</strong> lifted it to
              <strong>16/18 (89%)</strong>, and <strong>TinyPivot Pro</strong> (MCP-only, no Bash) hit <strong>18/18 (100%)</strong>,
              5% faster overall (23% faster Hard DS) for <strong>$0.083 API-equiv</strong> across all 18 tasks.
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              3. Frontier Sonnet 5.5 &amp; Opus 5.5 stay at 100% — faster &amp; cheaper
            </h3>
            <p>
              <code>Claude Sonnet 5.5</code> hit <strong>18/18 (100%)</strong> on both Free (<strong>−28% warm API*</strong> at $0.88) and Pro (<strong>−17% warm API*</strong> at $1.01, 21% faster Hard DS) plus live Studio lineage.
              <code>Claude Opus 5.5</code> hit <strong>18/18 (100%)</strong> on both tiers, <strong>19% faster on Hard DS</strong> (2.8× faster OLS) at <strong>−39% warm API*</strong> ($1.41 vs. $2.32).
            </p>
          </article>
          <article class="wp-finding">
            <h3 class="mono">
              4. Zero regressions on Free — verified monotonically across all 5 models
            </h3>
            <p>
              Across all 90 model-tasks per arm, accuracy rises strictly monotonically: <strong>91% (82/90) Baseline → 93% (84/90) TinyPivot Free → 100% (90/90) TinyPivot Pro</strong>,
              with Hard Data Science climbing <strong>80% → 87% Free → 100% Pro</strong> at <strong>2.1× faster</strong> average wall clock (39.7s → 19.3s).
            </p>
          </article>
        </div>
      </div>
    </section>

    <!-- 03: External Public Benchmarks & How We Rank -->
    <section id="external" class="block">
      <div class="wrap">
        <header class="section-head">
          <p class="label">
            03 · Track B — External Public Benchmarks &amp; Leaderboard Comparisons
          </p>
          <h2 class="heading">
            How TinyPivot ranks on <em>independent public benchmarks.</em>
          </h2>
          <p class="lede">
            To avoid grading only our own tests, we evaluated TinyPivot on two demanding public benchmarks —
            showing our <strong>same-model Vanilla baselines</strong> right alongside <strong>published leaderboard leaders</strong>
            so base-model strength and TinyPivot’s direct lift are both crystal clear. Expand the drawers to inspect real questions from each benchmark.
          </p>
        </header>

        <ExternalBenchmarks />
      </div>
    </section>

    <!-- 04: Architecture -->
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
            TinyPivot stays fast, local, and dependency-light by pairing an LLM’s reasoning with deterministic DuckDB &amp; TypeScript
            verification — zero Jupyter servers, zero VLM judges, and raw rows never leave your machine.
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

    <!-- 05: Free vs Pro + CTA -->
    <section class="block">
      <div class="wrap wp-prose">
        <p class="label">
          05 · Why TinyPivot Free Includes Unlimited Local Rows
        </p>
        <h2 class="heading">
          Never truncate <em>a trust tool.</em>
        </h2>
        <p>
          An analyst evaluating a trust layer on a 22 MB CSV or multi-sheet Excel workbook should never see partial totals.
          <strong>TinyPivot Free includes unlimited local rows</strong> (up to DuckDB’s safe memory cap), charts,
          pivots, DuckDB SQL, smart <code>.xlsx</code> reading, 1-call folder schema scanning, Studio IDE + Proof-of-Work Lineage,
          headless <code>--no-studio</code> mode, offline HTML export, basic SQL guardrails, and <code>analyze(explain_change, ab_test)</code> — with no signup or trial clock.
        </p>
        <p>
          <strong>TinyPivot Pro</strong> unlocks the full enterprise trust &amp; data science engine: deep relational and
          statistical audits (join fan-out, chasm traps, partial trailing periods, silent NULL drops, extreme
          outliers), the full <code>analyze</code> shelf (SRM + Holm-Bonferroni, controlled multivariate regression,
          right-censored cohorts, seasonal change-points), cross-file join discovery, Recursive Data Memory,
          closed-loop claim verification, 10 editorial themes, white-label HTML &amp; Excel exports, and direct PostgreSQL.
        </p>
        <div class="wp-cta">
          <InstallBox
            source="whitepaper"
            prominent
            action-label="Try TinyPivot Free · unlimited local rows"
            action-meta="10s setup"
          />
          <div class="wp-cta-links">
            <a href="/TinyPivot-Trust-Layer-Whitepaper.pdf" target="_blank" rel="noopener" class="btn btn-solid">
              Download Official PDF White Paper ↓
            </a>
            <router-link to="/pricing" class="btn">
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
