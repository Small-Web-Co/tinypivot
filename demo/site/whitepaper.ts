/**
 * Empirical data and editorial copy for the TinyPivot Trust Layer White Paper (/whitepaper).
 * All figures come directly from reproducible benchmarks run on 2026-11-26:
 *  1) 18-Task Unhinted Executive Benchmark (Routine BI, Relational Analytics & Hard Data Science)
 *     across 5 models × 3 arms (270 runs total).
 *  2) Official Adyen / Hugging Face `adyen/DABstep` Dev Benchmark (10 official labeled tasks
 *     over 22 MB `payments.csv` + `fees.json`) across 3 Claude 5.5 models (60 runs total),
 *     scored with Adyen's verbatim `question_scorer`.
 */

export interface TrustBenchImpact {
  accuracy: string
  speed: string
  tokens: string
  cost: string
}

export interface TrustBenchModelRow {
  id: string
  shortLabel: string
  model: string
  hardware: string
  baselineLabel: string
  baselineScore: string
  baselinePct: number
  baselineMeta: string
  baselineShort: string
  freeScore: string
  freePct: number
  freeMeta: string
  freeShort: string
  proScore: string
  proPct: number
  proMeta: string
  proShort: string
  proHighlight: string
  impact: TrustBenchImpact
}

export const TRUST_BENCH_DATE = '2026-11-26'

export const trustBenchRows: readonly TrustBenchModelRow[] = [
  {
    id: 'inkling',
    shortLabel: 'Inkling 2 Mini',
    model: 'Inkling 2 Mini (fast)',
    hardware: 'Small local (Mac)',
    baselineLabel: 'Bare DuckDB SQL',
    baselineScore: '14/18',
    baselinePct: 78,
    baselineMeta: '46.1s/task · 5.11 turns · $0.027 API†',
    baselineShort: '46.1s · $0.027†',
    freeScore: '15/18',
    freePct: 83,
    freeMeta: '37.3s/task · 5.11 turns · $0.059 API†',
    freeShort: '37.3s · $0.059†',
    proScore: '18/18',
    proPct: 100,
    proMeta: '26.0s/task · 4.22 turns · $0.046 API†',
    proShort: '26.0s · $0.046†',
    proHighlight: '+22.2 pts accuracy (78% → 83% Free → 100% Pro) · 44% faster (3.8× Hard DS) · −50% output · $0.046 API† ($0 local)',
    impact: {
      accuracy: '+22.2 pts (78% → 100%)',
      speed: '44% faster (3.8× Hard DS)',
      tokens: '−50% out · −17% turns',
      cost: '$0 local · $0.046 API† (+0.1¢/t)',
    },
  },
  {
    id: 'deepseek',
    shortLabel: 'DeepSeek V4.1',
    model: 'DeepSeek V4.1 Flash 1017',
    hardware: 'Local cluster (DGX Spark)',
    baselineLabel: 'Bare DuckDB SQL',
    baselineScore: '17/18',
    baselinePct: 94,
    baselineMeta: '25.7s/task · 4.94 turns · $0.059 API†',
    baselineShort: '25.7s · $0.059†',
    freeScore: '17/18',
    freePct: 94,
    freeMeta: '27.7s/task · 5.28 turns · $0.090 API†',
    freeShort: '27.7s · $0.090†',
    proScore: '18/18',
    proPct: 100,
    proMeta: '15.6s/task · 3.44 turns · $0.055 API†',
    proShort: '15.6s · $0.055†',
    proHighlight: '100% accuracy (+5.6 pts) · 39% faster (3.4× Hard DS) · −30% turns · −48% out · −7% imputed API† ($0 local)',
    impact: {
      accuracy: '+5.6 pts (94% → 100%)',
      speed: '39% faster (3.4× Hard DS)',
      tokens: '−48% out · −30% turns',
      cost: '−7% API† ($0.055) · $0 local',
    },
  },
  {
    id: 'haiku',
    shortLabel: 'Haiku 5.5',
    model: 'Claude Haiku 5.5',
    hardware: 'Fast cloud',
    baselineLabel: 'Python / Bash',
    baselineScore: '15/18',
    baselinePct: 83,
    baselineMeta: '13.1s/task · 3.94 turns · $0.074 API*',
    baselineShort: '13.1s · $0.074',
    freeScore: '16/18',
    freePct: 89,
    freeMeta: '13.9s/task · 4.11 turns · $0.083 API*',
    freeShort: '13.9s · $0.083',
    proScore: '18/18',
    proPct: 100,
    proMeta: '12.5s/task · 5.61 turns · $0.083 API*',
    proShort: '12.5s · $0.083',
    proHighlight: '+16.7 pts accuracy (83% → 89% Free → 100% Pro, matches Sonnet/Opus) · 5% faster (23% faster Hard DS)',
    impact: {
      accuracy: '+16.7 pts (83% → 100%)',
      speed: '5% faster (23% Hard DS)',
      tokens: '−12% out on Hard DS',
      cost: '+0.05¢/task vs Python*',
    },
  },
  {
    id: 'sonnet',
    shortLabel: 'Sonnet 5.5',
    model: 'Claude Sonnet 5.5',
    hardware: 'Balanced frontier',
    baselineLabel: 'Python / Bash',
    baselineScore: '18/18',
    baselinePct: 100,
    baselineMeta: '20.0s/task · 3.89 turns · $1.22 API*',
    baselineShort: '20.0s · $1.22',
    freeScore: '18/18',
    freePct: 100,
    freeMeta: '22.1s/task · 4.67 turns · $0.88 API*',
    freeShort: '22.1s · $0.88',
    proScore: '18/18',
    proPct: 100,
    proMeta: '18.8s/task · 5.11 turns · $1.01 API*',
    proShort: '18.8s · $1.01',
    proHighlight: '100% on Free (−28% API*) & Pro (no Bash needed) + live Studio charts & lineage · 6% faster (21% Hard DS) · −17% warm API*',
    impact: {
      accuracy: '100% Free & Pro + lineage',
      speed: '6% faster (21% Hard DS)',
      tokens: '6/6 Hard DS in 25.9s',
      cost: '−17% Pro · −28% Free API*',
    },
  },
  {
    id: 'opus',
    shortLabel: 'Opus 5.5',
    model: 'Claude Opus 5.5',
    hardware: 'Flagship frontier',
    baselineLabel: 'Python / Bash',
    baselineScore: '18/18',
    baselinePct: 100,
    baselineMeta: '21.5s/task · 3.61 turns · $2.32 API*',
    baselineShort: '21.5s · $2.32',
    freeScore: '18/18',
    freePct: 100,
    freeMeta: '21.9s/task · 4.11 turns · $2.65 API*',
    freeShort: '21.9s · $2.65',
    proScore: '18/18',
    proPct: 100,
    proMeta: '22.0s/task · 4.28 turns · $1.41 API*',
    proShort: '22.0s · $1.41',
    proHighlight: '100% on both Free & Pro · 19% faster on Hard DS (2.8× faster on OLS) · −39% warm API*',
    impact: {
      accuracy: '100% parity (Free & Pro)',
      speed: '19% faster Hard DS',
      tokens: '−17% out on Hard DS',
      cost: '−39% warm API* ($1.41)',
    },
  },
]

export const TRUST_BENCH_TOTALS = {
  tasksPerModel: 18,
  models: 5,
  totalModelTasks: 90,
  totalRuns: 270,
  baselinePassed: 82,
  baselinePct: 91,
  baselineAvgSec: 25.3,
  freePassed: 84,
  freePct: 93,
  freeAvgSec: 24.6,
  proPassed: 90,
  proPct: 100,
  proAvgSec: 19.0,
  speedupPct: 25,
  hardDsBasePct: 80,
  hardDsFreePct: 87,
  hardDsProPct: 100,
  hardDsBaseSec: 39.7,
  hardDsProSec: 19.3,
  hardDsSpeedupPct: 51,
} as const

export interface CategoryBenchRow {
  id: string
  label: string
  sub: string
  baselinePct: number
  freePct: number
  proPct: number
  baselineMeta: string
  proMeta: string
  delta: string
}

export const categoryBenchRows: readonly CategoryBenchRow[] = [
  {
    id: 'routine_bi',
    label: 'Routine BI',
    sub: '30 model-tasks/arm',
    baselinePct: 93,
    freePct: 93,
    proPct: 100,
    baselineMeta: '28/30 · 17.7s',
    proMeta: '30/30 · 17.4s',
    delta: '100% (+7 pts)',
  },
  {
    id: 'relational',
    label: 'Relational Analytics',
    sub: '30 model-tasks/arm',
    baselinePct: 100,
    freePct: 100,
    proPct: 100,
    baselineMeta: '30/30 · 18.6s',
    proMeta: '30/30 · 20.2s',
    delta: '100% + lineage',
  },
  {
    id: 'hard_ds',
    label: 'Hard Data Science',
    sub: '30 model-tasks/arm',
    baselinePct: 80,
    freePct: 87,
    proPct: 100,
    baselineMeta: '24/30 · 39.7s',
    proMeta: '30/30 · 19.3s',
    delta: '+20 pts · 2.1× faster',
  },
  {
    id: 'dabstep',
    label: 'adyen/DABstep Dev',
    sub: '30 official runs/arm',
    baselinePct: 77,
    freePct: 0,
    proPct: 80,
    baselineMeta: '23/30 (Hard 76%)',
    proMeta: '24/30 (Hard 81%)',
    delta: '+3 pts (Haiku +10)',
  },
]

export interface DabstepBenchRow {
  model: string
  baselineScore: string
  baselineHard: string
  proScore: string
  proHard: string
  note: string
}

export const dabstepBenchRows: readonly DabstepBenchRow[] = [
  {
    model: 'Claude Haiku 5.5',
    baselineScore: '6/10 (60%)',
    baselineHard: '4/7',
    proScore: '7/10 (70%)',
    proHard: '5/7',
    note: '+10 pts · solved hard fee-rule tasks #1464 & #1753 that vanilla Haiku missed',
  },
  {
    model: 'Claude Sonnet 5.5',
    baselineScore: '9/10 (90%)',
    baselineHard: '6/7',
    proScore: '9/10 (90%)',
    proHard: '6/7',
    note: '90% parity · faster & cheaper on hard task #1464 (11.0s vs 11.6s)',
  },
  {
    model: 'Claude Opus 5.5',
    baselineScore: '8/10 (80%)',
    baselineHard: '6/7',
    proScore: '8/10 (80%)',
    proHard: '6/7',
    note: '80% parity · faster overall (16.6s vs 16.7s); −37% faster on hard task #2697',
  },
]

export const whitepaperHeroStats = [
  {
    value: '91% → 100%',
    label: 'Overall accuracy across all 5 models × 18 unhinted tasks (90/90 on TinyPivot Pro)',
  },
  {
    value: '2.1× faster',
    label: 'Hard Data Science: 80% → 100% accuracy, 39.7s → 19.3s (−51%), −32% output tokens',
  },
  {
    value: '78% → 100%',
    label: 'Mac-local Inkling 2 Mini lifted +22 pts (83% Free → 100% Pro), −44% faster, −50% output',
  },
  {
    value: '77% → 80%',
    label: 'Official Adyen DABstep Dev external benchmark (Haiku 60% → 70%, Hard 76% → 81%)',
  },
] as const

export interface TrapCase {
  id: string
  category: 'Routine BI' | 'Relational' | 'Hard Data Science'
  name: string
  trap: string
  failureMode: string
  tinypivotGuard: string
}

export const hardTrapCases: readonly TrapCase[] = [
  {
    id: 'routine_bi_suite',
    category: 'Routine BI',
    name: '01 · Everyday BI & Data Quality (6 Unhinted Tasks)',
    trap: 'Executive KPI summaries, 6-day partial April month, 40% NULL discount_code anti-joins, 2 whale orders ($500k) inverting East vs. West, 1.35× duplicate event IDs, and mixed USD/EUR/GBP/JPY currencies.',
    failureMode: 'Without hints, fast and local models miss whale-skewed groups, drop NULL rows on !=, or report partial months as revenue crashes.',
    tinypivotGuard: 'TinyPivot Pro hit 30/30 (100%) across all 5 models via silent-when-clean DuckDB audit probes for partial periods, NULL exclusions, duplicate IDs, mixed currencies, and extreme outliers.',
  },
  {
    id: 'relational_suite',
    category: 'Relational',
    name: '02 · Multi-Table Relational Analytics (6 Unhinted Tasks)',
    trap: '2.25× dimension fan-out, 3-table multi-fact chasm traps, unweighted conversion-rate averages, Kitagawa mix-vs-rate Simpson’s paradox, Search Console impression-weighted CTR/position, and survivorship-biased LTV.',
    failureMode: 'Standard SQL executes cleanly while multiplying totals 2×–8× or computing unweighted AVG(position) / AVG(ctr).',
    tinypivotGuard: 'Both TinyPivot Free and Pro hit 30/30 (100%) via unweighted AVG(rate/position) guards, Pro join-key uniqueness probes, and 1-call analyze(explain_change).',
  },
  {
    id: 'ab_srm_20seg',
    category: 'Hard Data Science',
    name: '03 · Subtle 52.5/47.5 SRM & 20-Segment P-Hacking',
    trap: 'Two A/B suites (obvious 54/46 + subtle 52.5/47.5 SRM across 20 segments) where raw p = 0.01–0.02 segments collapse under Holm-Bonferroni correction.',
    failureMode: 'Baseline Inkling, DeepSeek, and Haiku all failed the subtle 20-segment SRM check and risked shipping broken experiments.',
    tinypivotGuard: 'analyze(ab_test) runs automatic χ² SRM + Holm-Bonferroni correction on Turn 1 — lifting all 5 models to 10/10 (100%) in 2–4 turns (4.6× faster on DeepSeek).',
  },
  {
    id: 'confounded_discount',
    category: 'Hard Data Science',
    name: '04 · Confounded Discount Causal Reversal',
    trap: '2,000 accounts where discounts target at-risk customers: naive SQL shows −19.1 pp renewal drop while true controlled OLS lift is +8.0 pp.',
    failureMode: 'Naive aggregations invert the causal sign, or agents spend 6–9 turns (61s on Opus, 113s on Inkling) hand-rolling OLS in Python/SQL.',
    tinypivotGuard: 'analyze(regression) fits controlled OLS in 1 call, flagging CONFOUNDING / SIGN REVERSAL — 2.8× faster on Opus, 3.5× faster on DeepSeek, 5.8× faster on Inkling.',
  },
  {
    id: 'right_censored_cohorts',
    category: 'Hard Data Science',
    name: '05 · Right-Censored Cohort Retention',
    trap: '6 monthly cohorts where the 3 newest cohorts have not existed 3 months yet; true matured M3 retention is flat at ~40%, not collapsing.',
    failureMode: 'Haiku baseline and unguided SQL average immature trailing cohorts as 0% and alarm leadership on a fake retention cliff.',
    tinypivotGuard: 'Pro SQL audit routes cohort tables directly to analyze(cohort_retention), masking immature cells as null — 4.3× faster on DeepSeek, 7.0× faster on Inkling.',
  },
  {
    id: 'seasonal_whale_ds',
    category: 'Hard Data Science',
    name: '06 · Seasonal Structural Breaks & Whale Revenue A/B',
    trap: '90-day daily series with a 62% weekend drop hiding a −16.5% shift on 2026-02-18, plus a revenue A/B test where 3 whale orders create a fake +$12k lift.',
    failureMode: 'Weekend variance hides exact break dates; standard t-tests on raw revenue get fooled by top-0.1% whale orders.',
    tinypivotGuard: 'analyze(anomalies) removes day-of-week seasonality to pinpoint 2026-02-18, and analyze(ab_test) adds automatic top-1% trimmed Welch whale checks.',
  },
]

export const architecturePillars = [
  {
    n: '01',
    title: 'Silent-When-Clean SQL Audit Oracle',
    body: 'Runs lightweight DuckDB probes (~5–15 ms) after each query. Completely silent when SQL is clean; emits actionable [AUDIT] blocks (unweighted AVG of rates/positions, fan-out multipliers, partial-period daily run-rates, excluded NULL totals, duplicate event IDs, mixed currencies, extreme outliers, and 1-call analyze routing hints) only when a real trap triggers.',
  },
  {
    n: '02',
    title: 'Exact-Table Batch SQL + 1-Call Data Science Shelf',
    body: 'Analytical SQL queries return exact, high-precision row-aligned tables automatically (with query.queries[] batching up to 6 SELECTs per call on both Free & Pro), while five deterministic statistical engines live behind one compact analyze tool — keeping TinyPivot Free strictly under 2,500 schema tokens.',
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
