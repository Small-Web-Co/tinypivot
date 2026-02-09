/**
 * TinyPivot Core - License Management
 * Framework-agnostic license validation logic
 *
 * Uses ECDSA P-256 asymmetric cryptography:
 * - Licenses are SIGNED with a private key (kept secret)
 * - Licenses are VERIFIED with a public key (embedded here)
 */
import type { LicenseInfo, LicenseType } from '../types'

const FREE_LICENSE: LicenseInfo = {
  type: 'free',
  isValid: true,
  features: {
    pivot: true, // Free tier includes pivot with sum aggregation
    advancedAggregations: false, // Pro: all aggregations beyond sum
    percentageMode: false,
    sessionPersistence: false,
    noWatermark: false,
    charts: false, // Chart builder is Pro only
    aiAnalyst: false, // AI Data Analyst is Pro only
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
    charts: false,
    aiAnalyst: false,
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
    charts: true, // Demo can use charts
    aiAnalyst: true, // Demo can use AI Analyst
  },
}

// Public key for license verification (ECDSA P-256)
// This is safe to embed - it can only VERIFY signatures, not create them
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE436rfGofder4lfo4UHsRF2M88Gs0
zLsikg2H9GMkL8hLGuOtnGMpVfLRlc7cD8FdkPBBRgiQ8UFnG8hm+nMIug==
-----END PUBLIC KEY-----`

/**
 * Convert base64 (or URL-safe base64) to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Convert URL-safe base64 to standard base64
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  while (standardBase64.length % 4) {
    standardBase64 += '='
  }

  const binaryString = atob(standardBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Convert DER-encoded ECDSA signature to raw format (r || s)
 * Web Crypto API expects raw format, but Node.js produces DER format
 */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  if (der[0] !== 0x30) {
    throw new Error('Invalid DER signature')
  }

  let offset = 2 // Skip 0x30 and length byte

  // Read r
  if (der[offset] !== 0x02)
    throw new Error('Invalid DER signature')
  offset++
  const rLen = der[offset]
  offset++
  let r = der.slice(offset, offset + rLen)
  offset += rLen

  // Read s
  if (der[offset] !== 0x02)
    throw new Error('Invalid DER signature')
  offset++
  const sLen = der[offset]
  offset++
  let s = der.slice(offset, offset + sLen)

  // For P-256, r and s should each be 32 bytes
  // Remove leading zero padding if present (used for positive sign in DER)
  if (r.length === 33 && r[0] === 0)
    r = r.slice(1)
  if (s.length === 33 && s[0] === 0)
    s = s.slice(1)

  // Pad to 32 bytes if shorter
  const padR = new Uint8Array(32)
  const padS = new Uint8Array(32)
  padR.set(r, 32 - r.length)
  padS.set(s, 32 - s.length)

  // Concatenate r || s
  const raw = new Uint8Array(64)
  raw.set(padR, 0)
  raw.set(padS, 32)

  return raw
}

/**
 * ECDSA P-256 verification via @noble/curves (pure JS fallback)
 * Used when SubtleCrypto is unavailable (e.g. browser on plain HTTP)
 */
async function verifySignatureNoble(
  rawSig: Uint8Array,
  msgBytes: Uint8Array,
  spkiBytes: Uint8Array,
): Promise<boolean> {
  const { p256 } = await import('@noble/curves/p256')
  // SPKI for P-256 has a fixed 26-byte header; raw key starts at offset 26
  const rawPublicKey = spkiBytes.slice(26)
  return p256.verify(rawSig, msgBytes, rawPublicKey)
}

/**
 * SHA-256 hashing via @noble/hashes (pure JS fallback)
 * Used when SubtleCrypto is unavailable (e.g. browser on plain HTTP)
 */
async function hashSecretNoble(secret: string): Promise<string> {
  const { sha256 } = await import('@noble/hashes/sha256')
  const data = new TextEncoder().encode(secret)
  const hash = sha256(data)
  return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Cached SubtleCrypto instance (undefined = not yet checked)
 */
let subtleCryptoCache: SubtleCrypto | null | undefined

/**
 * Get a SubtleCrypto instance, falling back to Node.js webcrypto for SSR
 */
async function getSubtleCrypto(): Promise<SubtleCrypto | null> {
  if (subtleCryptoCache !== undefined)
    return subtleCryptoCache

  if (globalThis.crypto?.subtle) {
    subtleCryptoCache = globalThis.crypto.subtle
    return subtleCryptoCache
  }

  try {
    // Node.js / SSR fallback
    const nodeCrypto = await import('node:crypto')
    const subtle = (nodeCrypto as any).webcrypto?.subtle as SubtleCrypto | undefined
    if (subtle) {
      subtleCryptoCache = subtle
      return subtleCryptoCache
    }
  }
  catch {}

  subtleCryptoCache = null
  return null
}

/**
 * @internal
 */
export function _resetCryptoState(forcedValue?: SubtleCrypto | null): void {
  // undefined = re-detect on next call, null = force "no crypto available"
  subtleCryptoCache = forcedValue
  insecureContextWarned = false
}

let insecureContextWarned = false

/**
 * Log a one-time info message when crypto.subtle is unavailable (plain HTTP)
 * Not a blocker since @noble/curves provides a pure JS fallback.
 */
function warnInsecureContext(): void {
  if (insecureContextWarned)
    return
  insecureContextWarned = true

  console.info(
    '[TinyPivot] crypto.subtle is not available — using pure JS crypto fallback.\n'
    + 'This typically happens when serving over plain HTTP. For best performance, consider:\n'
    + '  1. Serve your app over HTTPS (recommended for production)\n'
    + '  2. Access via localhost (e.g. http://localhost:3000)\n'
    + '  3. Use a self-signed certificate for internal IPs',
  )
}

/**
 * Import the public key for verification
 */
async function importPublicKey(): Promise<CryptoKey | null> {
  try {
    const subtle = await getSubtleCrypto()
    if (!subtle) {
      return null
    }

    // Convert PEM to binary
    const pemContents = PUBLIC_KEY_PEM
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '')

    const binaryKey = base64ToUint8Array(pemContents)

    return await subtle.importKey(
      'spki',
      new Uint8Array(binaryKey).buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
  }
  catch {
    return null
  }
}

/**
 * Get SPKI bytes from the embedded PEM public key
 */
function getSpkiBytes(): Uint8Array {
  const pemContents = PUBLIC_KEY_PEM
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '')
  return base64ToUint8Array(pemContents)
}

/**
 * ECDSA P-256 signature verification
 * Verifies that the license was signed with our private key
 * Falls back to @noble/curves when SubtleCrypto is unavailable
 */
async function verifySignature(
  typeCode: string,
  signature: string,
  expiry: string,
): Promise<boolean> {
  const payload = `TP-${typeCode}-${expiry}`
  const encoder = new TextEncoder()
  const msgData = encoder.encode(payload)
  const derSig = base64ToUint8Array(signature)

  const subtle = await getSubtleCrypto()
  if (!subtle) {
    // Fall back to @noble/curves pure JS implementation
    warnInsecureContext()
    try {
      const rawSig = derToRaw(derSig)
      const spkiBytes = getSpkiBytes()
      return await verifySignatureNoble(rawSig, msgData, spkiBytes)
    }
    catch {
      return false
    }
  }

  try {
    const rawSig = derToRaw(derSig)
    const publicKey = await importPublicKey()
    if (!publicKey)
      return false

    return await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      new Uint8Array(rawSig).buffer,
      msgData,
    )
  }
  catch {
    return false
  }
}

/**
 * Validate a license key and extract info
 *
 * Note: Licenses are PERPETUAL - the expiry date indicates update eligibility,
 * not when features stop working. All Pro features remain active forever.
 */
export async function validateLicenseKey(key: string): Promise<LicenseInfo> {
  // Free tier - no key needed
  if (!key || key === '') {
    return FREE_LICENSE
  }

  // License key format: TP-{TYPE}-{SIGNATURE}-{EXPIRY}
  // Example: TP-PRO1-base64signature-20251231
  // Note: signature uses URL-safe base64 which can contain dashes
  // So we parse from known positions: prefix (TP), type (4 chars), expiry (8 chars at end)

  if (!key.startsWith('TP-')) {
    return INVALID_LICENSE
  }

  // Extract expiry (last 8 characters after final dash)
  const lastDashIdx = key.lastIndexOf('-')
  if (lastDashIdx === -1 || key.length - lastDashIdx !== 9) {
    return INVALID_LICENSE
  }
  const expiryStr = key.slice(lastDashIdx + 1)

  // Extract type code (between first and second dash)
  const withoutPrefix = key.slice(3) // Remove "TP-"
  const secondDashIdx = withoutPrefix.indexOf('-')
  if (secondDashIdx === -1) {
    return INVALID_LICENSE
  }
  const typeCode = withoutPrefix.slice(0, secondDashIdx)

  // Extract signature (everything between type and expiry)
  const signature = withoutPrefix.slice(secondDashIdx + 1, withoutPrefix.lastIndexOf('-'))

  // Verify cryptographic signature
  const isValidSignature = await verifySignature(typeCode, signature, expiryStr)
  if (!isValidSignature) {
    return INVALID_LICENSE
  }

  // Parse expiry date (for update eligibility tracking, NOT feature expiration)
  const year = Number.parseInt(expiryStr.slice(0, 4))
  const month = Number.parseInt(expiryStr.slice(4, 6)) - 1
  const day = Number.parseInt(expiryStr.slice(6, 8))
  const expiresAt = new Date(year, month, day)

  // Determine license type
  let type: LicenseType = 'free'
  if (typeCode === 'PRO1')
    type = 'pro-single'
  else if (typeCode === 'PROU')
    type = 'pro-unlimited'
  else if (typeCode === 'PROT')
    type = 'pro-team'

  // PERPETUAL LICENSE: Features never expire, only update eligibility does
  // The expiresAt date is retained for informational purposes only
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
      charts: type !== 'free',
      aiAnalyst: type !== 'free',
    },
  }
}

/**
 * @deprecated No longer needed - license verification now uses asymmetric cryptography.
 * Kept for backwards compatibility but does nothing.
 */
export function configureLicenseSecret(_secret: string): void {
  // No-op: Asymmetric verification doesn't need a shared secret
  console.warn('[TinyPivot] configureLicenseSecret() is deprecated and no longer needed.')
}

// Hardcoded SHA-256 hash of the demo secret
const DEMO_SECRET_HASH = 'A48AA0618518D3E62F31FCFCA2DD2B86E7FE0863E2F90756FB0A960AE7A51583'

/**
 * Hash a string using SHA-256 (async for Web Crypto API)
 */
async function hashSecret(secret: string): Promise<string> {
  try {
    const subtle = await getSubtleCrypto()
    if (!subtle) {
      // Fall back to @noble/hashes pure JS implementation
      warnInsecureContext()
      return await hashSecretNoble(secret)
    }

    const encoder = new TextEncoder()
    const data = encoder.encode(secret)
    const hashBuffer = await subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  catch {
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
 * Check if license allows chart builder feature
 */
export function canUseCharts(info: LicenseInfo): boolean {
  return info.features.charts
}

/**
 * Check if license allows AI Data Analyst feature
 */
export function canUseAIAnalyst(info: LicenseInfo): boolean {
  return info.features.aiAnalyst
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
    `[TinyPivot] "${feature}" requires a Pro license. `
    + `Visit https://tiny-pivot.com/#pricing to upgrade.`,
  )
}
