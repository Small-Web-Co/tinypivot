import type { ChartConfig, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { HistoryEntry, RecordInput } from './history.js'
import type { DatasetStore, RowFilter, StoredDataset } from './store.js'
import type { NoteAttachment, StepActor, StudioNote, StudioSnapshot, TraceStep } from './studio-protocol.js'
import fs from 'node:fs'
import path from 'node:path'
import { AgentBridge } from './agent-bridge.js'
import { DuckDbRunner, quoteIdentifier, quoteLiteral } from './duckdb.js'
import { HistoryStore, SESSIONS_DIR } from './history.js'
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
  private notes: StudioNote[] = []
  private readonly pullsByDataset = new Map<string, HistoryEntry>()
  private readonly listeners = new Set<() => void>()
  private changeQueued = false
  /** Ways to reach the user's agent live; without one, notes wait for its next TinyPivot reply. */
  readonly agent = new AgentBridge(() => this.changed())
  private agentName?: string
  private agentBusy = false
  private agentHint?: string

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
      notes: this.pendingNotes(),
      history: this.history.enabled ? this.history.list(HISTORY_IN_SNAPSHOT) : [],
      historyEnabled: this.history.enabled,
      loadedIds: this.store.listMetadata(sessionKey).map(meta => meta.id),
      agent: { name: this.agentName ? agentLabel(this.agentName) : undefined, live: this.agent.live(), busy: this.agentBusy, ...(this.agentHint ? { hint: this.agentHint } : {}) },
    }
  }

  /** What would let this agent receive Studio messages live, shown while it cannot. */
  setAgentHint(hint: string | undefined): void {
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

  /** Records a step about a dataset, filling in its name, size, view and saved pull. */
  recordDatasetStep(dataset: StoredDataset, step: Pick<TraceStep, 'actor' | 'tool' | 'why' | 'sql' | 'file' | 'where'>): TraceStep {
    return this.record({
      ...step,
      datasetId: dataset.id,
      datasetName: dataset.name,
      rows: dataset.rows.length,
      view: describeView(dataset),
      viewMode: dataset.viewMode,
      ...(dataset.chartConfig ? { chartConfig: structuredClone(dataset.chartConfig) } : {}),
      ...(dataset.pivotConfig ? { pivotConfig: structuredClone(dataset.pivotConfig) } : {}),
      historyId: this.pullsByDataset.get(dataset.id)?.id,
    })
  }

  /**
   * Shows a step's dataset as it was right after the step, reopening it from history when it is
   * no longer loaded. Looking is not a step, so nothing is recorded.
   */
  async showStep(stepId: string, sessionKey = DEFAULT_SESSION_KEY): Promise<StoredDataset> {
    const step = this.steps.find(s => s.id === stepId)
    if (!step?.datasetId)
      throw new Error('That step has no data to show.')
    let dataset = this.store.get(step.datasetId, sessionKey)
    if (!dataset) {
      if (!step.historyId)
        throw new Error('That data is no longer loaded and was not saved to history.')
      dataset = await this.reopen(step.historyId, { actor: 'user', sessionKey, record: false })
    }
    return this.store.updateView(dataset.id, {
      ...(step.viewMode ? { viewMode: step.viewMode } : {}),
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
    this.recordDatasetStep(shown, { actor: input.actor, tool: 'query', why: input.why, sql: input.sql })
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
   * Sends the user's message to the agent: straight into its conversation when a live connector
   * takes it, otherwise queued for its next TinyPivot reply.
   */
  addNote(text: string, options: { stepId?: string, attachment?: NoteAttachment } = {}): StudioNote {
    const attachment = options.attachment && { label: options.attachment.label.slice(0, 120), text: options.attachment.text.slice(0, ATTACHMENT_MAX_CHARS) }
    const note: StudioNote = {
      id: nextId('note'),
      at: new Date().toISOString(),
      text: text.trim(),
      delivery: 'queued',
      ...(options.stepId ? { stepId: options.stepId } : {}),
      ...(attachment ? { attachment } : {}),
    }
    if (this.agent.push(note, this.describeNote(note, { withSource: true })))
      note.delivery = 'live'
    else
      this.notes.push(note)
    this.record({ actor: 'user', tool: 'note', why: note.text, ...(attachment ? { view: `with ${attachment.label}` } : {}) })
    return note
  }

  /**
   * How a message reads to the agent: the text, the step it is about, and any attached data.
   * `withSource` says where it came from, for messages that arrive on their own in the conversation.
   */
  describeNote(note: StudioNote, { withSource = false } = {}): string {
    const step = note.stepId ? this.steps.find(s => s.id === note.stepId) : undefined
    const source = withSource ? 'Message from the user in TinyPivot Studio: ' : ''
    const lines = [`${source}${note.text}`]
    if (step)
      lines.push(`About the step "${step.why ?? step.view ?? step.tool}"${step.datasetId ? ` on dataset \`${step.datasetId}\`` : ''}${step.sql ? `, SQL: ${step.sql.replace(/\s+/g, ' ')}` : ''}`)
    if (note.attachment)
      lines.push(`Attached (${note.attachment.label}):`, note.attachment.text)
    return lines.join('\n')
  }

  /** The agent's answer to a Studio message, recorded in the trace where the user reads it. */
  reply(text: string): TraceStep {
    return this.record({ actor: 'agent', tool: 'reply', why: withoutCards(text) })
  }

  /** Drops a queued note the user no longer wants sent. */
  removeNote(id: string): boolean {
    const before = this.notes.length
    this.notes = this.notes.filter(note => note.id !== id)
    if (this.notes.length !== before)
      this.changed()
    return this.notes.length !== before
  }

  pendingNotes(): StudioNote[] {
    return [...this.notes]
  }

  /** The queued notes as text for the agent, emptying the queue. Empty when there are none. */
  takeNotes(): string {
    if (this.notes.length === 0)
      return ''
    const lines = this.notes.map(note => `- ${this.describeNote(note).replace(/\n/g, '\n  ')}`)
    this.notes = []
    this.changed()
    return `\n\n**Notes from the user in TinyPivot Studio** (act on these):\n${lines.join('\n')}`
  }
}
