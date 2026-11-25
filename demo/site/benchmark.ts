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

/** A whole-percent saving, rounded down so it never overstates. */
function savedPct(ours: number, theirs: number): number {
  return Math.floor((1 - ours / theirs) * 100)
}

/** Cost per question in cents, from a session's cost. */
export function centsPerQuestion(sessionCost: number): string {
  return `${((sessionCost / BENCHMARK.questions) * 100).toFixed(1)}¢`
}

/** The headline comparisons, rounded so they never overstate. */
export function benchmarkHeadline() {
  const paste = setup('paste')
  const python = setup('python')
  const tinypivot = setup('tinypivot')
  return {
    /** Against an agent writing Python on the large file: the alternative people actually use. */
    cheaperThanPythonPct: savedPct(tinypivot.largeCost!, python.largeCost!),
    /** The same on the small file, where the gap is narrower. */
    cheaperThanPythonSmallPct: savedPct(tinypivot.smallCost, python.smallCost),
    cheaperThanPastingPct: savedPct(tinypivot.smallCost, paste.smallCost),
    correct: tinypivot.correct,
    pythonCorrect: python.correct,
    pastedCorrect: paste.correct,
    questions: BENCHMARK.questions,
    largeRows: BENCHMARK.largeRows,
  }
}
