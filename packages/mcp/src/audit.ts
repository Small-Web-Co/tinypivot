import type { DuckDbRunner, QueryView } from './duckdb.js'
import type { DatasetStore, StoredDataset } from './store.js'
import { quoteIdentifier } from './duckdb.js'
import { extractSqlLineage } from './lineage.js'
import { isNonAdditiveMeasure } from './terminal-chart.js'

/**
 * Pro SQL Audit Oracle & Deterministic SQL Repair Hints.
 *
 * Runs lightweight deterministic checks right after a DuckDB query executes.
 * Completely silent when a query is clean; emits actionable `[AUDIT]` warnings only
 * when a real BI trap is detected (join fan-out, unweighted rate averages, non-additive
 * sums, partial trailing periods, case-mismatched empty filters, or silent NULL drops).
 */

export type AuditKind
  = | 'join_fanout'
    | 'non_additive_sql'
    | 'partial_period'
    | 'empty_filter'
    | 'null_exclusion'
    | 'outlier_distortion'
    | 'duplicate_ids'
    | 'mixed_currency'
    | 'chart_reaggregation'
    | 'analyze_hint'

export interface AuditWarning {
  kind: AuditKind
  title: string
  detail: string
  suggestion: string
}

const RATE_AVG_RE = /\bAVG\s*\(\s*(?:DISTINCT\s+)?(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*\)/gi
const RATE_SUM_RE = /\bSUM\s*\(\s*(?:DISTINCT\s+)?(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*\)/gi
const RATE_COL_RE = /(?:^|[^a-z])(?:share|pct|percent|percentage|rate|margin|ratio|bps|yield|arpu|aov|ltv|cac|roas|ctr|cvr|conversion|nps|avg|mean|median|index|position|rank|ranking)(?:$|[^a-z])|%/i
const UNIT_PRICE_RE = /(?:^|[^a-z])(?:unit_price|price_per|cost_per)(?:$|[^a-z])/i
const CTE_DEF_RE = /\b(?:WITH|,)\s*(?:RECURSIVE\s+)?["`]?([A-Z_][\w$]*)["`]?\s+AS\s*\(/gi
/** A table reference as SQL writes it: a quoted file, or dotted name segments, each bare, "double-quoted" or `backticked`. */
const NAME_SEGMENT = '(?:"[^"]+"|`[^`]+`|[A-Z_][\\w$-]*)'
const TABLE_TOKEN = `'[^']+'|${NAME_SEGMENT}(?:\\.${NAME_SEGMENT})*`
const JOIN_ON_RE = new RegExp(`\\b((?:LEFT|RIGHT|FULL|INNER|CROSS|NATURAL|SEMI|ANTI)(?:\\s+OUTER)?\\s+)?JOIN\\s+(${TABLE_TOKEN})(?:\\s+(?:AS\\s+)?([A-Z_][\\w$]*))?\\s+(?:ON\\s+([^;]+?)(?=\\b(?:LEFT|RIGHT|FULL|INNER|CROSS|JOIN|WHERE|GROUP|HAVING|ORDER|LIMIT|QUALIFY|UNION|WINDOW)\\b|;|$)|USING\\s*\\(([^)]+)\\))`, 'gi')
const SOURCE_RE = new RegExp(`\\b(?:FROM|JOIN)\\s+(${TABLE_TOKEN})(?:\\s+(?:AS\\s+)?([A-Z_][\\w$]*))?`, 'gi')
/** `FROM` inside a function call (`EXTRACT(MONTH FROM order_date)`), which names a column, not a table. */
const FUNCTION_FROM_RE = /\b(?:EXTRACT|SUBSTRING|TRIM|POSITION|OVERLAY)\s*\([^()]*$/i
const FILE_EXT_RE = /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i
const EQ_FILTER_RE = /\b(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*=\s*'([^']+)'/gi
const NEQ_FILTER_RE = /\b(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*(?:!=|<>|NOT\s+IN\s*\()/gi
/** A month bucket: `2026-04`, `2026-04-01`, or a midnight timestamp on the 1st (`2026-04-01 00:00:00`, `2026-04-01T00:00:00.000Z`). */
const YYYY_MM_RE = /^(\d{4})-(\d{2})(?:-01(?:[ T]00:00:00(?:\.0+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?)?$/
const ISO_DATE_RE = /^\d{4}-\d{2}-(\d{2})/
const RESERVED_SQL_ALIASES = new Set(['ON', 'USING', 'WHERE', 'GROUP', 'ORDER', 'LIMIT', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN', 'NATURAL', 'HAVING', 'QUALIFY', 'UNION', 'WINDOW'])

/** Runs one read-only aggregate probe and returns its rows. */
export type ProbeRunner = (sql: string) => Promise<Record<string, unknown>[]>

/** A table the SQL reads. */
export interface SourceRef {
  /** The name as people read it, quotes removed. */
  name: string
  /** The reference exactly as the SQL wrote it, so a probe resolves it the same way the query did. */
  ref: string
  alias?: string
  isFile: boolean
}

/** A table joined in the SQL, with the columns it is joined on. */
export interface JoinTarget extends SourceRef {
  keys: string[]
}

/** A probe's value by column name, in whatever case the database returned it (Snowflake upper-cases names). */
export function probeValue(row: Record<string, unknown> | undefined, key: string): unknown {
  return row?.[key] ?? row?.[key.toUpperCase()]
}

function probeNumber(row: Record<string, unknown> | undefined, key: string): number {
  return Number(probeValue(row, key) ?? 0)
}

/** Runs one probe and turns its first row into a warning. A probe that fails gives no warning, never an error. */
export async function probeOnce(
  run: ProbeRunner,
  sql: string,
  evaluate: (row: Record<string, unknown> | undefined) => AuditWarning | undefined,
): Promise<AuditWarning | undefined> {
  try {
    return evaluate((await run(sql))[0])
  }
  catch {
    return undefined
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

export function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
}

function normalizeCol(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
}

function isRateLikeColumn(col: string): boolean {
  return RATE_COL_RE.test(normalizeCol(col))
}

function isNonAdditiveSumColumn(col: string): boolean {
  const norm = normalizeCol(col)
  return RATE_COL_RE.test(norm) || UNIT_PRICE_RE.test(norm)
}

function quoteTableRef(raw: string, isQuotedFile: boolean): string {
  if (isQuotedFile || FILE_EXT_RE.test(raw))
    return `'${raw.replace(/'/g, '\'\'')}'`
  return quoteIdentifier(raw)
}

function parseCteNames(cleanedSql: string): Set<string> {
  const names = new Set<string>()
  for (const m of cleanedSql.matchAll(CTE_DEF_RE)) {
    if (m[1])
      names.add(m[1].toLowerCase())
  }
  return names
}

function toSourceRef(token: string, rawAlias: string | undefined): SourceRef {
  const isQuotedFile = token.startsWith('\'')
  const name = isQuotedFile ? token.slice(1, -1) : token.replace(/["`]/g, '')
  const alias = rawAlias && !RESERVED_SQL_ALIASES.has(rawAlias.toUpperCase()) ? rawAlias : undefined
  return { name, ref: token, alias, isFile: isQuotedFile || FILE_EXT_RE.test(name) || name.includes('/') }
}

/** The first table or file the SQL reads (CTE names skipped), which single-table audits probe. */
export function primarySource(sql: string): SourceRef | undefined {
  const cleaned = stripComments(sql)
  const ctes = parseCteNames(cleaned)
  for (const m of cleaned.matchAll(SOURCE_RE)) {
    const source = toSourceRef(m[1], m[2])
    if (!ctes.has(source.name.toLowerCase()) && !FUNCTION_FROM_RE.test(cleaned.slice(0, m.index)))
      return source
  }
  return undefined
}

/** True when the SQL reads one table directly: no join, CTE or subquery that could own a column instead. */
export function readsOneTable(sql: string): boolean {
  const cleaned = stripComments(sql)
  return !/\bJOIN\b|\bFROM\s*\(/i.test(cleaned) && parseCteNames(cleaned).size === 0
}

/** Deterministic static audit of non-additive SUM / unweighted AVG traps in SQL. */
export function auditNonAdditiveSql(sql: string): AuditWarning[] {
  const cleaned = stripComments(sql)
  const warnings: AuditWarning[] = []
  const seen = new Set<string>()

  for (const m of cleaned.matchAll(RATE_SUM_RE)) {
    const col = m[1]
    if (!col || !isNonAdditiveSumColumn(col) || seen.has(`sum:${col.toLowerCase()}`))
      continue
    seen.add(`sum:${col.toLowerCase()}`)
    warnings.push({
      kind: 'non_additive_sql',
      title: 'NON-ADDITIVE SUM',
      detail: `\`SUM(${col})\` adds up a rate, percentage, or unit column, which produces an invalid total.`,
      suggestion: `Compute the ratio from additive numerator and denominator totals instead (e.g. \`SUM(numerator) / NULLIF(SUM(denominator), 0)\`).`,
    })
  }

  for (const m of cleaned.matchAll(RATE_AVG_RE)) {
    const col = m[1]
    if (!col || !isRateLikeColumn(col) || seen.has(`avg:${col.toLowerCase()}`))
      continue
    seen.add(`avg:${col.toLowerCase()}`)
    warnings.push({
      kind: 'non_additive_sql',
      title: 'UNWEIGHTED AVERAGE OF RATES',
      detail: `\`AVG(${col})\` weights every row equally regardless of volume/impressions (vulnerable to Simpson's paradox or Search Console position skew).`,
      suggestion: `Prefer a volume-weighted ratio \`SUM(numerator) / NULLIF(SUM(denominator), 0)\` or weighted average \`SUM(${col} * weight) / NULLIF(SUM(weight), 0)\` (e.g. weighted by impressions) when denominator/weight columns exist.`,
    })
  }

  return warnings
}

function extractRightJoinKeys(onClause: string | undefined, usingClause: string | undefined, rightRef: string, rightAlias?: string): string[] {
  if (usingClause)
    return usingClause.split(',').map(s => s.replace(/["`]/g, '').trim()).filter(Boolean)
  if (!onClause)
    return []
  const targets = new Set([rightRef.toLowerCase(), rightRef.split('.').pop()!.toLowerCase()])
  if (rightAlias)
    targets.add(rightAlias.toLowerCase())

  const keys: string[] = []
  const eqPairs = onClause.matchAll(/(?:["`]?([A-Z_][\w$]*)["`]?\.)?["`]?([A-Z_][\w$]*)["`]?\s*=\s*(?:["`]?([A-Z_][\w$]*)["`]?\.)?["`]?([A-Z_][\w$]*)["`]?/gi)
  for (const pair of eqPairs) {
    const [, lhsTbl, lhsCol, rhsTbl, rhsCol] = pair
    if (rhsTbl && targets.has(rhsTbl.toLowerCase()) && rhsCol)
      keys.push(rhsCol)
    else if (lhsTbl && targets.has(lhsTbl.toLowerCase()) && lhsCol)
      keys.push(lhsCol)
    else if (!lhsTbl && !rhsTbl && rhsCol)
      keys.push(rhsCol)
  }
  return [...new Set(keys)]
}

function toJoinTarget(m: RegExpMatchArray, ctes: Set<string>): JoinTarget | undefined {
  const joinKind = (m[1] ?? '').toUpperCase()
  if (joinKind.includes('SEMI') || joinKind.includes('ANTI'))
    return undefined
  const source = toSourceRef(m[2].trim(), m[3]?.trim())
  if (!source.name || ctes.has(source.name.toLowerCase()))
    return undefined
  const keys = extractRightJoinKeys(m[4], m[5], source.name, source.alias)
  return keys.length > 0 ? { ...source, keys } : undefined
}

/** The tables the SQL joins to (CTEs and SEMI/ANTI joins skipped), once per table and key set. */
export function findJoinTargets(sql: string): JoinTarget[] {
  const cleaned = stripComments(sql)
  if (!/\bJOIN\b/i.test(cleaned))
    return []
  const ctes = parseCteNames(cleaned)
  const targets = new Map<string, JoinTarget>()
  for (const m of cleaned.matchAll(JOIN_ON_RE)) {
    const target = toJoinTarget(m, ctes)
    const key = target && `${target.name.toLowerCase()}:${target.keys.join(',').toLowerCase()}`
    if (target && key && !targets.has(key))
      targets.set(key, target)
  }
  return [...targets.values()]
}

/** One aggregate row: how many rows the table has with a non-NULL join key, and how many distinct keys. Portable across DuckDB and every warehouse. */
export function keyGrainSql(tableExpr: string, keyExprs: string[]): string {
  const notNull = keyExprs.map(k => `${k} IS NOT NULL`).join(' AND ')
  return `SELECT SUM(key_rows) AS total_rows, COUNT(*) AS distinct_keys FROM (SELECT COUNT(*) AS key_rows FROM ${tableExpr} WHERE ${notNull} GROUP BY ${keyExprs.join(', ')}) key_grain`
}

/** The fan-out warning when a joined table holds more than one row per join key. */
export function joinFanoutWarning(table: string, keys: string[], row: Record<string, unknown> | undefined): AuditWarning | undefined {
  const total = probeNumber(row, 'total_rows')
  const distinct = probeNumber(row, 'distinct_keys')
  if (!(distinct > 0 && total / distinct > 1.005))
    return undefined
  const mult = (total / distinct).toFixed(2)
  return {
    kind: 'join_fanout',
    title: 'JOIN FAN-OUT / DOUBLE-COUNTING RISK',
    detail: `Joined table \`${table}\` is NOT unique on \`${keys.join(', ')}\` (${total.toLocaleString('en-US')} rows for ${distinct.toLocaleString('en-US')} distinct keys — ${mult}× average fan-out).`,
    suggestion: `Deduplicate or pre-aggregate \`${table}\` to 1 row per \`${keys.join(', ')}\` in a CTE before joining so SUM/COUNT totals are not multiplied.`,
  }
}

function duckProbe(duck: DuckDbRunner, views: QueryView[]): ProbeRunner {
  return async sql => (await duck.run(sql, views, 5)).rows
}

/** Checks joined tables in DuckDB for duplicate join keys that cause row multiplication / double-counting. */
async function auditJoinFanout(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const run = duckProbe(duck, views)
  const warnings = await Promise.all(findJoinTargets(sql).map(target => probeOnce(
    run,
    keyGrainSql(quoteTableRef(target.name, target.isFile), target.keys.map(quoteIdentifier)),
    row => joinFanoutWarning(target.name, target.keys, row),
  )))
  return warnings.filter(isDefined)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The result column that buckets rows by month (3+ distinct months), with its months in order. */
export function findTrailingMonthBucket(rows: Record<string, unknown>[]): { col: string, months: string[] } | undefined {
  if (rows.length < 3)
    return undefined
  const first = rows[0]
  if (!first)
    return undefined
  for (const col of Object.keys(first)) {
    const months: string[] = []
    for (const row of rows) {
      const val = row[col]
      if (typeof val !== 'string')
        continue
      const m = YYYY_MM_RE.exec(val.trim())
      if (m)
        months.push(`${m[1]}-${m[2]}`)
    }
    if (months.length >= 3 && months.length === rows.length) {
      const unique = [...new Set(months)].sort()
      if (unique.length >= 3)
        return { col, months: unique }
    }
  }
  return undefined
}

async function resolveDateColumnInSource(sourceExpr: string, duck: DuckDbRunner, views: QueryView[]): Promise<string | undefined> {
  try {
    const probe = await duck.run(`SELECT * FROM ${sourceExpr} LIMIT 1`, views, 1)
    const row = probe.rows[0]
    if (!row)
      return undefined
    for (const [col, val] of Object.entries(row)) {
      if (typeof val === 'string' && ISO_DATE_RE.test(val.trim()))
        return col
    }
  }
  catch {}
  return undefined
}

/** Active days, last day and metric total of one month in the source. */
export interface MonthDays {
  days: number
  maxDay: string
  metricSum: number
}

/** The first summed column, when it is additive: the metric a partial-period note quotes a daily run-rate for. */
export function leadingAdditiveSum(sql: string): string | undefined {
  const first = new RegExp(RATE_SUM_RE.source, 'i').exec(stripComments(sql))?.[1]
  return first && !isNonAdditiveSumColumn(first) ? first : undefined
}

function runRateNote(metricCol: string | undefined, latest: MonthDays, prevMonth: string, prev: MonthDays | undefined): string {
  if (!metricCol || !prev || prev.days <= 0 || prev.metricSum === 0)
    return ''
  const latestRate = latest.metricSum / latest.days
  const prevRate = prev.metricSum / prev.days
  const pct = ((latestRate - prevRate) / Math.abs(prevRate)) * 100
  return ` Daily run-rate (${metricCol}/day): ${Math.round(latestRate).toLocaleString('en-US')} vs ${Math.round(prevRate).toLocaleString('en-US')} in \`${prevMonth}\` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`
}

/** The partial-period warning when the last of `months` has far fewer active days than the months before it. */
export function partialPeriodWarning(input: {
  months: string[]
  byMonth: Map<string, MonthDays>
  dateCol: string
  metricCol?: string
}): AuditWarning | undefined {
  const { months, byMonth, dateCol, metricCol } = input
  const latestMonth = months[months.length - 1]
  const prevMonths = months.slice(0, -1)
  const latest = byMonth.get(latestMonth)
  const prevCounts = prevMonths.map(m => byMonth.get(m)?.days ?? 0).filter(d => d > 0).sort((a, b) => a - b)
  if (!latest || latest.days === 0 || prevCounts.length === 0)
    return undefined
  const [yr, mo] = latestMonth.split('-').map(Number)
  const medianPrevDays = prevCounts[Math.floor(prevCounts.length / 2)]
  const maxDayOfMonth = Number(ISO_DATE_RE.exec(latest.maxDay)?.[1] ?? latest.days)
  const coverage = Math.max(latest.days, maxDayOfMonth) / daysInMonth(yr, mo)
  if (medianPrevDays < 18 || latest.days >= medianPrevDays * 0.65 || coverage >= 0.72)
    return undefined
  const prevMonth = prevMonths[prevMonths.length - 1]
  return {
    kind: 'partial_period',
    title: 'PARTIAL TRAILING PERIOD',
    detail: `Latest period \`${latestMonth}\` only spans ${latest.days} active day${latest.days === 1 ? '' : 's'} (through ${latest.maxDay}, vs. ${medianPrevDays}-day median in prior months).${runRateNote(metricCol, latest, prevMonth, byMonth.get(prevMonth))}`,
    suggestion: `Do not compare \`${latestMonth}\` raw totals directly against full months — report it as month-to-date (with daily run-rate) or filter \`WHERE ${dateCol} < '${latestMonth}-01'\`.`,
  }
}

/** Detects when the final month in a time-series aggregation only contains a partial slice of days. */
async function auditPartialTrailingPeriod(
  sql: string,
  result: StoredDataset,
  duck: DuckDbRunner,
  views: QueryView[],
): Promise<AuditWarning[]> {
  const bucket = findTrailingMonthBucket(result.rows)
  const source = bucket && primarySource(sql)
  if (!bucket || !source)
    return []
  const sourceExpr = quoteTableRef(source.name, source.isFile)
  const dateCol = await resolveDateColumnInSource(sourceExpr, duck, views)
  if (!dateCol)
    return []

  const qCol = quoteIdentifier(dateCol)
  const metricCol = leadingAdditiveSum(sql)
  const metricExpr = metricCol ? `, SUM(TRY_CAST(${quoteIdentifier(metricCol)} AS DOUBLE)) AS metric_sum` : ''
  try {
    const probe = await duck.run(
      `SELECT STRFTIME(TRY_CAST(${qCol} AS DATE), '%Y-%m') AS ym,
              COUNT(DISTINCT TRY_CAST(${qCol} AS DATE)) AS active_days,
              MAX(TRY_CAST(${qCol} AS DATE)) AS max_day${metricExpr}
       FROM ${sourceExpr}
       WHERE TRY_CAST(${qCol} AS DATE) IS NOT NULL
       GROUP BY 1`,
      views,
      200,
    )
    const byMonth = new Map<string, MonthDays>()
    for (const r of probe.rows) {
      if (typeof r.ym === 'string')
        byMonth.set(r.ym, { days: Number(r.active_days ?? 0), maxDay: String(r.max_day ?? ''), metricSum: Number(r.metric_sum ?? 0) })
    }
    const warning = partialPeriodWarning({ months: bucket.months, byMonth, dateCol, metricCol })
    return warning ? [warning] : []
  }
  catch {
    return []
  }
}

export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

/** Zero-row result with `col = 'val'`: suggests the exact casing or values in the source table. */
async function auditEmptyFilters(whereClause: string, source: SourceRef, sourceExpr: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const warnings: AuditWarning[] = []
  for (const m of whereClause.matchAll(EQ_FILTER_RE)) {
    const [, col, val] = m
    if (!col || !val)
      continue
    try {
      const probe = await duck.run(
        `SELECT DISTINCT CAST(${quoteIdentifier(col)} AS VARCHAR) AS v FROM ${sourceExpr} WHERE ${quoteIdentifier(col)} IS NOT NULL LIMIT 40`,
        views,
        40,
      )
      const vals = probe.rows.map(r => String(r.v ?? '')).filter(Boolean)
      if (vals.length === 0 || vals.includes(val))
        continue
      const exactCase = vals.find(v => v.toLowerCase() === val.toLowerCase())
      const close = exactCase
        ? [exactCase]
        : vals.filter(v => levenshtein(v.toLowerCase(), val.toLowerCase()) <= 2).slice(0, 3)
      const sample = (close.length > 0 ? close : vals.slice(0, 6)).map(v => `'${v}'`).join(', ')
      warnings.push({
        kind: 'empty_filter',
        title: 'ZERO-ROW FILTER MISMATCH',
        detail: `Filter \`${col} = '${val}'\` returned 0 rows.`,
        suggestion: exactCase
          ? `Exact match in \`${source.name}.${col}\` has different casing: \`'${exactCase}'\` (all values: ${vals.slice(0, 6).map(v => `'${v}'`).join(', ')}).`
          : `Available values in \`${source.name}.${col}\`: ${sample}.`,
      })
    }
    catch {}
  }
  return warnings
}

/** Columns filtered with `!=` / `NOT IN` whose NULL rows the filter silently drops (the WHERE does not handle NULL for them). */
export function findNullDroppingColumns(whereClause: string): string[] {
  const cols = new Map<string, string>()
  for (const m of whereClause.matchAll(NEQ_FILTER_RE)) {
    const col = m[1]
    if (!col || cols.has(col.toLowerCase()))
      continue
    const handlesNull = new RegExp(`\\b${col}\\s+IS\\s+(?:NOT\\s+)?NULL|IS\\s+DISTINCT\\s+FROM|COALESCE\\s*\\([^)]*\\b${col}\\b`, 'i').test(whereClause)
    if (!handlesNull)
      cols.set(col.toLowerCase(), col)
  }
  return [...cols.values()]
}

/** One aggregate row: the table's row count and how many of them are NULL in a column. Portable across DuckDB and every warehouse. */
export function nullShareSql(tableExpr: string, colExpr: string): string {
  return `SELECT COUNT(*) AS total_rows, SUM(CASE WHEN ${colExpr} IS NULL THEN 1 ELSE 0 END) AS null_rows FROM ${tableExpr}`
}

/** The NULL-exclusion warning when a `!=` / `NOT IN` column has NULL rows in the source. */
export function nullExclusionWarning(col: string, source: string, row: Record<string, unknown> | undefined): AuditWarning | undefined {
  const total = probeNumber(row, 'total_rows')
  const nulls = probeNumber(row, 'null_rows')
  if (nulls <= 0 || total <= 0)
    return undefined
  const pct = Math.round((nulls / total) * 100)
  return {
    kind: 'null_exclusion',
    title: 'SILENT NULL EXCLUSION',
    detail: `\`!=\` / \`NOT IN\` on \`${col}\` silently excludes ${nulls.toLocaleString('en-US')} NULL rows (${pct}% of \`${source}\`).`,
    suggestion: `Use \`${col} IS DISTINCT FROM '...'\` or \`(${col} IS NULL OR ${col} != '...')\` if rows without a \`${col}\` should be kept.`,
  }
}

/** Detects 0-row case-mismatched string filters and silent NULL exclusions on `!=` / `NOT IN`. */
async function auditFiltersAndNulls(
  sql: string,
  result: StoredDataset,
  duck: DuckDbRunner,
  views: QueryView[],
): Promise<AuditWarning[]> {
  const { whereClause } = extractSqlLineage(stripComments(sql))
  const source = primarySource(sql)
  if (!source || !whereClause)
    return []
  const sourceExpr = quoteTableRef(source.name, source.isFile)
  const run = duckProbe(duck, views)
  const [emptyWarnings, nullWarnings] = await Promise.all([
    result.rows.length === 0 ? auditEmptyFilters(whereClause, source, sourceExpr, duck, views) : [],
    Promise.all(findNullDroppingColumns(whereClause).map(col => probeOnce(
      run,
      nullShareSql(sourceExpr, quoteIdentifier(col)),
      row => nullExclusionWarning(col, source.name, row),
    ))),
  ])
  return [...emptyWarnings, ...nullWarnings.filter(isDefined)]
}

/** Detects chart configs that would re-sum a non-additive measure across duplicate xAxis/series keys. */
export function auditChartReaggregation(dataset: StoredDataset): AuditWarning[] {
  const cfg = dataset.chartConfig
  if (!cfg?.xAxis?.field || !cfg.yAxis?.field)
    return []
  const agg = cfg.yAxis.aggregation ?? 'sum'
  if (agg !== 'sum' || !isNonAdditiveMeasure(cfg.yAxis.field, 'sum'))
    return []
  const xField = cfg.xAxis.field
  const sField = cfg.seriesField?.field
  const seen = new Set<string>()
  let hasDup = false
  for (const row of dataset.rows) {
    const key = `${String(row[xField] ?? '')}::${sField ? String(row[sField] ?? '') : ''}`
    if (seen.has(key)) {
      hasDup = true
      break
    }
    seen.add(key)
  }
  if (!hasDup)
    return []
  return [{
    kind: 'chart_reaggregation',
    title: 'CHART DOUBLE-AGGREGATION',
    detail: `Chart sums non-additive field \`${cfg.yAxis.field}\` across multiple rows sharing the same \`${xField}\`${sField ? ` + \`${sField}\`` : ''}.`,
    suggestion: `Pre-aggregate to 1 row per chart point in SQL using weighted \`SUM(num) / NULLIF(SUM(den), 0)\`.`,
  }]
}

/** Additive summed columns (at most 2) an outlier could distort; none when the WHERE already filters extremes (`ABS(...)`, `> 0`, `BETWEEN`). */
export function findOutlierSumColumns(sql: string): string[] {
  const cleaned = stripComments(sql)
  if (/\bWHERE\b[^;]*(?:ABS\s*\(|<\s*-|>\s*0|BETWEEN)/i.test(cleaned))
    return []
  const cols = new Set<string>()
  for (const m of cleaned.matchAll(RATE_SUM_RE)) {
    if (m[1] && !isNonAdditiveSumColumn(m[1]))
      cols.add(m[1])
  }
  return [...cols].slice(0, 2)
}

/** How a column's extreme rows (over 25× the median magnitude) weigh in its total. */
export interface OutlierStats {
  n: number
  med: number
  totalSum: number
  extremeCount: number
  extremeSum: number
}

export function outlierStats(row: Record<string, unknown> | undefined): OutlierStats {
  return {
    n: probeNumber(row, 'n'),
    med: probeNumber(row, 'med'),
    totalSum: probeNumber(row, 'total_sum'),
    extremeCount: probeNumber(row, 'extreme_count'),
    extremeSum: probeNumber(row, 'extreme_sum'),
  }
}

/** True when 1-5 extreme rows (at most 1% of rows) make up 5%+ of the total. */
export function isOutlierDistortion({ n, med, totalSum, extremeCount, extremeSum }: OutlierStats): boolean {
  const maxAllowed = Math.max(5, Math.floor(n * 0.01))
  return n >= 20 && med > 0 && extremeCount >= 1 && extremeCount <= maxAllowed && Math.abs(extremeSum) >= Math.abs(totalSum) * 0.05
}

export function outlierWarning(source: string, col: string, { med, totalSum, extremeCount, extremeSum }: OutlierStats, sampleNote = ''): AuditWarning {
  return {
    kind: 'outlier_distortion',
    title: 'EXTREME OUTLIER DISTORTION',
    detail: `${extremeCount} extreme row${extremeCount === 1 ? '' : 's'} in \`${source}.${col}\` (median magnitude ${Math.round(med).toLocaleString('en-US')}) contribute ${Math.round(extremeSum).toLocaleString('en-US')} to \`SUM(${col})\` (excluding them: ${Math.round(totalSum - extremeSum).toLocaleString('en-US')}).${sampleNote}`,
    suggestion: `Report both raw and outlier-excluded totals per group (e.g. excluding rows above the outlier threshold) before attributing trends to organic performance.`,
  }
}

/** Up to 3 of the extreme rows, labelled by their first text value, for the outlier warning. */
async function outlierSampleNote(col: string, sourceExpr: string, threshold: number, duck: DuckDbRunner, views: QueryView[]): Promise<string> {
  try {
    const sample = await duck.run(
      `SELECT * FROM ${sourceExpr} WHERE ABS(TRY_CAST(${quoteIdentifier(col)} AS DOUBLE)) > ${threshold} LIMIT 3`,
      views,
      3,
    )
    if (sample.rows.length === 0)
      return ''
    const labels = sample.rows.map((r) => {
      const idVal = Object.entries(r).find(([k, v]) => k !== col && typeof v === 'string' && v.trim() !== '')
      return `${idVal ? `${String(idVal[1])}: ` : ''}${Math.round(Number(r[col] ?? 0)).toLocaleString('en-US')}`
    })
    return ` Top extreme row(s): ${labels.join('; ')}.`
  }
  catch {
    return ''
  }
}

async function auditOutlierColumn(col: string, source: SourceRef, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning | undefined> {
  const sourceExpr = quoteTableRef(source.name, source.isFile)
  const qCol = quoteIdentifier(col)
  try {
    const probe = await duck.run(
      `WITH base AS (SELECT TRY_CAST(${qCol} AS DOUBLE) AS v FROM ${sourceExpr} WHERE TRY_CAST(${qCol} AS DOUBLE) IS NOT NULL),
            stats AS (SELECT COUNT(*) AS n, MEDIAN(ABS(v)) AS med, SUM(v) AS total_sum FROM base)
       SELECT ANY_VALUE(stats.n) AS n,
              ANY_VALUE(stats.med) AS med,
              ANY_VALUE(stats.total_sum) AS total_sum,
              COUNT(*) FILTER (WHERE stats.med > 0 AND ABS(base.v) > stats.med * 25) AS extreme_count,
              COALESCE(SUM(base.v) FILTER (WHERE stats.med > 0 AND ABS(base.v) > stats.med * 25), 0) AS extreme_sum
       FROM base, stats`,
      views,
      1,
    )
    const stats = outlierStats(probe.rows[0])
    if (!isOutlierDistortion(stats))
      return undefined
    return outlierWarning(source.name, col, stats, await outlierSampleNote(col, sourceExpr, stats.med * 25, duck, views))
  }
  catch {
    return undefined
  }
}

/** Detects when 1-5 extreme outlier rows (>25x median magnitude, <=1% of rows) materially distort a SUM aggregation. */
async function auditExtremeOutliers(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const cols = findOutlierSumColumns(sql)
  const source = cols.length > 0 ? primarySource(sql) : undefined
  if (!source)
    return []
  const warnings = await Promise.all(cols.map(col => auditOutlierColumn(col, source, duck, views)))
  return warnings.filter(isDefined)
}

const AUDIT_EVENT_ID_RE = /^(?:event|order|transaction|tx|invoice|payment|receipt|checkout|log)_id$/i
const AUDIT_CURRENCY_RE = /(?:^|_)currency(?:_code)?$/i

/** The primary source of an aggregate query, with its column names read from one sampled row. */
interface SampledSource {
  cleaned: string
  sourceName: string
  sourceExpr: string
  isFile: boolean
  cols: string[]
  duck: DuckDbRunner
  views: QueryView[]
}

/** Duplicate event/order IDs when the SQL does not deduplicate (DISTINCT / ROW_NUMBER / QUALIFY / GROUP BY <id>). */
async function duplicateIdWarning({ cleaned, sourceName, sourceExpr, cols, duck, views }: SampledSource): Promise<AuditWarning | undefined> {
  const eventIdCol = cols.find(c => AUDIT_EVENT_ID_RE.test(c))
  const hasDedup = /\b(?:DISTINCT|ROW_NUMBER\s*\(|QUALIFY)\b/i.test(cleaned)
  if (!eventIdCol || hasDedup || new RegExp(`\\bGROUP\\s+BY[^;]*\\b${eventIdCol}\\b`, 'i').test(cleaned))
    return undefined
  const qId = quoteIdentifier(eventIdCol)
  const probe = await duck.run(`SELECT COUNT(*) AS n, COUNT(DISTINCT ${qId}) AS u FROM ${sourceExpr}`, views, 5)
  const n = Number(probe.rows[0]?.n ?? 0)
  const u = Number(probe.rows[0]?.u ?? 0)
  if (u <= 0 || n / u < 1.03)
    return undefined
  return {
    kind: 'duplicate_ids',
    title: 'DUPLICATE EVENT / ORDER IDS',
    detail: `\`${sourceName}.${eventIdCol}\` has ${n.toLocaleString('en-US')} rows for only ${u.toLocaleString('en-US')} unique IDs (${(n / u).toFixed(2)}× inflation), and this query does not deduplicate.`,
    suggestion: `Deduplicate in a CTE (\`SELECT * FROM ${sourceExpr} QUALIFY ROW_NUMBER() OVER (PARTITION BY ${qId}) = 1\`) before summing.`,
  }
}

/** Mixed currencies summed together without grouping/filtering by currency or using a USD column. */
async function mixedCurrencyWarning({ cleaned, sourceName, sourceExpr, cols, duck, views }: SampledSource): Promise<AuditWarning | undefined> {
  const currCol = cols.find(c => AUDIT_CURRENCY_RE.test(c))
  const summedCols = [...cleaned.matchAll(RATE_SUM_RE)].map(m => m[1]).filter((c): c is string => Boolean(c) && !/_usd$|usd_/i.test(c))
  if (!currCol || new RegExp(`\\b${currCol}\\b`, 'i').test(cleaned) || summedCols.length === 0)
    return undefined
  const qCurr = quoteIdentifier(currCol)
  const probe = await duck.run(`SELECT COUNT(DISTINCT ${qCurr}) AS c, STRING_AGG(DISTINCT CAST(${qCurr} AS VARCHAR), ', ') AS codes FROM ${sourceExpr}`, views, 5)
  const count = Number(probe.rows[0]?.c ?? 0)
  if (count < 2)
    return undefined
  const usdCol = cols.find(c => /_usd$|usd_/i.test(c))
  return {
    kind: 'mixed_currency',
    title: 'MIXED CURRENCIES SUMMED',
    detail: `\`${sourceName}.${currCol}\` mixes ${count} currencies (${String(probe.rows[0]?.codes ?? '')}), so \`SUM(${summedCols[0]})\` adds incompatible currency units.`,
    suggestion: usdCol
      ? `Use \`SUM(${usdCol})\` or group/filter by \`${currCol}\`.`
      : `Convert via FX rates or group/filter by \`${currCol}\` before summing.`,
  }
}

/** A daily time series (45+ days, about one row per day) that `analyze(method="anomalies")` reads better than raw SQL. */
async function seasonalityHint({ sourceName, sourceExpr, cols, duck, views }: SampledSource): Promise<AuditWarning | undefined> {
  const dateCol = cols.find(c => /^(?:date|order_date|day|dt|metric_date)$/i.test(c))
  if (!dateCol || cols.length > 6)
    return undefined
  const qDate = quoteIdentifier(dateCol)
  const dProbe = await duck.run(`SELECT COUNT(*) AS n, COUNT(DISTINCT TRY_CAST(${qDate} AS DATE)) AS d FROM ${sourceExpr}`, views, 5)
  const nRows = Number(dProbe.rows[0]?.n ?? 0)
  const dDays = Number(dProbe.rows[0]?.d ?? 0)
  if (dDays < 45 || nRows > dDays * 1.1)
    return undefined
  return {
    kind: 'analyze_hint',
    title: 'SEASONALITY & REGIME-SHIFT CHECK',
    detail: `\`${sourceName}\` is a ${dDays}-day daily time series — day-of-week seasonality can mask or shift structural break dates in raw SQL.`,
    suggestion: `Call \`analyze(method="anomalies", filePath="${sourceName}")\` to remove day-of-week seasonality and pinpoint exact structural change-point dates.`,
  }
}

/** Smart Pro routing to 1-call deterministic `analyze(...)` when raw SQL over a file touches cohorts, experiments, or dense daily time series. */
async function analyzeRoutingHint(source: SampledSource): Promise<AuditWarning | undefined> {
  const { sourceName, isFile, cols } = source
  if (!isFile)
    return undefined
  const hasCohortCol = cols.some(c => /(?:signup|cohort|join)_(?:month|date|week)|^cohort$/i.test(c))
  const hasActivityCol = cols.some(c => /(?:activity|active|period)_(?:month|date|week)|^months_since$/i.test(c))
  if (hasCohortCol && hasActivityCol) {
    return {
      kind: 'analyze_hint',
      title: 'COHORT RIGHT-CENSORING RISK',
      detail: `\`${sourceName}\` is a cohort activity table — recent cohorts may not have matured to later periods (dragging naive retention averages toward 0%).`,
      suggestion: `Call \`analyze(method="cohort_retention", filePath="${sourceName}")\` for exact matured retention with automatic right-censoring guards.`,
    }
  }
  if (cols.some(c => /^(?:variant|treatment|ab_group|experiment_group|test_group)$/i.test(c))) {
    return {
      kind: 'analyze_hint',
      title: 'EXPERIMENT VALIDITY CHECK (SRM / HOLM / WHALES)',
      detail: `\`${sourceName}\` is an A/B experiment table — raw SQL can miss Sample Ratio Mismatch (SRM), Holm-Bonferroni multiple-testing inflation, or whale-skewed revenue.`,
      suggestion: `Call \`analyze(method="ab_test", filePath="${sourceName}")\` for exact 1-call SRM, Holm-Bonferroni, and top-1% trimmed whale checks.`,
    }
  }
  return hasCohortCol ? undefined : seasonalityHint(source)
}

/** Checks primary source for duplicate event/order IDs or mixed-currency SUMs when the SQL didn't deduplicate or split by currency. */
async function auditDuplicateAndCurrency(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const cleaned = stripComments(sql)
  const source = /\b(?:SUM|COUNT|AVG)\s*\(/i.test(cleaned) ? primarySource(sql) : undefined
  if (!source)
    return []
  const sourceExpr = quoteTableRef(source.name, source.isFile)
  try {
    const sample = await duck.run(`SELECT * FROM ${sourceExpr} LIMIT 1`, views, 1)
    const sampled: SampledSource = { cleaned, sourceName: source.name, sourceExpr, isFile: source.isFile, cols: Object.keys(sample.rows[0] ?? {}), duck, views }
    const checks = [duplicateIdWarning, mixedCurrencyWarning, analyzeRoutingHint].map(check => check(sampled).catch(() => undefined))
    return (await Promise.all(checks)).filter(isDefined)
  }
  catch {
    return []
  }
}

/** Runs SQL audit checks on a finished query result (`deep: true` adds Pro join fan-out, partial-period, NULL, outlier, duplicate-ID & mixed-currency checks). Returns [] when clean. */
export async function auditQueryResult(options: {
  sql: string
  dataset: StoredDataset
  duck: DuckDbRunner
  views: QueryView[]
  deep?: boolean
}): Promise<AuditWarning[]> {
  const { sql, dataset, duck, views, deep = true } = options
  const staticWarnings = [
    ...auditNonAdditiveSql(sql),
    ...auditChartReaggregation(dataset),
  ]
  if (!deep) {
    // Free tier: catch non-additive SQL, chart double-aggregation, and 0-row case-mismatched filters.
    const filterOnly = dataset.rows.length === 0 ? await auditFiltersAndNulls(sql, dataset, duck, views) : []
    return [...staticWarnings, ...filterOnly.filter(w => w.kind === 'empty_filter')]
  }
  const [joinWarnings, periodWarnings, filterWarnings, outlierWarnings, dupCurrWarnings] = await Promise.all([
    auditJoinFanout(sql, duck, views),
    auditPartialTrailingPeriod(sql, dataset, duck, views),
    auditFiltersAndNulls(sql, dataset, duck, views),
    auditExtremeOutliers(sql, duck, views),
    auditDuplicateAndCurrency(sql, duck, views),
  ])
  return [...staticWarnings, ...joinWarnings, ...periodWarnings, ...filterWarnings, ...outlierWarnings, ...dupCurrWarnings]
}

/** Checks whether any Pro deep audit guard triggers on a Free-tier query without exposing Pro diagnostics. Returns 0 when clean. */
export async function peekDeepAuditCount(options: {
  sql: string
  dataset: StoredDataset
  duck: DuckDbRunner
  views: QueryView[]
}): Promise<number> {
  const { sql, dataset, duck, views } = options
  const [joinWarnings, periodWarnings, filterWarnings, outlierWarnings, dupCurrWarnings] = await Promise.all([
    auditJoinFanout(sql, duck, views),
    auditPartialTrailingPeriod(sql, dataset, duck, views),
    auditFiltersAndNulls(sql, dataset, duck, views),
    auditExtremeOutliers(sql, duck, views),
    auditDuplicateAndCurrency(sql, duck, views),
  ])
  const deepOnly = [
    ...joinWarnings,
    ...periodWarnings,
    ...filterWarnings.filter(w => w.kind !== 'empty_filter'),
    ...outlierWarnings,
    ...dupCurrWarnings,
  ]
  return new Map(deepOnly.map(w => [`${w.kind}:${w.title}`, w])).size
}

/** Formats a non-spoiler 1-line Pro Guard preview when Free tier hits a genuine deep analytical trap. */
export function formatProGuardTeaser(count: number): string {
  if (count <= 0)
    return ''
  return `\n> **[TinyPivot Pro Guard]** ${count} deep data-integrity check${count === 1 ? '' : 's'} flagged on this query (join fan-out, partial period, NULL drop, outlier, duplicate ID, or mixed-currency audit). Unlock full diagnostics, auto-fix hints & Recursive Data Memory with TinyPivot Pro: https://tiny-pivot.com/pricing`
}

/** Formats non-empty audit warnings into a concise, high-signal block for the LLM. */
export function formatAuditWarnings(warnings: AuditWarning[]): string {
  if (warnings.length === 0)
    return ''
  const lines = [
    '',
    '> **[AUDIT — VERIFY BEFORE ANSWERING]**',
    ...warnings.map(w => `> - **${w.title}**: ${w.detail} *Fix:* ${w.suggestion}`),
  ]
  return lines.join('\n')
}

/** Deterministic SQL repair hints for common DuckDB syntax & column-name mistakes (especially helpful for weaker LLMs). */
export function formatSqlRepairHint(errorMessage: string, sql: string, store: DatasetStore, sessionKey: string): string {
  const hints: string[] = []

  // 1) Dialect mistakes common in smaller models trained on T-SQL / MySQL / SQLite
  if (/\bSELECT\s+TOP\s+\d+/i.test(sql))
    hints.push('DuckDB uses `LIMIT N` at the end of the query instead of `SELECT TOP N`.')
  if (/\bDATEADD\s*\(/i.test(sql))
    hints.push('DuckDB uses `date_col + INTERVAL \'7 days\'` instead of `DATEADD(...)`.')
  if (/\bGETDATE\s*\(\s*\)/i.test(sql))
    hints.push('DuckDB uses `CURRENT_DATE` or `NOW()` instead of `GETDATE()`.')
  if (/\bISNULL\s*\(/i.test(sql))
    hints.push('DuckDB uses `COALESCE(a, b)` instead of `ISNULL(a, b)`.')
  if (/\bSTRFTIME\s*\(\s*'[^']+'\s*,/i.test(sql))
    hints.push('DuckDB `STRFTIME` takes `(date_expr, \'%Y-%m\')` — date first, format string second (unlike SQLite).')

  // 2) Column-not-found -> fuzzy match against loaded table columns
  const colErr = /Referenced column "([^"]+)" not found/i.exec(errorMessage)
  if (colErr?.[1]) {
    const bad = colErr[1]
    const allCols = store.listMetadata(sessionKey).flatMap(d => d.columns.map(c => ({ table: d.id, col: c.name })))
    const ranked = allCols
      .map(entry => ({ ...entry, dist: levenshtein(bad.toLowerCase(), entry.col.toLowerCase()) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
    if (ranked.length > 0 && ranked[0].dist <= Math.max(3, Math.floor(bad.length / 2))) {
      hints.push(`Closest column${ranked.length > 1 ? 's' : ''}: ${ranked.map(r => `\`${r.col}\` (in \`${r.table}\`)`).join(', ')}.`)
    }
  }

  return hints.length > 0 ? `\nSQL repair hint: ${hints.join(' ')}` : ''
}
