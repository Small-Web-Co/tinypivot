/**
 * Home page model comparison: the internal 18-task suite as three measures (accuracy, time, cost)
 * for each model, alone and with TinyPivot Pro. All figures come from `trustBenchRows`.
 */
import type { TrustBenchModelRow } from './whitepaper'
import { TRUST_BENCH_TOTALS, trustBenchRows } from './whitepaper'

export type MetricId = 'accuracy' | 'time' | 'cost'

export interface MetricBar {
  /** Bar length as a share of the column's largest value, 0–100. */
  pct: number
  text: string
}

export interface MetricCell {
  alone: MetricBar
  pro: MetricBar
  /** Short change label, e.g. "+22 pts" or "39% less". Empty when nothing changed. */
  change: string
  /** Whether the change is an improvement; null when there is no change or no bars. */
  better: boolean | null
  /** Whether the number went up; null when there is no change. */
  rose: boolean | null
}

export interface ModelChartRow {
  id: string
  model: string
  where: string
  cells: Record<MetricId, MetricCell>
}

export const metricColumns: readonly { id: MetricId, title: string, unit: string }[] = [
  { id: 'accuracy', title: 'Accuracy', unit: `tasks answered correctly` },
  { id: 'time', title: 'Time', unit: 'seconds per task' },
  { id: 'cost', title: 'Cost', unit: `API price, all ${TRUST_BENCH_TOTALS.tasksPerModel} tasks` },
]

const pctOf = (value: number, max: number) => Math.round((value / max) * 1000) / 10

/** Whole-percent change, rounded toward zero so it never overstates. */
export function percentChange(before: number, after: number): number {
  return Math.trunc(((after - before) / before) * 100)
}

/** "$2.32", "45¢", or "8.3¢" under a dime, so small local-model costs keep their difference. */
export function formatCost(usd: number): string {
  if (usd >= 1)
    return `$${usd.toFixed(2)}`
  const cents = usd * 100
  return cents < 10 ? `${cents.toFixed(1)}¢` : `${Math.round(cents)}¢`
}

/** Marks costs imputed at API rates for models that ran on the tester's own hardware. */
export const IMPUTED_MARK = '†'

function lowerIsBetterCell(before: number, after: number, max: number, format: (n: number) => string): MetricCell {
  const change = percentChange(before, after)
  return {
    alone: { pct: pctOf(before, max), text: format(before) },
    pro: { pct: pctOf(after, max), text: format(after) },
    change: change === 0 ? '' : change < 0 ? `${-change}% less` : `${change}% more`,
    better: change === 0 ? null : change < 0,
    rose: change === 0 ? null : change > 0,
  }
}

function accuracyCell(row: TrustBenchModelRow): MetricCell {
  const gain = row.proPct - row.baselinePct
  return {
    alone: { pct: row.baselinePct, text: `${row.baselinePct}%` },
    pro: { pct: row.proPct, text: `${row.proPct}%` },
    change: gain === 0 ? 'already 100%' : `+${gain} pts`,
    better: gain === 0 ? null : gain > 0,
    rose: gain === 0 ? null : gain > 0,
  }
}

export function buildModelChartRows(rows: readonly TrustBenchModelRow[] = trustBenchRows): ModelChartRow[] {
  const maxSec = Math.max(...rows.flatMap(r => [r.baselineSec, r.proSec]))
  const maxCost = Math.max(...rows.flatMap(r => [r.baselineCost, r.proCost]))
  const seconds = (n: number) => `${n.toFixed(1)}s`

  return rows.map(row => ({
    id: row.id,
    model: row.shortLabel,
    where: row.hardware,
    cells: {
      accuracy: accuracyCell(row),
      time: lowerIsBetterCell(row.baselineSec, row.proSec, maxSec, seconds),
      cost: lowerIsBetterCell(row.baselineCost, row.proCost, maxCost, n => row.local ? `${formatCost(n)}${IMPUTED_MARK}` : formatCost(n)),
    },
  }))
}

/** The three strongest measured results, each tied to one model in the chart. */
export function modelChartHighlights(rows: readonly TrustBenchModelRow[] = trustBenchRows) {
  const byId = (id: string) => {
    const row = rows.find(r => r.id === id)
    if (!row)
      throw new Error(`No benchmark row "${id}"`)
    return row
  }
  const inkling = byId('inkling')
  const haiku = byId('haiku')
  const opus = byId('opus')
  // Rounded up so "under N%" never understates the share.
  const haikuShareOfOpus = Math.ceil((haiku.proCost / opus.baselineCost) * 100)

  return [
    {
      value: `${inkling.baselinePct}% → ${inkling.proPct}%`,
      label: `${inkling.shortLabel}, a small model on a Mac, answered every task correctly`,
    },
    {
      value: `${-percentChange(inkling.baselineSec, inkling.proSec)}% less time`,
      label: `per task for the same model, with no cloud bill at all`,
    },
    {
      value: `under ${haikuShareOfOpus}% of the cost`,
      label: `${haiku.shortLabel} with TinyPivot matched ${opus.shortLabel}'s 100% for ${formatCost(haiku.proCost)}, vs ${formatCost(opus.baselineCost)} for ${opus.shortLabel} alone`,
    },
  ] as const
}
