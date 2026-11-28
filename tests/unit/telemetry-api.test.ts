import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseTelemetryRecord, persistTelemetryEvent } from '../../api/_lib/telemetry-store'
import handler from '../../api/telemetry'

function mockRes() {
  const res = {
    statusCode: 0,
    jsonBody: undefined as unknown,
    ended: false,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.jsonBody = body
      return res
    },
    end() {
      res.ended = true
      return res
    },
  }
  return res
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('parseTelemetryRecord', () => {
  const fixedNow = new Date('2026-11-28T00:00:00.000Z')

  it('validates and sanitizes a tool_call payload', () => {
    const rec = parseTelemetryRecord(
      {
        event: 'tool_call',
        tier: 'pro',
        tool: 'query_postgres; DROP TABLE--',
        rowBucket: '100-1k',
        client: 'claude-code',
        truncated: false,
        version: '0.9.5',
        os: 'darwin',
        anonId: 'abc-123',
      },
      'US',
      fixedNow,
    )

    expect(rec).toEqual({
      event: 'tool_call',
      tier: 'pro',
      tool: 'query_postgres DROP TABLE--',
      rowBucket: '100-1k',
      client: 'claude-code',
      truncated: false,
      version: '0.9.5',
      os: 'darwin',
      anonId: 'abc-123',
      country: 'US',
      ts: '2026-11-28T00:00:00.000Z',
    })
  })

  it('rejects unknown events and defaults unknown tier / drops unknown bucket', () => {
    expect(parseTelemetryRecord({ event: 'evil' }, undefined, fixedNow)).toBeNull()
    expect(parseTelemetryRecord(null, undefined, fixedNow)).toBeNull()

    const rec = parseTelemetryRecord(
      { event: 'server_start', tier: 'enterprise', rowBucket: '999k' },
      undefined,
      fixedNow,
    )
    expect(rec).toEqual({
      event: 'server_start',
      tier: 'free',
      tool: undefined,
      rowBucket: undefined,
      client: undefined,
      truncated: undefined,
      version: undefined,
      os: undefined,
      anonId: undefined,
      country: undefined,
      ts: '2026-11-28T00:00:00.000Z',
    })
  })
})

describe('persistTelemetryEvent', () => {
  const sample = parseTelemetryRecord(
    { event: 'server_start', tier: 'free', client: 'cursor', anonId: 'user-1' },
    'CA',
    new Date('2026-11-28T00:00:00.000Z'),
  )!

  it('calls the injected writer and returns true', async () => {
    const insert = vi.fn(async () => {})
    const ok = await persistTelemetryEvent(sample, { insert })
    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(sample)
  })

  it('returns false without throwing when no database URL is configured', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')
    const ok = await persistTelemetryEvent(sample)
    expect(ok).toBe(false)
  })

  it('catches write errors without throwing', async () => {
    const onError = vi.fn()
    const ok = await persistTelemetryEvent(sample, {
      insert: async () => {
        throw new Error('connection refused')
      },
      onError,
    })
    expect(ok).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('api/telemetry handler', () => {
  it('handles OPTIONS, rejects non-POST, rejects invalid events, and returns 204 on valid POST', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('POSTGRES_URL', '')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const resOpt = mockRes()
    await handler({ method: 'OPTIONS', headers: {} } as unknown as VercelRequest, resOpt as unknown as VercelResponse)
    expect(resOpt.statusCode).toBe(204)

    const resGet = mockRes()
    await handler({ method: 'GET', headers: {} } as unknown as VercelRequest, resGet as unknown as VercelResponse)
    expect(resGet.statusCode).toBe(405)

    const resBad = mockRes()
    await handler(
      { method: 'POST', headers: {}, body: { event: 'bogus' } } as unknown as VercelRequest,
      resBad as unknown as VercelResponse,
    )
    expect(resBad.statusCode).toBe(400)

    const resOk = mockRes()
    await handler(
      {
        method: 'POST',
        headers: { 'x-vercel-ip-country': 'US' },
        body: { event: 'server_start', tier: 'pro', client: 'claude-code', anonId: 'a1' },
      } as unknown as VercelRequest,
      resOk as unknown as VercelResponse,
    )
    expect(resOk.statusCode).toBe(204)
    expect(resOk.ended).toBe(true)
    expect(logSpy).toHaveBeenCalledWith('[tinypivot-telemetry]', expect.stringContaining('"event":"server_start"'))
  })
})
