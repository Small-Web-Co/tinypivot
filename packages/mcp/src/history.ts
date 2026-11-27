import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { RowFilter, StoredDataset } from './store.js'
import type { TraceStep } from './studio-protocol.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { groupRuns } from './runs.js'

/**
 * Every pull a session makes, kept on disk so it can be reopened later without re-querying or
 * re-sending anything to the model. Local only, under the user's data folder.
 *
 * Files are remembered by path and filter, since the file is still there to re-read. Ephemeral
 * pulls (rows passed in, query results, Postgres results) are saved with their rows.
 */

export type HistoryKind = 'file' | 'data' | 'query' | 'postgres'

export interface HistoryEntry {
  id: string
  name: string
  kind: HistoryKind
  createdAt: string
  rows: number
  columns: string[]
  /** File path for `file`, a source label for `data`, the SQL text for `query` and `postgres`. */
  source: string
  where?: RowFilter[]
  /** Saved rows, gzipped JSON lines, for pulls that cannot be re-read from a file. */
  rowsFile?: string
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
}

export interface RecordInput {
  kind: HistoryKind
  source: string
  where?: RowFilter[]
}

export interface SessionSummary {
  id: string
  title: string
  startedAt: string
  updatedAt: string
  turns: number
  outputs: number
  pinned: boolean
}

interface PinnedSessionRecord {
  id: string
  pinnedAt: string
}

/** Larger ephemeral pulls keep only their description, so history stays small. */
export const HISTORY_MAX_SAVED_ROWS = 200_000
const DEFAULT_RETENTION_DAYS = 30
/** Where each conversation's Studio trace is kept, under the history folder. */
export const SESSIONS_DIR = 'sessions'
/** Where files dropped into the Studio are kept, one folder per conversation. */
export const UPLOADS_DIR = 'uploads'
/** Manifest of sessions pinned by the user (exempt from 30-day automatic pruning). */
export const PINNED_SESSIONS_FILE = 'pinned-sessions.json'
const VALID_SESSION_ID = /^[\w-]+$/

export function defaultHistoryDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'tinypivot', 'history')
}

/** `2026-11-25T10:14:03.123Z` → `20261125-101403-123` */
function timestampId(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '')
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'data'
}

export class HistoryStore {
  readonly dir: string
  readonly enabled: boolean
  private readonly retentionDays: number

  constructor(options: { dir?: string, enabled?: boolean, retentionDays?: number } = {}) {
    this.dir = options.dir ?? defaultHistoryDir()
    this.enabled = options.enabled ?? process.env.TINYPIVOT_HISTORY !== '0'
    const envDays = Number(process.env.TINYPIVOT_HISTORY_DAYS)
    this.retentionDays = options.retentionDays ?? (Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_RETENTION_DAYS)
  }

  /** Saves a pull. Returns the entry, or null when history is off or the write failed. */
  record(dataset: StoredDataset, input: RecordInput, now = new Date()): HistoryEntry | null {
    if (!this.enabled)
      return null
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      const id = `${timestampId(now)}-${slug(dataset.name)}`
      const needsMaterializedRows = input.kind !== 'file' || input.source.toLowerCase().endsWith('.xlsx')
      const saveRows = needsMaterializedRows && dataset.rows.length <= HISTORY_MAX_SAVED_ROWS
      const entry: HistoryEntry = {
        id,
        name: dataset.name,
        kind: input.kind,
        createdAt: now.toISOString(),
        rows: dataset.rows.length,
        columns: dataset.columns.map(column => column.name),
        source: input.source,
        ...(input.where?.length ? { where: input.where } : {}),
        ...(saveRows ? { rowsFile: `${id}.jsonl.gz` } : {}),
        ...(dataset.chartConfig ? { chartConfig: dataset.chartConfig } : {}),
        ...(dataset.pivotConfig ? { pivotConfig: dataset.pivotConfig } : {}),
      }
      if (entry.rowsFile) {
        const lines = dataset.rows.map(row => JSON.stringify(row)).join('\n')
        fs.writeFileSync(path.join(this.dir, entry.rowsFile), zlib.gzipSync(lines))
      }
      fs.writeFileSync(path.join(this.dir, `${id}.json`), `${JSON.stringify(entry, null, 2)}\n`)
      return entry
    }
    catch (error) {
      console.error(`[tinypivot-mcp] Could not save to history: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  /** Newest first. */
  list(limit = Number.POSITIVE_INFINITY): HistoryEntry[] {
    if (!fs.existsSync(this.dir))
      return []
    return fs.readdirSync(this.dir)
      .filter(name => name.endsWith('.json') && name !== PINNED_SESSIONS_FILE)
      .sort()
      .reverse()
      .slice(0, limit)
      .flatMap((name) => {
        try {
          return [JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')) as HistoryEntry]
        }
        catch {
          return []
        }
      })
  }

  get(id: string): HistoryEntry | undefined {
    if (!/^[\w-]+$/.test(id))
      return undefined
    const file = path.join(this.dir, `${id}.json`)
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as HistoryEntry : undefined
  }

  /** Full path of an entry's saved rows, for reading back or querying with SQL. */
  rowsPath(entry: HistoryEntry): string | undefined {
    return entry.rowsFile ? path.join(this.dir, entry.rowsFile) : undefined
  }

  readRows(entry: HistoryEntry): Record<string, unknown>[] {
    const file = this.rowsPath(entry)
    if (!file)
      throw new Error(`History entry ${entry.id} has no saved rows.`)
    return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  }

  /** Full path to a saved session's JSONL trace, or undefined if `sessionId` is invalid. */
  sessionTracePath(sessionId: string): string | undefined {
    if (!VALID_SESSION_ID.test(sessionId))
      return undefined
    return path.join(this.dir, SESSIONS_DIR, `${sessionId}.jsonl`)
  }

  hasSession(sessionId: string): boolean {
    const file = this.sessionTracePath(sessionId)
    return Boolean(file && fs.existsSync(file))
  }

  /** Reads every recorded step for one isolated session without touching any other session. */
  readSessionSteps(sessionId: string): TraceStep[] {
    const file = this.sessionTracePath(sessionId)
    if (!file || !fs.existsSync(file))
      return []
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as TraceStep]
        }
        catch {
          return []
        }
      })
  }

  private pinnedManifestPath(): string {
    return path.join(this.dir, PINNED_SESSIONS_FILE)
  }

  private readPinnedSet(): Map<string, PinnedSessionRecord> {
    const file = this.pinnedManifestPath()
    if (!fs.existsSync(file))
      return new Map()
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PinnedSessionRecord[]
      if (!Array.isArray(parsed))
        return new Map()
      return new Map(parsed.filter(r => r && VALID_SESSION_ID.test(r.id)).map(r => [r.id, r]))
    }
    catch {
      return new Map()
    }
  }

  private writePinnedSet(map: Map<string, PinnedSessionRecord>): void {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(this.pinnedManifestPath(), `${JSON.stringify([...map.values()], null, 2)}\n`)
  }

  isSessionPinned(sessionId: string): boolean {
    return VALID_SESSION_ID.test(sessionId) && this.readPinnedSet().has(sessionId)
  }

  /** Marks or unmarks a session as pinned (kept forever, exempt from 30-day pruning). */
  setSessionPinned(sessionId: string, pinned: boolean): boolean {
    if (!VALID_SESSION_ID.test(sessionId))
      return false
    const map = this.readPinnedSet()
    if (pinned)
      map.set(sessionId, { id: sessionId, pinnedAt: new Date().toISOString() })
    else
      map.delete(sessionId)
    try {
      this.writePinnedSet(map)
      return true
    }
    catch {
      return false
    }
  }

  /** Summarizes a single session's trace steps into compact metadata for the Sessions switcher. */
  summarizeSession(sessionId: string, steps: TraceStep[], pinned = this.isSessionPinned(sessionId)): SessionSummary {
    const runs = groupRuns(steps)
    const firstPrompt = runs.find(r => r.prompt)?.prompt
    const firstDataset = steps.find(s => s.datasetName)?.datasetName
    const outputs = steps.filter(s => s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile' && Boolean(s.datasetId)).length
    const startedAt = steps[0]?.at ?? new Date().toISOString()
    const updatedAt = steps.at(-1)?.editedAt ?? steps.at(-1)?.at ?? startedAt
    return {
      id: sessionId,
      title: (firstPrompt ?? firstDataset ?? `Session ${sessionId}`).slice(0, 120),
      startedAt,
      updatedAt,
      turns: runs.length,
      outputs,
      pinned,
    }
  }

  /** Lists saved Studio sessions on disk, pinned first then newest activity first. */
  listSessions(limit = 50): SessionSummary[] {
    const dir = path.join(this.dir, SESSIONS_DIR)
    if (!fs.existsSync(dir))
      return []
    const pinned = this.readPinnedSet()
    const summaries: SessionSummary[] = []
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.jsonl'))
        continue
      const id = name.slice(0, -'.jsonl'.length)
      if (!VALID_SESSION_ID.test(id))
        continue
      const steps = this.readSessionSteps(id)
      if (steps.length === 0)
        continue
      summaries.push(this.summarizeSession(id, steps, pinned.has(id)))
    }
    summaries.sort((a, b) => {
      if (a.pinned !== b.pinned)
        return a.pinned ? -1 : 1
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return summaries.slice(0, limit)
  }

  /** Collects every `historyId` referenced by any pinned session so pruning never breaks pinned sessions. */
  private protectedHistoryIds(pinnedIds: Set<string>): Set<string> {
    const protectedIds = new Set<string>()
    for (const sessionId of pinnedIds) {
      for (const step of this.readSessionSteps(sessionId)) {
        if (step.historyId)
          protectedIds.add(step.historyId)
      }
    }
    return protectedIds
  }

  /** Removes conversation traces and dropped files last written before `cutoff`, skipping pinned sessions. */
  private pruneTraces(cutoff: number, pinnedIds: Set<string>): void {
    fs.rmSync(path.join(this.dir, 'trace.jsonl'), { force: true })
    for (const folder of [SESSIONS_DIR, UPLOADS_DIR]) {
      const parent = path.join(this.dir, folder)
      if (!fs.existsSync(parent))
        continue
      for (const entry of fs.readdirSync(parent)) {
        const sessionId = folder === SESSIONS_DIR && entry.endsWith('.jsonl')
          ? entry.slice(0, -'.jsonl'.length)
          : entry
        if (pinnedIds.has(sessionId))
          continue
        const full = path.join(parent, entry)
        if (fs.statSync(full).mtimeMs < cutoff)
          fs.rmSync(full, { recursive: true, force: true })
      }
    }
  }

  /** Deletes unpinned entries and conversation traces older than the retention window. Returns how many entries were removed. */
  prune(now = new Date()): number {
    if (!fs.existsSync(this.dir))
      return 0
    const cutoff = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000
    const pinnedIds = new Set(this.readPinnedSet().keys())
    const protectedPulls = this.protectedHistoryIds(pinnedIds)
    this.pruneTraces(cutoff, pinnedIds)
    let removed = 0
    for (const entry of this.list()) {
      if (protectedPulls.has(entry.id))
        continue
      if (new Date(entry.createdAt).getTime() >= cutoff)
        continue
      const rows = this.rowsPath(entry)
      if (rows)
        fs.rmSync(rows, { force: true })
      fs.rmSync(path.join(this.dir, `${entry.id}.json`), { force: true })
      removed++
    }
    return removed
  }
}

/** One line per entry, newest first: what the model sees when it lists history. */
export function formatHistoryList(entries: HistoryEntry[]): string {
  if (entries.length === 0)
    return 'No saved pulls yet.'
  const lines = entries.map((entry) => {
    const when = entry.createdAt.slice(0, 16).replace('T', ' ')
    return `\`${entry.id}\` ${when} · ${entry.name} · ${entry.rows.toLocaleString('en-US')} rows · ${entry.kind}`
  })
  return [`Saved pulls (newest first). Reopen one with history({ open: id }):`, ...lines].join('\n')
}

/** One line per saved Studio session: lets an agent or user discover past sessions without loading their tables. */
export function formatSessionList(sessions: SessionSummary[]): string {
  if (sessions.length === 0)
    return 'No saved Studio sessions yet.'
  const lines = sessions.map((s) => {
    const when = s.updatedAt.slice(0, 16).replace('T', ' ')
    const pin = s.pinned ? '★ ' : ''
    return `${pin}\`${s.id}\` ${when} · ${s.turns} turn${s.turns === 1 ? '' : 's'} · ${s.outputs} view${s.outputs === 1 ? '' : 's'} · ${s.title}`
  })
  return ['Saved Studio sessions (isolated; reopen locally with `tinypivot-mcp studio <id>`):', ...lines].join('\n')
}
