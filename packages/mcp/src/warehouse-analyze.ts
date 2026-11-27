import type { AnalyzeInput, AnalyzeOutput, CohortRetentionCount } from './analyze.js'
import type { StoredDataset } from './store.js'
import type { WarehouseSessionCache } from './warehouse-profile.js'
import type { SqlDialect, WarehouseColumnSchema, WarehouseConnector, WarehouseTableSchema } from './warehouse.js'
import {
  buildCohortRetentionFromCounts,
  buildRegressionOutput,
  chiSq1P,
  fitOlsFromSufficientStats,
  runAbTest,
  runAnalysis,
  runAnomalyDetection,
  twoSidedTP,
} from './analyze.js'
import { probeValue } from './audit.js'
import { inferColumns } from './store.js'
import { loadWarehouseSchemas, lookupTableSchema, quoteTableRef } from './warehouse-profile.js'

/**
 * SQL-pushed Data Science Shelf (`analyze`) for direct warehouse tables.
 *
 * Computes exact sufficient statistics in 1 read-only aggregate SQL query inside the warehouse
 * (never pulling raw rows or hitting the 5,000-row cap), then feeds them into TinyPivot's
 * deterministic statistical engines (`explain_change`, `ab_test`, `regression`,
 * `cohort_retention`, `anomalies`).
 */

const NUM_TYPE_RE = /int|float|double|numeric|decimal|real|number|bigint|smallint|tinyint|bignumeric/i
const DATE_TYPE_RE = /date|time/i
const STRING_TYPE_RE = /char|string|text|enum|lowcardinality/i
const SAFE_COL_RE = /^[A-Z_][\w$]*$/i
const MAX_REG_PREDICTORS = 6

function isNumCol(c: WarehouseColumnSchema): boolean {
  return NUM_TYPE_RE.test(c.type)
}

function isDateCol(c: WarehouseColumnSchema): boolean {
  return DATE_TYPE_RE.test(c.type) || (!isNumCol(c) && /(?:^|_)(?:date|day|month|dt|_at|_ts)$/i.test(c.name))
}

function isStringCol(c: WarehouseColumnSchema): boolean {
  return !isNumCol(c) && !isDateCol(c) && (STRING_TYPE_RE.test(c.type) || c.type === '')
}

function assertColumn(col: string, label: string): string {
  const clean = col.replace(/["`]/g, '').trim()
  if (!SAFE_COL_RE.test(clean))
    throw new Error(`Invalid column name "${col}" for ${label}.`)
  return clean
}

function findCol(cols: WarehouseColumnSchema[], re: RegExp, pred?: (c: WarehouseColumnSchema) => boolean): string | undefined {
  return cols.find(c => (!pred || pred(c)) && re.test(c.name))?.name
}

function yearMonthExpr(dialect: SqlDialect, colExpr: string): string {
  return dialect.yearMonth ? dialect.yearMonth(colExpr) : `SUBSTR(CAST(${colExpr} AS VARCHAR), 1, 7)`
}

function synthDataset(name: string, rows: Record<string, unknown>[]): StoredDataset {
  return {
    id: name,
    name,
    source: 'warehouse',
    ingestionMode: 'direct',
    rawBytes: 0,
    estimatedDatasetTokens: 0,
    rows,
    columns: inferColumns(rows),
    sourceTotalRows: rows.length,
    truncatedForFreeTier: false,
    viewMode: 'grid',
    loadedAt: new Date().toISOString(),
  }
}

/** Ensures we have column metadata for `table` (reusing session cache when already loaded). */
async function resolveSchema(
  warehouse: WarehouseConnector,
  table: string,
  cache: WarehouseSessionCache,
): Promise<WarehouseTableSchema> {
  const cached = lookupTableSchema(cache, table)
  if (cached && cached.columns.length > 0)
    return cached
  const loaded = await loadWarehouseSchemas(warehouse, cache, [table])
  const match = lookupTableSchema(cache, table) ?? loaded[0]
  if (!match || match.columns.length === 0)
    throw new Error(`Could not inspect columns for ${warehouse.label} table "${table}". Pass a full table name (e.g. dataset.table) or call profile(warehouse="${warehouse.id}") first.`)
  return match
}

function normalizeRowsLower(rows: Record<string, unknown>[], keys: string[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const k of keys)
      out[k] = probeValue(row, k)
    return out
  })
}

async function runWarehouseAnomalies(
  warehouse: WarehouseConnector,
  schema: WarehouseTableSchema,
  input: AnalyzeInput,
): Promise<AnalyzeOutput> {
  const cols = schema.columns
  const dateField = assertColumn(input.dateField ?? findCol(cols, /date|day/i, isDateCol) ?? cols.find(isDateCol)?.name ?? '', 'dateField')
  const metric = assertColumn(input.metric ?? findCol(cols, /revenue|amount|orders|sales|conversions|sessions|spend|value/i, isNumCol) ?? cols.find(c => isNumCol(c) && !/id$/i.test(c.name))?.name ?? '', 'metric')
  const qDate = warehouse.dialect.quoteName(dateField)
  const qMetric = warehouse.dialect.quoteName(metric)
  const tRef = quoteTableRef(schema.name, warehouse.dialect)
  const sql = `SELECT CAST(${qDate} AS DATE) AS _day, SUM(${qMetric}) AS _val FROM ${tRef} WHERE ${qDate} IS NOT NULL AND ${qMetric} IS NOT NULL GROUP BY CAST(${qDate} AS DATE) ORDER BY 1`
  const res = await warehouse.query(sql)
  const rows = normalizeRowsLower(res.rows, ['_day', '_val']).map(r => ({
    [dateField]: String(r._day ?? '').slice(0, 10),
    [metric]: Number(r._val ?? 0),
  }))
  return runAnomalyDetection(synthDataset(schema.name, rows), { ...input, dateField, metric })
}

async function runWarehouseCohortRetention(
  warehouse: WarehouseConnector,
  schema: WarehouseTableSchema,
  input: AnalyzeInput,
): Promise<AnalyzeOutput> {
  const cols = schema.columns
  const entityField = assertColumn(input.entityField ?? findCol(cols, /user|customer|account|member/i) ?? '', 'entityField')
  const dateField = assertColumn(input.dateField ?? findCol(cols, /date|month|_at$/i, isDateCol) ?? cols.find(isDateCol)?.name ?? '', 'dateField')
  const cohortCol = input.cohortField ? assertColumn(input.cohortField, 'cohortField') : undefined
  const qEnt = warehouse.dialect.quoteName(entityField)
  const qDate = warehouse.dialect.quoteName(dateField)
  const ymDate = yearMonthExpr(warehouse.dialect, qDate)
  const ymCohort = cohortCol ? yearMonthExpr(warehouse.dialect, warehouse.dialect.quoteName(cohortCol)) : ymDate
  const tRef = quoteTableRef(schema.name, warehouse.dialect)

  const sql = `WITH _base AS (SELECT ${qEnt} AS _ent, ${ymDate} AS _ym, ${ymCohort} AS _cym FROM ${tRef} WHERE ${qEnt} IS NOT NULL AND ${qDate} IS NOT NULL), `
    + `_firsts AS (SELECT _ent, MIN(_cym) AS _cohort FROM _base GROUP BY _ent), `
    + `_pairs AS (SELECT DISTINCT f._cohort, b._ym, b._ent FROM _firsts f JOIN _base b ON f._ent = b._ent) `
    + `SELECT _cohort AS cohort, _ym AS active_month, COUNT(*) AS active_entities FROM _pairs GROUP BY _cohort, _ym ORDER BY 1, 2`

  const res = await warehouse.query(sql)
  const counts: CohortRetentionCount[] = res.rows.map(r => ({
    cohort: String(probeValue(r, 'cohort') ?? ''),
    activeMonth: String(probeValue(r, 'active_month') ?? ''),
    activeEntities: Number(probeValue(r, 'active_entities') ?? 0),
  }))
  return buildCohortRetentionFromCounts({ entityField, counts })
}

async function runWarehouseExplainChange(
  warehouse: WarehouseConnector,
  schema: WarehouseTableSchema,
  input: AnalyzeInput,
): Promise<AnalyzeOutput> {
  const cols = schema.columns
  const periodCol = assertColumn(input.periodField ?? findCol(cols, /period|quarter|month|year|date|cohort|wave/i) ?? '', 'periodField')
  const periodInfo = cols.find(c => c.name.toLowerCase() === periodCol.toLowerCase())
  const bucketMonth = Boolean(periodInfo && isDateCol(periodInfo))
  const qPeriod = warehouse.dialect.quoteName(periodCol)
  const periodExpr = bucketMonth ? yearMonthExpr(warehouse.dialect, qPeriod) : qPeriod

  const autoNum = !input.metric && !input.numerator ? findCol(cols, /convert|success|profit|retained|clicks/i, isNumCol) : undefined
  const autoDen = !input.metric && !input.denominator ? findCol(cols, /visit|trial|impres|session|users|leads/i, isNumCol) : undefined
  const numerator = input.numerator ? assertColumn(input.numerator, 'numerator') : (autoNum && autoDen && autoNum !== autoDen ? autoNum : undefined)
  const denominator = input.denominator ? assertColumn(input.denominator, 'denominator') : (autoNum && autoDen && autoNum !== autoDen ? autoDen : undefined)
  const metric = !numerator && !denominator
    ? assertColumn(input.metric ?? findCol(cols, /revenue|sales|mrr|arr|amount|orders|units|spend/i, isNumCol) ?? cols.find(c => isNumCol(c) && !/id$/i.test(c.name))?.name ?? '', 'metric')
    : undefined

  const rawDims = input.dimensions?.length
    ? input.dimensions.slice(0, 4).map(d => assertColumn(d, 'dimensions'))
    : cols.filter(c => isStringCol(c) && c.name !== periodCol && !/id$|code$/i.test(c.name)).slice(0, 3).map(c => c.name)
  const dims = rawDims.filter(d => d.toLowerCase() !== periodCol.toLowerCase())

  const groupExprs = [periodExpr, ...dims.map(d => warehouse.dialect.quoteName(d))]
  const selectParts = [`${periodExpr} AS ${qPeriod}`, ...dims.map(d => warehouse.dialect.quoteName(d))]
  if (numerator && denominator) {
    const qN = warehouse.dialect.quoteName(numerator)
    const qD = warehouse.dialect.quoteName(denominator)
    selectParts.push(`SUM(${qN}) AS ${qN}`, `SUM(${qD}) AS ${qD}`)
  }
  else if (metric) {
    const qM = warehouse.dialect.quoteName(metric)
    selectParts.push(`SUM(${qM}) AS ${qM}`)
  }
  const tRef = quoteTableRef(schema.name, warehouse.dialect)
  const sql = `SELECT ${selectParts.join(', ')} FROM ${tRef} WHERE ${qPeriod} IS NOT NULL GROUP BY ${groupExprs.join(', ')} ORDER BY 1`
  const res = await warehouse.query(sql)
  const keepCols = [periodCol, ...dims, ...(numerator && denominator ? [numerator, denominator] : metric ? [metric] : [])]
  const rows = normalizeRowsLower(res.rows, keepCols)
  return runAnalysis(
    synthDataset(schema.name, rows),
    { ...input, method: 'explain_change', periodField: periodCol, dimensions: dims, metric, numerator, denominator },
    { proGuards: true },
  )
}

interface MomentBucket { n: number, sum: number, sum2: number }

function welchFromMoments(c: MomentBucket, t: MomentBucket) {
  const cMean = c.n > 0 ? c.sum / c.n : 0
  const tMean = t.n > 0 ? t.sum / t.n : 0
  const cVar = c.n > 1 ? Math.max(0, (c.sum2 - (c.sum * c.sum) / c.n) / (c.n - 1)) : 0
  const tVar = t.n > 1 ? Math.max(0, (t.sum2 - (t.sum * t.sum) / t.n) / (t.n - 1)) : 0
  const se = Math.sqrt(Math.max(1e-15, cVar / Math.max(1, c.n) + tVar / Math.max(1, t.n)))
  const diff = tMean - cMean
  const numDf = (cVar / Math.max(1, c.n) + tVar / Math.max(1, t.n)) ** 2
  const denDf = ((cVar / Math.max(1, c.n)) ** 2) / Math.max(1, c.n - 1) + ((tVar / Math.max(1, t.n)) ** 2) / Math.max(1, t.n - 1)
  const df = denDf > 0 ? numDf / denDf : Math.max(1, c.n + t.n - 2)
  return {
    nControl: c.n,
    nTreat: t.n,
    controlMean: cMean,
    treatMean: tMean,
    absLift: diff,
    relLiftPct: cMean !== 0 ? (diff / Math.abs(cMean)) * 100 : 0,
    ciLow: diff - 1.96 * se,
    ciHigh: diff + 1.96 * se,
    pValue: twoSidedTP(diff / se, df),
  }
}

function buildContinuousAbOutput(params: {
  metric: string
  controlVal: string
  treatVal: string
  segCol?: string
  expectedSplit: number
  proGuards: boolean
  byVariant: Map<string, MomentBucket>
  bySeg: Map<string, Map<string, MomentBucket>>
}): AnalyzeOutput {
  const { metric, controlVal, treatVal, segCol, expectedSplit, proGuards, byVariant, bySeg } = params
  const overall = welchFromMoments(byVariant.get(controlVal) ?? { n: 0, sum: 0, sum2: 0 }, byVariant.get(treatVal) ?? { n: 0, sum: 0, sum2: 0 })
  const flags: string[] = []
  const fmt = (v: number, d = 2) => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : 'N/A'
  const fmtP = (p: number) => p < 0.0001 ? '<0.0001' : p.toFixed(4)
  const lines = [
    `### Deterministic A/B Test (Warehouse SQL): \`${treatVal}\` vs \`${controlVal}\` on \`${metric}\``,
    `- **${controlVal}**: ${fmt(overall.controlMean)} (n = ${overall.nControl.toLocaleString('en-US')}) → **${treatVal}**: ${fmt(overall.treatMean)} (n = ${overall.nTreat.toLocaleString('en-US')})`,
    `- **Lift**: ${overall.absLift >= 0 ? '+' : ''}${fmt(overall.absLift)} (${overall.relLiftPct >= 0 ? '+' : ''}${fmt(overall.relLiftPct, 1)}% rel), 95% CI [${fmt(overall.ciLow)}, ${fmt(overall.ciHigh)}], **p = ${fmtP(overall.pValue)}** (${overall.pValue < 0.05 ? 'statistically significant at α=0.05' : 'NOT statistically significant at α=0.05'}).`,
  ]
  const rows: Record<string, unknown>[] = [{
    segment: 'Overall',
    control_n: overall.nControl,
    treatment_n: overall.nTreat,
    control_val: Number(overall.controlMean.toFixed(3)),
    treatment_val: Number(overall.treatMean.toFixed(3)),
    abs_lift: Number(overall.absLift.toFixed(3)),
    rel_lift_pct: Number(overall.relLiftPct.toFixed(2)),
    p_value: Number(overall.pValue.toFixed(5)),
    holm_p_value: Number(overall.pValue.toFixed(5)),
  }]

  if (proGuards) {
    const totalN = overall.nControl + overall.nTreat
    const expC = totalN * expectedSplit
    const expT = totalN * (1 - expectedSplit)
    const chiSq = ((overall.nControl - expC) ** 2) / Math.max(1, expC) + ((overall.nTreat - expT) ** 2) / Math.max(1, expT)
    const srmP = chiSq1P(chiSq)
    const treatPct = totalN > 0 ? (overall.nTreat / totalN) * 100 : 50
    if (srmP < 0.001) {
      flags.push('srm_detected')
      lines.push(`- **⚠️ SAMPLE RATIO MISMATCH (SRM) DETECTED**: Traffic split is **${fmt(100 - treatPct, 1)}% / ${fmt(treatPct, 1)}%** (${overall.nControl.toLocaleString('en-US')} vs ${overall.nTreat.toLocaleString('en-US')}, χ² = ${fmt(chiSq, 1)}, **p = ${fmtP(srmP)}**). Do NOT trust the overall treatment lift as causal.`)
    }
    else {
      lines.push(`- **SRM Check (Pro)**: Passed (${fmt(100 - treatPct, 1)}% / ${fmt(treatPct, 1)}%, χ² = ${fmt(chiSq, 2)}, p = ${fmtP(srmP)}).`)
    }

    if (segCol && bySeg.size >= 2) {
      const segStats = [...bySeg.entries()]
        .map(([seg, map]) => ({ seg, stats: welchFromMoments(map.get(controlVal) ?? { n: 0, sum: 0, sum2: 0 }, map.get(treatVal) ?? { n: 0, sum: 0, sum2: 0 }) }))
        .filter(s => s.stats.nControl > 0 && s.stats.nTreat > 0)
      const m = segStats.length
      const order = segStats.map((r, idx) => ({ idx, p: r.stats.pValue })).sort((a, b) => a.p - b.p)
      const adj = Array.from<number>({ length: m }).fill(1)
      let runningMax = 0
      for (let rank = 0; rank < m; rank++) {
        runningMax = Math.max(runningMax, Math.min(1, order[rank].p * (m - rank)))
        adj[order[rank].idx] = runningMax
      }
      const falsePos: string[] = []
      segStats.forEach(({ seg, stats }, idx) => {
        const holmP = adj[idx]
        if (stats.pValue < 0.05 && holmP >= 0.05)
          falsePos.push(`\`${seg}\` (raw p=${fmtP(stats.pValue)} → Holm p=${fmtP(holmP)})`)
        rows.push({
          segment: seg,
          control_n: stats.nControl,
          treatment_n: stats.nTreat,
          control_val: Number(stats.controlMean.toFixed(3)),
          treatment_val: Number(stats.treatMean.toFixed(3)),
          abs_lift: Number(stats.absLift.toFixed(3)),
          rel_lift_pct: Number(stats.relLiftPct.toFixed(2)),
          p_value: Number(stats.pValue.toFixed(5)),
          holm_p_value: Number(holmP.toFixed(5)),
        })
      })
      if (falsePos.length > 0) {
        flags.push('multiple_testing_false_positive')
        lines.push(`- **⚠️ MULTIPLE-TESTING FALSE POSITIVE WARNING (Pro, \`${segCol}\`, ${m} segments)**: ${falsePos.join(', ')} failed Holm-Bonferroni correction.`)
      }
    }
  }

  return {
    method: 'ab_test',
    title: `A/B Test (${treatVal} vs ${controlVal})`,
    summaryText: lines.join('\n'),
    rows,
    chartConfig: {
      type: 'bar',
      xAxis: { field: 'segment', role: 'dimension' },
      yAxis: { field: 'abs_lift', role: 'measure', aggregation: 'sum' },
      options: { title: `A/B Lift (${treatVal} vs ${controlVal})`, sortOrder: 'value-desc', showLegend: false, showGrid: true },
    },
    flags,
  }
}

async function runWarehouseAbTest(
  warehouse: WarehouseConnector,
  schema: WarehouseTableSchema,
  input: AnalyzeInput,
  proGuards: boolean,
): Promise<AnalyzeOutput> {
  const cols = schema.columns
  const variantField = assertColumn(input.variantField ?? findCol(cols, /variant|group|arm|bucket|treatment|experiment/i, isStringCol) ?? '', 'variantField')
  const segCol = input.segmentField ? assertColumn(input.segmentField, 'segmentField') : undefined
  const qVar = warehouse.dialect.quoteName(variantField)
  const qSeg = segCol ? warehouse.dialect.quoteName(segCol) : undefined
  const tRef = quoteTableRef(schema.name, warehouse.dialect)
  const groupCols = qSeg ? `${qVar}, ${qSeg}` : qVar

  const successField = input.successField ?? (!input.metric ? findCol(cols, /convert|success|clicks|orders|wins|purchases|retained|renewed/i, isNumCol) : undefined)
  const trialsField = input.trialsField ?? (!input.metric ? findCol(cols, /trial|visit|impres|user|session|total|sample|denom|^n$/i, isNumCol) : undefined)

  // Aggregated binomial columns -> 1 SQL GROUP BY feeds directly into runAbTest
  if (successField && trialsField && !input.metric) {
    const sCol = assertColumn(successField, 'successField')
    const tCol = assertColumn(trialsField, 'trialsField')
    const qS = warehouse.dialect.quoteName(sCol)
    const qT = warehouse.dialect.quoteName(tCol)
    const sql = `SELECT ${groupCols}, SUM(${qS}) AS ${qS}, SUM(${qT}) AS ${qT} FROM ${tRef} WHERE ${qVar} IS NOT NULL GROUP BY ${groupCols}`
    const res = await warehouse.query(sql)
    const rows = normalizeRowsLower(res.rows, [variantField, ...(segCol ? [segCol] : []), sCol, tCol])
    return runAbTest(synthDataset(schema.name, rows), { ...input, variantField, segmentField: segCol, successField: sCol, trialsField: tCol }, { proGuards })
  }

  // Row-level binary or continuous metric -> exact moments (n, sum, sum2, non_bin)
  const metric = assertColumn(input.metric ?? successField ?? '', 'metric')
  const qM = warehouse.dialect.quoteName(metric)
  const sql = `SELECT ${groupCols}, COUNT(${qM}) AS _n, SUM(1.0 * ${qM}) AS _sum, SUM(1.0 * ${qM} * ${qM}) AS _sum2, SUM(CASE WHEN ${qM} IN (0, 1) THEN 0 ELSE 1 END) AS _non_bin FROM ${tRef} WHERE ${qVar} IS NOT NULL AND ${qM} IS NOT NULL GROUP BY ${groupCols}`
  const res = await warehouse.query(sql)
  const parsed = res.rows.map(r => ({
    variant: String(probeValue(r, variantField) ?? ''),
    seg: segCol ? String(probeValue(r, segCol) ?? '') : '',
    n: Number(probeValue(r, '_n') ?? 0),
    sum: Number(probeValue(r, '_sum') ?? 0),
    sum2: Number(probeValue(r, '_sum2') ?? 0),
    nonBin: Number(probeValue(r, '_non_bin') ?? 0),
  })).filter(r => r.variant && r.n > 0)

  const isBinary = parsed.length > 0 && parsed.every(r => r.nonBin === 0)
  if (isBinary) {
    const rows = parsed.map(r => ({
      [variantField]: r.variant,
      ...(segCol ? { [segCol]: r.seg } : {}),
      _succ: r.sum,
      _trials: r.n,
    }))
    return runAbTest(synthDataset(schema.name, rows), { ...input, variantField, segmentField: segCol, successField: '_succ', trialsField: '_trials' }, { proGuards })
  }

  const distinct = [...new Set(parsed.map(r => r.variant))].sort()
  if (distinct.length < 2)
    throw new Error(`variantField "${variantField}" needs at least 2 groups; found: ${distinct.join(', ')}.`)
  const controlVal = input.controlValue ?? distinct.find(v => /control|^a$|^0$|baseline/i.test(v)) ?? distinct[0]
  const treatVal = input.treatmentValue ?? distinct.find(v => v !== controlVal) ?? distinct[1]
  const byVariant = new Map<string, MomentBucket>()
  const bySeg = new Map<string, Map<string, MomentBucket>>()
  for (const r of parsed) {
    const cur = byVariant.get(r.variant) ?? { n: 0, sum: 0, sum2: 0 }
    byVariant.set(r.variant, { n: cur.n + r.n, sum: cur.sum + r.sum, sum2: cur.sum2 + r.sum2 })
    if (segCol && r.seg) {
      const m = bySeg.get(r.seg) ?? new Map<string, MomentBucket>()
      const prev = m.get(r.variant) ?? { n: 0, sum: 0, sum2: 0 }
      m.set(r.variant, { n: prev.n + r.n, sum: prev.sum + r.sum, sum2: prev.sum2 + r.sum2 })
      bySeg.set(r.seg, m)
    }
  }
  return buildContinuousAbOutput({ metric, controlVal, treatVal, segCol, expectedSplit: input.expectedSplit ?? 0.5, proGuards, byVariant, bySeg })
}

async function runWarehouseRegression(
  warehouse: WarehouseConnector,
  schema: WarehouseTableSchema,
  input: AnalyzeInput,
): Promise<AnalyzeOutput> {
  const cols = schema.columns
  const target = assertColumn(
    input.target ?? input.metric ?? findCol(cols, /renew|churn|convert|revenue|sales|ltv|spend|target|outcome/i, isNumCol) ?? [...cols].reverse().find(c => isNumCol(c) && !/id$/i.test(c.name))?.name ?? '',
    'target',
  )
  const requested = [...new Set([...(input.features ?? []), ...(input.controls ?? [])])].filter(c => c !== target)
  const numericPredictors = (requested.length > 0
    ? requested.map(c => assertColumn(c, 'predictor'))
    : cols.filter(c => c.name !== target && isNumCol(c) && !/(?:^|_)id$/i.test(c.name)).map(c => c.name)
  ).slice(0, MAX_REG_PREDICTORS)

  if (numericPredictors.length === 0)
    throw new Error('Warehouse regression requires at least one numeric feature or control column.')

  const qY = warehouse.dialect.quoteName(target)
  const qX = numericPredictors.map(c => warehouse.dialect.quoteName(c))
  const selectParts: string[] = ['COUNT(*) AS _n', `SUM(1.0 * ${qY}) AS _sy`, `SUM(1.0 * ${qY} * ${qY}) AS _syy`]
  for (let i = 0; i < qX.length; i++) {
    selectParts.push(`SUM(1.0 * ${qX[i]}) AS _sx_${i}`, `SUM(1.0 * ${qX[i]} * ${qY}) AS _sxy_${i}`)
    for (let j = i; j < qX.length; j++)
      selectParts.push(`SUM(1.0 * ${qX[i]} * ${qX[j]}) AS _sxx_${i}_${j}`)
  }
  const notNull = [qY, ...qX].map(q => `${q} IS NOT NULL`).join(' AND ')
  const tRef = quoteTableRef(schema.name, warehouse.dialect)
  const res = await warehouse.query(`SELECT ${selectParts.join(', ')} FROM ${tRef} WHERE ${notNull}`)
  const row = res.rows[0]
  const n = Number(probeValue(row, '_n') ?? 0)
  const sumY = Number(probeValue(row, '_sy') ?? 0)
  const sumYY = Number(probeValue(row, '_syy') ?? 0)
  const k = numericPredictors.length
  const p = k + 1
  const xtx = Array.from({ length: p }, () => Array.from<number>({ length: p }).fill(0))
  const xty = Array.from<number>({ length: p }).fill(0)
  xtx[0][0] = n
  xty[0] = sumY
  for (let i = 0; i < k; i++) {
    const sx = Number(probeValue(row, `_sx_${i}`) ?? 0)
    xtx[0][i + 1] = sx
    xtx[i + 1][0] = sx
    xty[i + 1] = Number(probeValue(row, `_sxy_${i}`) ?? 0)
    for (let j = i; j < k; j++) {
      const sxx = Number(probeValue(row, `_sxx_${i}_${j}`) ?? 0)
      xtx[i + 1][j + 1] = sxx
      xtx[j + 1][i + 1] = sxx
    }
  }

  const fit = fitOlsFromSufficientStats(n, xtx, xty, sumY, sumYY)
  const primaryFeature = input.features?.[0] ?? numericPredictors[0]
  const names = ['(intercept)', ...numericPredictors]
  let naiveBeta: number | undefined
  const pIdx = names.indexOf(primaryFeature)
  if (pIdx > 0 && k >= 2) {
    const naiveXtx = [[n, xtx[0][pIdx]], [xtx[0][pIdx], xtx[pIdx][pIdx]]]
    const naiveXty = [sumY, xty[pIdx]]
    naiveBeta = fitOlsFromSufficientStats(n, naiveXtx, naiveXty, sumY, sumYY).beta[1]
  }
  return buildRegressionOutput({ target, names, primaryFeature, predictors: numericPredictors, n, fit, naiveBeta })
}

/** Runs any of the 5 `analyze` methods directly against a warehouse table via SQL-aggregated sufficient statistics. */
export async function runWarehouseAnalysis(options: {
  warehouse: WarehouseConnector
  table: string
  input: AnalyzeInput
  cache: WarehouseSessionCache
  proGuards: boolean
}): Promise<AnalyzeOutput> {
  const { warehouse, table, input, cache, proGuards } = options
  const schema = await resolveSchema(warehouse, table, cache)
  switch (input.method) {
    case 'anomalies': return runWarehouseAnomalies(warehouse, schema, input)
    case 'cohort_retention': return runWarehouseCohortRetention(warehouse, schema, input)
    case 'explain_change': return runWarehouseExplainChange(warehouse, schema, input)
    case 'ab_test': return runWarehouseAbTest(warehouse, schema, input, proGuards)
    case 'regression': return runWarehouseRegression(warehouse, schema, input)
    default: throw new Error(`Unknown analysis method "${String(input.method)}".`)
  }
}
