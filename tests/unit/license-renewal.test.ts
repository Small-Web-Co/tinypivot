import type { SubscriptionLike } from '../../api/_lib/renewal'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { expiryAfter, mintLicenseKey, readLicenseKey } from '../../api/_lib/license'
import { renewLicense } from '../../api/_lib/renewal'
import { parseSeatLog, recordSeat, SEAT_METADATA_KEY, serializeSeatLog } from '../../api/_lib/seats'
import { parseLicenseKey } from '../../packages/core/src/license/index'
import { _setMcpLicensePublicKeyForTests, inspectMcpLicenseKey } from '../../packages/mcp/src/license'
import { effectiveLicenseKey, installHash, refreshLicense, shouldRefresh } from '../../packages/mcp/src/license-refresh'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const NOW = new Date('2026-11-27T12:00:00Z')
const periodEnd = (iso: string) => Date.parse(iso) / 1000

beforeAll(() => {
  vi.stubEnv('LICENSE_PRIVATE_KEY', privateKey)
  _setMcpLicensePublicKeyForTests(publicKey)
})
afterAll(() => {
  vi.unstubAllEnvs()
  _setMcpLicensePublicKeyForTests(undefined)
})

describe('license keys tied to a purchase', () => {
  it('signs the license id with the key, and every reader agrees on it', async () => {
    const key = await mintLicenseKey('MCPT', '20271211', 'sub_Acme123')
    expect(key.startsWith('TP-MCPT.sub_Acme123-')).toBe(true)
    expect(readLicenseKey(key)).toEqual({ typeCode: 'MCPT', licenseId: 'sub_Acme123', expiry: '20271211' })
    expect(parseLicenseKey(key)).toMatchObject({ typeCode: 'MCPT', licenseId: 'sub_Acme123', expiry: '20271211' })
    expect(inspectMcpLicenseKey(key, { now: NOW })).toEqual({ status: 'mcp', typeCode: 'MCPT', licenseId: 'sub_Acme123', expiry: '20271211' })
  })

  it('rejects a key whose license id was swapped, and still accepts old keys without one', async () => {
    const key = await mintLicenseKey('MCPT', '20271211', 'sub_Acme123')
    const forged = key.replace('sub_Acme123', 'sub_Other99')
    expect(readLicenseKey(forged)).toBeNull()
    expect(inspectMcpLicenseKey(forged).status).toBe('invalid')
    const old = await mintLicenseKey('MCPP', '20991231')
    expect(inspectMcpLicenseKey(old)).toMatchObject({ status: 'mcp', typeCode: 'MCPP', expiry: '20991231' })
    expect(inspectMcpLicenseKey(old).licenseId).toBeUndefined()
  })

  it('ends a yearly key 14 days after the paid period', () => {
    expect(expiryAfter(periodEnd('2027-11-27T00:00:00Z'))).toBe('20271211')
  })
})

describe('soft seat counting', () => {
  it('keeps the last 30 days of installs, newest first, within Stripe\'s metadata limit', () => {
    let log = parseSeatLog('aaaaaaaaaa:100,bbbbbbbbbb:60')
    log = recordSeat(log, 'cccccccccccccccc', 100)
    expect(serializeSeatLog(log)).toBe('aaaaaaaaaa:100,cccccccccc:100')
    for (let i = 0; i < 40; i++)
      log = recordSeat(log, crypto.randomBytes(8).toString('hex'), 101)
    expect(log.size).toBe(24)
    expect(serializeSeatLog(log).length).toBeLessThanOrEqual(500)
  })
})

function subscription(status: string, end = '2027-11-27T00:00:00Z', seats = ''): SubscriptionLike {
  return { status, items: { data: [{ current_period_end: periodEnd(end) }] }, metadata: seats ? { [SEAT_METADATA_KEY]: seats } : {} }
}

describe('renewal endpoint', () => {
  const install = 'abcdef0123456789'

  it('renews an active Team key to the new period and counts the install', async () => {
    const key = await mintLicenseKey('MCPT', '20261211', 'sub_Acme123')
    const setMetadata = vi.fn(async () => {})
    const reply = await renewLicense({ key, install }, { getSubscription: async () => subscription('active', '2027-11-27T00:00:00Z', 'aaaaaaaaaa:20780'), setMetadata, now: NOW })
    expect(reply.status).toBe(200)
    expect(readLicenseKey(reply.body.key!)).toEqual({ typeCode: 'MCPT', licenseId: 'sub_Acme123', expiry: '20271211' })
    expect(reply.body.seats).toEqual({ used: 2, limit: 5 })
    expect(setMetadata).toHaveBeenCalledWith('sub_Acme123', { [SEAT_METADATA_KEY]: expect.stringContaining('abcdef0123') })
  })

  it('stops renewing once the subscription is cancelled, naming when Pro switches off', async () => {
    const key = await mintLicenseKey('MCPP', '20261211', 'sub_Acme123')
    const reply = await renewLicense({ key }, { getSubscription: async () => subscription('canceled'), setMetadata: async () => {} })
    expect(reply).toMatchObject({ status: 403, body: { message: expect.stringContaining('until 2026-12-11') } })
  })

  it('refuses forged, lifetime and unknown keys without touching Stripe', async () => {
    const getSubscription = vi.fn(async () => subscription('active'))
    const deps = { getSubscription, setMetadata: async () => {} }
    expect((await renewLicense({ key: 'TP-MCPT.sub_x-abc-20271211' }, deps)).status).toBe(400)
    expect((await renewLicense({ key: await mintLicenseKey('MCPP', '20991231', 'pi_Acme') }, deps)).status).toBe(400)
    expect(getSubscription).not.toHaveBeenCalled()
    expect((await renewLicense({ key: await mintLicenseKey('MCPT', '20261211', 'sub_gone') }, { ...deps, getSubscription: async () => null })).status).toBe(404)
  })
})

describe('mCP server side of renewal', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-license-'))

  it('checks Team keys daily and Pro yearly keys only in their last month', async () => {
    const team = inspectMcpLicenseKey(await mintLicenseKey('MCPT', '20271211', 'sub_A'), { now: NOW })
    const pro = inspectMcpLicenseKey(await mintLicenseKey('MCPP', '20271211', 'sub_A'), { now: NOW })
    const proSoon = inspectMcpLicenseKey(await mintLicenseKey('MCPP', '20261215', 'sub_A'), { now: NOW })
    const lifetime = inspectMcpLicenseKey(await mintLicenseKey('MCPP', '20991231', 'pi_A'), { now: NOW })
    expect(shouldRefresh(team, undefined, NOW)).toBe(true)
    expect(shouldRefresh(team, NOW.getTime() - 3_600_000, NOW)).toBe(false)
    expect(shouldRefresh(pro, undefined, NOW)).toBe(false)
    expect(shouldRefresh(proSoon, undefined, NOW)).toBe(true)
    expect(shouldRefresh(lifetime, undefined, NOW)).toBe(false)
  })

  it('saves a renewed key and prefers it, warns past the seat limit, and never sends the anon id', async () => {
    const file = path.join(dir(), 'license.json')
    const configured = await mintLicenseKey('MCPT', '20261211', 'sub_Acme123')
    const renewed = await mintLicenseKey('MCPT', '20271211', 'sub_Acme123')
    const sent: string[] = []
    const fetchFn = (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body))
      return { ok: true, json: async () => ({ key: renewed, seats: { used: 7, limit: 5 } }) }
    }) as unknown as typeof fetch
    const notices = await refreshLicense(configured, { anonId: 'anon-123', file, now: NOW, fetchFn })
    expect(notices).toEqual([
      '[tinypivot-mcp] License renewed through 2027-12-11.',
      expect.stringContaining('used on 7 installs'),
    ])
    expect(sent[0]).toContain(installHash('anon-123', 'sub_Acme123'))
    expect(sent[0]).not.toContain('anon-123')
    expect(effectiveLicenseKey(configured, file)).toBe(renewed)
    expect(await refreshLicense(configured, { anonId: 'anon-123', file, now: NOW, fetchFn })).toEqual([])
  })

  it('ignores a saved key from another license, and stays quiet when offline', async () => {
    const file = path.join(dir(), 'license.json')
    fs.writeFileSync(file, JSON.stringify({ key: await mintLicenseKey('MCPT', '20291231', 'sub_Other') }))
    const configured = await mintLicenseKey('MCPT', '20261211', 'sub_Acme123')
    expect(effectiveLicenseKey(configured, file)).toBe(configured)
    const offline = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await refreshLicense(configured, { anonId: 'a', file, now: NOW, fetchFn: offline })).toEqual([])
  })
})
