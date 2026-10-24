/**
 * Rate limiting for the TinyPivot API functions.
 *
 * Uses a durable store when one is configured, so limits survive cold starts
 * and are shared across serverless instances:
 *
 * - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)
 * - `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
 *
 * With no store configured it falls back to a per-instance in-memory counter.
 * That fallback is best-effort only (it resets on cold start), so production
 * deployments should configure one of the above.
 */

export interface RateLimitConfig {
  perMinute: number
  perDay: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  reason?: string
}

interface Bucket {
  count: number
  resetAt: number
}

const MEMORY_MAX_ENTRIES = 5000
const memoryStore = new Map<string, Bucket>()

/** Increment a counter and set its TTL on first use (atomic on the server). */
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

export function getRedisConfig(): { url: string, token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    return null
  }
  return { url: url.replace(/\/+$/, ''), token }
}

async function incrRedis(key: string, ttlSeconds: number): Promise<number | null> {
  const config = getRedisConfig()
  if (!config) {
    return null
  }

  try {
    const response = await fetch(`${config.url}/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['EVAL', INCR_WITH_TTL, '1', key, String(ttlSeconds)]),
      signal: typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(1500)
        : undefined,
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json() as { result?: unknown }
    const count = Number(data.result)
    return Number.isFinite(count) ? count : null
  }
  catch {
    // Store unreachable - fall back to the in-memory counter.
    return null
  }
}

function pruneMemory(now: number): void {
  if (memoryStore.size <= MEMORY_MAX_ENTRIES) {
    return
  }
  for (const [key, bucket] of memoryStore) {
    if (now >= bucket.resetAt) {
      memoryStore.delete(key)
    }
  }
  // Still oversized (e.g. a burst of unique IPs) - drop the oldest entries.
  if (memoryStore.size > MEMORY_MAX_ENTRIES) {
    const excess = memoryStore.size - MEMORY_MAX_ENTRIES
    let removed = 0
    for (const key of memoryStore.keys()) {
      memoryStore.delete(key)
      if (++removed >= excess) {
        break
      }
    }
  }
}

function incrMemory(key: string, ttlMs: number): number {
  const now = Date.now()
  const existing = memoryStore.get(key)

  if (existing && now < existing.resetAt) {
    existing.count++
    return existing.count
  }

  memoryStore.set(key, { count: 1, resetAt: now + ttlMs })
  pruneMemory(now)
  return 1
}

async function increment(key: string, ttlSeconds: number, ttlMs: number): Promise<number> {
  const fromRedis = await incrRedis(key, ttlSeconds)
  if (fromRedis !== null) {
    return fromRedis
  }
  return incrMemory(key, ttlMs)
}

function secondsUntilEndOfDayUtc(now: number): number {
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)
  return Math.max(1, Math.ceil((endOfDay.getTime() - now) / 1000))
}

/**
 * Check both the per-minute and per-day limits for a client.
 */
export async function checkRateLimit(
  clientId: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now()

  const minuteBucket = Math.floor(now / 60_000)
  const minuteKey = `tinypivot:rl:minute:${clientId}:${minuteBucket}`
  const minuteCount = await increment(minuteKey, 90, 60_000)

  if (minuteCount > config.perMinute) {
    return {
      allowed: false,
      retryAfter: 60,
      reason: `Rate limit exceeded. Max ${config.perMinute} requests per minute.`,
    }
  }

  const day = new Date(now).toISOString().slice(0, 10)
  const dayKey = `tinypivot:rl:day:${clientId}:${day}`
  const dayTtl = secondsUntilEndOfDayUtc(now)
  const dayCount = await increment(dayKey, dayTtl, dayTtl * 1000)

  if (dayCount > config.perDay) {
    return {
      allowed: false,
      retryAfter: dayTtl,
      reason: `Daily limit exceeded. Max ${config.perDay} requests per day.`,
    }
  }

  return { allowed: true }
}
