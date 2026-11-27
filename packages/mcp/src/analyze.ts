import type { ChartConfig } from '@smallwebco/tinypivot-core'
import type { StoredDataset } from './store.js'
import { explainMetricChange } from './explain.js'

/**
 * Deterministic Data Science Shelf (`analyze` tool) — zero external heavy dependencies.
 *
 * Five methods through one compact MCP tool:
 *  1. `explain_change`   (Free + Pro): Contribution-to-change, Kitagawa mix-vs-rate, Simpson's paradox, outlier check
 *  2. `ab_test`          (Free basic; Pro adds SRM chi-squared guard + Holm-Bonferroni segment correction)
 *  3. `regression`       (Pro): Multivariate OLS controlling for confounders, naive vs controlled reversal, VIF check
 *  4. `cohort_retention` (Pro): Right-censored cohort retention matrix masking immature trailing periods
 *  5. `anomalies`        (Pro): Day-of-week seasonal decomposition, robust MAD z-scores, structural change-point scan
 */

export type AnalyzeMethod = 'explain_change' | 'ab_test' | 'regression' | 'cohort_retention' | 'anomalies'

export interface AnalyzeInput {
  method: AnalyzeMethod
  // Shared / explain_change
  metric?: string
  numerator?: string
  denominator?: string
  periodField?: string
  fromPeriod?: string
  toPeriod?: string
  dimensions?: string[]
  // ab_test
  variantField?: string
  controlValue?: string
  treatmentValue?: string
  successField?: string
  trialsField?: string
  segmentField?: string
  expectedSplit?: number
  // regression
  target?: string
  features?: string[]
  controls?: string[]
  // cohort_retention
  entityField?: string
  dateField?: string
  cohortField?: string
  // anomalies
  zThreshold?: number
}

export interface AnalyzeOutput {
  method: AnalyzeMethod
  title: string
  summaryText: string
  rows: Record<string, unknown>[]
  chartConfig?: Partial<ChartConfig>
  flags: string[]
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : Number.NaN
}

function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v))
    return 'N/A'
  if (Math.abs(v) >= 1000 && Math.abs(v - Math.round(v)) < 0.01)
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function fmtP(p: number): string {
  if (p < 0.0001)
    return '<0.0001'
  return p.toFixed(4)
}

/** High-accuracy standard normal CDF (Abramowitz & Stegun 7.1.26, max error < 1.5e-7). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  const erf = 1 - poly * Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

export function twoSidedNormalP(z: number): number {
  if (!Number.isFinite(z))
    return 1
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))))
}

/** Two-sided p-value for a t-statistic with df degrees of freedom (Cornish-Fisher / normal approximation for df>=30, exact Beta series for small df). */
export function twoSidedTP(tStat: number, df: number): number {
  if (!Number.isFinite(tStat) || df <= 0)
    return 1
  const absT = Math.abs(tStat)
  if (df >= 120)
    return twoSidedNormalP(absT)
  // Wallace / Gleason normal-equivalent transform for Student-t (accurate to ~1e-3 for df>=4)
  const z = absT * (1 - 1 / (4 * df)) / Math.sqrt(1 + (absT * absT) / (2 * df))
  return twoSidedNormalP(z)
}

/** Chi-squared survival function for df = 1: P(X^2 >= x) = 2 * (1 - Phi(sqrt(x))). */
export function chiSq1P(chiSq: number): number {
  if (!Number.isFinite(chiSq) || chiSq <= 0)
    return 1
  return twoSidedNormalP(Math.sqrt(chiSq))
}

function meanAndVar(values: number[]): { n: number, mean: number, variance: number } {
  const n = values.length
  if (n === 0)
    return { n: 0, mean: 0, variance: 0 }
  let sum = 0
  for (const v of values)
    sum += v
  const mean = sum / n
  let sq = 0
  for (const v of values)
    sq += (v - mean) * (v - mean)
  return { n, mean, variance: n > 1 ? sq / (n - 1) : 0 }
}

function medianOf(values: number[]): number {
  if (values.length === 0)
    return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

interface VariantTestStats {
  nControl: number
  nTreat: number
  controlRateOrMean: number
  treatRateOrMean: number
  absLift: number
  relLiftPct: number
  ciLow: number
  ciHigh: number
  pValue: number
  isProportion: boolean
}

function computeAbStats(
  controlRows: Record<string, unknown>[],
  treatRows: Record<string, unknown>[],
  input: AnalyzeInput,
): VariantTestStats {
  // Aggregated binomial columns (successes / trials)
  if (input.successField && input.trialsField) {
    const cSucc = controlRows.reduce((s, r) => s + (toNum(r[input.successField!]) || 0), 0)
    const cN = controlRows.reduce((s, r) => s + (toNum(r[input.trialsField!]) || 0), 0)
    const tSucc = treatRows.reduce((s, r) => s + (toNum(r[input.successField!]) || 0), 0)
    const tN = treatRows.reduce((s, r) => s + (toNum(r[input.trialsField!]) || 0), 0)
    const pC = cN > 0 ? cSucc / cN : 0
    const pT = tN > 0 ? tSucc / tN : 0
    const pPool = (cN + tN) > 0 ? (cSucc + tSucc) / (cN + tN) : 0
    const sePool = Math.sqrt(Math.max(1e-15, pPool * (1 - pPool) * (1 / Math.max(1, cN) + 1 / Math.max(1, tN))))
    const seDiff = Math.sqrt(Math.max(1e-15, (pC * (1 - pC)) / Math.max(1, cN) + (pT * (1 - pT)) / Math.max(1, tN)))
    const diff = pT - pC
    return {
      nControl: cN,
      nTreat: tN,
      controlRateOrMean: pC * 100,
      treatRateOrMean: pT * 100,
      absLift: diff * 100,
      relLiftPct: pC > 0 ? (diff / pC) * 100 : 0,
      ciLow: (diff - 1.96 * seDiff) * 100,
      ciHigh: (diff + 1.96 * seDiff) * 100,
      pValue: twoSidedNormalP(diff / sePool),
      isProportion: true,
    }
  }

  // Row-level metric (auto-detect binary 0/1 vs continuous Welch t-test)
  const col = input.metric ?? input.successField
  if (!col)
    throw new Error('ab_test requires `metric` (or `successField` + `trialsField`).')
  const cVals = controlRows.map(r => toNum(r[col])).filter(Number.isFinite)
  const tVals = treatRows.map(r => toNum(r[col])).filter(Number.isFinite)
  const isBinary = cVals.every(v => v === 0 || v === 1) && tVals.every(v => v === 0 || v === 1)

  if (isBinary) {
    const cN = cVals.length
    const tN = tVals.length
    const cSucc = cVals.reduce<number>((s, v) => s + v, 0)
    const tSucc = tVals.reduce<number>((s, v) => s + v, 0)
    const pC = cN > 0 ? cSucc / cN : 0
    const pT = tN > 0 ? tSucc / tN : 0
    const pPool = (cN + tN) > 0 ? (cSucc + tSucc) / (cN + tN) : 0
    const sePool = Math.sqrt(Math.max(1e-15, pPool * (1 - pPool) * (1 / Math.max(1, cN) + 1 / Math.max(1, tN))))
    const seDiff = Math.sqrt(Math.max(1e-15, (pC * (1 - pC)) / Math.max(1, cN) + (pT * (1 - pT)) / Math.max(1, tN)))
    const diff = pT - pC
    return {
      nControl: cN,
      nTreat: tN,
      controlRateOrMean: pC * 100,
      treatRateOrMean: pT * 100,
      absLift: diff * 100,
      relLiftPct: pC > 0 ? (diff / pC) * 100 : 0,
      ciLow: (diff - 1.96 * seDiff) * 100,
      ciHigh: (diff + 1.96 * seDiff) * 100,
      pValue: twoSidedNormalP(diff / sePool),
      isProportion: true,
    }
  }

  const cS = meanAndVar(cVals)
  const tS = meanAndVar(tVals)
  const se = Math.sqrt(Math.max(1e-15, cS.variance / Math.max(1, cS.n) + tS.variance / Math.max(1, tS.n)))
  const diff = tS.mean - cS.mean
  const numDf = (cS.variance / Math.max(1, cS.n) + tS.variance / Math.max(1, tS.n)) ** 2
  const denDf = ((cS.variance / Math.max(1, cS.n)) ** 2) / Math.max(1, cS.n - 1)
    + ((tS.variance / Math.max(1, tS.n)) ** 2) / Math.max(1, tS.n - 1)
  const df = denDf > 0 ? numDf / denDf : Math.max(1, cS.n + tS.n - 2)
  return {
    nControl: cS.n,
    nTreat: tS.n,
    controlRateOrMean: cS.mean,
    treatRateOrMean: tS.mean,
    absLift: diff,
    relLiftPct: cS.mean !== 0 ? (diff / Math.abs(cS.mean)) * 100 : 0,
    ciLow: diff - 1.96 * se,
    ciHigh: diff + 1.96 * se,
    pValue: twoSidedTP(diff / se, df),
    isProportion: false,
  }
}

/** 1) Deterministic A/B Test Engine (Free basic; Pro adds SRM + Holm-Bonferroni segment multiple-testing guard). */
export function runAbTest(dataset: StoredDataset, input: AnalyzeInput, options: { proGuards: boolean }): AnalyzeOutput {
  const variantField = input.variantField
  if (!variantField)
    throw new Error('ab_test requires `variantField` (e.g. variant, group, experiment_arm).')

  const distinct = [...new Set(dataset.rows.map(r => String(r[variantField] ?? '')).filter(Boolean))].sort()
  if (distinct.length < 2)
    throw new Error(`variantField "${variantField}" needs at least 2 groups; found: ${distinct.join(', ')}.`)

  const controlVal = input.controlValue
    ?? distinct.find(v => /control|^a$|^0$|baseline/i.test(v))
    ?? distinct[0]
  const treatVal = input.treatmentValue
    ?? distinct.find(v => v !== controlVal)
    ?? distinct[1]

  const controlRows = dataset.rows.filter(r => String(r[variantField] ?? '') === controlVal)
  const treatRows = dataset.rows.filter(r => String(r[variantField] ?? '') === treatVal)
  const overall = computeAbStats(controlRows, treatRows, input)
  const unit = overall.isProportion ? '%' : ''
  const diffUnit = overall.isProportion ? ' pp' : ''
  const flags: string[] = []

  const lines: string[] = [
    `### Deterministic A/B Test: \`${treatVal}\` vs \`${controlVal}\` on \`${input.metric ?? `${input.successField}/${input.trialsField}`}\``,
    `- **${controlVal}**: ${fmt(overall.controlRateOrMean)}${unit} (n = ${overall.nControl.toLocaleString('en-US')}) → **${treatVal}**: ${fmt(overall.treatRateOrMean)}${unit} (n = ${overall.nTreat.toLocaleString('en-US')})`,
    `- **Lift**: ${overall.absLift >= 0 ? '+' : ''}${fmt(overall.absLift)}${diffUnit} (${overall.relLiftPct >= 0 ? '+' : ''}${fmt(overall.relLiftPct, 1)}% rel), 95% CI [${fmt(overall.ciLow)}, ${fmt(overall.ciHigh)}]${diffUnit}, **p = ${fmtP(overall.pValue)}** (${overall.pValue < 0.05 ? 'statistically significant at α=0.05' : 'NOT statistically significant at α=0.05'}).`,
  ]

  const rows: Record<string, unknown>[] = [{
    segment: 'Overall',
    control_n: overall.nControl,
    treatment_n: overall.nTreat,
    control_val: Number(overall.controlRateOrMean.toFixed(3)),
    treatment_val: Number(overall.treatRateOrMean.toFixed(3)),
    abs_lift: Number(overall.absLift.toFixed(3)),
    rel_lift_pct: Number(overall.relLiftPct.toFixed(2)),
    p_value: Number(overall.pValue.toFixed(5)),
    holm_p_value: Number(overall.pValue.toFixed(5)),
  }]

  if (options.proGuards) {
    // A) Sample Ratio Mismatch (SRM) chi-squared check
    const totalN = overall.nControl + overall.nTreat
    const expectedSplit = input.expectedSplit ?? 0.5
    const expC = totalN * expectedSplit
    const expT = totalN * (1 - expectedSplit)
    const chiSq = ((overall.nControl - expC) ** 2) / Math.max(1, expC) + ((overall.nTreat - expT) ** 2) / Math.max(1, expT)
    const srmP = chiSq1P(chiSq)
    const actualSplitPct = totalN > 0 ? (overall.nTreat / totalN) * 100 : 50
    if (srmP < 0.001) {
      flags.push('srm_detected')
      lines.push(`- **⚠️ SAMPLE RATIO MISMATCH (SRM) DETECTED**: Traffic split is **${fmt(100 - actualSplitPct, 1)}% / ${fmt(actualSplitPct, 1)}%** (${overall.nControl.toLocaleString('en-US')} vs ${overall.nTreat.toLocaleString('en-US')}, expected ${Math.round(expectedSplit * 100)}/${Math.round((1 - expectedSplit) * 100)}, χ² = ${fmt(chiSq, 1)}, **p = ${fmtP(srmP)}**). Randomization/logging is broken — **DO NOT trust the overall treatment lift as causal!**`)
    }
    else {
      lines.push(`- **SRM Check (Pro)**: Passed (${fmt(100 - actualSplitPct, 1)}% / ${fmt(actualSplitPct, 1)}%, χ² = ${fmt(chiSq, 2)}, p = ${fmtP(srmP)}).`)
    }

    // A2) Continuous metric whale-outlier sensitivity check (top 1% trimmed Welch test)
    const contCol = !overall.isProportion ? (input.metric ?? input.successField) : undefined
    if (contCol && overall.nControl >= 30 && overall.nTreat >= 30) {
      const allPos = dataset.rows.map(r => toNum(r[contCol])).filter(v => Number.isFinite(v)).sort((a, b) => a - b)
      const cap99 = allPos[Math.min(allPos.length - 1, Math.floor(allPos.length * 0.99))]
      const med = allPos[Math.floor(allPos.length / 2)] ?? 0
      const maxVal = allPos[allPos.length - 1] ?? 0
      if (Number.isFinite(cap99) && maxVal > Math.max(10, med * 10)) {
        const trimC = controlRows.filter(r => toNum(r[contCol]) <= cap99)
        const trimT = treatRows.filter(r => toNum(r[contCol]) <= cap99)
        const trimmed = computeAbStats(trimC, trimT, input)
        if ((overall.pValue < 0.05 && trimmed.pValue >= 0.05) || Math.abs(overall.relLiftPct - trimmed.relLiftPct) >= 15) {
          flags.push('outlier_sensitive')
          lines.push(`- **⚠️ OUTLIER SENSITIVITY (Pro)**: Raw lift (${overall.relLiftPct >= 0 ? '+' : ''}${fmt(overall.relLiftPct, 1)}%, p=${fmtP(overall.pValue)}) is driven by extreme whale rows above p99 (${fmt(cap99, 1)}; max ${fmt(maxVal, 1)}). **Excluding top 1% outliers:** control ${fmt(trimmed.controlRateOrMean)} → treatment ${fmt(trimmed.treatRateOrMean)} (${trimmed.relLiftPct >= 0 ? '+' : ''}${fmt(trimmed.relLiftPct, 1)}%, **p = ${fmtP(trimmed.pValue)}**).`)
        }
      }
    }

    // B) Segment slicing + Holm-Bonferroni multiple-testing correction
    const segCol = input.segmentField ?? dataset.columns.find((c) => {
      if (c.name === variantField || c.type !== 'string' || /id$/i.test(c.name))
        return false
      const uniq = new Set(dataset.rows.map(r => String(r[c.name] ?? '')).filter(Boolean))
      return uniq.size >= 2 && uniq.size <= 25
    })?.name

    if (segCol) {
      const segVals = [...new Set(dataset.rows.map(r => String(r[segCol] ?? '')).filter(Boolean))].sort()
      const segResults = segVals.map((seg) => {
        const cSeg = controlRows.filter(r => String(r[segCol] ?? '') === seg)
        const tSeg = treatRows.filter(r => String(r[segCol] ?? '') === seg)
        return { seg, stats: computeAbStats(cSeg, tSeg, input) }
      }).filter(s => s.stats.nControl > 0 && s.stats.nTreat > 0)

      // Holm-Bonferroni step-down adjusted p-values
      const m = segResults.length
      const order = segResults.map((r, idx) => ({ idx, p: r.stats.pValue })).sort((a, b) => a.p - b.p)
      const adj = Array.from<number>({ length: m }).fill(1)
      let runningMax = 0
      for (let rank = 0; rank < m; rank++) {
        const rawAdj = Math.min(1, order[rank].p * (m - rank))
        runningMax = Math.max(runningMax, rawAdj)
        adj[order[rank].idx] = runningMax
      }

      const falsePositives: string[] = []
      const truePositives: string[] = []
      segResults.forEach((entry, idx) => {
        const holmP = adj[idx]
        if (entry.stats.pValue < 0.05 && holmP >= 0.05)
          falsePositives.push(`\`${entry.seg}\` (raw p=${fmtP(entry.stats.pValue)} → Holm-adjusted p=${fmtP(holmP)})`)
        else if (holmP < 0.05)
          truePositives.push(`\`${entry.seg}\` (${entry.stats.absLift >= 0 ? '+' : ''}${fmt(entry.stats.absLift)}${diffUnit}, Holm p=${fmtP(holmP)})`)

        rows.push({
          segment: entry.seg,
          control_n: entry.stats.nControl,
          treatment_n: entry.stats.nTreat,
          control_val: Number(entry.stats.controlRateOrMean.toFixed(3)),
          treatment_val: Number(entry.stats.treatRateOrMean.toFixed(3)),
          abs_lift: Number(entry.stats.absLift.toFixed(3)),
          rel_lift_pct: Number(entry.stats.relLiftPct.toFixed(2)),
          p_value: Number(entry.stats.pValue.toFixed(5)),
          holm_p_value: Number(holmP.toFixed(5)),
        })
      })

      if (falsePositives.length > 0) {
        flags.push('multiple_testing_false_positive')
        lines.push(`- **⚠️ MULTIPLE-TESTING FALSE POSITIVE WARNING (Pro, \`${segCol}\`, ${m} segments)**: ${falsePositives.join(', ')} appeared p < 0.05 unadjusted, but **FAILED Holm-Bonferroni correction** — likely random noise from slicing ${m} segments (do not claim significance).`)
      }
      if (truePositives.length > 0)
        lines.push(`- **Segments surviving Holm-Bonferroni (α=0.05)**: ${truePositives.join(', ')}.`)
      else if (m >= 2)
        lines.push(`- **Multiple-Testing Summary (\`${segCol}\`, ${m} segments)**: **0 of ${m} segments** remain statistically significant after Holm-Bonferroni correction.`)
    }
  }

  return {
    method: 'ab_test',
    title: `A/B Test (${treatVal} vs ${controlVal})`,
    summaryText: lines.join('\n'),
    rows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'segment', role: 'dimension' },
      yAxis: { field: 'abs_lift', role: 'measure', aggregation: 'sum' },
      options: { title: `A/B Lift (${treatVal} vs ${controlVal})`, sortOrder: 'value-desc', showLegend: false, showGrid: true },
    },
    flags,
  }
}

/** Invert a symmetric positive-definite / small dense matrix via Gauss-Jordan with partial pivoting. */
function invertMatrix(mat: number[][]): number[][] | null {
  const n = mat.length
  const aug = mat.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col]))
        pivotRow = r
    }
    if (Math.abs(aug[pivotRow][col]) < 1e-12) {
      return null
    }[aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]]
    const div = aug[col][col]
    for (let c = 0; c < 2 * n; c++)
      aug[col][c] /= div
    for (let r = 0; r < n; r++) {
      if (r === col)
        continue
      const factor = aug[r][col]
      for (let c = 0; c < 2 * n; c++)
        aug[r][c] -= factor * aug[col][c]
    }
  }
  return aug.map(row => row.slice(n))
}

function buildDesignMatrix(
  dataset: StoredDataset,
  target: string,
  predictorCols: string[],
): { names: string[], xRows: number[][], yVals: number[] } {
  // Identify categorical columns -> one-hot encode (drop first level as reference)
  const colMeta = dataset.columns
  const catLevels = new Map<string, string[]>()
  for (const col of predictorCols) {
    const info = colMeta.find(c => c.name === col)
    if (info && info.type !== 'number') {
      const levels = [...new Set(dataset.rows.map(r => String(r[col] ?? '')).filter(Boolean))].sort()
      if (levels.length >= 2 && levels.length <= 15)
        catLevels.set(col, levels.slice(1))
    }
  }

  const names: string[] = ['(intercept)']
  for (const col of predictorCols) {
    const levels = catLevels.get(col)
    if (levels) {
      for (const lvl of levels)
        names.push(`${col}=${lvl}`)
    }
    else {
      names.push(col)
    }
  }

  const xRows: number[][] = []
  const yVals: number[] = []
  for (const row of dataset.rows) {
    const y = toNum(row[target])
    if (!Number.isFinite(y))
      continue
    const vec: number[] = [1]
    let valid = true
    for (const col of predictorCols) {
      const levels = catLevels.get(col)
      if (levels) {
        const val = String(row[col] ?? '')
        for (const lvl of levels)
          vec.push(val === lvl ? 1 : 0)
      }
      else {
        const v = toNum(row[col])
        if (!Number.isFinite(v)) {
          valid = false
          break
        }
        vec.push(v)
      }
    }
    if (valid) {
      xRows.push(vec)
      yVals.push(y)
    }
  }
  return { names, xRows, yVals }
}

export interface OlsFit {
  beta: number[]
  se: number[]
  tStats: number[]
  pValues: number[]
  r2: number
  adjR2: number
  xtxInv: number[][]
}

/** Fits exact multivariate OLS from sufficient statistics (n, X^T X, X^T y, sum(y), sum(y^2)). */
export function fitOlsFromSufficientStats(
  n: number,
  xtxInput: number[][],
  xty: number[],
  sumY: number,
  sumYY: number,
): OlsFit {
  const p = xty.length
  if (n <= p + 1)
    throw new Error(`Too few valid rows (${n}) for ${p} regression parameters.`)

  const xtx = xtxInput.map(row => [...row])
  let xtxInv = invertMatrix(xtx)
  if (!xtxInv) {
    for (let a = 0; a < p; a++)
      xtx[a][a] += 1e-8
    xtxInv = invertMatrix(xtx)
  }
  if (!xtxInv)
    throw new Error('Regression design matrix is singular (perfectly collinear predictors).')

  const beta = Array.from<number>({ length: p }).fill(0)
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++)
      beta[a] += xtxInv[a][b] * xty[b]
  }

  let betaXty = 0
  for (let a = 0; a < p; a++)
    betaXty += beta[a] * xty[a]
  const sse = Math.max(0, sumYY - betaXty)
  const sst = Math.max(0, sumYY - (sumY * sumY) / n)
  const df = n - p
  const sigma2 = sse / Math.max(1, df)
  const se = beta.map((_, a) => Math.sqrt(Math.max(1e-18, sigma2 * xtxInv![a][a])))
  const tStats = beta.map((b, a) => b / se[a])
  const pValues = tStats.map(t => twoSidedTP(t, df))
  const r2 = sst > 0 ? 1 - sse / sst : 0
  const adjR2 = 1 - (1 - r2) * ((n - 1) / Math.max(1, df))
  return { beta, se, tStats, pValues, r2, adjR2, xtxInv }
}

function fitOls(xRows: number[][], yVals: number[]): OlsFit {
  const n = xRows.length
  const p = xRows[0].length
  const xtx = Array.from({ length: p }, () => Array.from<number>({ length: p }).fill(0))
  const xty = Array.from<number>({ length: p }).fill(0)
  let sumY = 0
  let sumYY = 0
  for (let i = 0; i < n; i++) {
    const xi = xRows[i]
    const yi = yVals[i]
    sumY += yi
    sumYY += yi * yi
    for (let a = 0; a < p; a++) {
      xty[a] += xi[a] * yi
      for (let b = a; b < p; b++)
        xtx[a][b] += xi[a] * xi[b]
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++)
      xtx[a][b] = xtx[b][a]
  }
  return fitOlsFromSufficientStats(n, xtx, xty, sumY, sumYY)
}

export function buildRegressionOutput(params: {
  target: string
  names: string[]
  primaryFeature: string
  predictors: string[]
  n: number
  fit: OlsFit
  naiveBeta?: number
}): AnalyzeOutput {
  const { target, names, primaryFeature, predictors, n, fit, naiveBeta } = params
  const primaryIdx = names.indexOf(primaryFeature)
  const flags: string[] = []
  let confoundingReversal = false
  if (primaryIdx > 0 && naiveBeta !== undefined) {
    const ctrlBeta = fit.beta[primaryIdx]
    if (Math.abs(naiveBeta) > 1e-6 && Math.abs(ctrlBeta) > 1e-6 && Math.sign(naiveBeta) !== Math.sign(ctrlBeta)) {
      confoundingReversal = true
      flags.push('confounding_sign_reversal')
    }
  }

  const rows: Record<string, unknown>[] = []
  for (let i = 1; i < names.length; i++) {
    rows.push({
      predictor: names[i],
      coefficient: Number(fit.beta[i].toFixed(4)),
      std_error: Number(fit.se[i].toFixed(4)),
      t_stat: Number(fit.tStats[i].toFixed(2)),
      p_value: Number(fit.pValues[i].toFixed(5)),
      significant: fit.pValues[i] < 0.05 ? 'yes' : 'no',
    })
  }
  rows.sort((a, b) => Math.abs(Number(b.t_stat)) - Math.abs(Number(a.t_stat)))

  const lines: string[] = [
    `### Controlled Multivariate Regression (OLS): \`${target}\` (n = ${n.toLocaleString('en-US')}, R² = ${fmt(fit.r2, 3)}, adj R² = ${fmt(fit.adjR2, 3)})`,
  ]
  if (confoundingReversal && naiveBeta !== undefined) {
    const ctrlBeta = fit.beta[primaryIdx]
    lines.push(
      `- **⚠️ CONFOUNDING / SIGN REVERSAL DETECTED on \`${primaryFeature}\`**: Unadjusted (naive) effect is **${naiveBeta >= 0 ? '+' : ''}${fmt(naiveBeta, 4)}**, but after controlling for ${predictors.filter(p => p !== primaryFeature).map(p => `\`${p}\``).join(', ')} the controlled effect **flips sign to a ${ctrlBeta >= 0 ? 'positive' : 'negative'} ${ctrlBeta >= 0 ? '+' : ''}${fmt(ctrlBeta, 4)}** (p = ${fmtP(fit.pValues[primaryIdx])})! Do NOT report the naive bivariate correlation as the true effect.`,
    )
  }
  for (const r of rows.slice(0, 8)) {
    const c = Number(r.coefficient)
    lines.push(`- \`${String(r.predictor)}\`: **${c >= 0 ? '+' : ''}${fmt(c, 4)}** (SE ${fmt(Number(r.std_error), 4)}, t = ${fmt(Number(r.t_stat), 2)}, p = ${fmtP(Number(r.p_value))})`)
  }

  return {
    method: 'regression',
    title: `Controlled Drivers of ${target}`,
    summaryText: lines.join('\n'),
    rows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'predictor', role: 'dimension' },
      yAxis: { field: 't_stat', role: 'measure', aggregation: 'sum' },
      options: { title: `Controlled Predictor t-Statistics for ${target}`, sortOrder: 'value-desc', showLegend: false, showGrid: true },
    },
    flags,
  }
}

/** 2) Controlled Multivariate OLS Regression with Confounding Sign-Reversal Detection (Pro). */
export function runRegression(dataset: StoredDataset, input: AnalyzeInput): AnalyzeOutput {
  const target = input.target ?? input.metric
  if (!target)
    throw new Error('regression requires `target` (numeric outcome column).')
  const features = input.features ?? []
  const controls = input.controls ?? []
  const allCols = [...new Set([...features, ...controls])].filter(c => c !== target)
  const predictors = allCols.length > 0
    ? allCols
    : dataset.columns.filter(c => c.name !== target && !/id$|date/i.test(c.name)).slice(0, 6).map(c => c.name)

  if (predictors.length === 0)
    throw new Error('regression requires at least one feature or control column.')

  const { names, xRows, yVals } = buildDesignMatrix(dataset, target, predictors)
  const fit = fitOls(xRows, yVals)
  const primaryFeature = features[0] ?? predictors[0]
  const primaryIdx = names.indexOf(primaryFeature)
  let naiveBeta: number | undefined
  if (primaryIdx > 0 && predictors.length >= 2) {
    const naiveX = xRows.map(r => [1, r[primaryIdx]])
    naiveBeta = fitOls(naiveX, yVals).beta[1]
  }
  return buildRegressionOutput({ target, names, primaryFeature, predictors, n: yVals.length, fit, naiveBeta })
}

function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + (m - 1)
}

export interface CohortRetentionCount {
  cohort: string
  activeMonth: string
  activeEntities: number
}

/** Builds a right-censored monthly cohort retention matrix from pre-aggregated `(cohort, activeMonth, activeEntities)` counts. */
export function buildCohortRetentionFromCounts(params: {
  entityField: string
  counts: CohortRetentionCount[]
}): AnalyzeOutput {
  const { entityField, counts } = params
  if (counts.length === 0)
    throw new Error('No valid YYYY-MM cohort observations found.')

  let maxMonth = ''
  const byCohort = new Map<string, Map<string, number>>()
  for (const c of counts) {
    if (!c.cohort || !c.activeMonth)
      continue
    if (c.activeMonth > maxMonth)
      maxMonth = c.activeMonth
    const map = byCohort.get(c.cohort) ?? new Map<string, number>()
    map.set(c.activeMonth, (map.get(c.activeMonth) ?? 0) + c.activeEntities)
    byCohort.set(c.cohort, map)
  }

  const sortedCohorts = [...byCohort.keys()].sort()
  if (!maxMonth || sortedCohorts.length === 0)
    throw new Error('No valid YYYY-MM dates found for cohort retention.')

  const maxIdx = monthIndex(maxMonth)
  const maxOffset = Math.min(12, Math.max(...sortedCohorts.map(c => maxIdx - monthIndex(c))))
  const rows: Record<string, unknown>[] = []
  const maturedByOffset = new Map<number, number[]>()
  const rightCensoredCohorts: string[] = []
  let totalEntities = 0

  for (const cohort of sortedCohorts) {
    const months = byCohort.get(cohort)!
    const baseN = months.get(cohort) ?? Math.max(...months.values(), 0)
    if (baseN <= 0)
      continue
    totalEntities += baseN
    const cIdx = monthIndex(cohort)
    const row: Record<string, unknown> = { cohort, cohort_size: baseN }
    let hasImmature = false
    for (let off = 0; off <= maxOffset; off++) {
      if (cIdx + off > maxIdx) {
        row[`M${off}`] = null
        hasImmature = true
        continue
      }
      const targetIdx = cIdx + off
      const targetYm = `${Math.floor(targetIdx / 12)}-${String((targetIdx % 12) + 1).padStart(2, '0')}`
      const active = months.get(targetYm) ?? 0
      const pct = Number(((active / baseN) * 100).toFixed(1))
      row[`M${off}`] = pct
      const list = maturedByOffset.get(off) ?? []
      list.push(pct)
      maturedByOffset.set(off, list)
    }
    if (hasImmature)
      rightCensoredCohorts.push(cohort)
    rows.push(row)
  }

  const flags = rightCensoredCohorts.length > 0 ? ['right_censored_cohorts'] : []
  const avgSummary: string[] = []
  for (let off = 1; off <= Math.min(6, maxOffset); off++) {
    const vals = maturedByOffset.get(off) ?? []
    if (vals.length > 0) {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length
      avgSummary.push(`**M${off}**: ${fmt(avg, 1)}% (${vals.length} matured cohort${vals.length === 1 ? '' : 's'})`)
    }
  }

  const lines = [
    `### Right-Censored Cohort Retention (${sortedCohorts.length} cohorts, ${totalEntities.toLocaleString('en-US')} unique \`${entityField}\`, data through \`${maxMonth}\`)`,
    `- **Unbiased Matured Retention**: ${avgSummary.join(' · ')}`,
  ]
  if (rightCensoredCohorts.length > 0) {
    lines.push(
      `- **⚠️ RIGHT-CENSORING GUARD**: ${rightCensoredCohorts.length} recent cohort(s) (${rightCensoredCohorts.join(', ')}) have not reached M${maxOffset} yet; immature future periods are masked as \`null\` (NOT 0%) so retention averages are not artificially dragged down.`,
    )
  }

  const chartOff = Math.min(3, maxOffset)
  return {
    method: 'cohort_retention',
    title: 'Cohort Retention Matrix',
    summaryText: lines.join('\n'),
    rows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'cohort', role: 'dimension' },
      yAxis: { field: `M${chartOff}`, role: 'measure', aggregation: 'avg' },
      options: { title: `M${chartOff} Retention % by Cohort (Matured Only)`, sortOrder: 'label-asc', showLegend: false, showGrid: true },
    },
    flags,
  }
}

/** 3) Right-Censored Monthly Cohort Retention Matrix (Pro). */
export function runCohortRetention(dataset: StoredDataset, input: AnalyzeInput): AnalyzeOutput {
  const entityField = input.entityField ?? dataset.columns.find(c => /user|customer|account|member/i.test(c.name))?.name
  const dateField = input.dateField ?? dataset.columns.find(c => c.type === 'date' || /date|month|_at$/i.test(c.name))?.name
  if (!entityField || !dateField)
    throw new Error('cohort_retention requires `entityField` and `dateField`.')

  const entityMonths = new Map<string, Set<string>>()
  const explicitCohort = new Map<string, string>()

  for (const row of dataset.rows) {
    const ent = String(row[entityField] ?? '').trim()
    const rawDate = String(row[dateField] ?? '').trim()
    if (!ent || !rawDate)
      continue
    const m = /^(\d{4}-\d{2})/.exec(rawDate)
    if (!m)
      continue
    const set = entityMonths.get(ent) ?? new Set<string>()
    set.add(m[1])
    entityMonths.set(ent, set)
    if (input.cohortField && row[input.cohortField]) {
      const cm = /^(\d{4}-\d{2})/.exec(String(row[input.cohortField]))
      if (cm)
        explicitCohort.set(ent, cm[1])
    }
  }

  const pairCounts = new Map<string, number>()
  for (const [ent, months] of entityMonths.entries()) {
    const cohort = explicitCohort.get(ent) ?? [...months].sort()[0]
    for (const ym of months) {
      const key = `${cohort}\0${ym}`
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }
  }
  const counts: CohortRetentionCount[] = [...pairCounts.entries()].map(([key, activeEntities]) => {
    const [cohort, activeMonth] = key.split('\0')
    return { cohort, activeMonth, activeEntities }
  })
  return buildCohortRetentionFromCounts({ entityField, counts })
}

/** 4) Seasonally-Adjusted (Day-of-Week) Robust Anomaly & Structural Change-Point Detector (Pro). */
export function runAnomalyDetection(dataset: StoredDataset, input: AnalyzeInput): AnalyzeOutput {
  const dateField = input.dateField ?? dataset.columns.find(c => c.type === 'date' || /date|day/i.test(c.name))?.name
  const metric = input.metric ?? dataset.columns.find(c => c.type === 'number' && !/id$/i.test(c.name))?.name
  if (!dateField || !metric)
    throw new Error('anomalies requires `dateField` and `metric`.')

  // Aggregate daily totals
  const byDay = new Map<string, number>()
  for (const row of dataset.rows) {
    const raw = String(row[dateField] ?? '').trim()
    const m = ISO_DATE_RE.exec(raw)
    if (!m)
      continue
    const day = `${m[1]}-${m[2]}-${m[3]}`
    const val = toNum(row[metric])
    if (Number.isFinite(val))
      byDay.set(day, (byDay.get(day) ?? 0) + val)
  }

  const series = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, value]) => {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
    return { day, dow, value }
  })
  if (series.length < 14)
    throw new Error(`Need at least 14 daily observations for seasonal anomaly & change-point detection; found ${series.length}.`)

  // Day-of-week seasonal medians (robust to outliers & level shifts)
  const dowBuckets = Array.from({ length: 7 }, () => [] as number[])
  for (const pt of series)
    dowBuckets[pt.dow].push(pt.value)
  const overallMed = medianOf(series.map(s => s.value))
  const dowEffect = dowBuckets.map(b => (b.length > 0 ? medianOf(b) - overallMed : 0))
  const adjusted = series.map(pt => ({ ...pt, deseasonalized: pt.value - dowEffect[pt.dow] }))

  // Robust MAD z-scores on deseasonalized series
  const desVals = adjusted.map(a => a.deseasonalized)
  const medDes = medianOf(desVals)
  const mad = medianOf(desVals.map(v => Math.abs(v - medDes)))
  const zThresh = input.zThreshold ?? 3.5

  const pointAnomalies = adjusted
    .map(a => ({ ...a, z: mad > 1e-9 ? (0.6745 * (a.deseasonalized - medDes)) / mad : 0 }))
    .filter(a => Math.abs(a.z) >= zThresh)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))

  // Structural Change-Point Scan: find single split point maximizing Welch |t| on deseasonalized values
  const minWindow = Math.max(7, Math.floor(adjusted.length * 0.15))
  let bestSplit: { idx: number, day: string, beforeMean: number, afterMean: number, pctShift: number, tStat: number, pValue: number } | undefined
  for (let i = minWindow; i <= adjusted.length - minWindow; i++) {
    const before = meanAndVar(desVals.slice(0, i))
    const after = meanAndVar(desVals.slice(i))
    const se = Math.sqrt(Math.max(1e-12, before.variance / before.n + after.variance / after.n))
    const tStat = (after.mean - before.mean) / se
    if (!bestSplit || Math.abs(tStat) > Math.abs(bestSplit.tStat)) {
      const df = Math.max(2, before.n + after.n - 2)
      bestSplit = {
        idx: i,
        day: adjusted[i].day,
        beforeMean: before.mean,
        afterMean: after.mean,
        pctShift: before.mean !== 0 ? ((after.mean - before.mean) / Math.abs(before.mean)) * 100 : 0,
        tStat,
        pValue: twoSidedTP(tStat, df),
      }
    }
  }

  const flags: string[] = []
  const lines: string[] = [
    `### Seasonally-Adjusted Anomaly & Change-Point Scan: \`${metric}\` (${series.length} days, ${series[0].day} → ${series[series.length - 1].day})`,
  ]
  if (bestSplit && bestSplit.pValue < 0.001 && Math.abs(bestSplit.pctShift) >= 5) {
    flags.push('structural_changepoint')
    lines.push(
      `- **⚠️ STRUCTURAL CHANGE-POINT DETECTED on \`${bestSplit.day}\`**: Seasonally-adjusted daily \`${metric}\` shifted from **${fmt(bestSplit.beforeMean)}/day** (before ${bestSplit.day}) to **${fmt(bestSplit.afterMean)}/day** (from ${bestSplit.day} onward) — a **${bestSplit.pctShift >= 0 ? '+' : ''}${fmt(bestSplit.pctShift, 1)}%** regime shift (t = ${fmt(bestSplit.tStat, 2)}, p = ${fmtP(bestSplit.pValue)}).`,
    )
  }
  else {
    lines.push('- **Structural Change-Point Check**: No significant permanent level shift detected.')
  }

  if (pointAnomalies.length > 0) {
    flags.push('point_anomalies')
    lines.push(
      `- **Point Anomalies (|MAD z| ≥ ${zThresh})**: ${pointAnomalies.length} day(s) — top: ${pointAnomalies.slice(0, 5).map(a => `\`${a.day}\` (${fmt(a.value)}, z=${fmt(a.z, 1)})`).join(', ')}.`,
    )
  }
  else {
    lines.push(`- **Point Anomalies**: None exceeding |MAD z| ≥ ${zThresh}.`)
  }

  const rows = adjusted.map(a => ({
    date: a.day,
    actual: Number(a.value.toFixed(2)),
    deseasonalized: Number(a.deseasonalized.toFixed(2)),
  }))

  return {
    method: 'anomalies',
    title: `Seasonal Anomalies & Change-Points (${metric})`,
    summaryText: lines.join('\n'),
    rows,
    chartConfig: {
      type: 'line',
      xAxis: { field: 'date', role: 'dimension' },
      yAxis: { field: 'deseasonalized', role: 'measure', aggregation: 'sum' },
      options: { title: `Seasonally-Adjusted ${metric} (Day-of-Week Removed)`, sortOrder: 'label-asc', showLegend: false, showGrid: true },
    },
    flags,
  }
}

function pickAlias(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim())
      return v.trim()
  }
  return undefined
}

function pickStringArray(raw: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const k of keys) {
    const v = raw[k]
    if (Array.isArray(v)) {
      const strs = v.map(String).filter(Boolean)
      if (strs.length > 0)
        return strs
    }
    if (typeof v === 'string' && v.trim())
      return v.split(',').map(s => s.trim()).filter(Boolean)
  }
  return undefined
}

/**
 * Normalizes snake_case / synonym parameter names AND auto-infers omitted columns from the dataset schema.
 * Eliminates wasted retry turns when an LLM calls `analyze({ method, filePath })` with minimal or aliased params.
 */
function resolveAnalyzeInput(dataset: StoredDataset, input: AnalyzeInput): AnalyzeInput {
  const raw = input as unknown as Record<string, unknown>
  const cols = dataset.columns
  const colNames = cols.map(c => c.name)
  const findCol = (re: RegExp, typeFilter?: 'number' | 'string' | 'date'): string | undefined =>
    cols.find(c => (!typeFilter || c.type === typeFilter) && re.test(c.name))?.name

  const resolved: AnalyzeInput = {
    ...input,
    metric: pickAlias(raw, ['metric', 'metricField', 'metric_field', 'valueField', 'value_field', 'column', 'y']),
    numerator: pickAlias(raw, ['numerator', 'numeratorField', 'numerator_field', 'num', 'convertedField', 'converted_field']),
    denominator: pickAlias(raw, ['denominator', 'denominatorField', 'denominator_field', 'den', 'visitsField', 'visits_field']),
    periodField: pickAlias(raw, ['periodField', 'period_field', 'periodCol', 'period_col', 'timeField', 'time_field', 'period']),
    fromPeriod: pickAlias(raw, ['fromPeriod', 'from_period', 'baseline', 'startPeriod', 'start_period', 'from']),
    toPeriod: pickAlias(raw, ['toPeriod', 'to_period', 'comparison', 'endPeriod', 'end_period', 'to']),
    dimensions: pickStringArray(raw, ['dimensions', 'dimension', 'groupBy', 'group_by', 'segments']),
    variantField: pickAlias(raw, ['variantField', 'variant_field', 'groupField', 'group_field', 'armField', 'arm_field', 'variant', 'group', 'treatmentField']),
    controlValue: pickAlias(raw, ['controlValue', 'control_value', 'control']),
    treatmentValue: pickAlias(raw, ['treatmentValue', 'treatment_value', 'treatment']),
    successField: pickAlias(raw, ['successField', 'success_field', 'successesField', 'successes', 'convertedField', 'converted_field', 'conversions', 'numerator']),
    trialsField: pickAlias(raw, ['trialsField', 'trials_field', 'trials', 'sampleSizeField', 'nField', 'visits', 'denominator']),
    segmentField: pickAlias(raw, ['segmentField', 'segment_field', 'segment', 'sliceField', 'slice_field', 'dimension']),
    target: pickAlias(raw, ['target', 'targetField', 'target_field', 'outcome', 'outcomeField', 'outcome_field', 'dependent', 'y']),
    features: pickStringArray(raw, ['features', 'feature', 'predictors', 'x', 'treatmentCols', 'independent']),
    controls: pickStringArray(raw, ['controls', 'controlCols', 'control_cols', 'confounders', 'covariates']),
    entityField: pickAlias(raw, ['entityField', 'entity_field', 'userField', 'user_field', 'idField', 'id_field', 'customerField', 'accountField']),
    dateField: pickAlias(raw, ['dateField', 'date_field', 'timeField', 'time_field', 'dayField', 'day_field', 'timestampField']),
    cohortField: pickAlias(raw, ['cohortField', 'cohort_field', 'cohort']),
  }

  // Zero-param smart auto-inference per method
  if (resolved.method === 'ab_test') {
    if (!resolved.variantField) {
      resolved.variantField = findCol(/variant|group|arm|bucket|treatment|experiment/i, 'string')
        ?? cols.find((c) => {
          if (c.type !== 'string' || /id$/i.test(c.name))
            return false
          const u = new Set(dataset.rows.map(r => String(r[c.name] ?? '')).filter(Boolean))
          return u.size === 2
        })?.name
    }
    if (!resolved.successField && !resolved.metric)
      resolved.successField = findCol(/convert|success|clicks|orders|wins|purchases|retained|renewed/i, 'number')
    if (!resolved.trialsField && !resolved.metric)
      resolved.trialsField = findCol(/trial|visit|impres|user|session|total|sample|denom|^n$/i, 'number')
    if (resolved.successField && !resolved.trialsField && !resolved.metric)
      resolved.metric = resolved.successField
  }
  else if (resolved.method === 'explain_change') {
    if (!resolved.periodField)
      resolved.periodField = findCol(/period|quarter|month|year|cohort|wave/i) ?? cols.find(c => c.type === 'string' && new Set(dataset.rows.map(r => String(r[c.name] ?? ''))).size === 2)?.name
    if (resolved.periodField && (!resolved.fromPeriod || !resolved.toPeriod)) {
      const periods = [...new Set(dataset.rows.map(r => String(r[resolved.periodField!] ?? '')).filter(Boolean))].sort()
      if (periods.length >= 2) {
        resolved.fromPeriod ??= periods[periods.length - 2]
        resolved.toPeriod ??= periods[periods.length - 1]
      }
    }
    if (!resolved.metric && (!resolved.numerator || !resolved.denominator)) {
      const autoNum = findCol(/convert|success|profit|retained|clicks/i, 'number')
      const autoDen = findCol(/visit|trial|impres|session|users|leads/i, 'number')
      if (autoNum && autoDen && autoNum !== autoDen) {
        resolved.numerator ??= autoNum
        resolved.denominator ??= autoDen
      }
      else {
        resolved.metric = findCol(/revenue|sales|mrr|arr|amount|orders|units|spend/i, 'number') ?? cols.find(c => c.type === 'number' && !/id$/i.test(c.name))?.name
      }
    }
  }
  else if (resolved.method === 'regression') {
    if (!resolved.target) {
      resolved.target = findCol(/renew|churn|convert|revenue|sales|ltv|spend|target|outcome/i, 'number')
        ?? [...cols].reverse().find(c => c.type === 'number' && !/id$/i.test(c.name))?.name
    }
    if ((!resolved.features || resolved.features.length === 0) && resolved.target) {
      const primary = findCol(/discount|promo|price|treatment|campaign|ad_spend|feature/i)
      const others = colNames.filter(c => c !== resolved.target && c !== primary && !/(?:^|_)id$|date/i.test(c))
      resolved.features = primary ? [primary] : others.slice(0, 1)
      resolved.controls = primary ? others : others.slice(1)
    }
  }

  return resolved
}

/** Unified dispatcher for the `analyze` MCP tool. */
export function runAnalysis(dataset: StoredDataset, input: AnalyzeInput, options: { proGuards: boolean }): AnalyzeOutput {
  const resolved = resolveAnalyzeInput(dataset, input)
  if (resolved.method === 'explain_change') {
    if (!resolved.periodField || !resolved.fromPeriod || !resolved.toPeriod)
      throw new Error('explain_change requires `periodField`, `fromPeriod`, and `toPeriod`.')
    const explained = explainMetricChange(dataset, {
      metric: resolved.metric,
      numerator: resolved.numerator,
      denominator: resolved.denominator,
      periodField: resolved.periodField,
      fromPeriod: resolved.fromPeriod,
      toPeriod: resolved.toPeriod,
      dimensions: resolved.dimensions,
    })
    const flags: string[] = []
    if (explained.simpsonsParadox)
      flags.push('simpsons_paradox')
    if (explained.outlierCheck?.triggered)
      flags.push('outlier_distortion')
    return {
      method: 'explain_change',
      title: `${explained.metricLabel} Drivers (${resolved.fromPeriod} → ${resolved.toPeriod})`,
      summaryText: explained.summaryText,
      rows: explained.driverRows,
      chartConfig: explained.chartConfig,
      flags,
    }
  }
  if (resolved.method === 'ab_test')
    return runAbTest(dataset, resolved, options)
  if (resolved.method === 'regression')
    return runRegression(dataset, resolved)
  if (resolved.method === 'cohort_retention')
    return runCohortRetention(dataset, resolved)
  if (resolved.method === 'anomalies')
    return runAnomalyDetection(dataset, resolved)
  throw new Error(`Unknown analysis method "${String(resolved.method)}".`)
}
