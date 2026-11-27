import type { DuckDbRunner } from './duckdb.js'
import type { ColumnSummary, StoredDataset } from './store.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { inspectXlsxBuffer } from '@smallwebco/tinypivot-core'
import { quoteLiteral } from './duckdb.js'
import { isNonAdditiveMeasure } from './terminal-chart.js'

/**
 * A compact description of each column, so the model can plan filters and queries without
 * reading rows: how much is missing, the range of numbers and dates, and the commonest values.
 * In Pro mode, also surfaces relational grain, cross-table join cardinality (fan-out warnings),
 * partial trailing periods, and non-additive rate/percentage columns.
 */

const TOP_VALUES = 3
const ID_KEY_RE = /(?:^|_)id$|_key$|^sku$|^code$|^account$/i
const PRIMARY_EVENT_ID_RE = /^(?:event|order|transaction|tx|invoice|payment|receipt|checkout|log)_id$/i
const CURRENCY_COL_RE = /(?:^|_)currency(?:_code)?$/i
const AMOUNT_COL_RE = /(?:^|_)(?:amount|revenue|sales|price|spend|mrr|arr|total|value|aov)(?:$|_)/i
const MEASURE_OUTLIER_RE = /(?:^|_)(?:amount|revenue|sales|order_value|spend|mrr|total|value|aov|ltv)(?:$|_)/i
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

function detectDuplicateEventId(dataset: StoredDataset): string | undefined {
  const total = dataset.rows.length
  if (total < 10)
    return undefined
  for (const col of dataset.columns) {
    if (!PRIMARY_EVENT_ID_RE.test(col.name))
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
    if (uniq.size > 0 && nonNull / uniq.size >= 1.03)
      return `Duplicate \`${col.name}\` values (${nonNull.toLocaleString('en-US')} rows for ${uniq.size.toLocaleString('en-US')} unique IDs — ${(nonNull / uniq.size).toFixed(2)}× inflation; deduplicate with \`QUALIFY ROW_NUMBER() OVER (PARTITION BY ${col.name}) = 1\` before summing).`
  }
  return undefined
}

function detectMixedCurrency(dataset: StoredDataset): string | undefined {
  const currCol = dataset.columns.find(c => c.type !== 'number' && CURRENCY_COL_RE.test(c.name))
  if (!currCol)
    return undefined
  const amtCol = dataset.columns.find(c => c.type === 'number' && AMOUNT_COL_RE.test(c.name) && !/_usd$/i.test(c.name))
  if (!amtCol)
    return undefined
  const codes = new Set<string>()
  for (const row of dataset.rows) {
    const v = row[currCol.name]
    if (typeof v === 'string' && v.trim())
      codes.add(v.trim().toUpperCase())
  }
  if (codes.size < 2)
    return undefined
  const usdCol = dataset.columns.find(c => c.type === 'number' && /_usd$|usd_/i.test(c.name))
  const fix = usdCol ? `use \`${usdCol.name}\` or group by \`${currCol.name}\`` : `convert via FX rates or group by \`${currCol.name}\``
  return `Mixed currencies in \`${currCol.name}\` (${[...codes].slice(0, 5).join(', ')}) — never SUM raw \`${amtCol.name}\` across currencies; ${fix}.`
}

function detectLoadOutlier(dataset: StoredDataset): string | undefined {
  const total = dataset.rows.length
  if (total < 30)
    return undefined
  for (const col of dataset.columns) {
    if (col.type !== 'number' || !MEASURE_OUTLIER_RE.test(col.name))
      continue
    const vals: number[] = []
    let sum = 0
    for (const row of dataset.rows) {
      const n = Number(row[col.name])
      if (Number.isFinite(n) && n > 0) {
        vals.push(n)
        sum += n
      }
    }
    if (vals.length < 30 || sum <= 0)
      continue
    vals.sort((a, b) => a - b)
    const med = vals[Math.floor(vals.length / 2)]
    const max = vals[vals.length - 1]
    if (med <= 0 || max / med < 25)
      continue
    const topK = Math.max(1, Math.min(5, Math.ceil(vals.length * 0.01)))
    const topSum = vals.slice(-topK).reduce((s, v) => s + v, 0)
    const share = topSum / sum
    if (share >= 0.2)
      return `Extreme outliers in \`${col.name}\` (max ${compactNumber(max)} vs. median ${compactNumber(med)}; top ${topK} row${topK === 1 ? '' : 's'} = ${Math.round(share * 100)}% of total — verify median/trimmed totals & inspect outlier rows).`
  }
  return undefined
}

function isBinaryNumericCol(dataset: StoredDataset, colName: string): boolean {
  const seen = new Set<number>()
  for (const row of dataset.rows) {
    const v = row[colName]
    if (v === null || v === undefined || v === '')
      continue
    const n = Number(v)
    if (!Number.isFinite(n))
      return false
    seen.add(n)
    if (seen.size > 2)
      return false
  }
  return seen.size === 2 && seen.has(0) && seen.has(1)
}

function countDistinctStrings(dataset: StoredDataset, colName: string): number {
  const seen = new Set<string>()
  for (const row of dataset.rows) {
    const v = row[colName]
    if (v !== null && v !== undefined && v !== '')
      seen.add(String(v))
  }
  return seen.size
}

/**
 * Turn-1 Pro Smart Routing Hint: recognizes common statistical & relational schemas on load
 * so the agent jumps straight to the deterministic 1-call `analyze` method (or pre-aggregated CTE)
 * instead of spending 4-6 exploratory SQL turns.
 */
function detectSmartRoutingHint(dataset: StoredDataset, peerDatasets: StoredDataset[]): string | undefined {
  const cols = dataset.columns
  const names = cols.map(c => c.name)
  const has = (re: RegExp) => names.find(n => re.test(n))

  if (peerDatasets.length >= 2) {
    const sharedFactPeers = detectJoinMapLines(dataset, peerDatasets).filter(l => l.includes('⚠️'))
    if (sharedFactPeers.length > 0) {
      const key = names.find(n => ID_KEY_RE.test(n) && peerDatasets.every(p => p.columns.some(c => c.name === n)))
      if (key)
        return `Shortcut: multi-fact chasm trap on \`${key}\` — pre-aggregate each fact table by \`${key}\` in separate CTEs before joining to avoid row multiplication.`
    }
  }

  const variantCol = has(/^(?:variant|treatment|arm|exp_group|test_group|ab_group|group)$/i)
  const convOrTrial = has(/^(?:converted|conversions?|trials?|impressions?|clicks?|revenue|spend|order_value)$/i)
  if (variantCol && convOrTrial && countDistinctStrings(dataset, variantCol) === 2)
    return `Shortcut: experiment schema detected (\`${variantCol}\`) — skip manual SQL and call \`analyze(method="ab_test")\` directly (auto-runs SRM χ² + Holm-Bonferroni + outlier stress-test).`

  const dayCol = cols.find(c => c.type === 'date' || /^(?:day|date|order_date|event_date)$/i.test(c.name))
  const numMetrics = cols.filter(c => c.type === 'number' && !ID_KEY_RE.test(c.name))
  if (dayCol && numMetrics.length === 1 && dataset.rows.length >= 28) {
    const uniqueDays = countDistinctStrings(dataset, dayCol.name)
    if (uniqueDays >= 28 && uniqueDays / dataset.rows.length >= 0.95)
      return `Shortcut: daily time-series (\`${dayCol.name}\`, \`${numMetrics[0].name}\`) — call \`analyze(method="anomalies")\` directly for day-of-week deseasonalized anomaly & structural change-point detection.`
  }

  const userCol = has(/^(?:user_id|customer_id|account_id|member_id)$/i)
  if (userCol && dayCol && numMetrics.length === 0 && dataset.rows.length >= 50) {
    const months = new Set<string>()
    for (const row of dataset.rows) {
      const m = typeof row[dayCol.name] === 'string' ? ISO_DAY_RE.exec(row[dayCol.name] as string) : null
      if (m)
        months.add(`${m[1]}-${m[2]}`)
    }
    if (months.size >= 3)
      return `Shortcut: user activity log (\`${userCol}\`, \`${dayCol.name}\`) — call \`analyze(method="cohort_retention")\` directly (automatically masks right-censored immature cohorts).`
  }

  const treatCol = has(/^(?:discount|discounted|promo|treated|treatment|campaign|coupon|has_discount)$/i)
  const outcomeCol = has(/^(?:renewed|churned|retained|converted|purchased|revenue|ltv)$/i)
  if (treatCol && outcomeCol && isBinaryNumericCol(dataset, treatCol)) {
    const covariates = cols.filter(c => c.type === 'number' && c.name !== treatCol && c.name !== outcomeCol && !ID_KEY_RE.test(c.name))
    if (covariates.length >= 1)
      return `Shortcut: observational treatment (\`${treatCol}\` → \`${outcomeCol}\`) with covariates (${covariates.slice(0, 3).map(c => `\`${c.name}\``).join(', ')}) — call \`analyze(method="regression")\` directly to test for confounding / sign reversal.`
  }

  const periodCol = has(/^(?:period|quarter|month|year|cohort_period)$/i)
  const segCol = has(/^(?:segment|channel|region|tier|plan|device|country)$/i)
  const numCol = has(/^(?:converted|conversions?|clicks?|orders?|retained|wins?)$/i)
  const denCol = has(/^(?:visits?|sessions?|impressions?|trials?|leads?|users?)$/i)
  if (periodCol && segCol && numCol && denCol) {
    const periods = countDistinctStrings(dataset, periodCol)
    if (periods >= 2 && periods <= 6)
      return `Shortcut: segmented period rate (\`${numCol}\`/\`${denCol}\` by \`${segCol}\` across \`${periodCol}\`) — call \`analyze(method="explain_change")\` directly for exact Kitagawa rate-vs-mix & Simpson's paradox decomposition.`
  }

  return undefined
}

/**
 * Compact Pro trap & smart-routing brief appended to `load_file` ONLY when traps or
 * 1-call analytical shortcuts apply. Saves 3-6 exploratory SQL turns by surfacing join fan-out,
 * duplicate IDs, mixed currencies, partial periods, high NULLs, extreme outliers, non-additive
 * rates, and 1-call `analyze` shortcuts on Turn 1. Returns '' when clean.
 */
export function formatProLoadTraps(dataset: StoredDataset, peerDatasets: StoredDataset[] = []): string {
  const total = dataset.rows.length
  if (total === 0)
    return ''
  const traps: string[] = []

  const joins = detectJoinMapLines(dataset, peerDatasets).filter(l => l.includes('⚠️'))
  traps.push(...joins)

  const dupEvent = detectDuplicateEventId(dataset)
  if (dupEvent)
    traps.push(dupEvent)

  if (joins.length === 0 && !dupEvent) {
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
        const hasMeasure = dataset.columns.some(c => c.type === 'number' && !ID_KEY_RE.test(c.name))
        if (!hasMeasure)
          traps.push(`Key \`${col.name}\` is NOT unique (${nonNull.toLocaleString('en-US')} rows for ${uniq.size.toLocaleString('en-US')} keys — ${(nonNull / uniq.size).toFixed(2)}× fan-out if joined directly).`)
      }
    }
  }

  const mixedCurr = detectMixedCurrency(dataset)
  if (mixedCurr)
    traps.push(mixedCurr)

  const partial = detectPartialPeriodLine(dataset)
  if (partial)
    traps.push(partial)

  const outlier = detectLoadOutlier(dataset)
  if (outlier)
    traps.push(outlier)

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

  const nonAdd = dataset.columns.filter(c => c.type === 'number' && isNonAdditiveMeasure(c.name, 'sum')).map(c => `\`${c.name}\``)
  if (nonAdd.length > 0)
    traps.push(`Non-additive rate column(s) ${nonAdd.join(', ')}: compute weighted SUM(num)/NULLIF(SUM(den), 0), not AVG/SUM.`)

  const shortcut = detectSmartRoutingHint(dataset, peerDatasets)
  if (shortcut)
    traps.push(shortcut)

  if (traps.length === 0)
    return ''
  return `\n> **[PRO DATA GUARD — TURN-1 BRIEF]**\n${traps.slice(0, 5).map(t => `> - ${t}`).join('\n')}`
}

const TABULAR_EXTS = new Set(['.csv', '.tsv', '.json', '.jsonl', '.ndjson', '.parquet', '.xlsx'])
const DOC_EXTS = new Set(['.md', '.txt', '.html', '.htm', '.pdf', '.xml'])
const IGNORED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist'])
const MAX_DIR_DEPTH = 3
const MAX_SCANNED_FILES = 60
const MAX_SCHEMA_PROBES = 25

interface DiscoveredFile {
  absPath: string
  relPath: string
  ext: string
  sizeBytes: number
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1_048_576)
    return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024)
    return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

async function walkDataDir(rootDir: string, currentDir: string, depth: number, out: DiscoveredFile[]): Promise<void> {
  if (depth > MAX_DIR_DEPTH || out.length >= MAX_SCANNED_FILES)
    return
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (out.length >= MAX_SCANNED_FILES)
      break
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name))
      continue
    const full = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      await walkDataDir(rootDir, full, depth + 1, out)
      continue
    }
    if (!entry.isFile())
      continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!TABULAR_EXTS.has(ext) && !DOC_EXTS.has(ext))
      continue
    const stat = await fs.stat(full)
    out.push({ absPath: full, relPath: path.relative(rootDir, full), ext, sizeBytes: stat.size })
  }
}

async function probeTabularSchema(
  file: DiscoveredFile,
  duck?: DuckDbRunner,
): Promise<{ detail: string, colNames: string[] }> {
  if (file.ext === '.xlsx') {
    const buf = await fs.readFile(file.absPath)
    const info = await inspectXlsxBuffer(buf)
    const sheetSummaries = info.sheets && info.sheets.length > 0 ? info.sheets : []
    const colNames = [...new Set(sheetSummaries.flatMap(s => s.columns.slice(0, 12)))]
    if (sheetSummaries.length <= 1) {
      const first = sheetSummaries[0]
      const hdrNote = first && first.headerRow > 1 ? `, hdr row ${first.headerRow}` : ''
      const colsNote = first?.columns.length ? ` · cols: ${first.columns.slice(0, 12).join(', ')}${first.columns.length > 12 ? ` (+${first.columns.length - 12})` : ''}` : ''
      const notePreview = first?.notes.length ? ` · note: "${first.notes[0].slice(0, 120)}"` : ''
      return {
        detail: `sheet [${info.sheetNames[0] ?? 'Sheet1'}] (${info.rowCount} rows${hdrNote})${colsNote}${notePreview}`,
        colNames,
      }
    }
    const perSheet = sheetSummaries.slice(0, 4).map((s) => {
      const cols = s.columns.slice(0, 6).join(', ')
      const more = s.columns.length > 6 ? ` (+${s.columns.length - 6})` : ''
      return `\`${s.name}\` (${s.rowCount}r: ${cols}${more})`
    }).join('; ')
    const extraSheets = info.sheetNames.length > 4 ? `; +${info.sheetNames.length - 4} more sheets` : ''
    const notePreview = info.notes?.length ? ` · note: "${info.notes[0].slice(0, 120)}"` : ''
    return {
      detail: `${info.sheetNames.length} sheets [${info.sheetNames.slice(0, 6).join(', ')}${info.sheetNames.length > 6 ? ', …' : ''}] · ${perSheet}${extraSheets}${notePreview}`,
      colNames,
    }
  }
  if (!duck)
    return { detail: file.ext.slice(1), colNames: [] }
  const expr = file.ext === '.json' || file.ext === '.jsonl' || file.ext === '.ndjson'
    ? `read_json_auto(${quoteLiteral(file.absPath)})`
    : file.ext === '.parquet'
      ? `read_parquet(${quoteLiteral(file.absPath)})`
      : `read_csv_auto(${quoteLiteral(file.absPath)}, sample_size=2048)`
  const res = await duck.run(`DESCRIBE SELECT * FROM ${expr}`, [], 30)
  const colNames = res.rows.map(r => String(r.column_name ?? '')).filter(Boolean)
  const shown = res.rows.slice(0, 10).map(r => `\`${r.column_name}\` ${String(r.column_type ?? '').toLowerCase()}`)
  const more = res.rows.length > 10 ? ` (+${res.rows.length - 10} cols)` : ''
  return { detail: `${res.rows.length} cols: ${shown.join(', ')}${more}`, colNames }
}

interface TabularUnit {
  label: string
  rep: DiscoveredFile
  count: number
  totalBytes: number
  globHint?: string
}

function collapsePartitionedFiles(files: DiscoveredFile[]): TabularUnit[] {
  const buckets = new Map<string, DiscoveredFile[]>()
  for (const f of files) {
    const dir = path.dirname(f.relPath)
    const stem = path.basename(f.relPath, f.ext)
    const pattern = /\d+/.test(stem) ? `${dir}::${stem.replace(/\d+/g, '*')}::${f.ext}` : `single::${f.relPath}`
    const list = buckets.get(pattern) ?? []
    list.push(f)
    buckets.set(pattern, list)
  }
  const units: TabularUnit[] = []
  for (const [, group] of buckets) {
    if (group.length >= 3 && group[0].ext !== '.xlsx') {
      const first = group[0]
      const dir = path.dirname(first.relPath)
      const stemPattern = path.basename(first.relPath, first.ext).replace(/\d+/g, '*')
      const globRel = dir === '.' ? `${stemPattern}${first.ext}` : `${dir}/${stemPattern}${first.ext}`
      const globAbs = path.join(path.dirname(first.absPath), `${stemPattern}${first.ext}`)
      const reader = first.ext === '.parquet'
        ? `read_parquet(${quoteLiteral(globAbs)}, union_by_name=true)`
        : first.ext === '.json' || first.ext === '.jsonl' || first.ext === '.ndjson'
          ? `read_json_auto(${quoteLiteral(globAbs)}, union_by_name=true)`
          : `read_csv_auto(${quoteLiteral(globAbs)}, union_by_name=true)`
      units.push({
        label: `${globRel} (${group.length} partitioned files: \`${path.basename(first.relPath)}\` … \`${path.basename(group[group.length - 1].relPath)}\`)`,
        rep: group[group.length - 1],
        count: group.length,
        totalBytes: group.reduce((sum, x) => sum + x.sizeBytes, 0),
        globHint: reader,
      })
    }
    else {
      for (const f of group) {
        units.push({ label: f.relPath, rep: f, count: 1, totalBytes: f.sizeBytes })
      }
    }
  }
  return units
}

/**
 * 1-call local data-lake profiler: scans a directory for tabular & doc files, collapses partitioned
 * file series into DuckDB glob hints, inspects schemas via DuckDB metadata (`DESCRIBE`) / ExcelJS
 * (with smart header-row & preamble-note detection) without pasting raw rows into context, and
 * (in Pro) surfaces cross-file shared join keys.
 */
export async function profileDirectory(
  dirPath: string,
  options: { duck?: DuckDbRunner, isPro?: boolean } = {},
): Promise<string> {
  const resolved = path.resolve(dirPath)
  const stat = await fs.stat(resolved)
  if (!stat.isDirectory())
    throw new Error(`Not a directory: ${dirPath}`)

  const discovered: DiscoveredFile[] = []
  await walkDataDir(resolved, resolved, 0, discovered)
  if (discovered.length === 0)
    return `Folder **${resolved}**: no supported data or doc files found.`

  const tabular = discovered.filter(f => TABULAR_EXTS.has(f.ext))
  const docs = discovered.filter(f => DOC_EXTS.has(f.ext))
  const units = collapsePartitionedFiles(tabular)
  const lines = [
    `Folder **${resolved}**: ${tabular.length} data file${tabular.length === 1 ? '' : 's'}${units.length < tabular.length ? ` (${units.length} table groups)` : ''}, ${docs.length} doc file${docs.length === 1 ? '' : 's'}${discovered.length >= MAX_SCANNED_FILES ? ` (first ${MAX_SCANNED_FILES} shown)` : ''}.`,
  ]

  const colToFiles = new Map<string, string[]>()
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    const globSuffix = u.globHint ? ` · SQL glob: \`${u.globHint}\`` : ''
    if (i < MAX_SCHEMA_PROBES) {
      try {
        const { detail, colNames } = await probeTabularSchema(u.rep, options.duck)
        lines.push(`- \`${u.label}\` (${formatByteSize(u.totalBytes)}) · ${detail}${globSuffix}`)
        for (const col of colNames) {
          const key = col.toLowerCase()
          const list = colToFiles.get(key) ?? []
          if (!list.includes(u.label))
            list.push(u.label)
          colToFiles.set(key, list)
        }
      }
      catch {
        lines.push(`- \`${u.label}\` (${formatByteSize(u.totalBytes)})${globSuffix}`)
      }
    }
    else {
      lines.push(`- \`${u.label}\` (${formatByteSize(u.totalBytes)})${globSuffix}`)
    }
  }

  if (docs.length > 0) {
    const docList = docs.slice(0, 15).map(d => `\`${d.relPath}\` (${formatByteSize(d.sizeBytes)})`).join(', ')
    lines.push('', `Docs: ${docList}${docs.length > 15 ? ` (+${docs.length - 15} more)` : ''}`)
  }

  if (options.isPro) {
    const shared = [...colToFiles.entries()]
      .filter(([, files]) => files.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6)
    if (shared.length > 0) {
      lines.push('', `Shared columns across files: ${shared.map(([c, fsList]) => `\`${c}\` (${fsList.length} files)`).join(' · ')}`)
    }
  }
  return lines.join('\n')
}
