import type {
  AggregationFunction,
  ChartAggregation,
  ChartConfig,
  ChartThemePreset,
  PivotConfig,
} from '@smallwebco/tinypivot-core'
import type { TerminalFormatOptions } from './card.js'
import type { AgentExtension } from './init.js'
import type { PostgresConfig } from './postgres.js'
import type { StoredDataset } from './store.js'
import type { AgentHint } from './studio-protocol.js'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CHART_THEME_IDS, CHART_TYPES, resolveChartType } from '@smallwebco/tinypivot-core'
import { z } from 'zod'
import { CHANNEL_NOTIFICATION, claudeChannelEnabled } from './claude-channel.js'
import { QueryRejected, withinBudget } from './duckdb.js'
import { formatHistoryList } from './history.js'
import { refreshAgentExtension } from './init.js'
import { ROW_PAGE_SIZE } from './limits.js'
import { executeReadOnlyPostgresQuery, listPostgresTables } from './postgres.js'
import { MODEL_CATALOG, tokensToUsd } from './pricing.js'
import { formatProfile } from './profile.js'
import { chartConfigFromPivot, DatasetStore, DEFAULT_SESSION_KEY, FREE_TIER_ROW_LIMIT } from './store.js'
import { agentLabel, Studio } from './studio.js'
import { describeChartForText, formatDatasetSummary, formatPivotSummary } from './summary.js'
import { bucketRowCount, recordTelemetry } from './telemetry.js'
import { detectNonAdditiveSumWarning, formatTerminalChart } from './terminal-chart.js'

export const APP_RESOURCE_URI = 'ui://tinypivot/app.html'
export const APP_MIME_TYPE = 'text/html;profile=mcp-app'

/** Rows the model may pass to load_data. Each one is billed as output, at about 5x input. */
const LOAD_DATA_ROW_GUIDE = 50

/**
 * What the model is told once per session. Hosts send it with every request, so every word
 * here costs every user on every turn: keep it to what changes the model's behaviour.
 */
export function buildInstructions({ reprintCards = true, claudeChannel = false }: { reprintCards?: boolean, claudeChannel?: boolean } = {}): string {
  const cards = reprintCards
    ? 'In a terminal, show the returned ```text card verbatim with the Studio link, except in pi, which already shows it. Where TinyPivot shows its view in the chat, never repeat the card.'
    : 'Do not reprint the ```text card: the user sees it in TinyPivot. Reply with the takeaways and the Studio link.'
  return [
    'Show figures through TinyPivot: any ranking, breakdown, comparison, trend, map, chart or pivot, instead of Markdown tables, HTML, SVG or matplotlib, passing chartConfig or pivotConfig in the same call.',
    `For files use load_file, so the rows stay out of your context; to filter, join or aggregate files first, use query with SQL. Use load_data only for rows you already have, up to about ${LOAD_DATA_ROW_GUIDE}; write larger sets to a file first. history lists and reopens earlier pulls.`,
    `Chart types: ${CHART_TYPES.map(t => t.type).join(', ')}; names like map also work. seriesField: slope period, treemap parent; targetField: bullet target.`,
    'Totals are exact. Compute ratios, shares and rates as numerator / denominator, one row per chart point, before loading; never add up percentage columns, and do not use percentOfTotal for a share within a period.',
    'Use keepExisting: true only to compare datasets in one conversation; clear_datasets resets.',
    'On every data call pass why (one short sentence for TinyPivot Studio); when loading or querying, also ask (the user\'s request, verbatim).',
    ...(claudeChannel ? ['Messages from TinyPivot Studio arrive as <channel source="tinypivot"> events: do what they ask, then answer with studio_reply.'] : []),
    cards,
  ].join(' ')
}

export const TINYPIVOT_MCP_INSTRUCTIONS = buildInstructions()

// Keep inline structuredContent well under the 1 MiB trajectory cap;
// larger datasets are fetched directly by the iframe via the app-only tool.
const INLINE_PREVIEW_ROW_LIMIT = 200

const AGGREGATION_VALUES = [
  'sum',
  'count',
  'avg',
  'min',
  'max',
  'countDistinct',
  'median',
  'stdDev',
  'percentOfTotal',
] as const

/** Any chart type id or alias (see `resolveChartType`), bar when left out; unknown names fail with the list of types. */
const chartTypeSchema = z.string().optional().superRefine((value, ctx) => {
  if (value !== undefined && !resolveChartType(value))
    ctx.addIssue({ code: 'custom', message: `Unknown chart type "${value}". Use one of: ${CHART_TYPES.map(t => t.type).join(', ')}.` })
})

const GEOGRAPHY_VALUES = ['auto', 'world', 'us-states'] as const

const CHART_AGG_VALUES = ['sum', 'avg', 'count', 'min', 'max'] as const

const VIEW_MODE_VALUES = ['grid', 'pivot', 'chart'] as const
type ViewMode = typeof VIEW_MODE_VALUES[number]
// z.enum needs a non-empty tuple; the ids come from the shared theme list in core.
const VISUAL_THEME_VALUES = CHART_THEME_IDS as [ChartThemePreset, ...ChartThemePreset[]]

/**
 * An optional prompt argument with suggestions. The MCP SDK enables completions when the schema
 * inside `.optional()` is completable, but answers them from the outer schema, so both carry it.
 */
function optionalCompletable(complete: (value: string | undefined) => string[]) {
  return completable(completable(z.string(), complete).optional(), complete)
}

const pivotValueSchema = z.object({
  field: z.string(),
  aggregation: z.enum(AGGREGATION_VALUES).default('sum'),
})

const rowFilterSchema = z.object({
  field: z.string(),
  equals: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1).describe('Keep rows matching any of these'),
})

const pivotConfigSchema = z.object({
  rowFields: z.array(z.string()).default([]),
  columnFields: z.array(z.string()).default([]),
  valueFields: z.array(pivotValueSchema).default([]),
  showRowTotals: z.boolean().default(true),
  showColumnTotals: z.boolean().default(true),
})

/**
 * Chart fields on the load tools' `chartConfig`. Kept terse: every word goes out on every request,
 * so how the types use them is explained once, in the instructions.
 */
const chartFieldShape = {
  type: chartTypeSchema,
  xAxisField: z.string().describe('Category or date column'),
  yAxisField: z.string(),
  aggregation: z.enum(CHART_AGG_VALUES).default('sum'),
  seriesField: z.string().optional(),
  targetField: z.string().optional(),
  title: z.string().optional(),
}

/** Finishing touches only `configure_chart` takes: map geography, callouts, and the deck layout. */
const chartStyleShape = {
  geography: z.enum(GEOGRAPHY_VALUES).optional(),
  annotations: z.boolean().optional(),
  variant: z.enum(['editorial', 'deck']).optional(),
  footnote: z.string().optional(),
}

const loadChartSchema = z.object(chartFieldShape)

/** Every chart field, for converting either tool's input. */
type ChartInput = z.infer<typeof loadChartSchema> & {
  geography?: typeof GEOGRAPHY_VALUES[number]
  annotations?: boolean
  variant?: 'editorial' | 'deck'
  footnote?: string
}

export interface CreateTinyPivotMcpServerOptions {
  store?: DatasetStore
  appHtmlPath?: string
  postgres?: PostgresConfig
  licenseKey?: string
  demoToken?: string
  companionUrl?: string
  /** Lazily start and return the localhost Studio URL on demand when a data tool runs in a non-MCP-Apps host */
  ensureCompanion?: () => Promise<string | undefined>
  onStateChanged?: () => void
  /**
   * Whether the model should reprint each chart card in a terminal. On by default, because
   * otherwise most terminals hide the card. Off saves ~400 output tokens per question.
   * Defaults to TINYPIVOT_REPRINT_CARDS, which turns it off with "0".
   */
  reprintCards?: boolean
  /** The shared trace, history and SQL engine; the CLI passes the same one to the Studio page. */
  studio?: Studio
  /** Offer Claude Code channels; defaults to whether Claude Code was started with this server's channel flag. */
  claudeChannel?: boolean
}

export interface McpToolRequestExtra {
  sessionId?: string
  _meta?: Record<string, unknown>
}

export function extractSessionKey(extra?: McpToolRequestExtra | null): string | undefined {
  if (!extra || typeof extra !== 'object')
    return undefined
  const candidates = [
    extra.sessionId,
    extra._meta?.conversationId,
    extra._meta?.chatId,
    extra._meta?.threadId,
    extra._meta?.sessionId,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0)
      return value.trim()
  }
  return undefined
}

export function clientSupportsMcpAppsUi(
  capabilities?: {
    extensions?: Record<string, unknown>
    experimental?: Record<string, unknown>
    ui?: unknown
  } | null,
): boolean {
  if (!capabilities)
    return false
  return Boolean(
    capabilities.extensions?.['io.modelcontextprotocol/ui']
    || capabilities.extensions?.['com.google.antigravity/ui']
    || capabilities.experimental?.['io.modelcontextprotocol/ui']
    || capabilities.experimental?.['com.google.antigravity/ui']
    || (capabilities.ui && typeof capabilities.ui === 'object'),
  )
}

/** A load that asks for a pivot and no chart opens in pivot view; everything else opens on its chart. */
function initialViewMode(requested: ViewMode | undefined, hasPivot: boolean, hasChart: boolean): ViewMode {
  return requested ?? (hasPivot && !hasChart ? 'pivot' : 'chart')
}

/** Pivot settings from a tool call, with aggregation names typed for the core library. */
function normalizePivot(pivotConfig: z.infer<typeof pivotConfigSchema>): Partial<PivotConfig> {
  return {
    ...pivotConfig,
    valueFields: pivotConfig.valueFields.map(v => ({ field: v.field, aggregation: v.aggregation as AggregationFunction })),
  }
}

/** What the Studio tells a pi or OpenCode user, by the state of TinyPivot's extension for it. */
function extensionHint(agent: AgentExtension, status: Awaited<ReturnType<typeof refreshAgentExtension>>): AgentHint | undefined {
  const name = agentLabel(agent)
  if (status === 'updated')
    return { text: `TinyPivot's ${name} extension was just updated. Restart ${name} to send messages live.` }
  if (status === 'absent')
    return { text: `Install TinyPivot's ${name} extension, then restart ${name}, to send messages live:`, command: `npx @smallwebco/tinypivot-mcp@latest init --targets=${agent}` }
  return undefined
}

/**
 * Claude Code only takes live messages through a channel, which it loads at start. `--continue`
 * brings the user back into the same conversation, so the restart costs nothing.
 */
const CLAUDE_CHANNEL_HINT: AgentHint = {
  text: 'To send messages live, restart Claude Code into this same conversation with TinyPivot\'s channel:',
  command: 'claude --continue --dangerously-load-development-channels server:tinypivot',
}

/** Explained once in the server instructions, so the schema stays bare. */
const whyParam = z.string().max(240).optional()
/** The user's request in their words, so the Studio can show each answer from the question down (the Studio keeps 500 characters). */
const askParam = z.string().optional()

/** How long a query waits for DuckDB on first use before asking the model to try again. */
const DUCKDB_WAIT_MS = 45_000

/** `source` names the dataset in the footnote under D3 charts, so a pasted chart says where it came from. */
function toCoreChartConfig(input: ChartInput, source?: string): Partial<ChartConfig> {
  // The schema already rejected unknown names, so this always resolves.
  const type = resolveChartType(input.type ?? 'bar') ?? 'bar'
  const aggregation = input.aggregation as ChartAggregation
  return {
    type,
    xAxis: { field: input.xAxisField, role: 'dimension' },
    yAxis: { field: input.yAxisField, role: 'measure', aggregation },
    seriesField: input.seriesField ? { field: input.seriesField, role: 'dimension' } : undefined,
    targetField: input.targetField ? { field: input.targetField, role: 'measure', aggregation } : undefined,
    options: {
      title: input.title ?? '',
      showLegend: true,
      showDataLabels: false,
      showGrid: true,
      stacked: type === 'stackedBar',
      ...(input.geography ? { geography: input.geography } : {}),
      ...(input.annotations === undefined ? {} : { annotations: input.annotations }),
      ...(source ? { source } : {}),
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.footnote ? { footnote: input.footnote } : {}),
    },
  }
}

function buildAppPayload(
  dataset: StoredDataset,
  store: DatasetStore,
  options: {
    licenseKey?: string
    demoToken?: string
    summaryText?: string
    recordTurn?: boolean
    overrideTurnTokensSaved?: number
    sessionKey?: string
  },
) {
  const previewRows = dataset.rows.slice(0, INLINE_PREVIEW_ROW_LIMIT)
  const summaryBytes = options.summaryText ? Buffer.byteLength(options.summaryText, 'utf8') : 600
  const summaryTokens = Math.round(summaryBytes / 4)
  const defaultTurnBypass = dataset.ingestionMode === 'direct'
    ? Math.max(0, dataset.estimatedDatasetTokens - summaryTokens)
    : 0
  const turnTokensSaved = options.overrideTurnTokensSaved ?? defaultTurnBypass

  const sessionSavings = options.recordTurn !== false
    ? store.recordTurnSavings(turnTokensSaved)
    : store.getSessionSavings()

  const turnUsdSaved = tokensToUsd(turnTokensSaved, sessionSavings.model.ratePerMillion)

  const validMcpKey = isMcpLicenseKey(options.licenseKey) ? options.licenseKey : null
  const isPro = Boolean(validMcpKey || options.demoToken)

  return {
    datasetId: dataset.id,
    name: dataset.name,
    source: dataset.source,
    totalRows: dataset.rows.length,
    sourceTotalRows: dataset.sourceTotalRows,
    truncatedForFreeTier: dataset.truncatedForFreeTier,
    tier: isPro ? 'pro' as const : 'free' as const,
    previewRows,
    hasMoreRows: dataset.rows.length > previewRows.length,
    columns: dataset.columns,
    viewMode: dataset.viewMode,
    pivotConfig: dataset.pivotConfig ?? null,
    chartConfig: dataset.chartConfig ?? null,
    chartTheme: isPro ? store.getVisualTheme() : 'code',
    datasets: store.listMetadata(options.sessionKey),
    licenseKey: validMcpKey,
    demoToken: options.demoToken ?? null,
    modelCatalog: MODEL_CATALOG,
    tokenStats: {
      ingestionMode: dataset.ingestionMode,
      rawBytes: dataset.rawBytes,
      estimatedDatasetTokens: dataset.estimatedDatasetTokens,
      summaryTokens,
      turnTokensSaved,
      turnUsdSaved,
      session: sessionSavings,
    },
  }
}

export async function loadAppHtml(customPath?: string): Promise<string> {
  const envPath = process.env.TINYPIVOT_MCP_APP_HTML
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    customPath,
    envPath,
    path.resolve(here, 'app/index.html'),
    path.resolve(here, '../dist/app/index.html'),
  ].filter((p): p is string => Boolean(p))

  for (const candidate of candidates) {
    try {
      const html = await fs.readFile(candidate, 'utf8')
      if (html.trim().length > 0)
        return html
    }
    catch {
      // Try next candidate
    }
  }

  return `<!doctype html><html><body style="font-family:system-ui;padding:24px;">
    <h2>TinyPivot MCP App UI not built yet</h2>
    <p>Run <code>pnpm --filter @smallwebco/tinypivot-mcp build</code> to bundle <code>dist/app/index.html</code>.</p>
  </body></html>`
}

export function isMcpLicenseKey(key?: string | null): boolean {
  if (!key)
    return false
  return key.startsWith('TP-MCPP-') || key.startsWith('TP-MCPT-')
}

/**
 * Where a key can come from: TINYPIVOT_LICENSE_KEY (set by init and hand-written configs), then
 * the Claude plugin's license_key option, which Claude Code hands over as
 * CLAUDE_PLUGIN_OPTION_LICENSE_KEY. An option left empty can arrive as the unexpanded
 * `${user_config.license_key}`, which counts as no key.
 */
const LICENSE_KEY_ENV_VARS = ['TINYPIVOT_LICENSE_KEY', 'CLAUDE_PLUGIN_OPTION_LICENSE_KEY']

function licenseKeyFromEnv(): string | undefined {
  for (const name of LICENSE_KEY_ENV_VARS) {
    const value = process.env[name]?.trim()
    if (value && !value.startsWith('${'))
      return value
  }
  return undefined
}

export function resolveLicenseKey(explicit?: string): string | undefined {
  if (explicit?.trim())
    return explicit.trim()
  const fromEnv = licenseKeyFromEnv()
  if (fromEnv)
    return fromEnv

  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../.license'),
    path.resolve(here, '.license'),
  ]
  for (const file of candidates) {
    try {
      const content = fsSync.readFileSync(file, 'utf8').trim()
      if (content)
        return content
    }
    catch {
      // Optional local license file not present
    }
  }
  return undefined
}

export function createTinyPivotMcpServer(options: CreateTinyPivotMcpServerOptions = {}) {
  const rawLicenseKey = resolveLicenseKey(options.licenseKey)
  const licenseKey = isMcpLicenseKey(rawLicenseKey) ? rawLicenseKey : undefined
  if (rawLicenseKey && !licenseKey && rawLicenseKey.startsWith('TP-PRO')) {
    console.error('[tinypivot-mcp] Notice: UI Library keys (TP-PRO*) apply to @smallwebco/tinypivot-react/-vue. TinyPivot MCP Pro requires an MCP license key (TP-MCPP* / TP-MCPT*) from https://tiny-pivot.com/pricing')
  }
  const demoToken = options.demoToken ?? process.env.TINYPIVOT_DEMO_TOKEN
  const isPro = Boolean(licenseKey || demoToken)
  const tier: 'free' | 'pro' = isPro ? 'pro' : 'free'
  const store = options.store ?? new DatasetStore({
    maxRowsPerDataset: isPro ? Number.POSITIVE_INFINITY : FREE_TIER_ROW_LIMIT,
  })
  let activeCompanionUrl = options.companionUrl
  const notifyCompanion = () => {
    options.onStateChanged?.()
  }
  const reprintCards = options.reprintCards ?? process.env.TINYPIVOT_REPRINT_CARDS !== '0'
  const claudeChannel = options.claudeChannel ?? claudeChannelEnabled()
  const postgresConfig: PostgresConfig | undefined = options.postgres ?? (
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          allowedTables: process.env.TINYPIVOT_ALLOWED_TABLES
            ? process.env.TINYPIVOT_ALLOWED_TABLES.split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
        }
      : undefined
  )

  const server = new McpServer(
    {
      name: 'tinypivot',
      version: '0.7.1',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        ...(claudeChannel ? { experimental: { 'claude/channel': {} } } : {}),
      },
      instructions: buildInstructions({ reprintCards, claudeChannel }),
    },
  )

  const clientRendersWidget = () => clientSupportsMcpAppsUi(server.server.getClientCapabilities())
  /** How cards are written for this host: where the widget or pi's extension shows the card, the model does not repeat it. */
  const cardFormat = (): TerminalFormatOptions => ({
    showBranding: !isPro,
    reprintNote: reprintCards,
    shownBy: clientRendersWidget() ? 'widget' : getClientName() === 'pi' ? 'pi' : undefined,
  })

  const resolveCompanionUrlForTool = async (forceCompanion = false): Promise<string | undefined> => {
    if (activeCompanionUrl)
      return activeCompanionUrl
    if (!options.ensureCompanion)
      return undefined
    if (!forceCompanion && clientRendersWidget())
      return undefined
    activeCompanionUrl = await options.ensureCompanion()
    return activeCompanionUrl
  }

  /**
   * The app payload (preview rows, model catalog, license) exists to feed the inline widget.
   * Hosts without MCP Apps give structuredContent to the model in place of the text, which costs
   * thousands of tokens and hides the terminal card, so they get the text summary on its own.
   */
  const dataToolResult = (summaryText: string, payload: ReturnType<typeof buildAppPayload>) => {
    const content = [{ type: 'text' as const, text: summaryText }]
    return clientRendersWidget() ? { content, structuredContent: payload } : { content }
  }

  /** The shared ending of every tool that loads a dataset: the card for the model, the payload for the widget. */
  const replyWithDataset = async (ds: StoredDataset, sessionKey: string, tool: string, note = '') => {
    const liveCompanionUrl = await resolveCompanionUrlForTool()
    const summaryText = `${formatDatasetSummary(ds, liveCompanionUrl, cardFormat())}${note}`
    const payload = buildAppPayload(ds, store, { licenseKey, demoToken, summaryText, sessionKey })
    recordTelemetry({
      event: 'tool_call',
      tool,
      rowBucket: bucketRowCount(ds.sourceTotalRows),
      client: getClientName(),
      tier,
      truncated: ds.truncatedForFreeTier,
    })
    notifyCompanion()
    return dataToolResult(summaryText, payload)
  }

  const studio = options.studio ?? new Studio(store)
  try {
    studio.history.prune()
  }
  catch (error) {
    console.error(`[tinypivot-mcp] Could not prune history: ${error instanceof Error ? error.message : String(error)}`)
  }

  /**
   * Lets the Studio reach this agent: into the Claude Code session through a channel when it was
   * started with one.
   */
  const connectAgent = () => {
    const clientName = server.server.getClientVersion()?.name
    studio.setAgentName(clientName)
    if (clientName === 'pi' || clientName === 'opencode')
      void refreshAgentExtension(clientName).then(status => studio.setAgentHint(extensionHint(clientName, status))).catch(() => {})
    if (clientName === 'claude-code' && !claudeChannel)
      studio.setAgentHint(CLAUDE_CHANNEL_HINT)
    if (claudeChannel) {
      studio.agent.connect({
        name: 'Claude Code channel',
        push: (note, text) => {
          const content = `${text}\n\nAnswer with studio_reply so the user sees it in TinyPivot Studio.`
          server.server.notification({ method: CHANNEL_NOTIFICATION, params: { content, meta: { message_id: note.id } } })
            .catch(error => console.error('[tinypivot-mcp] Could not reach the Claude Code channel:', error))
          return true
        },
      })
    }
  }

  if (claudeChannel) {
    // The channel's reply tool: how the agent answers a Studio message where the user is looking.
    server.registerTool(
      'studio_reply',
      {
        title: 'Reply in TinyPivot Studio',
        description: 'Answer a message from TinyPivot Studio. The user reads it there.',
        inputSchema: { text: z.string().min(1).max(8000) },
      },
      async ({ text }) => {
        studio.reply(text)
        return { content: [{ type: 'text' as const, text: 'Shown in TinyPivot Studio.' }] }
      },
    )
  }

  /** Tools only the widget calls. A host with no widget would just list them for the model. */
  const widgetOnlyTools: Array<{ disable: () => void }> = []
  const widgetOnly = (tool: { disable: () => void }) => {
    widgetOnlyTools.push(tool)
  }

  const resolveSessionContext = (extra?: McpToolRequestExtra, keepExisting?: boolean) => {
    const explicitSessionKey = extractSessionKey(extra)
    const sessionKey = explicitSessionKey ?? DEFAULT_SESSION_KEY
    let shouldKeepExisting: boolean
    if (typeof keepExisting === 'boolean') {
      shouldKeepExisting = keepExisting
    }
    else if (explicitSessionKey) {
      shouldKeepExisting = true
    }
    else if (clientRendersWidget()) {
      // Shared-process MCP Apps hosts (e.g. Claude Desktop) reuse 1 stdio server across chats:
      // default to a fresh session switcher unless keepExisting: true is passed for multi-dataset chats.
      shouldKeepExisting = false
    }
    else {
      // Dedicated terminal process (pi, Claude Code, OpenCode, Codex): keep datasets within this process
      shouldKeepExisting = true
    }
    return { sessionKey, keepExisting: shouldKeepExisting }
  }

  let detectedClientName: string | undefined
  const getClientName = () => detectedClientName ?? server.server.getClientVersion()?.name
  server.server.oninitialized = () => {
    if (!clientRendersWidget())
      widgetOnlyTools.forEach(tool => tool.disable())
    detectedClientName = server.server.getClientVersion()?.name
    try {
      connectAgent()
    }
    catch (error) {
      console.error('[tinypivot-mcp] Could not connect the Studio to the agent:', error)
    }
    recordTelemetry({
      event: 'server_start',
      client: detectedClientName,
      tier,
    })
  }

  // Register the single-file interactive TinyPivot MCP App resource
  server.registerResource(
    'tinypivot-app',
    APP_RESOURCE_URI,
    {
      title: 'TinyPivot Interactive Analytics App',
      description: 'Interactive DataGrid, Pivot Table, Chart Builder, and Drill-Through UI',
      mimeType: APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: false,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: APP_RESOURCE_URI,
          mimeType: APP_MIME_TYPE,
          text: await loadAppHtml(options.appHtmlPath),
          _meta: {
            ui: {
              prefersBorder: false,
            },
          },
        },
      ],
    }),
  )

  const INLINE_UI_META = {
    'ui': {
      resourceUri: APP_RESOURCE_URI,
      visibility: ['model', 'app'] as const,
    },
    'ui/resourceUri': APP_RESOURCE_URI,
  }

  const PANE_UI_META = {
    'ui': {
      resourceUri: APP_RESOURCE_URI,
      visibility: ['model', 'app'] as const,
    },
    'ui/resourceUri': APP_RESOURCE_URI,
    'com.google.antigravity/ui': {
      entrypoints: [
        { type: 'aux_pane', title: 'TinyPivot' },
        { type: 'global', title: 'TinyPivot' },
      ],
    },
  }

  const APP_ONLY_META = {
    ui: { visibility: ['app'] as const },
  }

  // 1. Entrypoint tool — works with empty `{}` (opens active or built-in sample dataset)
  server.registerTool(
    'open_tinypivot',
    {
      title: 'Open TinyPivot',
      description: 'Open the TinyPivot Studio (grid, pivot, chart). Shows sample data when nothing is loaded.',
      inputSchema: {
        datasetId: z.string().optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        openBrowser: z.boolean().optional().describe('Also start the localhost Studio in hosts with an inline widget'),
      },
      _meta: PANE_UI_META,
    },
    async ({ datasetId, viewMode, openBrowser }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Dataset "${datasetId}" not found. Available: ${store.listMetadata(sessionKey).map(d => d.id).join(', ')}` }],
        }
      }
      if (viewMode) {
        store.updateView(ds.id, { viewMode }, sessionKey)
      }
      else {
        store.setActive(ds.id, sessionKey)
      }

      const liveCompanionUrl = await resolveCompanionUrlForTool(Boolean(openBrowser))
      const summaryText = formatDatasetSummary(ds, liveCompanionUrl, cardFormat())
      const payload = buildAppPayload(ds, store, { licenseKey, demoToken, summaryText, sessionKey })
      recordTelemetry({
        event: 'tool_call',
        tool: 'open_tinypivot',
        rowBucket: bucketRowCount(ds.sourceTotalRows),
        client: getClientName(),
        tier,
        truncated: ds.truncatedForFreeTier,
      })
      notifyCompanion()
      return dataToolResult(summaryText, payload)
    },
  )

  // 2. Load local CSV / TSV / JSON / JSONL file
  server.registerTool(
    'load_file',
    {
      title: 'Load Data File into TinyPivot',
      description: 'Chart or pivot a local CSV, TSV, JSON or JSONL file without reading it: the rows stay out of your context.',
      inputSchema: {
        filePath: z.string(),
        name: z.string().optional(),
        why: whyParam,
        ask: askParam,
        where: z.array(rowFilterSchema).optional().describe('Keep only matching rows, e.g. [{"field":"year","equals":[2026]}]'),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional().describe('Keep earlier datasets loaded, to compare them'),
      },
      _meta: INLINE_UI_META,
    },
    async ({ filePath, name, why, ask, where, viewMode, pivotConfig, chartConfig, keepExisting }, extra) => {
      try {
        const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting)
        const ds = await store.loadFromFile(filePath, name, { sessionKey, keepExisting: shouldKeep, where })
        studio.remember(ds, { kind: 'file', source: ds.source, where })
        const explicitChart = chartConfig ? toCoreChartConfig(chartConfig, ds.name) : undefined
        if (pivotConfig) {
          const normalizedPivot = normalizePivot(pivotConfig)
          store.updateView(ds.id, {
            viewMode: initialViewMode(viewMode, true, Boolean(explicitChart)),
            pivotConfig: normalizedPivot,
            chartConfig: explicitChart ?? chartConfigFromPivot(normalizedPivot, ds.name) ?? ds.chartConfig,
          }, sessionKey)
        }
        else if (explicitChart || viewMode) {
          store.updateView(ds.id, {
            ...(viewMode ? { viewMode } : {}),
            ...(explicitChart ? { chartConfig: explicitChart } : {}),
          }, sessionKey)
        }

        studio.recordDatasetStep(ds, { actor: 'agent', tool: 'load_file', why, ask, file: ds.source, where })
        return replyWithDataset(ds, sessionKey, 'load_file')
      }
      catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to load file "${filePath}": ${err instanceof Error ? err.message : String(err)}` }],
        }
      }
    },
  )

  // 3. Load inline JSON rows (pipe output from Stripe, APIs, SQL, or any other MCP tool!)
  server.registerTool(
    'load_data',
    {
      title: 'Load JSON Rows into TinyPivot',
      description: 'Chart or pivot rows you already have, up to about 50. Every row you pass is billed as output; for more, write a file and use load_file.',
      inputSchema: {
        name: z.string(),
        why: whyParam,
        ask: askParam,
        rows: z.array(z.record(z.string(), z.unknown())),
        source: z.string().optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional().describe('Keep earlier datasets loaded, to compare them'),
      },
      _meta: INLINE_UI_META,
    },
    async ({ name, why, ask, rows, source, viewMode, pivotConfig, chartConfig, keepExisting }, extra) => {
      const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting)
      const ds = store.register({
        name,
        source: source ?? 'inline JSON',
        ingestionMode: 'inline',
        rows,
        viewMode: initialViewMode(viewMode, Boolean(pivotConfig), Boolean(chartConfig)),
        pivotConfig: pivotConfig ? normalizePivot(pivotConfig) : undefined,
        chartConfig: chartConfig ? toCoreChartConfig(chartConfig, source ? `${name} (${source})` : name) : undefined,
        sessionKey,
        keepExisting: shouldKeep,
      })
      studio.remember(ds, { kind: 'data', source: source ?? 'inline JSON' })
      studio.recordDatasetStep(ds, { actor: 'agent', tool: 'load_data', why, ask })
      return replyWithDataset(ds, sessionKey, 'load_data')
    },
  )

  // 4. Configure Pivot Table deterministically via @smallwebco/tinypivot-core
  server.registerTool(
    'configure_pivot',
    {
      title: 'Configure Pivot Table',
      description: 'Pivot the active dataset. Aggregations are exact; percentOfTotal divides by the grand total.',
      inputSchema: {
        datasetId: z.string().optional(),
        rowFields: z.array(z.string()).default([]),
        columnFields: z.array(z.string()).default([]),
        valueFields: z.array(pivotValueSchema).min(1),
        why: whyParam,
        showRowTotals: z.boolean().default(true),
        showColumnTotals: z.boolean().default(true),
      },
      _meta: INLINE_UI_META,
    },
    async ({ datasetId, rowFields, columnFields, valueFields, why, showRowTotals, showColumnTotals }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Dataset not found. Loaded datasets: ${store.listMetadata(sessionKey).map(d => d.id).join(', ')}` }],
        }
      }

      const fullPivotConfig: PivotConfig = {
        rowFields,
        columnFields,
        valueFields: valueFields.map(v => ({
          field: v.field,
          aggregation: v.aggregation as AggregationFunction,
        })),
        showRowTotals,
        showColumnTotals,
      }

      store.updateView(ds.id, {
        viewMode: 'pivot',
        pivotConfig: fullPivotConfig,
        chartConfig: chartConfigFromPivot(fullPivotConfig, ds.name) ?? ds.chartConfig,
      }, sessionKey)

      const liveCompanionUrl = await resolveCompanionUrlForTool()
      const summary = formatPivotSummary(ds, fullPivotConfig, liveCompanionUrl, cardFormat())
      studio.recordDatasetStep(ds, { actor: 'agent', tool: 'configure_pivot', why })
      // Computing the pivot deterministically on the server avoids feeding raw rows back to the LLM
      const pivotTokensSaved = Math.max(0, ds.estimatedDatasetTokens - Math.round(Buffer.byteLength(summary, 'utf8') / 4))
      const payload = buildAppPayload(ds, store, {
        licenseKey,
        demoToken,
        summaryText: summary,
        overrideTurnTokensSaved: pivotTokensSaved,
        sessionKey,
      })
      recordTelemetry({
        event: 'tool_call',
        tool: 'configure_pivot',
        rowBucket: bucketRowCount(ds.sourceTotalRows),
        client: getClientName(),
        tier,
        truncated: ds.truncatedForFreeTier,
      })
      notifyCompanion()

      return dataToolResult(summary, payload)
    },
  )

  // 5. Configure Chart view
  server.registerTool(
    'configure_chart',
    {
      title: 'Configure Chart',
      description: 'Chart the active dataset.',
      inputSchema: {
        datasetId: z.string().optional(),
        ...chartFieldShape,
        ...chartStyleShape,
        why: whyParam,
        chartTheme: z.enum(VISUAL_THEME_VALUES).optional(),
      },
      _meta: INLINE_UI_META,
    },
    async ({ datasetId, chartTheme, why, ...chartInput }, extra) => {
      const { xAxisField, yAxisField, aggregation, seriesField } = chartInput
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Dataset not found. Loaded datasets: ${store.listMetadata(sessionKey).map(d => d.id).join(', ')}` }],
        }
      }

      if (chartTheme && (isPro || chartTheme === 'code')) {
        store.setVisualTheme(chartTheme as ChartThemePreset)
      }
      const chartConfig = toCoreChartConfig(chartInput, ds.name)
      const type = chartConfig.type!
      store.updateView(ds.id, {
        viewMode: 'chart',
        chartConfig,
      }, sessionKey)

      const asciiChart = formatTerminalChart(ds, chartConfig, { showBranding: !isPro })
      const summaryParts: string[] = []
      if (ds.truncatedForFreeTier) {
        summaryParts.push(
          `> **WARNING — FREE TIER ROW LIMIT**: Showing the first **${ds.rows.length.toLocaleString()} of ${ds.sourceTotalRows.toLocaleString()}** rows. Chart values reflect this ${ds.rows.length.toLocaleString()}-row subset only, not the full dataset. Unlock unlimited rows with TinyPivot Pro: https://tiny-pivot.com/pricing`,
          '',
        )
      }
      const integrityWarning = detectNonAdditiveSumWarning(ds, chartConfig)
      if (integrityWarning) {
        summaryParts.push(integrityWarning, '')
      }
      summaryParts.push(
        `Configured **${type}** chart on **${ds.name}**: X = \`${xAxisField}\`, Y = \`${aggregation}(${yAxisField})\`${seriesField ? `, series = \`${seriesField}\`` : ''}${chartInput.targetField ? `, target = \`${chartInput.targetField}\`` : ''}.`,
        ...describeChartForText(ds.rows, chartConfig),
      )
      const liveCompanionUrl = await resolveCompanionUrlForTool()
      if (asciiChart)
        summaryParts.push('', asciiChart)
      if (liveCompanionUrl)
        summaryParts.push(`Studio: ${liveCompanionUrl}`)
      const summaryText = summaryParts.join('\n')
      studio.recordDatasetStep(ds, { actor: 'agent', tool: 'configure_chart', why })

      const chartTokensSaved = Math.max(0, ds.estimatedDatasetTokens - Math.round(Buffer.byteLength(summaryText, 'utf8') / 4))
      const payload = buildAppPayload(ds, store, {
        licenseKey,
        demoToken,
        summaryText,
        overrideTurnTokensSaved: chartTokensSaved,
        sessionKey,
      })
      recordTelemetry({
        event: 'tool_call',
        tool: 'configure_chart',
        rowBucket: bucketRowCount(ds.sourceTotalRows),
        client: getClientName(),
        tier,
        truncated: ds.truncatedForFreeTier,
      })
      notifyCompanion()
      return dataToolResult(summaryText, payload)
    },
  )

  // 6. Optional read-only PostgreSQL query tool (validated by @smallwebco/tinypivot-server)
  if (postgresConfig) {
    server.registerTool(
      'query_postgres',
      {
        title: 'Query PostgreSQL Directly (Read-Only, Pro)',
        description: 'Run a read-only SELECT on the configured Postgres database and chart the result.',
        inputSchema: {
          sql: z.string(),
          why: whyParam,
          ask: askParam,
          name: z.string().optional(),
          viewMode: z.enum(VIEW_MODE_VALUES).optional(),
          pivotConfig: pivotConfigSchema.optional(),
          keepExisting: z.boolean().optional().describe('Keep earlier datasets loaded, to compare them'),
        },
        _meta: INLINE_UI_META,
      },
      async ({ sql, why, ask, name, viewMode, pivotConfig, keepExisting }, extra) => {
        if (!isPro) {
          return {
            isError: true,
            content: [{
              type: 'text',
              text: 'Read-only PostgreSQL querying (`query_postgres`) requires a TinyPivot Pro license (TINYPIVOT_LICENSE_KEY). Free tier includes local CSV/TSV/JSON files and inline data up to 2,500 rows. Upgrade at https://tiny-pivot.com/pricing',
            }],
          }
        }
        try {
          const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting)
          const res = await executeReadOnlyPostgresQuery(postgresConfig, sql)
          const ds = store.register({
            name: name ?? 'PostgreSQL Query',
            source: 'postgresql',
            ingestionMode: 'direct',
            rows: res.rows,
            viewMode: initialViewMode(viewMode, Boolean(pivotConfig), false),
            pivotConfig: pivotConfig ? normalizePivot(pivotConfig) : undefined,
            sessionKey,
            keepExisting: shouldKeep,
          })
          studio.remember(ds, { kind: 'postgres', source: sql })
          studio.recordDatasetStep(ds, { actor: 'agent', tool: 'query_postgres', why, ask, sql })
          return replyWithDataset(ds, sessionKey, 'query_postgres', res.truncated ? ' (capped at max rows)' : '')
        }
        catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `PostgreSQL query failed: ${err instanceof Error ? err.message : String(err)}` }],
          }
        }
      },
    )
  }

  // 7. List loaded datasets (and Postgres tables if configured)
  // SQL over local files and earlier pulls, through an embedded DuckDB downloaded on first use.
  server.registerTool(
    'query',
    {
      title: 'Query Files with SQL',
      description: 'Run one read-only DuckDB SELECT over local CSV, Parquet or JSON files (FROM \'path\') and loaded datasets (tables named by dataset id), then chart or pivot the result. Rows stay out of your context.',
      inputSchema: {
        sql: z.string(),
        why: whyParam,
        ask: askParam,
        name: z.string().optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional().describe('Keep earlier datasets loaded, to compare them'),
      },
      _meta: INLINE_UI_META,
    },
    async ({ sql, why, ask, name, viewMode, pivotConfig, chartConfig, keepExisting }, extra) => {
      const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting)
      try {
        if (await withinBudget(studio.duck.prepare(), DUCKDB_WAIT_MS) === 'pending') {
          return { content: [{ type: 'text' as const, text: 'DuckDB is downloading for its first use (about 20 MB, once). Run the same query again in a minute.' }] }
        }
        const { dataset, truncated } = await studio.runQuery({
          sql,
          name,
          why,
          ask,
          actor: 'agent',
          sessionKey,
          keepExisting: shouldKeep,
          viewMode: initialViewMode(viewMode, Boolean(pivotConfig), Boolean(chartConfig)),
          pivotConfig: pivotConfig ? normalizePivot(pivotConfig) : undefined,
          chartConfig: chartConfig ? toCoreChartConfig(chartConfig) : undefined,
        })
        return replyWithDataset(dataset, sessionKey, 'query', truncated ? `\n_Result cut at ${dataset.rows.length.toLocaleString('en-US')} rows._` : '')
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof QueryRejected ? message : `Query failed: ${message}` }] }
      }
    },
  )

  // Column-level statistics, so the model can plan without reading rows.
  server.registerTool(
    'profile',
    {
      title: 'Profile Dataset',
      description: 'Describe each column of a loaded dataset: empty share, number and date ranges, commonest values.',
      inputSchema: {
        datasetId: z.string().optional(),
        why: whyParam,
      },
    },
    async ({ datasetId, why }, extra) => {
      const { sessionKey } = resolveSessionContext(extra)
      const ds = store.get(datasetId, sessionKey)
      if (!ds)
        return { isError: true, content: [{ type: 'text' as const, text: `Dataset "${datasetId ?? '(active)'}" not found.` }] }
      studio.recordDatasetStep(ds, { actor: 'agent', tool: 'profile', why })
      return { content: [{ type: 'text' as const, text: formatProfile(ds) }] }
    },
  )

  // Every pull is saved locally; list them, or reopen one without re-querying.
  server.registerTool(
    'history',
    {
      title: 'Saved Pulls',
      description: 'List data pulled in earlier sessions, or reopen one by id at no cost: nothing is re-queried.',
      inputSchema: {
        open: z.string().optional(),
        why: whyParam,
        limit: z.number().int().min(1).max(100).optional(),
      },
      _meta: INLINE_UI_META,
    },
    async ({ open, why, limit }, extra) => {
      const { history } = studio
      if (!history.enabled)
        return { content: [{ type: 'text' as const, text: 'History is off (TINYPIVOT_HISTORY=0).' }] }
      if (!open)
        return { content: [{ type: 'text' as const, text: formatHistoryList(history.list(limit ?? 15)) }] }
      const { sessionKey } = resolveSessionContext(extra, true)
      try {
        const ds = await studio.reopen(open, { actor: 'agent', why, sessionKey })
        return replyWithDataset(ds, sessionKey, 'history')
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { isError: true, content: [{ type: 'text' as const, text: `Could not reopen "${open}": ${message} ${formatHistoryList(history.list(5))}` }] }
      }
    },
  )

  server.registerTool(
    'list_datasets',
    {
      title: 'List Datasets',
      description: 'List loaded datasets with their row counts and columns.',
      inputSchema: {},
    },
    async (_args, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const datasets = store.listMetadata(sessionKey)
      let pgTables: string[] = []
      if (postgresConfig) {
        try {
          pgTables = await listPostgresTables(postgresConfig)
        }
        catch {
          pgTables = []
        }
      }

      const lines = datasets.map(d =>
        `- **${d.name}** (\`${d.id}\`): ${d.rowCount.toLocaleString()} rows · columns: ${d.columns.map(c => `${c.name}:${c.type}`).join(', ')}`,
      )
      if (pgTables.length > 0) {
        lines.push('', `PostgreSQL tables available via \`query_postgres\`: ${pgTables.map(t => `\`${t}\``).join(', ')}`)
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') || 'No datasets loaded.' }],
        structuredContent: {
          activeDatasetId: store.getActiveId(sessionKey),
          datasets,
          postgresTables: pgTables,
        },
      }
    },
  )

  // 7b. Clear active session datasets
  server.registerTool(
    'clear_datasets',
    {
      title: 'Clear Session Datasets',
      description: 'Unload all datasets.',
      inputSchema: {},
    },
    async (_args, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const cleared = store.clearSession(sessionKey)
      notifyCompanion()
      return {
        content: [{
          type: 'text',
          text: cleared > 0
            ? `Cleared ${cleared} dataset${cleared === 1 ? '' : 's'} from the active TinyPivot session.`
            : 'No active session datasets to clear.',
        }],
        structuredContent: {
          cleared,
          activeDatasetId: store.getActiveId(sessionKey),
          datasets: store.listMetadata(sessionKey),
        },
      }
    },
  )

  // 8. App-only tool: stream full dataset rows directly to the UI iframe (0 LLM tokens!)
  widgetOnly(server.registerTool(
    'fetch_dataset_rows',
    {
      title: 'Fetch Dataset Rows (App Internal)',
      description: 'Internal app-only tool to fetch full dataset rows without hitting trajectory limits.',
      inputSchema: {
        datasetId: z.string().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(ROW_PAGE_SIZE).default(10000),
      },
      _meta: APP_ONLY_META,
    },
    async ({ datasetId, offset, limit }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Dataset "${datasetId ?? '(active)'}" not found.` }],
        }
      }
      const rows = ds.rows.slice(offset, offset + limit)
      return {
        content: [{ type: 'text', text: `Returned ${rows.length} rows of ${ds.rows.length}.` }],
        structuredContent: {
          datasetId: ds.id,
          name: ds.name,
          source: ds.source,
          rows,
          offset,
          totalRows: ds.rows.length,
          sourceTotalRows: ds.sourceTotalRows,
          truncatedForFreeTier: ds.truncatedForFreeTier,
          tier,
          hasMore: offset + rows.length < ds.rows.length,
          columns: ds.columns,
          viewMode: ds.viewMode,
          pivotConfig: ds.pivotConfig ?? null,
          chartConfig: ds.chartConfig ?? null,
          chartTheme: isPro ? store.getVisualTheme() : 'code',
          datasets: store.listMetadata(sessionKey),
          licenseKey: licenseKey ?? null,
          demoToken: demoToken ?? null,
          modelCatalog: MODEL_CATALOG,
          tokenStats: {
            ingestionMode: ds.ingestionMode,
            rawBytes: ds.rawBytes,
            estimatedDatasetTokens: ds.estimatedDatasetTokens,
            summaryTokens: 150,
            turnTokensSaved: ds.ingestionMode === 'direct' ? Math.max(0, ds.estimatedDatasetTokens - 150) : 0,
            turnUsdSaved: tokensToUsd(
              ds.ingestionMode === 'direct' ? Math.max(0, ds.estimatedDatasetTokens - 150) : 0,
              store.getActiveModel().ratePerMillion,
            ),
            session: store.getSessionSavings(),
          },
        },
      }
    },
  ))

  // 9. App-only tool: set active LLM model for session dollarization
  widgetOnly(server.registerTool(
    'set_session_model',
    {
      title: 'Set Active LLM Model (App Internal)',
      description: 'Persist the active LLM model used to dollarize token savings for this session.',
      inputSchema: {
        model: z.string(),
        customRatePerMillion: z.number().min(0).optional(),
      },
      _meta: APP_ONLY_META,
    },
    async ({ model, customRatePerMillion }) => {
      store.setActiveModel(model, customRatePerMillion)
      const session = store.getSessionSavings()
      return {
        content: [{ type: 'text', text: `Active model set to ${session.model.name} ($${session.model.ratePerMillion}/1M).` }],
        structuredContent: { session },
      }
    },
  ))

  // 10. App-only tool: record a local 0-token user exploration (chart/pivot/filter/drill-through)
  widgetOnly(server.registerTool(
    'record_local_action',
    {
      title: 'Record Local 0-Token Action (App Internal)',
      description: 'Update cumulative session savings when the user explores data locally without re-prompting the LLM.',
      inputSchema: {
        datasetId: z.string().optional(),
      },
      _meta: APP_ONLY_META,
    },
    async ({ datasetId }) => {
      const { addedTokens, session } = store.recordLocalAction(datasetId)
      return {
        content: [{ type: 'text', text: 'OK' }],
        structuredContent: {
          addedTokens,
          addedUsd: tokensToUsd(addedTokens, session.model.ratePerMillion),
          session,
        },
      }
    },
  ))

  // 11. Set the visual theme preset (callable by both the model in chat and the UI app)

  /** Saves the theme, or explains that it needs Pro. Shared by the tool and the slash command. */
  const applyVisualTheme = (theme: ChartThemePreset): { theme: ChartThemePreset, text: string, proRequired?: boolean } => {
    if (!isPro && theme !== 'code')
      return { theme: 'code', proRequired: true, text: 'Additional chart themes require TinyPivot Pro (https://tiny-pivot.com/pricing).' }
    const active = store.setVisualTheme(theme)
    notifyCompanion()
    return { theme: active, text: `TinyPivot theme set to **${active}** (saved to ~/.config/tinypivot/preferences.json).` }
  }

  server.registerTool(
    'set_visual_theme',
    {
      title: 'Set Visual Theme',
      description: 'Set the theme for charts, tables and the Studio.',
      inputSchema: {
        theme: z.enum(VISUAL_THEME_VALUES),
      },
      _meta: {
        ui: { visibility: ['model', 'app'] as const },
      },
    },
    async ({ theme }) => {
      const result = applyVisualTheme(theme)
      return {
        content: [{ type: 'text', text: result.text }],
        structuredContent: result.proRequired ? { chartTheme: 'code', proRequired: true } : { chartTheme: result.theme },
      }
    },
  )

  // A slash command in hosts that list MCP prompts (Claude Code: /mcp__tinypivot__theme paper).
  server.registerPrompt(
    'theme',
    {
      title: 'TinyPivot theme',
      description: `Switch TinyPivot's theme for terminal cards, charts and the Studio: ${CHART_THEME_IDS.join(', ')}.`,
      argsSchema: {
        name: optionalCompletable(value => CHART_THEME_IDS.filter(id => id.startsWith(value ?? ''))),
      },
    },
    ({ name }) => {
      const theme = CHART_THEME_IDS.find(id => id === name?.trim().toLowerCase())
      const text = theme
        ? `${applyVisualTheme(theme).text} Confirm it to the user in one short line; no tool call is needed.`
        : `TinyPivot's theme is **${store.getVisualTheme()}**. Tell the user, in one short line, that they can pick one of: ${CHART_THEME_IDS.join(', ')} (for example /mcp__tinypivot__theme paper).`
      return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
    },
  )

  // 12. App-only tool: fetch datasets list for switcher dropdown
  widgetOnly(server.registerTool(
    'get_datasets_state',
    {
      title: 'Get Datasets State (App Internal)',
      description: 'Internal app-only tool returning all loaded datasets for the UI switcher.',
      inputSchema: {},
      _meta: APP_ONLY_META,
    },
    async (_args, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      return {
        content: [{ type: 'text', text: 'OK' }],
        structuredContent: {
          activeDatasetId: store.getActiveId(sessionKey),
          datasets: store.listMetadata(sessionKey),
        },
      }
    },
  ))

  return { server, store }
}
