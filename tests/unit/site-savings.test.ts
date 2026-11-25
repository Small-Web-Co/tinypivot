import { describe, expect, it } from 'vitest'
import {
  estimateTokens,
  EXAMPLE_RATE,
  exampleSavings,
  formatTokens,
  formatUsd,
  SCHEMA_SUMMARY_TOKENS,
  usdSavedPerAnalysis,
} from '../../demo/site/savings'

describe('estimateTokens', () => {
  it('matches the homepage receipt example (2,000 × 6, 5 cached follow-ups)', () => {
    const e = estimateTokens({ rows: 2000, cols: 6, followUps: 5, cached: true })
    expect(e.pasted).toBe(60_000)
    expect(e.rereads).toBe(30_000)
    expect(e.rewrites).toBe(3_000)
    expect(e.withInput).toBe(300)
    expect(e.totalSaved).toBe(92_700)
    expect(e.savedShare).toBeCloseTo(92_700 / 93_000)
  })

  it('charges full re-reads when prompt caching is off', () => {
    const e = estimateTokens({ rows: 100, cols: 10, followUps: 2, cached: false })
    expect(e.rereads).toBe(10_000)
    expect(e.withInput).toBe(SCHEMA_SUMMARY_TOKENS * 3)
  })

  it('never reports negative input savings for tiny results', () => {
    const e = estimateTokens({ rows: 1, cols: 1, followUps: 0, cached: true })
    expect(e.inputSaved).toBe(0)
    expect(e.totalSaved).toBe(0)
    expect(e.savedShare).toBe(0)
  })
})

describe('usdSavedPerAnalysis', () => {
  it('prices input and output tokens separately', () => {
    const e = estimateTokens({ rows: 2000, cols: 6, followUps: 5, cached: true })
    const usd = usdSavedPerAnalysis(e, { name: 'test', input: 2, output: 10 })
    expect(usd).toBeCloseTo((89_700 / 1e6) * 2 + (3_000 / 1e6) * 10)
  })
})

describe('formatters', () => {
  it('formats tokens compactly', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(9_500)).toBe('9,500')
    expect(formatTokens(92_700)).toBe('93k')
    expect(formatTokens(2_400_000)).toBe('2.4M')
  })

  it('formats dollars by magnitude', () => {
    expect(formatUsd(0.184)).toBe('$0.18')
    expect(formatUsd(42.6)).toBe('$43')
    expect(formatUsd(12_345.6)).toBe('$12,346')
  })
})

describe('homepage headline figures', () => {
  it('come from the worked example at a named model price', () => {
    const savings = exampleSavings()
    expect(EXAMPLE_RATE.name).toBe('Claude Opus 5.5')
    expect(savings.tokensWithout).toBe(93_000)
    expect(savings.tokensWith).toBe(300)
    // 89,700 input tokens at $4/M plus 3,000 output tokens at $20/M.
    expect(savings.usd).toBeCloseTo(0.4188)
  })

  it('round the percentage down so the claim never overstates', () => {
    expect(exampleSavings().percent).toBe(99.6)
    expect(exampleSavings().percent).toBeLessThanOrEqual((92_700 / 93_000) * 100)
  })
})
