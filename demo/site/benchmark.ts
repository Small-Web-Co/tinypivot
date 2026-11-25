/**
 * Measured, not modelled: three questions asked of Claude Code (Sonnet 5.5) in three setups,
 * two runs each, with cost from Claude Code's own accounting. Benchmark run on 2026-11-25.
 * Questions: chart MRR by month 2026 vs 2025; pivot MRR by plan and channel; which channel
 * fell off in March 2026 and by how much.
 */

export interface BenchmarkSetup {
  id: 'paste' | 'python' | 'tinypivot'
  label: string
  /** Average cost of the three-question session on the 1,290-row result, in USD. */
  smallCost: number
  /** Same on the 44,714-row file; null when the setup cannot run at all. */
  largeCost: number | null
  /** Questions answered with the right figures, out of three. */
  correct: number
}

export const BENCHMARK = {
  model: 'Claude Sonnet 5.5',
  harness: 'Claude Code',
  questions: 3,
  smallRows: 1_290,
  largeRows: 44_714,
} as const

export const benchmarkSetups: readonly BenchmarkSetup[] = [
  { id: 'paste', label: 'Read the rows', smallCost: 0.320, largeCost: null, correct: 1 },
  { id: 'python', label: 'Agent writes Python', smallCost: 0.181, largeCost: 0.197, correct: 3 },
  { id: 'tinypivot', label: 'TinyPivot', smallCost: 0.162, largeCost: 0.167, correct: 3 },
]

function setup(id: BenchmarkSetup['id']): BenchmarkSetup {
  const found = benchmarkSetups.find(item => item.id === id)
  if (!found)
    throw new Error(`No benchmark setup "${id}"`)
  return found
}

/** Within this share either way of the Python setup's cost counts as "about the same". */
const ABOUT_THE_SAME = 0.15

/** The headline comparisons, rounded so they never overstate. */
export function benchmarkHeadline() {
  const paste = setup('paste')
  const python = setup('python')
  const tinypivot = setup('tinypivot')
  return {
    /** How much less TinyPivot cost than reading the rows, rounded down to a whole percent. */
    cheaperThanPastingPct: Math.floor((1 - tinypivot.smallCost / paste.smallCost) * 100),
    correct: tinypivot.correct,
    pastedCorrect: paste.correct,
    questions: BENCHMARK.questions,
    aboutSameAsPython: Math.abs(tinypivot.smallCost / python.smallCost - 1) <= ABOUT_THE_SAME,
  }
}
