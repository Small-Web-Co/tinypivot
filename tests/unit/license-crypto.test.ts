/**
 * Tests for license crypto fallback behavior
 * Verifies that license validation handles missing crypto.subtle gracefully
 * (e.g. plain HTTP on non-localhost IPs like http://10.143.8.17:8080)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCryptoState,
  getFreeLicenseInfo,
  validateLicenseKey,
} from '../../packages/core/src/license'

// A well-formed key with a bogus signature (will fail ECDSA verify, but exercises the crypto path)
const FAKE_KEY = 'TP-PRO1-dGVzdHNpZw-20251231'

describe('license crypto fallback', () => {
  let originalCrypto: Crypto
  let warnSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalCrypto = globalThis.crypto
    _resetCryptoState()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    })
    _resetCryptoState()
    vi.restoreAllMocks()
  })

  it('returns free license for empty key regardless of crypto availability', async () => {
    const result = await validateLicenseKey('')
    expect(result).toEqual(getFreeLicenseInfo())
  })

  it('returns invalid license for malformed keys', async () => {
    const result = await validateLicenseKey('not-a-valid-key')
    expect(result.isValid).toBe(false)
    expect(result.type).toBe('free')
  })

  describe('when crypto.subtle is available (HTTPS / localhost)', () => {
    it('validates without insecure context warning', async () => {
      const result = await validateLicenseKey(FAKE_KEY)

      // Bogus signature → invalid, but no insecure-context message
      expect(result.isValid).toBe(false)
      const insecureInfos = infoSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('crypto.subtle is not available'),
      )
      expect(insecureInfos).toHaveLength(0)
    })
  })

  describe('when crypto.subtle is unavailable but node:crypto works (SSR behind plain HTTP)', () => {
    beforeEach(() => {
      // Simulate plain HTTP browser — crypto exists but subtle is undefined
      Object.defineProperty(globalThis, 'crypto', {
        value: { subtle: undefined, getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) },
        writable: true,
        configurable: true,
      })
    })

    it('falls back to node:crypto and validates without warning', async () => {
      // In Node.js test env, node:crypto IS available as fallback.
      // Bogus signature → invalid, but the crypto path ran (no crash, no message).
      const result = await validateLicenseKey(FAKE_KEY)
      expect(result.isValid).toBe(false)
      expect(result.type).toBe('free')

      // No insecure context message because node:crypto fallback worked
      const insecureInfos = infoSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('crypto.subtle is not available'),
      )
      expect(insecureInfos).toHaveLength(0)
    })
  })

  describe('when ALL native crypto is unavailable (browser on plain HTTP)', () => {
    beforeEach(() => {
      // Force the cache to null — simulates an environment where both
      // globalThis.crypto.subtle and node:crypto are unavailable
      // (i.e. a browser served over plain HTTP on a non-localhost IP)
      _resetCryptoState(null)
    })

    it('falls back to @noble/curves and still verifies signatures', async () => {
      // Bogus signature → noble correctly rejects it (invalid signature)
      const result = await validateLicenseKey(FAKE_KEY)
      expect(result.isValid).toBe(false)
      expect(result.type).toBe('free')

      // Should emit an info-level message about using pure JS fallback
      const fallbackInfos = infoSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('pure JS crypto fallback'),
      )
      expect(fallbackInfos).toHaveLength(1)

      // Should NOT emit a console.warn (downgraded to info)
      const insecureWarnings = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('crypto.subtle is not available'),
      )
      expect(insecureWarnings).toHaveLength(0)
    })

    it('info message contains performance recommendations', async () => {
      await validateLicenseKey(FAKE_KEY)

      const fallbackInfos = infoSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('pure JS crypto fallback'),
      )
      const infoText = fallbackInfos[0][0] as string
      expect(infoText).toContain('HTTPS')
      expect(infoText).toContain('localhost')
      expect(infoText).toContain('self-signed certificate')
    })

    it('only logs info once even with multiple validations', async () => {
      await validateLicenseKey(FAKE_KEY)
      await validateLicenseKey(FAKE_KEY)
      await validateLicenseKey(FAKE_KEY)

      const fallbackInfos = infoSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('pure JS crypto fallback'),
      )
      expect(fallbackInfos).toHaveLength(1)
    })

    it('does not crash — noble handles the verification gracefully', async () => {
      // Even with no native crypto, the library should not throw
      const result = await validateLicenseKey(FAKE_KEY)
      expect(result.type).toBe('free')
      expect(result.features.pivot).toBe(true) // free tier still works
      expect(result.features.advancedAggregations).toBe(false) // pro locked
    })
  })
})
