/**
 * Vercel Serverless Function: Privacy-First Anonymous MCP Telemetry
 *
 * Accepts strictly validated, zero-PII usage events from @smallwebco/tinypivot-mcp
 * (client harness name, tool name, row-count bucket, tier, OS, package version, random anonId).
 * Never accepts or stores row data, column names, SQL queries, or file paths.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseTelemetryRecord, persistTelemetryEvent } from './_lib/telemetry-store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const record = parseTelemetryRecord(req.body, req.headers['x-vercel-ip-country'])
  if (!record) {
    return res.status(400).json({ error: 'Invalid telemetry event' })
  }

  // Structured JSON log for Vercel runtime logs / log drains
  console.log('[tinypivot-telemetry]', JSON.stringify(record))

  // Durable persistence in Neon Postgres (best-effort; never fails the ping)
  await persistTelemetryEvent(record)

  return res.status(204).end()
}
