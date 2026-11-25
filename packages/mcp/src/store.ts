import type { ChartConfig, ChartThemePreset, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { ModelPricing } from './pricing.js'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CHART_THEME_IDS } from '@smallwebco/tinypivot-core'
import { DEFAULT_MODEL_PRICING, resolveModelPricing, tokensToUsd } from './pricing.js'

const VALID_VISUAL_THEMES = new Set<ChartThemePreset>(CHART_THEME_IDS)

function parseVisualTheme(raw?: string): ChartThemePreset {
  const lower = raw?.trim().toLowerCase() as ChartThemePreset | undefined
  return lower && VALID_VISUAL_THEMES.has(lower) ? lower : 'code'
}

function getPreferencesPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'tinypivot', 'preferences.json')
}

function loadSavedVisualTheme(): ChartThemePreset | undefined {
  try {
    const raw = fsSync.readFileSync(getPreferencesPath(), 'utf8')
    const parsed = JSON.parse(raw) as { visualTheme?: string }
    const lower = parsed.visualTheme?.trim().toLowerCase() as ChartThemePreset | undefined
    return lower && VALID_VISUAL_THEMES.has(lower) ? lower : undefined
  }
  catch {
    return undefined
  }
}

function saveVisualThemePreference(theme: ChartThemePreset): void {
  try {
    const prefPath = getPreferencesPath()
    fsSync.mkdirSync(path.dirname(prefPath), { recursive: true })
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(fsSync.readFileSync(prefPath, 'utf8')) as Record<string, unknown>
    }
    catch {}
    fsSync.writeFileSync(prefPath, `${JSON.stringify({ ...existing, visualTheme: theme }, null, 2)}\n`, 'utf8')
  }
  catch {
    // Best-effort persistence (ignore read-only environments)
  }
}

export interface SessionSavingsSnapshot {
  model: ModelPricing
  turns: number
  localActions: number
  tokensSaved: number
  usdSaved: number
}

export interface ColumnSummary {
  name: string
  type: 'number' | 'string' | 'boolean' | 'date' | 'null'
  sampleValues: string[]
  distinctCount: number
}

export const FREE_TIER_ROW_LIMIT = 2500

export interface StoredDataset {
  id: string
  name: string
  source: string
  ingestionMode: 'direct' | 'inline'
  rawBytes: number
  estimatedDatasetTokens: number
  sourceTotalRows: number
  truncatedForFreeTier: boolean
  rows: Record<string, unknown>[]
  columns: ColumnSummary[]
  loadedAt: string
  viewMode: DataGridViewMode
  pivotConfig?: Partial<PivotConfig>
  chartConfig?: Partial<ChartConfig>
}

export interface DatasetMetadata {
  id: string
  name: string
  source: string
  rowCount: number
  columns: ColumnSummary[]
  loadedAt: string
  viewMode: DataGridViewMode
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/

function coerceCellValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '')
    return null
  if (trimmed === 'true' || trimmed === 'TRUE')
    return true
  if (trimmed === 'false' || trimmed === 'FALSE')
    return false
  // Strip currency/commas only if clearly numeric like 1,234.56 or -42.5
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed)
    if (Number.isFinite(n))
      return n
  }
  return trimmed
}

/**
 * RFC-4180 compliant CSV/TSV parser supporting quoted fields and escaped quotes.
 */
export function parseDelimitedText(text: string, delimiter = ','): Record<string, unknown>[] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  // Strip UTF-8 BOM if present
  const input = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          currentField += '"'
          i++
        }
        else {
          inQuotes = false
        }
      }
      else {
        currentField += ch
      }
    }
    else if (ch === '"') {
      inQuotes = true
    }
    else if (ch === delimiter) {
      currentRow.push(currentField)
      currentField = ''
    }
    else if (ch === '\r') {
      if (input[i + 1] === '\n')
        i++
      currentRow.push(currentField)
      if (currentRow.some(cell => cell.trim() !== ''))
        rows.push(currentRow)
      currentRow = []
      currentField = ''
    }
    else if (ch === '\n') {
      currentRow.push(currentField)
      if (currentRow.some(cell => cell.trim() !== ''))
        rows.push(currentRow)
      currentRow = []
      currentField = ''
    }
    else {
      currentField += ch
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(cell => cell.trim() !== ''))
      rows.push(currentRow)
  }

  if (rows.length < 2)
    return []

  const headers = rows[0].map((h, idx) => h.trim() || `column_${idx + 1}`)
  const records: Record<string, unknown>[] = []

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r]
    const record: Record<string, unknown> = {}
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = c < values.length ? coerceCellValue(values[c]) : null
    }
    records.push(record)
  }

  return records
}

function flattenRow(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value: input ?? null }
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v ?? null
    }
    else if (v instanceof Date) {
      out[k] = v.toISOString().slice(0, 10)
    }
    else {
      out[k] = JSON.stringify(v)
    }
  }
  return out
}

export function inferColumns(rows: Record<string, unknown>[]): ColumnSummary[] {
  if (rows.length === 0)
    return []

  const keySet = new Set<string>()
  const sampleLimit = Math.min(rows.length, 500)
  for (let i = 0; i < sampleLimit; i++) {
    for (const k of Object.keys(rows[i])) {
      keySet.add(k)
    }
  }

  const summaries: ColumnSummary[] = []
  for (const name of keySet) {
    let numCount = 0
    let boolCount = 0
    let dateCount = 0
    let strCount = 0
    const distinct = new Set<string>()

    for (let i = 0; i < sampleLimit; i++) {
      const val = rows[i][name]
      if (val === null || val === undefined || val === '')
        continue
      distinct.add(String(val))
      if (typeof val === 'number') {
        numCount++
      }
      else if (typeof val === 'boolean') {
        boolCount++
      }
      else if (typeof val === 'string' && ISO_DATE_RE.test(val)) {
        dateCount++
      }
      else {
        strCount++
      }
    }

    const nonNull = numCount + boolCount + dateCount + strCount
    let type: ColumnSummary['type'] = 'null'
    if (nonNull > 0) {
      if (numCount / nonNull >= 0.85)
        type = 'number'
      else if (boolCount / nonNull >= 0.85)
        type = 'boolean'
      else if (dateCount / nonNull >= 0.85)
        type = 'date'
      else
        type = 'string'
    }

    summaries.push({
      name,
      type,
      sampleValues: Array.from(distinct).slice(0, 5),
      distinctCount: distinct.size,
    })
  }

  return summaries
}

const PREFERRED_MEASURE_RE = /revenue|paid|sales|amount|profit|total|mrr|arr|cost|price|value|spend|margin|units|count|qty/i
const PREFERRED_TIME_RE = /^month$|^quarter$|^year$|^week$|^date$|_date$|_month$|_at$/i
const ID_LIKE_RE = /^id$|_id$|^uuid$|^guid$|^hash$|^url$|^email$/i

/**
 * Derive smart default chart and pivot configurations from inferred columns
 * so every dataset immediately renders a meaningful visual answer AND has a
 * ready-to-explore pivot table one click away.
 */
export function suggestVisualConfigs(
  columns: ColumnSummary[],
  datasetName: string,
): {
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
} {
  if (columns.length === 0)
    return {}

  const numericCols = columns.filter(c => c.type === 'number' && !ID_LIKE_RE.test(c.name))
  const measureCol = numericCols.find(c => PREFERRED_MEASURE_RE.test(c.name)) ?? numericCols[0]

  const nonNumericCols = columns.filter(c => c.type !== 'number' && !ID_LIKE_RE.test(c.name))
  const timeCol = nonNumericCols.find(c => c.type === 'date' || PREFERRED_TIME_RE.test(c.name))
  const goodDimensions = nonNumericCols.filter(c => c.distinctCount >= 2 && c.distinctCount <= 25)
  const xCol = timeCol ?? goodDimensions[0] ?? nonNumericCols[0]

  const seriesCol = goodDimensions.find(
    c => c.name !== xCol?.name && c.distinctCount >= 2 && c.distinctCount <= 10,
  )

  if (!xCol || !measureCol)
    return {}

  const isStacked = Boolean(seriesCol)
  const chartConfig: Partial<ChartConfig> = {
    type: isStacked ? 'stackedBar' : 'bar',
    xAxis: { field: xCol.name, role: xCol.type === 'date' ? 'temporal' : 'dimension' },
    yAxis: { field: measureCol.name, role: 'measure', aggregation: 'sum' },
    seriesField: seriesCol ? { field: seriesCol.name, role: 'dimension' } : undefined,
    options: {
      title: `${datasetName}: ${measureCol.name} by ${xCol.name}${seriesCol ? ` & ${seriesCol.name}` : ''}`,
      showLegend: true,
      showDataLabels: false,
      showGrid: true,
      stacked: isStacked,
    },
  }

  const pivotConfig: Partial<PivotConfig> = {
    rowFields: [xCol.name],
    columnFields: seriesCol ? [seriesCol.name] : [],
    valueFields: [{ field: measureCol.name, aggregation: 'sum' }],
    showRowTotals: true,
    showColumnTotals: true,
  }

  return { chartConfig, pivotConfig }
}

/**
 * Derive a matching ChartConfig from a PivotConfig so switching between Chart
 * and Pivot views stays synchronized.
 */
export function chartConfigFromPivot(
  pivotConfig: Partial<PivotConfig>,
  datasetName: string,
): Partial<ChartConfig> | undefined {
  const xField = pivotConfig.rowFields?.[0]
  const yField = pivotConfig.valueFields?.[0]
  if (!xField || !yField)
    return undefined
  const series = pivotConfig.columnFields?.[0]
  const supportedAgg = ['sum', 'avg', 'count', 'min', 'max'].includes(yField.aggregation)
    ? (yField.aggregation as 'sum' | 'avg' | 'count' | 'min' | 'max')
    : 'sum'

  return {
    type: series ? 'stackedBar' : 'bar',
    xAxis: { field: xField, role: 'dimension' },
    yAxis: { field: yField.field, role: 'measure', aggregation: supportedAgg },
    seriesField: series ? { field: series, role: 'dimension' } : undefined,
    options: {
      title: `${datasetName}: ${yField.field} by ${xField}${series ? ` & ${series}` : ''}`,
      showLegend: true,
      showDataLabels: false,
      showGrid: true,
      stacked: Boolean(series),
    },
  }
}

/**
 * Deterministic built-in sample dataset so opening TinyPivot with `{}` immediately
 * shows realistic business data ready for pivoting, charts, and drill-through.
 */
export function generateSampleSalesData(count = 400): Record<string, unknown>[] {
  const regions = ['North', 'South', 'East', 'West']
  const categories = ['Enterprise', 'Growth', 'Starter', 'Services']
  const products = ['Cloud Core', 'Analytics Pro', 'Data Sync', 'AI Copilot', 'Support SLA']
  const reps = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank']
  const channels = ['Self-Serve', 'Outbound', 'Partner', 'Marketplace']
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

  let seed = 42
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const rows: Record<string, unknown>[] = []
  for (let i = 1; i <= count; i++) {
    const region = regions[Math.floor(nextRand() * regions.length)]
    const category = categories[Math.floor(nextRand() * categories.length)]
    const product = products[Math.floor(nextRand() * products.length)]
    const rep = reps[Math.floor(nextRand() * reps.length)]
    const channel = channels[Math.floor(nextRand() * channels.length)]
    const month = Math.floor(nextRand() * 12)
    const day = Math.floor(nextRand() * 28) + 1
    const quarter = quarters[Math.floor(month / 3)]
    const date = `2026-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    const regionBoost = region === 'West' ? 1.3 : region === 'East' ? 1.15 : 0.95
    const catBoost = category === 'Enterprise' ? 3.2 : category === 'Growth' ? 1.6 : 0.7
    const units = Math.floor(nextRand() * 25) + 1
    const unitPrice = Math.round((120 + nextRand() * 380) * catBoost)
    const revenue = Math.round(units * unitPrice * regionBoost)
    const marginPct = Math.round((48 + nextRand() * 34) * 10) / 10
    const profit = Math.round(revenue * (marginPct / 100))

    rows.push({
      id: i,
      date,
      quarter,
      region,
      category,
      product,
      channel,
      rep,
      units,
      revenue,
      profit,
      margin_pct: marginPct,
    })
  }

  return rows
}

export class DatasetStore {
  private datasets = new Map<string, StoredDataset>()
  private activeId: string | null = null
  private activeModel: ModelPricing = resolveModelPricing(process.env.TINYPIVOT_LLM_MODEL)
  private visualTheme: ChartThemePreset = process.env.TINYPIVOT_THEME
    ? parseVisualTheme(process.env.TINYPIVOT_THEME)
    : (loadSavedVisualTheme() ?? 'code')

  private sessionTurns = 0
  private sessionLocalActions = 0
  private sessionTokensSaved = 0
  private maxRowsPerDataset: number

  constructor(options: { maxRowsPerDataset?: number } = {}) {
    this.maxRowsPerDataset = options.maxRowsPerDataset ?? Number.POSITIVE_INFINITY
    this.register({
      id: 'sample_sales',
      name: 'Sample SaaS Sales (2026)',
      source: 'built-in sample',
      rows: generateSampleSalesData(400),
      viewMode: 'chart',
      pivotConfig: {
        rowFields: ['region', 'category'],
        columnFields: ['quarter'],
        valueFields: [{ field: 'revenue', aggregation: 'sum' }],
        showRowTotals: true,
        showColumnTotals: true,
      },
      chartConfig: {
        type: 'stackedBar',
        xAxis: { field: 'quarter', role: 'dimension' },
        yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
        seriesField: { field: 'region', role: 'dimension' },
        options: {
          title: '2026 SaaS Revenue by Quarter & Region',
          showLegend: true,
          showDataLabels: false,
          showGrid: true,
          stacked: true,
        },
      },
    })
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'dataset'
    if (!this.datasets.has(base))
      return base
    let n = 2
    while (this.datasets.has(`${base}_${n}`)) n++
    return `${base}_${n}`
  }

  register(input: {
    id?: string
    name: string
    source: string
    ingestionMode?: 'direct' | 'inline'
    rows: Record<string, unknown>[]
    viewMode?: DataGridViewMode
    pivotConfig?: Partial<PivotConfig>
    chartConfig?: Partial<ChartConfig>
  }): StoredDataset {
    const id = input.id ?? this.slugify(input.name)
    const allNormalized = input.rows.map(flattenRow)
    const sourceTotalRows = allNormalized.length
    const truncatedForFreeTier = Number.isFinite(this.maxRowsPerDataset) && sourceTotalRows > this.maxRowsPerDataset
    const normalizedRows = truncatedForFreeTier
      ? allNormalized.slice(0, this.maxRowsPerDataset)
      : allNormalized
    const columns = inferColumns(normalizedRows)
    const suggested = suggestVisualConfigs(columns, input.name)
    const rawBytes = Buffer.byteLength(JSON.stringify(normalizedRows), 'utf8')
    const estimatedDatasetTokens = Math.max(0, Math.round(rawBytes / 4))

    const resolvedPivot = input.pivotConfig ?? suggested.pivotConfig
    const resolvedChart = input.chartConfig
      ?? (input.pivotConfig ? chartConfigFromPivot(input.pivotConfig, input.name) : undefined)
      ?? suggested.chartConfig
    const resolvedView: DataGridViewMode = input.viewMode ?? (resolvedChart ? 'chart' : 'grid')

    const dataset: StoredDataset = {
      id,
      name: input.name,
      source: input.source,
      ingestionMode: input.ingestionMode ?? 'direct',
      rawBytes,
      estimatedDatasetTokens,
      sourceTotalRows,
      truncatedForFreeTier,
      rows: normalizedRows,
      columns,
      loadedAt: new Date().toISOString(),
      viewMode: resolvedView,
      pivotConfig: resolvedPivot,
      chartConfig: resolvedChart,
    }
    this.datasets.set(id, dataset)
    this.activeId = id
    return dataset
  }

  async loadFromFile(filePath: string, name?: string): Promise<StoredDataset> {
    const resolved = path.resolve(filePath)
    const ext = path.extname(resolved).toLowerCase()
    const raw = await fs.readFile(resolved, 'utf8')
    const displayName = name || path.basename(resolved)

    let rows: Record<string, unknown>[]
    if (ext === '.json') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        rows = parsed.map(flattenRow)
      }
      else if (parsed && typeof parsed === 'object') {
        // Support wrapped payloads like { data: [...] } or { rows: [...] }
        const firstArray = Object.values(parsed).find(v => Array.isArray(v)) as unknown[] | undefined
        rows = firstArray ? firstArray.map(flattenRow) : [flattenRow(parsed)]
      }
      else {
        rows = []
      }
    }
    else if (ext === '.jsonl' || ext === '.ndjson') {
      rows = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => flattenRow(JSON.parse(line)))
    }
    else if (ext === '.tsv') {
      rows = parseDelimitedText(raw, '\t')
    }
    else {
      // Default CSV
      rows = parseDelimitedText(raw, ',')
    }

    return this.register({
      name: displayName,
      source: resolved,
      rows,
    })
  }

  get(id?: string): StoredDataset | undefined {
    if (id)
      return this.datasets.get(id)
    if (this.activeId)
      return this.datasets.get(this.activeId)
    return undefined
  }

  setActive(id: string): StoredDataset | undefined {
    const ds = this.datasets.get(id)
    if (ds)
      this.activeId = id
    return ds
  }

  updateView(
    id: string | undefined,
    patch: {
      viewMode?: DataGridViewMode
      pivotConfig?: Partial<PivotConfig>
      chartConfig?: Partial<ChartConfig>
    },
  ): StoredDataset | undefined {
    const ds = this.get(id)
    if (!ds)
      return undefined
    if (patch.viewMode !== undefined)
      ds.viewMode = patch.viewMode
    if (patch.pivotConfig !== undefined)
      ds.pivotConfig = { ...ds.pivotConfig, ...patch.pivotConfig }
    if (patch.chartConfig !== undefined)
      ds.chartConfig = { ...ds.chartConfig, ...patch.chartConfig }
    this.activeId = ds.id
    return ds
  }

  listMetadata(): DatasetMetadata[] {
    return Array.from(this.datasets.values()).map(d => ({
      id: d.id,
      name: d.name,
      source: d.source,
      rowCount: d.rows.length,
      columns: d.columns,
      loadedAt: d.loadedAt,
      viewMode: d.viewMode,
    }))
  }

  getActiveId(): string | null {
    return this.activeId
  }

  getActiveModel(): ModelPricing {
    return this.activeModel
  }

  getVisualTheme(): ChartThemePreset {
    return this.visualTheme
  }

  setVisualTheme(theme: string): ChartThemePreset {
    this.visualTheme = parseVisualTheme(theme)
    saveVisualThemePreference(this.visualTheme)
    return this.visualTheme
  }

  setActiveModel(modelInput?: string, customRatePerMillion?: number): ModelPricing {
    if (modelInput || customRatePerMillion !== undefined) {
      this.activeModel = resolveModelPricing(modelInput ?? this.activeModel.name, customRatePerMillion)
    }
    return this.activeModel
  }

  recordTurnSavings(tokensSaved: number, modelInput?: string): SessionSavingsSnapshot {
    if (modelInput) {
      this.activeModel = resolveModelPricing(modelInput)
    }
    this.sessionTurns++
    this.sessionTokensSaved += Math.max(0, Math.round(tokensSaved))
    return this.getSessionSavings()
  }

  recordLocalAction(datasetId?: string): { addedTokens: number, session: SessionSavingsSnapshot } {
    const ds = this.get(datasetId)
    // Conservative, cache-aware estimate: 10% cached context re-read + ~500 avoided output tokens (~5x input rate)
    const addedTokens = ds ? Math.round(ds.estimatedDatasetTokens * 0.1) + 2500 : 0
    this.sessionLocalActions++
    this.sessionTokensSaved += addedTokens
    return {
      addedTokens,
      session: this.getSessionSavings(),
    }
  }

  getSessionSavings(): SessionSavingsSnapshot {
    const model = this.activeModel ?? DEFAULT_MODEL_PRICING
    return {
      model,
      turns: this.sessionTurns,
      localActions: this.sessionLocalActions,
      tokensSaved: this.sessionTokensSaved,
      usdSaved: tokensToUsd(this.sessionTokensSaved, model.ratePerMillion),
    }
  }
}
