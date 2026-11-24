/**
 * Vercel Serverless Function: Privacy-First Anonymous MCP Telemetry
 *
 * Accepts strictly validated, zero-PII usage events from @smallwebco/tinypivot-mcp
 * (client harness name, tool name, row-count bucket, tier, OS, package version, random anonId).
 * Never accepts or stores row data, column names, SQL queries, or file paths.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const ALLOWED_EVENTS = new Set(['server_start', 'tool_call'])
const ALLOWED_TIERS = new Set(['free', 'pro'])
const ALLOWED_BUCKETS = new Set(['<100', '100-1k', '1k-2.5k', '2.5k-10k', '10k+'])

function cleanToken(val: unknown, maxLen = 48): string | undefined {
  if (typeof val !== 'string')
    return undefined
  const cleaned = val.trim().replace(/[^\w.:/ -]/g, '').slice(0, maxLen)
  return cleaned || undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {}
  const event = typeof body.event === 'string' && ALLOWED_EVENTS.has(body.event) ? body.event : null
  const tier = typeof body.tier === 'string' && ALLOWED_TIERS.has(body.tier) ? body.tier : 'free'

  if (!event) {
    return res.status(400).json({ error: 'Invalid telemetry event' })
  }

  const record = {
    event,
    tier,
    tool: cleanToken(body.tool, 40),
    rowBucket: typeof body.rowBucket === 'string' && ALLOWED_BUCKETS.has(body.rowBucket) ? body.rowBucket : undefined,
    client: cleanToken(body.client, 48),
    truncated: typeof body.truncated === 'boolean' ? body.truncated : undefined,
    version: cleanToken(body.version, 20),
    os: cleanToken(body.os, 20),
    anonId: cleanToken(body.anonId, 48),
    country: cleanToken(req.headers['x-vercel-ip-country'], 8),
    ts: new Date().toISOString(),
  }

  // Structured JSON log for Vercel Log Drains / PostHog / Axiom / Datadog ingestion
  console.log('[tinypivot-telemetry]', JSON.stringify(record))

  return res.status(204).end()
}
