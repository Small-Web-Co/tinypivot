import type { ChartConfig, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { ClaimSource } from './claims.js'
import type { HistoryEntry, RecordInput } from './history.js'
import type { DatasetStore, RowFilter, StoredDataset } from './store.js'
import type { AgentHint, Fingerprint, NoteAttachment, SourceFile, StepActor, StepCheck, StudioFile, StudioNote, StudioSnapshot, TraceStep } from './studio-protocol.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AgentBridge } from './agent-bridge.js'
import { checkClaims } from './claims.js'
import { DuckDbRunner, quoteIdentifier, quoteLiteral } from './duckdb.js'
import { HistoryStore, SESSIONS_DIR, UPLOADS_DIR } from './history.js'
import { groupRuns } from './runs.js'
import { DEFAULT_SESSION_KEY } from './store.js'

/**
 * The Studio is the local workspace behind TinyPivot: a trace of every data step the agent and
 * the user take, with the reason and the exact SQL, filter or chart behind it, plus an inbox of
 * notes the user writes back to the agent. The MCP tools and the browser Studio share one.
 */

export interface StudioQueryInput {
  sql: string
  name?: string
  actor: StepActor
  why?: string
  ask?: string
  sessionKey?: string
  keepExisting?: boolean
  viewMode?: DataGridViewMode
  pivotConfig?: Partial<PivotConfig>
  chartConfig?: Partial<ChartConfig>
  /** A step whose chart or pivot the result keeps, when the result still has the fields it uses. */
  viewFromStepId?: string
}

/** Steps kept in memory and shown in the Studio; the file keeps more. */
const STEPS_IN_MEMORY = 300
const HISTORY_IN_SNAPSHOT = 50
const ATTACHMENT_MAX_CHARS = 6000
/** The user's request as the agent passed it, kept to a readable length. */
const ASK_MAX_CHARS = 500

/** Friendly names for MCP client names. */
const AGENT_NAMES: Record<string, string> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude Desktop',
  'pi': 'pi',
  'opencode': 'OpenCode',
  'cursor-vscode': 'Cursor',
  'codex-mcp-client': 'Codex',
  'antigravity': 'Antigravity',
  'Visual Studio Code': 'VS Code',
}

export function agentLabel(clientName?: string): string {
  return (clientName && (AGENT_NAMES[clientName] ?? clientName)) || 'your agent'
}
/** When the trace file passes this size it is cut back to the newest STEPS_IN_MEMORY steps. */
const TRACE_FILE_MAX_BYTES = 5 * 1024 * 1024

/** "line chart: sum(mrr) by month, split by year", "pivot: sum(mrr) · rows plan · columns channel", "table". */
export function describeView(dataset: StoredDataset): string {
  const pivot = dataset.pivotConfig
  if (dataset.viewMode === 'pivot' && pivot?.valueFields?.length) {
    const values = pivot.valueFields.map(v => `${v.aggregation}(${v.field})`).join(', ')
    const rows = pivot.rowFields?.length ? ` · rows ${pivot.rowFields.join(', ')}` : ''
    const columns = pivot.columnFields?.length ? ` · columns ${pivot.columnFields.join(', ')}` : ''
    return `pivot: ${values}${rows}${columns}`
  }
  const chart = dataset.chartConfig
  if (dataset.viewMode === 'chart' && chart?.xAxis && chart.yAxis) {
    const series = chart.seriesField ? `, split by ${chart.seriesField.field}` : ''
    return `${chart.type ?? 'bar'} chart: ${chart.yAxis.aggregation ?? 'sum'}(${chart.yAxis.field}) by ${chart.xAxis.field}${series}`
  }
  return 'table'
}

/** The fields a dataset's chart or pivot groups by. */
function viewDimensions(dataset: StoredDataset): string[] {
  const chart = dataset.chartConfig
  const pivot = dataset.pivotConfig
  return [chart?.xAxis?.field, chart?.seriesField?.field, ...(pivot?.rowFields ?? []), ...(pivot?.columnFields ?? [])]
    .filter((field): field is string => Boolean(field))
}

/** The fields a dataset's chart or pivot measures. */
function viewMeasures(dataset: StoredDataset): string[] {
  return [dataset.chartConfig?.yAxis?.field, ...(dataset.pivotConfig?.valueFields ?? []).map(value => value.field)]
    .filter((field): field is string => Boolean(field))
}

/** SQL for a load_file filter, comparing as text the way the in-memory filter does. */
export function whereSql(where: RowFilter[]): string {
  return where
    .map(filter => `CAST(${quoteIdentifier(filter.field)} AS VARCHAR) IN (${filter.equals.map(value => quoteLiteral(String(value))).join(', ')})`)
    .join(' AND ')
}

/** The SQL that reproduces a file load, so the user can start editing from it. */
export function fileStepSql(file: string, where?: RowFilter[]): string {
  return `SELECT *\nFROM ${quoteLiteral(file)}${where?.length ? `\nWHERE ${whereSql(where)}` : ''}`
}

/** Every field a dataset's chart or pivot reads. */
function viewFields(dataset: StoredDataset): string[] {
  const chart = dataset.chartConfig
  const pivot = dataset.pivotConfig
  return [
    chart?.xAxis?.field,
    chart?.yAxis?.field,
    chart?.seriesField?.field,
    ...(pivot?.rowFields ?? []),
    ...(pivot?.columnFields ?? []),
    ...(pivot?.valueFields ?? []).map(value => value.field),
  ].filter((field): field is string => Boolean(field))
}

/** How SQL reads an earlier pull back: the source file, or the rows saved in history. */
function historyTableExpression(entry: HistoryEntry, rowsPath: string | undefined): string | undefined {
  if (entry.kind === 'file') {
    const file = quoteLiteral(entry.source)
    return entry.where?.length ? `(SELECT * FROM ${file} WHERE ${whereSql(entry.where)})` : file
  }
  return rowsPath ? `read_json_auto(${quoteLiteral(rowsPath)})` : undefined
}

/**
 * An answer without the terminal cards the agent echoed into it: the Studio already shows those
 * views, and box drawing does not read outside a terminal.
 */
export function withoutCards(text: string): string {
  const stripped = text.replace(/```text\n[\s\S]*?```\n?/g, block => (/[╭╰│┤├]/.test(block) ? '' : block))
  return stripped.replace(/\n{3,}/g, '\n\n').trim() || text.trim()
}

/** Rows reduce to a count and a hash of every row, sorted, so the same result in any order matches. */
export function fingerprintRows(rows: Record<string, unknown>[]): Fingerprint {
  const rowHashes = rows.map(row => crypto.createHash('sha1').update(JSON.stringify(row, (_, value) => (typeof value === 'bigint' ? value.toString() : value))).digest('hex'))
  rowHashes.sort()
  return { rows: rows.length, hash: crypto.createHash('sha256').update(rowHashes.join('')).digest('hex').slice(0, 16) }
}

/** The file's size and modification time now, or undefined when it cannot be read. */
function sourceFile(file: string): SourceFile | undefined {
  try {
    const stat = fs.statSync(file)
    return { file, bytes: stat.size, modifiedAt: stat.mtime.toISOString() }
  }
  catch {
    return undefined
  }
}

function checkSource(then: SourceFile): StepCheck {
  const now = sourceFile(then.file)
  if (!now)
    return { kind: 'source', ok: false, detail: 'The file is gone or cannot be read.' }
  const ok = now.bytes === then.bytes && now.modifiedAt === then.modifiedAt
  return { kind: 'source', ok, detail: ok ? 'The file is unchanged since this step.' : `The file changed: ${now.bytes.toLocaleString('en-US')} bytes, saved ${now.modifiedAt}.` }
}

const DATA_EXTENSIONS = new Set(['.csv', '.tsv', '.txt', '.json', '.jsonl', '.ndjson', '.parquet', '.xlsx', '.xls'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

/** Whether a dropped file is data to load, an image to look at, or anything else. */
export function fileKind(name: string): StudioFile['kind'] {
  const extension = path.extname(name).toLowerCase()
  if (DATA_EXTENSIONS.has(extension))
    return 'data'
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'file'
}

/** How a dropped file reads to the agent, by kind. */
const FILE_LINES: Record<StudioFile['kind'], (filePath: string) => string> = {
  data: filePath => `Attached data file: ${filePath} (load it with load_file).`,
  image: filePath => `Attached image: ${filePath} (open it to see what the user means).`,
  file: filePath => `Attached file: ${filePath}.`,
}

let sequence = 0

/** `20261125-101403-4f2a`: sortable by start time, unique per process. */
function newSessionId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `${stamp}-${process.pid.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

export class Studio {
  readonly history: HistoryStore
  readonly duck: DuckDbRunner
  private steps: TraceStep[] = []
  /** Files dropped into the Studio this conversation, by id. */
  private readonly files = new Map<string, StudioFile>()
  private readonly pullsByDataset = new Map<string, HistoryEntry>()
  private readonly listeners = new Set<() => void>()
  private changeQueued = false
  /** Ways to reach the user's agent live; without one, notes wait for its next TinyPivot reply. */
  readonly agent = new AgentBridge(() => this.changed())
  private agentName?: string
  private agentBusy = false
  private agentHint?: AgentHint

  /**
   * Which conversation this Studio belongs to. Each server process is one conversation, so its
   * trace is its own: other sessions, harnesses and tools running on the machine never show up here.
   */
  readonly sessionId: string

  constructor(readonly store: DatasetStore, options: { history?: HistoryStore, duck?: DuckDbRunner, sessionId?: string } = {}) {
    this.history = options.history ?? new HistoryStore()
    this.duck = options.duck ?? new DuckDbRunner()
    this.sessionId = options.sessionId ?? newSessionId()
    this.steps = this.readTraceFile()
  }

  /** Calls `listener` (once per tick at most) whenever the trace or the notes change. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    if (this.changeQueued)
      return
    this.changeQueued = true
    queueMicrotask(() => {
      this.changeQueued = false
      for (const listener of this.listeners)
        listener()
    })
  }

  snapshot(sessionKey = DEFAULT_SESSION_KEY): StudioSnapshot {
    return {
      steps: this.steps.map(step => ({
        ...step,
        editableSql: step.sql ?? (step.file ? fileStepSql(step.file, step.where) : undefined),
      })),
      history: this.history.enabled ? this.history.list(HISTORY_IN_SNAPSHOT) : [],
      historyEnabled: this.history.enabled,
      loadedIds: this.store.listMetadata(sessionKey).map(meta => meta.id),
      agent: { name: this.agentName ? agentLabel(this.agentName) : undefined, live: this.agent.live(), busy: this.agentBusy, ...(this.agentHint ? { hint: this.agentHint } : {}) },
    }
  }

  /** What would let this agent receive Studio messages live, shown while it cannot. */
  setAgentHint(hint: AgentHint | undefined): void {
    this.agentHint = hint
    this.changed()
  }

  /** Whether the agent is in the middle of a turn, as its extension reports it. */
  setAgentBusy(busy: boolean): void {
    if (busy === this.agentBusy)
      return
    this.agentBusy = busy
    this.changed()
  }

  /** The MCP client's name, e.g. `claude-code`, shown in the Studio. */
  setAgentName(name: string | undefined): void {
    this.agentName = name
    this.changed()
  }

  private get traceFile(): string {
    return path.join(this.history.dir, SESSIONS_DIR, `${this.sessionId}.jsonl`)
  }

  private readTraceFile(): TraceStep[] {
    if (!this.history.enabled || !fs.existsSync(this.traceFile))
      return []
    return fs.readFileSync(this.traceFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-STEPS_IN_MEMORY)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as TraceStep]
        }
        catch {
          return []
        }
      })
  }

  private appendToTraceFile(step: TraceStep): void {
    if (!this.history.enabled)
      return
    try {
      fs.mkdirSync(path.dirname(this.traceFile), { recursive: true })
      fs.appendFileSync(this.traceFile, `${JSON.stringify(step)}\n`)
      if (fs.statSync(this.traceFile).size > TRACE_FILE_MAX_BYTES)
        fs.writeFileSync(this.traceFile, `${this.steps.map(s => JSON.stringify(s)).join('\n')}\n`)
    }
    catch (error) {
      console.error(`[tinypivot-mcp] Could not save the Studio trace: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Adds a step to the trace and returns it. */
  record(step: Omit<TraceStep, 'id' | 'at'>): TraceStep {
    const full: TraceStep = { id: nextId('step'), at: new Date().toISOString(), ...step }
    this.steps.push(full)
    if (this.steps.length > STEPS_IN_MEMORY)
      this.steps = this.steps.slice(-STEPS_IN_MEMORY)
    this.appendToTraceFile(full)
    this.changed()
    return full
  }

  /** Records a step about a dataset, filling in its name, size, columns, fingerprint, view and saved pull. */
  recordDatasetStep(dataset: StoredDataset, step: Pick<TraceStep, 'actor' | 'tool' | 'why' | 'ask' | 'sql' | 'file' | 'where'>): TraceStep {
    const source = step.file ? sourceFile(step.file) : undefined
    return this.record({
      ...step,
      ...(step.ask?.trim() ? { ask: step.ask.trim().slice(0, ASK_MAX_CHARS) } : { ask: undefined }),
      datasetId: dataset.id,
      datasetName: dataset.name,
      rows: dataset.rows.length,
      columns: dataset.columns.map(column => column.name),
      fingerprint: fingerprintRows(dataset.rows),
      ...(source ? { source } : {}),
      view: describeView(dataset),
      viewMode: dataset.viewMode,
      ...(dataset.chartConfig ? { chartConfig: structuredClone(dataset.chartConfig) } : {}),
      ...(dataset.pivotConfig ? { pivotConfig: structuredClone(dataset.pivotConfig) } : {}),
      historyId: this.pullsByDataset.get(dataset.id)?.id,
    })
  }

  /**
   * Shows a step's dataset as it was right after the step, reopening it from history when it is
   * no longer loaded; `viewMode` shows it another way, e.g. its rows. Looking is not a step, so
   * nothing is recorded.
   */
  async showStep(stepId: string, options: { viewMode?: DataGridViewMode, sessionKey?: string } = {}): Promise<StoredDataset> {
    const sessionKey = options.sessionKey ?? DEFAULT_SESSION_KEY
    const step = this.steps.find(s => s.id === stepId)
    if (!step?.datasetId)
      throw new Error('That step has no data to show.')
    let dataset = this.store.get(step.datasetId, sessionKey)
    if (!dataset) {
      if (!step.historyId)
        throw new Error('That data is no longer loaded and was not saved to history.')
      dataset = await this.reopen(step.historyId, { actor: 'user', sessionKey, record: false })
    }
    const viewMode = options.viewMode ?? step.viewMode
    return this.store.updateView(dataset.id, {
      ...(viewMode ? { viewMode } : {}),
      ...(step.chartConfig ? { chartConfig: { ...step.chartConfig, seriesField: step.chartConfig.seriesField } } : {}),
      ...(step.pivotConfig ? { pivotConfig: step.pivotConfig } : {}),
    }, sessionKey) ?? dataset
  }

  recentSteps(limit = STEPS_IN_MEMORY): TraceStep[] {
    return this.steps.slice(-limit)
  }

  /** Saves a pull to history and remembers which entry backs the dataset. */
  remember(dataset: StoredDataset, input: RecordInput): HistoryEntry | null {
    const entry = this.history.record(dataset, input)
    if (entry)
      this.pullsByDataset.set(dataset.id, entry)
    return entry
  }

  /** Loaded datasets as tables SQL can read, named by dataset id. */
  queryViews(sessionKey = DEFAULT_SESSION_KEY): Array<{ name: string, from: string }> {
    return this.store.listMetadata(sessionKey).flatMap((meta) => {
      const entry = this.pullsByDataset.get(meta.id)
      const from = entry && historyTableExpression(entry, this.history.rowsPath(entry))
      return from ? [{ name: meta.id, from }] : []
    })
  }

  /** Runs read-only SQL, loads the result as a dataset, saves it and records the step. */
  async runQuery(input: StudioQueryInput): Promise<{ dataset: StoredDataset, truncated: boolean }> {
    const sessionKey = input.sessionKey ?? DEFAULT_SESSION_KEY
    const result = await this.duck.run(input.sql, this.queryViews(sessionKey))
    const dataset = this.store.register({
      name: input.name ?? (input.actor === 'user' ? 'Your query' : 'SQL query'),
      source: input.sql,
      ingestionMode: 'direct',
      rows: result.rows,
      viewMode: input.viewMode,
      pivotConfig: input.pivotConfig,
      chartConfig: input.chartConfig,
      sessionKey,
      keepExisting: input.keepExisting ?? true,
    })
    const shown = this.keepViewOf(input.viewFromStepId, dataset, sessionKey) ?? dataset
    this.remember(shown, { kind: 'query', source: input.sql })
    this.recordDatasetStep(shown, { actor: input.actor, tool: 'query', why: input.why, ask: input.ask, sql: input.sql })
    return { dataset: shown, truncated: result.truncated }
  }

  /** Gives `dataset` the view of the step's dataset when every field that view uses is in the result. */
  private keepViewOf(stepId: string | undefined, dataset: StoredDataset, sessionKey: string): StoredDataset | undefined {
    const step = stepId ? this.steps.find(s => s.id === stepId) : undefined
    const source = step?.datasetId ? this.store.get(step.datasetId, sessionKey) : undefined
    if (!source)
      return undefined
    const columns = new Set(dataset.columns.map(column => column.name))
    const fields = viewFields(source)
    if (fields.length === 0 || !fields.every(field => columns.has(field)))
      return undefined
    return this.store.updateView(dataset.id, {
      viewMode: source.viewMode,
      // Set the series explicitly, so one picked for the new result does not survive the merge.
      ...(source.chartConfig ? { chartConfig: { ...source.chartConfig, seriesField: source.chartConfig.seriesField } } : {}),
      ...(source.pivotConfig ? { pivotConfig: source.pivotConfig } : {}),
    }, sessionKey)
  }

  /** Reopens a saved pull without re-querying, and records the step. */
  async reopen(id: string, options: { actor: StepActor, why?: string, sessionKey?: string, record?: boolean }): Promise<StoredDataset> {
    const entry = this.history.get(id)
    if (!entry)
      throw new Error(`No saved pull "${id}".`)
    const sessionKey = options.sessionKey ?? DEFAULT_SESSION_KEY
    const dataset = entry.kind === 'file'
      ? await this.store.loadFromFile(entry.source, entry.name, { sessionKey, keepExisting: true, where: entry.where })
      : this.store.register({ name: entry.name, source: entry.source, ingestionMode: 'direct', rows: this.history.readRows(entry), sessionKey, keepExisting: true })
    this.store.updateView(dataset.id, {
      ...(entry.chartConfig ? { chartConfig: entry.chartConfig } : {}),
      ...(entry.pivotConfig ? { pivotConfig: entry.pivotConfig } : {}),
    }, sessionKey)
    this.pullsByDataset.set(dataset.id, entry)
    if (options.record === false)
      return dataset
    this.recordDatasetStep(dataset, {
      actor: options.actor,
      tool: 'history',
      why: options.why,
      ...(entry.kind === 'file' ? { file: entry.source, where: entry.where } : { sql: entry.kind === 'data' ? undefined : entry.source }),
    })
    return dataset
  }

  /**
   * Saves a file the user dropped into the Studio, in this conversation's uploads folder, and
   * returns how a message can refer to it. Only files saved here can be attached to a message.
   */
  saveFile(name: string, bytes: Buffer): StudioFile {
    const dir = path.join(this.history.dir, UPLOADS_DIR, this.sessionId)
    fs.mkdirSync(dir, { recursive: true })
    const safeName = path.basename(name).replace(/[^\w.-]+/g, '-').slice(-120) || 'file'
    const file: StudioFile = {
      id: nextId('file'),
      name: path.basename(name).slice(0, 200) || 'file',
      kind: fileKind(name),
      bytes: bytes.length,
      path: path.join(dir, `${Date.now().toString(36)}-${safeName}`),
    }
    fs.writeFileSync(file.path, bytes)
    this.files.set(file.id, file)
    return file
  }

  /**
   * Sends the user's message straight into the agent's conversation. Throws when no live
   * connector takes it: the Studio only offers to send when the agent can receive.
   */
  addNote(text: string, options: { stepId?: string, attachment?: NoteAttachment, fileIds?: string[] } = {}): StudioNote {
    const attachment = options.attachment && { label: options.attachment.label.slice(0, 120), text: options.attachment.text.slice(0, ATTACHMENT_MAX_CHARS) }
    const files = (options.fileIds ?? []).flatMap(id => this.files.get(id) ?? [])
    const note: StudioNote = {
      id: nextId('note'),
      at: new Date().toISOString(),
      text: text.trim(),
      ...(options.stepId ? { stepId: options.stepId } : {}),
      ...(attachment ? { attachment } : {}),
      ...(files.length ? { files } : {}),
    }
    if (!this.agent.push(note, this.describeNote(note)))
      throw new Error(`${this.agentName ? agentLabel(this.agentName) : 'Your agent'} cannot receive messages from the Studio. Ask in your terminal instead.`)
    const attached = [attachment?.label, ...files.map(file => file.name)].filter(Boolean)
    this.record({ actor: 'user', tool: 'note', why: note.text, ...(attached.length ? { view: `with ${attached.join(', ')}` } : {}) })
    return note
  }

  /** How a message reads to the agent: where it came from, the text, the step it is about, and any attached data. */
  describeNote(note: StudioNote): string {
    const step = note.stepId ? this.steps.find(s => s.id === note.stepId) : undefined
    const lines = [`Message from the user in TinyPivot Studio: ${note.text}`]
    if (step)
      lines.push(`About the step "${step.why ?? step.view ?? step.tool}"${step.datasetId ? ` on dataset \`${step.datasetId}\`` : ''}${step.sql ? `, SQL: ${step.sql.replace(/\s+/g, ' ')}` : ''}`)
    if (note.attachment)
      lines.push(`Attached (${note.attachment.label}):`, note.attachment.text)
    for (const file of note.files ?? [])
      lines.push(FILE_LINES[file.kind](file.path))
    return lines.join('\n')
  }

  /**
   * The agent's answer to a Studio message, recorded where the user reads it, with each number it
   * quotes checked against the data loaded since the user last asked something.
   */
  reply(text: string, sessionKey = DEFAULT_SESSION_KEY): TraceStep {
    const answer = withoutCards(text)
    const claims = checkClaims(answer, this.datasetsSinceLastAsk(sessionKey))
    return this.record({ actor: 'agent', tool: 'reply', why: answer, ...(claims.length ? { claims } : {}) })
  }

  /**
   * The datasets the current question has used, newest first: the question as the Studio shows
   * it, so an agent that repeats the request on each step still has its earlier steps checked.
   */
  private datasetsSinceLastAsk(sessionKey: string): ClaimSource[] {
    const question = groupRuns(this.steps).at(-1)?.steps ?? []
    const ids = new Set(question.flatMap(step => (step.datasetId ? [step.datasetId] : [])))
    return [...ids].reverse().flatMap((id) => {
      const dataset = this.store.get(id, sessionKey)
      return dataset ? [{ name: dataset.name, rows: dataset.rows, dimensions: viewDimensions(dataset), measures: viewMeasures(dataset) }] : []
    })
  }

  /**
   * Re-checks a step: whether its source file is unchanged, and whether running its SQL again gives
   * the same rows. Results of queries are compared value by value (row order ignored); a file load
   * is compared by row count, since the file reader and SQL may type the same column differently.
   */
  async verifyStep(stepId: string, sessionKey = DEFAULT_SESSION_KEY): Promise<StepCheck[]> {
    const step = this.steps.find(s => s.id === stepId)
    if (!step)
      throw new Error('That step is no longer in the trace.')
    const checks: StepCheck[] = []
    if (step.source)
      checks.push(checkSource(step.source))
    const sql = step.sql ?? (step.file ? fileStepSql(step.file, step.where) : undefined)
    if (sql && step.fingerprint)
      checks.push(await this.checkRerun(sql, step, sessionKey))
    return checks
  }

  private async checkRerun(sql: string, step: TraceStep, sessionKey: string): Promise<StepCheck> {
    const expected = step.fingerprint!
    try {
      const result = await this.duck.run(sql, this.queryViews(sessionKey))
      const again = fingerprintRows(result.rows)
      if (step.tool !== 'query' && step.tool !== 'query_postgres')
        return { kind: 'rerun', ok: again.rows === expected.rows, detail: `The SQL gives ${again.rows.toLocaleString('en-US')} rows again; the load had ${expected.rows.toLocaleString('en-US')}.` }
      const ok = again.rows === expected.rows && again.hash === expected.hash
      return { kind: 'rerun', ok, detail: ok ? `Same ${again.rows.toLocaleString('en-US')} rows, same values.` : `Different result: ${again.rows.toLocaleString('en-US')} rows now, ${expected.rows.toLocaleString('en-US')} then${again.rows === expected.rows ? ', with changed values' : ''}.` }
    }
    catch (error) {
      return { kind: 'rerun', ok: false, detail: `Could not run it again: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}
