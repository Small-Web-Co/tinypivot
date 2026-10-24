/**
 * Vercel Serverless Function: Create Stripe Checkout Session
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { applyCors, getClientIP, handlePreflight, rejectDisallowedOrigin } from './_lib/http.js'
import { checkRateLimit } from './_lib/rate-limit.js'

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

  // Check environment variables
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY')
    return res.status(500).json({ error: 'Server configuration error: Missing Stripe key' })
  }

  // Generous limit: a real shopper only needs a handful of sessions.
  const rateCheck = await checkRateLimit(getClientIP(req), {
    perMinute: Number(process.env.CHECKOUT_RATE_LIMIT_PER_MINUTE) || 20,
    perDay: Number(process.env.CHECKOUT_RATE_LIMIT_DAILY) || 200,
  })

  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter))
    return res.status(429).json({
      error: rateCheck.reason,
      retryAfter: rateCheck.retryAfter,
    })
  }

  const PRICES: Record<string, string | undefined> = {
    single: process.env.STRIPE_PRICE_SINGLE,
    unlimited: process.env.STRIPE_PRICE_UNLIMITED,
    team: process.env.STRIPE_PRICE_TEAM,
  }
  const VALID_PLANS = new Set(Object.keys(PRICES))

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })

    const { plan } = req.body as { plan: string }
    console.log('Received plan:', plan)

    if (!plan || !VALID_PLANS.has(plan) || !PRICES[plan]) {
      console.error('Invalid plan or missing price:', { plan, price: PRICES[plan] })
      return res.status(400).json({ error: `Invalid plan: ${plan}` })
    }

    const priceId = PRICES[plan]
    if (!priceId) {
      console.error('Price ID not configured for plan:', plan)
      return res.status(500).json({ error: `Price not configured for plan: ${plan}` })
    }

    console.log('Creating checkout session with price:', priceId)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3000'}/#pricing`,
      metadata: {
        plan,
      },
    })

    console.log('Checkout session created:', session.id)
    return res.status(200).json({ url: session.url })
  }
  catch (error) {
    console.error('Stripe error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: `Stripe error: ${message}` })
  }
}
