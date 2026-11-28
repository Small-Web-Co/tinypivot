/**
 * Filter known spoofed-referrer bot campaigns out of Vercel Web Analytics.
 */

const BLOCKED_REFERRER_HOSTS = new Set([
  'aocr.org',
])

export function isBlockedReferrer(referrer: string | undefined | null): boolean {
  if (!referrer)
    return false
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    for (const blocked of BLOCKED_REFERRER_HOSTS) {
      if (host === blocked || host.endsWith(`.${blocked}`))
        return true
    }
    return false
  }
  catch {
    return false
  }
}

export function filterAnalyticsEvent<T>(event: T, referrer?: string): T | null {
  const ref = referrer ?? (typeof document !== 'undefined' ? document.referrer : '')
  if (isBlockedReferrer(ref))
    return null
  return event
}
