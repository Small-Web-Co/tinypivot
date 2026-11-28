/**
 * Vercel Cron endpoint: Daily npm + GitHub growth snapshot into Neon Postgres,
 * followed by a daily usage summary email via Resend.
 *
 * Scheduled once per day in vercel.json (`0 12 * * *` = 7 AM EST / 8 AM EDT).
 * Protected with CRON_SECRET (`Authorization: Bearer <CRON_SECRET>`).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { queryDailyDigest, sendDailyDigestEmail } from '../_lib/daily-digest.js'
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

    const skipEmail = req.query?.email === '0'
    let emailResult: { sent: boolean, reason?: string, subject?: string, id?: string } = {
      sent: false,
      reason: 'skipped',
    }

    if (!skipEmail) {
      const digest = await queryDailyDigest()
      emailResult = await sendDailyDigestEmail(digest)
      if (!emailResult.sent && emailResult.reason) {
        warnings.push(`email: ${emailResult.reason}`)
      }
    }

    return res.status(200).json({
      ok: true,
      upserted,
      emailSent: emailResult.sent,
      subject: emailResult.subject,
      warnings,
    })
  }
  catch (err) {
    console.error('[tinypivot-growth-cron] failed:', err instanceof Error ? err.message : String(err))
    return res.status(500).json({ error: 'Snapshot failed' })
  }
}
