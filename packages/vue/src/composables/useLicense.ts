import type { LicenseInfo } from '@smallwebco/tinypivot-core'
import {
  canUseCharts as coreCanUseCharts,
  canUsePivot as coreCanUsePivot,
  configureLicenseSecret as coreConfigureLicenseSecret,
  isPro as coreIsPro,
  shouldShowWatermark as coreShouldShowWatermark,
  getDemoLicenseInfo,
  getFreeLicenseInfo,
  logProRequired,
  validateLicenseKey,
} from '@smallwebco/tinypivot-core'
/**
 * License Management Composable for Vue
 * Wraps core license logic with Vue reactivity
 */
import { computed, ref } from 'vue'

// License state
const licenseKey = ref<string | null>(null)
const demoMode = ref(false)
const licenseInfo = ref<LicenseInfo>(getFreeLicenseInfo())

// Cached validation result
let validationPromise: Promise<LicenseInfo> | null = null

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

/**
 * Enable demo mode - unlocks all features for evaluation
 * Requires the correct demo secret
 * Shows "Demo Mode" watermark
 */
export async function enableDemoMode(secret: string): Promise<boolean> {
  const demoLicense = await getDemoLicenseInfo(secret)
  if (!demoLicense) {
    console.warn('[TinyPivot] Demo mode activation failed - invalid secret')
    return false
  }
  demoMode.value = true
  licenseInfo.value = demoLicense
  console.info('[TinyPivot] Demo mode enabled - all Pro features unlocked for evaluation')
  return true
}

/**
 * Configure the license secret
 */
export function configureLicenseSecret(secret: string): void {
  coreConfigureLicenseSecret(secret)
}

/**
 * Composable for accessing license information
 */
export function useLicense() {
  const isDemo = computed(() => demoMode.value)

  const isPro = computed(() => demoMode.value || coreIsPro(licenseInfo.value))

  const canUsePivot = computed(() => demoMode.value || coreCanUsePivot(licenseInfo.value))

  const canUseAdvancedAggregations = computed(
    () => demoMode.value || licenseInfo.value.features.advancedAggregations,
  )

  const canUsePercentageMode = computed(
    () => demoMode.value || licenseInfo.value.features.percentageMode,
  )

  const canUseCharts = computed(() => demoMode.value || coreCanUseCharts(licenseInfo.value))

  const showWatermark = computed(() => coreShouldShowWatermark(licenseInfo.value, demoMode.value))

  function requirePro(feature: string): boolean {
    if (!isPro.value) {
      logProRequired(feature)
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
    canUseCharts,
    showWatermark,
    requirePro,
  }
}
