/**
 * Vercel Serverless Function: Create Stripe Checkout Session
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

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

  // Check environment variables
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY')
    return res.status(500).json({ error: 'Server configuration error: Missing Stripe key' })
  }

  const PRICES: Record<string, string | undefined> = {
    single: process.env.STRIPE_PRICE_SINGLE,
    unlimited: process.env.STRIPE_PRICE_UNLIMITED,
    team: process.env.STRIPE_PRICE_TEAM,
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })

    const { plan } = req.body as { plan: string }
    console.log('Received plan:', plan)

    if (!plan || !PRICES[plan]) {
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
