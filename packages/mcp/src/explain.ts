import type { ChartConfig } from '@smallwebco/tinypivot-core'
import type { StoredDataset } from './store.js'

/**
 * Deterministic Period-over-Period Driver & Mix-vs-Rate Decomposition Engine (Pro).
 *
 * Replaces multi-turn LLM trial-and-error with exact DuckDB-grade math:
 * - Additive metrics: Contribution-to-Change across every dimension + Top-1% Outlier Stress-Test
 * - Ratio/rate metrics (numerator / denominator): Exact Kitagawa Mix-vs-Rate Decomposition
 *   + automatic Simpson's Paradox detection.
 */

export interface ExplainChangeInput {
  /** Additive metric column (use this OR numerator + denominator). */
  metric?: string
  /** Numerator column for a weighted rate/ratio metric (e.g. converted, gross_profit). */
  numerator?: string
  /** Denominator column for a weighted rate/ratio metric (e.g. visits, revenue). */
  denominator?: string
  /** Column identifying the period or cohort to compare (e.g. quarter, month, period). */
  periodField: string
  /** Baseline period value (e.g. '2026-Q3' or '2026-10'). */
  fromPeriod: string
  /** Comparison period value (e.g. '2026-Q4' or '2026-11'). */
  toPeriod: string
  /** Optional list of dimensions to decompose across; auto-selects categorical columns if omitted. */
  dimensions?: string[]
  /** Multiplier for rate display (defaults to 100 for percentages when rates are <= 1.5). */
  rateScale?: number
}

export interface AdditiveDriver {
  dimension: string
  segment: string
  fromValue: number
  toValue: number
  delta: number
  shareOfChangePct: number
}

export interface MixRateSegment {
  segment: string
  fromNum: number
  fromDen: number
  toNum: number
  toDen: number
  fromRate: number
  toRate: number
  fromShare: number
  toShare: number
  rateEffect: number
  mixEffect: number
  totalEffect: number
}

export interface MixRateDimensionSummary {
  dimension: string
  rateEffect: number
  mixEffect: number
  totalDelta: number
  simpsonsParadox: boolean
  segments: MixRateSegment[]
}

export interface OutlierCheck {
  triggered: boolean
  removedFromCount: number
  removedToCount: number
  baselineDelta: number
  trimmedDelta: number
  topOutlierSummary?: string
}

export interface ExplainChangeResult {
  mode: 'additive' | 'ratio'
  metricLabel: string
  fromPeriod: string
  toPeriod: string
  fromTotal: number
  toTotal: number
  delta: number
  pctChange: number | null
  fromRowCount: number
  toRowCount: number
  summaryText: string
  /** Flat rows suitable for charting the top drivers directly in TinyPivot Studio. */
  driverRows: Record<string, unknown>[]
  chartConfig: Partial<ChartConfig>
  simpsonsParadox: boolean
  outlierCheck?: OutlierCheck
  additiveDrivers?: AdditiveDriver[]
  mixRateByDimension?: MixRateDimensionSummary[]
}

const ID_COL_RE = /(?:^|_)id$|_key$|^uuid$|^order_no$|^tx_/i

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtNum(v: number, digits = 2): string {
  const abs = Math.abs(v)
  if (abs >= 1000 && Math.abs(v - Math.round(v)) < 0.01)
    return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function fmtSigned(v: number, suffix = '', digits = 2): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${fmtNum(v, digits)}${suffix}`
}

function selectDimensions(dataset: StoredDataset, periodField: string, requested?: string[]): string[] {
  const colNames = new Set(dataset.columns.map(c => c.name))
  if (requested?.length)
    return requested.filter(d => colNames.has(d) && d !== periodField)

  const candidates: string[] = []
  for (const col of dataset.columns) {
    if (col.name === periodField || col.type === 'number' || col.type === 'date' || ID_COL_RE.test(col.name))
      continue
    const uniq = new Set<string>()
    for (const row of dataset.rows) {
      const val = row[col.name]
      if (val !== null && val !== undefined && val !== '')
        uniq.add(String(val))
      if (uniq.size > 30)
        break
    }
    if (uniq.size >= 2 && uniq.size <= 30)
      candidates.push(col.name)
  }
  return candidates.slice(0, 6)
}

function runOutlierStressTest(
  fromRows: Record<string, unknown>[],
  toRows: Record<string, unknown>[],
  metric: string,
  baselineDelta: number,
): OutlierCheck {
  const trim = (rows: Record<string, unknown>[]) => {
    if (rows.length < 10)
      return { trimmedSum: rows.reduce((s, r) => s + num(r[metric]), 0), removed: [] as Record<string, unknown>[] }
    const sorted = [...rows].sort((a, b) => Math.abs(num(b[metric])) - Math.abs(num(a[metric])))
    const cut = Math.max(1, Math.floor(rows.length * 0.01))
    const removed = sorted.slice(0, cut)
    const kept = sorted.slice(cut)
    return { trimmedSum: kept.reduce((s, r) => s + num(r[metric]), 0), removed }
  }
  const f = trim(fromRows)
  const t = trim(toRows)
  const trimmedDelta = t.trimmedSum - f.trimmedSum
  const absBase = Math.abs(baselineDelta)
  const explainedShare = absBase > 1e-9 ? Math.abs(baselineDelta - trimmedDelta) / absBase : 0
  const signFlipped = baselineDelta !== 0 && trimmedDelta !== 0 && Math.sign(baselineDelta) !== Math.sign(trimmedDelta)
  const triggered = signFlipped || (absBase > 1e-9 && explainedShare >= 0.4)

  let topOutlierSummary: string | undefined
  if (triggered) {
    const worst = [...f.removed.map(r => ({ period: 'from', r })), ...t.removed.map(r => ({ period: 'to', r }))]
      .sort((a, b) => Math.abs(num(b.r[metric])) - Math.abs(num(a.r[metric])))[0]
    if (worst) {
      const idEntry = Object.entries(worst.r).find(([k]) => k !== metric && typeof worst.r[k] === 'string')
      topOutlierSummary = `${idEntry ? `${idEntry[0]}=${String(idEntry[1])} ` : ''}(${metric}=${fmtNum(num(worst.r[metric]))})`
    }
  }

  return {
    triggered,
    removedFromCount: f.removed.length,
    removedToCount: t.removed.length,
    baselineDelta,
    trimmedDelta,
    topOutlierSummary,
  }
}

function explainAdditive(
  dataset: StoredDataset,
  input: ExplainChangeInput,
  fromRows: Record<string, unknown>[],
  toRows: Record<string, unknown>[],
  dimensions: string[],
): ExplainChangeResult {
  const metric = input.metric!
  const fromTotal = fromRows.reduce((s, r) => s + num(r[metric]), 0)
  const toTotal = toRows.reduce((s, r) => s + num(r[metric]), 0)
  const delta = toTotal - fromTotal
  const pctChange = fromTotal !== 0 ? (delta / Math.abs(fromTotal)) * 100 : null

  const byDim: Array<{ dimension: string, drivers: AdditiveDriver[], concentration: number }> = []
  for (const dim of dimensions) {
    const map = new Map<string, { from: number, to: number }>()
    for (const r of fromRows) {
      const seg = String(r[dim] ?? '(missing)')
      const cur = map.get(seg) ?? { from: 0, to: 0 }
      cur.from += num(r[metric])
      map.set(seg, cur)
    }
    for (const r of toRows) {
      const seg = String(r[dim] ?? '(missing)')
      const cur = map.get(seg) ?? { from: 0, to: 0 }
      cur.to += num(r[metric])
      map.set(seg, cur)
    }
    const drivers: AdditiveDriver[] = [...map.entries()].map(([segment, vals]) => {
      const d = vals.to - vals.from
      return {
        dimension: dim,
        segment,
        fromValue: vals.from,
        toValue: vals.to,
        delta: d,
        shareOfChangePct: delta !== 0 ? (d / delta) * 100 : 0,
      }
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const concentration = drivers[0] ? Math.abs(drivers[0].delta) : 0
    byDim.push({ dimension: dim, drivers, concentration })
  }
  byDim.sort((a, b) => b.concentration - a.concentration)

  const outlierCheck = runOutlierStressTest(fromRows, toRows, metric, delta)
  const primary = byDim[0]
  const driverRows = (primary?.drivers ?? []).map(d => ({
    segment: d.segment,
    dimension: d.dimension,
    from_value: Number(d.fromValue.toFixed(2)),
    to_value: Number(d.toValue.toFixed(2)),
    delta: Number(d.delta.toFixed(2)),
    share_of_change_pct: Number(d.shareOfChangePct.toFixed(1)),
  }))

  const lines: string[] = [
    `### Deterministic Change Decomposition: \`${metric}\` (${input.fromPeriod} → ${input.toPeriod})`,
    `- **Overall**: ${fmtNum(fromTotal)} → ${fmtNum(toTotal)} (**${fmtSigned(delta)}**${pctChange !== null ? `, ${fmtSigned(pctChange, '%', 1)}` : ''}) across ${fromRows.length.toLocaleString('en-US')} → ${toRows.length.toLocaleString('en-US')} rows.`,
  ]

  if (outlierCheck.triggered) {
    lines.push(
      `- **⚠️ OUTLIER DISTORTION DETECTED**: Removing the top 1% extreme row(s) shifts the change from **${fmtSigned(delta)}** to **${fmtSigned(outlierCheck.trimmedDelta)}**${outlierCheck.topOutlierSummary ? ` — largest outlier: \`${outlierCheck.topOutlierSummary}\`` : ''}. Report both headline and outlier-adjusted totals.`,
    )
  }

  for (const group of byDim.slice(0, 3)) {
    const top = group.drivers.slice(0, 4)
    lines.push(`- **By \`${group.dimension}\`**: ${top.map(d => `${d.segment} ${fmtSigned(d.delta)} (${fmtNum(d.shareOfChangePct, 0)}% of move)`).join(' · ')}`)
  }

  return {
    mode: 'additive',
    metricLabel: metric,
    fromPeriod: input.fromPeriod,
    toPeriod: input.toPeriod,
    fromTotal,
    toTotal,
    delta,
    pctChange,
    fromRowCount: fromRows.length,
    toRowCount: toRows.length,
    summaryText: lines.join('\n'),
    driverRows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'segment', role: 'dimension' },
      yAxis: { field: 'delta', role: 'measure', aggregation: 'sum' },
      options: {
        title: `${metric} Change Drivers by ${primary?.dimension ?? 'Segment'} (${input.fromPeriod} → ${input.toPeriod})`,
        sortOrder: 'value-desc',
        showLegend: false,
        showGrid: true,
      },
    },
    simpsonsParadox: false,
    outlierCheck,
    additiveDrivers: primary?.drivers ?? [],
  }
}

/** Exact Kitagawa Mix-vs-Rate Decomposition + Simpson's Paradox detection for ratio/rate metrics. */
function explainRatio(
  dataset: StoredDataset,
  input: ExplainChangeInput,
  fromRows: Record<string, unknown>[],
  toRows: Record<string, unknown>[],
  dimensions: string[],
): ExplainChangeResult {
  const numCol = input.numerator!
  const denCol = input.denominator!
  const fromNum = fromRows.reduce((s, r) => s + num(r[numCol]), 0)
  const fromDen = fromRows.reduce((s, r) => s + num(r[denCol]), 0)
  const toNum = toRows.reduce((s, r) => s + num(r[numCol]), 0)
  const toDen = toRows.reduce((s, r) => s + num(r[denCol]), 0)

  const rawFromRate = fromDen !== 0 ? fromNum / fromDen : 0
  const rawToRate = toDen !== 0 ? toNum / toDen : 0
  const scale = input.rateScale ?? (Math.max(Math.abs(rawFromRate), Math.abs(rawToRate)) <= 1.5 ? 100 : 1)
  const unit = scale === 100 ? '%' : ''
  const ppUnit = scale === 100 ? ' pp' : ''

  const fromTotal = rawFromRate * scale
  const toTotal = rawToRate * scale
  const delta = toTotal - fromTotal
  const pctChange = fromTotal !== 0 ? (delta / Math.abs(fromTotal)) * 100 : null

  const dimSummaries: MixRateDimensionSummary[] = []
  for (const dim of dimensions) {
    const map = new Map<string, { fn: number, fd: number, tn: number, td: number }>()
    for (const r of fromRows) {
      const seg = String(r[dim] ?? '(missing)')
      const cur = map.get(seg) ?? { fn: 0, fd: 0, tn: 0, td: 0 }
      cur.fn += num(r[numCol])
      cur.fd += num(r[denCol])
      map.set(seg, cur)
    }
    for (const r of toRows) {
      const seg = String(r[dim] ?? '(missing)')
      const cur = map.get(seg) ?? { fn: 0, fd: 0, tn: 0, td: 0 }
      cur.tn += num(r[numCol])
      cur.td += num(r[denCol])
      map.set(seg, cur)
    }

    const segments: MixRateSegment[] = []
    let totalRateEffect = 0
    let totalMixEffect = 0
    for (const [segment, v] of map.entries()) {
      const fRate = v.fd !== 0 ? (v.fn / v.fd) * scale : 0
      const tRate = v.td !== 0 ? (v.tn / v.td) * scale : 0
      const fShare = fromDen !== 0 ? v.fd / fromDen : 0
      const tShare = toDen !== 0 ? v.td / toDen : 0
      // Kitagawa identity: ΔR = Σ [ ((w1+w0)/2)*(r1-r0) + ((r1+r0)/2)*(w1-w0) ]
      const rateEffect = ((fShare + tShare) / 2) * (tRate - fRate)
      const mixEffect = ((fRate + tRate) / 2) * (tShare - fShare)
      totalRateEffect += rateEffect
      totalMixEffect += mixEffect
      segments.push({
        segment,
        fromNum: v.fn,
        fromDen: v.fd,
        toNum: v.tn,
        toDen: v.td,
        fromRate: fRate,
        toRate: tRate,
        fromShare: fShare * 100,
        toShare: tShare * 100,
        rateEffect,
        mixEffect,
        totalEffect: rateEffect + mixEffect,
      })
    }
    segments.sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))

    // Simpson's paradox: overall rate moved one direction, while the rate effect (and/or every active segment) moved the opposite direction.
    const activeSegs = segments.filter(s => s.fromDen > 0 && s.toDen > 0 && Math.abs(s.toRate - s.fromRate) > 1e-6)
    const oppositeCount = activeSegs.filter(s => Math.sign(s.toRate - s.fromRate) === -Math.sign(delta)).length
    const simpsonsParadox = Math.abs(delta) > 1e-4 && activeSegs.length >= 2 && (
      oppositeCount === activeSegs.length
      || (Math.sign(totalRateEffect) === -Math.sign(delta) && Math.abs(totalMixEffect) > Math.abs(totalRateEffect))
    )

    dimSummaries.push({
      dimension: dim,
      rateEffect: totalRateEffect,
      mixEffect: totalMixEffect,
      totalDelta: delta,
      simpsonsParadox,
      segments,
    })
  }

  // Rank dimensions that exhibit Simpson's paradox or the largest mix-vs-rate split first
  dimSummaries.sort((a, b) => {
    if (a.simpsonsParadox !== b.simpsonsParadox)
      return a.simpsonsParadox ? -1 : 1
    return Math.abs(b.mixEffect) - Math.abs(a.mixEffect)
  })

  const anySimpson = dimSummaries.some(d => d.simpsonsParadox)
  const primary = dimSummaries[0]
  const driverRows = (primary?.segments ?? []).map(s => ({
    segment: s.segment,
    from_rate: Number(s.fromRate.toFixed(2)),
    to_rate: Number(s.toRate.toFixed(2)),
    rate_delta: Number((s.toRate - s.fromRate).toFixed(2)),
    from_mix_pct: Number(s.fromShare.toFixed(1)),
    to_mix_pct: Number(s.toShare.toFixed(1)),
    rate_effect: Number(s.rateEffect.toFixed(2)),
    mix_effect: Number(s.mixEffect.toFixed(2)),
  }))

  const metricLabel = `${numCol} / ${denCol}`
  const lines: string[] = [
    `### Deterministic Mix-vs-Rate Decomposition: \`${metricLabel}\` (${input.fromPeriod} → ${input.toPeriod})`,
    `- **Weighted Blended Rate**: ${fmtNum(fromTotal)}${unit} → ${fmtNum(toTotal)}${unit} (**${fmtSigned(delta, ppUnit)}**) [\`SUM(${numCol})/SUM(${denCol})\`: ${fmtNum(fromNum)}/${fmtNum(fromDen)} → ${fmtNum(toNum)}/${fmtNum(toDen)}].`,
  ]

  for (const d of dimSummaries.slice(0, 3)) {
    const tag = d.simpsonsParadox ? ' **⚠️ SIMPSON\'S PARADOX**' : ''
    lines.push(
      `- **By \`${d.dimension}\`${tag}**: Rate effect **${fmtSigned(d.rateEffect, ppUnit)}** · Mix shift effect **${fmtSigned(d.mixEffect, ppUnit)}** (total ${fmtSigned(d.totalDelta, ppUnit)}).`,
    )
    for (const s of d.segments.slice(0, 4)) {
      lines.push(
        `  - \`${s.segment}\`: rate ${fmtNum(s.fromRate)}${unit} → ${fmtNum(s.toRate)}${unit} (${fmtSigned(s.toRate - s.fromRate, ppUnit)}), volume share ${fmtNum(s.fromShare, 1)}% → ${fmtNum(s.toShare, 1)}%`,
      )
    }
  }

  return {
    mode: 'ratio',
    metricLabel,
    fromPeriod: input.fromPeriod,
    toPeriod: input.toPeriod,
    fromTotal,
    toTotal,
    delta,
    pctChange,
    fromRowCount: fromRows.length,
    toRowCount: toRows.length,
    summaryText: lines.join('\n'),
    driverRows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'segment', role: 'dimension' },
      yAxis: { field: 'rate_delta', role: 'measure', aggregation: 'sum' },
      options: {
        title: `${metricLabel} Segment Rate Change by ${primary?.dimension ?? 'Segment'} (${input.fromPeriod} → ${input.toPeriod})`,
        sortOrder: 'value-desc',
        showLegend: false,
        showGrid: true,
      },
    },
    simpsonsParadox: anySimpson,
    mixRateByDimension: dimSummaries,
  }
}

/** Deterministically decomposes a period-over-period change in an additive or weighted-ratio metric. */
export function explainMetricChange(dataset: StoredDataset, input: ExplainChangeInput): ExplainChangeResult {
  const colNames = new Set(dataset.columns.map(c => c.name))
  if (!colNames.has(input.periodField))
    throw new Error(`Period column "${input.periodField}" not found. Columns: ${[...colNames].join(', ')}.`)

  const isRatio = Boolean(input.numerator && input.denominator)
  if (!isRatio && !input.metric)
    throw new Error('Pass either `metric` (for an additive column) or both `numerator` and `denominator` (for a weighted rate/ratio).')
  if (isRatio && (!colNames.has(input.numerator!) || !colNames.has(input.denominator!)))
    throw new Error(`Numerator/denominator column not found. Columns: ${[...colNames].join(', ')}.`)
  if (!isRatio && !colNames.has(input.metric!))
    throw new Error(`Metric column "${input.metric}" not found. Columns: ${[...colNames].join(', ')}.`)

  const fromRows = dataset.rows.filter(r => String(r[input.periodField] ?? '') === input.fromPeriod)
  const toRows = dataset.rows.filter(r => String(r[input.periodField] ?? '') === input.toPeriod)
  if (fromRows.length === 0 || toRows.length === 0) {
    const avail = [...new Set(dataset.rows.map(r => String(r[input.periodField] ?? '')).filter(Boolean))].sort().slice(0, 12)
    throw new Error(`No rows matched ${fromRows.length === 0 ? `fromPeriod="${input.fromPeriod}"` : `toPeriod="${input.toPeriod}"`} in \`${input.periodField}\`. Available values: ${avail.join(', ')}.`)
  }

  const dimensions = selectDimensions(dataset, input.periodField, input.dimensions)
  return isRatio
    ? explainRatio(dataset, input, fromRows, toRows, dimensions)
    : explainAdditive(dataset, input, fromRows, toRows, dimensions)
}
