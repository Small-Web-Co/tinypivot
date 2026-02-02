import { describe, expect, it } from 'vitest'
import { createCredentialService } from '../../../../packages/server/src/crypto/credential-service'

const TEST_SERVER_KEY = 'this-is-a-very-secure-server-key-at-least-32-chars'
const TEST_USER_KEY = 'user-specific-secret-key'
const TEST_USER_KEY_2 = 'different-user-secret-key'

describe('createCredentialService', () => {
  it('throws if serverKey is too short', () => {
    expect(() => createCredentialService({ serverKey: 'short' }))
      .toThrow('CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters')
  })

  it('throws if serverKey is empty', () => {
    expect(() => createCredentialService({ serverKey: '' }))
      .toThrow('CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters')
  })

  it('creates service with valid serverKey', () => {
    const service = createCredentialService({ serverKey: TEST_SERVER_KEY })
    expect(service).toBeDefined()
    expect(service.encrypt).toBeInstanceOf(Function)
    expect(service.decrypt).toBeInstanceOf(Function)
  })
})

describe('credential encryption/decryption', () => {
  const service = createCredentialService({ serverKey: TEST_SERVER_KEY })

  it('encrypts and decrypts credentials correctly', () => {
    const credentials = {
      username: 'db_user',
      password: 'super-secret-password',
      apiKey: '12345-abcde',
    }

    const encrypted = service.encrypt(credentials, TEST_USER_KEY)
    const decrypted = service.decrypt(encrypted, TEST_USER_KEY)

    expect(decrypted).toEqual(credentials)
  })

  it('returns encrypted payload with all required fields', () => {
    const credentials = { password: 'test' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    expect(encrypted.ciphertext).toBeDefined()
    expect(encrypted.iv).toBeDefined()
    expect(encrypted.authTag).toBeDefined()
    expect(encrypted.salt).toBeDefined()

    // Check hex encoding and expected lengths
    expect(encrypted.iv.length).toBe(24) // 12 bytes = 24 hex chars
    expect(encrypted.authTag.length).toBe(32) // 16 bytes = 32 hex chars
    expect(encrypted.salt.length).toBe(32) // 16 bytes = 32 hex chars
  })

  it('generates unique IV and salt for each encryption', () => {
    const credentials = { password: 'same-password' }

    const encrypted1 = service.encrypt(credentials, TEST_USER_KEY)
    const encrypted2 = service.encrypt(credentials, TEST_USER_KEY)

    // Even with same input, IV and salt should differ
    expect(encrypted1.iv).not.toBe(encrypted2.iv)
    expect(encrypted1.salt).not.toBe(encrypted2.salt)
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)

    // But both should decrypt to the same value
    expect(service.decrypt(encrypted1, TEST_USER_KEY)).toEqual(credentials)
    expect(service.decrypt(encrypted2, TEST_USER_KEY)).toEqual(credentials)
  })

  it('handles empty credentials object', () => {
    const credentials = {}
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)
    const decrypted = service.decrypt(encrypted, TEST_USER_KEY)

    expect(decrypted).toEqual(credentials)
  })

  it('handles nested credential objects', () => {
    const credentials = {
      connection: {
        host: 'localhost',
        port: 5432,
      },
      auth: {
        user: 'admin',
        password: 'secret',
      },
    }

    const encrypted = service.encrypt(credentials, TEST_USER_KEY)
    const decrypted = service.decrypt(encrypted, TEST_USER_KEY)

    expect(decrypted).toEqual(credentials)
  })

  it('handles special characters in credentials', () => {
    const credentials = {
      password: 'p@$$w0rd!#$%^&*()_+-=[]{}|;\':",./<>?`~',
      unicode: '密码 пароль كلمة السر',
      emoji: '🔐🔑🛡️',
    }

    const encrypted = service.encrypt(credentials, TEST_USER_KEY)
    const decrypted = service.decrypt(encrypted, TEST_USER_KEY)

    expect(decrypted).toEqual(credentials)
  })

  it('handles large credentials', () => {
    const largeValue = 'x'.repeat(10000)
    const credentials = { largeField: largeValue }

    const encrypted = service.encrypt(credentials, TEST_USER_KEY)
    const decrypted = service.decrypt(encrypted, TEST_USER_KEY)

    expect(decrypted).toEqual(credentials)
  })
})

describe('decryption security', () => {
  const service = createCredentialService({ serverKey: TEST_SERVER_KEY })

  it('fails decryption with wrong user key', () => {
    const credentials = { password: 'secret' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    expect(() => service.decrypt(encrypted, TEST_USER_KEY_2))
      .toThrow('Decryption failed: invalid key or corrupted data')
  })

  it('fails decryption with different server key', () => {
    const service2 = createCredentialService({
      serverKey: 'a-completely-different-server-key-also-32-chars',
    })

    const credentials = { password: 'secret' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    expect(() => service2.decrypt(encrypted, TEST_USER_KEY))
      .toThrow('Decryption failed: invalid key or corrupted data')
  })

  it('fails decryption with tampered ciphertext', () => {
    const credentials = { password: 'secret' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    // Tamper with ciphertext
    const tamperedCiphertext = `${encrypted.ciphertext.slice(0, -2)}ff`

    expect(() => service.decrypt({ ...encrypted, ciphertext: tamperedCiphertext }, TEST_USER_KEY))
      .toThrow('Decryption failed: invalid key or corrupted data')
  })

  it('fails decryption with tampered auth tag', () => {
    const credentials = { password: 'secret' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    // Tamper with auth tag
    const tamperedAuthTag = 'ff'.repeat(16)

    expect(() => service.decrypt({ ...encrypted, authTag: tamperedAuthTag }, TEST_USER_KEY))
      .toThrow('Decryption failed: invalid key or corrupted data')
  })

  it('fails decryption with missing payload fields', () => {
    const credentials = { password: 'secret' }
    const encrypted = service.encrypt(credentials, TEST_USER_KEY)

    expect(() => service.decrypt({ ...encrypted, iv: '' }, TEST_USER_KEY))
      .toThrow('Invalid encrypted payload: missing required fields')

    expect(() => service.decrypt({ ...encrypted, authTag: '' }, TEST_USER_KEY))
      .toThrow('Invalid encrypted payload: missing required fields')

    expect(() => service.decrypt({ ...encrypted, salt: '' }, TEST_USER_KEY))
      .toThrow('Invalid encrypted payload: missing required fields')

    expect(() => service.decrypt({ ...encrypted, ciphertext: '' }, TEST_USER_KEY))
      .toThrow('Invalid encrypted payload: missing required fields')
  })
})

describe('user key validation', () => {
  const service = createCredentialService({ serverKey: TEST_SERVER_KEY })

  it('throws on encrypt with empty user key', () => {
    expect(() => service.encrypt({ password: 'secret' }, ''))
      .toThrow('User key is required for encryption')
  })

  it('throws on decrypt with empty user key', () => {
    const encrypted = service.encrypt({ password: 'secret' }, TEST_USER_KEY)

    expect(() => service.decrypt(encrypted, ''))
      .toThrow('User key is required for decryption')
  })
})

describe('cross-user isolation', () => {
  const service = createCredentialService({ serverKey: TEST_SERVER_KEY })

  it('user A cannot decrypt user B credentials', () => {
    const userACredentials = { password: 'user-a-secret' }
    const userBCredentials = { password: 'user-b-secret' }

    const userAKey = 'user-a-encryption-key'
    const userBKey = 'user-b-encryption-key'

    const encryptedA = service.encrypt(userACredentials, userAKey)
    const encryptedB = service.encrypt(userBCredentials, userBKey)

    // Users can decrypt their own
    expect(service.decrypt(encryptedA, userAKey)).toEqual(userACredentials)
    expect(service.decrypt(encryptedB, userBKey)).toEqual(userBCredentials)

    // But cannot decrypt each other's
    expect(() => service.decrypt(encryptedA, userBKey))
      .toThrow('Decryption failed: invalid key or corrupted data')
    expect(() => service.decrypt(encryptedB, userAKey))
      .toThrow('Decryption failed: invalid key or corrupted data')
  })
})
