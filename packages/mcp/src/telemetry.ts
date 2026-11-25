import crypto from 'node:crypto'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_TELEMETRY_URL = 'https://tiny-pivot.com/api/telemetry'
const PACKAGE_VERSION = '0.7.0'

export interface TelemetryEvent {
  event: 'server_start' | 'tool_call'
  tool?: string
  rowBucket?: '<100' | '100-1k' | '1k-2.5k' | '2.5k-10k' | '10k+'
  client?: string
  tier: 'free' | 'pro'
  truncated?: boolean
}

export function isTelemetryEnabled(): boolean {
  if (process.env.TINYPIVOT_TELEMETRY === '0' || process.env.TINYPIVOT_TELEMETRY === 'false')
    return false
  if (process.env.DO_NOT_TRACK === '1' || process.env.DO_NOT_TRACK === 'true')
    return false
  return true
}

export function bucketRowCount(rows: number): TelemetryEvent['rowBucket'] {
  if (rows < 100)
    return '<100'
  if (rows < 1000)
    return '100-1k'
  if (rows <= 2500)
    return '1k-2.5k'
  if (rows <= 10000)
    return '2.5k-10k'
  return '10k+'
}

function getPreferencesPath(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'tinypivot', 'preferences.json')
}

let cachedAnonId: string | null = null

function getAnonymousId(): string {
  if (cachedAnonId)
    return cachedAnonId
  const prefPath = getPreferencesPath()
  try {
    const existing = JSON.parse(fsSync.readFileSync(prefPath, 'utf8')) as { anonId?: string }
    if (existing.anonId && typeof existing.anonId === 'string') {
      cachedAnonId = existing.anonId
      return cachedAnonId
    }
  }
  catch {}

  const fresh = crypto.randomUUID()
  cachedAnonId = fresh
  try {
    fsSync.mkdirSync(path.dirname(prefPath), { recursive: true })
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(fsSync.readFileSync(prefPath, 'utf8')) as Record<string, unknown>
    }
    catch {}
    fsSync.writeFileSync(prefPath, `${JSON.stringify({ ...existing, anonId: fresh }, null, 2)}\n`, 'utf8')
  }
  catch {}
  return fresh
}

/**
 * Privacy-first, zero-PII, opt-out telemetry ping.
 * NEVER sends row values, column names, SQL, file paths, or user identities.
 * Disable anytime via TINYPIVOT_TELEMETRY=0 or DO_NOT_TRACK=1.
 */
export function recordTelemetry(ev: TelemetryEvent): void {
  if (!isTelemetryEnabled())
    return

  const url = process.env.TINYPIVOT_TELEMETRY_URL?.trim() || DEFAULT_TELEMETRY_URL
  const payload = {
    ...ev,
    version: PACKAGE_VERSION,
    os: process.platform,
    anonId: getAnonymousId(),
    ts: new Date().toISOString(),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  if (typeof timer.unref === 'function')
    timer.unref()

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      // Telemetry is strictly best-effort and never blocks or errors the MCP server
    })
    .finally(() => clearTimeout(timer))
}
