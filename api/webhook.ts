/**
 * Vercel Serverless Function: Stripe Webhook Handler
 *
 * This handles successful payments and generates license keys.
 *
 * Environment Variables needed:
 * - STRIPE_SECRET_KEY: Your Stripe secret key
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret (whsec_...)
 * - LICENSE_PRIVATE_KEY: ECDSA P-256 private key (PEM format) for signing licenses
 * - RESEND_API_KEY: (Optional) For sending license emails via Resend
 * - STRIPE_PRICE_SINGLE / STRIPE_PRICE_UNLIMITED / STRIPE_PRICE_TEAM: Price IDs,
 *   used to verify that the purchased line item matches the plan
 * - SKIP_PRICE_VERIFICATION=1: fulfill paid checkouts even when the line item
 *   does not match the configured price (escape hatch for legacy/manual prices)
 * - ALLOW_UNVERIFIED_WEBHOOKS=1: (Local development only) skip signature
 *   verification because `vercel dev` rewrites the request body
 *
 * Setup in Stripe Dashboard:
 * 1. Go to Developers → Webhooks
 * 2. Add endpoint: https://your-domain.vercel.app/api/webhook
 * 3. Select event: checkout.session.completed
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { signLicensePayload } from './_lib/license'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

// License type codes
const PLAN_CODES: Record<string, string> = {
  single: 'PRO1',
  unlimited: 'PROU',
  team: 'PROT',
}

// Price IDs per plan, used to verify the purchased line item.
const PLAN_PRICES: Record<string, string | undefined> = {
  single: process.env.STRIPE_PRICE_SINGLE,
  unlimited: process.env.STRIPE_PRICE_UNLIMITED,
  team: process.env.STRIPE_PRICE_TEAM,
}

/**
 * Generate a cryptographically signed license key
 * Format: TP-{TYPE}-{SIGNATURE}-{EXPIRY}
 *
 * Uses ECDSA P-256 asymmetric cryptography:
 * - Private key (in env) signs licenses
 * - Public key (in library) verifies them
 *
 * Licenses are PERPETUAL
 */
async function generateLicenseKey(plan: string): Promise<string> {
  const typeCode = PLAN_CODES[plan] || 'PRO1'

  // Keep the key format stable while making the lifetime nature of the license explicit.
  const expiry = '20991231'

  const payload = `TP-${typeCode}-${expiry}`
  const signature = await signLicensePayload(payload)

  return `TP-${typeCode}-${signature}-${expiry}`
}

// Local development detection (only affects the email sender/subject)
const isDev = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production'

/**
 * Signature verification is fail-closed: it is skipped only when an operator
 * explicitly opts in with ALLOW_UNVERIFIED_WEBHOOKS=1 on a deployment that is
 * not Vercel production or preview.
 */
const allowUnverifiedWebhook
  = process.env.ALLOW_UNVERIFIED_WEBHOOKS === '1'
    && process.env.VERCEL_ENV !== 'production'
    && process.env.VERCEL_ENV !== 'preview'

/**
 * Send license email via Resend
 */
async function sendLicenseEmail(email: string, licenseKey: string, plan: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set - logging license for manual fulfillment')
    console.log('LICENSE GENERATED:', { email, licenseKey, plan })
    return false
  }

  const planNames: Record<string, string> = {
    single: 'Single Project',
    unlimited: 'Unlimited Projects',
    team: 'Team License',
  }

  // Use test sender in dev (no domain verification needed)
  const fromAddress = isDev
    ? 'TinyPivot <onboarding@resend.dev>'
    : 'TinyPivot <license@tiny-pivot.com>'

  const subjectPrefix = isDev ? '[TEST] ' : ''

  try {
    console.log(`📧 Sending license email to ${email}... (${isDev ? 'DEV MODE' : 'PRODUCTION'})`)

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject: `${subjectPrefix}Your TinyPivot Pro License`,
        html: `
          <h1>Thank you for purchasing TinyPivot Pro!</h1>
          <p>Here is your license key for the <strong>${planNames[plan] || plan}</strong> plan:</p>
          <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-size: 18px; font-family: monospace;">
${licenseKey}
          </pre>
          <h2>How to use your license:</h2>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; font-size: 14px;">
import { setLicenseKey } from '@smallwebco/tinypivot-react' // or '@smallwebco/tinypivot-vue'

setLicenseKey('${licenseKey}')
          </pre>
          <p>Your TinyPivot Pro license is perpetual. Add it once at app startup and you're set.</p>
          <p>If you have any questions, reply to this email.</p>
          <p>Happy coding!</p>
        `,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Resend API error:', result)
      return false
    }

    console.log(`✅ Email sent successfully! ID: ${result.id}`)
    return true
  }
  catch (error) {
    console.error('❌ Failed to send email:', error)
    return false
  }
}

/**
 * Verify that a checkout session was actually paid and that the purchased
 * line item matches the plan recorded in metadata.
 */
async function verifyPaidCheckout(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean, reason?: string }> {
  if (session.payment_status !== 'paid') {
    return { ok: false, reason: `payment_status is "${session.payment_status}"` }
  }

  const plan = session.metadata?.plan
  if (!plan || !Object.hasOwn(PLAN_CODES, plan)) {
    return { ok: false, reason: 'missing or unknown plan metadata' }
  }

  const expectedPrice = PLAN_PRICES[plan]
  if (!expectedPrice || process.env.SKIP_PRICE_VERIFICATION === '1') {
    // Price ID not configured (or verification disabled) - we cannot verify,
    // but do not block fulfillment.
    return { ok: true }
  }

  try {
    const full = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items'],
    })
    const priceIds = (full.line_items?.data ?? [])
      .map(item => item.price?.id)
      .filter((id): id is string => Boolean(id))

    if (!priceIds.includes(expectedPrice)) {
      return { ok: false, reason: `line item does not match the "${plan}" price` }
    }
  }
  catch (error) {
    // A transient Stripe API failure must not deny a paying customer.
    console.error('⚠️ Could not verify checkout line items:', error)
  }

  return { ok: true }
}

export const config = {
  api: {
    bodyParser: false, // Required for webhook signature verification
  },
}

/**
 * Get raw body for Stripe webhook signature verification.
 *
 * CRITICAL: The body must be the exact original bytes from Stripe.
 * Re-serializing via JSON.stringify() breaks signatures because:
 * - Forward slashes: \/ becomes /
 * - Number formatting may change (1.0 → 1)
 * - Unicode escaping differences
 */
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  // If body is already a string or Buffer (bodyParser: false working correctly)
  if (typeof req.body === 'string') {
    return Buffer.from(req.body)
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body
  }

  // Read from stream (primary path for Vercel production with bodyParser: false)
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', reject)

    setTimeout(() => {
      if (chunks.length === 0) {
        reject(new Error('Request body timeout - stream was empty (body may have been consumed by parser)'))
      }
    }, 10000)
  })

  if (buf.length > 0) {
    return buf
  }

  // Stream was empty — body was already consumed by Vercel's parser.
  // This should not happen when bodyParser: false is set correctly.
  // Log a warning so we can detect this in production logs.
  if (req.body && typeof req.body === 'object') {
    console.warn('⚠️ Raw body stream was empty — Vercel body parser may be active despite bodyParser: false config. Falling back to JSON.stringify which may break signature verification.')
    return Buffer.from(JSON.stringify(req.body))
  }

  throw new Error('No request body available')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let event: Stripe.Event

  if (allowUnverifiedWebhook) {
    console.log('🔧 DEV MODE: Skipping signature verification (ALLOW_UNVERIFIED_WEBHOOKS=1)')

    // Get the body - either already parsed or from stream
    let body: unknown
    if (req.body && typeof req.body === 'object') {
      body = req.body
    }
    else {
      const rawBody = await getRawBody(req)
      body = JSON.parse(rawBody.toString())
    }

    event = body as Stripe.Event
    console.log(`📥 Received webhook: ${event.type}`)
  }
  else {
    // Production: verify signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET is not configured')
      return res.status(500).json({ error: 'Webhook not configured' })
    }

    const signature = req.headers['stripe-signature'] as string
    console.log(`🔍 req.body type: ${typeof req.body}, isBuffer: ${Buffer.isBuffer(req.body)}, isNull: ${req.body === null}, isUndefined: ${req.body === undefined}`)

    if (!signature) {
      console.error('❌ No stripe-signature header')
      return res.status(400).json({ error: 'Missing stripe-signature header' })
    }

    let rawBody: Buffer
    try {
      rawBody = await getRawBody(req)
      console.log(`📥 Received webhook body (${rawBody.length} bytes), first 100 chars: ${rawBody.toString('utf8').slice(0, 100)}`)
    }
    catch (err) {
      console.error('❌ Failed to read request body:', err)
      return res.status(400).json({ error: 'Failed to read request body' })
    }

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      )
      console.log(`✅ Webhook verified: ${event.type}`)
    }
    catch (err) {
      console.error('❌ Webhook signature verification failed:', err)
      return res.status(400).json({ error: 'Invalid signature' })
    }
  }

  const isPaidCheckoutEvent
    = event.type === 'checkout.session.completed'
      || event.type === 'checkout.session.async_payment_succeeded'

  if (isPaidCheckoutEvent) {
    const session = event.data.object as Stripe.Checkout.Session

    // Only process TinyPivot checkouts — must have a known "plan" metadata key
    // (other products on this Stripe account use different metadata like "clerkUserId")
    const plan = session.metadata?.plan
    if (!plan || !Object.hasOwn(PLAN_CODES, plan)) {
      console.log('Ignoring checkout event: not a TinyPivot purchase (missing or unknown "plan" metadata)')
      return res.status(200).json({ received: true })
    }

    const verdict = await verifyPaidCheckout(session)
    if (!verdict.ok) {
      // Do not issue a license. Stripe sends checkout.session.async_payment_succeeded
      // once a delayed payment actually clears.
      console.warn(
        `⚠️ Not issuing a license for session ${session.id}: ${verdict.reason}.`
        + ` Customer: ${session.customer_details?.email ?? 'unknown'}`,
      )
      return res.status(200).json({ received: true })
    }

    const email = session.customer_details?.email

    if (email) {
      const licenseKey = await generateLicenseKey(plan)
      const emailSent = await sendLicenseEmail(email, licenseKey, plan)
      console.log(`📋 License: ${licenseKey} | Email: ${email} | Sent: ${emailSent ? 'YES' : 'NO'}`)
    }
    else {
      console.error('⚠️ No email found in checkout session!')
    }
  }

  return res.status(200).json({ received: true })
}
