/**
 * Empirical data and editorial copy for the TinyPivot Trust Layer White Paper (/whitepaper).
 * All figures come directly from reproducible multi-model benchmarks run on 2026-11-26.
 */

export interface TrustBenchModelRow {
  id: string
  model: string
  hardware: string
  baselineLabel: string
  baselineScore: string
  baselinePct: number
  baselineMeta: string
  freeScore: string
  freePct: number
  freeMeta: string
  proScore: string
  proPct: number
  proMeta: string
  proHighlight: string
}

export const TRUST_BENCH_DATE = '2026-11-26'

export const trustBenchRows: readonly TrustBenchModelRow[] = [
  {
    id: 'inkling',
    model: 'Inkling 2 Mini (fast)',
    hardware: 'Small local (Mac)',
    baselineLabel: 'Bare DuckDB SQL',
    baselineScore: '2/6',
    baselinePct: 33,
    baselineMeta: '7.7 turns',
    freeScore: '2/6',
    freePct: 33,
    freeMeta: '7.7 turns · 301.5k tok',
    proScore: '5/6',
    proPct: 83,
    proMeta: '6.7 turns · 297.9k tok',
    proHighlight: '+50 pts accuracy (matches Sonnet on Python)',
  },
  {
    id: 'deepseek',
    model: 'DeepSeek V4.1 Flash 1017',
    hardware: 'Local cluster (DGX Spark)',
    baselineLabel: 'Bare DuckDB SQL',
    baselineScore: '5/6',
    baselinePct: 83,
    baselineMeta: '6.5 turns',
    freeScore: '5/6',
    freePct: 83,
    freeMeta: '6.7 turns · 272.6k tok',
    proScore: '6/6',
    proPct: 100,
    proMeta: '6.5 turns · 234.1k tok',
    proHighlight: '+17 pts · −14.1% tokens vs Free',
  },
  {
    id: 'haiku',
    model: 'Claude Haiku 4.5',
    hardware: 'Fast cloud',
    baselineLabel: 'Python / Bash',
    baselineScore: '6/6',
    baselinePct: 100,
    baselineMeta: '681k tok · $0.0379',
    freeScore: '6/6',
    freePct: 100,
    freeMeta: '1,192k tok · $0.0673',
    proScore: '6/6',
    proPct: 100,
    proMeta: '1,064k tok · $0.0476',
    proHighlight: '−29.3% cost vs Free (beats Python on 3/6 tasks)',
  },
  {
    id: 'sonnet',
    model: 'Claude Sonnet',
    hardware: 'Frontier cloud',
    baselineLabel: 'Python / Bash',
    baselineScore: '5/6',
    baselinePct: 83,
    baselineMeta: '505k tok · $0.5677',
    freeScore: '6/6',
    freePct: 100,
    freeMeta: '968k tok · $0.9072',
    proScore: '6/6',
    proPct: 100,
    proMeta: '748k tok · $0.5407',
    proHighlight: '100% vs 83% · cheaper than Python (−40.4% vs Free)',
  },
]

export const TRUST_BENCH_TOTALS = {
  tasksPerModel: 6,
  models: 4,
  totalModelTasks: 24,
  baselinePassed: 18,
  baselinePct: 75,
  freePassed: 19,
  freePct: 79,
  proPassed: 23,
  proPct: 96,
} as const

export const whitepaperHeroStats = [
  {
    value: `${TRUST_BENCH_TOTALS.baselinePct}% → ${TRUST_BENCH_TOTALS.proPct}%`,
    label: 'Combined accuracy across 4 models & 6 hard DS traps',
  },
  {
    value: '33% → 83%',
    label: 'Small Mac-local model (Inkling 2 Mini) lifted +50 pts',
  },
  {
    value: '−40.4% cost',
    label: 'Claude Sonnet Pro ($0.54) beat vanilla Python ($0.57) & Free ($0.91)',
  },
  {
    value: '−47% tokens',
    label: 'Recursive Data Memory on repeat schema inquiries',
  },
] as const

export interface TrapCase {
  id: string
  name: string
  trap: string
  failureMode: string
  tinypivotGuard: string
}

export const hardTrapCases: readonly TrapCase[] = [
  {
    id: 'ab_srm_phacking',
    name: '01 · Broken A/B Test (SRM + P-Hacking)',
    trap: '12-segment experiment with a broken 54/46 traffic split (χ² = 76.8, p < 10⁻¹⁷) and one noisy segment at raw p = 0.021.',
    failureMode: 'Models celebrate a fake segment winner and recommend shipping on broken randomization.',
    tinypivotGuard: 'analyze(ab_test) runs automatic SRM χ² + Holm-Bonferroni correction across all 12 segments on Turn 1.',
  },
  {
    id: 'confounded_discount',
    name: '02 · Confounded Discount Causal Reversal',
    trap: '2,000 accounts where discounts target at-risk accounts: naive SQL shows discounts hurt renewal by −19.1 pp, while true controlled lift is +8.0 pp.',
    failureMode: 'Small/fast models take the naive −19 pp difference at face value and tell leadership to kill discounts.',
    tinypivotGuard: 'analyze(regression) fits controlled OLS, compares naive vs. controlled slope, and flags CONFOUNDING / SIGN REVERSAL.',
  },
  {
    id: 'right_censored_cohorts',
    name: '03 · Right-Censored Cohort Retention',
    trap: '6 monthly cohorts where the 3 newest cohorts have not existed 3 months yet; true matured M3 retention is flat at 40.4%.',
    failureMode: 'Naive SQL averages 0% / partial trailing cells into M3 and alarms on a fake retention collapse.',
    tinypivotGuard: 'analyze(cohort_retention) masks immature cells as null and averages matured cohorts only.',
  },
  {
    id: 'seasonal_changepoint',
    name: '04 · Hidden Structural Break in Seasonality',
    trap: '90 days of daily orders with a 62% weekend drop hiding a permanent −16.5% regime shift starting 2026-02-18.',
    failureMode: 'Weekday/weekend variance swamps simple min/max or rolling checks, missing the exact start date.',
    tinypivotGuard: 'analyze(anomalies) strips day-of-week seasonality, runs MAD z-scores, and scans every split date for a Welch t-stat break.',
  },
  {
    id: 'chasm_trap_join',
    name: '05 · 3-Table Multi-Fact Chasm Trap',
    trap: 'Joining accounts + orders + support_tickets directly multiplies both revenue and ticket counts 6×–8×.',
    failureMode: 'Standard 3-way SQL silently explodes totals without throwing an error.',
    tinypivotGuard: 'Pro [AUDIT] probes joined key uniqueness in DuckDB and flags join fan-out before the model answers.',
  },
  {
    id: 'kitagawa_simpson',
    name: '06 · Simpson’s Paradox (Kitagawa Mix vs. Rate)',
    trap: '18,000 funnel rows where blended conversion fell −1.99 pp even though both segments improved (+0.52 pp rate effect vs. −2.51 pp mix shift).',
    failureMode: 'Models either miss the exact pp attribution or misattribute the drop to segment performance.',
    tinypivotGuard: 'analyze(explain_change) computes exact Kitagawa mix-vs-rate decomposition and flags Simpson’s paradox.',
  },
]

export const architecturePillars = [
  {
    n: '01',
    title: 'Silent-When-Clean SQL Audit Oracle',
    body: 'Runs lightweight DuckDB probes (~5–15 ms) after each query. Completely silent when SQL is clean; emits actionable [AUDIT] blocks with exact corrected metrics (daily run-rates, excluded NULL totals, top outlier IDs, fan-out multipliers) only when a real BI trap triggers.',
  },
  {
    n: '02',
    title: 'Zero-Param 1-Call Data Science Shelf',
    body: 'Exposes five deterministic statistical engines through a single compact MCP tool (analyze) so tool schemas stay under 2,500 tokens. Auto-infers columns and aliases — cutting Claude Sonnet Pro tokens by 26% in a single Auto-Research iteration.',
  },
  {
    n: '03',
    title: 'Recursive Data Memory (100% Local)',
    body: 'Every [AUDIT] catch and every human SQL edit in TinyPivot Studio is saved locally by schema fingerprint (~/.local/share/tinypivot/memory.json). On repeat inquiries, TinyPivot recalls a ~40-token brief on Turn 1 — cutting Inkling 2 Mini join-trap tokens by 47% (6 → 3 turns).',
  },
  {
    n: '04',
    title: 'Proof-of-Work Studio & Lineage',
    body: 'Every chart and pivot links back to editable SQL (with lossless revision history), clickable Underlying Source Rows, order-independent SHA-256 Data Hashes, claim-checked prose, and zero-CDN Offline HTML Notebooks.',
  },
] as const
