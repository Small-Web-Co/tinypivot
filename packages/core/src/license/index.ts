/**
 * TinyPivot Core - License Management
 * Framework-agnostic license validation logic
 */
import type { LicenseInfo, LicenseType, LicenseFeatures } from '../types'

const FREE_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: true,
  features: {
    pivot: false,
    advancedAggregations: false,
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
}

const INVALID_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: false,
  features: {
    pivot: false,
    advancedAggregations: false,
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
}

const DEMO_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: true,
  features: {
    pivot: true,
    advancedAggregations: true,
    percentageMode: true,
    sessionPersistence: true,
    noWatermark: false, // Still show watermark in demo
  },
}

/**
 * HMAC-SHA256 based license signature verification
 * Must match the server-side generation algorithm
 */
async function verifySignature(
  typeCode: string,
  signature: string,
  expiry: string
): Promise<boolean> {
  // The secret must be configured before license validation can work
  const secret = (globalThis as Record<string, unknown>).__TP_LICENSE_SECRET__ as string

  if (!secret) {
    console.warn('[TinyPivot] License secret not configured. Call configureLicenseSecret() first.')
    return false
  }

  const payload = `TP-${typeCode}-${expiry}`

  try {
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

    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const sigArray = Array.from(new Uint8Array(sig))
    const expectedSig = sigArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12)
      .toUpperCase()

    return signature === expectedSig
  } catch {
    // Fallback for environments without crypto.subtle (SSR, older browsers)
    return false
  }
}

/**
 * Validate a license key and extract info
 */
export async function validateLicenseKey(key: string): Promise<LicenseInfo> {
  // Free tier - no key needed
  if (!key || key === '') {
    return FREE_LICENSE
  }

  // License key format: TP-{TYPE}-{SIGNATURE}-{EXPIRY}
  // Example: TP-PRO1-A1B2C3D4E5F6-20251231
  const parts = key.split('-')

  if (parts.length !== 4 || parts[0] !== 'TP') {
    return INVALID_LICENSE
  }

  const typeCode = parts[1]
  const signature = parts[2]
  const expiryStr = parts[3]

  // Verify cryptographic signature
  const isValidSignature = await verifySignature(typeCode, signature, expiryStr)
  if (!isValidSignature) {
    return INVALID_LICENSE
  }

  // Parse expiry date
  const year = Number.parseInt(expiryStr.slice(0, 4))
  const month = Number.parseInt(expiryStr.slice(4, 6)) - 1
  const day = Number.parseInt(expiryStr.slice(6, 8))
  const expiresAt = new Date(year, month, day)

  if (expiresAt < new Date()) {
    return { ...INVALID_LICENSE, expiresAt }
  }

  // Determine license type
  let type: LicenseType = 'free'
  if (typeCode === 'PRO1') type = 'pro-single'
  else if (typeCode === 'PROU') type = 'pro-unlimited'
  else if (typeCode === 'PROT') type = 'pro-team'

  return {
    type,
    isValid: true,
    expiresAt,
    features: {
      pivot: type !== 'free',
      advancedAggregations: type !== 'free',
      percentageMode: type !== 'free',
      sessionPersistence: type !== 'free',
      noWatermark: type !== 'free',
    },
  }
}

/**
 * Configure the license secret (for SSR/build-time injection)
 */
export function configureLicenseSecret(secret: string): void {
  (globalThis as Record<string, unknown>).__TP_LICENSE_SECRET__ = secret
}

// Hardcoded SHA-256 hash of the demo secret
const DEMO_SECRET_HASH = 'A48AA0618518D3E62F31FCFCA2DD2B86E7FE0863E2F90756FB0A960AE7A51583'

/**
 * Hash a string using SHA-256 (async for Web Crypto API)
 */
async function hashSecret(secret: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(secret)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  } catch {
    return ''
  }
}

/**
 * Validate demo secret and return demo license info if valid
 * Returns null if secret is invalid
 */
export async function getDemoLicenseInfo(secret?: string): Promise<LicenseInfo | null> {
  if (!secret) {
    return null
  }
  
  const hash = await hashSecret(secret)
  if (hash !== DEMO_SECRET_HASH) {
    return null
  }
  
  return DEMO_LICENSE
}

/**
 * Get free license info
 */
export function getFreeLicenseInfo(): LicenseInfo {
  return FREE_LICENSE
}

/**
 * Check if license allows pivot feature
 */
export function canUsePivot(info: LicenseInfo): boolean {
  return info.features.pivot
}

/**
 * Check if license is pro (any tier)
 */
export function isPro(info: LicenseInfo): boolean {
  return info.isValid && info.type !== 'free'
}

/**
 * Check if watermark should be shown
 */
export function shouldShowWatermark(info: LicenseInfo, isDemo: boolean): boolean {
  return isDemo || !info.features.noWatermark
}

/**
 * Log pro requirement warning
 */
export function logProRequired(feature: string): void {
  console.warn(
    `[TinyPivot] "${feature}" requires a Pro license. ` +
      `Visit https://tiny-pivot.com/#pricing to upgrade.`
  )
}


