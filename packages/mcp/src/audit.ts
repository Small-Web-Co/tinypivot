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
const RATE_COL_RE = /(?:^|[^a-z])(?:share|pct|percent|percentage|rate|margin|ratio|bps|yield|arpu|aov|ltv|cac|roas|ctr|cvr|conversion|nps|avg|mean|median|index)(?:$|[^a-z])|%/i
const UNIT_PRICE_RE = /(?:^|[^a-z])(?:unit_price|price_per|cost_per)(?:$|[^a-z])/i
const CTE_DEF_RE = /\b(?:WITH|,)\s*(?:RECURSIVE\s+)?["`]?([A-Z_][\w$]*)["`]?\s+AS\s*\(/gi
const JOIN_ON_RE = /\b((?:LEFT|RIGHT|FULL|INNER|CROSS|NATURAL|SEMI|ANTI)(?:\s+OUTER)?\s+)?JOIN\s+(?:'([^']+)'|"([^"]+)"|([A-Z_][\w.-]*))(?:\s+(?:AS\s+)?([A-Z_][\w$]*))?\s+(?:ON\s+([^\n;]+?)(?=\b(?:LEFT|RIGHT|FULL|INNER|CROSS|JOIN|WHERE|GROUP|HAVING|ORDER|LIMIT|QUALIFY|UNION|WINDOW)\b|;|$)|USING\s*\(([^)]+)\))/gi
const EQ_FILTER_RE = /\b(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*=\s*'([^']+)'/gi
const NEQ_FILTER_RE = /\b(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*(?:!=|<>|NOT\s+IN\s*\()/gi
const YYYY_MM_RE = /^(\d{4})-(\d{2})(?:-01)?$/
const ISO_DATE_RE = /^\d{4}-\d{2}-(\d{2})/
const RESERVED_SQL_ALIASES = new Set(['ON', 'USING', 'WHERE', 'GROUP', 'ORDER', 'LIMIT', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'JOIN'])

function stripComments(sql: string): string {
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
  if (isQuotedFile || /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i.test(raw))
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
      detail: `\`AVG(${col})\` weights every row equally regardless of volume (vulnerable to Simpson's paradox).`,
      suggestion: `Prefer a volume-weighted ratio \`SUM(numerator) / NULLIF(SUM(denominator), 0)\` when numerator/denominator columns exist.`,
    })
  }

  return warnings
}

function extractRightJoinKeys(onClause: string | undefined, usingClause: string | undefined, rightRef: string, rightAlias?: string): string[] {
  if (usingClause)
    return usingClause.split(',').map(s => s.replace(/["`]/g, '').trim()).filter(Boolean)
  if (!onClause)
    return []
  const targets = new Set([rightRef.toLowerCase()])
  if (rightAlias && !RESERVED_SQL_ALIASES.has(rightAlias.toUpperCase()))
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

/** Checks joined tables in DuckDB for duplicate join keys that cause row multiplication / double-counting. */
async function auditJoinFanout(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const cleaned = stripComments(sql)
  if (!/\bJOIN\b/i.test(cleaned))
    return []

  const ctes = parseCteNames(cleaned)
  const warnings: AuditWarning[] = []
  const checked = new Set<string>()

  for (const m of cleaned.matchAll(JOIN_ON_RE)) {
    const joinKind = (m[1] ?? '').toUpperCase()
    if (joinKind.includes('SEMI') || joinKind.includes('ANTI'))
      continue
    const isFile = Boolean(m[2])
    const tableName = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    const rawAlias = m[5]?.trim()
    const alias = rawAlias && !RESERVED_SQL_ALIASES.has(rawAlias.toUpperCase()) ? rawAlias : undefined
    if (!tableName || ctes.has(tableName.toLowerCase()))
      continue

    const keys = extractRightJoinKeys(m[6], m[7], tableName, alias)
    if (keys.length === 0)
      continue

    const checkKey = `${tableName.toLowerCase()}:${keys.join(',').toLowerCase()}`
    if (checked.has(checkKey))
      continue
    checked.add(checkKey)

    const tableExpr = quoteTableRef(tableName, isFile)
    const keyTuple = keys.length === 1
      ? quoteIdentifier(keys[0])
      : `CONCAT_WS('|', ${keys.map(k => `COALESCE(CAST(${quoteIdentifier(k)} AS VARCHAR), '<NULL>')`).join(', ')})`
    try {
      const probe = await duck.run(
        `SELECT COUNT(*) AS total_rows, COUNT(DISTINCT ${keyTuple}) AS distinct_keys FROM ${tableExpr}`,
        views,
        5,
      )
      const row = probe.rows[0]
      const total = Number(row?.total_rows ?? 0)
      const distinct = Number(row?.distinct_keys ?? 0)
      if (total > distinct && distinct > 0 && total / distinct > 1.005) {
        const mult = (total / distinct).toFixed(2)
        warnings.push({
          kind: 'join_fanout',
          title: 'JOIN FAN-OUT / DOUBLE-COUNTING RISK',
          detail: `Joined table \`${tableName}\` is NOT unique on \`${keys.join(', ')}\` (${total.toLocaleString('en-US')} rows for ${distinct.toLocaleString('en-US')} distinct keys — ${mult}× average fan-out).`,
          suggestion: `Deduplicate or pre-aggregate \`${tableName}\` to 1 row per \`${keys.join(', ')}\` in a CTE before joining so SUM/COUNT totals are not multiplied.`,
        })
      }
    }
    catch {
      // Best-effort probe; never block a valid query result.
    }
  }
  return warnings
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function findTrailingMonthBucket(rows: Record<string, unknown>[]): { col: string, months: string[] } | undefined {
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

/** Detects when the final month in a time-series aggregation only contains a partial slice of days. */
async function auditPartialTrailingPeriod(
  sql: string,
  result: StoredDataset,
  duck: DuckDbRunner,
  views: QueryView[],
): Promise<AuditWarning[]> {
  const bucket = findTrailingMonthBucket(result.rows)
  if (!bucket)
    return []

  const lineage = extractSqlLineage(sql)
  const primarySource = lineage.sources[0]
  if (!primarySource)
    return []

  const isFile = /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i.test(primarySource) || primarySource.includes('/')
  const sourceExpr = quoteTableRef(primarySource, isFile)
  const dateCol = await resolveDateColumnInSource(sourceExpr, duck, views)
  if (!dateCol)
    return []

  const latestMonth = bucket.months[bucket.months.length - 1]
  const prevMonths = bucket.months.slice(0, -1)
  const [yr, mo] = latestMonth.split('-').map(Number)
  const expectedDays = daysInMonth(yr, mo)

  try {
    const qCol = quoteIdentifier(dateCol)
    const sumMatch = RATE_SUM_RE.exec(stripComments(sql))
    RATE_SUM_RE.lastIndex = 0
    const metricCol = sumMatch?.[1] && !isNonAdditiveSumColumn(sumMatch[1]) ? sumMatch[1] : undefined
    const metricExpr = metricCol ? `, SUM(TRY_CAST(${quoteIdentifier(metricCol)} AS DOUBLE)) AS metric_sum` : ''
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
    const byMonth = new Map<string, { days: number, maxDay: string, metricSum: number }>()
    for (const r of probe.rows) {
      if (typeof r.ym === 'string')
        byMonth.set(r.ym, { days: Number(r.active_days ?? 0), maxDay: String(r.max_day ?? ''), metricSum: Number(r.metric_sum ?? 0) })
    }
    const latest = byMonth.get(latestMonth)
    if (!latest || latest.days === 0)
      return []
    const prevCounts = prevMonths.map(m => byMonth.get(m)?.days ?? 0).filter(d => d > 0).sort((a, b) => a - b)
    if (prevCounts.length === 0)
      return []
    const medianPrevDays = prevCounts[Math.floor(prevCounts.length / 2)]
    const maxDayOfMonth = Number(ISO_DATE_RE.exec(latest.maxDay)?.[1] ?? latest.days)
    const coverage = Math.max(latest.days, maxDayOfMonth) / expectedDays
    if (medianPrevDays >= 18 && latest.days < medianPrevDays * 0.65 && coverage < 0.72) {
      const prevMonthKey = prevMonths[prevMonths.length - 1]
      const prevInfo = byMonth.get(prevMonthKey)
      let runRateNote = ''
      if (metricCol && prevInfo && prevInfo.days > 0 && prevInfo.metricSum !== 0) {
        const latestRate = latest.metricSum / latest.days
        const prevRate = prevInfo.metricSum / prevInfo.days
        const pct = ((latestRate - prevRate) / Math.abs(prevRate)) * 100
        runRateNote = ` Daily run-rate (${metricCol}/day): ${Math.round(latestRate).toLocaleString('en-US')} vs ${Math.round(prevRate).toLocaleString('en-US')} in \`${prevMonthKey}\` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%).`
      }
      return [{
        kind: 'partial_period',
        title: 'PARTIAL TRAILING PERIOD',
        detail: `Latest period \`${latestMonth}\` only spans ${latest.days} active day${latest.days === 1 ? '' : 's'} (through ${latest.maxDay}, vs. ${medianPrevDays}-day median in prior months).${runRateNote}`,
        suggestion: `Do not compare \`${latestMonth}\` raw totals directly against full months — report it as month-to-date (with daily run-rate) or filter \`WHERE ${dateCol} < '${latestMonth}-01'\`.`,
      }]
    }
  }
  catch {}
  return []
}

function levenshtein(a: string, b: string): number {
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

/** Detects 0-row case-mismatched string filters and silent NULL exclusions on `!=` / `NOT IN`. */
async function auditFiltersAndNulls(
  sql: string,
  result: StoredDataset,
  duck: DuckDbRunner,
  views: QueryView[],
): Promise<AuditWarning[]> {
  const cleaned = stripComments(sql)
  const lineage = extractSqlLineage(cleaned)
  const primarySource = lineage.sources[0]
  if (!primarySource || !lineage.whereClause)
    return []

  const isFile = /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i.test(primarySource) || primarySource.includes('/')
  const sourceExpr = quoteTableRef(primarySource, isFile)
  const warnings: AuditWarning[] = []

  // 1) Zero-row result with `col = 'val'` -> suggest exact casing/values in source table
  if (result.rows.length === 0) {
    for (const m of lineage.whereClause.matchAll(EQ_FILTER_RE)) {
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
            ? `Exact match in \`${primarySource}.${col}\` has different casing: \`'${exactCase}'\` (all values: ${vals.slice(0, 6).map(v => `'${v}'`).join(', ')}).`
            : `Available values in \`${primarySource}.${col}\`: ${sample}.`,
        })
      }
      catch {}
    }
  }

  // 2) `col != ...` / `NOT IN` silently excluding NULL rows
  const seenNullCols = new Set<string>()
  for (const m of lineage.whereClause.matchAll(NEQ_FILTER_RE)) {
    const col = m[1]
    if (!col || seenNullCols.has(col.toLowerCase()))
      continue
    seenNullCols.add(col.toLowerCase())
    // Skip if query explicitly handles NULLs for this column
    const handlesNull = new RegExp(`\\b${col}\\s+IS\\s+(?:NOT\\s+)?NULL|IS\\s+DISTINCT\\s+FROM|COALESCE\\s*\\([^)]*\\b${col}\\b`, 'i').test(lineage.whereClause)
    if (handlesNull)
      continue
    try {
      const probe = await duck.run(
        `SELECT COUNT(*) AS total_rows, SUM(CASE WHEN ${quoteIdentifier(col)} IS NULL THEN 1 ELSE 0 END) AS null_rows FROM ${sourceExpr}`,
        views,
        1,
      )
      const total = Number(probe.rows[0]?.total_rows ?? 0)
      const nulls = Number(probe.rows[0]?.null_rows ?? 0)
      if (nulls > 0 && total > 0) {
        const pct = Math.round((nulls / total) * 100)
        warnings.push({
          kind: 'null_exclusion',
          title: 'SILENT NULL EXCLUSION',
          detail: `\`!=\` / \`NOT IN\` on \`${col}\` silently excludes ${nulls.toLocaleString('en-US')} NULL rows (${pct}% of \`${primarySource}\`).`,
          suggestion: `Use \`${col} IS DISTINCT FROM '...'\` or \`(${col} IS NULL OR ${col} != '...')\` if rows without a \`${col}\` should be kept.`,
        })
      }
    }
    catch {}
  }

  return warnings
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

/** Detects when 1-5 extreme outlier rows (>25x median magnitude, <=1% of rows) materially distort a SUM aggregation. */
async function auditExtremeOutliers(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const cleaned = stripComments(sql)
  // Skip if query already filters extreme values explicitly (e.g. WHERE revenue > 0 or ABS(revenue) < ...)
  if (/\bWHERE\b[^;]*(?:ABS\s*\(|<\s*-|>\s*0|BETWEEN)/i.test(cleaned))
    return []

  const lineage = extractSqlLineage(cleaned)
  const primarySource = lineage.sources[0]
  if (!primarySource)
    return []

  const sumCols = new Set<string>()
  for (const m of cleaned.matchAll(RATE_SUM_RE)) {
    const col = m[1]
    if (col && !isNonAdditiveSumColumn(col))
      sumCols.add(col)
  }
  if (sumCols.size === 0)
    return []

  const isFile = /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i.test(primarySource) || primarySource.includes('/')
  const sourceExpr = quoteTableRef(primarySource, isFile)
  const warnings: AuditWarning[] = []

  for (const col of [...sumCols].slice(0, 2)) {
    const qCol = quoteIdentifier(col)
    try {
      const probe = await duck.run(
        `WITH base AS (SELECT TRY_CAST(${qCol} AS DOUBLE) AS v FROM ${sourceExpr} WHERE TRY_CAST(${qCol} AS DOUBLE) IS NOT NULL),
              stats AS (SELECT COUNT(*) AS n, MEDIAN(ABS(v)) AS med, SUM(v) AS total_sum FROM base)
         SELECT ANY_VALUE(stats.n) AS n,
                ANY_VALUE(stats.med) AS med,
                ANY_VALUE(stats.total_sum) AS total_sum,
                COUNT(*) FILTER (WHERE stats.med > 0 AND ABS(base.v) > stats.med * 25) AS extreme_count,
                COALESCE(SUM(base.v) FILTER (WHERE stats.med > 0 AND ABS(base.v) > stats.med * 25), 0) AS extreme_sum,
                MIN(base.v) AS min_val,
                MAX(base.v) AS max_val
         FROM base, stats`,
        views,
        1,
      )
      const row = probe.rows[0]
      const n = Number(row?.n ?? 0)
      const med = Number(row?.med ?? 0)
      const totalSum = Number(row?.total_sum ?? 0)
      const extremeCount = Number(row?.extreme_count ?? 0)
      const extremeSum = Number(row?.extreme_sum ?? 0)
      const maxAllowed = Math.max(5, Math.floor(n * 0.01))
      if (n >= 20 && med > 0 && extremeCount >= 1 && extremeCount <= maxAllowed && Math.abs(extremeSum) >= Math.abs(totalSum) * 0.05) {
        const cleanSum = totalSum - extremeSum
        let sampleNote = ''
        try {
          const sample = await duck.run(
            `SELECT * FROM ${sourceExpr} WHERE ABS(TRY_CAST(${qCol} AS DOUBLE)) > ${med * 25} LIMIT 3`,
            views,
            3,
          )
          if (sample.rows.length > 0) {
            const labels = sample.rows.map((r) => {
              const idVal = Object.entries(r).find(([k, v]) => k !== col && typeof v === 'string' && v.trim() !== '')
              return `${idVal ? `${String(idVal[1])}: ` : ''}${Math.round(Number(r[col] ?? 0)).toLocaleString('en-US')}`
            })
            sampleNote = ` Top extreme row(s): ${labels.join('; ')}.`
          }
        }
        catch {}
        warnings.push({
          kind: 'outlier_distortion',
          title: 'EXTREME OUTLIER DISTORTION',
          detail: `${extremeCount} extreme row${extremeCount === 1 ? '' : 's'} in \`${primarySource}.${col}\` (median magnitude ${Math.round(med).toLocaleString('en-US')}) contribute ${Math.round(extremeSum).toLocaleString('en-US')} to \`SUM(${col})\` (excluding them: ${Math.round(cleanSum).toLocaleString('en-US')}).${sampleNote}`,
          suggestion: `Report both raw and outlier-excluded totals per group (e.g. excluding rows above the outlier threshold) before attributing trends to organic performance.`,
        })
      }
    }
    catch {}
  }
  return warnings
}

const AUDIT_EVENT_ID_RE = /^(?:event|order|transaction|tx|invoice|payment|receipt|checkout|log)_id$/i
const AUDIT_CURRENCY_RE = /(?:^|_)currency(?:_code)?$/i

/** Checks primary source for duplicate event/order IDs or mixed-currency SUMs when the SQL didn't deduplicate or split by currency. */
async function auditDuplicateAndCurrency(sql: string, duck: DuckDbRunner, views: QueryView[]): Promise<AuditWarning[]> {
  const cleaned = stripComments(sql)
  if (!/\b(?:SUM|COUNT|AVG)\s*\(/i.test(cleaned))
    return []
  const lineage = extractSqlLineage(sql)
  const primarySource = lineage.sources[0]
  if (!primarySource)
    return []

  const isFile = /\.(?:csv|tsv|parquet|json|jsonl|xlsx)$/i.test(primarySource) || primarySource.includes('/')
  const sourceExpr = quoteTableRef(primarySource, isFile)
  const warnings: AuditWarning[] = []
  try {
    const sample = await duck.run(`SELECT * FROM ${sourceExpr} LIMIT 1`, views, 1)
    const cols = Object.keys(sample.rows[0] ?? {})

    // 1) Duplicate event/order IDs if SQL didn't use DISTINCT / ROW_NUMBER / GROUP BY <id>
    const eventIdCol = cols.find(c => AUDIT_EVENT_ID_RE.test(c))
    const hasDedup = /\b(?:DISTINCT|ROW_NUMBER\s*\(|QUALIFY)\b/i.test(cleaned)
    if (eventIdCol && !hasDedup && !new RegExp(`\\bGROUP\\s+BY[^;]*\\b${eventIdCol}\\b`, 'i').test(cleaned)) {
      const qId = quoteIdentifier(eventIdCol)
      const probe = await duck.run(`SELECT COUNT(*) AS n, COUNT(DISTINCT ${qId}) AS u FROM ${sourceExpr}`, views, 5)
      const n = Number(probe.rows[0]?.n ?? 0)
      const u = Number(probe.rows[0]?.u ?? 0)
      if (u > 0 && n / u >= 1.03) {
        warnings.push({
          kind: 'duplicate_ids',
          title: 'DUPLICATE EVENT / ORDER IDS',
          detail: `\`${primarySource}.${eventIdCol}\` has ${n.toLocaleString('en-US')} rows for only ${u.toLocaleString('en-US')} unique IDs (${(n / u).toFixed(2)}× inflation), and this query does not deduplicate.`,
          suggestion: `Deduplicate in a CTE (\`SELECT * FROM ${sourceExpr} QUALIFY ROW_NUMBER() OVER (PARTITION BY ${qId}) = 1\`) before summing.`,
        })
      }
    }

    // 2) Mixed currencies summed together without grouping/filtering by currency or using a USD column
    const currCol = cols.find(c => AUDIT_CURRENCY_RE.test(c))
    if (currCol && !new RegExp(`\\b${currCol}\\b`, 'i').test(cleaned)) {
      const summedCols = [...cleaned.matchAll(RATE_SUM_RE)].map(m => m[1]).filter((c): c is string => Boolean(c) && !/_usd$|usd_/i.test(c))
      if (summedCols.length > 0) {
        const qCurr = quoteIdentifier(currCol)
        const probe = await duck.run(`SELECT COUNT(DISTINCT ${qCurr}) AS c, STRING_AGG(DISTINCT CAST(${qCurr} AS VARCHAR), ', ') AS codes FROM ${sourceExpr}`, views, 5)
        const count = Number(probe.rows[0]?.c ?? 0)
        if (count >= 2) {
          const usdCol = cols.find(c => /_usd$|usd_/i.test(c))
          warnings.push({
            kind: 'mixed_currency',
            title: 'MIXED CURRENCIES SUMMED',
            detail: `\`${primarySource}.${currCol}\` mixes ${count} currencies (${String(probe.rows[0]?.codes ?? '')}), so \`SUM(${summedCols[0]})\` adds incompatible currency units.`,
            suggestion: usdCol
              ? `Use \`SUM(${usdCol})\` or group/filter by \`${currCol}\`.`
              : `Convert via FX rates or group/filter by \`${currCol}\` before summing.`,
          })
        }
      }
    }

    // 3) Smart Pro routing to 1-call deterministic `analyze(...)` when raw SQL touches cohorts, experiments, or dense daily time series
    if (isFile) {
      const hasCohortCol = cols.some(c => /(?:signup|cohort|join)_(?:month|date|week)|^cohort$/i.test(c))
      const hasActivityCol = cols.some(c => /(?:activity|active|period)_(?:month|date|week)|^months_since$/i.test(c))
      const hasVariantCol = cols.some(c => /^(?:variant|treatment|ab_group|experiment_group|test_group)$/i.test(c))
      const dateCol = cols.find(c => /^(?:date|order_date|day|dt|metric_date)$/i.test(c))
      if (hasCohortCol && hasActivityCol) {
        warnings.push({
          kind: 'analyze_hint',
          title: 'COHORT RIGHT-CENSORING RISK',
          detail: `\`${primarySource}\` is a cohort activity table — recent cohorts may not have matured to later periods (dragging naive retention averages toward 0%).`,
          suggestion: `Call \`analyze(method="cohort_retention", filePath="${primarySource}")\` for exact matured retention with automatic right-censoring guards.`,
        })
      }
      else if (hasVariantCol) {
        warnings.push({
          kind: 'analyze_hint',
          title: 'EXPERIMENT VALIDITY CHECK (SRM / HOLM / WHALES)',
          detail: `\`${primarySource}\` is an A/B experiment table — raw SQL can miss Sample Ratio Mismatch (SRM), Holm-Bonferroni multiple-testing inflation, or whale-skewed revenue.`,
          suggestion: `Call \`analyze(method="ab_test", filePath="${primarySource}")\` for exact 1-call SRM, Holm-Bonferroni, and top-1% trimmed whale checks.`,
        })
      }
      else if (dateCol && cols.length <= 6 && !hasCohortCol) {
        const qDate = quoteIdentifier(dateCol)
        const dProbe = await duck.run(`SELECT COUNT(*) AS n, COUNT(DISTINCT TRY_CAST(${qDate} AS DATE)) AS d FROM ${sourceExpr}`, views, 5)
        const nRows = Number(dProbe.rows[0]?.n ?? 0)
        const dDays = Number(dProbe.rows[0]?.d ?? 0)
        if (dDays >= 45 && nRows <= dDays * 1.1) {
          warnings.push({
            kind: 'analyze_hint',
            title: 'SEASONALITY & REGIME-SHIFT CHECK',
            detail: `\`${primarySource}\` is a ${dDays}-day daily time series — day-of-week seasonality can mask or shift structural break dates in raw SQL.`,
            suggestion: `Call \`analyze(method="anomalies", filePath="${primarySource}")\` to remove day-of-week seasonality and pinpoint exact structural change-point dates.`,
          })
        }
      }
    }
  }
  catch {}
  return warnings
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
