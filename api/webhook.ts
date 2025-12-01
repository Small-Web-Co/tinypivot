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
 * Generate a cryptographically signed license key
 * Format: TP-{TYPE}-{SIGNATURE}-{EXPIRY}
 * 
 * Uses HMAC-SHA256 with a secret key - impossible to forge without the secret
 */
async function generateLicenseKey(plan: string): Promise<string> {
  const typeCode = PLAN_CODES[plan] || 'PRO1'

  // License valid for 1 year from now
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)
  const expiry = expiryDate.toISOString().slice(0, 10).replace(/-/g, '')

  // HMAC-SHA256 signature with secret
  const secret = process.env.LICENSE_SECRET || 'tp-change-this-secret-in-production'
  const payload = `TP-${typeCode}-${expiry}`
  
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const msgData = encoder.encode(payload)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
  const sigArray = Array.from(new Uint8Array(signature))
  const sigStr = sigArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12).toUpperCase()

  return `TP-${typeCode}-${sigStr}-${expiry}`
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
    } else {
      const rawBody = await getRawBody(req)
      body = JSON.parse(rawBody.toString())
    }
    
    event = body as Stripe.Event
    console.log(`📥 Received webhook: ${event.type}`)
  } else {
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

