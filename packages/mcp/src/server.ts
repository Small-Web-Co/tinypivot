import type {
  AggregationFunction,
  ChartAggregation,
  ChartConfig,
  ChartThemePreset,
  PivotConfig,
} from '@smallwebco/tinypivot-core'
import type { AnalyzeMethod } from './analyze.js'
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
import { runAnalysis } from './analyze.js'
import { auditQueryResult, formatAuditWarnings, formatSqlRepairHint } from './audit.js'
import { CHANNEL_NOTIFICATION, claudeChannelEnabled } from './claude-channel.js'
import { QueryRejected, withinBudget } from './duckdb.js'
import { formatHistoryList, formatSessionList } from './history.js'
import { refreshAgentExtension } from './init.js'
import { classifyMcpLicenseKey, isMcpLicenseKey, isValidDemoToken } from './license.js'
import { ROW_PAGE_SIZE } from './limits.js'
import { extractSqlLineage } from './lineage.js'
import { executeReadOnlyPostgresQuery, listPostgresTables } from './postgres.js'
import { MODEL_CATALOG, tokensToUsd } from './pricing.js'
import { formatProfile, formatProLoadTraps, profileDirectory } from './profile.js'
import { chartConfigFromPivot, DatasetStore, datasetView, DEFAULT_SESSION_KEY, FREE_TIER_ROW_LIMIT } from './store.js'
import { agentLabel, Studio } from './studio.js'
import { describeChartForText, formatDatasetSummary, formatPivotSummary } from './summary.js'
import { bucketRowCount, recordTelemetry } from './telemetry.js'
import { detectNonAdditiveSumWarning, formatTerminalChart } from './terminal-chart.js'
import { hasFeature } from './tiers.js'

export const APP_RESOURCE_URI = 'ui://tinypivot/app.html'
export const APP_MIME_TYPE = 'text/html;profile=mcp-app'

/** Rows the model may pass to load_data. Each one is billed as output, at about 5x input. */
const LOAD_DATA_ROW_GUIDE = 50

/**
 * What the model is told once per session. Hosts send it with every request, so every word
 * here costs every user on every turn: keep it to what changes the model's behaviour.
 */
export function buildInstructions({ reprintCards = true, claudeChannel = false, isPro = false }: { reprintCards?: boolean, claudeChannel?: boolean, isPro?: boolean } = {}): string {
  const cards = reprintCards
    ? 'In a terminal, show the ```text card verbatim with the Studio link only when a chart/pivot was asked for (never in pi or inline views); else give concise findings and the Studio link.'
    : 'Do not reprint the ```text card: the user sees it in TinyPivot. Reply with the takeaways and the Studio link.'
  return [
    'Show figures through TinyPivot: any ranking, breakdown, comparison, trend, map, chart or pivot, instead of Markdown tables, HTML, SVG or matplotlib, passing chartConfig or pivotConfig in the same call.',
    `Use load_file to chart files, or query (sql or queries[] up to 6 SELECTs over files) to filter/join/aggregate without loading rows into context. load_data is only for <=${LOAD_DATA_ROW_GUIDE} inline rows; history lists/reopens pulls.`,
    `Chart types: ${CHART_TYPES.map(t => t.type).join(', ')}; names like map also work. slope: xAxisField the items, seriesField the two periods; treemap: seriesField the parent; bullet: targetField the target.`,
    'Totals are exact. Compute ratios, shares and rates as numerator / denominator, one row per chart point, before loading; never add up percentage columns, and do not use percentOfTotal for a share within a period.',
    'Use keepExisting: true only to compare datasets in one conversation; clear_datasets resets.',
    'On every data call pass why (one short sentence for TinyPivot Studio); when loading or querying, also ask (the user\'s request, verbatim).',
    ...(hasFeature(isPro, 'audit_deep')
      ? ['Skip Read/load_file when analyzing files: pass multiple read-only SELECTs in query.queries[] (exact tables returned) over file paths directly, or call analyze(method, filePath) in 1 call for A/B tests, confounding/regression, cohorts, seasonality/anomalies, or mix-vs-rate. Fix any [AUDIT] or [PRO DATA GUARD] warnings before answering.']
      : []),
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
  xAxisField: z.string(),
  yAxisField: z.string(),
  aggregation: z.enum(CHART_AGG_VALUES).default('sum'),
  seriesField: z.string().optional(),
  targetField: z.string().optional(),
  title: z.string().optional(),
}

/**
 * Finishing touches only `configure_chart` takes: map geography, callouts, the deck layout, and
 * dashboard filters (a filter control per listed column above every view, when the user asks).
 */
const chartStyleShape = {
  geography: z.enum(GEOGRAPHY_VALUES).optional(),
  annotations: z.boolean().optional(),
  variant: z.enum(['editorial', 'deck']).optional(),
  footnote: z.string().optional(),
  filters: z.array(z.string()).optional().describe('Columns to offer as filter controls'),
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
  /**
   * Start the localhost Studio if it is not running and return its URL. `open: false` leaves
   * opening it to the caller: where the host draws TinyPivot's view, the view asks the host.
   */
  ensureCompanion?: (options?: { open?: boolean }) => Promise<string | undefined>
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
/** What configure_chart says about the dashboard filters it was asked for. */
function filterNote(asked: string[] | undefined, shown: string[] | undefined): string[] {
  if (!asked)
    return []
  const missing = asked.filter(field => !shown?.includes(field))
  return [
    shown?.length ? `Filters above every view: ${shown.join(', ')}.` : 'Filters removed.',
    ...(missing.length ? [`Not columns, so left out: ${missing.join(', ')}.`] : []),
  ]
}

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

  const validMcpKey = isMcpLicenseKey(options.licenseKey) ? options.licenseKey! : null
  const validDemoToken = isValidDemoToken(options.demoToken) ? options.demoToken! : null
  const isPro = Boolean(validMcpKey || validDemoToken)

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
    ...datasetView(dataset),
    chartTheme: isPro ? store.getVisualTheme() : 'code',
    datasets: store.listMetadata(options.sessionKey),
    licenseKey: validMcpKey,
    demoToken: validDemoToken,
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

export { isMcpLicenseKey }

const READ_ONLY_LOCAL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const READ_ONLY_REMOTE_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

const LOCAL_WRITE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const STUDIO_REPLY_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

function datasetNotFoundError(datasetId: string | undefined, store: DatasetStore, sessionKey: string) {
  const available = store.listMetadata(sessionKey).map(d => d.id)
  const hint = available.length > 0
    ? `Available dataset IDs: ${available.join(', ')}. Pass one of those IDs, or call list_datasets to inspect schemas.`
    : 'No datasets are loaded in this session. Call load_file (for local CSV/TSV/JSON/JSONL), query (for DuckDB SQL), or load_data (for small in-memory rows) first.'
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: `Dataset "${datasetId ?? '(active)'}" not found. ${hint}` }],
  }
}

function formatLoadFileError(filePath: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string } | null)?.code
  if (code === 'ENOENT' || /ENOENT|no such file/i.test(message)) {
    return `Failed to load file "${filePath}": ${message}. Try passing an absolute file path and verify the file exists.`
  }
  if (code === 'EACCES' || /EACCES|permission denied/i.test(message)) {
    return `Failed to load file "${filePath}": ${message}. Check file read permissions before retrying.`
  }
  return `Failed to load file "${filePath}": ${message}. Supported direct formats are CSV, TSV, JSON, and JSONL; for Parquet or custom SQL transformations, try the query tool with DuckDB SQL.`
}

function formatQueryError(error: unknown, store: DatasetStore, sessionKey: string, sql?: string, isPro = false): string {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof QueryRejected) {
    return `${message} Pass a single read-only SELECT, WITH, DESCRIBE, or EXPLAIN statement.`
  }
  const tables = store.listMetadata(sessionKey).map(d => d.id)
  const tableHint = tables.length > 0
    ? ` Loaded tables: ${tables.join(', ')}.`
    : ''
  const repairHint = hasFeature(isPro, 'sql_repair_hints') && sql ? formatSqlRepairHint(message, sql, store, sessionKey) : ''
  return `Query failed: ${message}.${tableHint} Call list_datasets to inspect loaded table and column names, or quote local file paths like FROM '/path/to/file.csv'.${repairHint}`
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
  const licenseStatus = classifyMcpLicenseKey(rawLicenseKey)
  const licenseKey = licenseStatus === 'mcp' ? rawLicenseKey : undefined
  if (licenseStatus === 'ui') {
    console.error('[tinypivot-mcp] Notice: UI Library keys (TP-PRO*) apply to @smallwebco/tinypivot-react/-vue. TinyPivot MCP Pro requires an MCP license key (TP-MCPP* / TP-MCPT*) from https://tiny-pivot.com/pricing')
  }
  else if (licenseStatus === 'expired') {
    console.error('[tinypivot-mcp] Notice: TINYPIVOT_LICENSE_KEY has expired — running on Free tier. Renew at https://tiny-pivot.com/pricing')
  }
  else if (licenseStatus === 'invalid') {
    console.error('[tinypivot-mcp] Notice: TINYPIVOT_LICENSE_KEY failed signature verification — running on Free tier. Check your key or get one at https://tiny-pivot.com/pricing')
  }
  const rawDemoToken = options.demoToken ?? process.env.TINYPIVOT_DEMO_TOKEN
  const demoToken = isValidDemoToken(rawDemoToken) ? rawDemoToken : undefined
  const isPro = Boolean(licenseKey || demoToken)
  const tier: 'free' | 'pro' = isPro ? 'pro' : 'free'
  const store = options.store ?? new DatasetStore({
    maxRowsPerDataset: hasFeature(isPro, 'unlimited_rows') ? Number.POSITIVE_INFINITY : FREE_TIER_ROW_LIMIT,
  })
  /** A widget host that asked for the Studio once (open_tinypivot) keeps getting its link. */
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
      version: '0.8.4',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        ...(claudeChannel ? { experimental: { 'claude/channel': {} } } : {}),
      },
      instructions: buildInstructions({ reprintCards, claudeChannel, isPro }),
    },
  )

  const clientRendersWidget = () => clientSupportsMcpAppsUi(server.server.getClientCapabilities())
  /** How cards are written for this host: where the widget or pi's extension shows the card, the model does not repeat it. */
  const cardFormat = (): TerminalFormatOptions => ({
    showBranding: !isPro,
    reprintNote: reprintCards,
    shownBy: clientRendersWidget() ? 'widget' : getClientName() === 'pi' ? 'pi' : undefined,
  })

  /**
   * The Studio's address for this reply, asked of the CLI every time rather than remembered: a
   * Studio the user stopped, or that stopped with no tab open, starts again here, instead of the
   * reply handing out a dead address that another session's Studio may since have taken.
   */
  const resolveCompanionUrlForTool = async (): Promise<string | undefined> => {
    if (!options.ensureCompanion)
      return options.companionUrl
    // Where TinyPivot's view is drawn in the chat, the view asks the host to open the Studio, so
    // the host can show it in its own browser rather than the system one.
    return options.ensureCompanion({ open: !clientRendersWidget() })
  }

  /**
   * The app payload (preview rows, model catalog, license) exists to feed the inline widget.
   * Hosts without MCP Apps give structuredContent to the model in place of the text, which costs
   * thousands of tokens and hides the terminal card, so they get the text summary on its own.
   */
  const dataToolResult = (summaryText: string, payload: ReturnType<typeof buildAppPayload>, studioUrl: string | undefined) => {
    const content = [{ type: 'text' as const, text: summaryText }]
    return clientRendersWidget() ? { content, structuredContent: { ...payload, studioUrl: studioUrl ?? null } } : { content }
  }

  /** The shared ending of every tool that loads a dataset: the card for the model, the payload for the widget. */
  const replyWithDataset = async (
    ds: StoredDataset,
    sessionKey: string,
    tool: string,
    note = '',
    formatOverrides: Partial<TerminalFormatOptions> = {},
  ) => {
    const liveCompanionUrl = await resolveCompanionUrlForTool()
    const summaryText = `${formatDatasetSummary(ds, liveCompanionUrl, { ...cardFormat(), ...formatOverrides })}${note}`
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
    return dataToolResult(summaryText, payload, liveCompanionUrl)
  }

  const studio = options.studio ?? new Studio(store)
  const recalledMemoryKeys = new Set<string>()
  const recallMemoryOnce = (tableHints: string[], columns?: string[]): string => {
    if (!hasFeature(isPro, 'recursive_memory') || tableHints.length === 0)
      return ''
    const unseen = tableHints.filter(h => !recalledMemoryKeys.has(h.toLowerCase()))
    if (unseen.length === 0)
      return ''
    for (const h of unseen)
      recalledMemoryKeys.add(h.toLowerCase())
    return studio.memory.formatRecall(unseen, columns)
  }
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
        annotations: STUDIO_REPLY_ANNOTATIONS,
      },
      async ({ text }) => {
        const step = studio.reply(text)
        if (hasFeature(isPro, 'claim_gate') && step.claims?.length) {
          const missing = step.claims.filter(c => c.status === 'not-found')
          const checked = step.claims.filter(c => c.status !== 'unchecked')
          if (missing.length > 0) {
            return {
              content: [{
                type: 'text' as const,
                text: `Shown in TinyPivot Studio. ⚠️ [CLAIM CHECK] ${missing.length} of ${checked.length} quoted numbers were not found in the session data (${missing.map(c => c.text).join(', ')}). Verify against the query output and send a corrected studio_reply if needed.`,
              }],
            }
          }
        }
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
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: PANE_UI_META,
    },
    async ({ datasetId, viewMode }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return datasetNotFoundError(datasetId, store, sessionKey)
      }
      if (viewMode) {
        store.updateView(ds.id, { viewMode }, sessionKey)
      }
      else {
        store.setActive(ds.id, sessionKey)
      }

      const liveCompanionUrl = await resolveCompanionUrlForTool()
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
      return dataToolResult(summaryText, payload, liveCompanionUrl)
    },
  )

  // 2. Load local CSV / TSV / JSON / JSONL / XLSX file
  server.registerTool(
    'load_file',
    {
      title: 'Load Data File into TinyPivot',
      description: 'Chart or pivot a local CSV/TSV/JSON/JSONL/XLSX file without reading rows into context.',
      inputSchema: {
        filePath: z.string(),
        sheet: z.string().optional(),
        name: z.string().optional(),
        why: whyParam,
        ask: askParam,
        where: z.array(rowFilterSchema).optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional(),
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ filePath, sheet, name, why, ask, where, viewMode, pivotConfig, chartConfig, keepExisting }, extra) => {
      try {
        const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting)
        const ds = await store.loadFromFile(filePath, name, { sessionKey, keepExisting: shouldKeep, where, sheet })
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
        let proLoadNote = ds.sheetNames && ds.sheetNames.length > 1
          ? `\nWorkbook sheets: ${ds.sheetNames.map(s => `\`${s}\``).join(', ')} (loaded \`${ds.loadedSheet}\`; pass \`sheet\` to load another).`
          : ''
        if (hasFeature(isPro, 'profile_relational')) {
          const peerDatasets = store.listMetadata(sessionKey).flatMap((m) => {
            if (m.id === ds.id)
              return []
            const peer = store.get(m.id, sessionKey)
            return peer ? [peer] : []
          })
          proLoadNote += formatProLoadTraps(ds, peerDatasets)
        }
        if (hasFeature(isPro, 'recursive_memory'))
          proLoadNote += recallMemoryOnce([ds.source, ds.id], ds.columns.map(c => c.name))
        return replyWithDataset(ds, sessionKey, 'load_file', proLoadNote)
      }
      catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: formatLoadFileError(filePath, err) }],
        }
      }
    },
  )

  // 3. Load inline JSON rows (pipe output from Stripe, APIs, SQL, or any other MCP tool!)
  server.registerTool(
    'load_data',
    {
      title: 'Load JSON Rows into TinyPivot',
      description: 'Chart or pivot small inline rows (up to ~50; for larger sets use load_file).',
      inputSchema: {
        name: z.string(),
        why: whyParam,
        ask: askParam,
        rows: z.array(z.record(z.string(), z.unknown())),
        source: z.string().optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional(),
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
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
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ datasetId, rowFields, columnFields, valueFields, why, showRowTotals, showColumnTotals }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return datasetNotFoundError(datasetId, store, sessionKey)
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

      return dataToolResult(summary, payload, liveCompanionUrl)
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
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ datasetId, chartTheme, why, filters, ...chartInput }, extra) => {
      const { xAxisField, yAxisField, aggregation, seriesField } = chartInput
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return datasetNotFoundError(datasetId, store, sessionKey)
      }

      if (chartTheme && (isPro || chartTheme === 'code')) {
        store.setVisualTheme(chartTheme as ChartThemePreset)
      }
      const chartConfig = toCoreChartConfig(chartInput, ds.name)
      const type = chartConfig.type!
      const columnNames = new Set(ds.columns.map(column => column.name))
      const filterFields = filters?.filter(field => columnNames.has(field))
      store.updateView(ds.id, {
        viewMode: 'chart',
        chartConfig,
        ...(filterFields ? { filterFields } : {}),
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
        ...filterNote(filters, filterFields),
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
      return dataToolResult(summaryText, payload, liveCompanionUrl)
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
          keepExisting: z.boolean().optional(),
        },
        annotations: READ_ONLY_REMOTE_ANNOTATIONS,
        _meta: INLINE_UI_META,
      },
      async ({ sql, why, ask, name, viewMode, pivotConfig, keepExisting }, extra) => {
        if (!isPro) {
          return {
            isError: true,
            content: [{
              type: 'text',
              text: 'Read-only PostgreSQL querying (`query_postgres`) requires a TinyPivot Pro license (TINYPIVOT_LICENSE_KEY). Free tier includes unlimited local CSV/TSV/JSON/Parquet analysis — or export via `psql --csv` and pass the file to `load_file`. Upgrade at https://tiny-pivot.com/pricing',
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
            content: [{ type: 'text', text: `PostgreSQL query failed: ${err instanceof Error ? err.message : String(err)}. Call list_datasets to check available PostgreSQL tables and ensure the query is a single read-only SELECT.` }],
          }
        }
      },
    )
  }

  function formatCompactTable(columns: string[], rows: Record<string, unknown>[], maxRows = 25): string {
    if (columns.length === 0)
      return '_(no columns)_'
    const shown = rows.slice(0, maxRows)
    const header = `| ${columns.join(' | ')} |`
    const sep = `| ${columns.map(() => '---').join(' | ')} |`
    const body = shown.map(r => `| ${columns.map(c => String(r[c] ?? '')).join(' | ')} |`)
    const more = rows.length > maxRows ? `\n_(+${rows.length - maxRows} more rows)_` : ''
    return `${header}\n${sep}\n${body.join('\n')}${more}`
  }

  // 7. List loaded datasets (and Postgres tables if configured)
  // SQL over local files and earlier pulls, through an embedded DuckDB downloaded on first use.
  server.registerTool(
    'query',
    {
      title: 'Query Files with SQL',
      description: 'Read-only DuckDB SELECT over local files or datasets, then chart or pivot.',
      inputSchema: {
        sql: z.string().optional(),
        queries: z.array(z.string()).optional(),
        why: whyParam,
        ask: askParam,
        name: z.string().optional(),
        viewMode: z.enum(VIEW_MODE_VALUES).optional(),
        pivotConfig: pivotConfigSchema.optional(),
        chartConfig: loadChartSchema.optional(),
        keepExisting: z.boolean().optional(),
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ sql, queries, why, ask, name, viewMode, pivotConfig, chartConfig, keepExisting }, extra) => {
      const { sessionKey, keepExisting: shouldKeep } = resolveSessionContext(extra, keepExisting ?? (name ? true : undefined))
      const activeStatements = queries?.length
        ? queries.map(q => q.trim()).filter(Boolean).slice(0, 6)
        : (sql?.trim() ? [sql.trim()] : [])
      const primarySql = activeStatements[activeStatements.length - 1] ?? ''
      try {
        if (activeStatements.length === 0)
          return { isError: true, content: [{ type: 'text' as const, text: 'SQL query is empty.' }] }
        if (await withinBudget(studio.duck.prepare(), DUCKDB_WAIT_MS) === 'pending') {
          return { content: [{ type: 'text' as const, text: 'DuckDB is downloading for its first use (about 20 MB, once). Run the same query again in a minute.' }] }
        }
        const priorStatements = activeStatements.slice(0, -1)

        const runBasicAudit = hasFeature(isPro, 'audit_basic')
        const runDeepAudit = hasFeature(isPro, 'audit_deep')
        const views = studio.queryViews(sessionKey)
        const priorBlocks: string[] = []
        const allWarnings: Awaited<ReturnType<typeof auditQueryResult>> = []

        for (let idx = 0; idx < priorStatements.length; idx++) {
          const stmt = priorStatements[idx]
          const res = await studio.duck.run(stmt, views, 50)
          priorBlocks.push(`\n### Batch Query ${idx + 1}/${activeStatements.length} (${res.rows.length} row${res.rows.length === 1 ? '' : 's'})\n${formatCompactTable(res.columns, res.rows)}`)
          if (runBasicAudit || runDeepAudit) {
            const tempDs: StoredDataset = {
              id: `batch_${idx + 1}`,
              name: `Batch ${idx + 1}`,
              source: stmt,
              ingestionMode: 'direct',
              rawBytes: 0,
              estimatedDatasetTokens: 0,
              rows: res.rows,
              columns: res.columns.map(c => ({ name: c, type: 'string' as const, sampleValues: [], distinctCount: 0 })),
              sourceTotalRows: res.rows.length,
              truncatedForFreeTier: false,
              viewMode: 'grid',
              loadedAt: new Date().toISOString(),
            }
            const w = await auditQueryResult({ sql: stmt, dataset: tempDs, duck: studio.duck, views, deep: runDeepAudit })
            allWarnings.push(...w)
          }
        }

        const { dataset, truncated } = await studio.runQuery({
          sql: primarySql,
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
        let auditBlock = ''
        let memoryBlock = ''
        if (runBasicAudit || runDeepAudit) {
          const sqlSources = [...new Set(activeStatements.flatMap(s => extractSqlLineage(s).sources))]
          if (hasFeature(isPro, 'recursive_memory'))
            memoryBlock = recallMemoryOnce(sqlSources)
          const warnings = await auditQueryResult({
            sql: primarySql,
            dataset,
            duck: studio.duck,
            views: studio.queryViews(sessionKey),
            deep: runDeepAudit,
          })
          allWarnings.push(...warnings)
          const dedupedWarnings = [...new Map(allWarnings.map(w => [`${w.kind}:${w.title}`, w])).values()]
          auditBlock = formatAuditWarnings(dedupedWarnings)
          if (hasFeature(isPro, 'recursive_memory') && dedupedWarnings.length > 0 && sqlSources.length > 0) {
            const targetSource = sqlSources[0]
            for (const w of dedupedWarnings) {
              studio.memory.recordLesson({
                tableHint: targetSource,
                key: `audit:${w.kind}:${targetSource.toLowerCase()}`,
                kind: 'audit',
                summary: `${w.title}: ${w.detail}`,
              })
            }
          }
        }
        const batchNote = priorBlocks.length > 0 ? `\n${priorBlocks.join('\n')}` : ''
        const note = `${batchNote}${truncated ? `\n_Result cut at ${dataset.rows.length.toLocaleString('en-US')} rows._` : ''}${auditBlock}${memoryBlock}`
        const preferSmallTable = !viewMode && !chartConfig && !pivotConfig
        return replyWithDataset(dataset, sessionKey, 'query', note, { preferSmallTable })
      }
      catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: formatQueryError(error, store, sessionKey, primarySql, isPro) }] }
      }
    },
  )

  // Column-level statistics (plus Pro relational grain, join-key fan-out & partial-period summary), or 1-call folder schema scan.
  server.registerTool(
    'profile',
    {
      title: 'Profile Dataset or Folder',
      description: 'Profile a dataset (nulls, ranges, top values) or scan a folder (dirPath) of file schemas.',
      inputSchema: {
        datasetId: z.string().optional(),
        dirPath: z.string().optional(),
        why: whyParam,
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
    },
    async ({ datasetId, dirPath, why }, extra) => {
      const useRelational = hasFeature(isPro, 'profile_relational')
      if (dirPath) {
        try {
          await withinBudget(studio.duck.prepare(), DUCKDB_WAIT_MS)
          const text = await profileDirectory(dirPath, { duck: studio.duck, isPro: useRelational })
          return { content: [{ type: 'text' as const, text }] }
        }
        catch (err) {
          return { isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] }
        }
      }
      const { sessionKey } = resolveSessionContext(extra)
      const ds = store.get(datasetId, sessionKey)
      if (!ds)
        return datasetNotFoundError(datasetId, store, sessionKey)
      const peerDatasets = useRelational
        ? store.listMetadata(sessionKey).flatMap((m) => {
            if (m.id === ds.id)
              return []
            const peer = store.get(m.id, sessionKey)
            return peer ? [peer] : []
          })
        : []
      studio.recordDatasetStep(ds, { actor: 'agent', tool: 'profile', why })
      return { content: [{ type: 'text' as const, text: formatProfile(ds, { isPro: useRelational, peerDatasets }) }] }
    },
  )

  // Unified deterministic Data Science shelf: Free gets explain_change & basic ab_test; Pro adds SRM/Holm-Bonferroni, regression, cohort_retention & anomalies.
  const PRO_ONLY_METHODS = new Set<AnalyzeMethod>(['regression', 'cohort_retention', 'anomalies'])
  server.registerTool(
    'analyze',
    {
      title: 'Statistical Analysis',
      description: hasFeature(isPro, 'analyze_pro')
        ? '1-call stats on datasetId/filePath (auto-detects cols): explain_change, ab_test (+SRM/Holm), regression, cohort_retention, anomalies.'
        : '1-call stats on datasetId/filePath: explain_change, ab_test (Pro: regression, cohort_retention, anomalies).',
      inputSchema: {
        method: z.enum(['explain_change', 'ab_test', 'regression', 'cohort_retention', 'anomalies']),
        datasetId: z.string().optional(),
        filePath: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
        why: whyParam,
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ method, datasetId, filePath, params, why }, extra) => {
      const hasProAnalyze = hasFeature(isPro, 'analyze_pro')
      if (PRO_ONLY_METHODS.has(method) && !hasProAnalyze) {
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `\`analyze(method="${method}")\` requires TinyPivot Pro (TINYPIVOT_LICENSE_KEY). Free includes \`explain_change\` and basic \`ab_test\`; Pro unlocks SRM/Holm-Bonferroni guards, controlled multivariate \`regression\`, right-censored \`cohort_retention\`, and seasonal \`anomalies\`. Upgrade at https://tiny-pivot.com/pricing`,
          }],
        }
      }
      const { sessionKey } = resolveSessionContext(extra)
      let ds = filePath ? undefined : store.get(datasetId, sessionKey)
      if (filePath) {
        try {
          ds = await store.loadFromFile(filePath, undefined, { sessionKey, keepExisting: true })
          studio.remember(ds, { kind: 'file', source: filePath })
        }
        catch (err) {
          return { isError: true, content: [{ type: 'text' as const, text: formatLoadFileError(filePath, err) }] }
        }
      }
      if (!ds)
        return datasetNotFoundError(datasetId, store, sessionKey)
      try {
        const output = runAnalysis(ds, { ...(params ?? {}), method }, { proGuards: hasProAnalyze })
        if (output.rows.length > 0) {
          const outDs = store.register({
            name: output.title,
            source: `analyze:${method}:${ds.id}`,
            ingestionMode: 'direct',
            rows: output.rows,
            viewMode: output.chartConfig ? 'chart' : 'grid',
            chartConfig: output.chartConfig,
            sessionKey,
            keepExisting: true,
          })
          studio.remember(outDs, { kind: 'data', source: `analyze:${method}:${ds.id}` })
          studio.recordDatasetStep(outDs, { actor: 'agent', tool: 'analyze', why: why ?? output.title })
          return replyWithDataset(outDs, sessionKey, 'analyze', `\n\n${output.summaryText}`)
        }
        return { content: [{ type: 'text' as const, text: output.summaryText }] }
      }
      catch (error) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
        }
      }
    },
  )

  // Every pull is saved locally; list them, or reopen one without re-querying.
  server.registerTool(
    'history',
    {
      title: 'Saved Pulls & Sessions',
      description: 'List saved pulls or past sessions (`sessions: true`), or reopen a pull by id.',
      inputSchema: {
        open: z.string().optional(),
        sessions: z.boolean().optional(),
        why: whyParam,
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: INLINE_UI_META,
    },
    async ({ open, sessions, why, limit }, extra) => {
      const { history } = studio
      if (!history.enabled)
        return { content: [{ type: 'text' as const, text: 'History is off (TINYPIVOT_HISTORY=0).' }] }
      if (sessions && !open)
        return { content: [{ type: 'text' as const, text: formatSessionList(history.listSessions(limit ?? 20)) }] }
      if (!open)
        return { content: [{ type: 'text' as const, text: formatHistoryList(history.list(limit ?? 15)) }] }
      const { sessionKey } = resolveSessionContext(extra, true)
      try {
        const ds = await studio.reopen(open, { actor: 'agent', why, sessionKey })
        return replyWithDataset(ds, sessionKey, 'history')
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { isError: true, content: [{ type: 'text' as const, text: `Could not reopen "${open}": ${message}. Try one of the saved pull IDs below, or call history with no arguments to list more.\n${formatHistoryList(history.list(5))}` }] }
      }
    },
  )

  server.registerTool(
    'list_datasets',
    {
      title: 'List Datasets',
      description: 'List loaded datasets with their row counts and columns.',
      inputSchema: {},
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
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
      annotations: LOCAL_WRITE_IDEMPOTENT_ANNOTATIONS,
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
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
      _meta: APP_ONLY_META,
    },
    async ({ datasetId, offset, limit }, extra) => {
      const sessionKey = extractSessionKey(extra) ?? DEFAULT_SESSION_KEY
      const ds = store.get(datasetId, sessionKey)
      if (!ds) {
        return datasetNotFoundError(datasetId, store, sessionKey)
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
          ...datasetView(ds),
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
      annotations: LOCAL_WRITE_IDEMPOTENT_ANNOTATIONS,
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
      annotations: STUDIO_REPLY_ANNOTATIONS,
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
      annotations: LOCAL_WRITE_IDEMPOTENT_ANNOTATIONS,
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
      annotations: READ_ONLY_LOCAL_ANNOTATIONS,
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
