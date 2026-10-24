/**
 * Shared helpers for the TinyPivot Vercel API functions.
 *
 * Files under `api/_lib/` are bundled into the functions that import them and
 * are not exposed as routes (Vercel ignores paths starting with `_`).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Origins allowed to call the API from a browser.
 *
 * `ALLOWED_ORIGINS` (comma-separated) is appended, and the origin of
 * `BASE_URL` is added automatically, so the deployment that serves the demo
 * keeps working without extra configuration.
 */
const DEFAULT_ORIGINS = [
  'https://tiny-pivot.com',
  'https://www.tiny-pivot.com',
  'https://tinypivot.com',
  'https://www.tinypivot.com',
  'https://vue-pivot-grid.vercel.app',
  'https://small-web-co.github.io',
]

/** Local development origins (any port). */
const DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

function toOrigin(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  try {
    return new URL(value).origin
  }
  catch {
    return null
  }
}

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>(DEFAULT_ORIGINS)

  const baseUrlOrigin = toOrigin(process.env.BASE_URL)
  if (baseUrlOrigin) {
    origins.add(baseUrlOrigin)
  }

  for (const entry of (process.env.ALLOWED_ORIGINS ?? '').split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) {
      continue
    }
    // Accept either a full URL or a bare origin.
    origins.add(toOrigin(trimmed) ?? trimmed)
  }

  return [...origins]
}

export function isOriginAllowed(origin: string): boolean {
  return DEV_ORIGIN.test(origin) || getAllowedOrigins().includes(origin)
}

/**
 * The host the request was addressed to (proxy-aware).
 */
function getRequestHost(req: VercelRequest): string | null {
  const forwardedHost = req.headers['x-forwarded-host']
  const host = typeof forwardedHost === 'string' ? forwardedHost : req.headers.host
  if (typeof host !== 'string' || !host) {
    return null
  }
  return host.split(',')[0].trim()
}

/**
 * Whether `origin` is the same host that served this request.
 *
 * This makes every deployment domain work out of the box (custom domains and
 * preview URLs) without opening the endpoint to third-party origins.
 */
export function isSameOriginRequest(origin: string, req: VercelRequest): boolean {
  const host = getRequestHost(req)
  if (!host) {
    return false
  }
  try {
    return new URL(origin).host === host
  }
  catch {
    return false
  }
}

export interface CorsResult {
  /** `true` when the request may proceed. */
  allowed: boolean
  /** The request's Origin header, when present. */
  origin: string | null
  /** `true` when the request comes from the host serving it. */
  sameOrigin: boolean
}

/**
 * Apply CORS headers and decide whether a browser request may proceed.
 *
 * Requests without an `Origin` header (server-to-server, curl, webhooks) are
 * allowed; browser requests from unknown origins are rejected.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): CorsResult {
  const originHeader = req.headers.origin
  const origin = typeof originHeader === 'string' ? originHeader : null

  res.setHeader('Vary', 'Origin')

  if (!origin) {
    return { allowed: true, origin: null, sameOrigin: true }
  }

  if (isSameOriginRequest(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
    return { allowed: true, origin, sameOrigin: true }
  }

  if (!isOriginAllowed(origin)) {
    return { allowed: false, origin, sameOrigin: false }
  }

  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')

  return { allowed: true, origin, sameOrigin: false }
}

/**
 * Respond to a CORS preflight request.
 */
export function handlePreflight(res: VercelResponse): VercelResponse {
  return res.status(204).end()
}

/**
 * Reject a browser request that comes from an origin we do not serve.
 */
export function rejectDisallowedOrigin(res: VercelResponse): VercelResponse {
  return res.status(403).json({ error: 'Origin not allowed' })
}

/**
 * Resolve the client IP used for rate limiting.
 *
 * Client-supplied `x-forwarded-for` values are only trusted when we know a
 * trusted proxy sets them: on Vercel (platform-controlled headers) or when
 * `TRUST_PROXY_HEADERS=1` is set explicitly. Otherwise the socket address is
 * used, so a caller cannot rotate headers to dodge the limiter.
 */
export function getClientIP(req: VercelRequest): string {
  if (process.env.VERCEL) {
    const realIp = req.headers['x-real-ip']
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim()
    }
    const vercelForwarded = req.headers['x-vercel-forwarded-for']
    if (typeof vercelForwarded === 'string' && vercelForwarded.trim()) {
      return vercelForwarded.split(',')[0].trim()
    }
  }

  if (process.env.TRUST_PROXY_HEADERS === '1') {
    const realIp = req.headers['x-real-ip']
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim()
    }
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      // The last hop is the one appended by the trusted proxy.
      const hops = forwarded.split(',').map(part => part.trim()).filter(Boolean)
      if (hops.length > 0) {
        return hops[hops.length - 1]
      }
    }
  }

  return req.socket?.remoteAddress || 'unknown'
}
