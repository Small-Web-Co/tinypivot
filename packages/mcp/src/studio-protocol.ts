import type { ChartConfig, DataGridViewMode, PivotConfig } from '@smallwebco/tinypivot-core'
import type { HistoryEntry, SessionSummary } from './history.js'
import type { RowFilter } from './store.js'

/**
 * What the local server and the browser Studio exchange. Kept free of Node imports so the
 * browser bundle can share it.
 */

/** The header every Studio write must carry. Browsers will not send it cross-site without a preflight the server never grants. */
export const STUDIO_HEADER = 'x-tinypivot'

export type StepActor = 'agent' | 'user'

export interface StepRevision {
  at: string
  actor: StepActor
  sql?: string
  datasetId?: string
  rows?: number
  fingerprint?: Fingerprint
  note?: string
}

export interface TraceStep {
  id: string
  at: string
  actor: StepActor
  /** The tool or Studio action, e.g. `query`, `configure_chart`, `history`. */
  tool: string
  /** Why the step was taken, in the agent's (or user's) words. */
  why?: string
  datasetId?: string
  datasetName?: string
  rows?: number
  sql?: string
  /** ISO timestamp when the user last edited this step's SQL in place. */
  editedAt?: string
  /** Prior versions preserved whenever this step's SQL is edited. */
  revisions?: StepRevision[]
  file?: string
  where?: RowFilter[]
  /** What is shown, e.g. "line chart: sum(mrr) by month, split by year". */
  view?: string
  /** The view as it was after this step, so opening the step shows exactly that. */
  viewMode?: DataGridViewMode
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  historyId?: string
  /** The user's request this step serves, in their words, when the agent passed it along. */
  ask?: string
  /** Column names of the result. */
  columns?: string[]
  /** The result's size and content hash (row order ignored), so a rerun can show it reproduces. */
  fingerprint?: Fingerprint
  /** For a load from a file: the file as it was then, so the Studio can tell whether it changed. */
  source?: SourceFile
  /** For an answer: each number it quotes and whether the data backs it. */
  claims?: Claim[]
}

export interface Fingerprint {
  rows: number
  hash: string
}

export interface SourceFile {
  file: string
  bytes: number
  modifiedAt: string
}

/**
 * A number quoted in an answer. `found`: a cell, total or share in the data rounds to it.
 * `not-found`: nothing does. `unchecked`: a percentage that is not a share, such as a growth rate.
 */
export interface Claim {
  text: string
  status: 'found' | 'not-found' | 'unchecked'
  where?: string
}

/** The result of re-checking a step: did the source stay put, and does the SQL give the same rows again. */
export interface StepCheck {
  kind: 'source' | 'rerun'
  ok: boolean
  detail: string
}

/** Data the user sends along with a message: a selected row, a drilled-into slice, a view. */
export interface NoteAttachment {
  label: string
  text: string
}

/** A file the user dropped into the Studio, saved where the agent can read it. */
export interface StudioFile {
  id: string
  name: string
  /** `data` the agent can load with load_file, an `image` it can look at, or any other `file`. */
  kind: 'data' | 'image' | 'file'
  bytes: number
  path: string
}

/** A message from the Studio, sent straight into the agent's conversation. */
export interface StudioNote {
  id: string
  at: string
  text: string
  stepId?: string
  attachment?: NoteAttachment
  files?: StudioFile[]
}

/** How the user can make their agent take Studio messages live: a sentence, and a command to copy if there is one. */
export interface AgentHint {
  text: string
  command?: string
}

/** What the browser Studio shows: the trace, saved pulls, isolated session info and how to reach the agent. */
export interface StudioSnapshot {
  /** Which isolated session this snapshot belongs to. */
  sessionId: string
  /** The live agent's session id, or `null` when running standalone (`tinypivot-mcp studio`). */
  liveSessionId: string | null
  /** Whether this session is pinned (kept forever, exempt from 30-day automatic pruning). */
  pinned: boolean
  /** Saved sessions on disk that the user can open in full isolation. */
  sessions: SessionSummary[]
  /**
   * Each step, with the SQL that reproduces it when there is one (file loads included), and that
   * SQL laid out by SQLFluff once it has been (absent without SQLFluff: the browser formats it).
   */
  steps: Array<TraceStep & { editableSql?: string, formattedSql?: string }>
  history: HistoryEntry[]
  historyEnabled: boolean
  /** Ids of the datasets loaded right now in THIS isolated session, so a step can open its dataset directly. */
  loadedIds: string[]
  /** The agent the Studio talks to, and the ways it reaches it live right now (empty: the Studio cannot message it). */
  agent: { name?: string, live: string[], busy: boolean, hint?: AgentHint }
}
