import { describe, expect, it } from 'vitest'
import { countUpStart, downloadRanges, fetchNpmDownloads, formatCount, NPM_DOWNLOADS_ROUNDED, NPM_PACKAGES } from '../../demo/site/npmDownloads'

describe('live npm download count', () => {
  it('splits the history into ranges npm accepts (at most 18 months each)', () => {
    expect(downloadRanges('2025-12-01', '2026-11-27')).toEqual(['2025-12-01:2026-11-27'])
    expect(downloadRanges('2025-12-01', '2027-12-31')).toEqual(['2025-12-01:2027-05-24', '2027-05-25:2027-12-31'])
  })

  it('sums every package over every range', async () => {
    const asked: string[] = []
    const fakeFetch = (async (url: string) => {
      asked.push(url)
      return { ok: true, json: async () => ({ downloads: 10 }) }
    }) as unknown as typeof fetch
    expect(await fetchNpmDownloads(fakeFetch, new Date('2026-11-27T12:00:00Z'))).toBe(10 * NPM_PACKAGES.length)
    expect(asked[0]).toBe('https://api.npmjs.org/downloads/point/2025-12-01:2026-11-27/@smallwebco/tinypivot-core')
  })

  it('fails rather than undercounting when npm errors', async () => {
    const failing = (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch
    await expect(fetchNpmDownloads(failing)).rejects.toThrow('npm downloads 429')
  })

  it('ticks up from a few percent below and formats with separators', () => {
    expect(countUpStart(70_677)).toBe(68_556)
    expect(formatCount(70_677)).toBe('70,677')
    expect(NPM_DOWNLOADS_ROUNDED).toBe('70,000+')
  })
})
