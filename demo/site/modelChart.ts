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
  /** Null when the measure does not apply, such as cloud cost for a model run locally. */
  alone: MetricBar | null
  pro: MetricBar | null
  /** Short change label, e.g. "+22 pts" or "39% less". Empty when nothing changed. */
  change: string
  /** Whether the change is an improvement; null when there is no change or no bars. */
  better: boolean | null
  /** Whether the number went up; null when there is no change. */
  rose: boolean | null
  /** Shown in place of bars when `alone`/`pro` are null. */
  note?: string
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

/** "$2.32", or "8¢" under a dollar. */
export function formatCost(usd: number): string {
  return usd < 1 ? `${Math.round(usd * 100)}¢` : `$${usd.toFixed(2)}`
}

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
  const cloud = rows.filter(r => !r.local)
  const maxCost = Math.max(...cloud.flatMap(r => [r.baselineCost, r.proCost]))
  const seconds = (n: number) => `${n.toFixed(1)}s`

  return rows.map(row => ({
    id: row.id,
    model: row.shortLabel,
    where: row.hardware,
    cells: {
      accuracy: accuracyCell(row),
      time: lowerIsBetterCell(row.baselineSec, row.proSec, maxSec, seconds),
      cost: row.local
        ? { alone: null, pro: null, change: '', better: null, rose: null, note: '$0 · runs on your hardware' }
        : lowerIsBetterCell(row.baselineCost, row.proCost, maxCost, formatCost),
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
