/**
 * Credential Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive credentials with PBKDF2 key derivation.
 * Uses a two-key approach: serverKey (from env) + userKey (per-user secret) for defense in depth.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 12 // 96 bits for GCM
const SALT_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_DIGEST = 'sha256'

export interface EncryptedPayload {
  /** Encrypted data (hex-encoded) */
  ciphertext: string
  /** Initialization vector (hex-encoded, 12 bytes) */
  iv: string
  /** GCM authentication tag (hex-encoded, 16 bytes) */
  authTag: string
  /** Salt for key derivation (hex-encoded, 16 bytes) */
  salt: string
}

export interface CredentialServiceConfig {
  /** Server-side encryption key (min 32 characters, from CREDENTIAL_ENCRYPTION_KEY env) */
  serverKey: string
}

export interface CredentialService {
  /** Encrypt credentials with combined server+user key */
  encrypt: (credentials: Record<string, unknown>, userKey: string) => EncryptedPayload
  /** Decrypt credentials with combined server+user key */
  decrypt: (payload: EncryptedPayload, userKey: string) => Record<string, unknown>
}

/**
 * Derive encryption key from server key, user key, and salt using PBKDF2
 */
function deriveKey(serverKey: string, userKey: string, salt: Buffer): Buffer {
  // Combine keys for defense in depth - compromising one isn't enough
  const combinedKey = `${serverKey}:${userKey}`
  return pbkdf2Sync(combinedKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST)
}

/**
 * Create a credential encryption service
 *
 * @example
 * ```ts
 * const service = createCredentialService({ serverKey: process.env.CREDENTIAL_ENCRYPTION_KEY! })
 *
 * // Encrypt credentials
 * const encrypted = service.encrypt({ password: 'secret' }, 'user-specific-key')
 *
 * // Store encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.salt in DB
 *
 * // Later, decrypt
 * const decrypted = service.decrypt(encrypted, 'user-specific-key')
 * console.log(decrypted.password) // 'secret'
 * ```
 */
export function createCredentialService(config: CredentialServiceConfig): CredentialService {
  const { serverKey } = config

  if (!serverKey || serverKey.length < 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters')
  }

  return {
    encrypt(credentials: Record<string, unknown>, userKey: string): EncryptedPayload {
      if (!userKey) {
        throw new Error('User key is required for encryption')
      }

      // Generate random salt and IV
      const salt = randomBytes(SALT_LENGTH)
      const iv = randomBytes(IV_LENGTH)

      // Derive key using PBKDF2
      const key = deriveKey(serverKey, userKey, salt)

      // Encrypt using AES-256-GCM
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
      const plaintext = JSON.stringify(credentials)

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ])

      const authTag = cipher.getAuthTag()

      return {
        ciphertext: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        salt: salt.toString('hex'),
      }
    },

    decrypt(payload: EncryptedPayload, userKey: string): Record<string, unknown> {
      if (!userKey) {
        throw new Error('User key is required for decryption')
      }

      const { ciphertext, iv, authTag, salt } = payload

      if (!ciphertext || !iv || !authTag || !salt) {
        throw new Error('Invalid encrypted payload: missing required fields')
      }

      // Convert from hex
      const saltBuffer = Buffer.from(salt, 'hex')
      const ivBuffer = Buffer.from(iv, 'hex')
      const authTagBuffer = Buffer.from(authTag, 'hex')
      const encryptedBuffer = Buffer.from(ciphertext, 'hex')

      // Derive the same key
      const key = deriveKey(serverKey, userKey, saltBuffer)

      // Decrypt using AES-256-GCM
      const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: AUTH_TAG_LENGTH })
      decipher.setAuthTag(authTagBuffer)

      try {
        const decrypted = Buffer.concat([
          decipher.update(encryptedBuffer),
          decipher.final(),
        ])

        return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>
      }
      catch {
        throw new Error('Decryption failed: invalid key or corrupted data')
      }
    },
  }
}
