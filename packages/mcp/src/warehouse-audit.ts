import type { AuditWarning, MonthDays, ProbeRunner, SourceRef } from './audit.js'
import type { StoredDataset } from './store.js'
import type { SqlDialect, WarehouseConnector } from './warehouse.js'
import {
  auditChartReaggregation,
  auditNonAdditiveSql,
  findJoinTargets,
  findNullDroppingColumns,
  findOutlierSumColumns,
  findTrailingMonthBucket,
  isOutlierDistortion,
  joinFanoutWarning,
  keyGrainSql,
  leadingAdditiveSum,
  nullExclusionWarning,
  nullShareSql,
  outlierStats,
  outlierWarning,
  partialPeriodWarning,
  primarySource,
  probeOnce,
  probeValue,
  readsOneTable,
  stripComments,
} from './audit.js'
import { withinBudget } from './duckdb.js'
import { extractSqlLineage } from './lineage.js'

/**
 * The Pro deep audits for a query that ran in a database or warehouse: join fan-out, partial
 * trailing period, silent NULL exclusion and outlier distortion, with the same checks and warning
 * text as a local DuckDB query. Each check is one aggregate probe sent through the connector's own
 * `query()`, so the read-only, scan-cap and allowlist guards apply to it too, and no raw rows come
 * back. Probes are best-effort: one that fails, is refused or outlasts the time budget adds no
 * warning and never touches the query's own result.
 *
 * Left out: duplicate-ID, mixed-currency and analyze-routing checks (they find their columns by
 * reading a raw source row), and the zero-row filter hint (it pulls up to 40 distinct raw values).
 */

/** Longest the audits may add to a warehouse query's reply. */
export const WAREHOUSE_AUDIT_MS = 6_000
/** Most probes one query may send, so auditing stays cheap next to the query itself. */
const MAX_PROBES = 3
/** Months of the source a partial-period probe compares: the latest and up to 3 before it. */
const PROBED_MONTHS = 4
const PLAIN_NAME_RE = /^[A-Z_][\w$]*$/i
/** An identifier that is not a function call or a table/alias qualifier. */
const COLUMN_RE = /(?<![\w$])["`]?([A-Z_][\w$]*)["`]?(?![\w$.]|\s*\()/gi
/** Words in a month-bucketing expression that are not the date column. */
const NOT_A_COLUMN = new Set([
  'SELECT',
  'DISTINCT',
  'AS',
  'AT',
  'FROM',
  'ZONE',
  'INTERVAL',
  'NULL',
  'DATE',
  'DATETIME',
  'TIMESTAMP',
  'TIMESTAMP_NTZ',
  'TIMESTAMP_LTZ',
  'TIMESTAMPTZ',
  'TIME',
  'STRING',
  'VARCHAR',
  'TEXT',
  'CHAR',
  'YEAR',
  'ISOYEAR',
  'QUARTER',
  'MONTH',
  'WEEK',
  'ISOWEEK',
  'DAY',
  'HOUR',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
])

type Probe = (run: ProbeRunner) => Promise<AuditWarning | undefined>

interface ProbeContext {
  sql: string
  rows: Record<string, unknown>[]
  dialect: SqlDialect
  source?: SourceRef
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether a column can be probed on the primary source: always when the query reads one table;
 * otherwise only when the SQL qualifies it with that table's alias or name, so a probe never
 * guesses which table owns it (a failed probe can cost a warehouse session).
 */
function ownsColumn(ctx: ProbeContext, col: string): boolean {
  if (!ctx.source || !PLAIN_NAME_RE.test(col))
    return false
  if (readsOneTable(ctx.sql))
    return true
  const qualifiers = [ctx.source.alias, ctx.source.name.split('.').pop()].filter(Boolean).map(q => escapeRegExp(q!))
  return new RegExp(`(?<![\\w$])["\`]?(?:${qualifiers.join('|')})["\`]?\\s*\\.\\s*["\`]?${escapeRegExp(col)}["\`]?(?![\\w$])`, 'i').test(ctx.sql)
}

/** The last item of the SELECT list that ends the text. */
function lastSelectItem(head: string): string {
  const selects = [...head.matchAll(/\bSELECT\b/gi)]
  const last = selects[selects.length - 1]
  const list = last ? head.slice(last.index + last[0].length) : head
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(')
      depth++
    else if (list[i] === ')')
      depth--
    else if (list[i] === ',' && depth === 0)
      start = i + 1
  }
  return list.slice(start)
}

/** The column a month bucket is computed from, read from the SELECT item aliased to it (`DATE_TRUNC(order_date, MONTH) AS month`). */
export function bucketDateColumn(sql: string, bucketCol: string): string | undefined {
  const text = stripComments(sql).replace(/'(?:[^'\\]|\\.|'')*'/g, '\'\'')
  const alias = new RegExp(`\\bAS\\s+["\`]?${escapeRegExp(bucketCol)}["\`]?(?![\\w$])`, 'i').exec(text)
  if (!alias)
    return undefined
  for (const m of lastSelectItem(text.slice(0, alias.index)).matchAll(COLUMN_RE)) {
    if (!NOT_A_COLUMN.has(m[1].toUpperCase()))
      return m[1]
  }
  return undefined
}

/** `['2026-04-01', '2026-05-01']`: the half-open date range of a `YYYY-MM` month. */
function monthRange(month: string): [string, string] {
  const [year, mon] = month.split('-').map(Number)
  const next = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`
  return [`${month}-01`, `${next}-01`]
}

/** One aggregate row with active days, last day and metric total for each month, as portable SQL. */
export function monthDaysSql(tableRef: string, months: string[], dateExpr: string, metricExpr?: string): string {
  const columns = months.flatMap((month, i) => {
    const [from, to] = monthRange(month)
    const inMonth = `${dateExpr} >= '${from}' AND ${dateExpr} < '${to}'`
    return [
      `COUNT(DISTINCT CASE WHEN ${inMonth} THEN CAST(${dateExpr} AS DATE) END) AS days_${i}`,
      `MAX(CASE WHEN ${inMonth} THEN CAST(${dateExpr} AS DATE) END) AS max_day_${i}`,
      ...(metricExpr ? [`SUM(CASE WHEN ${inMonth} THEN ${metricExpr} END) AS metric_${i}`] : []),
    ]
  })
  const [start] = monthRange(months[0])
  const [, end] = monthRange(months[months.length - 1])
  return `SELECT ${columns.join(', ')} FROM ${tableRef} WHERE ${dateExpr} >= '${start}' AND ${dateExpr} < '${end}'`
}

function monthDaysFromRow(row: Record<string, unknown> | undefined, months: string[]): Map<string, MonthDays> {
  return new Map(months.map((month, i) => [month, {
    days: Number(probeValue(row, `days_${i}`) ?? 0),
    maxDay: String(probeValue(row, `max_day_${i}`) ?? ''),
    metricSum: Number(probeValue(row, `metric_${i}`) ?? 0),
  }]))
}

/** One aggregate row with a column's count, median magnitude, total, and its extreme rows' count and total, as portable SQL. */
export function outlierStatsSql(tableRef: string, colExpr: string, median: (expr: string) => string): string {
  const value = `src_rows.${colExpr}`
  const extreme = `src_stats.med > 0 AND ABS(${value}) > src_stats.med * 25`
  return `SELECT MAX(src_stats.n) AS n, MAX(src_stats.med) AS med, MAX(src_stats.total_sum) AS total_sum, `
    + `SUM(CASE WHEN ${extreme} THEN 1 ELSE 0 END) AS extreme_count, SUM(CASE WHEN ${extreme} THEN ${value} ELSE 0 END) AS extreme_sum `
    + `FROM ${tableRef} AS src_rows CROSS JOIN (SELECT COUNT(${colExpr}) AS n, ${median(`ABS(${colExpr})`)} AS med, SUM(${colExpr}) AS total_sum FROM ${tableRef}) AS src_stats`
}

function joinProbes({ sql, dialect }: ProbeContext): Probe[] {
  return findJoinTargets(sql)
    .filter(target => !target.isFile && target.keys.every(key => PLAIN_NAME_RE.test(key)))
    .map(target => run => probeOnce(
      run,
      keyGrainSql(target.ref, target.keys.map(dialect.quoteName)),
      row => joinFanoutWarning(target.name, target.keys, row),
    ))
}

function periodProbe(ctx: ProbeContext): Probe | undefined {
  const bucket = findTrailingMonthBucket(ctx.rows)
  const dateCol = bucket && bucketDateColumn(ctx.sql, bucket.col)
  if (!bucket || !ctx.source || !dateCol || !ownsColumn(ctx, dateCol))
    return undefined
  const metric = leadingAdditiveSum(ctx.sql)
  const metricCol = metric && ownsColumn(ctx, metric) ? metric : undefined
  const months = bucket.months.slice(-PROBED_MONTHS)
  const { quoteName } = ctx.dialect
  const sql = monthDaysSql(ctx.source.ref, months, quoteName(dateCol), metricCol && quoteName(metricCol))
  return run => probeOnce(run, sql, row => partialPeriodWarning({ months, byMonth: monthDaysFromRow(row, months), dateCol, metricCol }))
}

function nullProbe(ctx: ProbeContext): Probe | undefined {
  const { whereClause } = extractSqlLineage(stripComments(ctx.sql))
  const col = whereClause ? findNullDroppingColumns(whereClause).find(c => ownsColumn(ctx, c)) : undefined
  const source = ctx.source
  if (!source || !col)
    return undefined
  return run => probeOnce(run, nullShareSql(source.ref, ctx.dialect.quoteName(col)), row => nullExclusionWarning(col, source.name, row))
}

function outlierProbe(ctx: ProbeContext): Probe | undefined {
  const { median, quoteName } = ctx.dialect
  const col = findOutlierSumColumns(ctx.sql).find(c => ownsColumn(ctx, c))
  const source = ctx.source
  if (!source || !median || !col)
    return undefined
  return run => probeOnce(run, outlierStatsSql(source.ref, quoteName(col), median), (row) => {
    const stats = outlierStats(row)
    return isOutlierDistortion(stats) ? outlierWarning(source.name, col, stats) : undefined
  })
}

/** The probes worth sending for this query, most telling first: joins, then period, NULLs and outliers. */
function planProbes(sql: string, dataset: StoredDataset, dialect: SqlDialect): Probe[] {
  const source = primarySource(sql)
  const ctx: ProbeContext = { sql, rows: dataset.rows, dialect, source: source && !source.isFile ? source : undefined }
  const single = [periodProbe(ctx), nullProbe(ctx), outlierProbe(ctx)].filter((p): p is Probe => p !== undefined)
  return [...joinProbes(ctx), ...single].slice(0, MAX_PROBES)
}

/**
 * Audits a query that ran in `warehouse`: the static checks always, and with `deep` (Pro) up to
 * MAX_PROBES probes, sent in parallel, each given at most `timeoutMs`. Returns [] when clean.
 */
export async function auditWarehouseQuery(options: {
  sql: string
  dataset: StoredDataset
  warehouse: Pick<WarehouseConnector, 'query' | 'dialect'>
  deep: boolean
  timeoutMs?: number
}): Promise<AuditWarning[]> {
  const { sql, dataset, warehouse, deep, timeoutMs = WAREHOUSE_AUDIT_MS } = options
  const staticWarnings = [...auditNonAdditiveSql(sql), ...auditChartReaggregation(dataset)]
  if (!deep)
    return staticWarnings
  const run: ProbeRunner = async probeSql => (await warehouse.query(probeSql)).rows
  const settled = await Promise.all(planProbes(sql, dataset, warehouse.dialect).map(probe => withinBudget(probe(run), timeoutMs)))
  const deepWarnings = settled.filter((w): w is AuditWarning => w !== undefined && w !== 'pending')
  return [...staticWarnings, ...deepWarnings]
}
