import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clientSupportsMcpAppsUi,
  createTinyPivotMcpServer,
  DatasetStore,
  formatDatasetSummary,
  formatPivotSummary,
  formatTerminalChart,
  runTuiCommand,
  startCompanionServer,
  TINYPIVOT_CLAUDE_RULE_BLOCK,
  TINYPIVOT_MCP_INSTRUCTIONS,
  upsertTinyPivotRuleBlock,
} from '../../packages/mcp/src/index'
import { isMcpLicenseKey } from '../../packages/mcp/src/server'
import { FREE_TIER_ROW_LIMIT } from '../../packages/mcp/src/store'
import { visualWidth } from '../../packages/mcp/src/summary'
import { bucketRowCount, isTelemetryEnabled } from '../../packages/mcp/src/telemetry'
import { getCompanionSessionFile, isProcessAlive, resolveCompanionUrl } from '../../packages/mcp/src/tui'

function extractFencedCardLines(markdown: string): string[] {
  const match = markdown.match(/```text\n([\s\S]*?)\n```/)
  if (!match)
    return []
  return match[1].split('\n')
}

function assertUniformCardBorderWidth(markdown: string) {
  const lines = extractFencedCardLines(markdown)
  expect(lines.length).toBeGreaterThanOrEqual(4)
  const expectedWidth = visualWidth(lines[0])
  expect(expectedWidth).toBeGreaterThanOrEqual(40)
  for (const line of lines) {
    expect(visualWidth(line)).toBe(expectedWidth)
  }
  expect(lines[0].startsWith('╭─')).toBe(true)
  expect(lines[0].endsWith('─╮')).toBe(true)
  expect(lines[lines.length - 1].startsWith('╰')).toBe(true)
  expect(lines[lines.length - 1].endsWith('╯')).toBe(true)
}

describe('mCP Free-Tier Row Gating & High-Trust Truncation', () => {
  it('truncates datasets above FREE_TIER_ROW_LIMIT and flags sourceTotalRows accurately', () => {
    const store = new DatasetStore({ maxRowsPerDataset: FREE_TIER_ROW_LIMIT })
    const rows = Array.from({ length: 3200 }, (_, i) => ({
      region: i % 2 === 0 ? 'North' : 'South',
      revenue: 10,
    }))

    const ds = store.register({
      name: 'Big Sales',
      source: 'sales.csv',
      ingestionMode: 'direct',
      rows,
    })

    expect(ds.rows.length).toBe(FREE_TIER_ROW_LIMIT)
    expect(ds.sourceTotalRows).toBe(3200)
    expect(ds.truncatedForFreeTier).toBe(true)

    const summary = formatDatasetSummary(ds)
    expect(summary).toContain('Free tier row limit')
    expect(summary).toContain('2,500')
    expect(summary).toContain('3,200')

    const pivotSummary = formatPivotSummary(ds, {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      showRowTotals: true,
      showColumnTotals: true,
    })
    expect(pivotSummary).toContain('first 2,500 of 3,200 rows — Free tier subset')
  })

  it('does not truncate datasets within limit or on Pro tier', () => {
    const proStore = new DatasetStore({ maxRowsPerDataset: Number.POSITIVE_INFINITY })
    const rows = Array.from({ length: 3200 }, (_, i) => ({
      region: i % 2 === 0 ? 'North' : 'South',
      revenue: 10,
    }))

    const ds = proStore.register({
      name: 'Big Sales Pro',
      source: 'sales.csv',
      ingestionMode: 'direct',
      rows,
    })

    expect(ds.rows.length).toBe(3200)
    expect(ds.sourceTotalRows).toBe(3200)
    expect(ds.truncatedForFreeTier).toBe(false)
    expect(formatDatasetSummary(ds)).not.toContain('Free tier row limit')
  })
})

describe('mCP Privacy-First Telemetry Helpers', () => {
  const originalTelemetry = process.env.TINYPIVOT_TELEMETRY
  const originalDnt = process.env.DO_NOT_TRACK

  afterEach(() => {
    if (originalTelemetry === undefined)
      delete process.env.TINYPIVOT_TELEMETRY
    else
      process.env.TINYPIVOT_TELEMETRY = originalTelemetry

    if (originalDnt === undefined)
      delete process.env.DO_NOT_TRACK
    else
      process.env.DO_NOT_TRACK = originalDnt
  })

  it('buckets row counts without exposing exact counts', () => {
    expect(bucketRowCount(42)).toBe('<100')
    expect(bucketRowCount(500)).toBe('100-1k')
    expect(bucketRowCount(2500)).toBe('1k-2.5k')
    expect(bucketRowCount(5000)).toBe('2.5k-10k')
    expect(bucketRowCount(50000)).toBe('10k+')
  })

  it('honors TINYPIVOT_TELEMETRY=0 and DO_NOT_TRACK=1 opt-out flags', () => {
    delete process.env.TINYPIVOT_TELEMETRY
    delete process.env.DO_NOT_TRACK
    expect(isTelemetryEnabled()).toBe(true)

    process.env.TINYPIVOT_TELEMETRY = '0'
    expect(isTelemetryEnabled()).toBe(false)

    delete process.env.TINYPIVOT_TELEMETRY
    process.env.DO_NOT_TRACK = '1'
    expect(isTelemetryEnabled()).toBe(false)
  })
})

describe('mcp license scoping (prevents UI Library key arbitrage)', () => {
  it('accepts TP-MCPP and TP-MCPT keys for MCP Pro and rejects UI Library TP-PRO* keys', () => {
    expect(isMcpLicenseKey('TP-MCPP-abc123-20991231')).toBe(true)
    expect(isMcpLicenseKey('TP-MCPT-abc123-20991231')).toBe(true)
    expect(isMcpLicenseKey('TP-PRO1-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('TP-PROU-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('TP-PROT-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('')).toBe(false)
    expect(isMcpLicenseKey(null)).toBe(false)
  })
})

describe('shareable terminal chart and pivot cards', () => {
  it('exports terminal formatting and TUI helpers from package index', () => {
    expect(typeof formatTerminalChart).toBe('function')
    expect(typeof formatDatasetSummary).toBe('function')
    expect(typeof formatPivotSummary).toBe('function')
    expect(typeof runTuiCommand).toBe('function')
  })

  it('renders a framed Braille line chart with exact border width alignment and removes branding on Pro', () => {
    const store = new DatasetStore()
    const ds = store.register({
      name: 'Monthly Revenue',
      source: 'rev.csv',
      ingestionMode: 'direct',
      rows: [
        { month: '2026-01', revenue: 4200000 },
        { month: '2026-02', revenue: 4800000 },
        { month: '2026-03', revenue: 3900000 },
        { month: '2026-04', revenue: 5100000 },
      ],
    })

    const freeCard = formatTerminalChart(ds, {
      type: 'line',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
    }, { showBranding: true })

    assertUniformCardBorderWidth(freeCard)
    expect(freeCard).toContain('╭─')
    expect(freeCard).toContain('tiny-pivot.com')
    expect(freeCard).toContain('Peak:')
    expect(freeCard).toContain('Low:')
    expect(freeCard).toContain('Avg:')
    expect(freeCard).toContain('+21.4%')
    // Contains Unicode Braille characters (U+2800..U+28FF)
    expect(/[\u2800-\u28FF]/.test(freeCard)).toBe(true)

    const proCard = formatTerminalChart(ds, {
      type: 'line',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
    }, { showBranding: false })
    assertUniformCardBorderWidth(proCard)
    expect(proCard).not.toContain('tiny-pivot.com')
  })

  it('renders stacked bar cards with shade glyph legend and exact border width even on long/Unicode titles', () => {
    const store = new DatasetStore()
    const ds = store.register({
      name: 'グローバル売上 🚀 Extremely Long Multi-Quarter Regional Breakdown Title That Must Truncate Cleanly',
      source: 'global.csv',
      ingestionMode: 'direct',
      rows: [
        { quarter: 'Q1', region: '東京 East', revenue: 420000 },
        { quarter: 'Q1', region: 'North', revenue: 310000 },
        { quarter: 'Q1', region: 'South', revenue: 180000 },
        { quarter: 'Q1', region: 'West', revenue: 260000 },
        { quarter: 'Q2', region: '東京 East', revenue: 480000 },
        { quarter: 'Q2', region: 'North', revenue: 350000 },
        { quarter: 'Q2', region: 'South', revenue: 210000 },
        { quarter: 'Q2', region: 'West', revenue: 295000 },
      ],
    })

    const stackedCard = formatTerminalChart(ds, {
      type: 'stackedBar',
      xAxis: { field: 'quarter', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'region', role: 'dimension' },
    }, { showBranding: true })

    assertUniformCardBorderWidth(stackedCard)
    expect(stackedCard).toContain('█')
    expect(stackedCard).toContain('▓')
    expect(stackedCard).toContain('▒')
    expect(stackedCard).toContain('░')
    expect(stackedCard).toContain('東京 East')
    expect(stackedCard).toContain('tiny-pivot.com')
  })

  it('renders single-series bars with sub-block precision and exact right borders', () => {
    const store = new DatasetStore()
    const ds = store.register({
      name: 'Latency by Route',
      source: 'routes.csv',
      ingestionMode: 'direct',
      rows: [
        { route: '/api/query', ms: 100 },
        { route: '/api/pivot', ms: 63 },
        { route: '/api/export', ms: 27 },
        { route: '/api/health', ms: 4 },
      ],
    })

    const barCard = formatTerminalChart(ds, {
      type: 'bar',
      xAxis: { field: 'route', role: 'dimension' },
      yAxis: { field: 'ms', role: 'measure', aggregation: 'sum' },
    }, { showBranding: false })

    assertUniformCardBorderWidth(barCard)
    expect(/[█▉▊▋▌▍▎▏]/.test(barCard)).toBe(true)
    expect(barCard).not.toContain('tiny-pivot.com')
  })

  it('renders a box-drawn pivot table with inline sparklines, Total row, exact width, and Free vs Pro branding', () => {
    const store = new DatasetStore()
    const ds = store.register({
      name: 'Quarterly Sales',
      source: 'q.csv',
      ingestionMode: 'direct',
      rows: [
        { region: 'North', quarter: 'Q1', revenue: 100 },
        { region: 'North', quarter: 'Q2', revenue: 200 },
        { region: 'North', quarter: 'Q3', revenue: 350 },
        { region: 'South', quarter: 'Q1', revenue: 300 },
        { region: 'South', quarter: 'Q2', revenue: 150 },
        { region: 'South', quarter: 'Q3', revenue: 120 },
      ],
    })

    const freePivot = formatPivotSummary(ds, {
      rowFields: ['region'],
      columnFields: ['quarter'],
      valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      showRowTotals: true,
      showColumnTotals: true,
    }, undefined, { showBranding: true })

    assertUniformCardBorderWidth(freePivot)
    expect(freePivot).toContain('╭─')
    expect(freePivot).toContain('Trend')
    expect(freePivot).toContain('Total')
    expect(freePivot).toContain('tiny-pivot.com')
    expect(/[▁▂▃▄▅▆▇█]/.test(freePivot)).toBe(true)

    const proPivot = formatPivotSummary(ds, {
      rowFields: ['region'],
      columnFields: ['quarter'],
      valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      showRowTotals: true,
      showColumnTotals: true,
    }, undefined, { showBranding: false })

    assertUniformCardBorderWidth(proPivot)
    expect(proPivot).not.toContain('tiny-pivot.com')
    expect(proPivot).toContain('Trend')
    expect(proPivot).toContain('Total')
  })
})

describe('companion server lifecycle & lazy MCP Apps detection', () => {
  const originalXdg = process.env.XDG_CONFIG_HOME

  afterEach(() => {
    if (originalXdg === undefined)
      delete process.env.XDG_CONFIG_HOME
    else
      process.env.XDG_CONFIG_HOME = originalXdg
  })

  it('detects MCP Apps UI support via io.modelcontextprotocol/ui extension capability', () => {
    expect(clientSupportsMcpAppsUi(undefined)).toBe(false)
    expect(clientSupportsMcpAppsUi({})).toBe(false)
    expect(clientSupportsMcpAppsUi({ extensions: {} })).toBe(false)
    expect(clientSupportsMcpAppsUi({
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    })).toBe(true)
  })

  it('writes companion.json on start, cleans it up on close, and ignores stale/dead PIDs', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypivot-companion-test-'))
    process.env.XDG_CONFIG_HOME = tmpDir

    try {
      const store = new DatasetStore()
      const handle = await startCompanionServer({
        store,
        loadHtml: async () => '<html><body>ok</body></html>',
      })

      const sessionFile = getCompanionSessionFile()
      const raw = JSON.parse(await fs.readFile(sessionFile, 'utf8')) as { url: string, pid: number }
      expect(raw.url).toBe(handle.url)
      expect(raw.pid).toBe(process.pid)
      expect(isProcessAlive(process.pid)).toBe(true)
      expect(await resolveCompanionUrl()).toBe(handle.url)

      await handle.close()
      await expect(fs.access(sessionFile)).rejects.toThrow()

      // Write a stale session file pointing to an almost certainly dead PID
      await fs.mkdir(path.dirname(sessionFile), { recursive: true })
      await fs.writeFile(sessionFile, JSON.stringify({ url: 'http://127.0.0.1:59999', pid: 999999 }), 'utf8')
      expect(isProcessAlive(999999)).toBe(false)
      expect(await resolveCompanionUrl()).toBeNull()
      // Stale file should be cleaned up automatically
      await expect(fs.access(sessionFile)).rejects.toThrow()
    }
    finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('mCP default-chart routing instructions & idempotent CLAUDE.md rule injection', () => {
  it('provides authoritative MCP server instructions steering charts & pivots to TinyPivot', () => {
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('load_data')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('load_file')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('chartConfig')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('YoY/MoM')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('INSTEAD of built-in visualization widgets')

    const { server } = createTinyPivotMcpServer()
    // Underlying MCP SDK Server stores serverOptions.instructions on _instructions
    expect((server.server as unknown as { _instructions?: string })._instructions).toBe(TINYPIVOT_MCP_INSTRUCTIONS)
  })

  it('idempotently injects fenced <!-- tinypivot:start --> rule into CLAUDE.md and upgrades legacy markers', () => {
    const initial = '# My Personal Rules\n\nAlways use pnpm.\n'
    const once = upsertTinyPivotRuleBlock(initial)
    expect(once).toContain('# My Personal Rules')
    expect(once).toContain('Always use pnpm.')
    expect(once).toContain('<!-- tinypivot:start -->')
    expect(once).toContain('<!-- tinypivot:end -->')
    expect(once).toContain('INSTEAD of built-in visualization widgets')

    // Re-running must be 100% idempotent with zero duplication
    const twice = upsertTinyPivotRuleBlock(once)
    expect(twice).toBe(once)
    expect(twice.match(/<!-- tinypivot:start -->/g)?.length).toBe(1)

    // Upgrades legacy <!-- tinypivot-mcp:start --> block in-place without duplicating
    const legacy = `# Notes\n\n<!-- tinypivot-mcp:start -->\nold block\n<!-- tinypivot-mcp:end -->\n\nFooter`
    const upgraded = upsertTinyPivotRuleBlock(legacy)
    expect(upgraded).toContain('# Notes')
    expect(upgraded).toContain('Footer')
    expect(upgraded).toContain(TINYPIVOT_CLAUDE_RULE_BLOCK)
    expect(upgraded).not.toContain('old block')
    expect(upgraded.match(/<!-- tinypivot:start -->/g)?.length).toBe(1)
    expect(upgraded).toContain('pi')
    expect(upgraded).toContain('VERY FIRST reply')
  })

  it('plots multi-series YoY Braille line charts independently without summing series or dropping missing months to zero', () => {
    const store = new DatasetStore()
    const ds = store.register({
      name: 'Acme YoY',
      source: 'test',
      rows: [
        { month: 'Jan', year: '2025', revenue: 6_540_000 },
        { month: 'Feb', year: '2025', revenue: 4_660_000 },
        { month: 'Mar', year: '2025', revenue: 5_080_000 },
        { month: 'Jul', year: '2025', revenue: 4_235_000 },
        { month: 'Dec', year: '2025', revenue: 4_048_000 },
        { month: 'Jan', year: '2026', revenue: 4_500_000 },
        { month: 'Feb', year: '2026', revenue: 3_960_000 },
        { month: 'Mar', year: '2026', revenue: 2_985_000 },
      ],
    })

    const card = formatTerminalChart(ds, {
      type: 'line',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'year', role: 'dimension' },
      options: { title: 'Acme Revenue YoY (2025 vs 2026)' },
    })

    assertUniformCardBorderWidth(card)
    expect(card).toContain('━━ 2025')
    expect(card).toContain('┄┄ 2026')
    // Top Y-axis tick must reflect individual series peak (~6.54M), NOT summed 11.04M
    expect(card).toContain('6.54M')
    expect(card).not.toContain('11.04M')

    const summary = formatDatasetSummary(
      { ...ds, chartConfig: { type: 'line', xAxis: { field: 'month', role: 'dimension' }, yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' }, seriesField: { field: 'year', role: 'dimension' } } },
      'http://127.0.0.1:51234',
    )
    expect(summary).toContain('ACTION REQUIRED (Terminal Host — No Inline GUI)')
    expect(summary).toContain('↗ Live: http://127.0.0.1:51234')

    // Direct TTY truecolor ANSI mode keeps uniform visual widths and embeds theme palette RGB
    const coloredStacked = formatTerminalChart(ds, {
      type: 'stackedBar',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'revenue', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'year', role: 'dimension' },
      options: { title: 'Acme revenue by month' },
    }, { colorTheme: 'paper', raw: true, companionUrl: 'http://127.0.0.1:51234' })
    expect(coloredStacked).toContain('\x1B[38;2;255;122;77m')
    expect(coloredStacked).toContain('↗ Live: http://127.0.0.1:51234')
    expect(coloredStacked).not.toContain('```text')
    const coloredWidths = coloredStacked.split('\n').map(l => visualWidth(l))
    expect(new Set(coloredWidths).size).toBe(1)

    // Pivot card embeds live link directly inside the framed box
    const livePivot = formatPivotSummary(ds, {
      rowFields: ['month'],
      columnFields: ['year'],
      valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      showRowTotals: true,
      showColumnTotals: true,
    }, 'http://127.0.0.1:51234', { showBranding: false })
    assertUniformCardBorderWidth(livePivot)
    expect(livePivot).toContain('↗ Live: http://127.0.0.1:51234')
  })

  it('generates a self-contained pi truecolor extension with all 10 unified palettes and /tinypivot-theme command', async () => {
    const { buildPiExtensionSource } = await import('../../packages/mcp/src/index.js')
    const src = buildPiExtensionSource()
    expect(src).toContain('registerEntryRenderer("tinypivot-card"')
    expect(src).toContain('registerCommand("tinypivot-theme"')
    expect(src).toContain('tool_execution_end')
    expect(src).toContain('"crt-amber"')
    expect(src).toContain('"paper"')
    expect(src).toContain('"greenbar"')
    expect(src).toContain('"crt-green"')
    expect(src).toContain('255,')
  })
})
