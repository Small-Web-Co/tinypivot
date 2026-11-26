// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runAbTest, runAnalysis, runAnomalyDetection, runCohortRetention, runRegression } from '../../packages/mcp/src/analyze'
import { DatasetStore } from '../../packages/mcp/src/store'
import { FEATURE_TIERS, hasFeature } from '../../packages/mcp/src/tiers'

describe('unified Data Science Shelf (`analyze`) & Fungible Tier Gates', () => {
  it('enforces the centralized Free vs Pro feature map', () => {
    expect(FEATURE_TIERS.audit_basic).toBe('free')
    expect(FEATURE_TIERS.analyze_basic).toBe('free')
    expect(FEATURE_TIERS.audit_deep).toBe('pro')
    expect(FEATURE_TIERS.analyze_pro).toBe('pro')
    expect(FEATURE_TIERS.recursive_memory).toBe('pro')

    expect(hasFeature(false, 'analyze_basic')).toBe(true)
    expect(hasFeature(false, 'analyze_pro')).toBe(false)
    expect(hasFeature(true, 'analyze_pro')).toBe(true)
  })

  it('ab_test detects SRM broken randomization and Holm-Bonferroni false positives in Pro mode while remaining clean in Free', () => {
    const store = new DatasetStore()
    // Broken 54% / 46% traffic split across 12 segments; 11 segments null, 1 segment barely p~0.02 unadjusted (fails Holm-Bonferroni!)
    const rows: Record<string, unknown>[] = []
    for (let seg = 1; seg <= 12; seg++) {
      const segName = `Seg-${String(seg).padStart(2, '0')}`
      const cTrials = 460
      const tTrials = 540
      // Segment 7 has a tiny random blip (raw p ~ 0.021, Holm p = 0.25 -> false positive!)
      const cSucc = seg === 7 ? 36 : 46
      const tSucc = seg === 7 ? 66 : 54
      rows.push({ segment: segName, variant: 'control', trials: cTrials, converted: cSucc })
      rows.push({ segment: segName, variant: 'treatment', trials: tTrials, converted: tSucc })
    }
    const ds = store.register({ id: 'exp', name: 'Experiment', source: 'exp.csv', rows })

    const freeOut = runAbTest(ds, { method: 'ab_test', variantField: 'variant', successField: 'converted', trialsField: 'trials' }, { proGuards: false })
    expect(freeOut.flags).toEqual([])
    expect(freeOut.summaryText).not.toContain('SAMPLE RATIO MISMATCH')

    const proOut = runAbTest(ds, { method: 'ab_test', variantField: 'variant', successField: 'converted', trialsField: 'trials', segmentField: 'segment' }, { proGuards: true })
    expect(proOut.flags).toContain('srm_detected')
    expect(proOut.flags).toContain('multiple_testing_false_positive')
    expect(proOut.summaryText).toContain('SAMPLE RATIO MISMATCH')
    expect(proOut.summaryText).toContain('FAILED Holm-Bonferroni')
  })

  it('regression detects confounding sign reversal when controlling for customer health_score', () => {
    const store = new DatasetStore()
    // True DGP: renewal_prob = 0.20 + 0.08 * discount + 0.007 * health_score
    // Confounding: at-risk accounts (low health_score) get discounts 80% of the time; healthy accounts get discounts 10% of the time!
    // Naive bivariate slope of discount is strongly NEGATIVE; controlled OLS recovers positive +0.08!
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < 400; i++) {
      const atRisk = i < 200
      const health = atRisk ? 20 + (i % 20) : 75 + (i % 20)
      const discount = atRisk ? (i % 5 !== 0 ? 1 : 0) : (i % 10 === 0 ? 1 : 0)
      const noise = ((i * 37) % 11 - 5) * 0.004
      const renewed = 0.15 + 0.08 * discount + 0.007 * health + noise
      rows.push({ account_id: `A${i}`, discount, health_score: health, renewed })
    }
    const ds = store.register({ id: 'renewals', name: 'Renewals', source: 'renewals.csv', rows })

    const out = runRegression(ds, {
      method: 'regression',
      target: 'renewed',
      features: ['discount'],
      controls: ['health_score'],
    })
    expect(out.flags).toContain('confounding_sign_reversal')
    expect(out.summaryText).toContain('CONFOUNDING / SIGN REVERSAL')
    const discRow = out.rows.find(r => r.predictor === 'discount')
    expect(Number(discRow?.coefficient)).toBeGreaterThan(0.06)
    expect(Number(discRow?.coefficient)).toBeLessThan(0.10)
  })

  it('cohort_retention masks immature trailing periods as null instead of 0%', () => {
    const store = new DatasetStore()
    // Users join in Jan, Feb, Mar, Apr; data ends in Apr (2026-04).
    // Jan cohort has M0..M3 matured; Apr cohort ONLY has M0 matured (M1..M3 must be null!).
    const rows: Record<string, unknown>[] = []
    for (let u = 1; u <= 20; u++) {
      rows.push({ user_id: `J${u}`, event_date: '2026-01-05' })
      if (u <= 12)
        rows.push({ user_id: `J${u}`, event_date: '2026-02-05' })
      if (u <= 10)
        rows.push({ user_id: `J${u}`, event_date: '2026-03-05' })
      if (u <= 8)
        rows.push({ user_id: `J${u}`, event_date: '2026-04-05' })
    }
    for (let u = 1; u <= 20; u++) {
      rows.push({ user_id: `A${u}`, event_date: '2026-04-03' })
    }
    const ds = store.register({ id: 'events', name: 'Events', source: 'events.csv', rows })

    const out = runCohortRetention(ds, { method: 'cohort_retention', entityField: 'user_id', dateField: 'event_date' })
    expect(out.flags).toContain('right_censored_cohorts')
    const jan = out.rows.find(r => r.cohort === '2026-01')
    const apr = out.rows.find(r => r.cohort === '2026-04')
    expect(jan?.M3).toBe(40)
    expect(apr?.M0).toBe(100)
    expect(apr?.M1).toBeNull()
    expect(apr?.M3).toBeNull()
    expect(out.summaryText).toContain('RIGHT-CENSORING GUARD')
  })

  it('anomalies detects a structural level shift hidden inside strong weekday/weekend seasonality', () => {
    const store = new DatasetStore()
    // 60 days starting 2026-01-01: weekdays ~1000, weekends ~400 (huge 60% weekend dip!)
    // Starting day 35 (2026-02-05), baseline drops -18% structurally across all days.
    const rows: Record<string, unknown>[] = []
    const start = Date.UTC(2026, 0, 1)
    for (let d = 0; d < 60; d++) {
      const dt = new Date(start + d * 86400_000)
      const dayStr = dt.toISOString().slice(0, 10)
      const dow = dt.getUTCDay()
      const base = (dow === 0 || dow === 6) ? 400 : 1000
      const shift = d >= 35 ? -180 : 0
      const jitter = ((d * 13) % 9 - 4) * 3
      rows.push({ day: dayStr, orders: base + shift + jitter })
    }
    const ds = store.register({ id: 'daily', name: 'Daily Orders', source: 'daily.csv', rows })

    const out = runAnomalyDetection(ds, { method: 'anomalies', dateField: 'day', metric: 'orders' })
    expect(out.flags).toContain('structural_changepoint')
    expect(out.summaryText).toContain('STRUCTURAL CHANGE-POINT DETECTED')
    expect(out.summaryText).toContain('2026-02-05')
  })

  it('dispatches explain_change and zero-param auto-inference cleanly through runAnalysis', () => {
    const store = new DatasetStore()
    const ds = store.register({
      id: 'rev',
      name: 'Rev',
      source: 'rev.csv',
      rows: [
        { period: 'Q3', region: 'West', revenue: 100 },
        { period: 'Q4', region: 'West', revenue: 140 },
      ],
    })
    // Zero-param explain_change auto-infers periodField, fromPeriod, toPeriod, and metric!
    const out = runAnalysis(ds, { method: 'explain_change' }, { proGuards: false })
    expect(out.method).toBe('explain_change')
    expect(out.summaryText).toContain('+40')

    // Zero-param ab_test auto-infers variantField, successField, trialsField!
    const exp = store.register({
      id: 'exp_auto',
      name: 'Exp',
      source: 'exp.csv',
      rows: [
        { variant: 'control', trials: 4600, converted: 460 },
        { variant: 'treatment', trials: 5400, converted: 540 },
      ],
    })
    const ab = runAnalysis(exp, { method: 'ab_test' }, { proGuards: true })
    expect(ab.flags).toContain('srm_detected')
  })
})
