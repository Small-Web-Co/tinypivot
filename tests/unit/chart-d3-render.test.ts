/**
 * Mounts every D3 chart type into a DOM and checks it draws with the active
 * theme: palette fills, 1-bit patterns, CRT glow, and reduced motion.
 */
import type { ChartConfig, ChartThemePreset } from '../../packages/core/src'
import type { D3ChartSpec } from '../../packages/core/src/d3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getChartLook, getD3ChartTheme, UNIFIED_THEME_IDS } from '../../packages/core/src'
import { loadMapShapes, mountD3Chart } from '../../packages/core/src/d3'
import { seriesLabelSpoke, wrapLabel } from '../../packages/core/src/d3/radial'
import { placeLabels } from '../../packages/core/src/d3/slope'

const dim = (field: string) => ({ field, role: 'dimension' as const })
const sum = (field: string) => ({ field, role: 'measure' as const, aggregation: 'sum' as const })

const ROWS = ['France', 'Germany', 'Brazil', 'Japan'].flatMap((country, i) =>
  ['Jan', 'Feb', 'Mar', 'Apr'].flatMap(month => [2025, 2026].map(year => ({
    country,
    rep: `Rep ${i}`,
    product: `Acme Plan ${i}`,
    category: i % 2 ? 'Hardware' : 'Software',
    month,
    year,
    bookings: 100 + i * 40 + (year === 2026 ? i * 10 : 0),
    quota: 150,
  }))))

const CONFIGS: ChartConfig[] = [
  { type: 'choropleth', xAxis: dim('country'), yAxis: sum('bookings') },
  { type: 'bullet', xAxis: dim('rep'), yAxis: sum('bookings'), targetField: sum('quota') },
  { type: 'radialBar', xAxis: dim('product'), yAxis: sum('bookings'), seriesField: dim('year') },
  { type: 'radialArea', xAxis: dim('month'), yAxis: sum('bookings'), seriesField: dim('year') },
  { type: 'slope', xAxis: dim('product'), yAxis: sum('bookings'), seriesField: dim('year') },
  { type: 'treemap', xAxis: dim('product'), yAxis: sum('bookings'), seriesField: dim('category') },
  { type: 'sunburst', xAxis: dim('product'), yAxis: sum('bookings'), seriesField: dim('category') },
]

function specFor(config: ChartConfig, preset: ChartThemePreset): D3ChartSpec {
  return { config, data: ROWS, theme: getD3ChartTheme(getChartLook(preset as never, preset), preset), animate: false }
}

async function mount(spec: D3ChartSpec) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const statuses: string[][] = []
  const handle = mountD3Chart(host, spec, s => statuses.push(s.notes))
  if (spec.config.type === 'choropleth')
    await loadMapShapes('world')
  await new Promise(resolve => setTimeout(resolve, 0))
  return { host, handle, statuses }
}

describe('d3 renderer', () => {
  beforeAll(() => {
    // happy-dom has no layout; give every element a size so charts draw.
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 640 })
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 420 })
  })
  afterAll(() => {
    delete (Element.prototype as { clientWidth?: number }).clientWidth
    delete (Element.prototype as { clientHeight?: number }).clientHeight
  })

  for (const preset of UNIFIED_THEME_IDS) {
    describe(`${preset} theme`, () => {
      for (const config of CONFIGS) {
        it(`draws ${config.type} with the theme's fills`, async () => {
          const spec = specFor(config, preset)
          const { host, handle } = await mount(spec)
          const marks = host.querySelectorAll('.vpg-d3-mark')
          expect(marks.length).toBeGreaterThan(0)
          const fills = Array.from(marks, m => m.getAttribute('fill') ?? m.getAttribute('stroke') ?? '')
          if (spec.theme.fillMode === 'pattern')
            expect(fills.some(f => f.startsWith('url(#') || f === spec.theme.ink)).toBe(true)
          else
            expect(fills.some(f => spec.theme.palette.includes(f) || spec.theme.sequential.includes(f) || f.startsWith('#'))).toBe(true)
          if (spec.theme.glow)
            expect(host.querySelector('[filter^="url(#"]')).not.toBeNull()
          expect(host.querySelector('.vpg-d3-headline')?.textContent).toBeTruthy()
          handle.destroy()
          expect(host.querySelector('svg')).toBeNull()
        })
      }
    })
  }

  it('writes 1-bit patterns into the SVG defs', async () => {
    const { host, handle } = await mount(specFor(CONFIGS[5], 'onebit'))
    expect(host.querySelectorAll('defs pattern').length).toBeGreaterThan(5)
    handle.destroy()
  })

  it('reports unmatched map labels as a note', async () => {
    const { host, statuses, handle } = await mount({ ...specFor(CONFIGS[0], 'paper'), data: [...ROWS, { country: 'Atlantis', bookings: 5 }] })
    expect(statuses.at(-1)?.join(' ')).toContain('"Atlantis"')
    expect(host.querySelector('.vpg-d3-footer')?.textContent).toContain('not found on the world map')
    handle.destroy()
  })

  it('hides the headline when annotations are off', async () => {
    const config = { ...CONFIGS[1], options: { annotations: false } }
    const { host, handle } = await mount(specFor(config, 'paper'))
    expect((host.querySelector('.vpg-d3-header') as HTMLElement).hidden).toBe(true)
    handle.destroy()
  })

  it('draws final positions at once when the user prefers reduced motion', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { host, handle } = await mount({ ...specFor(CONFIGS[1], 'paper'), animate: true })
    const bars = Array.from(host.querySelectorAll('rect.vpg-d3-mark'), r => Number(r.getAttribute('width')))
    expect(bars.every(w => w > 0)).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    handle.destroy()
    vi.unstubAllGlobals()
  })

  it('lights the story marks in the accent and mutes the rest (house style)', async () => {
    const spec = specFor(CONFIGS[2], 'paper')
    const { host, handle } = await mount(spec)
    const fills = new Set(Array.from(host.querySelectorAll('path.vpg-d3-mark'), m => m.getAttribute('fill')))
    expect(fills.has(spec.theme.accent)).toBe(true)
    expect(fills.has(spec.theme.quiet[0])).toBe(true)
    expect(host.querySelector('.vpg-d3-kicker')?.textContent).toBe('Bookings by product')
    expect(host.querySelectorAll('.vpg-d3-key-item').length).toBe(2)
    handle.destroy()
  })

  it('gives each series its palette colour with emphasis: palette', async () => {
    const spec = specFor({ ...CONFIGS[2], options: { emphasis: 'palette' } }, 'paper')
    const { host, handle } = await mount(spec)
    const fills = new Set(Array.from(host.querySelectorAll('path.vpg-d3-mark'), m => m.getAttribute('fill')))
    expect(fills.has(spec.theme.palette[1])).toBe(true)
    expect(fills.has(spec.theme.quiet[0])).toBe(false)
    handle.destroy()
  })

  it('writes the source and footnote under the chart', async () => {
    const { host, handle } = await mount(specFor({ ...CONFIGS[1], options: { source: 'acme-bookings.csv' } }, 'paper'))
    expect(host.querySelector('.vpg-d3-footer')?.textContent).toContain('Source: acme-bookings.csv · Bookings: sum of bookings')
    handle.destroy()
  })

  it('redraws when the spec changes', async () => {
    const { host, handle } = await mount(specFor(CONFIGS[1], 'paper'))
    handle.update(specFor(CONFIGS[5], 'crt-green'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(host.querySelector('.vpg-d3-headline')?.textContent).toContain('of bookings')
    handle.destroy()
  })
})

describe('slope label placement', () => {
  it('places important labels first and drops the rest when crowded', () => {
    const ys = placeLabels([
      { y: 100, priority: 1, reach: 5 },
      { y: 102, priority: 9, reach: 5 },
      { y: 104, priority: 5, reach: 40 },
      { y: 300, priority: 0, reach: 5 },
    ], 12, 0, 400)
    expect(ys[1]).toBe(102)
    expect(ys[0]).toBeNull()
    expect(Math.abs(ys[2]! - 102)).toBeGreaterThanOrEqual(12)
    expect(ys[3]).toBe(300)
  })

  it('keeps labels inside the plot', () => {
    const ys = placeLabels([{ y: 398, priority: 1, reach: 20 }, { y: 399, priority: 0, reach: 20 }], 12, 0, 400)
    expect(ys.every(y => y === null || y <= 400)).toBe(true)
  })
})

describe('radial series names', () => {
  it('names series where the lines sit furthest apart, away from the peak', () => {
    const series = [{ data: [10, 50, 30, 90, 20, 10] }, { data: [12, 20, 28, 40, 22, 11] }]
    expect(seriesLabelSpoke(series, 0)).toBe(3)
    expect(seriesLabelSpoke(series, 3)).toBe(1)
  })
})

describe('radial label wrapping', () => {
  it('wraps long names onto two lines at a space', () => {
    expect(wrapLabel('Analytics Pro')).toEqual(['Analytics', 'Pro'])
    expect(wrapLabel('Vault')).toEqual(['Vault'])
    expect(wrapLabel('Supercalifragilistic')[0].endsWith('…')).toBe(true)
  })
})
