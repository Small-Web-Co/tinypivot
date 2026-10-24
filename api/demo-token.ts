/**
 * Vercel Serverless Function: Mint a short-lived demo token.
 *
 * The public demo unlocks Pro features for evaluation. Instead of shipping a
 * permanent secret inside the JavaScript bundle, the demo asks this endpoint
 * for a signed token that is:
 *
 * - signed with the same ECDSA P-256 key that signs licenses (verified in the
 *   browser with the public key embedded in the library),
 * - bound to the origin that requested it, so it cannot be lifted into a
 *   third-party site,
 * - valid for a limited time (`DEMO_TOKEN_TTL_HOURS`, default 24).
 *
 * Environment Variables:
 * - LICENSE_PRIVATE_KEY: ECDSA P-256 private key (PEM format)
 * - DEMO_TOKEN_TTL_HOURS: Token lifetime in hours (default: 24)
 * - DEMO_TOKEN_RATE_LIMIT_PER_MINUTE / DEMO_TOKEN_RATE_LIMIT_DAILY
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, getClientIP, handlePreflight, isSameOriginRequest, rejectDisallowedOrigin } from './_lib/http.js'
import { base64UrlEncode, signLicensePayload } from './_lib/license.js'
import { checkRateLimit } from './_lib/rate-limit.js'

const TOKEN_PREFIX = 'TPDEMO'
const TOKEN_TTL_MS = (Number(process.env.DEMO_TOKEN_TTL_HOURS) || 24) * 3_600_000

const RATE_LIMIT_PER_MINUTE = Number(process.env.DEMO_TOKEN_RATE_LIMIT_PER_MINUTE) || 20
const RATE_LIMIT_DAILY = Number(process.env.DEMO_TOKEN_RATE_LIMIT_DAILY) || 500

function getOriginFromReferer(req: VercelRequest): string | null {
  const referer = req.headers.referer
  if (typeof referer !== 'string' || !referer) {
    return null
  }
  try {
    return new URL(referer).origin
  }
  catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cors = applyCors(req, res)

  if (!cors.allowed) {
    return rejectDisallowedOrigin(res)
  }

  if (req.method === 'OPTIONS') {
    return handlePreflight(res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.LICENSE_PRIVATE_KEY) {
    console.error('LICENSE_PRIVATE_KEY is not configured')
    return res.status(500).json({ error: 'Demo mode is not configured' })
  }

  // The token is bound to the origin that asked for it. Same-origin POST
  // requests send `Origin`; fall back to `Referer` if a browser omits it.
  let origin = cors.origin
  if (!origin) {
    const refererOrigin = getOriginFromReferer(req)
    if (refererOrigin && isSameOriginRequest(refererOrigin, req)) {
      origin = refererOrigin
    }
  }

  if (!origin) {
    return res.status(403).json({ error: 'Origin required' })
  }

  const rateCheck = await checkRateLimit(`demo-token:${getClientIP(req)}`, {
    perMinute: RATE_LIMIT_PER_MINUTE,
    perDay: RATE_LIMIT_DAILY,
  })

  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter))
    return res.status(429).json({
      error: rateCheck.reason,
      retryAfter: rateCheck.retryAfter,
    })
  }

  try {
    const expiry = Date.now() + TOKEN_TTL_MS
    const payload = `${TOKEN_PREFIX}|${expiry}|${origin}`
    const signature = await signLicensePayload(payload)
    const encodedOrigin = base64UrlEncode(new TextEncoder().encode(origin))
    const token = `${TOKEN_PREFIX}.${expiry}.${encodedOrigin}.${signature}`

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      token,
      expiresAt: new Date(expiry).toISOString(),
    })
  }
  catch (error) {
    console.error('[Demo Token] Error:', error)
    return res.status(500).json({ error: 'Could not create demo token' })
  }
}
