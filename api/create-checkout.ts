/**
 * Vercel Serverless Function: Create Stripe Checkout Session
 * 
 * Deploy this to Vercel or adapt for Netlify/Cloudflare Workers
 * 
 * Environment Variables needed:
 * - STRIPE_SECRET_KEY: Your Stripe secret key (sk_live_...)
 * - STRIPE_PRICE_SINGLE: Price ID for single project license
 * - STRIPE_PRICE_UNLIMITED: Price ID for unlimited projects license
 * - STRIPE_PRICE_TEAM: Price ID for team license
 * - BASE_URL: Your site URL (e.g., https://vue-pivot-grid.dev)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

const PRICES: Record<string, string> = {
  single: process.env.STRIPE_PRICE_SINGLE!,
  unlimited: process.env.STRIPE_PRICE_UNLIMITED!,
  team: process.env.STRIPE_PRICE_TEAM!,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { plan } = req.body as { plan: string }

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: 'Invalid plan' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICES[plan],
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/#pricing`,
      metadata: {
        plan,
      },
    })

    return res.status(200).json({ url: session.url })
  }
  catch (error) {
    console.error('Stripe error:', error)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}

