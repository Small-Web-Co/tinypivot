import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Pro Recursive Data Memory (100% local, zero cloud upload).
 *
 * Learns from every inquiry, `[AUDIT]` catch, and Studio SQL edit, keyed by table/schema
 * signature (table basename + sorted column names). On future sessions touching the same
 * schema or codebase, injects a concise (~30-60 token) `[MEMORY]` brief so any LLM avoids
 * past traps on Turn 1 without wasting exploratory turns or tokens.
 */

export interface LearnedLesson {
  /** Stable dedup key within a schema (e.g. "audit:join_fanout:account_reps" or "edit:orders"). */
  key: string
  kind: 'audit' | 'user_edit' | 'rule'
  summary: string
  learnedAt: string
  hits: number
}

export interface SchemaMemoryEntry {
  schemaKey: string
  tableHint: string
  columns: string[]
  updatedAt: string
  inquiryCount: number
  lessons: LearnedLesson[]
}

interface MemoryFileShape {
  version: 1
  schemas: Record<string, SchemaMemoryEntry>
}

const MAX_SCHEMAS = 200
const MAX_LESSONS_PER_SCHEMA = 6

export function defaultMemoryPath(): string {
  const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdg, 'tinypivot', 'memory.json')
}

export function normalizeTableHint(sourceOrId: string): string {
  const base = sourceOrId.replace(/^.*[/\\]/, '').trim().toLowerCase()
  return base.replace(/\.(?:csv|tsv|json|jsonl|parquet|xlsx|xls)$/i, '') || 'dataset'
}

/** Stable schema key derived from normalized table name + sorted column names (when available). */
export function computeSchemaKey(tableHint: string, columns?: string[]): string {
  const normTable = normalizeTableHint(tableHint)
  if (!columns?.length)
    return `table:${normTable}`
  const colSig = [...new Set(columns.map(c => c.trim().toLowerCase()).filter(Boolean))].sort().join(',')
  const hash = crypto.createHash('sha1').update(`${normTable}|${colSig}`).digest('hex').slice(0, 10)
  return `${normTable}:${hash}`
}

export class DataMemoryStore {
  readonly filePath: string
  readonly enabled: boolean
  private data: MemoryFileShape

  constructor(options: { filePath?: string, enabled?: boolean } = {}) {
    this.filePath = options.filePath ?? defaultMemoryPath()
    this.enabled = options.enabled ?? process.env.TINYPIVOT_MEMORY !== '0'
    this.data = this.load()
  }

  private load(): MemoryFileShape {
    if (!this.enabled)
      return { version: 1, schemas: {} }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<MemoryFileShape>
      if (parsed && parsed.version === 1 && parsed.schemas && typeof parsed.schemas === 'object')
        return { version: 1, schemas: parsed.schemas }
    }
    catch {}
    return { version: 1, schemas: {} }
  }

  private save(): void {
    if (!this.enabled)
      return
    try {
      const keys = Object.keys(this.data.schemas)
      if (keys.length > MAX_SCHEMAS) {
        const sorted = keys.sort((a, b) => (this.data.schemas[a].updatedAt > this.data.schemas[b].updatedAt ? -1 : 1))
        const keep = new Set(sorted.slice(0, MAX_SCHEMAS))
        for (const k of keys) {
          if (!keep.has(k))
            delete this.data.schemas[k]
        }
      }
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    }
    catch {}
  }

  /** Records a learned lesson (from an audit trap or a user SQL edit) for a table/schema. */
  recordLesson(input: {
    tableHint: string
    columns?: string[]
    key: string
    kind: LearnedLesson['kind']
    summary: string
  }): void {
    if (!this.enabled || !input.summary.trim())
      return
    const tableHint = normalizeTableHint(input.tableHint)
    const schemaKey = computeSchemaKey(tableHint, input.columns)
    const now = new Date().toISOString()

    const entry = this.data.schemas[schemaKey] ?? {
      schemaKey,
      tableHint,
      columns: input.columns ? [...input.columns] : [],
      updatedAt: now,
      inquiryCount: 0,
      lessons: [],
    }
    entry.updatedAt = now
    entry.inquiryCount += 1
    if (input.columns?.length && entry.columns.length === 0)
      entry.columns = [...input.columns]

    const existing = entry.lessons.find(l => l.key === input.key)
    if (existing) {
      existing.summary = input.summary.trim().slice(0, 220)
      existing.learnedAt = now
      existing.hits += 1
    }
    else {
      entry.lessons.unshift({
        key: input.key,
        kind: input.kind,
        summary: input.summary.trim().slice(0, 220),
        learnedAt: now,
        hits: 1,
      })
      entry.lessons = entry.lessons.slice(0, MAX_LESSONS_PER_SCHEMA)
    }

    this.data.schemas[schemaKey] = entry
    this.save()
  }

  /** Recalls learned lessons matching a table name and/or column schema. */
  recall(tableHints: string[], columns?: string[]): LearnedLesson[] {
    if (!this.enabled || tableHints.length === 0)
      return []
    const matched: LearnedLesson[] = []
    const seen = new Set<string>()

    for (const rawHint of tableHints) {
      const norm = normalizeTableHint(rawHint)
      // Prefer exact schema key match (table + columns), fall back to table-level or basename match.
      const exactKey = columns?.length ? computeSchemaKey(norm, columns) : undefined
      const tableOnlyKey = `table:${norm}`
      const entries: SchemaMemoryEntry[] = []
      if (exactKey && this.data.schemas[exactKey])
        entries.push(this.data.schemas[exactKey])
      if (this.data.schemas[tableOnlyKey])
        entries.push(this.data.schemas[tableOnlyKey])
      if (entries.length === 0) {
        for (const candidate of Object.values(this.data.schemas)) {
          if (candidate.tableHint === norm)
            entries.push(candidate)
        }
      }
      for (const entry of entries) {
        for (const lesson of entry.lessons) {
          if (!seen.has(lesson.key)) {
            seen.add(lesson.key)
            matched.push(lesson)
          }
        }
      }
    }
    // User edits first, then most-frequently seen audit lessons
    return matched
      .sort((a, b) => {
        if (a.kind === 'user_edit' && b.kind !== 'user_edit')
          return -1
        if (b.kind === 'user_edit' && a.kind !== 'user_edit')
          return 1
        return b.hits - a.hits
      })
      .slice(0, 4)
  }

  /** Lists all stored schema memory entries. */
  listSchemas(): SchemaMemoryEntry[] {
    return Object.values(this.data.schemas)
  }

  /** Formats recalled memory into a compact (~30-60 token) block. Empty when nothing is learned yet. */
  formatRecall(tableHints: string[], columns?: string[]): string {
    const lessons = this.recall(tableHints, columns)
    if (lessons.length === 0)
      return ''
    return [
      '',
      '> **[LEARNED MEMORY — FROM PRIOR INQUIRIES]**',
      ...lessons.map(l => `> - ${l.kind === 'user_edit' ? '**Verified rule**: ' : ''}${l.summary}`),
    ].join('\n')
  }
}
