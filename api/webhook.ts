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
  apiVersion: '2025-02-24.acacia',
})

// License type codes
const PLAN_CODES: Record<string, string> = {
  single: 'PRO1',
  unlimited: 'PROU',
  team: 'PROT',
}

/**
 * Generate a cryptographically signed license key
 * Format: TP-{TYPE}-{SIGNATURE}-{EXPIRY}
 *
 * Uses ECDSA P-256 asymmetric cryptography:
 * - Private key (in env) signs licenses
 * - Public key (in library) verifies them
 *
 * Licenses are PERPETUAL - the expiry date only affects update eligibility
 */
async function generateLicenseKey(plan: string): Promise<string> {
  const typeCode = PLAN_CODES[plan] || 'PRO1'

  // License update eligibility for 1 year from now
  // Note: Licenses are PERPETUAL - features never expire
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  const expiry = expiryDate.toISOString().slice(0, 10).replace(/-/g, '')

  const privateKeyPem = process.env.LICENSE_PRIVATE_KEY
  if (!privateKeyPem) {
    throw new Error('LICENSE_PRIVATE_KEY environment variable is required')
  }

  const payload = `TP-${typeCode}-${expiry}`

  // Import private key for signing
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const encoder = new TextEncoder()
  const msgData = encoder.encode(payload)

  const rawSignature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    msgData,
  )

  // Convert raw signature (r || s) to DER format for compatibility with Node.js verification
  const derSignature = rawToDer(new Uint8Array(rawSignature))

  // Convert to URL-safe base64 (replace +/ with -_)
  const sigBase64 = btoa(String.fromCharCode.apply(null, Array.from(derSignature)))
  const safeSig = sigBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `TP-${typeCode}-${safeSig}-${expiry}`
}

/**
 * Concatenate byte arrays
 */
function concatBytes(prefix: number[], arr: Uint8Array): Uint8Array {
  const result = new Uint8Array(prefix.length + arr.length)
  result.set(prefix, 0)
  result.set(arr, prefix.length)
  return result
}

/**
 * Convert raw ECDSA signature (r || s) to DER format
 * DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
 */
function rawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32)
  const s = raw.slice(32, 64)

  // Add leading zero if high bit is set (to indicate positive integer)
  const rPadded = r[0] >= 0x80 ? concatBytes([0], r) : r
  const sPadded = s[0] >= 0x80 ? concatBytes([0], s) : s

  // Remove leading zeros (except one if needed for sign)
  const rTrimmed = trimLeadingZeros(rPadded)
  const sTrimmed = trimLeadingZeros(sPadded)

  const totalLen = 2 + rTrimmed.length + 2 + sTrimmed.length

  const der = new Uint8Array(2 + totalLen)
  let offset = 0

  der[offset++] = 0x30 // SEQUENCE
  der[offset++] = totalLen
  der[offset++] = 0x02 // INTEGER
  der[offset++] = rTrimmed.length
  der.set(rTrimmed, offset)
  offset += rTrimmed.length
  der[offset++] = 0x02 // INTEGER
  der[offset++] = sTrimmed.length
  der.set(sTrimmed, offset)

  return der
}

function trimLeadingZeros(arr: Uint8Array): Uint8Array {
  let start = 0
  while (start < arr.length - 1 && arr[start] === 0 && arr[start + 1] < 0x80) {
    start++
  }
  return arr.slice(start)
}

// Check if running in development
const isDev = process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production'

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
import { setLicenseKey } from 'tinypivot'

setLicenseKey('${licenseKey}')
          </pre>
          <p>Your license is valid for 1 year of updates. After that, you can continue using the version you have, or renew for continued updates.</p>
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

export const config = {
  api: {
    bodyParser: false, // Required for webhook signature verification
  },
}

/**
 * Get raw body - handles both Vercel production and vercel dev
 */
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  // If body was already parsed (vercel dev sometimes does this), stringify it back
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body))
  }

  // Otherwise read from stream (production Vercel)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', reject)

    // Timeout after 10 seconds
    setTimeout(() => {
      if (chunks.length === 0) {
        reject(new Error('Request body timeout'))
      }
    }, 10000)
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let event: Stripe.Event

  // In dev mode, skip signature verification (vercel dev mangles the body)
  // This is safe because we're using Stripe CLI locally
  if (isDev) {
    console.log('🔧 DEV MODE: Skipping signature verification')

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
    const signature = req.headers['stripe-signature'] as string

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
        process.env.STRIPE_WEBHOOK_SECRET!,
      )
      console.log(`✅ Webhook verified: ${event.type}`)
    }
    catch (err) {
      console.error('❌ Webhook signature verification failed:', err)
      return res.status(400).json({ error: 'Invalid signature' })
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    const email = session.customer_details?.email
    const plan = session.metadata?.plan || 'single'

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
