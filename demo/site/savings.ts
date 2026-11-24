/**
 * Token-savings model shared by the homepage receipt and the /docs calculator.
 *
 * Assumptions (stated on /docs#savings):
 * - ~5 tokens per tabular cell (~20 bytes ÷ 4 chars/token).
 * - Each follow-up re-reads the pasted rows: 10% of input price with prompt caching, 100% without.
 * - Each follow-up makes the model rewrite a table or chart: ~600 output tokens.
 * - With TinyPivot only a ~200-token schema summary enters context; follow-ups are local clicks.
 */

export const TOKENS_PER_CELL = 5
export const CACHED_REREAD_FACTOR = 0.1
export const OUTPUT_TOKENS_PER_REWRITE = 600
export const SCHEMA_SUMMARY_TOKENS = 200

export interface Workload {
  rows: number
  cols: number
  followUps: number
  cached: boolean
}

export interface TokenEstimate {
  pasted: number
  rereads: number
  rewrites: number
  withoutInput: number
  withInput: number
  inputSaved: number
  outputSaved: number
  totalSaved: number
  savedShare: number
}

export function estimateTokens({ rows, cols, followUps, cached }: Workload): TokenEstimate {
  const repeat = cached ? CACHED_REREAD_FACTOR : 1
  const pasted = rows * cols * TOKENS_PER_CELL
  const rereads = pasted * followUps * repeat
  const rewrites = followUps * OUTPUT_TOKENS_PER_REWRITE
  const withoutInput = pasted + rereads
  const withInput = SCHEMA_SUMMARY_TOKENS * (1 + followUps * repeat)
  const inputSaved = Math.max(0, withoutInput - withInput)
  const outputSaved = rewrites
  const totalSaved = inputSaved + outputSaved
  const without = withoutInput + rewrites
  return {
    pasted,
    rereads,
    rewrites,
    withoutInput,
    withInput,
    inputSaved,
    outputSaved,
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
  return (estimate.inputSaved / 1_000_000) * rate.input + (estimate.outputSaved / 1_000_000) * rate.output
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
