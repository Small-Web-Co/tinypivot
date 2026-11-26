import type { ColumnSummary, StoredDataset } from './store.js'
import { isNonAdditiveMeasure } from './terminal-chart.js'

/**
 * A compact description of each column, so the model can plan filters and queries without
 * reading rows: how much is missing, the range of numbers and dates, and the commonest values.
 * In Pro mode, also surfaces relational grain, cross-table join cardinality (fan-out warnings),
 * partial trailing periods, and non-additive rate/percentage columns.
 */

const TOP_VALUES = 3
const ID_KEY_RE = /(?:^|_)id$|_key$|^sku$|^code$|^account$/i
const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/

export interface FormatProfileOptions {
  /** Enable Pro relational grain, join cardinality, partial period, and non-additive insights. */
  isPro?: boolean
  /** Other loaded datasets in the same session, used to detect cross-table join keys & fan-out risk. */
  peerDatasets?: StoredDataset[]
}

interface ColumnProfile {
  column: ColumnSummary
  present: number
  values: unknown[]
}

function compactNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('en-US')
    : value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function percent(part: number, whole: number): string {
  if (whole === 0)
    return '0%'
  const share = (part / whole) * 100
  return share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`
}

function numberRange(values: unknown[]): string {
  const numbers = values.map(Number).filter(Number.isFinite)
  if (numbers.length === 0)
    return ''
  let min = numbers[0]
  let max = numbers[0]
  let sum = 0
  for (const value of numbers) {
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
  }
  return `${compactNumber(min)} to ${compactNumber(max)}, mean ${compactNumber(sum / numbers.length)}`
}

function dateRange(values: unknown[]): string {
  const texts = values.map(String).sort()
  return texts.length ? `${texts[0]} to ${texts[texts.length - 1]}` : ''
}

function topValues(values: unknown[], total: number): string {
  const counts = new Map<string, number>()
  for (const value of values)
    counts.set(String(value), (counts.get(String(value)) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_VALUES)
  const listed = top.map(([value, count]) => `${value} ${percent(count, total)}`).join(', ')
  return counts.size > TOP_VALUES ? `${counts.size.toLocaleString('en-US')} values, top: ${listed}` : listed
}

function describe({ column, present, values }: ColumnProfile, total: number): string {
  const missing = total - present
  const parts = [`\`${column.name}\` ${column.type}`]
  if (missing > 0)
    parts.push(`${percent(missing, total)} empty`)
  if (column.type === 'number')
    parts.push(numberRange(values))
  else if (column.type === 'date')
    parts.push(dateRange(values))
  else
    parts.push(topValues(values, present))
  return parts.filter(Boolean).join(' · ')
}

function detectGrainLine(dataset: StoredDataset): string | undefined {
  const total = dataset.rows.length
  if (total === 0)
    return undefined
  const uniqueKeys: string[] = []
  const dupIdKeys: string[] = []
  for (const col of dataset.columns) {
    if (!ID_KEY_RE.test(col.name) && col.type === 'number')
      continue
    const uniq = new Set<string>()
    let nonNull = 0
    for (const row of dataset.rows) {
      const v = row[col.name]
      if (v === null || v === undefined || v === '')
        continue
      nonNull += 1
      uniq.add(String(v))
    }
    if (nonNull === total && uniq.size === total) {
      uniqueKeys.push(`\`${col.name}\``)
    }
    else if (ID_KEY_RE.test(col.name) && uniq.size > 0 && nonNull / uniq.size > 1.05) {
      dupIdKeys.push(`\`${col.name}\` (${(nonNull / uniq.size).toFixed(2)}× rows/key — pre-aggregate before joining)`)
    }
  }
  if (uniqueKeys.length > 0 && dupIdKeys.length === 0)
    return `Grain: unique on ${uniqueKeys.slice(0, 2).join(', ')}.`
  if (uniqueKeys.length > 0 && dupIdKeys.length > 0)
    return `Grain: unique on ${uniqueKeys[0]}; non-unique keys: ${dupIdKeys.slice(0, 2).join('; ')}.`
  if (dupIdKeys.length > 0)
    return `Grain: ⚠️ no single unique ID column; repeated keys: ${dupIdKeys.slice(0, 2).join('; ')}.`
  return undefined
}

function detectJoinMapLines(dataset: StoredDataset, peers: StoredDataset[]): string[] {
  const lines: string[] = []
  const myCols = new Set(dataset.columns.map(c => c.name))
  for (const peer of peers) {
    if (peer.id === dataset.id || peer.rows.length === 0)
      continue
    const shared = peer.columns
      .map(c => c.name)
      .filter(name => myCols.has(name) && ID_KEY_RE.test(name))
    for (const key of shared.slice(0, 2)) {
      const myVals = new Set(dataset.rows.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== '').map(String))
      const peerNonNull = peer.rows.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== '').map(String)
      const peerVals = new Set(peerNonNull)
      if (myVals.size === 0 || peerVals.size === 0)
        continue
      let overlap = 0
      for (const v of myVals) {
        if (peerVals.has(v))
          overlap += 1
      }
      if (overlap === 0)
        continue
      const leftUnique = myVals.size === dataset.rows.length
      const rightUnique = peerVals.size === peerNonNull.length
      const card = leftUnique && rightUnique ? '1:1 ✓' : rightUnique ? 'N:1 ✓' : leftUnique ? '1:N ⚠️ right fan-out' : 'M:N ⚠️ fan-out risk (dedupe before JOIN)'
      const matchPct = Math.round((overlap / myVals.size) * 100)
      lines.push(`Join \`${dataset.id}.${key}\` ↔ \`${peer.id}.${key}\`: ${card} (${matchPct}% key overlap)`)
    }
  }
  return lines
}

function detectPartialPeriodLine(dataset: StoredDataset): string | undefined {
  for (const col of dataset.columns) {
    if (col.type !== 'date' && !/date|_at$|day$/i.test(col.name))
      continue
    const byMonth = new Map<string, Set<string>>()
    let maxDay = ''
    for (const row of dataset.rows) {
      const raw = row[col.name]
      if (typeof raw !== 'string')
        continue
      const m = ISO_DAY_RE.exec(raw.trim())
      if (!m)
        continue
      const ym = `${m[1]}-${m[2]}`
      const day = `${ym}-${m[3]}`
      if (day > maxDay)
        maxDay = day
      const set = byMonth.get(ym) ?? new Set<string>()
      set.add(day)
      byMonth.set(ym, set)
    }
    const months = [...byMonth.keys()].sort()
    if (months.length < 3)
      continue
    const latest = months[months.length - 1]
    const latestDays = byMonth.get(latest)?.size ?? 0
    const prevCounts = months.slice(0, -1).map(ym => byMonth.get(ym)?.size ?? 0).sort((a, b) => a - b)
    const medianPrev = prevCounts[Math.floor(prevCounts.length / 2)] ?? 0
    if (medianPrev >= 18 && latestDays < medianPrev * 0.65)
      return `Date completeness (\`${col.name}\`): ⚠️ trailing month \`${latest}\` has only ${latestDays} active day${latestDays === 1 ? '' : 's'} (through ${maxDay}, vs. ${medianPrev}-day median in prior months).`
  }
  return undefined
}

export function formatProfile(dataset: StoredDataset, options: FormatProfileOptions = {}): string {
  const total = dataset.rows.length
  const profiles = dataset.columns.map((column) => {
    const values = dataset.rows
      .map(row => row[column.name])
      .filter(value => value !== null && value !== undefined && value !== '')
    return { column, present: values.length, values }
  })
  const lines = [
    `Profile of **${dataset.name}** (\`${dataset.id}\`): ${total.toLocaleString('en-US')} rows.`,
    ...profiles.map(profile => describe(profile, total)),
  ]

  if (options.isPro && total > 0) {
    const proNotes: string[] = []
    const grain = detectGrainLine(dataset)
    if (grain)
      proNotes.push(grain)
    const joins = detectJoinMapLines(dataset, options.peerDatasets ?? [])
    proNotes.push(...joins)
    const partial = detectPartialPeriodLine(dataset)
    if (partial)
      proNotes.push(partial)
    const nonAdditive = dataset.columns
      .filter(c => c.type === 'number' && isNonAdditiveMeasure(c.name, 'sum'))
      .map(c => `\`${c.name}\``)
    if (nonAdditive.length > 0)
      proNotes.push(`Non-additive measures: ${nonAdditive.join(', ')} — do not SUM or unweighted-AVG; compute weighted SUM(num)/NULLIF(SUM(den), 0).`)
    if (proNotes.length > 0)
      lines.push('', '**Relational & Guardrail Summary (Pro)**', ...proNotes.map(n => `- ${n}`))
  }

  return lines.join('\n')
}

/**
 * Compact 1-to-3 line Pro trap brief appended to `load_file` ONLY when traps exist.
 * Saves 2-3 exploratory SQL turns by surfacing join fan-out, partial periods, high NULLs,
 * extreme outliers, and non-additive rate columns on Turn 1. Returns '' when clean.
 */
export function formatProLoadTraps(dataset: StoredDataset, peerDatasets: StoredDataset[] = []): string {
  const total = dataset.rows.length
  if (total === 0)
    return ''
  const traps: string[] = []

  const joins = detectJoinMapLines(dataset, peerDatasets).filter(l => l.includes('⚠️'))
  traps.push(...joins)

  // Non-unique ID keys when no peer join already reported them
  if (joins.length === 0) {
    for (const col of dataset.columns) {
      if (!ID_KEY_RE.test(col.name))
        continue
      const uniq = new Set<string>()
      let nonNull = 0
      for (const row of dataset.rows) {
        const v = row[col.name]
        if (v !== null && v !== undefined && v !== '') {
          nonNull += 1
          uniq.add(String(v))
        }
      }
      if (uniq.size > 0 && nonNull / uniq.size > 1.15 && total >= 20) {
        // Only flag if this looks like a lookup/dimension table (few non-ID numeric columns)
        const hasMeasure = dataset.columns.some(c => c.type === 'number' && !ID_KEY_RE.test(c.name))
        if (!hasMeasure)
          traps.push(`Key \`${col.name}\` is NOT unique (${nonNull.toLocaleString('en-US')} rows for ${uniq.size.toLocaleString('en-US')} keys — ${(nonNull / uniq.size).toFixed(2)}× fan-out if joined directly).`)
      }
    }
  }

  const partial = detectPartialPeriodLine(dataset)
  if (partial)
    traps.push(partial)

  // Flag categorical columns with >=10% NULL/empty values (silent != trap!)
  const nullCols: string[] = []
  for (const col of dataset.columns) {
    if (col.type === 'number')
      continue
    let missing = 0
    for (const row of dataset.rows) {
      const v = row[col.name]
      if (v === null || v === undefined || v === '')
        missing += 1
    }
    if (missing / total >= 0.1)
      nullCols.push(`\`${col.name}\` (${Math.round((missing / total) * 100)}% NULL — use IS DISTINCT FROM instead of !=)`)
  }
  if (nullCols.length > 0)
    traps.push(`NULL values: ${nullCols.slice(0, 2).join(', ')}.`)

  // Flag non-additive rate/pct columns
  const nonAdd = dataset.columns.filter(c => c.type === 'number' && isNonAdditiveMeasure(c.name, 'sum')).map(c => `\`${c.name}\``)
  if (nonAdd.length > 0)
    traps.push(`Non-additive rate column(s) ${nonAdd.join(', ')}: compute weighted SUM(num)/NULLIF(SUM(den), 0), not AVG/SUM.`)

  if (traps.length === 0)
    return ''
  return `\n> **[PRO DATA GUARD — TURN-1 BRIEF]**\n${traps.slice(0, 4).map(t => `> - ${t}`).join('\n')}`
}
