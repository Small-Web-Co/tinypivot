/**
 * Durable Postgres persistence for privacy-first anonymous MCP telemetry.
 *
 * Writes validated, zero-PII events to Neon Postgres (`DATABASE_URL` / `POSTGRES_URL`).
 * Uses lazy HTTP client initialization so builds and tests work without a DB URL,
 * and swallows write errors so telemetry never breaks the endpoint.
 */

import { neon } from '@neondatabase/serverless'

const ALLOWED_EVENTS = new Set([
  'server_start',
  'tool_call',
  'gate_hit',
  'init',
  'studio_open',
] as const)

const ALLOWED_TIERS = new Set(['free', 'pro'] as const)
const ALLOWED_BUCKETS = new Set(['<100', '100-1k', '1k-2.5k', '2.5k-10k', '10k+'] as const)
const ALLOWED_OUTCOMES = new Set(['ok', 'error'] as const)
const ALLOWED_ERROR_CODES = new Set([
  'duckdb_init',
  'file_not_found',
  'file_parse',
  'dataset_not_found',
  'warehouse_auth',
  'warehouse_timeout',
  'warehouse_query',
  'query_syntax',
  'query_error',
  'analyze_error',
  'invalid_input',
  'unknown',
] as const)

export type TelemetryEventName = 'server_start' | 'tool_call' | 'gate_hit' | 'init' | 'studio_open'
export type TelemetryTier = 'free' | 'pro'
export type TelemetryRowBucket = '<100' | '100-1k' | '1k-2.5k' | '2.5k-10k' | '10k+'
export type TelemetryOutcome = 'ok' | 'error'
export type TelemetryErrorCode
  = | 'duckdb_init'
    | 'file_not_found'
    | 'file_parse'
    | 'dataset_not_found'
    | 'warehouse_auth'
    | 'warehouse_timeout'
    | 'warehouse_query'
    | 'query_syntax'
    | 'query_error'
    | 'analyze_error'
    | 'invalid_input'
    | 'unknown'

export interface TelemetryRecord {
  event: TelemetryEventName
  tier: TelemetryTier
  tool?: string
  rowBucket?: TelemetryRowBucket
  client?: string
  truncated?: boolean
  outcome?: TelemetryOutcome
  errorCode?: TelemetryErrorCode
  feature?: string
  version?: string
  os?: string
  anonId?: string
  country?: string
  ts: string
}

export const TELEMETRY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS telemetry_events (
    id         BIGSERIAL PRIMARY KEY,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
    event      TEXT NOT NULL,
    tier       TEXT NOT NULL,
    tool       TEXT,
    row_bucket TEXT,
    client     TEXT,
    truncated  BOOLEAN,
    outcome    TEXT,
    error_code TEXT,
    feature    TEXT,
    version    TEXT,
    os         TEXT,
    anon_id    TEXT,
    country    TEXT
  )`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS outcome TEXT`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS error_code TEXT`,
  `ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS feature TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_ts ON telemetry_events (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_anon_ts ON telemetry_events (anon_id, ts DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_ts ON telemetry_events (event, ts DESC)`,
] as const

export function cleanToken(val: unknown, maxLen = 48): string | undefined {
  if (typeof val !== 'string')
    return undefined
  const cleaned = val.trim().replace(/[^\w.:,/ -]/g, '').slice(0, maxLen)
  return cleaned || undefined
}

export function parseTelemetryRecord(
  rawBody: unknown,
  countryHeader: unknown,
  now = new Date(),
): TelemetryRecord | null {
  const body = (rawBody && typeof rawBody === 'object') ? rawBody as Record<string, unknown> : {}
  const event = typeof body.event === 'string' && ALLOWED_EVENTS.has(body.event as TelemetryEventName)
    ? body.event as TelemetryEventName
    : null

  if (!event)
    return null

  const tier: TelemetryTier = typeof body.tier === 'string' && ALLOWED_TIERS.has(body.tier as TelemetryTier)
    ? body.tier as TelemetryTier
    : 'free'

  const rowBucket = typeof body.rowBucket === 'string' && ALLOWED_BUCKETS.has(body.rowBucket as TelemetryRowBucket)
    ? body.rowBucket as TelemetryRowBucket
    : undefined

  const outcome = typeof body.outcome === 'string' && ALLOWED_OUTCOMES.has(body.outcome as TelemetryOutcome)
    ? body.outcome as TelemetryOutcome
    : undefined

  const errorCode = typeof body.errorCode === 'string' && ALLOWED_ERROR_CODES.has(body.errorCode as TelemetryErrorCode)
    ? body.errorCode as TelemetryErrorCode
    : undefined

  return {
    event,
    tier,
    tool: cleanToken(body.tool, 40),
    rowBucket,
    client: cleanToken(body.client, 48),
    truncated: typeof body.truncated === 'boolean' ? body.truncated : undefined,
    outcome,
    errorCode,
    feature: cleanToken(body.feature, 40),
    version: cleanToken(body.version, 20),
    os: cleanToken(body.os, 20),
    anonId: cleanToken(body.anonId, 48),
    country: cleanToken(countryHeader, 8),
    ts: now.toISOString(),
  }
}

type NeonClient = ReturnType<typeof neon>

let cachedUrl: string | undefined
let cachedClient: NeonClient | null = null

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined
}

export function getSqlClient(urlOverride?: string): NeonClient | null {
  const url = urlOverride?.trim() || getDatabaseUrl()
  if (!url)
    return null
  if (cachedClient && cachedUrl === url)
    return cachedClient
  cachedUrl = url
  cachedClient = neon(url)
  return cachedClient
}

export interface PersistTelemetryDeps {
  insert?: (record: TelemetryRecord) => Promise<void>
  onError?: (err: unknown) => void
}

async function defaultInsert(record: TelemetryRecord): Promise<boolean> {
  const sql = getSqlClient()
  if (!sql)
    return false

  await sql`
    INSERT INTO telemetry_events (
      ts, event, tier, tool, row_bucket, client, truncated, outcome, error_code, feature, version, os, anon_id, country
    ) VALUES (
      ${record.ts},
      ${record.event},
      ${record.tier},
      ${record.tool ?? null},
      ${record.rowBucket ?? null},
      ${record.client ?? null},
      ${record.truncated ?? null},
      ${record.outcome ?? null},
      ${record.errorCode ?? null},
      ${record.feature ?? null},
      ${record.version ?? null},
      ${record.os ?? null},
      ${record.anonId ?? null},
      ${record.country ?? null}
    )
  `
  return true
}

export async function persistTelemetryEvent(
  record: TelemetryRecord,
  deps: PersistTelemetryDeps = {},
): Promise<boolean> {
  try {
    if (deps.insert) {
      await deps.insert(record)
      return true
    }
    return await defaultInsert(record)
  }
  catch (err) {
    if (deps.onError)
      deps.onError(err)
    else
      console.error('[tinypivot-telemetry] persist failed:', err instanceof Error ? err.message : String(err))
    return false
  }
}
