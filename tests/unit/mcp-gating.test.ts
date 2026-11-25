import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
import { extractSessionKey, isMcpLicenseKey } from '../../packages/mcp/src/server'
import { FREE_TIER_ROW_LIMIT, SAMPLE_DATASET_ID } from '../../packages/mcp/src/store'
import { isNonAdditiveMeasure, visualWidth } from '../../packages/mcp/src/summary'
import { bucketRowCount, isTelemetryEnabled } from '../../packages/mcp/src/telemetry'
import { getCompanionSessionFile, isProcessAlive, resolveCompanionUrl } from '../../packages/mcp/src/tui'

function createMockMcpSession(server: ReturnType<typeof createTinyPivotMcpServer>['server']) {
  const pending = new Map<number, (msg: Record<string, unknown>) => void>()
  let nextId = 1
  const transport = {
    onmessage: undefined as ((msg: unknown, extra?: unknown) => void) | undefined,
    onerror: undefined as ((err: Error) => void) | undefined,
    onclose: undefined as (() => void) | undefined,
    async start() {},
    async close() {},
    async send(msg: Record<string, unknown>) {
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        const resolve = pending.get(msg.id)!
        pending.delete(msg.id)
        resolve(msg)
      }
    },
  }
  const request = (method: string, params: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      transport.onmessage?.({ jsonrpc: '2.0', id, method, params })
    })
  return {
    connect: () => server.connect(transport as never),
    initialize: (capabilities: Record<string, unknown>) =>
      request('initialize', { protocolVersion: '2024-11-05', capabilities, clientInfo: { name: 'test', version: '1.0.0' } }),
    callTool: async (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) => {
      const res = await request('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) })
      return res.result as { structuredContent?: Record<string, unknown>, content?: Array<{ text: string }> }
    },
  }
}

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
    expect(summary).toContain('**Free tier:** showing the first')
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
    expect(formatDatasetSummary(ds)).not.toContain('Free tier')
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
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('period comparisons')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('instead of drawing them yourself')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('verbatim')

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
    expect(once).toContain('instead of drawing them yourself')

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
    expect(upgraded).toContain('verbatim')
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
    expect(summary).toContain('Show the card above to the user verbatim.')
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

describe('per-session dataset isolation & zero cross-chat leakage (v0.2.3)', () => {
  const originalTelemetry = process.env.TINYPIVOT_TELEMETRY

  beforeEach(() => {
    process.env.TINYPIVOT_TELEMETRY = '0'
  })

  afterEach(() => {
    if (originalTelemetry === undefined)
      delete process.env.TINYPIVOT_TELEMETRY
    else
      process.env.TINYPIVOT_TELEMETRY = originalTelemetry
  })

  it('auto-hides sample_sales once any real dataset is loaded and isolates explicit sessionKeys', () => {
    const store = new DatasetStore()

    // Fresh session sees sample_sales only
    expect(store.listMetadata().map(d => d.id)).toEqual([SAMPLE_DATASET_ID])

    // Session A loads Edgeworth -> sample_sales auto-hidden in Session A
    const dsA = store.register({
      name: 'Edgeworth Revenue',
      source: 'edgeworth.csv',
      rows: [{ month: '2026-01', revenue: 500 }],
      sessionKey: 'chat-a',
    })
    expect(store.listMetadata('chat-a').map(d => d.id)).toEqual([dsA.id])

    // Brand-new Session B does NOT see Session A's dataset
    expect(store.listMetadata('chat-b').map(d => d.id)).toEqual([SAMPLE_DATASET_ID])
    expect(store.get(undefined, 'chat-b')?.id).toBe(SAMPLE_DATASET_ID)

    // Session B loads Asthma TRx share -> isolated to Session B only
    const dsB = store.register({
      name: 'Asthma TRx Share',
      source: 'asthma.csv',
      rows: [{ month: '2026-01', share_pct: 48.2 }],
      sessionKey: 'chat-b',
    })
    expect(store.listMetadata('chat-b').map(d => d.id)).toEqual([dsB.id])
    expect(store.listMetadata('chat-a').map(d => d.id)).toEqual([dsA.id])

    // Clearing Session A restores sample_sales for A without touching B, while exact ID lookup still works
    expect(store.clearSession('chat-a')).toBe(1)
    expect(store.listMetadata('chat-a').map(d => d.id)).toEqual([SAMPLE_DATASET_ID])
    expect(store.listMetadata('chat-b').map(d => d.id)).toEqual([dsB.id])
    expect(store.get(dsA.id)?.name).toBe('Edgeworth Revenue')
  })

  it('extracts session keys from MCP request extra fields and _meta keys', () => {
    expect(extractSessionKey(undefined)).toBeUndefined()
    expect(extractSessionKey({})).toBeUndefined()
    expect(extractSessionKey({ sessionId: 'sess-1' })).toBe('sess-1')
    expect(extractSessionKey({ _meta: { conversationId: 'conv-42' } })).toBe('conv-42')
    expect(extractSessionKey({ _meta: { chatId: 'chat-9' } })).toBe('chat-9')
    expect(extractSessionKey({ _meta: { threadId: 'thr-7' } })).toBe('thr-7')
    expect(extractSessionKey({ _meta: { sessionId: 'meta-sess' } })).toBe('meta-sess')
  })

  it('enforces bounded LRU lookup cap (max 24) while preserving sample_sales', () => {
    const store = new DatasetStore()
    const ids: string[] = []
    for (let i = 1; i <= 28; i++) {
      const ds = store.register({
        name: `Dataset ${i}`,
        source: `d${i}.csv`,
        rows: [{ x: 'A', y: i }],
      })
      ids.push(ds.id)
    }
    expect(store.get(SAMPLE_DATASET_ID)).toBeDefined()
    expect(store.get(ids[0])).toBeUndefined()
    expect(store.get(ids[ids.length - 1])).toBeDefined()
  })

  it('isolates shared-process MCP Apps hosts by default (keepExisting=false) while supporting keepExisting=true, old widget fetches, and clear_datasets', async () => {
    let companionNotifies = 0
    const { server, store } = createTinyPivotMcpServer({
      onStateChanged: () => companionNotifies++,
    })
    const session = createMockMcpSession(server)
    await session.connect()
    await session.initialize({
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    })

    try {
      // Chat 1 loads Edgeworth
      const r1 = await session.callTool('load_data', {
        name: 'Edgeworth Revenue',
        rows: [{ month: '2026-01', revenue: 4200000 }],
      })
      const sc1 = r1.structuredContent as { datasetId: string, datasets: Array<{ id: string }> }
      expect(sc1.datasets.map(d => d.id)).toEqual([sc1.datasetId])
      expect(sc1.datasets.map(d => d.id)).not.toContain(SAMPLE_DATASET_ID)

      // Chat 2 loads Asthma TRx share (no keepExisting -> replaces switcher, zero leakage!)
      const r2 = await session.callTool('load_data', {
        name: 'Asthma TRx Share',
        rows: [{ month: '2026-01', share_pct: 52.4 }],
      })
      const sc2 = r2.structuredContent as { datasetId: string, datasets: Array<{ id: string }> }
      expect(sc2.datasets.map(d => d.id)).toEqual([sc2.datasetId])
      expect(sc2.datasets.map(d => d.id)).not.toContain(sc1.datasetId)

      // Already-rendered Chat 1 widget can still fetch its rows by exact ID!
      expect(store.get(sc1.datasetId)?.name).toBe('Edgeworth Revenue')
      const oldFetch = await session.callTool('fetch_dataset_rows', { datasetId: sc1.datasetId })
      const oldFetchSc = oldFetch.structuredContent as { datasetId: string, rows: Array<{ revenue: number }> }
      expect(oldFetchSc.datasetId).toBe(sc1.datasetId)
      expect(oldFetchSc.rows[0].revenue).toBe(4200000)

      // Same chat loads a second dataset with keepExisting: true -> both remain in switcher
      const r3 = await session.callTool('load_data', {
        name: 'Asthma NRx Share',
        rows: [{ month: '2026-01', share_pct: 49.1 }],
        keepExisting: true,
      })
      const sc3 = r3.structuredContent as { datasetId: string, datasets: Array<{ id: string }> }
      expect(sc3.datasets.map(d => d.id)).toEqual([sc2.datasetId, sc3.datasetId])

      // clear_datasets resets switcher to sample_sales and notifies Companion
      const notifiesBefore = companionNotifies
      const clearRes = await session.callTool('clear_datasets', {})
      const clearSc = clearRes.structuredContent as { cleared: number, datasets: Array<{ id: string }> }
      expect(clearSc.cleared).toBe(2)
      expect(clearSc.datasets.map(d => d.id)).toEqual([SAMPLE_DATASET_ID])
      expect(companionNotifies).toBeGreaterThan(notifiesBefore)
    }
    finally {
      await server.close()
    }
  })

  it('keeps datasets within a dedicated terminal process (non-MCP-Apps) while auto-hiding sample_sales', async () => {
    const { server } = createTinyPivotMcpServer()
    const session = createMockMcpSession(server)
    await session.connect()
    await session.initialize({})

    try {
      await session.callTool('load_data', { name: 'Q1 Sales', rows: [{ month: '2026-01', revenue: 100 }] })
      await session.callTool('load_data', { name: 'Q2 Sales', rows: [{ month: '2026-04', revenue: 200 }] })
      const listed = await session.callTool('list_datasets', {})
      const sc = listed.structuredContent as { datasets: Array<{ id: string, name: string }> }
      expect(sc.datasets.map(d => d.name)).toEqual(['Q1 Sales', 'Q2 Sales'])
      expect(sc.datasets.map(d => d.id)).not.toContain(SAMPLE_DATASET_ID)
    }
    finally {
      await server.close()
    }
  })

  it('automatically isolates conversations when host provides _meta.conversationId', async () => {
    const { server } = createTinyPivotMcpServer()
    const session = createMockMcpSession(server)
    await session.connect()
    await session.initialize({
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    })

    try {
      const c1a = await session.callTool('load_data', { name: 'Chat1 A', rows: [{ x: 'a', y: 1 }] }, { conversationId: 'conv-1' })
      const c1b = await session.callTool('load_data', { name: 'Chat1 B', rows: [{ x: 'b', y: 2 }] }, { conversationId: 'conv-1' })
      const c2a = await session.callTool('load_data', { name: 'Chat2 A', rows: [{ x: 'c', y: 3 }] }, { conversationId: 'conv-2' })

      const sc1a = c1a.structuredContent as { datasetId: string }
      const sc1b = c1b.structuredContent as { datasetId: string, datasets: Array<{ id: string }> }
      const sc2a = c2a.structuredContent as { datasetId: string, datasets: Array<{ id: string }> }

      // Same conversation keeps its datasets automatically
      expect(sc1b.datasets.map(d => d.id)).toEqual([sc1a.datasetId, sc1b.datasetId])
      // Separate conversation is completely isolated
      expect(sc2a.datasets.map(d => d.id)).toEqual([sc2a.datasetId])
    }
    finally {
      await server.close()
    }
  })
})

describe('presentation-only non-additive measure guardrails (share/rate/ratio)', () => {
  it('classifies non-additive measures accurately without false positives on revenue or corporate_sales', () => {
    expect(isNonAdditiveMeasure('share_pct', 'sum')).toBe(true)
    expect(isNonAdditiveMeasure('trx_share', 'sum')).toBe(true)
    expect(isNonAdditiveMeasure('conversionRate', 'sum')).toBe(true)
    expect(isNonAdditiveMeasure('margin_pct', 'sum')).toBe(true)
    expect(isNonAdditiveMeasure('Share (%)', 'sum')).toBe(true)
    expect(isNonAdditiveMeasure('revenue', 'avg')).toBe(true)
    expect(isNonAdditiveMeasure('revenue', 'sum')).toBe(false)
    expect(isNonAdditiveMeasure('corporate_sales', 'sum')).toBe(false)
    expect(isNonAdditiveMeasure('units', 'sum')).toBe(false)
  })

  it('never prints a misleading summed Total badge on share_pct line or bar charts', () => {
    const store = new DatasetStore()
    const rows: Array<{ month: string, drug: string, share_pct: number }> = []
    for (let i = 1; i <= 12; i++) {
      const month = `2025-${String(i).padStart(2, '0')}`
      rows.push({ month, drug: 'Dupixent', share_pct: 55 + (i % 4) })
      rows.push({ month, drug: 'Fasenra', share_pct: 25 })
      rows.push({ month, drug: 'Nucala', share_pct: 20 - (i % 4) })
    }

    const ds = store.register({
      name: 'Asthma Biologic TRx Share',
      source: 'trx.csv',
      rows,
    })

    const multiLine = formatTerminalChart(ds, {
      type: 'line',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'share_pct', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'drug', role: 'dimension' },
      options: { title: 'Asthma Biologic Monthly TRx Share (%)' },
    })
    assertUniformCardBorderWidth(multiLine)
    expect(multiLine).not.toContain('Total ')
    expect(multiLine).toContain('Range ')
    expect(multiLine).toContain('12 pts')
    expect(multiLine).toContain('avg ')

    const singleLine = formatTerminalChart(ds, {
      type: 'line',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'share_pct', role: 'measure', aggregation: 'avg' },
      options: { title: 'Average Share (%)' },
    })
    assertUniformCardBorderWidth(singleLine)
    expect(singleLine).not.toContain('Total ')
    expect(singleLine).toContain('Avg ')
    expect(singleLine).toContain('12 pts')

    const stackedShareBar = formatTerminalChart(ds, {
      type: 'stackedBar',
      xAxis: { field: 'month', role: 'dimension' },
      yAxis: { field: 'share_pct', role: 'measure', aggregation: 'sum' },
      seriesField: { field: 'drug', role: 'dimension' },
    })
    assertUniformCardBorderWidth(stackedShareBar)
    expect(stackedShareBar).not.toContain('Total ')
    expect(stackedShareBar).toContain('Avg ')
    expect(stackedShareBar).toContain('12 pts')

    // Instructions document the presentation-only ratio guardrail and keepExisting guidance
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('numerator / denominator')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('percentOfTotal')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('keepExisting: true')
    expect(TINYPIVOT_MCP_INSTRUCTIONS).toContain('clear_datasets')

    // Emits a Data Integrity Warning when sub-segment rows collide under sum(share_pct), and stays silent on 1-row-per-bucket data
    const multiGrain = store.register({
      name: 'Sub-segment Share Collision',
      source: 'test',
      rows: [
        { month: '2025-01', drug: 'Dupixent', channel: 'Commercial', share_pct: 42 },
        { month: '2025-01', drug: 'Dupixent', channel: 'Medicare', share_pct: 38 },
        { month: '2025-02', drug: 'Dupixent', channel: 'Commercial', share_pct: 44 },
      ],
      chartConfig: {
        type: 'line',
        xAxis: { field: 'month', role: 'dimension' },
        yAxis: { field: 'share_pct', role: 'measure', aggregation: 'sum' },
        seriesField: { field: 'drug', role: 'dimension' },
      },
    })
    const warnedSummary = formatDatasetSummary(multiGrain)
    expect(warnedSummary).toContain('Data Integrity Warning')
    expect(warnedSummary).toContain('SUM(numerator) / SUM(denominator)')

    const cleanSummary = formatDatasetSummary({
      ...ds,
      chartConfig: {
        type: 'line',
        xAxis: { field: 'month', role: 'dimension' },
        yAxis: { field: 'share_pct', role: 'measure', aggregation: 'sum' },
        seriesField: { field: 'drug', role: 'dimension' },
      },
    })
    expect(cleanSummary).not.toContain('Data Integrity Warning')
  })
})
