import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { RowFilter, StoredDataset } from './store.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

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

/** Larger ephemeral pulls keep only their description, so history stays small. */
export const HISTORY_MAX_SAVED_ROWS = 200_000
const DEFAULT_RETENTION_DAYS = 30
/** Where each conversation's Studio trace is kept, under the history folder. */
export const SESSIONS_DIR = 'sessions'
/** Where files dropped into the Studio are kept, one folder per conversation. */
export const UPLOADS_DIR = 'uploads'

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
      const saveRows = input.kind !== 'file' && dataset.rows.length <= HISTORY_MAX_SAVED_ROWS
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
      .filter(name => name.endsWith('.json'))
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

  /** Removes conversation traces and dropped files last written before `cutoff`, and the old trace every session shared. */
  private pruneTraces(cutoff: number): void {
    fs.rmSync(path.join(this.dir, 'trace.jsonl'), { force: true })
    for (const folder of [SESSIONS_DIR, UPLOADS_DIR]) {
      const parent = path.join(this.dir, folder)
      if (!fs.existsSync(parent))
        continue
      for (const entry of fs.readdirSync(parent)) {
        const full = path.join(parent, entry)
        if (fs.statSync(full).mtimeMs < cutoff)
          fs.rmSync(full, { recursive: true, force: true })
      }
    }
  }

  /** Deletes entries and conversation traces older than the retention window. Returns how many entries were removed. */
  prune(now = new Date()): number {
    if (!fs.existsSync(this.dir))
      return 0
    const cutoff = now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000
    this.pruneTraces(cutoff)
    let removed = 0
    for (const entry of this.list()) {
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
