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
 *
 * Setup in Stripe Dashboard:
 * 1. Go to Developers → Webhooks
 * 2. Add endpoint: https://your-domain.vercel.app/api/webhook
 * 3. Select event: checkout.session.completed
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SubscriptionLike } from './_lib/renewal.js'
import Stripe from 'stripe'
import { claimEvent } from './_lib/idempotency.js'
import { expiryAfter, mintLicenseKey, PERPETUAL_EXPIRY } from './_lib/license.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

// License type codes (UI Library keys stay TP-PRO*, MCP keys use TP-MCP*)
const PLAN_CODES: Record<string, string> = {
  single: 'PRO1',
  unlimited: 'PROU',
  team: 'PROT',
  mcp_pro_yearly: 'MCPP',
  mcp_pro_lifetime: 'MCPP',
  mcp_team_yearly: 'MCPT',
}

const VALID_PLANS = new Set(Object.keys(PLAN_CODES))

// Price IDs per plan, used to verify the purchased line item.
const PLAN_PRICES: Record<string, string | undefined> = {
  single: process.env.STRIPE_PRICE_SINGLE || 'price_1SZZLxBMwUz92tuidNM2wzOn',
  unlimited: process.env.STRIPE_PRICE_UNLIMITED || 'price_1SZZMFBMwUz92tuiMy5AZ4xD',
  team: process.env.STRIPE_PRICE_TEAM || 'price_1SZZMWBMwUz92tuibrSiGNhb',
  mcp_pro_yearly: process.env.STRIPE_PRICE_MCP_PRO_YEARLY || 'price_1UfR6nBMwUz92tuiR83KcMYF',
  mcp_pro_lifetime: process.env.STRIPE_PRICE_MCP_PRO_LIFETIME || 'price_1UfRhNBMwUz92tuiDxc0F0Ht',
  mcp_team_yearly: process.env.STRIPE_PRICE_MCP_TEAM_YEARLY || 'price_1UfR73BMwUz92tuiNd8bx6A7',
}

/** The purchase a key belongs to and when it ends: yearly keys run to the paid period's end plus grace. */
async function licenseTerms(plan: string, session: Stripe.Checkout.Session): Promise<{ licenseId?: string, expiry: string }> {
  if (!plan.startsWith('mcp_'))
    return { expiry: PERPETUAL_EXPIRY }
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!subscriptionId) {
    const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
    return { licenseId: paymentId ?? undefined, expiry: PERPETUAL_EXPIRY }
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as unknown as SubscriptionLike
  const periodEnd = subscription.current_period_end ?? subscription.items.data[0]?.current_period_end
  // If Stripe has no period yet, a year from now; the MCP server renews it from the subscription anyway.
  return { licenseId: subscriptionId, expiry: expiryAfter(periodEnd ?? Math.floor(Date.now() / 1000) + 365 * 86_400) }
}

/**
 * A signed key (ECDSA P-256; the public key ships in the library). UI library keys are perpetual;
 * MCP keys carry the Stripe subscription or payment they belong to, and yearly ones an end date.
 */
async function generateLicenseKey(plan: string, session: Stripe.Checkout.Session): Promise<string> {
  const { licenseId, expiry } = await licenseTerms(plan, session)
  return mintLicenseKey(PLAN_CODES[plan] || 'PRO1', expiry, licenseId)
}

// Local development detection (only affects the email sender/subject)
const isDev = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production'

// Local development escape hatch (never active on Vercel production/preview).
const allowUnverifiedWebhook
  = process.env.ALLOW_UNVERIFIED_WEBHOOKS === '1'
    && process.env.VERCEL_ENV !== 'production'
    && process.env.VERCEL_ENV !== 'preview'

/**
 * Mask an email address for logs: first character plus the domain.
 */
function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) {
    return '[redacted]'
  }
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local[0]}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`
}

/**
 * Send license email via Resend
 */
async function sendLicenseEmail(email: string, licenseKey: string, plan: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    // Fallback delivery path when email is not configured.
    console.warn('⚠️ RESEND_API_KEY not set - license NOT emailed. Manual fulfillment required.')
    console.log('LICENSE FOR MANUAL FULFILLMENT:', {
      email: maskEmail(email),
      plan,
      licenseKey,
    })
    return false
  }

  const planNames: Record<string, string> = {
    single: 'TinyPivot UI — Single App',
    unlimited: 'TinyPivot UI — Unlimited Apps',
    team: 'TinyPivot UI — Team License',
    mcp_pro_yearly: 'TinyPivot MCP — Pro (Yearly)',
    mcp_pro_lifetime: 'TinyPivot MCP — Pro (Lifetime)',
    mcp_team_yearly: 'TinyPivot MCP — Team 5 Seats (Yearly)',
  }
  const isMcpPlan = plan.startsWith('mcp_')
  const isPerpetual = !isMcpPlan || plan === 'mcp_pro_lifetime'

  // Use test sender in dev (no domain verification needed)
  const fromAddress = isDev
    ? 'TinyPivot <onboarding@resend.dev>'
    : 'TinyPivot <license@tiny-pivot.com>'

  const subjectPrefix = isDev ? '[TEST] ' : ''

  const usageHtml = isMcpPlan
    ? `
          <h2>1-Command Setup for Your AI Harnesses:</h2>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; font-size: 13px; overflow-x: auto;">
npx @smallwebco/tinypivot-mcp@latest init --license=${licenseKey}
          </pre>
          <p>Or set <code>TINYPIVOT_LICENSE_KEY</code> in your MCP config's <code>env</code> block and restart your AI harness (Antigravity, Claude Code, Claude Desktop, Cursor, OpenCode, Codex CLI, or pi).</p>
          <p>This unlocks unlimited rows, all 10 visual themes, double-click drill-through, advanced aggregations, styled <code>.xlsx</code> exports, and direct read-only queries to Snowflake, BigQuery, Databricks, ClickHouse, MySQL and Postgres.</p>
    `
    : `
          <h2>How to use your license:</h2>
          <pre style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px; font-size: 14px;">
import { setLicenseKey } from '@smallwebco/tinypivot-react' // or '@smallwebco/tinypivot-vue'

setLicenseKey('${licenseKey}')
          </pre>
    `

  const footerNote = isPerpetual
    ? `<p>Your ${planNames[plan] || 'TinyPivot Pro'} license is perpetual. Add it once and you're set.</p>`
    : `<p>Your ${planNames[plan] || 'TinyPivot MCP'} subscription is active. The key covers the year you paid for, and TinyPivot renews it automatically while the subscription stays active, so you never need to paste a new one. Manage billing or invoices anytime from your Stripe receipt link.</p>`

  try {
    console.log(`📧 Sending license email to ${maskEmail(email)}... (${isDev ? 'DEV MODE' : 'PRODUCTION'})`)

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject: `${subjectPrefix}Your ${isMcpPlan ? 'TinyPivot MCP' : 'TinyPivot Pro'} License`,
        html: `
          <h1>Thank you for choosing TinyPivot!</h1>
          <p>Here is your license key for the <strong>${planNames[plan] || plan}</strong> plan:</p>
          <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-size: 16px; font-family: monospace; word-break: break-all;">
${licenseKey}
          </pre>
          ${usageHtml}
          ${footerNote}
          <p>If you have any questions, reply to this email.</p>
          <p>Happy analyzing!</p>
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
  if (!plan || !VALID_PLANS.has(plan)) {
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
      console.log(`📥 Received webhook body (${rawBody.length} bytes)`)
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
    // Stripe retries deliveries: only issue a license once per event.
    const isFirstDelivery = await claimEvent(event.id)
    if (!isFirstDelivery) {
      console.log(`Ignoring duplicate webhook event: ${event.id}`)
      return res.status(200).json({ received: true, duplicate: true })
    }

    const session = event.data.object as Stripe.Checkout.Session

    // Only process TinyPivot checkouts — must have a known "plan" metadata key
    // (other products on this Stripe account use different metadata like "clerkUserId")
    const plan = session.metadata?.plan
    if (!plan || !VALID_PLANS.has(plan)) {
      console.log('Ignoring checkout event: not a TinyPivot purchase (missing or unknown "plan" metadata)')
      return res.status(200).json({ received: true })
    }

    const verdict = await verifyPaidCheckout(session)
    if (!verdict.ok) {
      // Do not issue a license. Stripe sends checkout.session.async_payment_succeeded
      // once a delayed payment actually clears.
      console.warn(
        `⚠️ Not issuing a license for session ${session.id}: ${verdict.reason}.`
        + ` Customer: ${session.customer_details?.email ? maskEmail(session.customer_details.email) : 'unknown'}`,
      )
      return res.status(200).json({ received: true })
    }

    const email = session.customer_details?.email

    if (email) {
      const licenseKey = await generateLicenseKey(plan, session)
      const emailSent = await sendLicenseEmail(email, licenseKey, plan)
      console.log(`📋 License issued | Session: ${session.id} | Plan: ${plan} | Email: ${maskEmail(email)} | Sent: ${emailSent ? 'YES' : 'NO'}`)
    }
    else {
      console.error('⚠️ No email found in checkout session!')
    }
  }

  return res.status(200).json({ received: true })
}
