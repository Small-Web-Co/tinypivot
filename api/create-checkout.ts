/**
 * Vercel Serverless Function: Create Stripe Checkout Session
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { applyCors, getClientIP, handlePreflight, rejectDisallowedOrigin } from './_lib/http.js'
import { checkRateLimit } from './_lib/rate-limit.js'

interface PlanConfig {
  priceId: string | undefined
  mode: 'payment' | 'subscription'
  cancelPath: string
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

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY')
    return res.status(500).json({ error: 'Server configuration error: Missing Stripe key' })
  }

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

  const PLANS: Record<string, PlanConfig> = {
    // TinyPivot UI Library (one-time perpetual commercial licenses)
    single: {
      priceId: process.env.STRIPE_PRICE_SINGLE || 'price_1SZZLxBMwUz92tuidNM2wzOn',
      mode: 'payment',
      cancelPath: '/#pricing',
    },
    unlimited: {
      priceId: process.env.STRIPE_PRICE_UNLIMITED || 'price_1SZZMFBMwUz92tuiMy5AZ4xD',
      mode: 'payment',
      cancelPath: '/#pricing',
    },
    team: {
      priceId: process.env.STRIPE_PRICE_TEAM || 'price_1SZZMWBMwUz92tuibrSiGNhb',
      mode: 'payment',
      cancelPath: '/#pricing',
    },

    // TinyPivot MCP (choose Subscription or Lifetime)
    mcp_pro_monthly: {
      priceId: process.env.STRIPE_PRICE_MCP_PRO_MONTHLY || 'price_1UfR6hBMwUz92tui4vtPTgzb',
      mode: 'subscription',
      cancelPath: '/mcp#pricing',
    },
    mcp_pro_yearly: {
      priceId: process.env.STRIPE_PRICE_MCP_PRO_YEARLY || 'price_1UfR6nBMwUz92tuiR83KcMYF',
      mode: 'subscription',
      cancelPath: '/mcp#pricing',
    },
    mcp_pro_lifetime: {
      priceId: process.env.STRIPE_PRICE_MCP_PRO_LIFETIME || 'price_1UfR6qBMwUz92tuiDxhVk2PD',
      mode: 'payment',
      cancelPath: '/mcp#pricing',
    },
    mcp_team_monthly: {
      priceId: process.env.STRIPE_PRICE_MCP_TEAM_MONTHLY || 'price_1UfR6wBMwUz92tuic7EMgc3p',
      mode: 'subscription',
      cancelPath: '/mcp#pricing',
    },
    mcp_team_yearly: {
      priceId: process.env.STRIPE_PRICE_MCP_TEAM_YEARLY || 'price_1UfR73BMwUz92tuiNd8bx6A7',
      mode: 'subscription',
      cancelPath: '/mcp#pricing',
    },
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    })

    const { plan } = req.body as { plan: string }
    const planConfig = plan ? PLANS[plan] : undefined

    if (!plan || !planConfig || !planConfig.priceId) {
      console.error('Invalid plan or missing price:', { plan })
      return res.status(400).json({ error: `Invalid plan: ${plan}` })
    }

    const baseUrl = process.env.BASE_URL || 'https://tiny-pivot.com'

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: planConfig.mode,
      payment_method_types: ['card'],
      automatic_tax: {
        enabled: true,
      },
      tax_id_collection: {
        enabled: true,
      },
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(plan)}`,
      cancel_url: `${baseUrl}${planConfig.cancelPath}`,
      metadata: {
        plan,
      },
    }

    if (planConfig.mode === 'payment') {
      sessionParams.invoice_creation = { enabled: true }
    }
    else {
      sessionParams.subscription_data = {
        metadata: { plan },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return res.status(200).json({ url: session.url })
  }
  catch (error) {
    console.error('Stripe error:', error)
    return res.status(500).json({ error: 'Could not create checkout session' })
  }
}
