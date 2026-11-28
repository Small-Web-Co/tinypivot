import type { SqlDialect, WarehouseColumnSchema, WarehouseConnector, WarehouseTableSchema } from './warehouse.js'
import { probeValue } from './audit.js'
import { withinBudget } from './duckdb.js'
import { isNonAdditiveMeasure } from './terminal-chart.js'
import { rankWarehouseSchemas } from './warehouse-search.js'
import { mapWarehouseWork } from './warehouse.js'

/**
 * 1-call warehouse schema & data-trap profiler plus per-session probe cache.
 *
 * Replaces 3-5 exploratory turns (`INFORMATION_SCHEMA`, `SELECT * LIMIT 5`, `GROUP BY` value
 * checks, `MIN/MAX(date)`) with one metadata lookup + one compact aggregate SELECT per table.
 * All discovered schemas and probe facts stay cached for the session so later audits and SQL
 * repair hints reuse them at 0ms / 0 extra scans.
 */

export const WAREHOUSE_PROFILE_MS = 8_000
const MAX_PROFILED_TABLES = 8
const MAX_KEY_COLS = 2
const MAX_DATE_COLS = 2
const MAX_CAT_COLS = 6
const MAX_DISTINCT_PREVIEW = 12

const ID_KEY_RE = /(?:^|_)id$|_key$|^sku$|^account$/i
const PRIMARY_EVENT_ID_RE = /^(?:event|order|transaction|tx|invoice|payment|receipt|checkout|log)_id$/i
const CURRENCY_COL_RE = /(?:^|_)currency(?:_code)?$/i
const AMOUNT_COL_RE = /(?:^|_)(?:amount|revenue|sales|price|spend|mrr|arr|total|value|aov)(?:$|_)/i
const DATE_TYPE_RE = /date|time/i
const DATE_NAME_RE = /(?:^|_)(?:date|day|month|dt|created_at|updated_at|ordered_at|shipped_at|timestamp|_ts)$/i
const NUM_TYPE_RE = /int|float|double|numeric|decimal|real|number|bigint|smallint|tinyint|bignumeric/i
const STRING_TYPE_RE = /char|string|text|enum|lowcardinality/i
const HIGH_SIGNAL_CAT_RE = /status|state|region|country|segment|channel|carrier|promo|discount|coupon|currency|tier|plan|type|category|group|variant|treatment/i
const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/

/** Per-session cache of warehouse schemas and aggregate probe results, shared by profile, audits and repair hints. */
export interface WarehouseSessionCache {
  schemas: Map<string, WarehouseTableSchema>
  schemasLoaded: boolean
  /** Probe cache keyed by canonical key (e.g. `sql:<probeSql>` or `grain:<table>:<col>`). */
  probes: Map<string, Record<string, unknown> | undefined>
}

export function createWarehouseSessionCache(): WarehouseSessionCache {
  return { schemas: new Map(), schemasLoaded: false, probes: new Map() }
}

/** Normalizes a table name by stripping quotes and lowercasing. */
export function normalizeTableName(name: string): string {
  return name.replace(/["`]/g, '').trim().toLowerCase()
}

/** Stores a schema under its full name plus trailing `dataset.table` and `table` aliases for fast lookup. */
export function cacheTableSchema(cache: WarehouseSessionCache, schema: WarehouseTableSchema): void {
  const full = normalizeTableName(schema.name)
  cache.schemas.set(full, schema)
  const parts = full.split('.')
  if (parts.length >= 2)
    cache.schemas.set(parts.slice(-2).join('.'), schema)
  const short = parts[parts.length - 1]
  if (short && !cache.schemas.has(short))
    cache.schemas.set(short, schema)
}

/** Looks up a cached table schema by full, dataset.table, or bare table name. */
export function lookupTableSchema(cache: WarehouseSessionCache | undefined, tableName: string): WarehouseTableSchema | undefined {
  if (!cache)
    return undefined
  const norm = normalizeTableName(tableName)
  const direct = cache.schemas.get(norm)
  if (direct)
    return direct
  const parts = norm.split('.')
  if (parts.length >= 2) {
    const two = cache.schemas.get(parts.slice(-2).join('.'))
    if (two)
      return two
  }
  return cache.schemas.get(parts[parts.length - 1])
}

/** Distinct cached table schemas in insertion order. */
export function listCachedSchemas(cache: WarehouseSessionCache | undefined): WarehouseTableSchema[] {
  if (!cache)
    return []
  return [...new Map([...cache.schemas.values()].map(s => [normalizeTableName(s.name), s])).values()]
}

/** Quotes each dotted segment of a table reference using the warehouse dialect. */
export function quoteTableRef(tableName: string, dialect: SqlDialect): string {
  return tableName
    .replace(/["`]/g, '')
    .split('.')
    .filter(Boolean)
    .map(part => dialect.quoteName(part))
    .join('.')
}

/** Loads schemas from the connector's metadata API (0-scan) and populates the session cache. */
export async function loadWarehouseSchemas(
  warehouse: Pick<WarehouseConnector, 'describeTables'>,
  cache: WarehouseSessionCache,
  tables?: string[],
): Promise<WarehouseTableSchema[]> {
  if (!warehouse.describeTables)
    return listCachedSchemas(cache)
  if (!tables?.length && cache.schemasLoaded)
    return listCachedSchemas(cache)
  const fetched = await warehouse.describeTables(tables).catch(() => [] as WarehouseTableSchema[])
  for (const schema of fetched)
    cacheTableSchema(cache, schema)
  if (!tables?.length)
    cache.schemasLoaded = true
  return fetched.length > 0 ? fetched : listCachedSchemas(cache)
}

function isDateColumn(col: WarehouseColumnSchema): boolean {
  return DATE_TYPE_RE.test(col.type) || (!NUM_TYPE_RE.test(col.type) && DATE_NAME_RE.test(col.name))
}

function isNumericColumn(col: WarehouseColumnSchema): boolean {
  return NUM_TYPE_RE.test(col.type)
}

function isCategoricalCandidate(col: WarehouseColumnSchema): boolean {
  if (ID_KEY_RE.test(col.name) || isDateColumn(col) || isNumericColumn(col))
    return false
  return STRING_TYPE_RE.test(col.type) || col.type === ''
}

interface TableProbePlan {
  schema: WarehouseTableSchema
  keyCols: string[]
  dateCols: string[]
  catCols: string[]
  usedApprox: boolean
  sql: string
}

function selectColumnsToProbe(schema: WarehouseTableSchema) {
  const keyCols = schema.columns.filter(c => ID_KEY_RE.test(c.name)).slice(0, MAX_KEY_COLS).map(c => c.name)
  const dateCols = schema.columns.filter(isDateColumn).slice(0, MAX_DATE_COLS).map(c => c.name)
  const catCandidates = schema.columns.filter(isCategoricalCandidate)
  catCandidates.sort((a, b) => Number(HIGH_SIGNAL_CAT_RE.test(b.name)) - Number(HIGH_SIGNAL_CAT_RE.test(a.name)))
  const catCols = catCandidates.slice(0, MAX_CAT_COLS).map(c => c.name)
  return { keyCols, dateCols, catCols }
}

/** Builds one single-pass aggregate SELECT per table (0 raw rows returned). */
export function buildTableProfileSql(schema: WarehouseTableSchema, dialect: SqlDialect): TableProbePlan {
  const { keyCols, dateCols, catCols } = selectColumnsToProbe(schema)
  const exprs: string[] = ['COUNT(*) AS _n']
  const distinctFn = dialect.approxCountDistinct ?? (expr => `COUNT(DISTINCT ${expr})`)

  keyCols.forEach((col, i) => {
    const q = dialect.quoteName(col)
    exprs.push(`COUNT(${q}) AS _kc_${i}`, `${distinctFn(q)} AS _kd_${i}`)
  })
  dateCols.forEach((col, i) => {
    const q = dialect.quoteName(col)
    exprs.push(`MIN(${q}) AS _dmin_${i}`, `MAX(${q}) AS _dmax_${i}`)
  })
  catCols.forEach((col, i) => {
    const q = dialect.quoteName(col)
    exprs.push(
      `SUM(CASE WHEN ${q} IS NULL THEN 1 ELSE 0 END) AS _null_${i}`,
      `${distinctFn(q)} AS _dist_${i}`,
    )
    if (dialect.sampleDistinct)
      exprs.push(`${dialect.sampleDistinct(q, 8)} AS _vals_${i}`)
  })

  const sql = `SELECT ${exprs.join(', ')} FROM ${quoteTableRef(schema.name, dialect)}`
  return { schema, keyCols, dateCols, catCols, usedApprox: Boolean(dialect.approxCountDistinct), sql }
}

interface ParsedKeyStat { col: string, nonNull: number, distinct: number, ratio: number }
interface ParsedDateStat { col: string, min: string, max: string, partialNote?: string }
interface ParsedCatStat { col: string, nullCount: number, nullPct: number, distinct: number, values?: string }

interface TableProfileResult {
  schema: WarehouseTableSchema
  rowCount: number
  keys: ParsedKeyStat[]
  dates: ParsedDateStat[]
  cats: ParsedCatStat[]
}

function isoDay(raw: unknown): string {
  const m = ISO_DAY_RE.exec(String(raw ?? '').trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

function detectPartialMonthFromRange(minDay: string, maxDay: string): string | undefined {
  if (!minDay || !maxDay)
    return undefined
  const spanDays = (Date.parse(`${maxDay}T00:00:00Z`) - Date.parse(`${minDay}T00:00:00Z`)) / 86_400_000
  if (!Number.isFinite(spanDays) || spanDays < 60)
    return undefined
  const dayOfMonth = Number(maxDay.slice(8, 10))
  // Skip month-start lookup tables (e.g. fx_rates where every date is the 1st of the month).
  if (dayOfMonth <= 1 || dayOfMonth > 25)
    return undefined
  return `trailing month \`${maxDay.slice(0, 7)}\` stops at ${maxDay} (${dayOfMonth} days — partial month; compare daily run-rate, not raw totals)`
}

function parseTableProfile(plan: TableProbePlan, row: Record<string, unknown> | undefined, cache: WarehouseSessionCache): TableProfileResult {
  const rowCount = row ? Number(probeValue(row, '_n') ?? plan.schema.rowCount ?? 0) : (plan.schema.rowCount ?? 0)
  const tblKey = normalizeTableName(plan.schema.name)

  const keys: ParsedKeyStat[] = row
    ? plan.keyCols.map((col, i) => {
        const nonNull = Number(probeValue(row, `_kc_${i}`) ?? 0)
        const distinct = Number(probeValue(row, `_kd_${i}`) ?? 0)
        const ratio = distinct > 0 ? nonNull / distinct : 0
        // Approximate distinct counts (HyperLogLog) have ~1% noise: treat <=1.02x as unique,
        // cache >1.03x as genuine fan-out, and leave the narrow 1.02–1.03x band for exact probe.
        if (!plan.usedApprox || ratio > 1.03)
          cache.probes.set(`grain:${tblKey}:${col.toLowerCase()}`, { total_rows: nonNull, distinct_keys: distinct })
        else if (ratio <= 1.02)
          cache.probes.set(`grain:${tblKey}:${col.toLowerCase()}`, { total_rows: nonNull, distinct_keys: nonNull })
        return { col, nonNull, distinct, ratio }
      })
    : []

  const dates: ParsedDateStat[] = row
    ? plan.dateCols.flatMap((col, i) => {
        const min = isoDay(probeValue(row, `_dmin_${i}`))
        const max = isoDay(probeValue(row, `_dmax_${i}`))
        return min && max ? [{ col, min, max, partialNote: detectPartialMonthFromRange(min, max) }] : []
      })
    : []

  const cats: ParsedCatStat[] = row
    ? plan.catCols.map((col, i) => {
        const nullCount = Number(probeValue(row, `_null_${i}`) ?? 0)
        const distinct = Number(probeValue(row, `_dist_${i}`) ?? 0)
        const rawVals = probeValue(row, `_vals_${i}`)
        const values = rawVals !== null && rawVals !== undefined && String(rawVals).trim() ? String(rawVals).trim() : undefined
        const nullPct = rowCount > 0 ? Math.round((nullCount / rowCount) * 100) : 0
        cache.probes.set(`null:${tblKey}:${col.toLowerCase()}`, { total_rows: rowCount, null_rows: nullCount })
        if (CURRENCY_COL_RE.test(col))
          cache.probes.set(`currency:${tblKey}:${col.toLowerCase()}`, { c: distinct, codes: values ?? '' })
        return { col, nullCount, nullPct, distinct, values }
      })
    : []

  return { schema: plan.schema, rowCount, keys, dates, cats }
}

function formatTableLine(res: TableProfileResult): string {
  const countStr = res.rowCount > 0 ? `${res.rowCount.toLocaleString('en-US')} rows` : 'row count unknown'
  const colsStr = res.schema.columns.map(c => `\`${c.name}\` ${c.type.toLowerCase()}`).join(', ')
  const details: string[] = []
  for (const d of res.dates)
    details.push(`${d.col}: ${d.min}..${d.max}`)
  for (const c of res.cats) {
    const parts: string[] = []
    if (c.values && c.distinct > 0 && c.distinct <= MAX_DISTINCT_PREVIEW)
      parts.push(`[${c.values}]`)
    else if (c.distinct > 0)
      parts.push(`${c.distinct.toLocaleString('en-US')} distinct`)
    if (c.nullPct >= 10)
      parts.push(`${c.nullPct}% NULL`)
    if (parts.length > 0)
      details.push(`${c.col}: ${parts.join(', ')}`)
  }
  const extra = details.length > 0 ? `\n  ${details.join(' · ')}` : ''
  return `- \`${res.schema.name}\` (${countStr}) · cols: ${colsStr}${extra}`
}

function collectJoinTraps(results: TableProfileResult[]): string[] {
  const byKey = new Map<string, Array<{ table: string, stat: ParsedKeyStat }>>()
  for (const res of results) {
    for (const stat of res.keys) {
      const k = stat.col.toLowerCase()
      const list = byKey.get(k) ?? []
      list.push({ table: res.schema.name, stat })
      byKey.set(k, list)
    }
  }
  const lines: string[] = []
  for (const [key, entries] of byKey) {
    if (entries.length < 2)
      continue
    const unique = entries.filter(e => e.stat.distinct > 0 && e.stat.ratio <= 1.02)
    const many = entries.filter(e => e.stat.distinct > 0 && e.stat.ratio > 1.05)
    for (const u of unique) {
      for (const m of many) {
        lines.push(`Join \`${u.table}.${key}\` ↔ \`${m.table}.${key}\`: 1:N ⚠️ \`${m.table}\` has ${m.stat.ratio.toFixed(2)}× rows per \`${key}\` — deduplicate or semi-join (\`IN (SELECT DISTINCT ...)\`) before summing \`${u.table}\`.`)
      }
    }
    if (unique.length === 0 && many.length >= 2) {
      lines.push(`Join on \`${key}\` between \`${many[0].table}\` (${many[0].stat.ratio.toFixed(2)}×) and \`${many[1].table}\` (${many[1].stat.ratio.toFixed(2)}×): M:N ⚠️ pre-aggregate each table by \`${key}\` before joining.`)
    }
  }
  return lines
}

function collectTableTraps(res: TableProfileResult): string[] {
  const traps: string[] = []
  const hasUniqueKey = res.keys.some(k => k.distinct > 0 && k.ratio <= 1.02)
  for (const k of res.keys) {
    if (!hasUniqueKey && PRIMARY_EVENT_ID_RE.test(k.col) && k.distinct > 0 && k.ratio >= 1.03 && res.rowCount >= 20)
      traps.push(`Duplicate \`${res.schema.name}.${k.col}\` (${k.nonNull.toLocaleString('en-US')} rows for ${k.distinct.toLocaleString('en-US')} unique IDs — ${k.ratio.toFixed(2)}× inflation; deduplicate before summing).`)
  }
  const partialDate = res.dates.find(d => d.partialNote)
  if (partialDate?.partialNote)
    traps.push(`Date completeness (\`${res.schema.name}.${partialDate.col}\`): ⚠️ ${partialDate.partialNote}.`)
  for (const c of res.cats) {
    if (c.nullPct >= 10)
      traps.push(`NULL values in \`${res.schema.name}.${c.col}\` (${c.nullPct}% NULL): use \`IS DISTINCT FROM\` or \`(${c.col} IS NULL OR ${c.col} != ...)\`, never bare \`!=\`.`)
    if (CURRENCY_COL_RE.test(c.col) && c.distinct >= 2) {
      const amtCol = res.schema.columns.find(col => isNumericColumn(col) && AMOUNT_COL_RE.test(col.name) && !/_usd$/i.test(col.name))
      if (amtCol)
        traps.push(`Mixed currencies in \`${res.schema.name}.${c.col}\` (${c.values ?? `${c.distinct} codes`}): never SUM raw \`${amtCol.name}\` across currencies — convert via FX rates or group by \`${c.col}\`.`)
    }
  }
  const nonAdd = res.schema.columns.filter(c => isNumericColumn(c) && isNonAdditiveMeasure(c.name, 'sum')).map(c => `\`${c.name}\``)
  if (nonAdd.length > 0)
    traps.push(`Non-additive rate column(s) in \`${res.schema.name}\` (${nonAdd.join(', ')}): compute weighted \`SUM(num) / NULLIF(SUM(den), 0)\`, never \`AVG\` or \`SUM\`.`)
  return traps
}

function datasetPrefix(tableName: string): string {
  const parts = normalizeTableName(tableName).split('.')
  return parts.length >= 2 ? parts.slice(0, -1).join('.') : ''
}

/**
 * Profiles a warehouse's tables in 1 call: 0-scan metadata schemas + 1 compact aggregate probe
 * per table (Pro), surfacing row counts, date ranges, distinct filter values, NULL traps,
 * join fan-out, mixed currencies, partial trailing months, and non-additive rate columns.
 */
export async function profileWarehouse(
  warehouse: WarehouseConnector,
  options: { tables?: string[], query?: string, isPro: boolean, cache: WarehouseSessionCache, timeoutMs?: number },
): Promise<string> {
  const { tables, query, isPro, cache, timeoutMs = WAREHOUSE_PROFILE_MS } = options
  const schemas = await loadWarehouseSchemas(warehouse, cache, tables)
  if (schemas.length === 0) {
    const listed = await warehouse.listTables().catch(() => [] as string[])
    return listed.length > 0
      ? `${warehouse.label} tables: ${listed.map(t => `\`${t}\``).join(', ')} (column metadata unavailable; run a SELECT ... LIMIT 5).`
      : `No ${warehouse.label} tables found${tables?.length ? ` matching ${tables.join(', ')}` : ''}.`
  }

  const trimmedQuery = query?.trim()
  let selectedSchemas = schemas
  let searchHeader = ''
  if (trimmedQuery) {
    const ranked = rankWarehouseSchemas(schemas, trimmedQuery, MAX_PROFILED_TABLES)
    if (ranked.length === 0) {
      const sample = schemas.slice(0, 12).map(s => `\`${s.name}\``).join(', ')
      return `No ${warehouse.label} tables matched "${trimmedQuery}" across ${schemas.length} catalog tables. Sample tables: ${sample}${schemas.length > 12 ? ', …' : ''}.`
    }
    selectedSchemas = ranked.map(r => r.schema)
    searchHeader = `Matched ${ranked.length} of ${schemas.length} **${warehouse.label}** tables for "${trimmedQuery}" (BM25 catalog search; query via \`${warehouse.toolName}\`):`
  }

  // When no filter/query was passed and multiple datasets exceed the probe budget, return the full 0-scan
  // metadata catalog across all datasets so the model never misses its target dataset or wastes scans.
  const distinctDatasets = [...new Set(selectedSchemas.map(s => datasetPrefix(s.name)).filter(Boolean))]
  if (!tables?.length && !trimmedQuery && selectedSchemas.length > MAX_PROFILED_TABLES && distinctDatasets.length > 1) {
    const lines = [
      `Catalog of **${warehouse.label}** (${selectedSchemas.length} tables across ${distinctDatasets.length} datasets: ${distinctDatasets.map(d => `\`${d}\``).join(', ')}; query via \`${warehouse.toolName}\`):`,
      ...selectedSchemas.map((s) => {
        const countStr = s.rowCount !== undefined ? `${s.rowCount.toLocaleString('en-US')} rows` : 'row count unknown'
        const colsStr = s.columns.map(c => `\`${c.name}\` ${c.type.toLowerCase()}`).join(', ')
        return `- \`${s.name}\` (${countStr}) · cols: ${colsStr}`
      }),
      '',
      `Pass \`tables: ["<dataset>"]\` (for example \`profile(warehouse="${warehouse.id}", tables=["${distinctDatasets[distinctDatasets.length - 1]}"])\`) or \`query: "<keywords>"\` to narrow to the tables you need${isPro ? ' with deep value, date-range, NULL, currency & join fan-out checks' : ''}.`,
    ]
    return lines.join('\n')
  }

  const targetSchemas = selectedSchemas.slice(0, MAX_PROFILED_TABLES)
  const plans = targetSchemas.map(s => buildTableProfileSql(s, warehouse.dialect))

  const probeRows = isPro
    ? await mapWarehouseWork(plans, warehouse.concurrent, async (plan) => {
        const key = `profile:${normalizeTableName(plan.schema.name)}`
        if (cache.probes.has(key))
          return cache.probes.get(key)
        const res = await withinBudget(
          warehouse.query(plan.sql).then(r => r.rows[0]).catch(() => undefined),
          timeoutMs,
        )
        const row = res === 'pending' ? undefined : res
        cache.probes.set(key, row)
        return row
      })
    : plans.map(() => undefined)

  const results = plans.map((plan, i) => parseTableProfile(plan, probeRows[i], cache))
  const header = searchHeader || `Profile of **${warehouse.label}** (${results.length} table${results.length === 1 ? '' : 's'}${selectedSchemas.length > results.length ? ` of ${selectedSchemas.length}` : ''}; query via \`${warehouse.toolName}\`):`
  const lines = [
    header,
    ...results.map(formatTableLine),
  ]
  if (selectedSchemas.length > results.length) {
    const rest = selectedSchemas.slice(results.length).map(s => `\`${s.name}\``).join(', ')
    lines.push(`- _Other matching tables not deep-probed: ${rest}_`)
  }

  if (isPro) {
    const traps = [...collectJoinTraps(results), ...results.flatMap(collectTableTraps)]
    if (traps.length > 0)
      lines.push('', '**Relational & Guardrail Summary (Pro)**', ...traps.slice(0, 10).map(t => `- ${t}`))
  }

  return lines.join('\n')
}
