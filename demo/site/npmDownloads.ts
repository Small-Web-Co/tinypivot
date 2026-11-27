/** Live npm download totals for the TinyPivot packages, shown on the home page. */

export const NPM_PACKAGES = ['core', 'vue', 'react', 'server', 'mcp'].map(name => `@smallwebco/tinypivot-${name}`)

/** The month the first package was published; counting starts here. */
export const FIRST_PUBLISH = '2025-12-01'

/** The total when the site was last updated: shown until the live count loads, and in page metadata. */
export const NPM_DOWNLOADS_SNAPSHOT = 70_677

/** "70,000+": the snapshot rounded down, for text that cannot update itself. */
export const NPM_DOWNLOADS_ROUNDED = `${(Math.floor(NPM_DOWNLOADS_SNAPSHOT / 1000) * 1000).toLocaleString('en-US')}+`

/** npm's download API answers at most 18 months per request. */
const MAX_RANGE_DAYS = 540
const DAY_MS = 86_400_000
const CACHE_KEY = 'tp-npm-downloads'
const CACHE_MS = 6 * 3_600_000

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

/** `start:end` ranges of at most 18 months that together cover start to end. */
export function downloadRanges(start: string, end: string): string[] {
  const ranges: string[] = []
  const last = new Date(`${end}T00:00:00Z`)
  for (let from = new Date(`${start}T00:00:00Z`); from <= last; from = new Date(from.getTime() + MAX_RANGE_DAYS * DAY_MS)) {
    const to = new Date(Math.min(from.getTime() + (MAX_RANGE_DAYS - 1) * DAY_MS, last.getTime()))
    ranges.push(`${isoDay(from)}:${isoDay(to)}`)
  }
  return ranges
}

/** All-time downloads of every TinyPivot package, summed from npm's public API. */
export async function fetchNpmDownloads(fetchFn: typeof fetch = fetch, today = new Date()): Promise<number> {
  const ranges = downloadRanges(FIRST_PUBLISH, isoDay(today))
  const counts = await Promise.all(NPM_PACKAGES.flatMap(pkg => ranges.map(async (range) => {
    const res = await fetchFn(`https://api.npmjs.org/downloads/point/${range}/${pkg}`)
    if (!res.ok)
      throw new Error(`npm downloads ${res.status}`)
    const body = await res.json() as { downloads?: number }
    return body.downloads ?? 0
  })))
  return counts.reduce((sum, n) => sum + n, 0)
}

let pending: Promise<number | undefined> | undefined

/** The live total, fetched once per page load and cached for a few hours; undefined if npm is unreachable. */
export function loadNpmDownloads(): Promise<number | undefined> {
  pending ??= (async () => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { total: number, at: number } | null
      if (cached && Date.now() - cached.at < CACHE_MS)
        return cached.total
      const total = await fetchNpmDownloads()
      localStorage.setItem(CACHE_KEY, JSON.stringify({ total, at: Date.now() }))
      return total
    }
    catch {
      return undefined
    }
  })()
  return pending
}

/** Where the count-up starts: a few percent below, so the tick is visible but short. */
export function countUpStart(total: number): number {
  return Math.floor(total * 0.97)
}

export const formatCount = (n: number) => n.toLocaleString('en-US')
