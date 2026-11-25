import { describe, expect, it } from 'vitest'
import { benchmarkHeadline, benchmarkSetups, centsPerQuestion } from '../../demo/site/benchmark'
import {
  estimateTokens,
  formatTokens,
  formatUsd,
  TOOL_REPLY_TOKENS,
  usdSavedPerAnalysis,
} from '../../demo/site/savings'

describe('estimateTokens', () => {
  it('matches the homepage receipt example (2,000 × 6, 5 cached follow-ups)', () => {
    const e = estimateTokens({ rows: 2000, cols: 6, followUps: 5, cached: true })
    expect(e.pasted).toBe(60_000)
    expect(e.rereads).toBe(30_000)
    expect(e.rewrites).toBe(3_000)
    // Six tool replies of 550, plus 15 earlier replies re-read at 10%.
    expect(e.withInput).toBe(4_125)
    // Six answers that each reprint a 400-token card.
    expect(e.withOutput).toBe(2_400)
    expect(e.totalSaved).toBe(86_475)
    expect(e.savedShare).toBeCloseTo(86_475 / 93_000)
  })

  it('charges full re-reads when prompt caching is off', () => {
    const e = estimateTokens({ rows: 100, cols: 10, followUps: 2, cached: false })
    expect(e.rereads).toBe(10_000)
    // Three replies, plus the first re-read once and the second re-read once more.
    expect(e.withInput).toBe(TOOL_REPLY_TOKENS * (3 + 3))
  })

  it('reports no saving, never a negative one, when the result is tiny', () => {
    const e = estimateTokens({ rows: 1, cols: 1, followUps: 0, cached: true })
    expect(e.inputSaved).toBe(0)
    expect(e.outputSaved).toBeLessThan(0)
    expect(e.totalSaved).toBe(0)
    expect(e.savedShare).toBe(0)
    expect(usdSavedPerAnalysis(e, { name: 'test', input: 2, output: 10 })).toBe(0)
  })
})

describe('usdSavedPerAnalysis', () => {
  it('prices input and output tokens separately', () => {
    const e = estimateTokens({ rows: 2000, cols: 6, followUps: 5, cached: true })
    const usd = usdSavedPerAnalysis(e, { name: 'test', input: 2, output: 10 })
    expect(usd).toBeCloseTo((85_875 / 1e6) * 2 + (600 / 1e6) * 10)
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

describe('measured benchmark headline', () => {
  it('rounds every comparison down, and reports right answers as measured', () => {
    const headline = benchmarkHeadline()
    // 0.167 against 0.197 is 15.2% cheaper; 0.162 against 0.181 is 10.5%; 0.162 against 0.320 is 49.4%.
    expect(headline.cheaperThanPythonPct).toBe(15)
    expect(headline.cheaperThanPythonSmallPct).toBe(10)
    expect(headline.cheaperThanPastingPct).toBe(49)
    expect([headline.correct, headline.pythonCorrect, headline.pastedCorrect]).toEqual([3, 3, 1])
  })

  it('shows cost per question in cents', () => {
    const tinypivot = benchmarkSetups.find(s => s.id === 'tinypivot')!
    expect(centsPerQuestion(tinypivot.largeCost!)).toBe('5.6¢')
  })
})
