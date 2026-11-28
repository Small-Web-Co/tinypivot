/**
 * Vercel Cron endpoint: Daily npm + GitHub growth snapshot into Neon Postgres.
 *
 * Scheduled once per day in vercel.json (`0 6 * * *`). Protected with CRON_SECRET
 * (Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when configured).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { collectGrowthSnapshot, upsertGrowthRows } from '../_lib/growth-snapshot.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' })
  }

  const auth = req.headers.authorization
  if (auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { rows, warnings } = await collectGrowthSnapshot({ days: 14 })
    const upserted = await upsertGrowthRows(rows)
    return res.status(200).json({ ok: true, upserted, warnings })
  }
  catch (err) {
    console.error('[tinypivot-growth-cron] failed:', err instanceof Error ? err.message : String(err))
    return res.status(500).json({ error: 'Snapshot failed' })
  }
}
