import type { ChartConfig, ChartThemePreset, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { ModelPricing } from './pricing.js'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CHART_THEME_IDS, readXlsxBuffer } from '@smallwebco/tinypivot-core'
import { DEFAULT_MODEL_PRICING, resolveModelPricing, tokensToUsd } from './pricing.js'

const VALID_VISUAL_THEMES = new Set<ChartThemePreset>(CHART_THEME_IDS)

function parseVisualTheme(raw?: string): ChartThemePreset {
  const lower = raw?.trim().toLowerCase() as ChartThemePreset | undefined
  return lower && VALID_VISUAL_THEMES.has(lower) ? lower : 'code'
}

export function getPreferencesPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'tinypivot', 'preferences.json')
}

export function loadSavedVisualTheme(): ChartThemePreset | undefined {
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

/** Saves the theme for every TinyPivot process on the machine. Returns false when the file cannot be written. */
export function saveVisualThemePreference(theme: ChartThemePreset): boolean {
  try {
    const prefPath = getPreferencesPath()
    fsSync.mkdirSync(path.dirname(prefPath), { recursive: true })
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(fsSync.readFileSync(prefPath, 'utf8')) as Record<string, unknown>
    }
    catch {}
    fsSync.writeFileSync(prefPath, `${JSON.stringify({ ...existing, visualTheme: theme }, null, 2)}\n`, 'utf8')
    return true
  }
  catch {
    return false
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
export const SAMPLE_DATASET_ID = 'sample_sales'
export const DEFAULT_SESSION_KEY = 'default'
const MAX_STORED_DATASETS = 24

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
  /** Columns offered as dashboard filters above every view, when the user asked for them. */
  filterFields?: string[]
}

/** How a dataset is shown: its view and dashboard filters, as every Studio and widget payload sends them. */
export function datasetView(ds: StoredDataset) {
  return {
    viewMode: ds.viewMode,
    pivotConfig: ds.pivotConfig ?? null,
    chartConfig: ds.chartConfig ?? null,
    filterFields: ds.filterFields ?? [],
  }
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

/** Keeps rows whose `field` equals any of the listed values. */
export interface RowFilter {
  field: string
  equals: Array<string | number | boolean>
}

/**
 * Rows that satisfy every filter. Values are compared as text, so 2026 matches "2026":
 * CSV cells and the numbers a model passes do not always agree on type.
 */
export function filterRows(rows: Record<string, unknown>[], filters: RowFilter[]): Record<string, unknown>[] {
  const wanted = filters.map(filter => ({ field: filter.field, values: new Set(filter.equals.map(String)) }))
  return rows.filter(row => wanted.every(({ field, values }) => values.has(String(row[field]))))
}

/** `[{ field: 'year', equals: [2026] }]` → `year = 2026` */
export function describeFilters(filters: RowFilter[]): string {
  return filters.map(filter => `${filter.field} = ${filter.equals.join(' or ')}`).join(', ')
}

/** Distinct values are counted across every row, up to this many per column. */
export const DISTINCT_COUNT_CAP = 1000

/**
 * Counts over the whole dataset, not a sample: files are often sorted, so the first rows of a
 * date-ordered export hold a single year and month and would describe the column wrongly.
 */
function collectDistinct(rows: Record<string, unknown>[], name: string): Set<string> {
  const distinct = new Set<string>()
  for (const row of rows) {
    const val = row[name]
    if (val === null || val === undefined || val === '')
      continue
    distinct.add(String(val))
    if (distinct.size >= DISTINCT_COUNT_CAP)
      break
  }
  return distinct
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

    for (let i = 0; i < sampleLimit; i++) {
      const val = rows[i][name]
      if (val === null || val === undefined || val === '')
        continue
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

    const distinct = collectDistinct(rows, name)
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

export async function readXlsxFile(
  filePath: string,
  requestedSheet?: string,
): Promise<{ rows: Record<string, unknown>[], sheetName: string, sheetNames: string[] }> {
  const buf = await fs.readFile(filePath)
  const parsed = await readXlsxBuffer(buf, requestedSheet)
  return {
    rows: parsed.rows.map(flattenRow),
    sheetName: parsed.sheetName,
    sheetNames: parsed.sheetNames,
  }
}

export class DatasetStore {
  private datasets = new Map<string, StoredDataset>()
  private sessionDatasetIds = new Map<string, string[]>()
  private sessionActiveId = new Map<string, string>()
  private activeId: string | null = null
  private activeModel: ModelPricing = resolveModelPricing(process.env.TINYPIVOT_LLM_MODEL)
  /** TINYPIVOT_THEME pins this process's theme until the user picks one; otherwise the saved preference rules. */
  private pinnedTheme: ChartThemePreset | undefined = process.env.TINYPIVOT_THEME ? parseVisualTheme(process.env.TINYPIVOT_THEME) : undefined

  private sessionTurns = 0
  private sessionLocalActions = 0
  private sessionTokensSaved = 0
  private maxRowsPerDataset: number

  constructor(options: { maxRowsPerDataset?: number } = {}) {
    this.maxRowsPerDataset = options.maxRowsPerDataset ?? Number.POSITIVE_INFINITY
    this.register({
      id: SAMPLE_DATASET_ID,
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

  private normalizeSessionKey(sessionKey?: string): string {
    const trimmed = sessionKey?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_SESSION_KEY
  }

  private touchLru(id: string, dataset: StoredDataset): void {
    this.datasets.delete(id)
    this.datasets.set(id, dataset)
  }

  private enforceLruCap(): void {
    while (this.datasets.size > MAX_STORED_DATASETS) {
      let evictId: string | undefined
      for (const candidateId of this.datasets.keys()) {
        if (candidateId !== SAMPLE_DATASET_ID) {
          evictId = candidateId
          break
        }
      }
      if (!evictId)
        break
      this.remove(evictId)
    }
  }

  /** Drops a dataset from every session; each session that showed it falls back to its newest other one. */
  remove(id: string): boolean {
    if (!this.datasets.delete(id))
      return false
    for (const [key, ids] of this.sessionDatasetIds.entries()) {
      const filtered = ids.filter(x => x !== id)
      if (filtered.length !== ids.length)
        this.sessionDatasetIds.set(key, filtered)
    }
    for (const [key, active] of this.sessionActiveId.entries()) {
      if (active === id) {
        const remaining = this.sessionDatasetIds.get(key) ?? []
        const next = remaining[remaining.length - 1]
        if (next)
          this.sessionActiveId.set(key, next)
        else
          this.sessionActiveId.delete(key)
      }
    }
    if (this.activeId === id)
      this.activeId = [...this.datasets.keys()].at(-1) ?? null
    return true
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
    sessionKey?: string
    keepExisting?: boolean
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
    this.touchLru(id, dataset)
    this.enforceLruCap()

    if (id !== SAMPLE_DATASET_ID) {
      const key = this.normalizeSessionKey(input.sessionKey)
      const keep = input.keepExisting !== false
      const existing = keep
        ? (this.sessionDatasetIds.get(key) ?? []).filter(x => x !== SAMPLE_DATASET_ID && x !== id && this.datasets.has(x))
        : []
      this.sessionDatasetIds.set(key, [...existing, id])
      this.sessionActiveId.set(key, id)
    }

    this.activeId = id
    return dataset
  }

  /** Reads a data file from disk (CSV, TSV, JSON, JSONL, XLSX). With `where`, only matching rows become the dataset. */
  async loadFromFile(
    filePath: string,
    name?: string,
    options?: { sessionKey?: string, keepExisting?: boolean, where?: RowFilter[], sheet?: string },
  ): Promise<StoredDataset & { sheetNames?: string[], loadedSheet?: string }> {
    const where = options?.where ?? []
    const resolved = path.resolve(filePath)
    const ext = path.extname(resolved).toLowerCase()
    const baseName = name || path.basename(resolved)
    const displayName = where.length > 0 && !name ? `${baseName} (${describeFilters(where)})` : baseName

    let rows: Record<string, unknown>[]
    let sheetNames: string[] | undefined
    let loadedSheet: string | undefined
    if (ext === '.xlsx') {
      const xlsx = await readXlsxFile(resolved, options?.sheet)
      rows = xlsx.rows
      sheetNames = xlsx.sheetNames
      loadedSheet = xlsx.sheetName
    }
    else {
      const raw = await fs.readFile(resolved, 'utf8')
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
    }

    const ds = this.register({
      name: loadedSheet && !name && sheetNames && sheetNames.length > 1 ? `${displayName} [${loadedSheet}]` : displayName,
      source: resolved,
      rows: filterRows(rows, where),
      sessionKey: options?.sessionKey,
      keepExisting: options?.keepExisting,
    })
    return sheetNames ? Object.assign(ds, { sheetNames, loadedSheet }) : ds
  }

  get(id?: string, sessionKey?: string): StoredDataset | undefined {
    if (id) {
      const found = this.datasets.get(id)
      if (found)
        this.touchLru(id, found)
      return found
    }
    const active = this.getActiveId(sessionKey)
    if (active)
      return this.datasets.get(active)
    return undefined
  }

  setActive(id: string, sessionKey?: string): StoredDataset | undefined {
    const ds = this.datasets.get(id)
    if (ds) {
      this.touchLru(id, ds)
      this.activeId = id
      if (id !== SAMPLE_DATASET_ID) {
        const key = this.normalizeSessionKey(sessionKey)
        this.sessionActiveId.set(key, id)
      }
    }
    return ds
  }

  updateView(
    id: string | undefined,
    patch: {
      viewMode?: DataGridViewMode
      pivotConfig?: Partial<PivotConfig>
      chartConfig?: Partial<ChartConfig>
      filterFields?: string[]
    },
    sessionKey?: string,
  ): StoredDataset | undefined {
    const ds = this.get(id, sessionKey)
    if (!ds)
      return undefined
    if (patch.viewMode !== undefined)
      ds.viewMode = patch.viewMode
    if (patch.pivotConfig !== undefined)
      ds.pivotConfig = { ...ds.pivotConfig, ...patch.pivotConfig }
    if (patch.chartConfig !== undefined)
      ds.chartConfig = { ...ds.chartConfig, ...patch.chartConfig }
    if (patch.filterFields !== undefined)
      ds.filterFields = patch.filterFields
    this.activeId = ds.id
    if (ds.id !== SAMPLE_DATASET_ID) {
      const key = this.normalizeSessionKey(sessionKey)
      this.sessionActiveId.set(key, ds.id)
    }
    return ds
  }

  clearSession(sessionKey?: string): number {
    const key = this.normalizeSessionKey(sessionKey)
    const prevIds = (this.sessionDatasetIds.get(key) ?? []).filter(id => id !== SAMPLE_DATASET_ID && this.datasets.has(id))
    this.sessionDatasetIds.delete(key)
    this.sessionActiveId.delete(key)
    if (key === DEFAULT_SESSION_KEY || (this.activeId && prevIds.includes(this.activeId))) {
      this.activeId = this.datasets.has(SAMPLE_DATASET_ID) ? SAMPLE_DATASET_ID : null
    }
    return prevIds.length
  }

  listMetadata(sessionKey?: string): DatasetMetadata[] {
    const key = this.normalizeSessionKey(sessionKey)
    const realIds = (this.sessionDatasetIds.get(key) ?? [])
      .filter(id => id !== SAMPLE_DATASET_ID && this.datasets.has(id))

    const toMeta = (d: StoredDataset): DatasetMetadata => ({
      id: d.id,
      name: d.name,
      source: d.source,
      rowCount: d.rows.length,
      columns: d.columns,
      loadedAt: d.loadedAt,
      viewMode: d.viewMode,
    })

    if (realIds.length > 0) {
      return realIds
        .map(id => this.datasets.get(id))
        .filter((d): d is StoredDataset => Boolean(d))
        .map(toMeta)
    }

    const sample = this.datasets.get(SAMPLE_DATASET_ID)
    return sample ? [toMeta(sample)] : []
  }

  getActiveId(sessionKey?: string): string | null {
    const key = this.normalizeSessionKey(sessionKey)
    const sessionActive = this.sessionActiveId.get(key)
    if (sessionActive && this.datasets.has(sessionActive))
      return sessionActive
    const sessionIds = (this.sessionDatasetIds.get(key) ?? []).filter(id => this.datasets.has(id))
    if (sessionIds.length > 0)
      return sessionIds[sessionIds.length - 1]
    if (this.datasets.has(SAMPLE_DATASET_ID))
      return SAMPLE_DATASET_ID
    return this.activeId && this.datasets.has(this.activeId) ? this.activeId : null
  }

  getActiveModel(): ModelPricing {
    return this.activeModel
  }

  /**
   * The theme as saved in the shared preferences file, read each time: a theme picked in any Studio,
   * in pi or by any agent reaches every TinyPivot process on the machine without a restart.
   */
  getVisualTheme(): ChartThemePreset {
    return this.pinnedTheme ?? loadSavedVisualTheme() ?? 'code'
  }

  setVisualTheme(theme: string): ChartThemePreset {
    const chosen = parseVisualTheme(theme)
    // Where the preference cannot be saved (a read-only home), the choice still holds in this process.
    this.pinnedTheme = saveVisualThemePreference(chosen) ? undefined : chosen
    return chosen
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
