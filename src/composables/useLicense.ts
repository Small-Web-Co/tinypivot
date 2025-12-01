/**
 * License Management for Vue Pivot Grid
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
    pivot: false,
    advancedAggregations: false,
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
  },
})

/**
 * Simple hash function for license validation
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * Validate a license key and extract info
 */
function validateLicenseKey(key: string): LicenseInfo {
  // Free tier - no key needed
  if (!key || key === '') {
    return {
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
  }

  // License key format: VPG-{TYPE}-{HASH}-{EXPIRY}
  // Example: VPG-PRO1-A1B2C3D4-20251231
  const parts = key.split('-')

  if (parts.length !== 4 || parts[0] !== 'VPG') {
    return {
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
  }

  const typeCode = parts[1]
  const hash = parts[2]
  const expiryStr = parts[3]

  // Validate hash (simple check - in production use proper crypto)
  const expectedHash = hashCode(`${typeCode}-${expiryStr}`).toString(16).toUpperCase().slice(0, 8)
  if (hash !== expectedHash) {
    return {
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
  }

  // Parse expiry date
  const year = Number.parseInt(expiryStr.slice(0, 4))
  const month = Number.parseInt(expiryStr.slice(4, 6)) - 1
  const day = Number.parseInt(expiryStr.slice(6, 8))
  const expiresAt = new Date(year, month, day)

  if (expiresAt < new Date()) {
    return {
      type: 'free',
      isValid: false,
      expiresAt,
      features: {
        pivot: false,
        advancedAggregations: false,
        percentageMode: false,
        sessionPersistence: false,
        noWatermark: false,
      },
    }
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
 */
export function setLicenseKey(key: string): void {
  licenseKey.value = key
  licenseInfo.value = validateLicenseKey(key)

  if (!licenseInfo.value.isValid) {
    console.warn('[Vue Pivot Grid] Invalid or expired license key. Running in free mode.')
  }
  else if (licenseInfo.value.type !== 'free') {
    console.info(`[Vue Pivot Grid] Pro license activated (${licenseInfo.value.type})`)
  }
}

/**
 * Enable demo mode - unlocks all features for evaluation
 * Shows "Demo Mode" watermark instead of license required
 */
export function enableDemoMode(): void {
  demoMode.value = true
  licenseInfo.value = {
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
  console.info('[Vue Pivot Grid] Demo mode enabled - all Pro features unlocked for evaluation')
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
        `[Vue Pivot Grid] "${feature}" requires a Pro license. ` +
        `Visit https://vue-pivot-grid.dev/pricing to upgrade.`,
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
 * Generate a license key (for internal/admin use)
 */
export function generateLicenseKey(type: 'PRO1' | 'PROU' | 'PROT', expiryDate: Date): string {
  const expiry = expiryDate.toISOString().slice(0, 10).replace(/-/g, '')
  const hash = hashCode(`${type}-${expiry}`).toString(16).toUpperCase().slice(0, 8)
  return `VPG-${type}-${hash}-${expiry}`
}

