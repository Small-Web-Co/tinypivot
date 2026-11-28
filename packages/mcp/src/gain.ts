import type { HistoryEntry, HistoryKind } from './history.js'
import type { TraceStep } from './studio-protocol.js'
import fs from 'node:fs'
import path from 'node:path'
import { defaultHistoryDir, HistoryStore, SESSIONS_DIR } from './history.js'
import { DataMemoryStore, defaultMemoryPath } from './memory.js'
import { DEFAULT_MODEL_PRICING, tokensToUsd } from './pricing.js'

/**
 * `tinypivot-mcp gain` — counted (not fabricated) local savings & trust-layer report
 * computed directly from TinyPivot's local history, session traces, and Recursive Data Memory.
 */

export interface GainReport {
  days: number | null
  historyDir: string
  pullsTotal: number
  pullsByKind: Record<string, number>
  resultRowsServed: number
  sourceRowsAnalyzed: number
  /** Exact tokens kept out of LLM context from recorded `tokensSaved` fields. */
  countedTokensSaved: number
  /** Fallback conservative estimate for older history entries that predate `tokensSaved` recording. */
  legacyEstimatedTokensSaved: number
  totalTokensSaved: number
  estimatedInputUsdSaved: number
  scannedBytes: number
  trapsCaught: number
  learnedLessons: number
  sessions: number
  steps: number
  analyzeCalls: number
  profileCalls: number
  claimsVerified: number
  claimsBacked: number
}

const BYTES_PER_TOKEN = 4
const AVG_BYTES_PER_CELL = 14

/** Parses human-readable scanned bytes from warehouse notes like "BigQuery scanned 2.5 MB (limit 50 GB).". */
export function parseScannedBytes(note: string | undefined): number {
  if (!note)
    return 0
  const m = /scanned\s+([\d.]+)\s*(TB|GB|MB|KB|B)\b/i.exec(note)
  if (!m)
    return 0
  const val = Number(m[1])
  if (!Number.isFinite(val) || val < 0)
    return 0
  const unit = m[2].toUpperCase()
  const mult = unit === 'TB' ? 1e12 : unit === 'GB' ? 1e9 : unit === 'MB' ? 1e6 : unit === 'KB' ? 1e3 : 1
  return Math.round(val * mult)
}

function estimateLegacyEntryTokens(entry: HistoryEntry): number {
  if (entry.kind === 'file' && entry.source && fs.existsSync(entry.source)) {
    try {
      const size = fs.statSync(entry.source).size
      if (size > 0)
        return Math.round(size / BYTES_PER_TOKEN)
    }
    catch {}
  }
  const cols = Math.max(1, entry.columns?.length ?? 1)
  return Math.round((entry.rows * cols * AVG_BYTES_PER_CELL) / BYTES_PER_TOKEN)
}

function parseSessionFile(filePath: string): TraceStep[] {
  const raw = fs.readFileSync(filePath, 'utf8').trim()
  if (!raw)
    return []
  if (filePath.endsWith('.jsonl')) {
    const out: TraceStep[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed)
        continue
      try {
        const obj = JSON.parse(trimmed) as TraceStep
        if (obj && typeof obj === 'object' && typeof obj.tool === 'string')
          out.push(obj)
      }
      catch {}
    }
    return out
  }
  const parsed = JSON.parse(raw) as { steps?: TraceStep[] }
  return Array.isArray(parsed.steps) ? parsed.steps : []
}

function readSessionSteps(historyDir: string, cutoffMs: number | null): { sessions: number, steps: TraceStep[] } {
  const sessionsDir = path.join(historyDir, SESSIONS_DIR)
  if (!fs.existsSync(sessionsDir))
    return { sessions: 0, steps: [] }
  let sessions = 0
  const steps: TraceStep[] = []
  for (const name of fs.readdirSync(sessionsDir)) {
    if (!name.endsWith('.jsonl') && !name.endsWith('.json'))
      continue
    try {
      const list = parseSessionFile(path.join(sessionsDir, name))
      const filtered = cutoffMs === null
        ? list
        : list.filter(s => Date.parse(s.at) >= cutoffMs)
      if (filtered.length > 0) {
        sessions++
        steps.push(...filtered)
      }
    }
    catch {}
  }
  return { sessions, steps }
}

/** Computes a counted savings report from local TinyPivot history, Studio sessions, and memory. */
export function computeGainReport(options: {
  historyDir?: string
  memoryPath?: string
  days?: number
  now?: Date
} = {}): GainReport {
  const historyDir = options.historyDir ?? defaultHistoryDir()
  const now = options.now ?? new Date()
  const days = options.days && Number.isFinite(options.days) && options.days > 0 ? options.days : null
  const cutoffMs = days !== null ? now.getTime() - days * 86_400_000 : null

  const store = new HistoryStore({ dir: historyDir, enabled: true })
  const allEntries = store.list()
  const entries = cutoffMs === null
    ? allEntries
    : allEntries.filter(e => Date.parse(e.createdAt) >= cutoffMs)

  const pullsByKind: Record<string, number> = {}
  let resultRowsServed = 0
  let sourceRowsAnalyzed = 0
  let countedTokensSaved = 0
  let legacyEstimatedTokensSaved = 0
  let scannedBytes = 0
  let trapsCaught = 0

  for (const entry of entries) {
    const kind: HistoryKind | string = entry.kind ?? 'data'
    pullsByKind[kind] = (pullsByKind[kind] ?? 0) + 1
    resultRowsServed += entry.rows ?? 0
    sourceRowsAnalyzed += entry.sourceRows ?? entry.rows ?? 0
    if (typeof entry.tokensSaved === 'number' && entry.tokensSaved > 0)
      countedTokensSaved += entry.tokensSaved
    else
      legacyEstimatedTokensSaved += estimateLegacyEntryTokens(entry)
    scannedBytes += entry.scannedBytes ?? 0
    trapsCaught += entry.trapsCaught ?? 0
  }

  const { sessions, steps } = readSessionSteps(historyDir, cutoffMs)
  let analyzeCalls = 0
  let profileCalls = 0
  let claimsVerified = 0
  let claimsBacked = 0
  for (const step of steps) {
    if (step.tool === 'analyze')
      analyzeCalls++
    else if (step.tool === 'profile')
      profileCalls++
    if (Array.isArray(step.claims)) {
      for (const claim of step.claims) {
        claimsVerified++
        if (claim.status === 'found')
          claimsBacked++
      }
    }
  }

  const mem = new DataMemoryStore({ filePath: options.memoryPath ?? defaultMemoryPath(), enabled: true })
  const learnedLessons = mem.listSchemas().reduce((sum, s) => sum + s.lessons.length, 0)
  const totalTokensSaved = countedTokensSaved + legacyEstimatedTokensSaved

  return {
    days,
    historyDir,
    pullsTotal: entries.length,
    pullsByKind,
    resultRowsServed,
    sourceRowsAnalyzed,
    countedTokensSaved,
    legacyEstimatedTokensSaved,
    totalTokensSaved,
    estimatedInputUsdSaved: tokensToUsd(totalTokensSaved, DEFAULT_MODEL_PRICING.ratePerMillion),
    scannedBytes,
    trapsCaught,
    learnedLessons,
    sessions,
    steps: steps.length,
    analyzeCalls,
    profileCalls,
    claimsVerified,
    claimsBacked,
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtCompactBytes(bytes: number): string {
  if (bytes >= 1e9)
    return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6)
    return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3)
    return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

/** Formats a GainReport for terminal stdout. */
export function formatGainReport(report: GainReport): string {
  const windowLabel = report.days ? `last ${report.days} day${report.days === 1 ? '' : 's'}` : 'all local history'
  if (report.pullsTotal === 0 && report.sessions === 0) {
    return [
      `TinyPivot Gain (${windowLabel})`,
      'No local pulls or Studio sessions recorded yet.',
      `History folder: ${report.historyDir}`,
    ].join('\n')
  }

  const kinds = Object.entries(report.pullsByKind)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}: ${fmtNum(n)}`)
    .join(' · ')

  const tokenNote = report.legacyEstimatedTokensSaved > 0 && report.countedTokensSaved > 0
    ? ` (${fmtNum(report.countedTokensSaved)} counted + ${fmtNum(report.legacyEstimatedTokensSaved)} from legacy pulls)`
    : report.legacyEstimatedTokensSaved > 0
      ? ' (estimated from saved legacy pulls)'
      : ' (counted)'

  const lines = [
    `TinyPivot Gain — ${windowLabel}`,
    '─'.repeat(56),
    `Pulls recorded:        ${fmtNum(report.pullsTotal)}${kinds ? `  (${kinds})` : ''}`,
    `Rows analyzed:         ${fmtNum(report.sourceRowsAnalyzed)} source rows → ${fmtNum(report.resultRowsServed)} result rows`,
    `Tokens kept out of AI: ${fmtNum(report.totalTokensSaved)}${tokenNote}`,
    `Input spend avoided:   ~$${report.estimatedInputUsdSaved.toFixed(2)} (at ${DEFAULT_MODEL_PRICING.name} input rate)`,
  ]
  if (report.scannedBytes > 0)
    lines.push(`Warehouse bytes scan:  ${fmtCompactBytes(report.scannedBytes)}`)
  lines.push(
    `Traps caught / memory: ${fmtNum(report.trapsCaught)} audit trap${report.trapsCaught === 1 ? '' : 's'} caught · ${fmtNum(report.learnedLessons)} lesson${report.learnedLessons === 1 ? '' : 's'} in memory`,
    `Studio & analyses:     ${fmtNum(report.sessions)} session${report.sessions === 1 ? '' : 's'} · ${fmtNum(report.steps)} step${report.steps === 1 ? '' : 's'} · ${fmtNum(report.analyzeCalls)} analyze · ${fmtNum(report.profileCalls)} profile`,
  )
  if (report.claimsVerified > 0)
    lines.push(`Claims checked:        ${fmtNum(report.claimsBacked)}/${fmtNum(report.claimsVerified)} backed by data`)
  lines.push(`History folder:        ${report.historyDir}`)
  return lines.join('\n')
}
