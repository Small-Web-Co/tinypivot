/**
 * License Management Hook for React
 * Wraps core license logic with React state management
 */
import { useState, useCallback, useMemo } from 'react'
import type { LicenseInfo } from '@smallwebco/tinypivot-core'
import {
  validateLicenseKey,
  configureLicenseSecret as coreConfigureLicenseSecret,
  getDemoLicenseInfo,
  getFreeLicenseInfo,
  canUsePivot as coreCanUsePivot,
  isPro as coreIsPro,
  shouldShowWatermark as coreShouldShowWatermark,
  logProRequired,
} from '@smallwebco/tinypivot-core'

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
  } else if (globalLicenseInfo.type !== 'free') {
    console.info(`[TinyPivot] Pro license activated (${globalLicenseInfo.type})`)
  }

  notifyListeners()
}

/**
 * Enable demo mode
 */
export function enableDemoMode(): void {
  globalDemoMode = true
  globalLicenseInfo = getDemoLicenseInfo()
  console.info('[TinyPivot] Demo mode enabled - all Pro features unlocked for evaluation')
  notifyListeners()
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
    [licenseInfo]
  )

  const canUsePivot = useMemo(
    () => globalDemoMode || coreCanUsePivot(licenseInfo),
    [licenseInfo]
  )

  const canUseAdvancedAggregations = useMemo(
    () => globalDemoMode || licenseInfo.features.advancedAggregations,
    [licenseInfo]
  )

  const canUsePercentageMode = useMemo(
    () => globalDemoMode || licenseInfo.features.percentageMode,
    [licenseInfo]
  )

  const showWatermark = useMemo(
    () => coreShouldShowWatermark(licenseInfo, globalDemoMode),
    [licenseInfo]
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
    showWatermark,
    requirePro,
  }
}

