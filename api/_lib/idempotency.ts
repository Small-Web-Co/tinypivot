/**
 * Idempotency for webhook events.
 *
 * Stripe retries deliveries, so the same event can arrive more than once.
 * Claiming an event id guarantees we only issue a license once.
 *
 * Uses the same durable store as rate limiting when configured
 * (`UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`);
 * otherwise falls back to a bounded in-memory set, which only protects against
 * duplicates that land on the same serverless instance.
 */

import { getRedisConfig } from './rate-limit.js'

const MEMORY_MAX_ENTRIES = 2000
const memoryClaims = new Map<string, number>()

/**
 * Claim an event id.
 *
 * @returns `true` the first time the id is seen, `false` on a duplicate.
 */
export async function claimEvent(
  eventId: string,
  ttlSeconds = 7 * 24 * 60 * 60,
): Promise<boolean> {
  const key = `tinypivot:event:${eventId}`
  const config = getRedisConfig()

  if (config) {
    try {
      const response = await fetch(`${config.url}/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['SET', key, '1', 'NX', 'EX', String(ttlSeconds)]),
        signal: typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(1500)
          : undefined,
      })

      if (response.ok) {
        const data = await response.json() as { result?: unknown }
        return data.result === 'OK'
      }
    }
    catch {
      // Store unreachable - fall back to the in-memory set.
    }
  }

  const now = Date.now()
  const expiresAt = memoryClaims.get(key)

  if (expiresAt !== undefined && now < expiresAt) {
    return false
  }

  memoryClaims.set(key, now + ttlSeconds * 1000)

  if (memoryClaims.size > MEMORY_MAX_ENTRIES) {
    for (const [claimKey, claimExpiry] of memoryClaims) {
      if (now >= claimExpiry) {
        memoryClaims.delete(claimKey)
      }
    }
    if (memoryClaims.size > MEMORY_MAX_ENTRIES) {
      const excess = memoryClaims.size - MEMORY_MAX_ENTRIES
      let removed = 0
      for (const claimKey of memoryClaims.keys()) {
        memoryClaims.delete(claimKey)
        if (++removed >= excess) {
          break
        }
      }
    }
  }

  return true
}
