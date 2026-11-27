import type { AuditWarning, MonthDays, ProbeRunner, SourceRef } from './audit.js'
import type { StoredDataset } from './store.js'
import type { WarehouseSessionCache } from './warehouse-profile.js'
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
import { lookupTableSchema, normalizeTableName } from './warehouse-profile.js'
import { mapWarehouseWork } from './warehouse.js'

/**
 * The Pro deep audits for a query that ran in a database or warehouse: join fan-out, partial
 * trailing period, silent NULL exclusion, outlier distortion, mixed currencies, duplicate IDs,
 * and zero-row filter mismatches, with the same checks and warning text as a local DuckDB query.
 *
 * Each check is one aggregate probe sent through the connector's own `query()` (never returning
 * raw rows), and results are cached per session so repeated queries on the same table hit 0ms.
 * Probes are best-effort: one that fails, is refused or outlasts the time budget adds no warning
 * and never touches the query's own result.
 */

/** Longest the audits may add to a warehouse query's reply. */
export const WAREHOUSE_AUDIT_MS = 6_000
/** Most uncached live probes one query may send, so auditing stays cheap next to the query itself. */
const MAX_PROBES = 3
/** Months of the source a partial-period probe compares: the latest and up to 3 before it. */
const PROBED_MONTHS = 4
const PLAIN_NAME_RE = /^[A-Z_][\w$]*$/i
/** An identifier that is not a function call or a table/alias qualifier. */
const COLUMN_RE = /(?<![\w$])["`]?([A-Z_][\w$]*)["`]?(?![\w$.]|\s*\()/gi
const EVENT_ID_RE = /^(?:event|order|transaction|tx|invoice|payment|receipt|checkout|log)_id$/i
const CURRENCY_COL_RE = /(?:^|_)currency(?:_code)?$/i
const SUM_COL_RE = /\bSUM\s*\(\s*(?:DISTINCT\s+)?(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*\)/gi
const EQ_FILTER_RE = /\b(?:[\w"`]+\.)?["`]?([A-Z_][\w$]*)["`]?\s*=\s*'([^']+)'/gi
const METADATA_QUERY_RE = /\b(?:INFORMATION_SCHEMA|system\.)\b/i
const ANALYTICAL_SQL_RE = /\b(?:SUM|AVG|COUNT|COUNTIF|MIN|MAX|GROUP\s+BY|JOIN|NOT\s+IN)\b|!=|<>/i

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

interface PlannedProbe {
  cacheKey?: string
  run: (runner: ProbeRunner) => Promise<AuditWarning | undefined>
}

interface ProbeContext {
  sql: string
  cleaned: string
  rows: Record<string, unknown>[]
  dialect: SqlDialect
  source?: SourceRef
  allSources: SourceRef[]
  cache?: WarehouseSessionCache
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isMetadataOrPreviewQuery(cleaned: string): boolean {
  if (METADATA_QUERY_RE.test(cleaned))
    return true
  return /\bLIMIT\s+\d+/i.test(cleaned) && !ANALYTICAL_SQL_RE.test(cleaned)
}

/**
 * Resolves which referenced table owns `col`: uses cached schema metadata when unambiguous;
 * otherwise falls back to single-table or explicitly qualified column matching so a probe never
 * guesses which table owns a column (a failed probe can cost a warehouse session).
 */
function findOwnerSource(ctx: ProbeContext, col: string): SourceRef | undefined {
  if (!PLAIN_NAME_RE.test(col))
    return undefined
  if (ctx.source && readsOneTable(ctx.sql))
    return ctx.source

  if (ctx.cache && ctx.allSources.length > 0) {
    const colLower = col.toLowerCase()
    const owners = ctx.allSources.filter((src) => {
      const schema = lookupTableSchema(ctx.cache, src.name)
      return schema?.columns.some(c => c.name.toLowerCase() === colLower)
    })
    if (owners.length === 1)
      return owners[0]
  }

  if (!ctx.source)
    return undefined
  const qualifiers = [ctx.source.alias, ctx.source.name.split('.').pop()].filter(Boolean).map(q => escapeRegExp(q!))
  const qualified = new RegExp(`(?<![\\w$])["\`]?(?:${qualifiers.join('|')})["\`]?\\s*\\.\\s*["\`]?${escapeRegExp(col)}["\`]?(?![\\w$])`, 'i').test(ctx.sql)
  return qualified ? ctx.source : undefined
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

function cachedProbe(
  cache: WarehouseSessionCache | undefined,
  cacheKey: string,
  sql: string,
  evaluate: (row: Record<string, unknown> | undefined) => AuditWarning | undefined,
): PlannedProbe {
  return {
    cacheKey,
    run: async (runner) => {
      if (cache?.probes.has(cacheKey))
        return evaluate(cache.probes.get(cacheKey))
      return probeOnce(runner, sql, (row) => {
        cache?.probes.set(cacheKey, row)
        return evaluate(row)
      })
    },
  }
}

function joinProbes({ sql, dialect, cache }: ProbeContext): PlannedProbe[] {
  return findJoinTargets(sql)
    .filter(target => !target.isFile && target.keys.every(key => PLAIN_NAME_RE.test(key)))
    .map((target) => {
      const key = `grain:${normalizeTableName(target.name)}:${target.keys.map(k => k.toLowerCase()).join(',')}`
      return cachedProbe(
        cache,
        key,
        keyGrainSql(target.ref, target.keys.map(dialect.quoteName)),
        row => joinFanoutWarning(target.name, target.keys, row),
      )
    })
}

function periodProbe(ctx: ProbeContext): PlannedProbe | undefined {
  const bucket = findTrailingMonthBucket(ctx.rows)
  const dateCol = bucket && bucketDateColumn(ctx.sql, bucket.col)
  const owner = dateCol ? findOwnerSource(ctx, dateCol) : undefined
  if (!bucket || !dateCol || !owner)
    return undefined
  const metric = leadingAdditiveSum(ctx.sql)
  const metricCol = metric && findOwnerSource(ctx, metric)?.name === owner.name ? metric : undefined
  const months = bucket.months.slice(-PROBED_MONTHS)
  const { quoteName } = ctx.dialect
  const sql = monthDaysSql(owner.ref, months, quoteName(dateCol), metricCol && quoteName(metricCol))
  const key = `period:${normalizeTableName(owner.name)}:${dateCol.toLowerCase()}:${metricCol?.toLowerCase() ?? ''}:${months.join(',')}`
  return cachedProbe(ctx.cache, key, sql, row => partialPeriodWarning({ months, byMonth: monthDaysFromRow(row, months), dateCol, metricCol }))
}

function nullProbe(ctx: ProbeContext): PlannedProbe | undefined {
  const { whereClause } = extractSqlLineage(ctx.cleaned)
  if (!whereClause)
    return undefined
  for (const col of findNullDroppingColumns(whereClause)) {
    const owner = findOwnerSource(ctx, col)
    if (!owner)
      continue
    const key = `null:${normalizeTableName(owner.name)}:${col.toLowerCase()}`
    return cachedProbe(ctx.cache, key, nullShareSql(owner.ref, ctx.dialect.quoteName(col)), row => nullExclusionWarning(col, owner.name, row))
  }
  return undefined
}

function outlierProbe(ctx: ProbeContext): PlannedProbe | undefined {
  const { median, quoteName } = ctx.dialect
  if (!median)
    return undefined
  for (const col of findOutlierSumColumns(ctx.sql)) {
    const owner = findOwnerSource(ctx, col)
    if (!owner)
      continue
    const key = `outlier:${normalizeTableName(owner.name)}:${col.toLowerCase()}`
    return cachedProbe(ctx.cache, key, outlierStatsSql(owner.ref, quoteName(col), median), (row) => {
      const stats = outlierStats(row)
      return isOutlierDistortion(stats) ? outlierWarning(owner.name, col, stats) : undefined
    })
  }
  return undefined
}

function mixedCurrencyProbe(ctx: ProbeContext): PlannedProbe | undefined {
  if (!ctx.cache)
    return undefined
  const summedCols = [...ctx.cleaned.matchAll(SUM_COL_RE)].map(m => m[1]).filter((c): c is string => Boolean(c) && !/_usd$|usd_/i.test(c))
  if (summedCols.length === 0)
    return undefined
  for (const src of ctx.allSources) {
    const schema = lookupTableSchema(ctx.cache, src.name)
    const currCol = schema?.columns.find(c => CURRENCY_COL_RE.test(c.name))?.name
    if (!currCol || new RegExp(`\\b${escapeRegExp(currCol)}\\b`, 'i').test(ctx.cleaned))
      continue
    const usdCol = schema?.columns.find(c => /_usd$|usd_/i.test(c.name))?.name
    const qCurr = ctx.dialect.quoteName(currCol)
    const codesExpr = ctx.dialect.sampleDistinct ? `, ${ctx.dialect.sampleDistinct(qCurr, 6)} AS codes` : ''
    const sql = `SELECT COUNT(DISTINCT ${qCurr}) AS c${codesExpr} FROM ${src.ref}`
    const key = `currency:${normalizeTableName(src.name)}:${currCol.toLowerCase()}`
    return cachedProbe(ctx.cache, key, sql, (row) => {
      const count = Number(probeValue(row, 'c') ?? 0)
      if (count < 2)
        return undefined
      const codes = String(probeValue(row, 'codes') ?? '')
      return {
        kind: 'mixed_currency',
        title: 'MIXED CURRENCIES SUMMED',
        detail: `\`${src.name}.${currCol}\` mixes ${count} currencies${codes ? ` (${codes})` : ''}, so \`SUM(${summedCols[0]})\` adds incompatible currency units.`,
        suggestion: usdCol ? `Use \`SUM(${usdCol})\` or group/filter by \`${currCol}\`.` : `Convert via FX rates or group/filter by \`${currCol}\` before summing.`,
      }
    })
  }
  return undefined
}

function duplicateIdProbe(ctx: ProbeContext): PlannedProbe | undefined {
  if (!ctx.cache || !ctx.source || !/\b(?:SUM|COUNT|AVG)\s*\(/i.test(ctx.cleaned))
    return undefined
  if (/\b(?:DISTINCT|ROW_NUMBER\s*\(|QUALIFY)\b/i.test(ctx.cleaned))
    return undefined
  const schema = lookupTableSchema(ctx.cache, ctx.source.name)
  const idCol = schema?.columns.find(c => EVENT_ID_RE.test(c.name))?.name
  if (!idCol || new RegExp(`\\bGROUP\\s+BY[^;]*\\b${escapeRegExp(idCol)}\\b`, 'i').test(ctx.cleaned))
    return undefined
  const qId = ctx.dialect.quoteName(idCol)
  const key = `grain:${normalizeTableName(ctx.source.name)}:${idCol.toLowerCase()}`
  const sql = `SELECT COUNT(${qId}) AS total_rows, COUNT(DISTINCT ${qId}) AS distinct_keys FROM ${ctx.source.ref}`
  const srcName = ctx.source.name
  return cachedProbe(ctx.cache, key, sql, (row) => {
    const n = Number(probeValue(row, 'total_rows') ?? 0)
    const u = Number(probeValue(row, 'distinct_keys') ?? 0)
    if (u <= 0 || n / u < 1.03)
      return undefined
    return {
      kind: 'duplicate_ids',
      title: 'DUPLICATE EVENT / ORDER IDS',
      detail: `\`${srcName}.${idCol}\` has ${n.toLocaleString('en-US')} rows for only ${u.toLocaleString('en-US')} unique IDs (${(n / u).toFixed(2)}× inflation), and this query does not deduplicate.`,
      suggestion: `Deduplicate by \`${idCol}\` in a CTE before summing.`,
    }
  })
}

function emptyFilterProbe(ctx: ProbeContext): PlannedProbe | undefined {
  if (ctx.rows.length > 0 || !ctx.dialect.sampleDistinct)
    return undefined
  const { whereClause } = extractSqlLineage(ctx.cleaned)
  if (!whereClause)
    return undefined
  for (const m of whereClause.matchAll(EQ_FILTER_RE)) {
    const col = m[1]
    const literal = m[2]
    const owner = findOwnerSource(ctx, col)
    if (!owner)
      continue
    const qCol = ctx.dialect.quoteName(col)
    const sql = `SELECT ${ctx.dialect.sampleDistinct(qCol, 10)} AS vals FROM ${owner.ref}`
    const key = `vals:${normalizeTableName(owner.name)}:${col.toLowerCase()}`
    return cachedProbe(ctx.cache, key, sql, (row) => {
      const raw = String(probeValue(row, 'vals') ?? '').trim()
      if (!raw)
        return undefined
      const vals = raw.split(',').map(v => v.trim()).filter(Boolean)
      if (vals.includes(literal))
        return undefined
      return {
        kind: 'empty_filter',
        title: 'ZERO-ROW FILTER MISMATCH',
        detail: `Filter \`${col} = '${literal}'\` returned 0 rows. Sample values in \`${owner.name}.${col}\`: ${vals.slice(0, 8).map(v => `'${v}'`).join(', ')}.`,
        suggestion: `Match the exact casing/value in \`${col}\` (or use \`LOWER(${col})\`).`,
      }
    })
  }
  return undefined
}

function collectReferencedSources(sql: string, primary: SourceRef | undefined): SourceRef[] {
  const map = new Map<string, SourceRef>()
  if (primary && !primary.isFile)
    map.set(normalizeTableName(primary.name), primary)
  for (const join of findJoinTargets(sql)) {
    if (!join.isFile && !map.has(normalizeTableName(join.name)))
      map.set(normalizeTableName(join.name), join)
  }
  return [...map.values()]
}

/** The probes worth sending for this query; cached probes are free, uncached live probes are capped at MAX_PROBES. */
function planProbes(sql: string, dataset: StoredDataset, dialect: SqlDialect, cache?: WarehouseSessionCache): PlannedProbe[] {
  const cleaned = stripComments(sql)
  if (isMetadataOrPreviewQuery(cleaned))
    return []
  const rawPrimary = primarySource(sql)
  const source = rawPrimary && !rawPrimary.isFile ? rawPrimary : undefined
  const ctx: ProbeContext = {
    sql,
    cleaned,
    rows: dataset.rows,
    dialect,
    source,
    allSources: collectReferencedSources(sql, source),
    cache,
  }
  const ordered = [
    ...joinProbes(ctx),
    ...[emptyFilterProbe(ctx), periodProbe(ctx), nullProbe(ctx), mixedCurrencyProbe(ctx), duplicateIdProbe(ctx), outlierProbe(ctx)].filter((p): p is PlannedProbe => p !== undefined),
  ]
  const selected: PlannedProbe[] = []
  let liveCount = 0
  for (const probe of ordered) {
    const isCached = Boolean(probe.cacheKey && cache?.probes.has(probe.cacheKey))
    if (isCached) {
      selected.push(probe)
    }
    else if (liveCount < MAX_PROBES) {
      selected.push(probe)
      liveCount++
    }
  }
  return selected
}

/**
 * Audits a query that ran in `warehouse`: the static checks always, and with `deep` (Pro) up to
 * MAX_PROBES uncached probes (plus any 0ms cached checks), sent in parallel on concurrent
 * connectors or sequentially on single-session connectors, each given at most `timeoutMs`.
 */
export async function auditWarehouseQuery(options: {
  sql: string
  dataset: StoredDataset
  warehouse: Pick<WarehouseConnector, 'query' | 'dialect' | 'concurrent'>
  deep: boolean
  cache?: WarehouseSessionCache
  timeoutMs?: number
}): Promise<AuditWarning[]> {
  const { sql, dataset, warehouse, deep, cache, timeoutMs = WAREHOUSE_AUDIT_MS } = options
  const staticWarnings = [...auditNonAdditiveSql(sql), ...auditChartReaggregation(dataset)]
  if (!deep)
    return staticWarnings
  const run: ProbeRunner = async probeSql => (await warehouse.query(probeSql)).rows
  const probes = planProbes(sql, dataset, warehouse.dialect, cache)
  if (probes.length === 0)
    return staticWarnings
  const settled = await mapWarehouseWork(probes, warehouse.concurrent ?? true, probe => withinBudget(probe.run(run), timeoutMs))
  const deepWarnings = settled.filter((w): w is AuditWarning => w !== undefined && w !== 'pending')
  return [...staticWarnings, ...deepWarnings]
}
