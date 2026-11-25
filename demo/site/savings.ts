/**
 * Token-savings model for pasting rows into chat, used by the homepage receipt and the /docs
 * calculator. Assumptions are stated on /docs#savings. Measured results are in benchmark.ts.
 *
 * Without TinyPivot:
 * - ~5 tokens per tabular cell pasted into the conversation.
 * - Each follow-up re-reads the pasted rows: 10% of input price with prompt caching, 100% without.
 * - Each follow-up makes the model rewrite a table or chart: ~600 output tokens.
 *
 * With TinyPivot (measured on a 2,000-row, 6-column file):
 * - Every question, the first and each follow-up, is one tool call whose reply adds ~550 tokens:
 *   a chart or pivot card plus column notes.
 * - Later questions re-read the earlier replies, cached the same way as the rows above.
 * - In a terminal the model reprints the card in its answer: ~400 output tokens per question.
 */

export const TOKENS_PER_CELL = 5
export const CACHED_REREAD_FACTOR = 0.1
export const OUTPUT_TOKENS_PER_REWRITE = 600
export const TOOL_REPLY_TOKENS = 550
export const CARD_ECHO_TOKENS = 400

export interface Workload {
  rows: number
  cols: number
  followUps: number
  cached: boolean
}

/** The worked example used by the homepage receipt. */
export const EXAMPLE_WORKLOAD: Workload = { rows: 2000, cols: 6, followUps: 5, cached: true }

export interface TokenEstimate {
  /** Without TinyPivot: the rows pasted in once. */
  pasted: number
  /** Without TinyPivot: the rows re-read on each follow-up. */
  rereads: number
  /** Without TinyPivot: tables the model writes out on each follow-up (output tokens). */
  rewrites: number
  withoutInput: number
  /** With TinyPivot: tool replies, plus their re-reads on later questions. */
  withInput: number
  /** With TinyPivot: chart cards the model reprints (output tokens). */
  withOutput: number
  inputSaved: number
  /** Output tokens avoided; negative when reprinted cards outweigh the tables not rewritten. */
  outputSaved: number
  /** Never below zero: for a handful of rows there is simply nothing to save. */
  totalSaved: number
  savedShare: number
}

export function estimateTokens({ rows, cols, followUps, cached }: Workload): TokenEstimate {
  const repeat = cached ? CACHED_REREAD_FACTOR : 1
  const questions = 1 + followUps
  const pasted = rows * cols * TOKENS_PER_CELL
  const rereads = pasted * followUps * repeat
  const rewrites = followUps * OUTPUT_TOKENS_PER_REWRITE
  const withoutInput = pasted + rereads
  // Question n re-reads the n - 1 replies before it: 0 + 1 + ... + followUps in all.
  const earlierReplies = (followUps * (followUps + 1)) / 2
  const withInput = TOOL_REPLY_TOKENS * (questions + earlierReplies * repeat)
  const withOutput = CARD_ECHO_TOKENS * questions
  const without = withoutInput + rewrites
  const totalSaved = Math.max(0, without - withInput - withOutput)
  return {
    pasted,
    rereads,
    rewrites,
    withoutInput,
    withInput,
    withOutput,
    inputSaved: Math.max(0, withoutInput - withInput),
    outputSaved: rewrites - withOutput,
    totalSaved,
    savedShare: without === 0 ? 0 : totalSaved / without,
  }
}

export interface ModelRate {
  name: string
  /** USD per million input tokens */
  input: number
  /** USD per million output tokens */
  output: number
}

export const modelRates: readonly ModelRate[] = [
  { name: 'GPT-5', input: 1.75, output: 10 },
  { name: 'Claude Sonnet 5.5', input: 2, output: 10 },
  { name: 'Gemini 4 Neon', input: 3, output: 15 },
  { name: 'Claude Opus 5.5', input: 4, output: 20 },
  { name: 'Frontier reasoning', input: 8, output: 32 },
]

export const WEEKS_PER_MONTH = 4.33

export function usdSavedPerAnalysis(estimate: TokenEstimate, rate: ModelRate): number {
  const saved = (estimate.inputSaved / 1_000_000) * rate.input + (estimate.outputSaved / 1_000_000) * rate.output
  return Math.max(0, saved)
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000)
    return `${Math.round(n / 1_000)}k`
  return Math.round(n).toLocaleString('en-US')
}

export function formatUsd(n: number): string {
  if (n >= 1000)
    return `$${Math.round(n).toLocaleString('en-US')}`
  if (n >= 10)
    return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}
