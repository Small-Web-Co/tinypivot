/**
 * Chart type registry, choropleth region matching, D3 data shaping and D3 theme tokens.
 */
import type { ChartConfig, ChartThemePreset } from '../../packages/core/src'
import { describe, expect, it } from 'vitest'
import {
  buildChartStory,
  CHART_THEME_IDS,
  CHART_TYPES,
  commonLabelPrefix,
  describeUnmatchedRegions,
  detectGeography,
  formatChartValue,
  formatCompactChartValue,
  getChartGuidance,
  getChartLook,
  getChartRenderer,
  getChartZoneLabels,
  getD3ChartTheme,
  getEffectiveChartOptions,
  HIERARCHY_MAX_LEAVES,
  isChartConfigValid,
  matchRegion,
  matchRegions,
  mixColor,
  processChartDataForBullet,
  processChartDataForChoropleth,
  processChartDataForHierarchy,
  processChartDataForPie,
  processChartDataForSlope,
  resolveChartSortOrder,
  resolveChartType,
  UNIFIED_THEME_IDS,
} from '../../packages/core/src'

const measure = (field: string) => ({ field, role: 'measure' as const, aggregation: 'sum' as const })
const dimension = (field: string) => ({ field, role: 'dimension' as const })

describe('chart type registry', () => {
  it('has one entry per type with an icon path and zone labels', () => {
    const ids = CHART_TYPES.map(t => t.type)
    expect(new Set(ids).size).toBe(ids.length)
    for (const info of CHART_TYPES) {
      expect(info.icon).toMatch(/^M/)
      expect(info.zones.xAxis).toBeTruthy()
      expect(info.zones.yAxis).toBeTruthy()
    }
  })

  it('routes the new types to D3 and keeps the classic ones on ApexCharts', () => {
    for (const type of ['choropleth', 'bullet', 'radialBar', 'radialArea', 'treemap', 'sunburst'] as const)
      expect(getChartRenderer(type)).toBe('d3')
    for (const type of ['bar', 'line', 'pie', 'heatmap', 'radar'] as const)
      expect(getChartRenderer(type)).toBe('apex')
  })

  it('gives every D3 type a terminal fallback note', () => {
    for (const info of CHART_TYPES.filter(t => t.renderer === 'd3'))
      expect(info.terminalFallback?.note).toBeTruthy()
  })

  it('resolves loose names and aliases', () => {
    expect(resolveChartType('map')).toBe('choropleth')
    expect(resolveChartType('World Map')).toBe('choropleth')
    expect(resolveChartType('radial-bar')).toBe('radialBar')
    expect(resolveChartType('gauge')).toBe('radialBar')
    expect(resolveChartType('Polar Area')).toBe('radialArea')
    expect(resolveChartType('actual vs target')).toBe('bullet')
    expect(resolveChartType('tree_map')).toBe('treemap')
    expect(resolveChartType('stacked column')).toBe('stackedBar')
    expect(resolveChartType('doughnut')).toBe('donut')
    expect(resolveChartType('stackedBar')).toBe('stackedBar')
  })

  it('returns null for names it does not know', () => {
    expect(resolveChartType('hologram')).toBeNull()
    expect(resolveChartType('')).toBeNull()
    expect(resolveChartType(undefined)).toBeNull()
  })

  it('exposes the bullet target and heatmap intensity zones by slot', () => {
    expect(getChartZoneLabels('bullet').size?.slot).toBe('targetField')
    expect(getChartZoneLabels('bubble').size?.slot).toBe('sizeField')
    expect(getChartZoneLabels('heatmap').extra?.slot).toBe('colorField')
    expect(getChartZoneLabels('pie').extra).toBeUndefined()
  })

  it('fills type defaults under user options without writing them back', () => {
    const config: ChartConfig = { type: 'choropleth', options: { showLegend: false } }
    expect(getEffectiveChartOptions(config)).toMatchObject({ geography: 'auto', showLegend: false })
    expect(config.options).toEqual({ showLegend: false })
  })

  it('sorts by each type default unless the categories are temporal or the user chose', () => {
    expect(resolveChartSortOrder({ type: 'bullet' }, ['A', 'B'])).toBe('value-desc')
    expect(resolveChartSortOrder({ type: 'radialArea' }, ['A', 'B'])).toBe('label-asc')
    expect(resolveChartSortOrder({ type: 'radialBar' }, ['Jan', 'Feb', 'Mar'])).toBe('label-asc')
    expect(resolveChartSortOrder({ type: 'treemap', options: { sortOrder: 'label-desc' } }, ['A'])).toBe('label-desc')
  })

  it('validates and guides the new types from their zones', () => {
    const bullet: ChartConfig = { type: 'bullet', xAxis: dimension('rep'), yAxis: measure('bookings') }
    expect(isChartConfigValid(bullet)).toBe(true)
    expect(getChartGuidance(bullet)).toContain('Target')
    expect(getChartGuidance({ ...bullet, targetField: measure('quota') })).toBe('Chart is ready!')
    expect(isChartConfigValid({ type: 'treemap', xAxis: dimension('a') })).toBe(false)
  })
})

describe('choropleth region matching', () => {
  it('matches countries by name, alias, ISO alpha-2, alpha-3 and numeric code', () => {
    for (const label of ['France', 'FR', 'FRA', '250', ' france ', 'FRANCE'])
      expect(matchRegion(label, 'world')?.codes).toEqual(['FR'])
    expect(matchRegion('United States', 'world')?.codes).toEqual(['US'])
    expect(matchRegion('USA', 'world')?.codes).toEqual(['US'])
    expect(matchRegion('UK', 'world')?.codes).toEqual(['GB'])
    expect(matchRegion('Côte d\'Ivoire', 'world')?.codes).toEqual(['CI'])
    expect(matchRegion('Ivory Coast', 'world')?.codes).toEqual(['CI'])
    expect(matchRegion('South Korea', 'world')?.codes).toEqual(['KR'])
    expect(matchRegion('4', 'world')?.codes).toEqual(['AF'])
  })

  it('matches US states by name, postal code and FIPS', () => {
    expect(matchRegion('California', 'us-states')?.codes).toEqual(['CA'])
    expect(matchRegion('ca', 'us-states')?.codes).toEqual(['CA'])
    expect(matchRegion('06', 'us-states')?.codes).toEqual(['CA'])
    expect(matchRegion('6', 'us-states')?.codes).toEqual(['CA'])
    expect(matchRegion('Washington, D.C.', 'us-states')?.codes).toEqual(['DC'])
  })

  it('expands sales regions and continents to their countries', () => {
    const emea = matchRegion('EMEA', 'world')!
    expect(emea.kind).toBe('region')
    expect(emea.codes).toEqual(expect.arrayContaining(['FR', 'ZA', 'SA', 'AE']))
    expect(emea.codes).not.toContain('US')
    const apac = matchRegion('Asia Pacific', 'world')!.codes
    expect(apac).toEqual(expect.arrayContaining(['JP', 'AU', 'IN']))
    expect(apac).not.toContain('SA')
    expect(matchRegion('LATAM', 'world')!.codes).toEqual(expect.arrayContaining(['MX', 'BR', 'AR']))
    expect(matchRegion('DACH', 'world')!.codes).toEqual(['DE', 'AT', 'CH'])
  })

  it('reads "North America" as US and Canada only when Latin America is also present', () => {
    const alone = matchRegions([{ label: 'North America', value: 1 }], 'world')
    expect(alone.byCode.get('MX')?.label).toBe('North America')
    const split = matchRegions([{ label: 'North America', value: 1 }, { label: 'Latin America', value: 2 }], 'world')
    expect(split.byCode.get('US')?.label).toBe('North America')
    expect(split.byCode.get('MX')?.label).toBe('Latin America')
  })

  it('keeps country codes ahead of region shorthands', () => {
    expect(matchRegion('SA', 'world')?.codes).toEqual(['SA'])
    expect(matchRegion('ME', 'world')?.codes).toEqual(['ME'])
  })

  it('lets a country row win over a region that contains it', () => {
    const result = matchRegions([{ label: 'France', value: 9 }, { label: 'Europe', value: 1 }], 'world')
    expect(result.byCode.get('FR')?.value).toBe(9)
    expect(result.byCode.get('DE')?.value).toBe(1)
  })

  it('auto-detects the map from the labels', () => {
    expect(detectGeography(['CA', 'TX', 'NY', 'Florida'])).toBe('us-states')
    expect(detectGeography(['Canada', 'Mexico', 'Brazil'])).toBe('world')
    expect(detectGeography(['EMEA', 'APAC', 'Americas'])).toBe('world')
    expect(detectGeography([])).toBe('world')
  })

  it('reports labels it cannot place in a clear sentence', () => {
    const result = matchRegions([{ label: 'France', value: 1 }, { label: 'Atlantis', value: 2 }, { label: 'Mordor', value: 3 }])
    expect(result.unmatched).toEqual(['Atlantis', 'Mordor'])
    const message = describeUnmatchedRegions(result)!
    expect(message).toContain('2 labels not found on the world map')
    expect(message).toContain('"Atlantis"')
    expect(describeUnmatchedRegions({ unmatched: [], geography: 'world' })).toBeNull()
  })

  it('shortens long unmatched lists', () => {
    const unmatched = Array.from({ length: 8 }, (_, i) => `Nowhere ${i}`)
    expect(describeUnmatchedRegions({ unmatched, geography: 'us-states' }, 3)).toContain('and 5 more')
  })
})

describe('d3 data shaping', () => {
  const sales = [
    { rep: 'Ada', region: 'East', bookings: 120, quota: 100 },
    { rep: 'Ada', region: 'East', bookings: 30, quota: 0 },
    { rep: 'Bo', region: 'West', bookings: 85, quota: 100 },
    { rep: 'Cy', region: 'West', bookings: 40, quota: 100 },
    { rep: 'Di', region: 'East', bookings: -5, quota: 50 },
  ]

  it('builds bullet rows with targets, bands and status', () => {
    const data = processChartDataForBullet(sales, { type: 'bullet', xAxis: dimension('rep'), yAxis: measure('bookings'), targetField: measure('quota') })
    expect(data.hasTarget).toBe(true)
    expect(data.rows.map(r => r.label)).toEqual(['Ada', 'Bo', 'Cy', 'Di'])
    const [ada, bo, cy] = data.rows
    expect(ada).toMatchObject({ value: 150, target: 100, status: 'met' })
    expect(bo.status).toBe('near')
    expect(cy.status).toBe('below')
    expect(bo.bands[0]).toBeCloseTo(80)
    expect(bo.bands[1]).toBe(100)
    expect(data.max).toBeCloseTo(157.5)
  })

  it('uses tercile bands when there is no target', () => {
    const data = processChartDataForBullet(sales, { type: 'bullet', xAxis: dimension('rep'), yAxis: measure('bookings') })
    expect(data.hasTarget).toBe(false)
    expect(data.rows.every(r => r.status === null && r.target === null)).toBe(true)
    expect(data.rows[0].bands[0]).toBeLessThan(data.rows[0].bands[1])
    expect(data.rows[0].bands).toEqual(data.rows[1].bands)
  })

  it('truncates very long bullet lists and says how many', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ k: `k${i}`, v: i }))
    const data = processChartDataForBullet(rows, { type: 'bullet', xAxis: dimension('k'), yAxis: measure('v') })
    expect(data.rows).toHaveLength(40)
    expect(data.truncated).toBe(10)
  })

  it('nests treemap leaves under the series field and drops non-positive values', () => {
    const { root, dropped } = processChartDataForHierarchy(sales, { type: 'treemap', xAxis: dimension('rep'), yAxis: measure('bookings'), seriesField: dimension('region') })
    expect(root.children?.map(c => c.name).sort()).toEqual(['East', 'West'])
    const east = root.children!.find(c => c.name === 'East')!
    expect(east.children).toEqual([{ name: 'Ada', value: 150 }])
    expect(dropped).toEqual(['East / Di'])
  })

  it('makes a flat treemap without a series field', () => {
    const { root } = processChartDataForHierarchy(sales, { type: 'treemap', xAxis: dimension('rep'), yAxis: measure('bookings') })
    expect(root.children?.map(c => c.name)).toEqual(['Ada', 'Bo', 'Cy'])
  })

  it('folds the smallest leaves into Other past the leaf cap', () => {
    const rows = Array.from({ length: HIERARCHY_MAX_LEAVES + 20 }, (_, i) => ({ k: `k${i}`, v: i + 1 }))
    const { root, folded } = processChartDataForHierarchy(rows, { type: 'treemap', xAxis: dimension('k'), yAxis: measure('v') })
    expect(root.children).toHaveLength(HIERARCHY_MAX_LEAVES)
    expect(folded).toBe(21)
    const other = root.children!.find(c => c.name.startsWith('Other'))!
    expect(other.name).toBe('Other (21)')
    expect(other.value).toBe(Array.from({ length: 21 }, (_, i) => i + 1).reduce((a, b) => a + b, 0))
  })

  it('aggregates choropleth values per label and reports the range', () => {
    const rows = [
      { country: 'France', revenue: 10 },
      { country: 'FR', revenue: 5 },
      { country: 'Germany', revenue: 30 },
      { country: 'Atlantis', revenue: 99 },
    ]
    const data = processChartDataForChoropleth(rows, { type: 'choropleth', xAxis: dimension('country'), yAxis: measure('revenue') })
    expect(data.geography).toBe('world')
    expect(data.byCode.get('DE')?.value).toBe(30)
    expect(data.unmatched).toEqual(['Atlantis'])
    expect(data.min).toBe(5)
    expect(data.max).toBe(30)
  })

  it('honours an explicit geography', () => {
    const rows = [{ s: 'Georgia', v: 1 }]
    const config = (geography: 'world' | 'us-states'): ChartConfig => ({ type: 'choropleth', xAxis: dimension('s'), yAxis: measure('v'), options: { geography } })
    expect(processChartDataForChoropleth(rows, config('world')).byCode.has('GE')).toBe(true)
    expect(processChartDataForChoropleth(rows, config('us-states')).byCode.has('GA')).toBe(true)
  })

  it('keeps pie processing unchanged after sharing the aggregation helper', () => {
    const pie = processChartDataForPie(sales, { type: 'pie', xAxis: dimension('region'), yAxis: measure('bookings') })
    expect(pie.categories).toEqual(['East', 'West'])
    expect(pie.series[0].data).toEqual([145, 125])
  })
})

describe('d3 theme tokens', () => {
  const themeFor = (preset: ChartThemePreset, grid: Parameters<typeof getChartLook>[0] = preset as never) =>
    getD3ChartTheme(getChartLook(grid, preset), preset)

  it('mixes hex colours', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixColor('#fff', '#000', 0)).toBe('#ffffff')
    expect(mixColor('rgba(0,0,0,1)', '#123456', 0.5)).toBe('#123456')
  })

  it('takes ink, surface and gridlines from the unified theme', () => {
    for (const id of UNIFIED_THEME_IDS) {
      const look = getChartLook(id, id)
      const theme = getD3ChartTheme(look, id)
      expect(theme.ink).toBe(look.foreColor)
      expect(theme.surface).toBe(look.surfaceColor)
      expect(theme.grid).toBe(look.hairlineColor)
      expect(theme.sequential).toHaveLength(5)
      expect(theme.sequential[4]).toBe(theme.accent)
    }
  })

  it('draws 1-bit with patterns and no translucency', () => {
    const theme = themeFor('onebit')
    expect(theme.fillMode).toBe('pattern')
    expect(theme.patternStyles.length).toBeGreaterThan(0)
    expect(theme.areaOpacity).toBe(1)
    expect(theme.markStrokeWidth).toBeGreaterThan(0)
    expect(theme.curve).toBe('step')
  })

  it('gives the CRT looks a glow and monospace labels', () => {
    for (const id of ['crt-amber', 'crt-green'] as const) {
      const theme = themeFor(id)
      expect(theme.glow).not.toBeNull()
      expect(theme.isDark).toBe(true)
      expect(theme.fontLabel).toContain('monospace')
    }
    expect(themeFor('paper').fontLabel).not.toContain('monospace')
    expect(themeFor('paper').glow).toBeNull()
  })

  it('keeps the classic presets on the legacy surface and without a line-only glow', () => {
    for (const id of CHART_THEME_IDS.filter(t => !UNIFIED_THEME_IDS.includes(t as never))) {
      const dark = themeFor(id, 'dark')
      expect(dark.isDark).toBe(true)
      expect(dark.glow).toBeNull()
      expect(dark.fillMode).toBe('solid')
    }
  })

  it('uses custom colours over the preset palette', () => {
    const theme = getD3ChartTheme(getChartLook('light', 'code'), 'code', ['#ff0000'])
    expect(theme.accent).toBe('#ff0000')
  })

  it('formats values consistently', () => {
    expect(formatChartValue(1234.5, 'currency', 2)).toContain('$1,234.50')
    expect(formatChartValue(12.345, 'percent', 1)).toBe('12.3%')
    expect(formatChartValue('x')).toBe('x')
    expect(formatChartValue(Number.NaN)).toBe('')
    expect(formatCompactChartValue(1_250_000)).toBe('1.3M')
    expect(formatCompactChartValue(34_000)).toBe('34K')
    expect(formatCompactChartValue(950)).toBe('950')
  })
})

describe('slope data and chart stories', () => {
  const rows = [
    { product: 'Acme Anvil', year: 2025, bookings: 100 },
    { product: 'Acme Anvil', year: 2026, bookings: 150 },
    { product: 'Acme Magnet', year: 2025, bookings: 200 },
    { product: 'Acme Magnet', year: 2026, bookings: 120 },
    { product: 'Acme Skates', year: 2025, bookings: 0 },
    { product: 'Acme Skates', year: 2026, bookings: 50 },
    { product: 'Acme Skates', year: 2024, bookings: 10 },
  ]
  const slopeConfig: ChartConfig = { type: 'slope', xAxis: dimension('product'), yAxis: measure('bookings'), seriesField: dimension('year') }

  it('compares the first and last period and reports skipped ones', () => {
    const slope = processChartDataForSlope(rows, slopeConfig)!
    expect(slope.from).toBe('2024')
    expect(slope.to).toBe('2026')
    expect(slope.skippedPeriods).toEqual(['2025'])
    expect(slope.rows.find(r => r.label === 'Acme Skates')).toMatchObject({ start: 10, end: 50 })
    expect(processChartDataForSlope(rows, { ...slopeConfig, seriesField: undefined })).toBeNull()
  })

  it('requires a period field to be valid', () => {
    expect(isChartConfigValid({ ...slopeConfig, seriesField: undefined })).toBe(false)
    expect(isChartConfigValid(slopeConfig)).toBe(true)
  })

  it('writes a slope story naming the biggest riser and faller', () => {
    const story = buildChartStory(rows.filter(r => r.year !== 2024), slopeConfig)!
    expect(story.headline).toBe('2 of 3 grew from 2025 to 2026; Acme Anvil rose most (+50%), Acme Magnet fell most (-40%)')
    expect(story.callouts).toEqual(['Acme Anvil', 'Acme Magnet'])
  })

  it('writes map, bullet, radial and hierarchy stories from the same aggregates the charts draw', () => {
    const geo = [{ c: 'France', v: 300 }, { c: 'Germany', v: 100 }, { c: 'Spain', v: 50 }]
    const map = buildChartStory(geo, { type: 'choropleth', xAxis: dimension('c'), yAxis: measure('v') })!
    expect(map.headline).toBe('France leads with 300 v, 6.0× Spain')
    expect(map.callouts).toEqual(['France', 'Germany', 'Spain'])

    const states = buildChartStory([{ s: 'OR', v: 9 }, { s: 'CA', v: 3 }], { type: 'choropleth', xAxis: dimension('s'), yAxis: measure('v') })!
    expect(states.headline).toContain('Oregon leads')

    const months = ['Jan', 'Feb', 'Mar', 'Apr'].map((m, i) => ({ m, v: [10, 40, 20, 5][i] }))
    const radial = buildChartStory(months, { type: 'radialArea', xAxis: dimension('m'), yAxis: measure('v') })!
    expect(radial.headline).toContain('peak in Feb and bottom out in Apr, 88% lower')

    const tree = buildChartStory(geo, { type: 'treemap', xAxis: dimension('c'), yAxis: measure('v') })!
    expect(tree.headline).toBe('The top 3 of 3 make up 100% of v')
  })

  it('uses a user title as the headline and returns null without data', () => {
    const titled = buildChartStory([{ c: 'France', v: 1 }], { type: 'choropleth', xAxis: dimension('c'), yAxis: measure('v'), options: { title: 'Where Acme sells' } })!
    expect(titled.headline).toBe('Where Acme sells')
    expect(buildChartStory([], { type: 'bullet', xAxis: dimension('c'), yAxis: measure('v') })).toBeNull()
    expect(buildChartStory([{ c: 'a', v: 1 }], { type: 'bar', xAxis: dimension('c'), yAxis: measure('v') })).toBeNull()
  })

  it('finds a shared word prefix to drop from tight labels', () => {
    expect(commonLabelPrefix(['Acme Anvil', 'Acme Magnet', 'Acme Skates'])).toBe('Acme ')
    expect(commonLabelPrefix(['Acme Anvil', 'Acme Magnet'])).toBe('')
    expect(commonLabelPrefix(['Anvil', 'Magnet', 'Skates'])).toBe('')
    expect(commonLabelPrefix(['Acme', 'Acme Magnet', 'Acme Skates'])).toBe('')
  })
})
