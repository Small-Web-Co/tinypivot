/**
 * License Management for TinyPivot
 * Handles license validation and feature gating
 */
import { computed, ref } from 'vue'
import type { LicenseInfo, LicenseType } from '../types'

// License state
const licenseKey = ref<string | null>(null)
const demoMode = ref(false)
const licenseInfo = ref<LicenseInfo>({
  type: 'free',
  isValid: true,
  features: {
    pivot: true, // Free tier includes pivot with sum aggregation
    advancedAggregations: false, // Pro: all aggregations beyond sum
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
})

// Cached validation result
let validationPromise: Promise<LicenseInfo> | null = null

/**
 * HMAC-SHA256 based license signature verification
 * Must match the server-side generation algorithm
 */
async function verifySignature(typeCode: string, signature: string, expiry: string): Promise<boolean> {
  // The secret must be configured before license validation can work
  // Use configureLicenseSecret() or build-time replacement
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
    const expectedSig = sigArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12).toUpperCase()
    
    return signature === expectedSig
  }
  catch {
    // Fallback for environments without crypto.subtle (SSR, older browsers)
    return false
  }
}

const FREE_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: true,
  features: {
    pivot: true, // Free tier includes pivot with sum aggregation
    advancedAggregations: false, // Pro: all aggregations beyond sum
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
}

const INVALID_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: false,
  features: {
    pivot: true, // Free tier includes pivot with sum aggregation
    advancedAggregations: false,
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
}

/**
 * Validate a license key and extract info
 */
async function validateLicenseKey(key: string): Promise<LicenseInfo> {
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
  if (typeCode === 'PRO1')
    type = 'pro-single'
  else if (typeCode === 'PROU')
    type = 'pro-unlimited'
  else if (typeCode === 'PROT')
    type = 'pro-team'

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
 * Set the license key for the library
 * Returns a promise that resolves when validation is complete
 */
export async function setLicenseKey(key: string): Promise<void> {
  licenseKey.value = key
  
  // Start validation
  validationPromise = validateLicenseKey(key)
  licenseInfo.value = await validationPromise
  validationPromise = null

  if (!licenseInfo.value.isValid) {
    console.warn('[TinyPivot] Invalid or expired license key. Running in free mode.')
  }
  else if (licenseInfo.value.type !== 'free') {
    console.info(`[TinyPivot] Pro license activated (${licenseInfo.value.type})`)
  }
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

// Hardcoded SHA-256 hash of the demo secret
const DEMO_SECRET_HASH = 'A48AA0618518D3E62F31FCFCA2DD2B86E7FE0863E2F90756FB0A960AE7A51583'

/**
 * Hash a string using SHA-256
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
 * Enable demo mode - unlocks all features for evaluation
 * Requires the correct demo secret
 * Shows "Demo Mode" watermark
 */
export async function enableDemoMode(secret: string): Promise<boolean> {
  if (!secret) {
    console.warn('[TinyPivot] Demo mode activation failed - invalid secret')
    return false
  }
  
  const hash = await hashSecret(secret)
  if (hash !== DEMO_SECRET_HASH) {
    console.warn('[TinyPivot] Demo mode activation failed - invalid secret')
    return false
  }
  
  demoMode.value = true
  licenseInfo.value = DEMO_LICENSE
  console.info('[TinyPivot] Demo mode enabled - all Pro features unlocked for evaluation')
  return true
}

/**
 * Composable for accessing license information
 */
export function useLicense() {
  const isDemo = computed(() => demoMode.value)

  const isPro = computed(() =>
    demoMode.value || (licenseInfo.value.isValid && licenseInfo.value.type !== 'free'),
  )

  const canUsePivot = computed(() =>
    demoMode.value || licenseInfo.value.features.pivot,
  )

  const canUseAdvancedAggregations = computed(() =>
    demoMode.value || licenseInfo.value.features.advancedAggregations,
  )

  const canUsePercentageMode = computed(() =>
    demoMode.value || licenseInfo.value.features.percentageMode,
  )

  const showWatermark = computed(() =>
    demoMode.value || !licenseInfo.value.features.noWatermark,
  )

  function requirePro(feature: string): boolean {
    if (!isPro.value) {
      console.warn(
        `[TinyPivot] "${feature}" requires a Pro license. ` +
        `Visit https://tiny-pivot.com/#pricing to upgrade.`,
      )
      return false
    }
    return true
  }

  return {
    licenseInfo: computed(() => licenseInfo.value),
    isDemo,
    isPro,
    canUsePivot,
    canUseAdvancedAggregations,
    canUsePercentageMode,
    showWatermark,
    requirePro,
  }
}

/**
 * Configure the license secret (for SSR/build-time injection)
 * Call this before setLicenseKey if you need to set a custom secret
 */
export function configureLicenseSecret(secret: string): void {
  (globalThis as Record<string, unknown>).__TP_LICENSE_SECRET__ = secret
}

