/**
 * Soft seat counting for Team licenses, kept on the Stripe subscription itself (no database).
 *
 * Each install sends a one-way hash tied to its license once a day. The log keeps the day each
 * hash was last seen, in a compact `hash:day,hash:day` string that fits Stripe's 500-character
 * metadata limit. Seats are counted over the last 30 days and only ever produce a notice.
 */

export const TEAM_SEATS = 5
export const SEAT_METADATA_KEY = 'tp_seats'

const WINDOW_DAYS = 30
/** 24 entries of `hash10:day5,` stay under Stripe's 500-character metadata value limit. */
const MAX_TRACKED = 24
const HASH_LENGTH = 10
const INSTALL = /^[0-9a-f]{16}$/

/** Install hash -> UTC day number it was last seen. */
export type SeatLog = Map<string, number>

export const dayNumber = (now: Date) => Math.floor(now.getTime() / 86_400_000)

export function isInstallHash(value: unknown): value is string {
  return typeof value === 'string' && INSTALL.test(value)
}

export function parseSeatLog(raw: string | undefined): SeatLog {
  const log: SeatLog = new Map()
  for (const entry of (raw ?? '').split(',')) {
    const [hash, day] = entry.split(':')
    if (hash && Number.isInteger(Number(day)))
      log.set(hash, Number(day))
  }
  return log
}

export function serializeSeatLog(log: SeatLog): string {
  return [...log].map(([hash, day]) => `${hash}:${day}`).join(',')
}

/** The log with this install seen today, entries older than 30 days dropped, newest kept first. */
export function recordSeat(log: SeatLog, install: string, today: number): SeatLog {
  const next = new Map([...log].filter(([, day]) => today - day < WINDOW_DAYS))
  next.set(install.slice(0, HASH_LENGTH), today)
  return new Map([...next].sort((a, b) => b[1] - a[1]).slice(0, MAX_TRACKED))
}
