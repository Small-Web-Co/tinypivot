import crypto from 'node:crypto'
import { isLicenseExpired, LICENSE_PUBLIC_KEY_PEM, parseLicenseKey } from '@smallwebco/tinypivot-core'

const MCP_TYPE_CODES = new Set(['MCPP', 'MCPT'])
const UI_TYPE_CODES = new Set(['PRO1', 'PROU', 'PROT'])
const DEMO_TOKEN_PREFIX = 'TPDEMO'

let activePublicKeyPem = LICENSE_PUBLIC_KEY_PEM

/**
 * Override the ECDSA P-256 verification public key in unit tests.
 * Passing undefined restores the embedded production key.
 * @internal
 */
export function _setMcpLicensePublicKeyForTests(pem?: string): void {
  activePublicKeyPem = pem ?? LICENSE_PUBLIC_KEY_PEM
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (normalized.length % 4)) % 4
  return Buffer.from(`${normalized}${'='.repeat(padLen)}`, 'base64')
}

function verifyDerSignatureSync(payload: string, signatureBase64Url: string, publicKeyPem: string): boolean {
  try {
    const derSig = decodeBase64Url(signatureBase64Url)
    if (derSig.length === 0)
      return false
    return crypto.verify(
      'sha256',
      Buffer.from(payload, 'utf8'),
      publicKeyPem,
      derSig,
    )
  }
  catch {
    return false
  }
}

export type LicenseKeyStatus = 'none' | 'mcp' | 'ui' | 'expired' | 'invalid'

/**
 * Cryptographically classify a TinyPivot license key on the MCP server.
 * Never returns or logs the key value itself.
 */
export function classifyMcpLicenseKey(
  key?: string | null,
  options: { now?: Date, publicKeyPem?: string } = {},
): LicenseKeyStatus {
  const trimmed = key?.trim()
  if (!trimmed)
    return 'none'

  const parsed = parseLicenseKey(trimmed)
  if (!parsed) {
    return trimmed.startsWith('TP-PRO') ? 'ui' : 'invalid'
  }

  if (UI_TYPE_CODES.has(parsed.typeCode))
    return 'ui'

  if (!MCP_TYPE_CODES.has(parsed.typeCode))
    return 'invalid'

  const verified = verifyDerSignatureSync(
    parsed.payload,
    parsed.signature,
    options.publicKeyPem ?? activePublicKeyPem,
  )
  if (!verified)
    return 'invalid'

  if (isLicenseExpired(parsed.expiry, options.now))
    return 'expired'

  return 'mcp'
}

/**
 * Verify that `key` is a cryptographically valid, non-expired TinyPivot MCP license key
 * (`TP-MCPP-*` or `TP-MCPT-*`).
 */
export function isMcpLicenseKey(key?: string | null): boolean {
  return classifyMcpLicenseKey(key) === 'mcp'
}

/**
 * Verify a server-minted demo token (`TPDEMO.<expiryMs>.<base64url(origin)>.<signature>`).
 */
export function isValidDemoToken(
  token?: string | null,
  options: { now?: number, publicKeyPem?: string } = {},
): boolean {
  const trimmed = token?.trim()
  if (!trimmed)
    return false
  const parts = trimmed.split('.')
  if (parts.length !== 4 || parts[0] !== DEMO_TOKEN_PREFIX)
    return false
  const expiry = Number.parseInt(parts[1], 10)
  const now = options.now ?? Date.now()
  if (!Number.isFinite(expiry) || expiry <= now)
    return false
  let origin: string
  try {
    origin = decodeBase64Url(parts[2]).toString('utf8')
  }
  catch {
    return false
  }
  if (!origin)
    return false
  return verifyDerSignatureSync(
    `${DEMO_TOKEN_PREFIX}|${parts[1]}|${origin}`,
    parts[3],
    options.publicKeyPem ?? activePublicKeyPem,
  )
}
