import type { ChartConfig, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { TraceStep } from './studio-protocol.js'

/**
 * Pure, browser-safe proof-of-work lineage analyzer shared by Studio IDE, Notebook view,
 * and offline HTML report exports.
 *
 * Traces how a rendered chart or pivot was produced:
 *   Underlying Source (file / upstream table + row count)
 *     -> SQL Filters, Joins & Aggregations (WHERE, GROUP BY, SUM/AVG/COUNT)
 *     -> Output Data Frame (rows x cols + content fingerprint hash)
 *     -> Client-side Chart / Pivot Aggregation (JS/TS grouping, measure, sort, render)
 */

export interface SqlLineageInfo {
  sources: string[]
  joins: string[]
  whereClause?: string
  groupBy: string[]
  aggregations: string[]
}

export interface LineageNode {
  stage: 'source' | 'sql' | 'dataframe' | 'visual' | 'proof'
  label: string
  summary: string
  details: string[]
  /** When this node points to an earlier step in the same isolated session, allows jumping to its underlying rows. */
  stepId?: string
}

export interface StepLineage {
  nodes: LineageNode[]
  /** Concise 1-line breadcrumb summary for headers/cells. */
  oneLine: string
  /** Upstream steps in the same isolated session that supplied underlying rows to this step. */
  upstreamSteps: TraceStep[]
  sqlInfo: SqlLineageInfo
}

const AGG_CORE = '(?:SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|QUANTILE_CONT|APPROX_COUNT_DISTINCT|STRING_AGG|ARRAY_AGG)\\s*\\([^()]*(?:\\([^()]*\\)[^()]*)*\\)'
const AGG_FN_RE = new RegExp(`\\b(?:ROUND\\s*\\(\\s*${AGG_CORE}\\s*(?:,\\s*\\d+)?\\s*\\)|${AGG_CORE})(?:\\s+AS\\s+["\`\\w]+)?`, 'gi')
const FROM_JOIN_RE = /\b(FROM|JOIN)\s+(?:'([^']+)'|"([^"]+)"|([A-Z_][\w.-]*))/gi
const CTE_NAME_RE = /\b(?:WITH|,)\s*(?:RECURSIVE\s+)?["`]?([A-Z_][\w$]*)["`]?\s+AS\s*\(/gi

const SORT_LABELS: Record<string, string> = {
  'value-desc': 'desc by value',
  'value-asc': 'asc by value',
  'label-asc': 'A–Z / chronological',
  'data': 'SQL row order',
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

function cleanClause(raw: string, maxLen = 140): string {
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}…` : oneLine
}

/** Extracts source tables/files, joins, WHERE filters, GROUP BY keys, and SQL aggregations. */
export function extractSqlLineage(sql?: string): SqlLineageInfo {
  if (!sql?.trim())
    return { sources: [], joins: [], groupBy: [], aggregations: [] }

  const cleaned = stripSqlComments(sql)

  // Ignore CTE names defined in WITH ... AS (...) so only real upstream tables/files appear as sources.
  const cteNames = new Set<string>()
  for (const m of cleaned.matchAll(CTE_NAME_RE)) {
    if (m[1])
      cteNames.add(m[1].toLowerCase())
  }

  const sources: string[] = []
  const joins: string[] = []
  const seenSources = new Set<string>()
  for (const m of cleaned.matchAll(FROM_JOIN_RE)) {
    const kw = (m[1] ?? '').toUpperCase()
    const rawName = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (!rawName || cteNames.has(rawName.toLowerCase()))
      continue
    if (kw === 'JOIN' && !joins.includes(rawName))
      joins.push(rawName)
    if (!seenSources.has(rawName.toLowerCase())) {
      seenSources.add(rawName.toLowerCase())
      sources.push(rawName)
    }
  }

  // Extract WHERE clause up to GROUP BY / HAVING / ORDER BY / LIMIT / QUALIFY / UNION / ;
  const whereMatch = /\bWHERE\s+([\s\S]+?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|QUALIFY|UNION|WINDOW)\b|;|$)/i.exec(cleaned)
  const whereClause = whereMatch?.[1] ? cleanClause(whereMatch[1]) : undefined

  // Extract GROUP BY columns
  const groupMatch = /\bGROUP\s+BY\s+([\s\S]+?)(?=\b(?:HAVING|ORDER\s+BY|LIMIT|QUALIFY|UNION|WINDOW)\b|;|$)/i.exec(cleaned)
  const groupBy = groupMatch?.[1]
    ? groupMatch[1].split(',').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
    : []

  // Extract SQL aggregate expressions (deduplicated)
  const aggregations: string[] = []
  const seenAggs = new Set<string>()
  for (const m of cleaned.matchAll(AGG_FN_RE)) {
    const expr = cleanClause(m[0], 80)
    const key = expr.toLowerCase()
    if (!seenAggs.has(key)) {
      seenAggs.add(key)
      aggregations.push(expr)
    }
  }

  return { sources, joins, whereClause, groupBy, aggregations }
}

function normalizeTableRef(ref: string): string {
  const base = ref.replace(/^.*[/\\]/, '').toLowerCase()
  return base.replace(/\.(?:csv|tsv|json|jsonl|parquet|xlsx|xls)$/i, '')
}

function findUpstreamSteps(step: TraceStep, allSteps: TraceStep[], sources: string[]): TraceStep[] {
  if (sources.length === 0)
    return []
  const stepIdx = allSteps.findIndex(s => s.id === step.id)
  const earlier = stepIdx >= 0 ? allSteps.slice(0, stepIdx) : allSteps
  const matched: TraceStep[] = []
  const seenIds = new Set<string>()

  for (const src of sources) {
    const normSrc = normalizeTableRef(src)
    // Pick the most recent earlier step matching datasetId, source file path, or slugged name.
    const candidate = [...earlier].reverse().find((s) => {
      if (s.id === step.id || !s.datasetId || s.tool === 'reply' || s.tool === 'note' || s.tool === 'profile')
        return false
      if (s.datasetId.toLowerCase() === src.toLowerCase())
        return true
      if (s.file && normalizeTableRef(s.file) === normSrc)
        return true
      if (s.datasetName && s.datasetName.toLowerCase().replace(/[^a-z0-9]+/g, '_') === normSrc)
        return true
      return false
    })
    if (candidate && !seenIds.has(candidate.id)) {
      seenIds.add(candidate.id)
      matched.push(candidate)
    }
  }
  return matched
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Builds a complete, easy-to-read proof-of-work lineage chain for one Studio step. */
export function buildStepLineage(
  step: TraceStep | undefined,
  allSteps: TraceStep[],
  options: {
    datasetName?: string
    rowCount?: number
    columnCount?: number
    viewMode?: DataGridViewMode
    chartConfig?: Partial<ChartConfig>
    pivotConfig?: Partial<PivotConfig>
    filterFields?: string[]
  } = {},
): StepLineage {
  const sql = step?.sql ?? ''
  const sqlInfo = extractSqlLineage(sql)
  const upstreamSteps = step ? findUpstreamSteps(step, allSteps, sqlInfo.sources) : []
  const nodes: LineageNode[] = []

  const rowCount = options.rowCount ?? step?.rows ?? 0
  const colCount = options.columnCount ?? step?.columns?.length ?? 0
  const datasetName = options.datasetName ?? step?.datasetName ?? 'Dataset'
  const viewMode = options.viewMode ?? step?.viewMode ?? 'chart'
  const chartConfig = options.chartConfig ?? step?.chartConfig
  const pivotConfig = options.pivotConfig ?? step?.pivotConfig

  // 1) Source / Underlying Rows node
  if (step?.file || step?.source) {
    const fileName = (step.source?.file ?? step.file ?? '').replace(/^.*[/\\]/, '')
    const details: string[] = []
    if (step.source)
      details.push(`${formatBytes(step.source.bytes)} · modified ${new Date(step.source.modifiedAt).toLocaleString()}`)
    if (step.where?.length)
      details.push(`Pre-filtered: ${step.where.map(w => `${w.field} IN (${w.equals.join(', ')})`).join(' AND ')}`)
    nodes.push({
      stage: 'source',
      label: 'Source File',
      summary: fileName || 'Local file',
      details,
    })
  }
  else if (upstreamSteps.length > 0) {
    const primary = upstreamSteps[0]
    const totalUpstreamRows = upstreamSteps.reduce((sum, s) => sum + (s.rows ?? 0), 0)
    const details = upstreamSteps.map(s =>
      `${s.datasetName ?? s.datasetId} (${(s.rows ?? 0).toLocaleString('en-US')} underlying rows${s.fingerprint ? ` · #${s.fingerprint.hash.slice(0, 8)}` : ''})`,
    )
    nodes.push({
      stage: 'source',
      label: 'Underlying Rows',
      summary: upstreamSteps.length === 1
        ? `${primary.datasetName ?? primary.datasetId} (${(primary.rows ?? 0).toLocaleString('en-US')} rows)`
        : `${upstreamSteps.length} upstream tables (${totalUpstreamRows.toLocaleString('en-US')} rows)`,
      details,
      stepId: primary.id,
    })
  }
  else if (sqlInfo.sources.length > 0) {
    nodes.push({
      stage: 'source',
      label: 'Source Table',
      summary: sqlInfo.sources.join(', '),
      details: sqlInfo.joins.length > 0 ? [`Joined: ${sqlInfo.joins.join(', ')}`] : [],
    })
  }
  else {
    nodes.push({
      stage: 'source',
      label: 'Source',
      summary: step?.tool === 'load_data' ? 'Inline agent data' : datasetName,
      details: [],
    })
  }

  // 2) SQL Transformation & Aggregation node
  if (sql.trim()) {
    const details: string[] = []
    if (sqlInfo.whereClause)
      details.push(`Filter: WHERE ${sqlInfo.whereClause}`)
    if (sqlInfo.groupBy.length > 0)
      details.push(`Group by: ${sqlInfo.groupBy.join(', ')}`)
    if (sqlInfo.aggregations.length > 0)
      details.push(`Aggregations: ${sqlInfo.aggregations.join(', ')}`)
    if (step?.editedAt)
      details.push(`User-edited SQL (v${(step.revisions?.length ?? 0) + 1})`)

    const summaryParts: string[] = []
    if (sqlInfo.groupBy.length > 0)
      summaryParts.push(`GROUP BY ${sqlInfo.groupBy.join(', ')}`)
    if (sqlInfo.aggregations.length > 0)
      summaryParts.push(sqlInfo.aggregations.slice(0, 2).join(', ') + (sqlInfo.aggregations.length > 2 ? ` +${sqlInfo.aggregations.length - 2}` : ''))
    if (summaryParts.length === 0)
      summaryParts.push(sqlInfo.whereClause ? 'Filtered SELECT' : 'DuckDB SELECT')

    nodes.push({
      stage: 'sql',
      label: 'SQL Transform',
      summary: summaryParts.join(' · '),
      details,
    })
  }

  // 3) Output Data Frame node
  const upstreamRows = upstreamSteps.length === 1 ? upstreamSteps[0].rows : undefined
  const rowRatio = typeof upstreamRows === 'number' && upstreamRows > 0 && upstreamRows !== rowCount
    ? `${upstreamRows.toLocaleString('en-US')} → ${rowCount.toLocaleString('en-US')} rows`
    : `${rowCount.toLocaleString('en-US')} row${rowCount === 1 ? '' : 's'}${colCount ? ` × ${colCount} cols` : ''}`
  const dfDetails: string[] = []
  if (step?.fingerprint)
    dfDetails.push(`Fingerprint: #${step.fingerprint.hash.slice(0, 12)} (${step.fingerprint.rows.toLocaleString('en-US')} rows)`)
  if (options.filterFields?.length)
    dfDetails.push(`Dashboard filters: ${options.filterFields.join(', ')}`)
  nodes.push({
    stage: 'dataframe',
    label: 'Data Frame',
    summary: rowRatio,
    details: dfDetails,
  })

  // 4) Client-side Chart / Pivot Aggregation node
  if (viewMode === 'pivot' && pivotConfig) {
    const aggText = pivotConfig.valueFields?.map(v => `${v.aggregation}(${v.field})`).join(', ') || 'values'
    const dims = [...(pivotConfig.rowFields ?? []), ...(pivotConfig.columnFields ?? [])]
    nodes.push({
      stage: 'visual',
      label: 'Pivot (JS/TS)',
      summary: `${aggText}${dims.length ? ` by ${dims.join(' × ')}` : ''}`,
      details: [
        ...(pivotConfig.rowFields?.length ? [`Rows: ${pivotConfig.rowFields.join(' → ')}`] : []),
        ...(pivotConfig.columnFields?.length ? [`Columns: ${pivotConfig.columnFields.join(' → ')}`] : []),
      ],
    })
  }
  else if (viewMode === 'chart' && chartConfig) {
    const yAgg = chartConfig.yAxis?.field ? `${chartConfig.yAxis.aggregation ?? 'sum'}(${chartConfig.yAxis.field})` : ''
    const xDim = chartConfig.xAxis?.field ?? ''
    const sortKey = chartConfig.options?.sortOrder ?? 'value-desc'
    const details = [
      ...(chartConfig.seriesField?.field ? [`Series split: ${chartConfig.seriesField.field}`] : []),
      `Sort: ${SORT_LABELS[sortKey] ?? sortKey}`,
    ]
    nodes.push({
      stage: 'visual',
      label: 'Chart (JS/TS)',
      summary: `${chartConfig.type ?? 'bar'}: ${yAgg || 'values'}${xDim ? ` by ${xDim}` : ''}`,
      details,
    })
  }
  else {
    nodes.push({
      stage: 'visual',
      label: 'View',
      summary: 'Raw data grid (no client aggregation)',
      details: [],
    })
  }

  // 5) Proof of Work badge node
  if (step?.fingerprint) {
    nodes.push({
      stage: 'proof',
      label: 'Proof Hash',
      summary: `#${step.fingerprint.hash.slice(0, 8)}`,
      details: [`Deterministic SHA-256 over all ${step.fingerprint.rows.toLocaleString('en-US')} rows (order-independent)`],
    })
  }

  const oneLine = nodes
    .filter(n => n.stage !== 'proof')
    .map(n => n.summary)
    .join(' → ') + (step?.fingerprint ? ` · #${step.fingerprint.hash.slice(0, 8)}` : '')

  return { nodes, oneLine, upstreamSteps, sqlInfo }
}
