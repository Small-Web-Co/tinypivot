/**
 * License signing helpers shared by the Stripe webhook and the demo token
 * endpoint.
 *
 * Licenses and demo tokens are signed with the ECDSA P-256 private key in
 * `LICENSE_PRIVATE_KEY` and verified in the client with the public key that is
 * embedded in `@smallwebco/tinypivot-core`.
 */

function concatBytes(prefix: number[], arr: Uint8Array): Uint8Array {
  const result = new Uint8Array(prefix.length + arr.length)
  result.set(prefix, 0)
  result.set(arr, prefix.length)
  return result
}

function trimLeadingZeros(arr: Uint8Array): Uint8Array {
  let start = 0
  while (start < arr.length - 1 && arr[start] === 0 && arr[start + 1] < 0x80) {
    start++
  }
  return arr.slice(start)
}

/**
 * Convert a raw ECDSA signature (r || s) to DER format, which is what the
 * client-side verifier expects.
 *
 * DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
 */
function rawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32)
  const s = raw.slice(32, 64)

  // Add a leading zero if the high bit is set (to indicate a positive integer)
  const rPadded = r[0] >= 0x80 ? concatBytes([0], r) : r
  const sPadded = s[0] >= 0x80 ? concatBytes([0], s) : s

  const rTrimmed = trimLeadingZeros(rPadded)
  const sTrimmed = trimLeadingZeros(sPadded)

  const totalLen = 2 + rTrimmed.length + 2 + sTrimmed.length

  const der = new Uint8Array(2 + totalLen)
  let offset = 0

  der[offset++] = 0x30 // SEQUENCE
  der[offset++] = totalLen
  der[offset++] = 0x02 // INTEGER
  der[offset++] = rTrimmed.length
  der.set(rTrimmed, offset)
  offset += rTrimmed.length
  der[offset++] = 0x02 // INTEGER
  der[offset++] = sTrimmed.length
  der.set(sTrimmed, offset)

  return der
}

/**
 * Base64url-encode bytes (no padding), matching the client-side decoder.
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Sign an arbitrary payload with the license private key.
 * Returns a base64url-encoded DER signature.
 */
export async function signLicensePayload(payload: string): Promise<string> {
  const privateKeyPem = process.env.LICENSE_PRIVATE_KEY
  if (!privateKeyPem) {
    throw new Error('LICENSE_PRIVATE_KEY environment variable is required')
  }

  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const msgData = new TextEncoder().encode(payload)

  const rawSignature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    msgData,
  )

  return base64UrlEncode(rawToDer(new Uint8Array(rawSignature)))
}
