/**
 * Empirical data and editorial copy for TinyPivot's Homepage visual gains, Technical White Paper (/whitepaper),
 * and Official PDF White Paper (/TinyPivot-Trust-Layer-Whitepaper.pdf).
 *
 * Strictly separated into:
 *  A) INTERNAL CONTROLLED SUITE — 18 Unhinted BI, Relational & Hard Data Science tasks across
 *     5 models × 3 arms (270 runs), including Thinking Machines Inkling 2 Mini & DGX Spark DeepSeek V4.1.
 *  B) EXTERNAL PUBLIC BENCHMARKS —
 *     1) MIT KramaBench (ICLR 2026) controlled same-model A/B across 4 multi-file data lakes (62 tasks).
 *     2) Official 450-task blind Adyen / Hugging Face `adyen/DABstep` leaderboard + 10-task Dev A/B.
 *  C) DIRECT WAREHOUSE STUDY — 8 questions over 2.7M fake orders in BigQuery, Claude Haiku and Sonnet × 3 setups (96 runs).
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
  /** Runs on the tester's own hardware, so it costs nothing to run (API prices are imputed). */
  local: boolean
  /** Average seconds per task and API cost in USD for all 18 tasks, alone and with TinyPivot Pro. */
  baselineSec: number
  proSec: number
  baselineCost: number
  proCost: number
}

export const TRUST_BENCH_DATE = '2026-11-26'

export const trustBenchRows: readonly TrustBenchModelRow[] = [
  {
    id: 'inkling',
    shortLabel: 'Inkling 2 Mini',
    model: 'Thinking Machines Inkling 2 Mini',
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
    proHighlight: '+22.2 pts accuracy (78% → 83% Free → 100% Pro) · 44% faster (3.8× Hard DS) · −50% output · $0 local',
    impact: {
      accuracy: '+22.2 pts (78% → 100%)',
      speed: '44% faster (3.8× Hard DS)',
      tokens: '−50% out · −17% turns',
      cost: '$0 local · $0.046 API†',
    },
    local: true,
    baselineSec: 46.1,
    proSec: 26.0,
    baselineCost: 0.027,
    proCost: 0.046,
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
    local: true,
    baselineSec: 25.7,
    proSec: 15.6,
    baselineCost: 0.059,
    proCost: 0.055,
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
    local: false,
    baselineSec: 13.1,
    proSec: 12.5,
    baselineCost: 0.074,
    proCost: 0.083,
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
    local: false,
    baselineSec: 20.0,
    proSec: 18.8,
    baselineCost: 1.22,
    proCost: 1.01,
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
    local: false,
    baselineSec: 21.5,
    proSec: 22.0,
    baselineCost: 2.32,
    proCost: 1.41,
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

/** Visual before -> after gain cards for the Homepage: plain language, each linked to its evidence. */
export interface HomeGainCard {
  id: string
  kicker: string
  headline: string
  beforeLabel: string
  afterLabel: string
  beforePct: number
  afterPct: number
  detail: string
  /** Where the evidence for this card lives. */
  to: string
  lowerIsBetter?: boolean
}

export const homeGainCards: readonly HomeGainCard[] = [
  {
    id: 'accuracy',
    kicker: 'Accuracy',
    headline: '91% → 100%',
    beforeLabel: 'AI agent alone · 91%',
    afterLabel: 'With TinyPivot Pro · 100% (90/90)',
    beforePct: 91,
    afterPct: 100,
    detail: 'Across 5 models and 18 tasks with hidden traps: double-counting joins, outliers, half-finished months, uneven A/B splits.',
    to: '/whitepaper#internal',
  },
  {
    id: 'speed',
    kicker: 'Speed on hard statistics',
    headline: '2.1× faster',
    beforeLabel: 'Agent alone · 39.7s per task',
    afterLabel: 'With TinyPivot · 19.3s per task',
    beforePct: 100,
    afterPct: 49,
    lowerIsBetter: true,
    detail: 'One tested tool call replaces rounds of trial-and-error Python — and it got the answer right more often.',
    to: '/whitepaper#internal',
  },
  {
    id: 'local-boost',
    kicker: 'Small local models',
    headline: '78% → 100%',
    beforeLabel: 'Inkling 2 Mini alone · 78%',
    afterLabel: 'With TinyPivot Pro · 100%',
    beforePct: 78,
    afterPct: 100,
    detail: 'A model running on a Mac matched the flagship cloud model on this suite, 44% faster and with half the output tokens.',
    to: '/whitepaper#internal',
  },
  {
    id: 'independent',
    kicker: 'Independent benchmark · MIT',
    headline: '72.5% → 75.2%',
    beforeLabel: 'Same 3 models alone · 72.5%',
    afterLabel: 'With TinyPivot Pro · 75.2%',
    beforePct: 72.5,
    afterPct: 75.2,
    detail: 'On MIT KramaBench, a public benchmark we didn\'t write, every model we tested improved. Claude Haiku gained the most (+6.1 pts).',
    to: '/whitepaper#kramabench',
  },
]

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
]

export interface LeaderboardBarItem {
  id: string
  label: string
  shortLabel: string
  model: string
  shortModel: string
  badge?: string
  /** Optional same-model Vanilla baseline % rendered as the lower segment inside the same stacked column. */
  baseScore?: number
  score: number
  easyScore?: number
  secondary?: string
  group?: string
  instrumentation?: string
  kind: 'tinypivot' | 'baseline' | 'leader'
  note: string
}

/**
 * External Benchmark 1: MIT KramaBench (ICLR 2026) — 4 multi-file data lakes (Environment, Wildfire,
 * Archaeology, Biomedical — 62 tasks). Stacked columns show Same-Model Vanilla Base (sand) +
 * direct TinyPivot Pro lift (green cap) in one column, grouped like-for-like by model family
 * against published heavy-instrumentation leaders on kramabench.org.
 */
export const kramaLeaderboardBars: readonly LeaderboardBarItem[] = [
  {
    id: 'kb-haiku-tp',
    label: 'TinyPivot Pro (v0.8.5)',
    shortLabel: 'TP Pro',
    model: 'Claude Haiku 5.5',
    shortModel: 'Haiku 5.5',
    badge: '+6.1 lift',
    baseScore: 71.9,
    score: 78.0,
    group: 'Claude Family (Like-for-Like)',
    instrumentation: 'Lightweight MCP',
    secondary: '71.9% → 78.0% (+6.1) · Bio .xlsx +22.2 · 10% faster',
    kind: 'tinypivot',
    note: '+6.1 pts over Vanilla Haiku (71.9%) · closes 57% of gap to Vanilla Sonnet at half the API cost',
  },
  {
    id: 'kb-sonnet-tp',
    label: 'TinyPivot Pro (v0.8.5)',
    shortLabel: 'TP Pro',
    model: 'Claude Sonnet 5.5',
    shortModel: 'Sonnet 5.5',
    badge: '+1.1 lift',
    baseScore: 82.6,
    score: 83.8,
    group: 'Claude Family (Like-for-Like)',
    instrumentation: 'Lightweight MCP',
    secondary: '82.6% → 83.8% (+1.1) · Env 95.0% · Bio 100%',
    kind: 'tinypivot',
    note: '+1.1 pts over Vanilla Sonnet (82.6%) · +12.6 pts above heavy #1 RADAR on same 4 domains',
  },
  {
    id: 'kb-smolagents',
    label: 'Published #3 / #1 Obscured · smolagents DR',
    shortLabel: 'smolagents',
    model: 'Claude-3-7',
    shortModel: 'Claude-3-7',
    badge: 'Heavy · #1 Obsc.',
    score: 54.2,
    group: 'Claude Family (Like-for-Like)',
    instrumentation: 'Multi-agent DR',
    secondary: '6-domain overall: 55.8% · Env 60.6% · Bio 38.9%',
    kind: 'leader',
    note: 'Heavy deep-research multi-agent harness on Claude-3-7 (kramabench.org)',
  },
  {
    id: 'kb-deepseek-tp',
    label: 'TinyPivot Pro (v0.8.5 · Local)',
    shortLabel: 'TP Pro',
    model: 'DeepSeek V4.1 (DGX Spark)',
    shortModel: 'DeepSeek V4.1',
    badge: '+1.1 · $0',
    baseScore: 62.8,
    score: 63.9,
    group: 'DeepSeek-V4 Family (Like-for-Like)',
    instrumentation: 'Lightweight MCP',
    secondary: '62.8% → 63.9% (+1.1) · Env +6.7 · Wild 74.4% (> RADAR)',
    kind: 'tinypivot',
    note: '+1.1 pts over Vanilla DeepSeek (62.8%) · +10.7 pts above heavy #2 TalkTask on the exact same DeepSeek-V4.1 model family ($0 cloud)',
  },
  {
    id: 'kb-talktask',
    label: 'Published #2 · TalkTask',
    shortLabel: 'TalkTask',
    model: 'DeepSeek-V4.1-Flash',
    shortModel: 'DeepSeek V4.1',
    badge: 'Heavy · #2',
    score: 53.2,
    group: 'DeepSeek-V4 Family (Like-for-Like)',
    instrumentation: 'Heavy agent',
    secondary: '6-domain overall: 56.7% (45.0% obscured)',
    kind: 'leader',
    note: 'Published #2 on kramabench.org — same DeepSeek-V4.1-Flash model family, 10.7 pts behind TinyPivot Pro',
  },
  {
    id: 'kb-radar',
    label: 'Published #1 · RADAR (arXiv:2609.32528)',
    shortLabel: 'RADAR',
    model: 'DeepSeek-V4-Flash',
    shortModel: 'DeepSeek V4',
    badge: 'Heavy · #1',
    score: 71.2,
    group: 'DeepSeek-V4 Family (Like-for-Like)',
    instrumentation: 'Multi-agent + VLM',
    secondary: '6-domain overall: 73.7% · Env 83.3% · Bio 66.7%',
    kind: 'leader',
    note: 'Published public #1 on kramabench.org — heavy multi-agent + VLM + Jupyter pipeline (4-domain weighted mean shown)',
  },
]

export interface KramaBenchRow {
  model: string
  overall: string
  speed: string
  domains: string
  note: string
}

export const kramaBenchRows: readonly KramaBenchRow[] = [
  {
    model: 'Claude Haiku 5.5',
    overall: '71.9% → 78.0% (+6.1 pts)',
    speed: '24.2s → 21.9s (10% faster · 8–5 H2H)',
    domains: 'Bio (.xlsx) 66.7% → 88.9% (2.14× faster) · Arch 41.7% → 50.0% · Env 78.0% → 83.3% · Wild 85.7% → 84.4%',
    note: 'Closes 57% of the gap to Vanilla Sonnet 5.5 (82.6%) at half the API cost ($5.28 vs $10.63*)',
  },
  {
    model: 'Claude Sonnet 5.5',
    overall: '82.6% → 83.8% (+1.1 pts)',
    speed: '17.5s → 19.2s (2–1 H2H · Bio 16% faster)',
    domains: 'Env 90.0% → 95.0% (+5 pts) · Bio (.xlsx) 100.0% (26.4s vs 31.3s) · Arch 41.7% · Wild 91.6% → 90.2%',
    note: '1-call profile(dirPath) + direct .xlsx flipped Environment +5 pts and sped up Biomedical by 16%',
  },
  {
    model: 'DeepSeek V4.1 (DGX Spark Local)',
    overall: '62.8% → 63.9% (+1.1 pts)',
    speed: '$0 cloud spend · 10–9 H2H',
    domains: 'Env 68.3% → 75.0% (+6.7 pts) · Wild 72.7% → 74.4% (+1.7, beats RADAR 73.7%) · Arch 41.7% · Bio 55.6% → 44.4%',
    note: 'Beats Published #2 TalkTask (53.2%) by +10.7 pts on the exact same DeepSeek-V4.1-Flash model family',
  },
  {
    model: 'Combined 3-Model (n = 186 paired)',
    overall: '72.5% → 75.2% (+2.8 pts)',
    speed: '372 controlled runs · 20–15 H2H',
    domains: 'All 3 models (Sonnet 5.5, Haiku 5.5, local DeepSeek V4.1) improved across 4 multi-file data lakes',
    note: 'Zero Jupyter, zero VLM, zero multi-agent bloat — lightweight DuckDB + smart .xlsx + folder profiling',
  },
]

/**
 * External Benchmark 2: Official 450-task blind Adyen / Hugging Face `adyen/DABstep` Leaderboard.
 * 7 focused columns (zero horizontal scroll): Lightweight TinyPivot MCP submissions first,
 * followed by Official Claude ReACT Baseline and heavy specialized leaderboard systems.
 */
export const dabstepLeaderboardBars: readonly LeaderboardBarItem[] = [
  {
    id: 'dab-sonnet-tp',
    label: 'TinyPivot Pro (Live Adyen Score)',
    shortLabel: 'TP Pro',
    model: 'Claude Sonnet 5.5',
    shortModel: 'Sonnet 5.5',
    badge: '#1 Easy · #3-eq',
    score: 68.8,
    easyScore: 97.2,
    group: 'Lightweight TinyPivot MCP',
    instrumentation: 'Lightweight MCP',
    secondary: 'Easy: 97.2% (#1!) · Hard: 68.8% (#3-equiv) · Total: 73.3%',
    kind: 'tinypivot',
    note: 'General-purpose MCP, zero domain hacks — beats heavy GPT-5 (57.7%) & Google DS-STAR (45.2%)',
  },
  {
    id: 'dab-haiku-tp',
    label: 'TinyPivot Pro (Live Adyen Score)',
    shortLabel: 'TP Pro',
    model: 'Claude Haiku 5.5',
    shortModel: 'Haiku 5.5',
    badge: '~2× ReACT',
    score: 38.6,
    easyScore: 88.9,
    group: 'Lightweight TinyPivot MCP',
    instrumentation: 'Lightweight MCP',
    secondary: 'Easy: 88.9% · Hard: 38.6% · Total: 46.7% (Dev A/B +10 pts)',
    kind: 'tinypivot',
    note: '~2× Claude 4 Sonnet ReACT; Dev A/B showed +10 pts same-model lift (60% → 70%)',
  },
  {
    id: 'dab-deepseek-tp',
    label: 'TinyPivot Pro (Live Adyen Score · Local)',
    shortLabel: 'TP Pro',
    model: 'DeepSeek V4.1 (DGX Spark)',
    shortModel: 'DeepSeek $0',
    badge: '$0 Local',
    score: 24.3,
    easyScore: 90.3,
    group: 'Lightweight TinyPivot MCP',
    instrumentation: 'Lightweight MCP',
    secondary: 'Easy: 90.3% · Hard: 24.3% · Total: 34.9% ($0 cloud)',
    kind: 'tinypivot',
    note: '100% local open-weights — beats Claude 4 ReACT Hard & exceeds KGMON/DataPilot Easy %',
  },
  {
    id: 'dab-react',
    label: 'Official Baseline · Claude 4 Sonnet ReACT',
    shortLabel: 'ReACT Base',
    model: 'Claude 4 Sonnet',
    shortModel: 'Claude 4',
    badge: 'Ref Base',
    score: 19.8,
    easyScore: 81.9,
    group: 'Baseline & Heavy Benchmark Agents',
    instrumentation: 'ReACT baseline',
    secondary: 'Easy: 81.9% · Hard: 19.8%',
    kind: 'baseline',
    note: 'Official Adyen reference ReACT baseline',
  },
  {
    id: 'dab-dsstar',
    label: 'Validated #5 · Google Cloud DS-STAR',
    shortLabel: 'DS-STAR',
    model: 'Gemini-2.5-Pro',
    shortModel: 'Google · #5',
    badge: 'Heavy · #5',
    score: 45.2,
    easyScore: 87.5,
    group: 'Baseline & Heavy Benchmark Agents',
    instrumentation: 'Heavy DS agent',
    secondary: 'Easy: 87.5% · Hard: 45.2%',
    kind: 'leader',
    note: 'Google Research iterative multi-step data-science agent',
  },
  {
    id: 'dab-cambio',
    label: 'Validated #4 · CambioML energent.ai DS Agent',
    shortLabel: 'CambioML',
    model: 'GPT-5',
    shortModel: 'GPT-5 · #4',
    badge: 'Heavy · #4',
    score: 57.7,
    easyScore: 94.4,
    group: 'Baseline & Heavy Benchmark Agents',
    instrumentation: 'Heavy DS agent',
    secondary: 'Easy: 94.4% · Hard: 57.7%',
    kind: 'leader',
    note: 'Validated #4 on adyen/DABstep — behind TinyPivot Pro Sonnet by 11.1 pts',
  },
  {
    id: 'dab-kgmon',
    label: 'Validated #1 · NVIDIA KGMON Data Explorer',
    shortLabel: 'KGMON',
    model: 'Claude Haiku 4.5 (multi-agent)',
    shortModel: 'NVIDIA · #1',
    badge: 'Multi-Agent #1',
    score: 90.0,
    easyScore: 87.5,
    group: 'Baseline & Heavy Benchmark Agents',
    instrumentation: 'Multi-agent',
    secondary: 'Easy: 87.5% · Hard: 90.0%',
    kind: 'leader',
    note: 'Specialized multi-agent + benchmark workflow (TinyPivot Sonnet & local DeepSeek both beat KGMON on Easy %)',
  },
]

export interface DabstepOfficialRow {
  model: string
  easy: string
  hard: string
  total: string
  note: string
}

export const dabstepOfficialRows: readonly DabstepOfficialRow[] = [
  {
    model: 'Claude Sonnet 5.5 + TP Pro',
    easy: '97.22% (70/72)',
    hard: '68.78% (260/378)',
    total: '73.33% (330/450)',
    note: '#1 Easy · #3-equiv Hard vs Validated Leaderboard (ahead of GPT-5 57.7% & Google DS-STAR 45.2%)',
  },
  {
    model: 'Claude Haiku 5.5 + TP Pro',
    easy: '88.89% (64/72)',
    hard: '38.62% (146/378)',
    total: '46.67% (210/450)',
    note: '#8-equiv Hard (~2× Claude 4 Sonnet ReACT 19.8%); Dev A/B showed +10 pts same-model lift (60% → 70%)',
  },
  {
    model: 'DeepSeek V4.1 (DGX Spark) + TP Pro',
    easy: '90.28% (65/72)',
    hard: '24.34% (92/378)',
    total: '34.89% (157/450)',
    note: '100% local open-weights ($0 cloud spend) — beats Claude 4 ReACT Hard & exceeds KGMON/DataPilot Easy %',
  },
]

export const whitepaperHeroStats = [
  {
    value: '91% → 100%',
    label: 'Correct answers across 5 AI models on our 18 trap-laden analysis tasks (90/90 with TinyPivot Pro)',
    to: '#internal',
  },
  {
    value: '2.1× faster',
    label: 'On the hardest statistics questions, averaged across all 5 models — while also getting them right',
    to: '#internal',
  },
  {
    value: '72.5% → 75.2%',
    label: 'MIT KramaBench, an independent benchmark: all 3 models improved, Claude Haiku the most (+6.1 pts)',
    to: '#kramabench',
  },
  {
    value: '97.2% Easy',
    label: '#1 on the Easy tier of Adyen’s blind-scored DABstep leaderboard (Claude Sonnet 5.5; 68.8% on Hard)',
    to: '#dabstep',
  },
] as const

/** Full 18-task Internal Controlled Suite catalog (shown in collapsible details). */
export interface InternalTaskItem {
  id: string
  category: 'Routine BI' | 'Relational Analytics' | 'Hard Data Science'
  title: string
  prompt: string
  trap: string
  guardrail: string
}

export const internalTestCatalog: readonly InternalTaskItem[] = [
  {
    id: 'routine_exec_summary',
    category: 'Routine BI',
    title: '01 · Executive YoY Revenue Summary',
    prompt: 'Using orders_saas.csv in this folder, summarize 2025 vs 2026 total revenue, YoY growth %, and the leading region in 2026.',
    trap: 'Clean baseline executive KPI check — ensures guardrails stay 100% silent with zero false positives.',
    guardrail: 'Silent-when-clean DuckDB SQL execution + exact-table return.',
  },
  {
    id: 'routine_partial_month',
    category: 'Routine BI',
    title: '02 · 6-Day Partial Trailing Month',
    prompt: 'Using monthly_sales.csv in this folder, summarize our monthly revenue trend from Jan to Apr 2026 and tell me how April is performing vs March.',
    trap: 'April only covers Apr 1–6 (6 days), making raw monthly revenue look like a −79% crash when daily run-rate actually grew.',
    guardrail: 'Pro partial-period audit detects incomplete trailing month and computes exact daily run-rate.',
  },
  {
    id: 'routine_null_antijoin',
    category: 'Routine BI',
    title: '03 · 40% NULL Anti-Join Exclusion',
    prompt: 'Using promo_orders.csv in this folder, what is our total revenue for orders without the \'PROMO20\' discount code?',
    trap: 'SQL WHERE discount_code != \'PROMO20\' silently drops all 40% NULL discount_code rows.',
    guardrail: 'Pro NULL-exclusion audit counts dropped NULL rows and flags IS DISTINCT FROM / IS NULL.',
  },
  {
    id: 'routine_whale_outlier',
    category: 'Routine BI',
    title: '04 · Whale Orders Inverting Regional Leader',
    prompt: 'Using regional_orders.csv in this folder, which region led revenue — East or West — and by how much?',
    trap: 'Two $250k anomalous whale orders in East invert the underlying East vs. West regional ranking.',
    guardrail: 'Pro extreme-outlier audit surfaces the 2 whale order IDs alongside clean vs. raw totals.',
  },
  {
    id: 'routine_duplicate_events',
    category: 'Routine BI',
    title: '05 · 1.35× Duplicate Event Ingestion',
    prompt: 'Using checkout_events.csv in this folder, what was our total checkout revenue and total order count?',
    trap: '35% of event_id rows were double-ingested, inflating naive SUM(amount) and COUNT(*).',
    guardrail: 'Pro duplicate-ID audit detects non-unique primary event keys and prompts deduplication.',
  },
  {
    id: 'routine_mixed_currency',
    category: 'Routine BI',
    title: '06 · Mixed USD/EUR/GBP/JPY Currencies',
    prompt: 'Using global_tx.csv (and fx_rates.csv if needed) in this folder, what is our total revenue across all regions?',
    trap: 'Naive SUM(amount) adds USD, EUR, GBP, and JPY face values together without FX conversion.',
    guardrail: 'Pro mixed-currency audit detects multi-currency amounts and flags FX normalization.',
  },
  {
    id: 'rel_fanout_dim',
    category: 'Relational Analytics',
    title: '07 · 2.25× Dimension Join Fan-Out',
    prompt: 'Using orders.csv and account_reps.csv in this folder, report total revenue by region and overall total.',
    trap: 'Joining orders to multi-row account_reps silently multiplies total revenue by 2.25×.',
    guardrail: 'Pro join-fanout audit probes key uniqueness on both sides and alerts on row-multiplication.',
  },
  {
    id: 'rel_chasm_trap',
    category: 'Relational Analytics',
    title: '08 · 3-Table Multi-Fact Chasm Trap',
    prompt: 'Using accounts.csv, orders.csv, and support_tickets.csv in this folder, report total revenue and total support tickets by tier plus grand totals.',
    trap: 'Joining two fact tables (orders + support_tickets) via accounts creates a Cartesian explosion (6×–8× totals).',
    guardrail: 'Pro join-fanout audit catches multi-fact row explosion and suggests pre-aggregating each fact in CTEs.',
  },
  {
    id: 'rel_nonadditive_rate',
    category: 'Relational Analytics',
    title: '09 · Unweighted Conversion-Rate Average',
    prompt: 'Using channel_daily.csv in this folder, what is our overall conversion rate (%) and which channel converts best?',
    trap: 'AVG(conversion_rate) weights tiny-traffic days equally with high-volume days and flips the top channel.',
    guardrail: 'Built-in non-additive rate guard flags AVG(rate) and requires SUM(conversions) / SUM(sessions).',
  },
  {
    id: 'rel_kitagawa_mix',
    category: 'Relational Analytics',
    title: '10 · Kitagawa Mix-vs-Rate Simpson’s Paradox',
    prompt: 'Using q4_funnel_events.csv in this folder, why did our blended conversion rate drop from 2026-Q3 to 2026-Q4? Quantify the drivers in percentage points.',
    trap: 'Every individual channel improved conversion rate, yet blended conversion dropped due to traffic mix shift.',
    guardrail: '1-call analyze(explain_change) computes exact Kitagawa rate vs. mix percentage-point decomposition.',
  },
  {
    id: 'rel_gsc_weighted_ctr',
    category: 'Relational Analytics',
    title: '11 · Search Console Impression-Weighted CTR & Position',
    prompt: 'Using gsc_queries.csv in this folder, what is our overall CTR (%) and average search position, and what is our biggest page-2 (position 10-20) opportunity query?',
    trap: 'Unweighted AVG(ctr) and AVG(position) distort SEO performance vs. impression-weighted averages.',
    guardrail: 'Non-additive rate/position guard flags unweighted AVG(ctr) / AVG(position).',
  },
  {
    id: 'rel_survivorship_ltv',
    category: 'Relational Analytics',
    title: '12 · Survivorship-Biased Customer LTV',
    prompt: 'Using the customer files in this folder (all_customers.csv, active_customers.csv), what is our average customer lifetime spend?',
    trap: 'Querying only active_customers.csv excludes churned cohorts and severely overstates true LTV.',
    guardrail: 'Multi-file profile(dirPath) + peer dataset inspection surfaces both tables and survivorship gap.',
  },
  {
    id: 'ds_ab_srm_phacking',
    category: 'Hard Data Science',
    title: '13 · 12-Segment 54/46 SRM + P-Hacking',
    prompt: 'Using experiment_results.csv in this folder, did any segment win our A/B test and should we ship?',
    trap: 'Broken 54/46 traffic split (SRM) plus 12 segments where raw p < 0.05 winners disappear under Holm-Bonferroni.',
    guardrail: '1-call analyze(ab_test) runs automatic χ² SRM + Holm-Bonferroni correction on Turn 1.',
  },
  {
    id: 'ds_ab_subtle_20seg',
    category: 'Hard Data Science',
    title: '14 · Subtle 52.5/47.5 SRM Across 20 Geos',
    prompt: 'Using ab_20seg.csv in this folder, did any geo win our A/B test and should we ship?',
    trap: 'Subtle 52.5/47.5 imbalance escapes eyeballing while 1 of 20 geos shows raw p = 0.015 noise.',
    guardrail: '1-call analyze(ab_test) catches subtle χ² SRM (p < 1e-4) and rejects false-positive geo under Holm.',
  },
  {
    id: 'ds_confounded_ols',
    category: 'Hard Data Science',
    title: '15 · Confounded Discount Causal Reversal',
    prompt: 'Using account_renewals.csv in this folder, our VP says giving discounts hurts renewals. What do the numbers show? Quantify the effect.',
    trap: 'Discounts target at-risk accounts: naive group comparison shows −19.1 pp drop while controlled OLS lift is +8.0 pp.',
    guardrail: '1-call analyze(regression) fits controlled multivariate OLS and flags CONFOUNDING / SIGN REVERSAL.',
  },
  {
    id: 'ds_right_censored_cohorts',
    category: 'Hard Data Science',
    title: '16 · Right-Censored Cohort Retention',
    prompt: 'Using user_activity.csv in this folder, what is our M3 cohort retention rate and how is it trending across recent cohorts?',
    trap: 'The 3 newest monthly cohorts are not yet 3 months old — averaging them as 0% fabricates a retention cliff.',
    guardrail: 'Pro SQL audit routes to analyze(cohort_retention) which masks immature cells as null (~40% flat).',
  },
  {
    id: 'ds_seasonal_changepoint',
    category: 'Hard Data Science',
    title: '17 · Seasonal Structural Break (Weekend Masking)',
    prompt: 'Using daily_orders.csv in this folder, how are daily orders trending — did anything shift, and if so when and by how much?',
    trap: '62% weekend order drops hide an exact −16.5% structural break starting 2026-02-18.',
    guardrail: '1-call analyze(anomalies) removes day-of-week seasonality and pinpoints 2026-02-18 (−16.5%).',
  },
  {
    id: 'ds_whale_ab_revenue',
    category: 'Hard Data Science',
    title: '18 · Whale-Skewed Revenue A/B Test',
    prompt: 'Using ab_revenue.csv in this folder, did the treatment lift revenue per user enough to ship?',
    trap: '3 extreme whale orders ($12,500+) create a fake +$12k revenue lift that vanishes when top 1% is trimmed.',
    guardrail: '1-call analyze(ab_test) runs automatic top-1% trimmed Welch t-test and warns not to ship.',
  },
]

export interface ExternalSampleTask {
  id: string
  tag: string
  prompt: string
  expected: string
}

export const kramaSampleTasks: readonly ExternalSampleTask[] = [
  {
    id: 'environment-easy-1',
    tag: 'Environment · 36 CSVs',
    prompt: 'What percentage (to 3 decimal places) of water samples collected from Massachusetts beaches during the 2013 bathing season exceeded bacterial standards?',
    expected: '4.796',
  },
  {
    id: 'environment-hard-20',
    tag: 'Environment · Multi-file join',
    prompt: 'In 2015, what are the three most polluted beaches of the city that had the least rainfall in the summer (June, July, August)?',
    expected: '["Bucks Creek", "Pleasant Street", "Forest Beach"]',
  },
  {
    id: 'biomedical-hard-1',
    tag: 'Biomedical · 7 .xlsx workbooks',
    prompt: 'What is the Spearman correlation between the abundance of the protein PLK1 and the abundance of CHEK2-S163 in tumor samples? Exclude samples not in the study and with missing values.',
    expected: '0.4765',
  },
  {
    id: 'biomedical-easy-9',
    tag: 'Biomedical · Multi-sheet .xlsx',
    prompt: 'What is the difference between the average false discovery rate (FDR) in CBX3 genes and the average FDR for the rest of the genes?',
    expected: '-0.008003975',
  },
  {
    id: 'archeology-hard-1',
    tag: 'Archaeology · Preamble-row .xlsx',
    prompt: 'What is the average Potassium in ppm from the first and last time the study recorded people in the Maltese area? Assume Potassium is linearly interpolated between samples.',
    expected: '8577.5298',
  },
  {
    id: 'archeology-hard-7',
    tag: 'Archaeology · CSV + .xlsx',
    prompt: 'How many radiocarbon samples belong to the Neolithic period in the regional radiocarbon database?',
    expected: '274',
  },
  {
    id: 'wildfire-easy-1',
    tag: 'Wildfire · 17 CSVs + JSON',
    prompt: 'Find the 3-month period with the highest total acres burned since Jan 2000, according to NOAA. What was the total acres burned in that period?',
    expected: '7805421',
  },
  {
    id: 'wildfire-hard-21',
    tag: 'Wildfire · Multi-table ranking',
    prompt: 'Based on NOAA data, what are the top 3 states that lost the most residential property in value between 2005 and 2010 (inclusive)?',
    expected: '["California", "Washington", "Idaho"]',
  },
]

export const dabstepSampleTasks: readonly ExternalSampleTask[] = [
  {
    id: 'task-5',
    tag: 'Easy · Ledger aggregation',
    prompt: 'Which issuing country has the highest number of transactions?',
    expected: 'NL',
  },
  {
    id: 'task-49',
    tag: 'Easy · Fraud rate',
    prompt: 'What is the top country (ip_country) for fraud? A. NL, B. BE, C. ES, D. FR',
    expected: 'B. BE',
  },
  {
    id: 'task-70',
    tag: 'Easy · Manual rule check',
    prompt: 'Is Martinis_Fine_Steakhouse in danger of getting a high-fraud rate fine?',
    expected: 'Not Applicable',
  },
  {
    id: 'task-1273',
    tag: 'Hard · Nested JSON fee rules',
    prompt: 'For credit transactions, what would be the average fee that the card scheme GlobalCard would charge for a transaction value of 10 EUR?',
    expected: '0.120132',
  },
  {
    id: 'task-1305',
    tag: 'Hard · MCC + Fee rule join',
    prompt: 'For account type H and the MCC description: Eating Places and Restaurants, what would be the average fee that GlobalCard would charge for a 10 EUR transaction?',
    expected: '0.123217',
  },
  {
    id: 'task-1464',
    tag: 'Hard · Wildcard rule matching',
    prompt: 'What is the fee ID or IDs that apply to account_type = R and aci = B?',
    expected: '391 matching fee IDs (comma-separated)',
  },
  {
    id: 'task-1681',
    tag: 'Hard · Merchant monthly volume + fraud',
    prompt: 'For the 10th day of the year 2023, what are the Fee IDs applicable to Belles_cookbook_store?',
    expected: '741, 709, 454, 813, 381, 536, 473, 572, 477, 286',
  },
  {
    id: 'task-1753',
    tag: 'Hard · Monthly rule set (34 IDs)',
    prompt: 'What are the applicable fee IDs for Belles_cookbook_store in March 2023?',
    expected: '34 matching fee IDs',
  },
  {
    id: 'task-1871',
    tag: 'Hard · 14-decimal fee counterfactual',
    prompt: 'In January 2023 what delta would Belles_cookbook_store pay if the relative fee of the fee with ID=384 changed to 1?',
    expected: '-0.94810300000017',
  },
  {
    id: 'task-2697',
    tag: 'Hard · Fraud ACI fee optimization',
    prompt: 'For Belles_cookbook_store in January, if we moved fraudulent transactions to a different ACI, which ACI minimizes total fees and what is the cost?',
    expected: 'E:13.57',
  },
]

export const architecturePillars = [
  {
    n: '01',
    title: 'Checks every query',
    summary: 'Small, fast probes run after each query and speak up only when they find a real problem, so clean work is never slowed down or cluttered.',
    body: 'Runs lightweight DuckDB probes (~5–15 ms) after each query. Completely silent when SQL is clean; emits actionable [AUDIT] blocks (unweighted AVG of rates/positions, fan-out multipliers, partial-period daily run-rates, excluded NULL totals, zero-row filter suggestions, duplicate event IDs, mixed currencies, extreme outliers, and 1-call analyze routing hints) only when a real trap triggers.',
  },
  {
    n: '02',
    title: 'Reads whole folders and Excel files in one step',
    summary: 'Point it at a folder and it maps every file, including messy multi-sheet workbooks, without pasting raw rows into the conversation.',
    body: 'profile({ dirPath }) collapses partitioned file series (e.g. 22 yearly CSVs) into DuckDB glob hints and inspects multi-sheet .xlsx workbooks (auto-detecting headers below preamble title/note rows!) without pasting raw rows into context. Named queries persist as DuckDB views across turns, while TinyPivot Free stays strictly under 2,500 schema tokens.',
  },
  {
    n: '03',
    title: 'Tested statistics, plus memory',
    summary: 'Five statistical tools return an answer in one call, and Pro remembers what it learned about your data, cutting repeat schema tokens by 47%.',
    body: 'Five deterministic statistical engines (explain_change, ab_test with χ² SRM + Holm-Bonferroni + whale trim, controlled OLS regression, right-censored cohorts, seasonal anomalies) run in 10–40 ms. Local Recursive Data Memory (~/.local/share/tinypivot/memory.json) learns traps and Studio edits to cut repeat schema tokens by 47%.',
  },
  {
    n: '04',
    title: 'Shows its work',
    summary: 'Every chart links to its SQL and source rows and can be exported as an offline report, or it can run with no window at all in automated pipelines.',
    body: 'Every chart and pivot links back to editable SQL (with lossless revision history), clickable Underlying Source Rows, order-independent SHA-256 Data Hashes, claim-checked prose, and zero-CDN Offline HTML Notebooks — or pass --no-studio (TINYPIVOT_NO_STUDIO=1) for zero-popup headless CI and benchmarks.',
  },
] as const

/**
 * Direct warehouse connections: 8 questions over fake Acme tables in BigQuery, Claude Haiku and Claude Sonnet,
 * three setups, 2 runs each (analysis/warehouse-benchmark, suite `hard`). Every run was answered correctly.
 */
export type WarehouseArmId = 'cli' | 'export' | 'direct'

export interface WarehouseArmResult {
  correct: number
  /** Average seconds per question. */
  avgSec: number
  /** API price of all the cell's runs, USD. */
  cost: number
}

export const WAREHOUSE_STUDY = {
  date: '2026-11-27',
  questions: 8,
  reps: 2,
  /** Runs per model in one setup: questions × reps. */
  runsPerArm: 16,
  totalRuns: 96,
  /** API price of all 96 Claude runs (cold-cache). */
  totalCost: 6.33,
} as const

export const warehouseArms: readonly { id: WarehouseArmId, name: string, body: string }[] = [
  {
    id: 'cli',
    name: 'bq command line',
    body: 'The agent with a shell and Google’s bq command line, and no TinyPivot. It can write any SQL it likes.',
  },
  {
    id: 'export',
    name: 'Export, then TinyPivot',
    body: 'Shell plus TinyPivot Pro, told to export what it needs with bq and analyse the file in TinyPivot: the route TinyPivot Free has.',
  },
  {
    id: 'direct',
    name: 'TinyPivot direct',
    body: 'TinyPivot Pro’s 1-call warehouse profile and query_bigquery (with batched queries[], session-cached trap audits and dialect repair hints): no shell, no files.',
  },
]

export const warehouseResults: readonly { model: string, arms: Record<WarehouseArmId, WarehouseArmResult> }[] = [
  {
    model: 'Claude Haiku',
    arms: {
      cli: { correct: 16, avgSec: 37.4, cost: 0.111 },
      export: { correct: 16, avgSec: 89.7, cost: 0.1622 },
      direct: { correct: 16, avgSec: 17.0, cost: 0.0832 },
    },
  },
  {
    model: 'Claude Sonnet',
    arms: {
      cli: { correct: 16, avgSec: 44.4, cost: 2.0469 },
      export: { correct: 16, avgSec: 63.0, cost: 2.3015 },
      direct: { correct: 16, avgSec: 26.6, cost: 1.6292 },
    },
  },
]

/**
 * Small local models on the exact same 8 BigQuery questions (2 reps each, 8-turn cap, 96 runs):
 * bare BigQuery SQL vs pre-exported local Parquet ceiling vs TinyPivot Pro direct.
 */
export type WarehouseLocalArmId = 'sql' | 'files' | 'direct'

export interface WarehouseLocalArmResult {
  correct: number
  avgSec: number
  avgTurns: number
  /** Estimated API-equivalent price of all 16 runs (local hardware is $0). */
  estCost: number
}

export const WAREHOUSE_LOCAL_STUDY = {
  date: '2026-11-27',
  questions: 8,
  reps: 2,
  runsPerArm: 16,
  totalRuns: 96,
  maxTurns: 8,
} as const

export const warehouseLocalArms: readonly { id: WarehouseLocalArmId, name: string, body: string }[] = [
  {
    id: 'sql',
    name: 'Bare BigQuery SQL',
    body: 'A single run_sql tool returning the first 100 rows from BigQuery, like the bq CLI. No TinyPivot.',
  },
  {
    id: 'files',
    name: 'Local Parquet ceiling',
    body: 'The same 5 tables pre-exported once to local Parquet files and analysed with TinyPivot Pro (DuckDB).',
  },
  {
    id: 'direct',
    name: 'TinyPivot Pro direct',
    body: 'TinyPivot Pro directly on BigQuery: 1-call warehouse profile, batched query_bigquery, cached trap audits and BigQuery SQL repair hints.',
  },
]

export const warehouseLocalResults: readonly { model: string, rateNote: string, arms: Record<WarehouseLocalArmId, WarehouseLocalArmResult> }[] = [
  {
    model: 'Inkling 2 Mini (Mac local)',
    rateNote: 'GPT-4o-mini API-equivalent rates',
    arms: {
      sql: { correct: 14, avgSec: 56.6, avgTurns: 7.8, estCost: 0.0416 },
      files: { correct: 16, avgSec: 64.2, avgTurns: 6.6, estCost: 0.0755 },
      direct: { correct: 16, avgSec: 58.7, avgTurns: 3.6, estCost: 0.0451 },
    },
  },
  {
    model: 'DeepSeek V4.1 Flash (DGX Spark)',
    rateNote: 'DeepSeek-Flash peak API-equivalent rates',
    arms: {
      sql: { correct: 14, avgSec: 35.5, avgTurns: 6.9, estCost: 0.0868 },
      files: { correct: 16, avgSec: 30.3, avgTurns: 4.6, estCost: 0.0943 },
      direct: { correct: 16, avgSec: 21.8, avgTurns: 3.5, estCost: 0.0525 },
    },
  },
]

export const warehouseFindings = [
  'On Claude Haiku and Sonnet, every setup answered all 96 runs correctly — and with 1-call warehouse profiling, batched queries[], session-cached audits and dialect repair hints, TinyPivot direct was 46% faster than the bq command line (17.0s vs 37.4s on Haiku; 26.6s vs 44.4s on Sonnet) and 71% faster than exporting first (89.7s / 63.0s).',
  'It was also cheaper than the command line on both Claude models (cold-cache): 25% less API spend on Haiku ($0.0832 vs $0.1110, 4.1 vs 5.8 turns) and 20% less on Sonnet ($1.63 vs $2.05). Earlier direct runs without 1-call warehouse profiling took 6.7–7.1 turns and cost 4–15% more than bq.',
  'On small local models (Inkling 2 Mini and DeepSeek V4.1 Flash, 8-turn cap), TinyPivot Pro direct lifted accuracy from 88% (28/32 on bare BigQuery SQL) to 100% (32/32), matching the pre-exported local Parquet ceiling.',
  'It cut turns roughly in half on both local models (7.8 → 3.6 on Inkling, 6.9 → 3.5 on DeepSeek) and cut SQL errors from 22 combined on the v0.9.2 baseline to 2 total (0 on DeepSeek, 2 on Inkling). On DeepSeek, direct BigQuery beat both bare SQL (-39% latency, -40% est. cost) and local Parquet files (-28% latency, -44% est. cost).',
  'What drove the step change: a 1-call warehouse profile() brief (0-scan metadata + 1 single-pass aggregate probe per table surfacing schemas, distinct filter values, date ranges, join fan-out, NULL shares and mixed currencies), session-cached probes, batched queries[], and deterministic dialect/column repair hints.',
  'Limits: eight questions and two runs per setup is a focused benchmark on BigQuery; multi-warehouse live tests cover Snowflake, Databricks, ClickHouse, MySQL and Postgres.',
] as const

export const warehouseTasks: readonly { id: string, title: string, prompt: string, trap: string }[] = [
  {
    id: 'median_order',
    title: 'A median over 606k orders',
    prompt: 'What was the median order amount for completed orders placed by North America customers in 2026, and what share of those orders were over $500?',
    trap: 'Needs all 605,766 rows. A 100-row command-line preview or a 5,000-row sample gives a believable but wrong share.',
  },
  {
    id: 'ship_fanout',
    title: 'A three-table join that double-counts',
    prompt: 'For completed orders placed in Q3 2026 by North America customers that were shipped (at least in part) by Bluejay Freight, what was total order revenue by customer segment, and the grand total?',
    trap: 'Orders, customers and shipments. An order can have up to three shipments, so a plain join to shipments overstates revenue by 19%.',
  },
  {
    id: 'partial_month',
    title: 'A 12-day month',
    prompt: 'Show monthly completed order revenue for North America customers from January 2026 through the latest month in the data, and explain how the latest month compares with the month before.',
    trap: 'The data stops on November 12. November looks 61% down on October; per day it is flat.',
  },
  {
    id: 'null_promo',
    title: 'Missing values a filter drops',
    prompt: 'How many completed 2026 orders from North America customers did not use the SAVE10 promo code, and what was their total revenue?',
    trap: 'Most orders have no promo code (NULL), and promo_code != \'SAVE10\' silently drops them: 84,565 orders instead of 520,653.',
  },
  {
    id: 'weighted_rate',
    title: 'An average of daily rates',
    prompt: 'Using campaign_daily for Q3 2026: what was the conversion rate (conversions ÷ sessions) and cost per conversion for each channel, what was the conversion rate across all channels combined, and which channel converts best?',
    trap: 'Tiny affiliate campaigns convert 12–20% a day. Averaging the stored daily rate puts Affiliate first at 14.6%; weighted by sessions it is 2.3%, and Search leads.',
  },
  {
    id: 'fx_revenue',
    title: 'Three currencies in one column',
    prompt: 'What was Acme’s total completed order revenue in October 2026, in US dollars, and how much came from each region?',
    trap: 'EMEA amounts are in euros and pounds. Converting needs the monthly fx_rates table; a plain sum is 4% low.',
  },
  {
    id: 'cohort',
    title: 'A first-order cohort over 2.7M orders',
    prompt: 'Of the customers whose first-ever order was placed in Q1 2026 (January–March), what percentage placed at least one more order in Q3 2026 (July–September)? Count orders of any status.',
    trap: 'Needs each customer’s first order across the whole history. Counting everyone who ordered in Q1 gives 31.7% instead of 39.6%.',
  },
  {
    id: 'top_share',
    title: 'The top 1% of 119k customers',
    prompt: 'Among North America customers who placed completed orders in 2026, what share of their 2026 completed revenue came from the top 1% of those customers by 2026 revenue?',
    trap: 'Needs a revenue total for each of 119,478 customers, far more rows than an agent can read.',
  },
]
