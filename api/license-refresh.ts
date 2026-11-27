/**
 * Vercel Serverless Function: renew a yearly TinyPivot MCP key.
 *
 * POST { key, install? } -> { key, seats? } | { message }
 * Called by the MCP server at most once a day (Team keys) or in a key's last month (Pro yearly).
 * See api/_lib/renewal.ts.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SubscriptionLike } from './_lib/renewal.js'
import Stripe from 'stripe'
import { getClientIP } from './_lib/http.js'
import { checkRateLimit } from './_lib/rate-limit.js'
import { renewLicense } from './_lib/renewal.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

async function getSubscription(id: string): Promise<SubscriptionLike | null> {
  try {
    return await stripe.subscriptions.retrieve(id) as unknown as SubscriptionLike
  }
  catch (error) {
    if ((error as { code?: string }).code === 'resource_missing')
      return null
    throw error
  }
}

async function setMetadata(id: string, metadata: Record<string, string>): Promise<void> {
  await stripe.subscriptions.update(id, { metadata })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST')
    return res.status(405).json({ message: 'Method not allowed' })

  const rate = await checkRateLimit(`license:${getClientIP(req)}`, { perMinute: 10, perDay: 200 })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter))
    return res.status(429).json({ message: rate.reason })
  }

  const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {}
  try {
    const reply = await renewLicense(body, { getSubscription, setMetadata })
    return res.status(reply.status).json(reply.body)
  }
  catch (error) {
    // Stripe unreachable: the MCP server keeps its key and tries again tomorrow.
    console.error('license-refresh failed:', error)
    return res.status(503).json({ message: 'License check unavailable; try again later.' })
  }
}
