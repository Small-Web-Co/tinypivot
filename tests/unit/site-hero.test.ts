import { describe, expect, it } from 'vitest'
import { heroSlides, slideClaims, slideTheme } from '../../demo/site/heroCharts'

describe('the hero charts', () => {
  it('back every number in each answer with the data the chart draws, as the Studio checks it', () => {
    for (const slide of heroSlides) {
      const claims = slideClaims(slide)
      expect(claims.length, slide.id).toBeGreaterThan(1)
      expect(claims.filter(claim => claim.status !== 'found'), slide.id).toEqual([])
    }
  })

  it('shows each chart in its own TinyPivot theme', () => {
    expect(new Set(heroSlides.map(slide => slide.theme)).size).toBe(heroSlides.length)
    expect(slideTheme(heroSlides[0]).isDark).toBe(true)
  })
})
