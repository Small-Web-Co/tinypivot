/**
 * Vercel Serverless Function: Stripe Webhook Handler
 * 
 * This handles successful payments and generates license keys.
 * 
 * Environment Variables needed:
 * - STRIPE_SECRET_KEY: Your Stripe secret key
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_...)
 * - RESEND_API_KEY: (Optional) For sending license emails via Resend
 * 
 * Setup in Stripe Dashboard:
 * 1. Go to Developers → Webhooks
 * 2. Add endpoint: https://your-domain.vercel.app/api/webhook
 * 3. Select event: checkout.session.completed
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// License type codes
const PLAN_CODES: Record<string, string> = {
  single: 'PRO1',
  unlimited: 'PROU',
  team: 'PROT',
}

/**
 * Generate a license key
 * Format: VPG-{TYPE}-{HASH}-{EXPIRY}
 */
function generateLicenseKey(plan: string): string {
  const typeCode = PLAN_CODES[plan] || 'PRO1'

  // License valid for 1 year from now
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  const expiry = expiryDate.toISOString().slice(0, 10).replace(/-/g, '')

  // Generate hash
  const hashInput = `${typeCode}-${expiry}`
  let hash = 0
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  const hashStr = Math.abs(hash).toString(16).toUpperCase().slice(0, 8).padStart(8, '0')

  return `VPG-${typeCode}-${hashStr}-${expiry}`
}

/**
 * Send license email (using Resend, or adapt for your email provider)
 */
async function sendLicenseEmail(email: string, licenseKey: string, plan: string): Promise<void> {
  // Option 1: Using Resend (recommended)
  if (process.env.RESEND_API_KEY) {
    const planNames: Record<string, string> = {
      single: 'Single Project',
      unlimited: 'Unlimited Projects',
      team: 'Team License',
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vue Pivot Grid <license@vue-pivot-grid.dev>',
        to: email,
        subject: 'Your Vue Pivot Grid Pro License',
        html: `
          <h1>Thank you for purchasing Vue Pivot Grid Pro!</h1>
          <p>Here is your license key for the <strong>${planNames[plan] || plan}</strong> plan:</p>
          <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-size: 18px; font-family: monospace;">
${licenseKey}
          </pre>
          <h2>How to use your license:</h2>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; font-size: 14px;">
import { setLicenseKey } from 'vue-pivot-grid'

setLicenseKey('${licenseKey}')
          </pre>
          <p>Your license is valid for 1 year of updates. After that, you can continue using the version you have, or renew for continued updates.</p>
          <p>If you have any questions, reply to this email.</p>
          <p>Happy coding!</p>
        `,
      }),
    })
  }
  else {
    // Log for manual fulfillment if no email service configured
    console.log('LICENSE GENERATED:', { email, licenseKey, plan })
  }
}

export const config = {
  api: {
    bodyParser: false, // Required for webhook signature verification
  },
}

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const signature = req.headers['stripe-signature'] as string

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  }
  catch (err) {
    console.error('Webhook signature verification failed:', err)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    const email = session.customer_details?.email
    const plan = session.metadata?.plan || 'single'

    if (email) {
      const licenseKey = generateLicenseKey(plan)
      await sendLicenseEmail(email, licenseKey, plan)
      console.log(`License sent to ${email}: ${licenseKey}`)
    }
  }

  return res.status(200).json({ received: true })
}

