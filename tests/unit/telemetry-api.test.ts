import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPublishWindowMap, nextUtcDay } from '../../api/_lib/growth-snapshot'
import { parseTelemetryRecord, persistTelemetryEvent } from '../../api/_lib/telemetry-store'
import cronGrowthHandler from '../../api/cron/growth'
import handler from '../../api/telemetry'
import { filterAnalyticsEvent, isBlockedReferrer } from '../../demo/site/analytics'
import { classifyErrorCode } from '../../packages/mcp/src/telemetry'

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

  it('validates and sanitizes a tool_call payload with outcome, errorCode, and feature', () => {
    const rec = parseTelemetryRecord(
      {
        event: 'tool_call',
        tier: 'pro',
        tool: 'query_postgres; DROP TABLE--',
        rowBucket: '100-1k',
        client: 'claude-code',
        truncated: false,
        outcome: 'error',
        errorCode: 'warehouse_auth',
        feature: 'regression',
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
      outcome: 'error',
      errorCode: 'warehouse_auth',
      feature: 'regression',
      version: '0.9.5',
      os: 'darwin',
      anonId: 'abc-123',
      country: 'US',
      ts: '2026-11-28T00:00:00.000Z',
    })
  })

  it('accepts gate_hit, init, and studio_open events and drops non-allowlisted error codes', () => {
    const gate = parseTelemetryRecord(
      {
        event: 'gate_hit',
        tier: 'free',
        tool: 'analyze',
        feature: 'analyze_pro',
        outcome: 'not-valid',
        errorCode: 'SELECT * FROM secret_table WHERE ssn = 123',
      },
      'DE',
      fixedNow,
    )
    expect(gate).toMatchObject({
      event: 'gate_hit',
      tier: 'free',
      tool: 'analyze',
      feature: 'analyze_pro',
      outcome: undefined,
      errorCode: undefined,
      country: 'DE',
    })

    const initEv = parseTelemetryRecord(
      { event: 'init', tier: 'free', outcome: 'ok', client: 'claude,cursor', feature: 'postgres,bigquery' },
      'US',
      fixedNow,
    )
    expect(initEv).toMatchObject({
      event: 'init',
      outcome: 'ok',
      client: 'claude,cursor',
      feature: 'postgres,bigquery',
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
      outcome: undefined,
      errorCode: undefined,
      feature: undefined,
      version: undefined,
      os: undefined,
      anonId: undefined,
      country: undefined,
      ts: '2026-11-28T00:00:00.000Z',
    })
  })
})

describe('classifyErrorCode', () => {
  it('maps raw errors to fixed zero-PII categories without leaking message content', () => {
    expect(classifyErrorCode(Object.assign(new Error('/Users/alice/secret.csv missing'), { code: 'ENOENT' }))).toBe('file_not_found')
    expect(classifyErrorCode(new Error('Password authentication failed for user "admin"'))).toBe('warehouse_auth')
    expect(classifyErrorCode(new Error('Query timed out after 30000ms'))).toBe('warehouse_timeout')
    expect(classifyErrorCode(new Error('Parser Error: syntax error at or near "SELCT"'))).toBe('query_syntax')
    expect(classifyErrorCode(new Error('Failed to initialize DuckDB binary'))).toBe('duckdb_init')
    expect(classifyErrorCode(new Error('Invalid XLSX workbook header'))).toBe('file_parse')
    expect(classifyErrorCode(new Error('Unexpected private column foo_bar'), 'analyze_error')).toBe('analyze_error')
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

describe('growth-snapshot helpers and cron auth', () => {
  it('marks publish day and next day in publishWindowDays and counts versions per day', () => {
    expect(nextUtcDay('2026-11-30')).toBe('2026-12-01')
    const { publishWindowDays, versionsByDay } = buildPublishWindowMap({
      'created': '2025-12-01T00:00:00.000Z',
      'modified': '2026-11-25T12:00:00.000Z',
      '1.4.0': '2026-11-25T01:00:00.000Z',
      '1.4.1': '2026-11-25T02:00:00.000Z',
    })
    expect(publishWindowDays.has('2026-11-25')).toBe(true)
    expect(publishWindowDays.has('2026-11-26')).toBe(true)
    expect(publishWindowDays.has('2026-11-24')).toBe(false)
    expect(versionsByDay.get('2026-11-25')).toBe(2)
  })

  it('rejects unauthorized requests to /api/cron/growth', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value')

    const resMethod = mockRes()
    await cronGrowthHandler({ method: 'DELETE', headers: {} } as unknown as VercelRequest, resMethod as unknown as VercelResponse)
    expect(resMethod.statusCode).toBe(405)

    const resUnauth = mockRes()
    await cronGrowthHandler({ method: 'GET', headers: { authorization: 'Bearer wrong' } } as unknown as VercelRequest, resUnauth as unknown as VercelResponse)
    expect(resUnauth.statusCode).toBe(401)
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
        body: { event: 'gate_hit', tier: 'free', tool: 'analyze', feature: 'analyze_pro', anonId: 'a1' },
      } as unknown as VercelRequest,
      resOk as unknown as VercelResponse,
    )
    expect(resOk.statusCode).toBe(204)
    expect(resOk.ended).toBe(true)
    expect(logSpy).toHaveBeenCalledWith('[tinypivot-telemetry]', expect.stringContaining('"event":"gate_hit"'))
  })
})

describe('vercel analytics referrer filter', () => {
  it('drops spoofed aocr.org referrer hits and allows normal traffic', () => {
    expect(isBlockedReferrer('https://www.aocr.org/')).toBe(true)
    expect(isBlockedReferrer('https://aocr.org/some-page')).toBe(true)
    expect(isBlockedReferrer('https://github.com/Small-Web-Co/tinypivot')).toBe(false)
    expect(isBlockedReferrer('')).toBe(false)
    expect(isBlockedReferrer('not-a-url')).toBe(false)

    const ev = { type: 'pageview', url: 'https://tiny-pivot.com/' }
    expect(filterAnalyticsEvent(ev, 'https://www.aocr.org/')).toBeNull()
    expect(filterAnalyticsEvent(ev, 'https://google.com/')).toEqual(ev)
  })
})
