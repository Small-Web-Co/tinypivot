<script setup lang="ts">
import { computed, ref } from 'vue'
import McpHighlightReel from '../components/McpHighlightReel.vue'

type HarnessId = 'antigravity' | 'terminal' | 'claude' | 'cursor' | 'postgres'
type ProBillingMode = 'monthly' | 'yearly' | 'lifetime'
type TeamBillingMode = 'monthly' | 'yearly'

const selectedHarness = ref<HarnessId>('antigravity')
const copiedKey = ref<string | null>(null)
const proBilling = ref<ProBillingMode>('yearly')
const teamBilling = ref<TeamBillingMode>('yearly')
const checkoutLoading = ref<string | null>(null)
const checkoutError = ref<string | null>(null)

// Interactive Token & API Spend Savings Calculator (cache-aware, conservative math)
const rowsPerQuery = ref(2000)
const colsPerQuery = ref(8)
const followUpTurns = ref(4)
const queriesPerWeek = ref(20)
const teamSize = ref(1)
const assumePromptCaching = ref(true)

const modelRates = [
  { name: 'GPT-5', provider: 'OpenAI', inputRate: 1.75, outputRate: 10.0, color: '#38bdf8' },
  { name: 'Claude Sonnet 5.5', provider: 'Anthropic', inputRate: 2.0, outputRate: 10.0, color: '#818cf8' },
  { name: 'Gemini 4 Neon', provider: 'Google', inputRate: 3.0, outputRate: 15.0, color: '#34d399' },
  { name: 'Claude Opus 5.5', provider: 'Anthropic', inputRate: 4.0, outputRate: 20.0, color: '#f59e0b' },
  { name: 'Frontier / Reasoning', provider: 'Opus / GPT-6', inputRate: 8.0, outputRate: 32.0, color: '#fb7185' },
] as const

// Conservative ~5 tokens/cell for JSON/CSV rows (~20 bytes/cell ÷ 4 chars/tok).
// Without TinyPivot: Turn 1 pays full input rate on raw rows; follow-ups pay either 10% (cached)
// or 100% (uncached) input re-read PLUS ~600 output tokens per follow-up chart/table rewrite.
// With TinyPivot: ~200-token schema summary enters context; rows stream locally at 0 tokens,
// and interactive follow-up slices (Chart/Pivot/Sort/Filter/Drill-through) cost 0 tokens.
const rawDatasetTokens = computed(() => rowsPerQuery.value * colsPerQuery.value * 5)

const tokensPerQuerySaved = computed(() => {
  const repeatFactor = assumePromptCaching.value ? 0.1 : 1.0
  const withoutMcpInput = rawDatasetTokens.value * (1 + followUpTurns.value * repeatFactor)
  const withMcpInput = 200 * (1 + repeatFactor)
  return Math.max(0, Math.round(withoutMcpInput - withMcpInput))
})

const outputTokensPerQuerySaved = computed(() =>
  // Avoids regenerating markdown tables / throwaway matplotlib/HTML scripts on local follow-ups
  Math.max(0, (followUpTurns.value - 1) * 600),
)

const monthlyQueries = computed(() => queriesPerWeek.value * 4.33 * teamSize.value)

const monthlyTokensSaved = computed(() =>
  (tokensPerQuerySaved.value + outputTokensPerQuerySaved.value) * monthlyQueries.value,
)

const modelSavings = computed(() => {
  const rows = modelRates.map((m) => {
    const inputUsd = (tokensPerQuerySaved.value / 1_000_000) * m.inputRate
    const outputUsd = (outputTokensPerQuerySaved.value / 1_000_000) * m.outputRate
    const perAnalysisUsd = inputUsd + outputUsd
    const monthlyUsd = perAnalysisUsd * monthlyQueries.value
    return {
      ...m,
      perAnalysisUsd,
      monthlyUsd,
      annualUsd: monthlyUsd * 12,
    }
  })
  const maxMonthly = Math.max(...rows.map(r => r.monthlyUsd), 100)
  return rows.map(r => ({
    ...r,
    barPct: Math.min(100, Math.max(4, Math.round((r.monthlyUsd / maxMonthly) * 100))),
    proMarkerPct: Math.min(100, (19 / maxMonthly) * 100),
    teamMarkerPct: Math.min(100, (79 / maxMonthly) * 100),
    roiVsPro: r.monthlyUsd / 19,
  }))
})

const medianModelSavings = computed(() => modelSavings.value[2]) // Gemini 4 Neon ($3 in / $15 out)

const proPlanDetails = computed(() => {
  if (proBilling.value === 'monthly') {
    return { plan: 'mcp_pro_monthly', price: '$19', period: '/month', sub: 'Cancel anytime. Taxes calculated at checkout.' }
  }
  if (proBilling.value === 'lifetime') {
    return { plan: 'mcp_pro_lifetime', price: '$399', period: 'one-time', sub: 'Local Pro perpetual license (all v1.x updates). Zero subscription.' }
  }
  return { plan: 'mcp_pro_yearly', price: '$149', period: '/year', sub: '$12.42/mo billed annually — save 35%.' }
})

const teamPlanDetails = computed(() => {
  if (teamBilling.value === 'monthly') {
    return { plan: 'mcp_team_monthly', price: '$79', period: '/month', sub: 'Up to 5 seats ($15.80/seat). Cancel anytime.' }
  }
  return { plan: 'mcp_team_yearly', price: '$699', period: '/year', sub: 'Up to 5 seats ($11.65/seat/mo) — save 26%.' }
})

async function startCheckout(plan: string) {
  checkoutLoading.value = plan
  checkoutError.value = null
  try {
    const res = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    const data = await res.json() as { url?: string, error?: string }
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Could not start Stripe checkout')
    }
    window.location.href = data.url
  }
  catch (err) {
    checkoutError.value = err instanceof Error ? err.message : 'Checkout unavailable right now.'
  }
  finally {
    checkoutLoading.value = null
  }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000)
    return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)
    return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
}

function fmtUsd(n: number): string {
  if (n >= 1000)
    return `$${Math.round(n).toLocaleString()}`
  if (n >= 10)
    return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

const initCommand = 'npx @smallwebco/tinypivot-mcp init'

const harnessConfigs: Record<HarnessId, { label: string, subtitle: string, filename: string, code: string }> = {
  antigravity: {
    label: 'Antigravity',
    subtitle: 'Side pane ("+"), sidebar global view, and inline interactive charts/pivots directly inside chat.',
    filename: '~/.gemini/antigravity/mcp_config.json',
    code: `{
  "mcpServers": {
    "tinypivot": {
      "command": "npx",
      "args": ["-y", "@smallwebco/tinypivot-mcp"],
      "env": {
        "TINYPIVOT_LICENSE_KEY": "optional-pro-key"
      }
    }
  }
}`,
  },
  terminal: {
    label: 'Claude Code / OpenCode / pi / Codex',
    subtitle: 'Renders crisp Unicode bar charts + pivot tables in your terminal AND opens a live SSE-synced Data IDE on localhost beside your terminal.',
    filename: 'Terminal MCP config (or run npx @smallwebco/tinypivot-mcp init)',
    code: `# Auto-wire all detected harnesses in one command:
npx @smallwebco/tinypivot-mcp init

# Or add manually to Claude Code:
claude mcp add tinypivot -- npx -y @smallwebco/tinypivot-mcp --open`,
  },
  claude: {
    label: 'Claude Desktop',
    subtitle: 'Add to claude_desktop_config.json and restart Claude Desktop to render charts and pivots inline.',
    filename: 'claude_desktop_config.json',
    code: `{
  "mcpServers": {
    "tinypivot": {
      "command": "npx",
      "args": ["-y", "@smallwebco/tinypivot-mcp"]
    }
  }
}`,
  },
  cursor: {
    label: 'Cursor',
    subtitle: 'Drop into ~/.cursor/mcp.json so agents can inspect CSVs, JSON logs, or SQL queries from any database visually.',
    filename: '~/.cursor/mcp.json',
    code: `{
  "mcpServers": {
    "tinypivot": {
      "command": "npx",
      "args": ["-y", "@smallwebco/tinypivot-mcp"]
    }
  }
}`,
  },
  postgres: {
    label: 'Direct Postgres (Pro)',
    subtitle: 'Works with any database via CSV/JSON piping (BigQuery, Snowflake, MySQL, DuckDB, Databricks) — plus optional direct read-only Postgres with AST SQL validation and table allowlists.',
    filename: 'mcp_config.json (optional direct DATABASE_URL)',
    code: `{
  "mcpServers": {
    "tinypivot": {
      "command": "npx",
      "args": ["-y", "@smallwebco/tinypivot-mcp"],
      "env": {
        "DATABASE_URL": "postgresql://readonly:pass@localhost:5432/analytics",
        "TINYPIVOT_ALLOWED_TABLES": "orders,customers,products",
        "TINYPIVOT_LICENSE_KEY": "TP-MCP..."
      }
    }
  }
}`,
  },
}

const tools = [
  { name: 'open_tinypivot', role: 'Launch the Data IDE', desc: 'Opens the interactive Chart / Pivot / Data view in the side pane, sidebar, or inline. Works zero-arg with built-in sample data.' },
  { name: 'load_file', role: 'Local CSV / TSV / JSON', desc: 'Loads local files or exports from BigQuery, Snowflake, MySQL, DuckDB, or Databricks in 1 call without stuffing raw rows into LLM context.' },
  { name: 'load_data', role: 'Pipe Any MCP Tool', desc: 'Accepts JSON rows from Stripe, GitHub, APIs, or any SQL MCP server and immediately renders a chart + matching pivot table.' },
  { name: 'configure_pivot', role: 'Deterministic Pivot', desc: 'Computes exact sums, averages, medians, and totals in TinyPivot Core — zero LLM arithmetic hallucinations.' },
  { name: 'configure_chart', role: 'Chart-First Answers', desc: 'Switches to Bar, Stacked Bar, Line, Area, Pie, Donut, Scatter, Heatmap, or Radar pre-configured for the question.' },
  { name: 'query_postgres', role: 'Pro · Direct Postgres', desc: 'Optional direct AST-validated READ ONLY Postgres connector with table allowlists. Works alongside universal CSV/JSON piping for any database.' },
]

const samplePrompts = [
  'Open TinyPivot and show me a chart of sample SaaS revenue by quarter and region.',
  'Load ./exports/q3_orders.csv into TinyPivot and chart net revenue by category and channel.',
  'Pull our last 100 Stripe charges and load them into TinyPivot so I can pivot revenue by month and country.',
  'Export monthly active accounts by plan from BigQuery, Snowflake, DuckDB, or Postgres and chart it in TinyPivot.',
]

function copyText(key: string, text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key)
        copiedKey.value = null
    }, 1800)
  }
}
</script>

<template>
  <div class="mcp-page">
    <nav class="mcp-nav">
      <div class="mcp-nav-inner">
        <router-link to="/" class="mcp-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
            <path d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>TinyPivot</span>
        </router-link>
        <div class="mcp-nav-links">
          <router-link to="/">
            UI Library
          </router-link>
          <a href="#reel">Highlight Reel</a>
          <a href="#savings">ROI Calculator</a>
          <a href="#setup">Setup</a>
          <a href="#tools">Tools</a>
          <a href="#pricing" class="mcp-nav-cta">Pricing</a>
        </div>
      </div>
    </nav>

    <header class="mcp-hero">
      <div class="mcp-badge">
        In-Agent Analytics · MCP Apps (SEP-1865) · Free Core Charts
      </div>
      <h1>
        The <span class="mcp-gradient">Data IDE</span> Inside Your AI Workflows
      </h1>
      <p class="mcp-subtitle">
        Stop squinting at truncated markdown tables and burning 30k+ tokens pasting CSVs into chat.
        <strong>TinyPivot MCP</strong> gives Claude, Antigravity, Cursor, OpenCode, and pi an interactive
        Chart, Pivot Table, Drill-Through, and Excel workspace right inside your workflow.
      </p>

      <div class="hero-cmd-box">
        <code>{{ initCommand }}</code>
        <button type="button" class="copy-btn" @click="copyText('hero-init', initCommand)">
          {{ copiedKey === 'hero-init' ? 'Copied!' : 'Copy' }}
        </button>
      </div>

      <div class="mcp-hero-actions">
        <a href="#pricing" class="btn-primary">Start Free or Choose Pro</a>
        <a href="https://github.com/Small-Web-Co/tinypivot/tree/master/packages/mcp" target="_blank" rel="noopener" class="btn-secondary">
          View on GitHub →
        </a>
      </div>
    </header>

    <section id="reel" class="mcp-section mcp-reel-section">
      <div class="section-head">
        <h2>See TinyPivot MCP Across Every Workflow</h2>
        <p>Interactive IDE widget, screenshot-ready terminal cards, live SSE companion IDE, and universal database piping.</p>
      </div>
      <McpHighlightReel />
    </section>

    <section id="why" class="mcp-section">
      <div class="section-head">
        <h2>Why In-Agent Analytics Changes Everything</h2>
        <p>Built for analysts, founders, and engineers who already do their data work inside AI agents.</p>
      </div>
      <div class="compare-grid">
        <div class="compare-card compare-bad">
          <div class="compare-label">
            Without TinyPivot MCP
          </div>
          <ul>
            <li>AI dumps a truncated 15-row markdown table you can't sort, filter, or pivot.</li>
            <li>Stuffing 5,000 CSV rows into chat burns 20k–50k tokens and hits context limits.</li>
            <li>Every follow-up slice ("now group by country") costs another round-trip prompt.</li>
            <li>LLM arithmetic silently drifts on sums, medians, and percentages.</li>
            <li>No way to double-click a total to inspect underlying rows or export a clean <code>.xlsx</code>.</li>
          </ul>
        </div>
        <div class="compare-card compare-good">
          <div class="compare-label">
            With TinyPivot MCP App
          </div>
          <ul>
            <li><strong>Chart-first answers:</strong> Clean, full-bleed interactive chart renders in 1 tool call — core charts &amp; basic pivot included free.</li>
            <li><strong>~90% fewer tokens:</strong> Rows stream directly from your local MCP server to the UI via app-only tools (0 LLM tokens spent on raw rows).</li>
            <li><strong>1-click Pivot &amp; Data exploration:</strong> Re-slice rows/columns, filter, expand groups, and drill through locally in milliseconds.</li>
            <li><strong>Deterministic math &amp; high trust:</strong> Exact aggregations computed locally. Free tier caps at 2,500 rows with an explicit warning banner — never silent truncation.</li>
            <li><strong>Works everywhere:</strong> Native MCP App inline in Antigravity/Claude/Cursor + live SSE Companion Data IDE for terminal agents.</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="savings" class="mcp-section">
      <div class="section-head">
        <h2>Token &amp; API Spend Savings Calculator</h2>
        <p>Honest, prompt-cache-adjusted math showing how keeping raw rows out of LLM context saves real API spend per analysis and per month.</p>
      </div>

      <div class="calc-card">
        <div class="calc-controls">
          <label class="calc-control">
            <span>Rows per SQL / CSV analysis: <strong>{{ rowsPerQuery.toLocaleString() }}</strong></span>
            <input v-model.number="rowsPerQuery" type="range" min="250" max="10000" step="250">
          </label>
          <label class="calc-control">
            <span>Follow-up slices / questions: <strong>{{ followUpTurns }}</strong></span>
            <input v-model.number="followUpTurns" type="range" min="1" max="10" step="1">
          </label>
          <label class="calc-control">
            <span>Analyses / person / week: <strong>{{ queriesPerWeek }}</strong></span>
            <input v-model.number="queriesPerWeek" type="range" min="5" max="80" step="5">
          </label>
          <label class="calc-control">
            <span>Team size (devs / analysts): <strong>{{ teamSize }}</strong></span>
            <input v-model.number="teamSize" type="range" min="1" max="25" step="1">
          </label>
        </div>

        <label class="cache-toggle">
          <input v-model="assumePromptCaching" type="checkbox">
          <span>
            <strong>Assume 90% prompt caching discount</strong> on follow-up turns (recommended — reflects real Anthropic / OpenAI / Google billing)
          </span>
        </label>

        <div class="calc-headline">
          <div>
            <div class="calc-metric-label">
              Saved / Analysis
            </div>
            <div class="calc-metric-val">
              {{ fmtUsd(medianModelSavings.perAnalysisUsd) }}
            </div>
            <div class="calc-metric-sub">
              ~{{ fmtTokens(tokensPerQuerySaved) }} in + {{ fmtTokens(outputTokensPerQuerySaved) }} out ({{ medianModelSavings.name }})
            </div>
          </div>
          <div>
            <div class="calc-metric-label">
              Est. Monthly Savings
            </div>
            <div class="calc-metric-val">
              {{ fmtUsd(medianModelSavings.monthlyUsd) }}/mo
            </div>
            <div class="calc-metric-sub">
              ~{{ fmtTokens(monthlyTokensSaved) }} tok across {{ Math.round(monthlyQueries) }} analyses
            </div>
          </div>
          <div>
            <div class="calc-metric-label">
              Payback vs Pro ($19/mo)
            </div>
            <div class="calc-metric-val">
              {{ medianModelSavings.roiVsPro >= 1 ? `${medianModelSavings.roiVsPro.toFixed(1)}×` : `${Math.round(medianModelSavings.roiVsPro * 100)}%` }}
            </div>
            <div class="calc-metric-sub">
              {{ fmtUsd(medianModelSavings.annualUsd) }}/yr saved vs $149/yr Pro
            </div>
          </div>
        </div>

        <div class="savings-chart">
          <div class="savings-chart-head">
            <span class="savings-chart-title">Estimated Monthly Savings by LLM Model ({{ assumePromptCaching ? 'with 90% prompt caching' : 'uncached input' }})</span>
            <span class="savings-chart-legend">
              <span class="legend-chip legend-pro">Pro $19/mo</span>
              <span class="legend-chip legend-team">Team $79/mo</span>
            </span>
          </div>
          <div class="savings-bars">
            <div v-for="row in modelSavings" :key="row.name" class="savings-bar-row">
              <div class="savings-bar-label">
                <strong>{{ row.name }}</strong>
                <span>{{ fmtUsd(row.perAnalysisUsd) }}/analysis · ${{ row.inputRate.toFixed(2) }} in / ${{ row.outputRate }} out</span>
              </div>
              <div class="savings-bar-track">
                <div
                  class="savings-bar-fill"
                  :style="{ width: `${row.barPct}%`, backgroundColor: row.color }"
                />
                <div
                  class="savings-ref-line ref-pro"
                  :style="{ left: `${row.proMarkerPct}%` }"
                  title="TinyPivot Pro: $19/mo"
                />
                <div
                  class="savings-ref-line ref-team"
                  :style="{ left: `${row.teamMarkerPct}%` }"
                  title="TinyPivot Team (5 seats): $79/mo"
                />
              </div>
              <div class="savings-bar-val">
                <strong>{{ fmtUsd(row.monthlyUsd) }}/mo</strong>
                <span>{{ fmtUsd(row.annualUsd) }}/yr</span>
              </div>
            </div>
          </div>
        </div>

        <div class="how-savings-grid">
          <div class="how-savings-item">
            <strong>1. Raw rows bypass the LLM</strong>
            <p><code>load_file</code>, stdin piping, and optional <code>query_postgres</code> send only a ~200-token schema &amp; summary to the model; the full rows stream locally from the MCP server straight to the UI.</p>
          </div>
          <div class="how-savings-item">
            <strong>2. Local clicks cost $0</strong>
            <p>Switching Chart ↔ Pivot ↔ Data, sorting, filtering, and drilling into rows run in local JS instead of burning output tokens rewriting markdown tables or Python scripts.</p>
          </div>
          <div class="how-savings-item">
            <strong>3. Works with any database today</strong>
            <p>Pipe any BigQuery, Snowflake, MySQL, DuckDB, or Databricks query (via CSV/JSON export or CLI stdin) into <code>load_file</code> — plus an optional direct read-only Postgres connector (<code>query_postgres</code>).</p>
          </div>
        </div>

        <p class="calc-footnote">
          Methodology: assumes ~5 tokens/cell (~20 bytes/cell) for raw tabular rows passed into context, 10% cached read cost on follow-up turns when prompt caching is enabled, and ~600 output tokens avoided per local follow-up exploration. Note: if you already aggregate in SQL/Python down to &lt;20 summary rows before showing the LLM, raw-row savings are smaller — your win is mainly avoiding follow-up chart/table re-prompts and instant interactive exploration.
        </p>
      </div>
    </section>

    <section id="pricing" class="mcp-section">
      <div class="section-head">
        <h2>Choose How You Pay</h2>
        <p>Start free with Core Charts &amp; Pivot up to 2,500 rows. Upgrade with a flexible subscription or pay once for Lifetime.</p>
      </div>

      <p v-if="checkoutError" class="checkout-error">
        {{ checkoutError }}
      </p>

      <div class="pricing-grid">
        <!-- FREE TIER -->
        <div class="pricing-card">
          <div class="pricing-tier">
            Free
          </div>
          <div class="pricing-price">
            <span class="price-amt">$0</span>
            <span class="price-per">forever</span>
          </div>
          <p class="pricing-sub">
            Zero signup, zero API key. Runs 100% locally in your AI harness.
          </p>
          <ul class="pricing-list">
            <li>Core Charts (<code>bar</code>, <code>stackedBar</code>, <code>line</code>, <code>area</code>, <code>pie</code>, <code>donut</code>)</li>
            <li>Interactive Pivot Table (<code>sum</code>) &amp; Data Grid</li>
            <li><code>Code</code> visual theme (Dark &amp; Light surfaces)</li>
            <li>Live Terminal Companion Data IDE (<code>--open</code>)</li>
            <li>Up to <strong>2,500 rows</strong> per dataset (clearly bannered if exceeded)</li>
          </ul>
          <button type="button" class="btn-secondary pricing-btn" @click="copyText('pricing-free', initCommand)">
            {{ copiedKey === 'pricing-free' ? 'Copied init command!' : 'Copy: npx @smallwebco/tinypivot-mcp init' }}
          </button>
        </div>

        <!-- PRO TIER (CHOOSE MONTHLY / YEARLY / LIFETIME) -->
        <div class="pricing-card pricing-featured">
          <div class="pricing-top-row">
            <div class="pricing-tier">
              MCP Pro
            </div>
            <span class="pricing-badge">Most Popular</span>
          </div>

          <div class="billing-toggle" role="tablist" aria-label="Pro billing model">
            <button
              type="button"
              :class="{ active: proBilling === 'monthly' }"
              @click="proBilling = 'monthly'"
            >
              Monthly
            </button>
            <button
              type="button"
              :class="{ active: proBilling === 'yearly' }"
              @click="proBilling = 'yearly'"
            >
              Yearly <span class="save-tag">-35%</span>
            </button>
            <button
              type="button"
              :class="{ active: proBilling === 'lifetime' }"
              @click="proBilling = 'lifetime'"
            >
              Lifetime
            </button>
          </div>

          <div class="pricing-price">
            <span class="price-amt">{{ proPlanDetails.price }}</span>
            <span class="price-per">{{ proPlanDetails.period }}</span>
          </div>
          <p class="pricing-sub">
            {{ proPlanDetails.sub }}
          </p>

          <ul class="pricing-list">
            <li><strong>Unlimited rows</strong> — never truncated</li>
            <li><strong>All 5 visual themes</strong> (Code, Phosphor, Nord, Thermal, Mono)</li>
            <li><strong>Double-click Drill-Through</strong> &amp; closed-loop AI slice selection</li>
            <li><strong>All 9+ aggregations</strong> (median, stdDev, % of total, countDistinct)</li>
            <li><strong>Formatted <code>.xlsx</code> export</strong> + watermark-free UI</li>
            <li><strong>Works with any database</strong> (BigQuery, Snowflake, MySQL, DuckDB, Databricks) + direct Postgres connector (<code>query_postgres</code>)</li>
          </ul>
          <button
            type="button"
            class="btn-primary pricing-btn"
            :disabled="checkoutLoading !== null"
            @click="startCheckout(proPlanDetails.plan)"
          >
            {{ checkoutLoading === proPlanDetails.plan ? 'Opening Stripe Checkout…' : `Get MCP Pro (${proPlanDetails.price})` }}
          </button>
        </div>

        <!-- TEAM TIER (5 SEATS) -->
        <div class="pricing-card">
          <div class="pricing-tier">
            MCP Team (5 Seats)
          </div>

          <div class="billing-toggle" role="tablist" aria-label="Team billing model">
            <button
              type="button"
              :class="{ active: teamBilling === 'monthly' }"
              @click="teamBilling = 'monthly'"
            >
              Monthly
            </button>
            <button
              type="button"
              :class="{ active: teamBilling === 'yearly' }"
              @click="teamBilling = 'yearly'"
            >
              Yearly <span class="save-tag">-26%</span>
            </button>
          </div>

          <div class="pricing-price">
            <span class="price-amt">{{ teamPlanDetails.price }}</span>
            <span class="price-per">{{ teamPlanDetails.period }}</span>
          </div>
          <p class="pricing-sub">
            {{ teamPlanDetails.sub }}
          </p>

          <ul class="pricing-list">
            <li>Everything in <strong>MCP Pro</strong> for up to <strong>5 developers/analysts</strong></li>
            <li>Single shared offline-verifiable team key (no SSO wall)</li>
            <li>Works with any database (BigQuery, Snowflake, MySQL, DuckDB, Databricks) + direct Postgres connector (<code>query_postgres</code>) across all team AI harnesses</li>
            <li>Priority email support &amp; Stripe tax invoices</li>
            <li>Early access to team token-spend analytics</li>
          </ul>
          <button
            type="button"
            class="btn-secondary pricing-btn"
            :disabled="checkoutLoading !== null"
            @click="startCheckout(teamPlanDetails.plan)"
          >
            {{ checkoutLoading === teamPlanDetails.plan ? 'Opening Stripe Checkout…' : `Get Team License (${teamPlanDetails.price})` }}
          </button>
        </div>
      </div>

      <p class="pricing-footnote">
        Need the React or Vue DataGrid/Pivot component inside your own SaaS product?
        <router-link to="/#pricing">
          See TinyPivot UI Library perpetual licenses ($49–$399) →
        </router-link>
      </p>
    </section>

    <section id="setup" class="mcp-section">
      <div class="section-head">
        <h2>Add TinyPivot to Your AI Harness in 10 Seconds</h2>
        <p>Run <code>npx @smallwebco/tinypivot-mcp init</code> to auto-configure Claude Code, Claude Desktop, Cursor, Antigravity, OpenCode, Codex CLI, and pi — or copy a manual config below.</p>
      </div>

      <div class="harness-tabs" role="tablist">
        <button
          v-for="(cfg, id) in harnessConfigs"
          :key="id"
          type="button"
          class="harness-tab"
          :class="{ active: selectedHarness === id }"
          @click="selectedHarness = id as HarnessId"
        >
          {{ cfg.label }}
        </button>
      </div>

      <div class="code-card">
        <div class="code-card-head">
          <div>
            <strong>{{ harnessConfigs[selectedHarness].filename }}</strong>
            <p class="code-subtitle">
              {{ harnessConfigs[selectedHarness].subtitle }}
            </p>
          </div>
          <button
            type="button"
            class="copy-btn"
            @click="copyText(selectedHarness, harnessConfigs[selectedHarness].code)"
          >
            {{ copiedKey === selectedHarness ? 'Copied!' : 'Copy Config' }}
          </button>
        </div>
        <pre><code>{{ harnessConfigs[selectedHarness].code }}</code></pre>
      </div>
    </section>

    <section class="mcp-section">
      <div class="section-head">
        <h2>Prompts to Try Right Away</h2>
        <p>Pipe local files, database queries, or outputs from other MCP servers (like Stripe) straight into TinyPivot.</p>
      </div>
      <div class="prompt-grid">
        <div v-for="(prompt, idx) in samplePrompts" :key="idx" class="prompt-card">
          <p>“{{ prompt }}”</p>
          <button type="button" class="copy-btn-sm" @click="copyText(`p-${idx}`, prompt)">
            {{ copiedKey === `p-${idx}` ? 'Copied' : 'Copy prompt' }}
          </button>
        </div>
      </div>
    </section>

    <section id="tools" class="mcp-section">
      <div class="section-head">
        <h2>Included MCP Tools</h2>
        <p>Designed so agents do the querying and orchestration while TinyPivot handles deterministic math and visual exploration.</p>
      </div>
      <div class="tool-grid">
        <div v-for="t in tools" :key="t.name" class="tool-card">
          <div class="tool-top">
            <code>{{ t.name }}</code>
            <span class="tool-role">{{ t.role }}</span>
          </div>
          <p>{{ t.desc }}</p>
        </div>
      </div>
    </section>

    <section class="mcp-section privacy-section">
      <div class="privacy-box">
        <h3>Local-First Data &amp; Transparent Telemetry</h3>
        <p>
          Your CSVs, JSON rows, column names, SQL queries, and file paths <strong>never leave your machine</strong>.
          TinyPivot MCP sends only minimal anonymous usage pings (tool name, row-count bucket, harness client name, OS, and a random local UUID) to guide compatibility work.
          Opt out anytime by setting <code>TINYPIVOT_TELEMETRY=0</code> or <code>DO_NOT_TRACK=1</code>.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mcp-page {
  min-height: 100vh;
  background: #0a0a0f;
  color: #e2e8f0;
  font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding-bottom: 80px;
  position: relative;
}

.mcp-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.mcp-nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mcp-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1.125rem;
  color: #f8fafc;
  text-decoration: none;
}

.mcp-logo svg {
  color: #10b981;
}

.mcp-nav-links {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.mcp-nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

.mcp-nav-links a:hover {
  color: #ffffff;
}

.mcp-nav-cta {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff !important;
  padding: 0.45rem 0.95rem;
  border-radius: 0.5rem;
  font-weight: 600;
}

.mcp-hero {
  max-width: 880px;
  margin: 0 auto;
  padding: 72px 24px 48px;
  text-align: center;
  position: relative;
  background: radial-gradient(ellipse 80% 55% at 50% -10%, rgba(16, 185, 129, 0.14), transparent);
}

.mcp-badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.32);
  margin-bottom: 20px;
}

.mcp-hero h1 {
  font-size: clamp(34px, 5vw, 54px);
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: #f8fafc;
  margin: 0 0 20px;
}

.mcp-gradient {
  background: linear-gradient(135deg, #10b981, #3b82f6, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.mcp-subtitle {
  font-size: 18px;
  line-height: 1.6;
  color: #94a3b8;
  max-width: 720px;
  margin: 0 auto 24px;
}

.hero-cmd-box {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 8px 18px;
  margin-bottom: 24px;
  border-radius: 10px;
  border: 1px solid rgba(16, 185, 129, 0.38);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.hero-cmd-box code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  color: #34d399;
}

.mcp-hero-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.28);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.65;
  cursor: wait;
}

.btn-secondary {
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.2);
}

.mcp-section {
  max-width: 1060px;
  margin: 0 auto;
  padding: 40px 24px;
}

.mcp-reel-section {
  padding-top: 12px;
}

.section-head {
  text-align: center;
  margin-bottom: 28px;
}

.section-head h2 {
  font-size: 28px;
  color: #f8fafc;
  margin: 0 0 8px;
}

.section-head p {
  color: #94a3b8;
  margin: 0;
  font-size: 15.5px;
}

.section-head code {
  color: #7dd3fc;
}

.compare-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.compare-card {
  padding: 24px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.8);
}

.compare-bad {
  border-color: rgba(248, 113, 113, 0.25);
}

.compare-good {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.06);
}

.compare-label {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 14px;
}

.compare-bad .compare-label {
  color: #fca5a5;
}

.compare-good .compare-label {
  color: #6ee7b7;
}

.compare-card ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #cbd5e1;
  line-height: 1.5;
}

/* Savings Calculator & Visual Graph */
.calc-card {
  padding: 24px;
  border-radius: 14px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: rgba(15, 23, 42, 0.85);
}

.calc-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 22px;
}

.calc-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13.5px;
  color: #cbd5e1;
}

.calc-control strong {
  color: #f8fafc;
}

.calc-control input[type="range"] {
  accent-color: #6366f1;
  cursor: pointer;
}

.calc-headline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  padding: 16px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(52, 211, 153, 0.22);
  margin-bottom: 20px;
}

.calc-metric-label {
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.calc-metric-val {
  font-size: 28px;
  font-weight: 700;
  color: #6ee7b7;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.calc-metric-sub {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.savings-chart {
  padding: 16px;
  border-radius: 10px;
  background: rgba(11, 16, 32, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.savings-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.savings-chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.savings-chart-legend {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-chip {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 8px;
  border-radius: 999px;
}

.legend-pro {
  color: #6ee7b7;
  background: rgba(52, 211, 153, 0.12);
  border: 1px dashed rgba(52, 211, 153, 0.6);
}

.legend-team {
  color: #c7d2fe;
  background: rgba(129, 140, 248, 0.14);
  border: 1px dashed rgba(129, 140, 248, 0.6);
}

.savings-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.savings-bar-row {
  display: grid;
  grid-template-columns: 185px 1fr 110px;
  align-items: center;
  gap: 14px;
}

@media (max-width: 680px) {
  .savings-bar-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

.savings-bar-label {
  display: flex;
  flex-direction: column;
}

.savings-bar-label strong {
  font-size: 13px;
  color: #f8fafc;
}

.savings-bar-label span {
  font-size: 11px;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.savings-bar-track {
  position: relative;
  height: 22px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.1);
  overflow: hidden;
}

.savings-bar-fill {
  height: 100%;
  border-radius: 6px;
  transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
  opacity: 0.9;
}

.savings-ref-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  pointer-events: none;
}

.ref-pro {
  border-left: 2px dashed rgba(52, 211, 153, 0.85);
}

.ref-team {
  border-left: 2px dashed rgba(129, 140, 248, 0.85);
}

.savings-bar-val {
  display: flex;
  flex-direction: column;
  text-align: right;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.savings-bar-val strong {
  font-size: 13.5px;
  color: #6ee7b7;
}

.savings-bar-val span {
  font-size: 11px;
  color: #94a3b8;
}

.calc-footnote {
  margin: 14px 0 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.cache-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #cbd5e1;
  cursor: pointer;
}

.cache-toggle input {
  accent-color: #34d399;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.how-savings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.how-savings-item {
  padding: 14px;
  border-radius: 10px;
  background: rgba(11, 16, 32, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.how-savings-item strong {
  display: block;
  font-size: 13px;
  color: #f8fafc;
  margin-bottom: 5px;
}

.how-savings-item p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: #94a3b8;
}

.how-savings-item code {
  color: #7dd3fc;
}

/* Pricing Grid */
.checkout-error {
  text-align: center;
  padding: 10px 14px;
  border-radius: 8px;
  margin: 0 auto 20px;
  max-width: 520px;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.16);
  border: 1px solid rgba(248, 113, 113, 0.4);
  font-size: 13.5px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 20px;
  align-items: stretch;
}

.pricing-card {
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.84);
}

.pricing-featured {
  border-color: rgba(16, 185, 129, 0.55);
  background: linear-gradient(180deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.92));
  box-shadow: 0 12px 36px rgba(16, 185, 129, 0.15);
}

.pricing-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pricing-tier {
  font-size: 17px;
  font-weight: 700;
  color: #f8fafc;
}

.pricing-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
  border: 1px solid rgba(52, 211, 153, 0.35);
}

.billing-toggle {
  display: inline-flex;
  padding: 3px;
  margin-top: 14px;
  border-radius: 8px;
  background: rgba(11, 16, 32, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.2);
  gap: 2px;
}

.billing-toggle button {
  flex: 1;
  padding: 6px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.billing-toggle button.active {
  background: #10b981;
  color: #06281e;
}

.save-tag {
  font-size: 10px;
  color: #34d399;
  margin-left: 2px;
}

.billing-toggle button.active .save-tag {
  color: #06281e;
}

.pricing-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 16px;
}

.price-amt {
  font-size: 38px;
  font-weight: 800;
  color: #f8fafc;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.price-per {
  font-size: 14px;
  color: #94a3b8;
}

.pricing-sub {
  margin: 6px 0 18px;
  font-size: 13px;
  color: #94a3b8;
  min-height: 36px;
}

.pricing-list {
  margin: 0 0 22px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  color: #cbd5e1;
  font-size: 13.5px;
  line-height: 1.45;
  flex: 1;
}

.pricing-list code {
  color: #7dd3fc;
  font-size: 12.5px;
}

.pricing-btn {
  width: 100%;
  font-size: 14px;
}

.pricing-footnote {
  text-align: center;
  margin-top: 20px;
  font-size: 13.5px;
  color: #94a3b8;
}

.pricing-footnote a {
  color: #818cf8;
  text-decoration: none;
  font-weight: 600;
}

.pricing-footnote a:hover {
  text-decoration: underline;
}

/* Setup & Tools */
.harness-tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.harness-tab {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.7);
  color: #cbd5e1;
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
}

.harness-tab.active {
  background: linear-gradient(135deg, #10b981, #059669);
  border-color: #10b981;
  color: #ffffff;
}

.code-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #0f172a;
  overflow: hidden;
}

.code-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  flex-wrap: wrap;
}

.code-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.code-card pre {
  margin: 0;
  padding: 18px;
  overflow-x: auto;
  font-size: 13.5px;
  line-height: 1.55;
  color: #e2e8f0;
}

.copy-btn,
.copy-btn-sm {
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
}

.copy-btn:hover,
.copy-btn-sm:hover {
  background: rgba(99, 102, 241, 0.28);
}

.prompt-grid,
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.prompt-card,
.tool-card {
  padding: 18px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.78);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.prompt-card p,
.tool-card p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.5;
  font-size: 14px;
}

.tool-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.tool-top code {
  color: #93c5fd;
  font-size: 13.5px;
  font-weight: 600;
}

.tool-role {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
}

.privacy-section {
  padding-top: 16px;
}

.privacy-box {
  padding: 22px 24px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.72);
  text-align: center;
}

.privacy-box h3 {
  margin: 0 0 8px;
  font-size: 17px;
  color: #f8fafc;
}

.privacy-box p {
  margin: 0 auto;
  max-width: 760px;
  font-size: 13.5px;
  line-height: 1.6;
  color: #94a3b8;
}

.privacy-box code {
  color: #7dd3fc;
}
</style>
