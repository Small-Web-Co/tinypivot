import type { Claim } from './studio-protocol.js'

/**
 * Checks the numbers an agent quotes in an answer against the data it worked from. A number is
 * `found` when a cell of a summary table, a total, a group total (what a pivot shows) or a share
 * of one rounds to it at the precision the agent wrote (1.20M covers 1,195,000 to 1,205,000).
 * Raw tables offer only their totals, so a number does not count as backed just because some
 * row among thousands happens to hold it. Failing that, a number may be the arithmetic an answer
 * does on a small summary table: the gap between two of its cells, or the change from one period's
 * column (or row) to the next. Percentages that are not shares, small counts, and
 * numbers that match nothing are reported as they are rather than guessed at: this marks what
 * the data backs, it does not prove the rest wrong. Links and inline code are not read.
 */

/**
 * A table the answer may quote from: its name, rows, the fields its chart or pivot groups by, and
 * the fields it measures (checked first, so a share is read from what the view shows).
 */
export interface ClaimSource {
  name: string
  rows: Record<string, unknown>[]
  dimensions?: string[]
  measures?: string[]
}

/** `$1.20M`, `48,189,470`, `28.6%`, `-3.5K`, `-$9.9M`. Dates, quarters and ids are skipped by the checks below. */
const NUMBER_RE = /(?<![\w.-])(-?)([$€£]?)(-?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?([KMBk]|mn|bn)?(%)?(?![\w-])/g
/** Thousands, millions and billions; `m` alone is left out, as it is as often minutes or metres. */
const SCALE: Record<string, number> = { K: 1e3, k: 1e3, M: 1e6, mn: 1e6, B: 1e9, bn: 1e9 }
/** Years and tiny counts ("4 regions") are not worth checking. */
const MIN_PLAIN_VALUE = 10
/**
 * Plain whole numbers below this ("10 months", "× 12") are as often arithmetic as data: one the
 * data does not hold is left unchecked rather than flagged.
 */
const SMALL_COUNT = 100
/** Rows read per table: totals cover all of a large raw table, not just its first rows. */
const MAX_ROWS_PER_SOURCE = 500_000
/** Links and inline code: a port or a version number is not a claim about the data. */
const NOT_PROSE_RE = /https?:\/\/\S+|`[^`\n]*`/g
const MAX_CLAIMS = 40

interface ParsedNumber {
  text: string
  value: number
  /** Half the last written digit, scaled: how far the true value may be from `value`. */
  tolerance: number
  percent: boolean
  /** A plain whole number under SMALL_COUNT. */
  small: boolean
}

function parseNumber(match: RegExpMatchArray): ParsedNumber | null {
  const [text, leadingMinus, currency, innerMinus, whole, fraction = '', suffix, percent] = match
  const minus = leadingMinus || innerMinus
  const isYear = !currency && !suffix && !percent && !fraction && /^(?:19|20)\d{2}$/.test(whole)
  if (isYear)
    return null
  const scale = suffix ? SCALE[suffix] : 1
  const unsigned = Number(`${whole.replace(/,/g, '')}.${fraction || '0'}`)
  const value = (minus ? -1 : 1) * unsigned * scale
  if (!percent && !suffix && Math.abs(value) < MIN_PLAIN_VALUE)
    return null
  const tolerance = 0.5 * 10 ** -fraction.length * scale
  const small = !currency && !suffix && !percent && !fraction && Math.abs(value) < SMALL_COUNT
  return { text: text.trim(), value, tolerance, percent: Boolean(percent), small }
}

/** Every number in the text worth checking, in order, without repeats. */
export function extractNumbers(text: string): ParsedNumber[] {
  const seen = new Set<string>()
  const out: ParsedNumber[] = []
  for (const match of text.replace(NOT_PROSE_RE, ' ').matchAll(NUMBER_RE)) {
    const parsed = parseNumber(match)
    if (parsed && !seen.has(parsed.text)) {
      seen.add(parsed.text)
      out.push(parsed)
    }
    if (out.length >= MAX_CLAIMS)
      break
  }
  return out
}

/** A number in the data and where it lives, e.g. "mrr · 2025 Q4". */
interface Candidate {
  value: number
  where: string
}

interface Pool {
  /** Plain numbers: cells of a summary table, totals and group totals. */
  values: Candidate[]
  /** Percentages: shares of a total, and cells of columns that hold percentages. */
  percents: Candidate[]
  /** Gaps between cells of a summary table, compared without sign; checked after the above. */
  gaps: Candidate[]
  /** Changes in percent between periods of a summary table, without sign; checked last. */
  changes: Candidate[]
}

/** Beyond this many rows a table is raw data: its cells are not what an answer quotes, only its totals. */
const SUMMARY_MAX_ROWS = 1_000
/** A text column with at most this many values groups the rows, the way a pivot does. */
const MAX_GROUPS = 50
const PERCENT_COLUMN_RE = /pct|percent|share|rate|ratio|%/i

function rowLabel(row: Record<string, unknown>): string {
  const label = Object.values(row).find(value => typeof value === 'string' && value.trim() !== '')
  return typeof label === 'string' ? label : ''
}

const IS_TYPE = {
  number: (value: unknown) => typeof value === 'number',
  string: (value: unknown) => typeof value === 'string',
}

function columnsOf(rows: Record<string, unknown>[], type: keyof typeof IS_TYPE): string[] {
  const first = rows.find(row => row && typeof row === 'object') ?? {}
  return Object.keys(first).filter(column => rows.some(row => IS_TYPE[type](row[column])))
}

function sumOf(rows: Record<string, unknown>[], column: string): number {
  return rows.reduce((sum, row) => sum + (typeof row[column] === 'number' ? row[column] as number : 0), 0)
}

/** Totals per value of each grouping column, with their shares: the row and column totals of a pivot. */
function groupTotals(rows: Record<string, unknown>[], dimensions: string[], measure: string, total: number, pool: Pool): void {
  for (const dimension of dimensions) {
    const groups = new Map<string, number>()
    for (const row of rows) {
      const key = row[dimension]
      if (typeof key === 'string' && typeof row[measure] === 'number')
        groups.set(key, (groups.get(key) ?? 0) + (row[measure] as number))
      if (groups.size > MAX_GROUPS)
        break
    }
    if (groups.size > MAX_GROUPS)
      continue
    for (const [key, sum] of groups) {
      pool.values.push({ value: sum, where: `${measure} · ${key} (all ${dimension})` })
      if (total !== 0)
        pool.percents.push({ value: (sum / total) * 100, where: `share of ${measure} · ${key}` })
    }
  }
}

/** Each cell of a summary table, and its share of the column total. */
function cells(rows: Record<string, unknown>[], measure: string, total: number, pool: Pool): void {
  const isPercent = PERCENT_COLUMN_RE.test(measure)
  for (const row of rows) {
    const cell = row[measure]
    if (typeof cell !== 'number')
      continue
    const label = rowLabel(row)
    const where = label ? `${measure} · ${label}` : measure
    pool.values.push({ value: cell, where })
    if (isPercent)
      pool.percents.push({ value: cell, where })
    else if (total !== 0)
      pool.percents.push({ value: (cell / total) * 100, where: `share of ${measure} · ${label || 'total'}` })
  }
}

/** A summary table this small is one an answer does arithmetic on; larger ones offer too many pairs. */
const DERIVED_MAX_ROWS = 50

/** `mrr_2025` and `mrr_2026` are one measure in two periods: the same name once digits are gone. */
function periodStem(column: string): string {
  return column.replace(/\d+/g, '#')
}

/** Gaps and changes between period columns of each row, e.g. mrr_2025 → mrr_2026 for APAC. */
function rowChanges(rows: Record<string, unknown>[], measures: string[], pool: Pool): void {
  for (const [i, first] of measures.entries()) {
    for (const second of measures.slice(i + 1)) {
      if (periodStem(first) !== periodStem(second) || first === second)
        continue
      // Earlier period first, whichever column the view measures: mrr_2025 → mrr_2026.
      const [from, to] = [first, second].sort()
      for (const row of rows)
        addChange(row[from], row[to], `${from} → ${to} · ${rowLabel(row)}`, pool)
    }
  }
}

/** Gaps between the rows of one column, and changes between rows that share a label (long periods). */
function columnGaps(rows: Record<string, unknown>[], measure: string, pool: Pool): void {
  for (const [i, a] of rows.entries()) {
    for (const b of rows.slice(i + 1)) {
      const [labelA, labelB] = [rowLabel(a), rowLabel(b)]
      if (labelA === labelB)
        addChange(a[measure], b[measure], `${measure} · ${labelA}, one row to the next`, pool)
      else if (typeof a[measure] === 'number' && typeof b[measure] === 'number')
        pool.gaps.push({ value: Math.abs((a[measure] as number) - (b[measure] as number)), where: `${measure} · ${labelA} − ${labelB}` })
    }
  }
}

function addChange(from: unknown, to: unknown, where: string, pool: Pool): void {
  if (typeof from !== 'number' || typeof to !== 'number')
    return
  pool.gaps.push({ value: Math.abs(to - from), where: `change in ${where}` })
  if (from !== 0)
    pool.changes.push({ value: Math.abs((to / from - 1) * 100), where: `change in ${where}` })
}

/** The view's measures first, then the table's other number columns. */
function measuresFirst(columns: string[], measures: string[] = []): string[] {
  const shown = measures.filter(measure => columns.includes(measure))
  return [...shown, ...columns.filter(column => !shown.includes(column))]
}

/** The numbers an answer could quote from one table. */
function candidatesFor(source: ClaimSource): Pool {
  const pool: Pool = { values: [], percents: [], gaps: [], changes: [] }
  const rows = source.rows.slice(0, MAX_ROWS_PER_SOURCE)
  const summary = source.rows.length <= SUMMARY_MAX_ROWS
  // A raw table groups only the way its chart or pivot does; every grouping of thousands of rows
  // would offer a share close to almost any round percentage.
  const dimensions = summary ? columnsOf(rows, 'string') : (source.dimensions ?? [])
  pool.values.push({ value: source.rows.length, where: `rows in ${source.name}` })
  const measures = measuresFirst(columnsOf(rows, 'number'), source.measures)
  for (const measure of measures) {
    const total = sumOf(rows, measure)
    // Cells first: when a cell and a group total agree, the cell is the plainer reference.
    if (summary)
      cells(rows, measure, total, pool)
    pool.values.push({ value: total, where: `${measure} · total of ${source.name}` })
    groupTotals(rows, dimensions, measure, total, pool)
  }
  if (rows.length <= DERIVED_MAX_ROWS) {
    rowChanges(rows, measures, pool)
    for (const measure of measures.filter(measure => !PERCENT_COLUMN_RE.test(measure)))
      columnGaps(rows, measure, pool)
  }
  return pool
}

function closest(value: number, tolerance: number, candidates: Candidate[]): Candidate | undefined {
  return candidates.find(candidate => Math.abs(candidate.value - value) <= tolerance + 1e-9)
}

/** Where the data backs a number: a direct value first, then a gap or change worked out from it. */
function backing(claim: ParsedNumber, pools: Pool[]): Candidate | undefined {
  const [direct, derived] = claim.percent ? ['percents', 'changes'] as const : ['values', 'gaps'] as const
  return closest(claim.value, claim.tolerance, pools.flatMap(pool => pool[direct]))
    ?? closest(Math.abs(claim.value), claim.tolerance, pools.flatMap(pool => pool[derived]))
}

/** The numbers in `text`, each marked with whether the data backs it and where. */
export function checkClaims(text: string, sources: ClaimSource[]): Claim[] {
  const claims = extractNumbers(text)
  if (claims.length === 0 || sources.length === 0)
    return []
  const pools = sources.map(candidatesFor)
  return claims.map((claim) => {
    const match = backing(claim, pools)
    if (match)
      return { text: claim.text, status: 'found', where: match.where }
    return { text: claim.text, status: claim.percent || claim.small ? 'unchecked' : 'not-found' }
  })
}
