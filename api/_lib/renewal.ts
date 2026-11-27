/**
 * Renewing yearly MCP keys from the Stripe subscription they belong to.
 *
 * The MCP server calls /api/license-refresh with its key. If the subscription is still being paid
 * for, it gets a key that runs to the end of the current period (plus grace). A cancelled or unpaid
 * subscription simply stops getting new keys, so there is nothing to revoke. Team keys also log a
 * one-way install hash, used only to tell the buyer when more people use the key than it covers.
 */

import type { IssuedLicense } from './license.js'
import { expiryAfter, mintLicenseKey, readLicenseKey } from './license.js'
import { dayNumber, isInstallHash, parseSeatLog, recordSeat, SEAT_METADATA_KEY, serializeSeatLog, TEAM_SEATS } from './seats.js'

/** The few subscription fields renewal needs, as Stripe returns them. */
export interface SubscriptionLike {
  status: string
  current_period_end?: number
  items: { data: Array<{ current_period_end?: number }> }
  metadata: Record<string, string>
}

export interface RenewalDeps {
  getSubscription: (id: string) => Promise<SubscriptionLike | null>
  setMetadata: (id: string, metadata: Record<string, string>) => Promise<void>
  now?: Date
  readKey?: (key: string) => IssuedLicense | null
  mintKey?: typeof mintLicenseKey
}

export interface RenewalReply {
  status: number
  body: { key?: string, seats?: { used: number, limit: number }, message?: string }
}

/** Statuses where the customer is still paying (past_due is retrying a card). */
const RENEWING = new Set(['active', 'trialing', 'past_due'])
const MCP_TYPES = new Set(['MCPP', 'MCPT'])

const displayDay = (expiry: string) => `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`

function periodEnd(sub: SubscriptionLike): number | undefined {
  // Stripe moved the period to subscription items in newer API versions; read either.
  return sub.current_period_end ?? sub.items.data[0]?.current_period_end
}

async function countSeat(id: string, sub: SubscriptionLike, install: string, deps: RenewalDeps) {
  const before = sub.metadata[SEAT_METADATA_KEY]
  const log = recordSeat(parseSeatLog(before), install, dayNumber(deps.now ?? new Date()))
  const after = serializeSeatLog(log)
  if (after !== before)
    await deps.setMetadata(id, { [SEAT_METADATA_KEY]: after }).catch(() => {})
  return { used: log.size, limit: TEAM_SEATS }
}

function invalid(message: string, status = 400): RenewalReply {
  return { status, body: { message } }
}

export async function renewLicense(body: { key?: unknown, install?: unknown }, deps: RenewalDeps): Promise<RenewalReply> {
  const issued = typeof body.key === 'string' ? (deps.readKey ?? readLicenseKey)(body.key) : null
  if (!issued || !MCP_TYPES.has(issued.typeCode))
    return invalid('This is not a valid TinyPivot MCP license key.')
  if (!issued.licenseId?.startsWith('sub_'))
    return invalid('This license does not renew: it has no subscription.')

  const sub = await deps.getSubscription(issued.licenseId)
  if (!sub)
    return invalid('TinyPivot could not find the subscription for this license. Email support@tiny-pivot.com.', 404)
  const end = periodEnd(sub)
  if (!RENEWING.has(sub.status) || !end)
    return invalid(`This license's subscription has ended (${sub.status}). Pro stays on until ${displayDay(issued.expiry)}; renew at https://tiny-pivot.com/pricing.`, 403)

  const expiry = expiryAfter(end)
  const key = expiry > issued.expiry
    ? await (deps.mintKey ?? mintLicenseKey)(issued.typeCode, expiry, issued.licenseId)
    : (body.key as string)
  const seats = issued.typeCode === 'MCPT' && isInstallHash(body.install)
    ? await countSeat(issued.licenseId, sub, body.install, deps)
    : undefined
  return { status: 200, body: { key, ...(seats ? { seats } : {}) } }
}
