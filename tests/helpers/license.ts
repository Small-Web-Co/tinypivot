import crypto from 'node:crypto'
import { _setMcpLicensePublicKeyForTests } from '../../packages/mcp/src/license'

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface TestLicenseSigner {
  publicKeyPem: string
  signLicense: (typeCode: 'MCPP' | 'MCPT' | 'PRO1' | 'PROU' | 'PROT', expiry?: string) => string
  signDemoToken: (origin?: string, expiryMs?: number) => string
  restore: () => void
}

/**
 * Generate an ephemeral ECDSA P-256 keypair and wire its public key into the MCP license verifier
 * for the duration of a test suite. Produces real DER-encoded base64url signatures matching
 * `api/_lib/license.ts`.
 */
export function installTestLicenseKeypair(): TestLicenseSigner {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  _setMcpLicensePublicKeyForTests(publicKey)

  const signPayload = (payload: string): string => {
    const derSig = crypto.sign('sha256', Buffer.from(payload, 'utf8'), privateKey)
    return toBase64Url(derSig)
  }

  return {
    publicKeyPem: publicKey,
    signLicense(typeCode, expiry = '20991231') {
      const payload = `TP-${typeCode}-${expiry}`
      return `TP-${typeCode}-${signPayload(payload)}-${expiry}`
    },
    signDemoToken(origin = 'https://tiny-pivot.com', expiryMs = Date.now() + 60 * 60 * 1000) {
      const encodedOrigin = toBase64Url(Buffer.from(origin, 'utf8'))
      const payload = `TPDEMO|${expiryMs}|${origin}`
      return `TPDEMO.${expiryMs}.${encodedOrigin}.${signPayload(payload)}`
    },
    restore() {
      _setMcpLicensePublicKeyForTests(undefined)
    },
  }
}
