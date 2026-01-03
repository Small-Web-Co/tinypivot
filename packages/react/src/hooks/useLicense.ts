import type { LicenseInfo } from '@smallwebco/tinypivot-core'
import {
  canUseAIAnalyst as coreCanUseAIAnalyst,
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
 * License Management Hook for React
 * Wraps core license logic with React state management
 */
import { useCallback, useMemo, useState } from 'react'

// Global state (shared across all hook instances)
let globalLicenseInfo: LicenseInfo = getFreeLicenseInfo()
let globalDemoMode = false
const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach(listener => listener())
}

/**
 * Set the license key for the library
 */
export async function setLicenseKey(key: string): Promise<void> {
  globalLicenseInfo = await validateLicenseKey(key)

  if (!globalLicenseInfo.isValid) {
    console.warn('[TinyPivot] Invalid or expired license key. Running in free mode.')
  }
  else if (globalLicenseInfo.type !== 'free') {
    console.info(`[TinyPivot] Pro license activated (${globalLicenseInfo.type})`)
  }

  notifyListeners()
}

/**
 * Enable demo mode - requires the correct demo secret
 * Returns true if activation succeeded, false if secret was invalid
 */
export async function enableDemoMode(secret: string): Promise<boolean> {
  const demoLicense = await getDemoLicenseInfo(secret)
  if (!demoLicense) {
    console.warn('[TinyPivot] Demo mode activation failed - invalid secret')
    return false
  }
  globalDemoMode = true
  globalLicenseInfo = demoLicense
  console.info('[TinyPivot] Demo mode enabled - all Pro features unlocked for evaluation')
  notifyListeners()
  return true
}

/**
 * Configure the license secret
 */
export function configureLicenseSecret(secret: string): void {
  coreConfigureLicenseSecret(secret)
}

/**
 * Hook for accessing license information
 */
export function useLicense() {
  const [, forceUpdate] = useState({})

  // Subscribe to global state changes
  useState(() => {
    const update = () => forceUpdate({})
    listeners.add(update)
    return () => listeners.delete(update)
  })

  const isDemo = globalDemoMode
  const licenseInfo = globalLicenseInfo

  const isPro = useMemo(
    () => globalDemoMode || coreIsPro(licenseInfo),
    [licenseInfo],
  )

  const canUsePivot = useMemo(
    () => globalDemoMode || coreCanUsePivot(licenseInfo),
    [licenseInfo],
  )

  const canUseAdvancedAggregations = useMemo(
    () => globalDemoMode || licenseInfo.features.advancedAggregations,
    [licenseInfo],
  )

  const canUsePercentageMode = useMemo(
    () => globalDemoMode || licenseInfo.features.percentageMode,
    [licenseInfo],
  )

  const canUseCharts = useMemo(
    () => globalDemoMode || coreCanUseCharts(licenseInfo),
    [licenseInfo],
  )

  const canUseAIAnalyst = useMemo(
    () => globalDemoMode || coreCanUseAIAnalyst(licenseInfo),
    [licenseInfo],
  )

  const showWatermark = useMemo(
    () => coreShouldShowWatermark(licenseInfo, globalDemoMode),
    [licenseInfo],
  )

  const requirePro = useCallback((feature: string): boolean => {
    if (!isPro) {
      logProRequired(feature)
      return false
    }
    return true
  }, [isPro])

  return {
    licenseInfo,
    isDemo,
    isPro,
    canUsePivot,
    canUseAdvancedAggregations,
    canUsePercentageMode,
    canUseCharts,
    canUseAIAnalyst,
    showWatermark,
    requirePro,
  }
}
