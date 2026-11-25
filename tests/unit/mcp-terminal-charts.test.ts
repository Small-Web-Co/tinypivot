import { describe, expect, it } from 'vitest'
import { visualWidth } from '../../packages/mcp/src/card'
import { DatasetStore } from '../../packages/mcp/src/store'
import { formatTerminalChart } from '../../packages/mcp/src/terminal-chart'

const rows = ['Starter', 'Team', 'Business', 'Enterprise'].flatMap((plan, p) =>
  Array.from({ length: 12 }, (_, m) => ({ month: `2026-${String(m + 1).padStart(2, '0')}`, plan, mrr: 1000 + p * 400 + m * 50, seats: (p + 1) * (m + 1) })))
const ds = new DatasetStore().register({ name: 'Acme', source: 'test', rows })
const month = { field: 'month', role: 'dimension' as const }
const plan = { field: 'plan', role: 'dimension' as const }
const mrr = { field: 'mrr', role: 'measure' as const, aggregation: 'sum' as const }

/** Every line of a card is the same width, so its frame lines up in any terminal. */
function expectSquare(card: string) {
  const lines = card.split('\n').filter(line => /^[╭│├╰]/.test(line))
  expect(new Set(lines.map(visualWidth)).size).toBe(1)
}

describe('terminal chart kinds', () => {
  it('draws a pie as shares of the whole, largest first', () => {
    const card = formatTerminalChart(ds, { type: 'pie', xAxis: plan, yAxis: mrr }, { raw: true })
    expect(card).toContain('rows · Pie')
    expect(card.indexOf('Enterprise')).toBeLessThan(card.indexOf('Starter'))
    expect(card).toMatch(/Largest: Enterprise \(\d+\.\d%\)/)
    expectSquare(card)
  })

  it('draws a bar with a series as grouped bars, one row per series', () => {
    const card = formatTerminalChart(ds, { type: 'bar', xAxis: month, yAxis: mrr, seriesField: plan }, { raw: true })
    expect(card).toContain('rows · Grouped Bar')
    expect(card).toContain('  Starter')
    expectSquare(card)
  })

  it('reports grouped bars per bar, never adding series together', () => {
    const roles = ['Analyst', 'Manager']
    const people = Array.from({ length: 40 }, (_, i) => ({ role: roles[i % 2], year: i % 4 < 2 ? 2025 : 2026, utilization: 60 + (i % 7) * 4 }))
    const team = new DatasetStore().register({ name: 'Acme team', source: 'test', rows: people })
    const avgUtilization = { field: 'utilization', role: 'measure' as const, aggregation: 'avg' as const }
    const card = formatTerminalChart(team, { type: 'bar', xAxis: { field: 'role', role: 'dimension' }, yAxis: avgUtilization, seriesField: { field: 'year', role: 'dimension' } }, { raw: true })

    const averages = [...card.matchAll(/^│\s+20(?:25|26)\s+│[^0-9\n]*([0-9.]+)/gm)].map(match => Number(match[1]))
    expect(averages).toHaveLength(4)
    expect(Math.max(...averages)).toBeLessThan(100)
    expect(card).toMatch(/Range [0-9.]+–[0-9.]+ · 4 bars/)
    expect(card).toMatch(/Peak: (Analyst|Manager) · 202[56] \([0-9.]+\)/)
    expect(card).not.toMatch(/\(1\d{2}(\.\d)?\)/)
  })

  it('draws averages asked for as stacked bars side by side instead', () => {
    const avgMrr = { ...mrr, aggregation: 'avg' as const }
    expect(formatTerminalChart(ds, { type: 'stackedBar', xAxis: month, yAxis: avgMrr, seriesField: plan }, { raw: true })).toContain('rows · Grouped Bar')
  })

  it('says why a scatter with a category on x is shown as bars', () => {
    const card = formatTerminalChart(ds, { type: 'scatter', xAxis: plan, yAxis: mrr }, { raw: true })
    expect(card).toContain('rows · Bar')
    expect(card).toContain('plan is not numeric')
  })

  it('plots a scatter per series', () => {
    const card = formatTerminalChart(ds, { type: 'scatter', xAxis: { field: 'seats', role: 'measure' }, yAxis: mrr, seriesField: plan }, { raw: true })
    expect(card).toContain('rows · Scatter')
    expect(card).toContain('● Starter')
  })

  it('keeps stacked bars stacked', () => {
    expect(formatTerminalChart(ds, { type: 'stackedBar', xAxis: month, yAxis: mrr, seriesField: plan }, { raw: true })).toContain('rows · Stacked Bar')
  })

  it('shades a heatmap by value', () => {
    const card = formatTerminalChart(ds, { type: 'heatmap', xAxis: month, yAxis: mrr, seriesField: plan }, { raw: true })
    expect(card).toContain('rows · Heatmap')
    expect(card).toMatch(/· low .* █ high/)
    expectSquare(card)
  })

  it('plots a scatter of two measures', () => {
    const card = formatTerminalChart(ds, { type: 'scatter', xAxis: { field: 'seats', role: 'measure' }, yAxis: mrr, seriesField: plan }, { raw: true })
    expect(card).toContain('rows · Scatter')
    expect(card).toContain('48 points')
    expectSquare(card)
  })

  it('colours each line of a multi-series chart with its own series colour', () => {
    const card = formatTerminalChart(ds, { type: 'line', xAxis: month, yAxis: mrr, seriesField: plan }, { raw: true, colorTheme: 'crt-amber' })
    // The amber palette's first two series colours both appear on the plot rows.
    const plotRows = card.split('\n').filter(line => line.includes('┤') || line.includes('│\u001B[0m\u001B[38'))
    const text = plotRows.join('\n')
    expect(text).toContain('\u001B[38;2;255;176;0m')
    expect(text).toContain('\u001B[38;2;255;122;26m')
  })
})
