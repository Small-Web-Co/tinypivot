import type { McpLicenseInfo } from './license.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspectMcpLicenseKey } from './license.js'

/**
 * Yearly licenses carry the end of the paid period. While the subscription is active, TinyPivot
 * swaps the key for a renewed one before it runs out, and keeps that copy next to its preferences.
 * Team licenses also report a one-way hash of this install once a day, so the buyer can be told
 * when more people use a key than it covers. Nothing is ever blocked over seats, and an offline
 * machine keeps working until the key's own end date.
 */
export const LICENSE_REFRESH_URL = 'https://tiny-pivot.com/api/license-refresh'

const DAY_MS = 86_400_000
const RENEW_WITHIN_DAYS = 30
const TIMEOUT_MS = 5000

interface SavedLicense {
  key?: string
  checkedAt?: number
}

export function licenseStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'tinypivot', 'license.json')
}

function readSaved(file: string): SavedLicense {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as SavedLicense
  }
  catch {
    return {}
  }
}

function writeSaved(file: string, saved: SavedLicense): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(saved)}\n`, { mode: 0o600 })
  }
  catch {
    // A read-only home only means the renewal is fetched again next time.
  }
}

/** The key to use: a renewed copy of the configured key when one is saved and lasts longer. */
export function effectiveLicenseKey(configured: string | undefined, file = licenseStorePath()): string | undefined {
  const saved = configured ? readSaved(file).key : undefined
  if (!configured || !saved || saved === configured)
    return configured
  const current = inspectMcpLicenseKey(configured)
  const renewed = inspectMcpLicenseKey(saved)
  const sameLicense = Boolean(current.licenseId) && current.licenseId === renewed.licenseId
  return sameLicense && renewed.status === 'mcp' && renewed.expiry! > (current.expiry ?? '') ? saved : configured
}

function daysUntil(expiry: string, now: Date): number {
  const end = Date.UTC(Number(expiry.slice(0, 4)), Number(expiry.slice(4, 6)) - 1, Number(expiry.slice(6, 8)))
  return (end - now.getTime()) / DAY_MS
}

/** Team keys check in once a day (for the seat count); other yearly keys only in their last month. */
export function shouldRefresh(info: McpLicenseInfo, lastCheck: number | undefined, now = new Date()): boolean {
  if (!info.licenseId?.startsWith('sub_') || !info.expiry)
    return false
  if (lastCheck && now.getTime() - lastCheck < DAY_MS)
    return false
  return info.typeCode === 'MCPT' || daysUntil(info.expiry, now) <= RENEW_WITHIN_DAYS
}

/** A per-license hash of this install: it counts seats without linking to telemetry or to the machine. */
export function installHash(anonId: string, licenseId: string): string {
  return crypto.createHash('sha256').update(`${licenseId}:${anonId}`).digest('hex').slice(0, 16)
}

interface RefreshReply {
  key?: string
  seats?: { used: number, limit: number }
  message?: string
}

function seatNotice(seats: RefreshReply['seats']): string | undefined {
  if (!seats || seats.used <= seats.limit)
    return undefined
  return `[tinypivot-mcp] Notice: this Team license was used on ${seats.used} installs in the last 30 days; it covers ${seats.limit} people. Add seats at https://tiny-pivot.com/pricing — nothing has been switched off.`
}

function renewalNotice(reply: RefreshReply, info: McpLicenseInfo): string | undefined {
  const renewed = reply.key ? inspectMcpLicenseKey(reply.key) : undefined
  if (!renewed || renewed.status !== 'mcp' || renewed.licenseId !== info.licenseId || renewed.expiry! <= info.expiry!)
    return undefined
  const day = `${renewed.expiry!.slice(0, 4)}-${renewed.expiry!.slice(4, 6)}-${renewed.expiry!.slice(6, 8)}`
  return info.status === 'expired'
    ? `[tinypivot-mcp] License renewed through ${day}. Restart your agent to switch Pro back on.`
    : `[tinypivot-mcp] License renewed through ${day}.`
}

export interface RefreshOptions {
  anonId: string
  file?: string
  now?: Date
  url?: string
  fetchFn?: typeof fetch
}

/** Checks in with tiny-pivot.com when it is time; returns notices for stderr. Never throws. */
export async function refreshLicense(key: string | undefined, options: RefreshOptions): Promise<string[]> {
  const file = options.file ?? licenseStorePath()
  const info = inspectMcpLicenseKey(key)
  const saved = readSaved(file)
  if (!key || process.env.TINYPIVOT_LICENSE_REFRESH === '0' || !shouldRefresh(info, saved.checkedAt, options.now))
    return []
  try {
    const res = await (options.fetchFn ?? fetch)(options.url ?? LICENSE_REFRESH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, install: installHash(options.anonId, info.licenseId!) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const reply = await res.json().catch(() => ({})) as RefreshReply
    const renewal = res.ok ? renewalNotice(reply, info) : undefined
    writeSaved(file, { key: renewal ? reply.key : saved.key, checkedAt: (options.now ?? new Date()).getTime() })
    const message = res.ok ? undefined : reply.message && `[tinypivot-mcp] Notice: ${reply.message}`
    return [renewal, seatNotice(reply.seats), message].filter((n): n is string => Boolean(n))
  }
  catch {
    // Offline or tiny-pivot.com unreachable: try again next start; the key keeps working until it ends.
    return []
  }
}
