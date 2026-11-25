import type { ChartConfig, ChartSortOrder, ChartThemePreset, DataGridViewMode, DrillThroughResult, PivotConfig, Theme } from '@smallwebco/tinypivot-core'
import type { NoteAttachment, StudioSnapshot } from '../src/studio-protocol'
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import {
  CHART_THEME_PRESETS,
  isUnifiedTheme,

} from '@smallwebco/tinypivot-core'
import { DataGrid, enableDemoMode, setLicenseKey } from '@smallwebco/tinypivot-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { INTERACTIVE_ROW_LIMIT, ROW_PAGE_SIZE } from '../src/limits'
import { rowAttachment, sliceAttachment, viewAttachment } from './attachments'
import { postToStudio } from './companionApi'
import { StudioPanel } from './StudioPanel'

interface DatasetMeta {
  id: string
  name: string
  source: string
  rowCount: number
  viewMode: DataGridViewMode
}

interface ModelPricing {
  id: string
  name: string
  provider: string
  ratePerMillion: number
}

interface SessionSavings {
  model: ModelPricing
  turns: number
  localActions: number
  tokensSaved: number
  usdSaved: number
}

interface TokenStats {
  ingestionMode: 'direct' | 'inline'
  rawBytes: number
  estimatedDatasetTokens: number
  summaryTokens: number
  turnTokensSaved: number
  turnUsdSaved: number
  session: SessionSavings
}

interface ToolPayload {
  datasetId: string
  name: string
  source: string
  totalRows: number
  sourceTotalRows?: number
  truncatedForFreeTier?: boolean
  tier?: 'free' | 'pro'
  previewRows?: Record<string, unknown>[]
  rows?: Record<string, unknown>[]
  hasMoreRows?: boolean
  viewMode?: DataGridViewMode
  pivotConfig?: Partial<PivotConfig> | null
  chartConfig?: Partial<ChartConfig> | null
  chartTheme?: ChartThemePreset
  datasets?: DatasetMeta[]
  licenseKey?: string | null
  demoToken?: string | null
  modelCatalog?: ModelPricing[]
  tokenStats?: TokenStats
}

interface ActionToast {
  message: string
  upgradeCta?: boolean
}

const SURFACE_CSS_VARS: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--color-background-primary': '#ffffff',
    '--color-background-secondary': '#f8fafc',
    '--color-background-tertiary': '#f1f5f9',
    '--color-text-primary': '#0f172a',
    '--color-text-secondary': '#475569',
    '--color-text-tertiary': '#64748b',
    '--color-text-inverse': '#ffffff',
    '--color-border-primary': 'rgba(15, 23, 42, 0.14)',
    '--color-border-secondary': 'rgba(15, 23, 42, 0.22)',
  },
  dark: {
    '--color-background-primary': '#0b101b',
    '--color-background-secondary': '#111827',
    '--color-background-tertiary': 'rgba(148, 163, 184, 0.1)',
    '--color-text-primary': '#e2e8f0',
    '--color-text-secondary': '#94a3b8',
    '--color-text-tertiary': '#64748b',
    '--color-text-inverse': '#0b101b',
    '--color-border-primary': 'rgba(148, 163, 184, 0.2)',
    '--color-border-secondary': 'rgba(148, 163, 184, 0.32)',
  },
}

function applySurfaceCssVars(mode: 'light' | 'dark') {
  if (typeof document === 'undefined')
    return
  const root = document.documentElement
  root.style.colorScheme = mode
  root.classList.remove('tp-surface-light', 'tp-surface-dark')
  root.classList.add(`tp-surface-${mode}`)
  const vars = SURFACE_CSS_VARS[mode]
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

const FALLBACK_MODELS: ModelPricing[] = [
  { id: 'gemini-4-neon', name: 'Gemini 4 Neon', provider: 'Google', ratePerMillion: 3.0 },
  { id: 'gemini-4-pro', name: 'Gemini 4 Pro', provider: 'Google', ratePerMillion: 2.0 },
  { id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5', provider: 'Anthropic', ratePerMillion: 2.0 },
  { id: 'claude-opus-5.5', name: 'Claude Opus 5.5', provider: 'Anthropic', ratePerMillion: 4.0 },
  { id: 'claude-frontier', name: 'Claude Frontier', provider: 'Anthropic', ratePerMillion: 8.0 },
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI', ratePerMillion: 1.75 },
  { id: 'gpt-6-sol', name: 'GPT-6 Sol', provider: 'OpenAI', ratePerMillion: 2.0 },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', provider: 'OpenAI', ratePerMillion: 8.0 },
]

const VISUAL_THEMES = (Object.entries(CHART_THEME_PRESETS) as Array<[ChartThemePreset, (typeof CHART_THEME_PRESETS)[ChartThemePreset]]>)
  .map(([id, meta]) => ({
    id,
    label: meta.label,
    description: meta.description,
    swatches: [meta.colors[0], meta.colors[1]] as [string, string],
  }))

const THEME_STORAGE_KEY = 'tinypivot:visual-theme'

function readSavedVisualTheme(): ChartThemePreset | null {
  try {
    const saved = window.localStorage?.getItem(THEME_STORAGE_KEY) as ChartThemePreset | null
    return saved && saved in CHART_THEME_PRESETS ? saved : null
  }
  catch {
    return null
  }
}

function formatCompactTokens(tokens: number): string {
  if (tokens < 1000)
    return `${tokens}`
  if (tokens >= 1_000_000)
    return `${(tokens / 1_000_000).toFixed(2)}M`
  return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`
}

function formatUsd(amount: number): string {
  if (amount <= 0)
    return '$0.00'
  if (amount < 0.01)
    return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}

const CHART_SORT_OPTIONS: Array<{ value: ChartSortOrder, short: string, label: string, desc: string }> = [
  { value: 'value-desc', short: '↓ Desc', label: '↓ Descending', desc: 'Highest to lowest value' },
  { value: 'value-asc', short: '↑ Asc', label: '↑ Ascending', desc: 'Lowest to highest value' },
  { value: 'label-asc', short: 'A–Z', label: 'A–Z Label / Time', desc: 'Chronological or alphabetical' },
  { value: 'data', short: 'Grid', label: '⊞ Grid Order', desc: 'Matches active Data Grid sort' },
]

export function McpApp() {
  const appRef = useRef<App | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const licenseAppliedRef = useRef(false)
  const userPickedThemeRef = useRef(false)
  const userPickedModeRef = useRef(false)
  /** The pivot and chart as the user last arranged them in the grid, which may differ from the agent's. */
  const livePivotConfig = useRef<Partial<PivotConfig> | undefined>(undefined)
  const liveChartConfig = useRef<Partial<ChartConfig> | undefined>(undefined)

  const [transportMode, setTransportMode] = useState<'connecting' | 'mcp' | 'companion'>('connecting')
  const [loading, setLoading] = useState(true)
  const [statusNote, setStatusNote] = useState<string | null>('Connecting…')
  const [inlineHeight, setInlineHeight] = useState<number | null>(440)
  const [gridTheme, setGridTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined' && window.self === window.top)
      return 'dark'
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  })
  const [visualTheme, setVisualTheme] = useState<ChartThemePreset>(() => readSavedVisualTheme() ?? 'code')

  const [datasetId, setDatasetId] = useState<string>('')
  const [datasetName, setDatasetName] = useState<string>('TinyPivot')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState<number>(0)
  const [sourceTotalRows, setSourceTotalRows] = useState<number>(0)
  const [truncatedForFreeTier, setTruncatedForFreeTier] = useState<boolean>(false)
  const [tier, setTier] = useState<'free' | 'pro'>('free')
  const [datasets, setDatasets] = useState<DatasetMeta[]>([])

  const [viewMode, setViewMode] = useState<DataGridViewMode>('chart')
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [savingsOpen, setSavingsOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [turnLocalActions, setTurnLocalActions] = useState(0)
  const [turnLocalTokens, setTurnLocalTokens] = useState(0)
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null)
  const [modelCatalog, setModelCatalog] = useState<ModelPricing[]>(FALLBACK_MODELS)
  const [pivotConfig, setPivotConfig] = useState<Partial<PivotConfig> | undefined>(undefined)
  const [chartConfig, setChartConfig] = useState<Partial<ChartConfig> | undefined>(undefined)
  const [licenseReady, setLicenseReady] = useState(false)

  const [canMessageHost, setCanMessageHost] = useState(false)
  const [canUpdateContext, setCanUpdateContext] = useState(false)
  const [selectedContext, setSelectedContext] = useState<NoteAttachment | null>(null)
  const [askComment, setAskComment] = useState<string | null>(null)
  const [actionToast, setActionToast] = useState<ActionToast | null>(null)
  const [userSurfaceOverride, setUserSurfaceOverride] = useState(false)
  const [studio, setStudio] = useState<StudioSnapshot | null>(null)
  const [studioOpen, setStudioOpen] = useState(true)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, options?: { upgradeCta?: boolean, durationMs?: number }) => {
    if (toastTimerRef.current)
      clearTimeout(toastTimerRef.current)
    setActionToast({ message, upgradeCta: options?.upgradeCta })
    const duration = options?.durationMs ?? (options?.upgradeCta ? 5000 : 2500)
    toastTimerRef.current = setTimeout(() => {
      setActionToast(null)
      toastTimerRef.current = null
    }, duration)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current)
        clearTimeout(toastTimerRef.current)
    }
  }, [])

  const activeModel = tokenStats?.session?.model ?? modelCatalog[0] ?? FALLBACK_MODELS[0]

  const savingsSummary = useMemo(() => {
    const rate = activeModel.ratePerMillion
    const baseTurnTokens = tokenStats?.turnTokensSaved ?? 0
    const turnTokens = baseTurnTokens + turnLocalTokens
    const turnUsd = (turnTokens / 1_000_000) * rate

    const sessionTokens = tokenStats?.session?.tokensSaved ?? turnTokens
    const sessionUsd = (sessionTokens / 1_000_000) * rate

    return {
      turnTokens,
      turnUsd,
      sessionTokens,
      sessionUsd,
      sessionTurns: tokenStats?.session?.turns ?? 1,
      sessionLocalActions: tokenStats?.session?.localActions ?? turnLocalActions,
      ingestionMode: tokenStats?.ingestionMode ?? 'direct',
      rawKb: tokenStats ? Math.max(1, Math.round(tokenStats.rawBytes / 1024)) : null,
    }
  }, [activeModel, tokenStats, turnLocalTokens, turnLocalActions])

  const applyThemeFromHost = useCallback((hostTheme?: string) => {
    if (!hostTheme || userPickedModeRef.current)
      return
    applyDocumentTheme(hostTheme as 'light' | 'dark')
    setGridTheme(hostTheme === 'dark' ? 'dark' : 'light')
  }, [])

  const applyHostDimensions = useCallback((ctx?: { containerDimensions?: { maxHeight?: number, height?: number, width?: number, maxWidth?: number } }) => {
    const fixedH = ctx?.containerDimensions?.height
    if (typeof fixedH === 'number' && fixedH > 0) {
      setInlineHeight(null)
      return
    }
    const maxH = ctx?.containerDimensions?.maxHeight
    const refWidth = ctx?.containerDimensions?.width
      ?? ctx?.containerDimensions?.maxWidth
      ?? (typeof window !== 'undefined' ? window.innerWidth : 720)
    const idealH = Math.round(refWidth * 0.58)
    const ceiling = typeof maxH === 'number' && maxH > 0 ? Math.min(480, Math.floor(maxH) - 4) : 480
    setInlineHeight(Math.max(360, Math.min(ceiling, idealH)))
  }, [])

  const applyLicense = useCallback(async (payload: ToolPayload) => {
    if (!licenseAppliedRef.current) {
      if (payload.licenseKey && (payload.licenseKey.startsWith('TP-MCPP-') || payload.licenseKey.startsWith('TP-MCPT-'))) {
        await setLicenseKey(payload.licenseKey)
        licenseAppliedRef.current = true
      }
      else if (payload.demoToken) {
        await enableDemoMode(payload.demoToken)
        licenseAppliedRef.current = true
      }
    }
    setLicenseReady(true)
  }, [])

  const applyPayload = useCallback(async (payload: ToolPayload, fetchMore?: (id: string) => void) => {
    await applyLicense(payload)

    const initialRows = payload.rows ?? payload.previewRows ?? []
    const nextTotal = payload.totalRows ?? initialRows.length
    const nextTier = payload.tier ?? ((payload.licenseKey || payload.demoToken) ? 'pro' : 'free')
    setDatasetId(payload.datasetId)
    setDatasetName(payload.name)
    setRows(initialRows)
    setTotalRows(nextTotal)
    setSourceTotalRows(payload.sourceTotalRows ?? nextTotal)
    setTruncatedForFreeTier(Boolean(payload.truncatedForFreeTier))
    setTier(nextTier)
    if (payload.datasets)
      setDatasets(payload.datasets)
    if (payload.viewMode)
      setViewMode(payload.viewMode)
    if (nextTier === 'free') {
      setVisualTheme('code')
    }
    else if (payload.chartTheme && !userPickedThemeRef.current) {
      setVisualTheme(payload.chartTheme)
    }
    setPivotConfig(payload.pivotConfig ?? undefined)
    setChartConfig(payload.chartConfig ?? undefined)
    livePivotConfig.current = undefined
    liveChartConfig.current = undefined
    if (payload.modelCatalog)
      setModelCatalog(payload.modelCatalog)
    if (payload.tokenStats) {
      setTokenStats(payload.tokenStats)
      setTurnLocalActions(0)
      setTurnLocalTokens(0)
    }
    setLoading(false)
    setStatusNote(null)

    if (payload.hasMoreRows && payload.datasetId && fetchMore) {
      fetchMore(payload.datasetId)
    }
  }, [applyLicense])

  /** Pages in the rest of a dataset after its first page, up to the interactive limit. */
  const fetchRemainingRows = useCallback(async (app: App, id: string, loaded: number, total: number) => {
    const target = Math.min(total, INTERACTIVE_ROW_LIMIT)
    let offset = loaded
    while (offset < target) {
      setStatusNote(`Streaming dataset locally… ${offset.toLocaleString()} of ${target.toLocaleString()} rows`)
      const res = await app.callServerTool({
        name: 'fetch_dataset_rows',
        arguments: { datasetId: id, offset, limit: Math.min(ROW_PAGE_SIZE, target - offset) },
      })
      const page = (res.structuredContent as ToolPayload | undefined)?.rows ?? []
      if (page.length === 0)
        break
      setRows(previous => previous.concat(page))
      offset += page.length
    }
    setStatusNote(null)
  }, [])

  const fetchAllRowsMcp = useCallback(async (id?: string) => {
    const app = appRef.current
    if (!app)
      return
    try {
      setStatusNote('Streaming dataset locally…')
      const res = await app.callServerTool({
        name: 'fetch_dataset_rows',
        arguments: { ...(id ? { datasetId: id } : {}), offset: 0, limit: ROW_PAGE_SIZE },
      })
      const sc = res.structuredContent as ToolPayload | undefined
      if (sc?.rows) {
        await applyPayload(sc)
        await fetchRemainingRows(app, sc.datasetId, sc.rows.length, sc.totalRows)
      }
      else {
        setLicenseReady(true)
        setLoading(false)
        setStatusNote(null)
      }
    }
    catch (err) {
      setLicenseReady(true)
      setLoading(false)
      setStatusNote(`Could not fetch dataset rows: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [applyPayload, fetchRemainingRows])

  const trackLocalAction = useCallback((id?: string) => {
    const fallbackAdd = Math.round((tokenStats?.estimatedDatasetTokens ?? 0) * 0.1) + 2500
    setTurnLocalActions(n => n + 1)
    setTurnLocalTokens(t => t + fallbackAdd)
    const targetId = id || datasetId

    if (transportMode === 'companion') {
      void postToStudio<{ session?: SessionSavings }>('/api/local-action', { datasetId: targetId })
        .then((sc) => {
          if (sc?.session)
            setTokenStats(prev => prev ? { ...prev, session: sc.session! } : prev)
        })
        .catch(() => {})
      return
    }

    const app = appRef.current
    if (!app)
      return
    void app.callServerTool({
      name: 'record_local_action',
      arguments: { ...(targetId ? { datasetId: targetId } : {}) },
    }).then((res) => {
      const sc = res.structuredContent as { session?: SessionSavings } | undefined
      if (sc?.session)
        setTokenStats(prev => prev ? { ...prev, session: sc.session! } : prev)
    }).catch(() => {})
  }, [datasetId, tokenStats?.estimatedDatasetTokens, transportMode])

  const handleModelChange = useCallback(async (modelId: string) => {
    const selected = modelCatalog.find(m => m.id === modelId)
    if (selected) {
      setTokenStats(prev => prev
        ? {
            ...prev,
            turnUsdSaved: (prev.turnTokensSaved / 1_000_000) * selected.ratePerMillion,
            session: {
              ...prev.session,
              model: selected,
              usdSaved: (prev.session.tokensSaved / 1_000_000) * selected.ratePerMillion,
            },
          }
        : prev)
    }

    if (transportMode === 'companion') {
      try {
        const sc = await postToStudio<{ session?: SessionSavings }>('/api/model', { model: modelId })
        if (sc?.session)
          setTokenStats(prev => prev ? { ...prev, session: sc.session! } : prev)
      }
      catch {}
      return
    }

    const app = appRef.current
    if (!app)
      return
    try {
      const res = await app.callServerTool({
        name: 'set_session_model',
        arguments: { model: modelId },
      })
      const sc = res.structuredContent as { session?: SessionSavings } | undefined
      if (sc?.session)
        setTokenStats(prev => prev ? { ...prev, session: sc.session! } : prev)
    }
    catch {}
  }, [modelCatalog, transportMode])

  const handleOpenUpgrade = useCallback(() => {
    const url = 'https://tiny-pivot.com/pricing'
    const app = appRef.current
    if (transportMode === 'mcp' && app) {
      void app.openLink({ url }).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer')
      })
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [transportMode])

  const handleVisualThemeChange = useCallback(async (nextTheme: ChartThemePreset) => {
    if (tier === 'free' && nextTheme !== 'code') {
      const themeLabel = CHART_THEME_PRESETS[nextTheme]?.label ?? nextTheme
      showToast(`${themeLabel} is a Pro theme`, { upgradeCta: true, durationMs: 5000 })
      return
    }
    userPickedThemeRef.current = true
    setVisualTheme(nextTheme)
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, nextTheme)
    }
    catch {}
    if (transportMode === 'companion') {
      void postToStudio('/api/theme', { theme: nextTheme }).catch(() => {})
      return
    }
    const app = appRef.current
    if (!app)
      return
    void app.callServerTool({
      name: 'set_visual_theme',
      arguments: { theme: nextTheme },
    }).catch(() => {})
  }, [showToast, tier, transportMode])

  const activeChartSort: ChartSortOrder = chartConfig?.options?.sortOrder ?? 'value-desc'
  const activeSortMeta = CHART_SORT_OPTIONS.find(s => s.value === activeChartSort) ?? CHART_SORT_OPTIONS[0]

  const handleSelectChartSort = useCallback((nextOrder: ChartSortOrder) => {
    setChartConfig(prev => ({
      ...(prev ?? {}),
      options: {
        ...(prev?.options ?? {}),
        sortOrder: nextOrder,
      },
    }))
    setSortMenuOpen(false)
    trackLocalAction()
  }, [trackLocalAction])

  const handleToggleColorMode = useCallback(() => {
    userPickedModeRef.current = true
    setUserSurfaceOverride(true)
    const next: 'light' | 'dark' = gridTheme === 'dark' ? 'light' : 'dark'
    applyDocumentTheme(next)
    applySurfaceCssVars(next)
    setGridTheme(next)
  }, [gridTheme])

  useEffect(() => {
    let active = true
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let eventSource: EventSource | null = null

    const startCompanionMode = async () => {
      if (!active)
        return
      setTransportMode('companion')
      setInlineHeight(null) // Full 100vh browser companion window
      void fetch('/api/studio')
        .then(res => (res.ok ? res.json() as Promise<StudioSnapshot> : null))
        .then((snapshot) => {
          if (active && snapshot)
            setStudio(snapshot)
        })
        .catch(() => {})
      try {
        const res = await fetch('/api/state')
        if (res.ok) {
          const payload = await res.json() as ToolPayload
          if (active)
            await applyPayload(payload)
        }
        else if (active) {
          setLicenseReady(true)
          setLoading(false)
          setStatusNote('Waiting for data from your terminal agent…')
        }
      }
      catch {
        if (active) {
          setLicenseReady(true)
          setLoading(false)
          setStatusNote('Standalone preview (not connected to an MCP host or companion server).')
        }
        return
      }

      // Live SSE stream so terminal agent turns (Claude Code, OpenCode, pi, Ghostty) update instantly
      try {
        eventSource = new EventSource('/api/events')
        eventSource.addEventListener('update', (ev) => {
          if (!active)
            return
          try {
            const payload = JSON.parse((ev as MessageEvent).data) as ToolPayload
            void applyPayload(payload)
          }
          catch {}
        })
        eventSource.addEventListener('studio', (ev) => {
          if (!active)
            return
          try {
            setStudio(JSON.parse((ev as MessageEvent).data) as StudioSnapshot)
          }
          catch {}
        })
      }
      catch {}
    }

    // If opened directly as a top-level browser tab (not inside an iframe), jump straight into Companion mode
    const isTopLevelWindow = typeof window !== 'undefined' && window.self === window.top
    if (isTopLevelWindow) {
      void startCompanionMode()
      return () => {
        active = false
        eventSource?.close()
      }
    }

    const app = new App({ name: 'TinyPivot', version: '0.1.0' }, {})
    appRef.current = app
    let receivedPayload = false

    // Register all handlers BEFORE connect() per MCP Apps spec
    app.ontoolinput = () => {
      setLoading(true)
      setStatusNote('Loading view…')
    }

    app.ontoolresult = (result) => {
      const sc = result.structuredContent as ToolPayload | undefined
      if (sc && sc.datasetId) {
        receivedPayload = true
        void applyPayload(sc, id => void fetchAllRowsMcp(id))
      }
      else {
        receivedPayload = true
        void fetchAllRowsMcp()
      }
    }

    app.ontoolcancelled = () => {
      setLoading(false)
      setStatusNote('Tool call cancelled.')
    }

    app.onhostcontextchanged = (ctx) => {
      if (ctx.theme)
        applyThemeFromHost(ctx.theme)
      if (!userPickedModeRef.current && ctx.styles?.variables)
        applyHostStyleVariables(ctx.styles.variables)
      applyHostDimensions(ctx)
    }

    app.connect()
      .then(() => {
        if (!active)
          return
        setTransportMode('mcp')
        const ctx = app.getHostContext()
        if (ctx?.theme)
          applyThemeFromHost(ctx.theme)
        if (!userPickedModeRef.current && ctx?.styles?.variables)
          applyHostStyleVariables(ctx.styles.variables)
        applyHostDimensions(ctx)

        const caps = app.getHostCapabilities() as Record<string, unknown> | undefined
        setCanMessageHost(Boolean(caps?.message))
        setCanUpdateContext(Boolean(caps?.updateModelContext))

        fallbackTimer = setTimeout(() => {
          if (active && !receivedPayload) {
            void fetchAllRowsMcp()
          }
        }, 120)
      })
      .catch(() => {
        void startCompanionMode()
      })

    return () => {
      active = false
      if (fallbackTimer)
        clearTimeout(fallbackTimer)
      eventSource?.close()
    }
  }, [applyHostDimensions, applyPayload, applyThemeFromHost, fetchAllRowsMcp])

  const handleSwitchDataset = useCallback(async (nextId: string) => {
    if (!nextId)
      return
    setLoading(true)
    setStatusNote(`Loading ${nextId}…`)

    if (transportMode === 'companion') {
      try {
        const res = await fetch(`/api/state?datasetId=${encodeURIComponent(nextId)}`)
        if (res.ok) {
          const payload = await res.json() as ToolPayload
          await applyPayload(payload)
          return
        }
      }
      catch {}
      setLoading(false)
      return
    }

    const app = appRef.current
    if (!app)
      return
    try {
      const res = await app.callServerTool({
        name: 'fetch_dataset_rows',
        arguments: { datasetId: nextId, offset: 0, limit: ROW_PAGE_SIZE },
      })
      const sc = res.structuredContent as ToolPayload | undefined
      if (sc) {
        await applyPayload(sc)
        await fetchRemainingRows(app, sc.datasetId, sc.rows?.length ?? 0, sc.totalRows)
      }
    }
    catch (err) {
      setStatusNote(`Failed to switch dataset: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
    }
  }, [applyPayload, transportMode, fetchRemainingRows])

  const handleCellClick = useCallback((payload: { row: number, col: number, value: unknown, rowData: Record<string, unknown> }) => {
    setSelectedContext(rowAttachment(datasetName, datasetId, payload.row, payload.rowData))
  }, [datasetId, datasetName])

  const handleDrillThrough = useCallback((result: DrillThroughResult) => {
    setSelectedContext(sliceAttachment(datasetName, datasetId, result))
    trackLocalAction()
  }, [datasetId, datasetName, trackLocalAction])

  const handleAttachView = useCallback(() => {
    const view = {
      mode: viewMode,
      pivotConfig: livePivotConfig.current ?? pivotConfig,
      chartConfig: liveChartConfig.current ?? chartConfig,
    }
    setSelectedContext(viewAttachment(datasetName, datasetId, view, rows))
  }, [chartConfig, datasetId, datasetName, pivotConfig, rows, viewMode])

  const handleCopyMarkdown = useCallback(async () => {
    const container = mainRef.current
    if (!container)
      return

    // Pivot / Data mode: copy a clean Markdown table ready for Slack, Linear, Notion, or GitHub
    const tableEl = container.querySelector('.vpg-pivot-table, .vpg-table') as HTMLTableElement | null
    if (tableEl) {
      const trs = Array.from(tableEl.querySelectorAll('tr')).slice(0, 50)
      const mdRows = trs.map(tr =>
        Array.from(tr.querySelectorAll('th, td'))
          .map(cell => (cell.textContent || '').replace(/\s+/g, ' ').trim()),
      ).filter(r => r.length > 0)

      if (mdRows.length > 0) {
        const header = `| ${mdRows[0].join(' | ')} |`
        const sep = `| ${mdRows[0].map(() => '---').join(' | ')} |`
        const body = mdRows.slice(1).map(r => `| ${r.join(' | ')} |`)
        const md = [header, sep, ...body].join('\n')
        try {
          await navigator.clipboard.writeText(md)
          showToast('Markdown copied')
        }
        catch {
          showToast('Copy blocked')
        }
      }
    }
  }, [showToast])

  /** Sends the selected row or slice, with the user's comment, into the host's chat (desktop and IDE hosts). */
  const handleSendToChat = useCallback(async () => {
    const app = appRef.current
    if (!app || !selectedContext)
      return
    const text = `${askComment?.trim() || 'Look at this from TinyPivot:'}\n\n${selectedContext.text}`
    try {
      if (canMessageHost) {
        await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })
        showToast('Sent to chat')
      }
      else if (canUpdateContext) {
        await app.updateModelContext({ content: [{ type: 'text', text }] })
        showToast('Attached to your next message')
      }
      setAskComment(null)
    }
    catch (err) {
      showToast(`Could not send: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [askComment, canMessageHost, canUpdateContext, selectedContext, showToast])

  const shellClass = [
    'tp-mcp-shell',
    `tp-theme-${visualTheme}`,
    (userSurfaceOverride || transportMode === 'companion') ? `tp-surface-${gridTheme === 'dark' ? 'dark' : 'light'}` : '',
    !customizeOpen ? 'tp-mcp-focus' : '',
    `tp-mcp-view-${viewMode}`,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={shellClass}
      style={inlineHeight ? { height: `${inlineHeight}px` } : { height: '100vh' }}
    >
      <header className="tp-mcp-bar">
        <div className="tp-mcp-bar-left">
          <div className="tp-mcp-segmented" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'chart'}
              className={`tp-mcp-seg-btn ${viewMode === 'chart' ? 'active' : ''}`}
              onClick={() => { if (viewMode !== 'chart') { setViewMode('chart'); trackLocalAction() } }}
            >
              Chart
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'pivot'}
              className={`tp-mcp-seg-btn ${viewMode === 'pivot' ? 'active' : ''}`}
              onClick={() => { if (viewMode !== 'pivot') { setViewMode('pivot'); trackLocalAction() } }}
            >
              Pivot
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'grid'}
              className={`tp-mcp-seg-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => { if (viewMode !== 'grid') { setViewMode('grid'); trackLocalAction() } }}
            >
              Data
            </button>
          </div>

          {datasets.length > 1
            ? (
                <select
                  className="tp-mcp-select"
                  value={datasetId}
                  aria-label="Active dataset"
                  onChange={e => void handleSwitchDataset(e.target.value)}
                >
                  {datasets.map(ds => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                      {' '}
                      (
                      {ds.rowCount.toLocaleString()}
                      )
                    </option>
                  ))}
                </select>
              )
            : (
                <span className="tp-mcp-brand">{datasetName}</span>
              )}

          {transportMode === 'companion' && (
            <span className="tp-mcp-pill tp-mcp-pill-live" title="Live-synced with your AI agent">
              ● LIVE
            </span>
          )}
          {studio && (
            <button
              type="button"
              className={`tp-mcp-pill ${studioOpen ? 'tp-mcp-pill-accent' : ''}`}
              aria-pressed={studioOpen}
              title="Show or hide the trace of steps, SQL and notes"
              onClick={() => setStudioOpen(open => !open)}
            >
              Studio
            </button>
          )}
        </div>

        <div className="tp-mcp-bar-right">
          {/* The savings estimate assumes the rows would otherwise be pasted, which overstates it, so the Studio leaves it out. */}
          {totalRows > 0 && !studio && (
            <div className="tp-mcp-savings-wrap">
              <button
                type="button"
                className="tp-mcp-pill tp-mcp-pill-accent"
                title={`Savings at ${activeModel.name} ($${activeModel.ratePerMillion}/1M in) — Turn: ${formatCompactTokens(savingsSummary.turnTokens)} tok (${formatUsd(savingsSummary.turnUsd)}), Session: ${formatCompactTokens(savingsSummary.sessionTokens)} tok (${formatUsd(savingsSummary.sessionUsd)}). Click to inspect or switch model.`}
                onClick={() => { setSavingsOpen(prev => !prev); setThemeMenuOpen(false); setSortMenuOpen(false) }}
              >
                {`Saved ${formatCompactTokens(savingsSummary.turnTokens)}/${formatUsd(savingsSummary.turnUsd)} · ${formatCompactTokens(savingsSummary.sessionTokens)}/${formatUsd(savingsSummary.sessionUsd)}`}
              </button>
              {savingsOpen && (
                <div className="tp-mcp-savings-popover">
                  <div className="tp-mcp-savings-head">
                    <span className="tp-mcp-savings-title">
                      Savings (
                      {activeModel.name}
                      )
                    </span>
                    <select
                      className="tp-mcp-model-select"
                      aria-label="Active LLM model"
                      value={modelCatalog.some(m => m.id === activeModel.id) ? activeModel.id : modelCatalog[0]?.id}
                      onChange={e => void handleModelChange(e.target.value)}
                    >
                      {modelCatalog.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                          {' '}
                          ($
                          {m.ratePerMillion}
                          /1M)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="tp-mcp-savings-cards">
                    <div className="tp-mcp-savings-card">
                      <div className="tp-mcp-savings-label">This Turn</div>
                      <div className="tp-mcp-savings-val">{formatUsd(savingsSummary.turnUsd)}</div>
                      <div className="tp-mcp-savings-sub">
                        ~
                        {formatCompactTokens(savingsSummary.turnTokens)}
                        {' '}
                        tok
                      </div>
                    </div>
                    <div className="tp-mcp-savings-card">
                      <div className="tp-mcp-savings-label">Session Total</div>
                      <div className="tp-mcp-savings-val">{formatUsd(savingsSummary.sessionUsd)}</div>
                      <div className="tp-mcp-savings-sub">
                        ~
                        {formatCompactTokens(savingsSummary.sessionTokens)}
                        {' '}
                        tok
                      </div>
                    </div>
                  </div>

                  <div className="tp-mcp-savings-meta">
                    <strong>
                      {totalRows.toLocaleString()}
                      {' '}
                      rows
                    </strong>
                    {savingsSummary.rawKb ? ` (${savingsSummary.rawKb} KB)` : ''}
                    {' · '}
                    {savingsSummary.sessionTurns}
                    {' '}
                    turn
                    {savingsSummary.sessionTurns === 1 ? '' : 's'}
                    {savingsSummary.sessionLocalActions > 0
                      ? ` · ${savingsSummary.sessionLocalActions} local 0-tok explore${savingsSummary.sessionLocalActions === 1 ? '' : 's'}`
                      : ''}
                  </div>
                  <div className="tp-mcp-savings-note">
                    Conservative estimate at
                    {' '}
                    {activeModel.name}
                    {' '}
                    ($
                    {activeModel.ratePerMillion.toFixed(2)}
                    /1M input): compares bypassing raw dataset rows vs. TinyPivot's ~150-tok schema summary. Local clicks avoid follow-up re-prompts; actual spend varies with prompt caching.
                  </div>
                </div>
              )}
            </div>
          )}

          {(() => {
            const currentThemeMeta = VISUAL_THEMES.find(t => t.id === visualTheme) ?? VISUAL_THEMES[0]
            return (
              <div className="tp-mcp-theme-wrap">
                <button
                  type="button"
                  className={`tp-mcp-theme-trigger ${themeMenuOpen ? 'active' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={themeMenuOpen}
                  title={`Visual theme: ${currentThemeMeta.label} (${gridTheme}). Click to switch palette or dark/light surface.`}
                  onClick={() => { setThemeMenuOpen(prev => !prev); setSavingsOpen(false); setSortMenuOpen(false) }}
                >
                  <span className="tp-mcp-theme-dots" aria-hidden="true">
                    <span className="tp-mcp-theme-dot" style={{ backgroundColor: currentThemeMeta.swatches[0] }} />
                    <span className="tp-mcp-theme-dot" style={{ backgroundColor: currentThemeMeta.swatches[1] }} />
                  </span>
                  <span className="tp-mcp-theme-name">{currentThemeMeta.label}</span>
                  <span className="tp-mcp-theme-caret" aria-hidden="true">▾</span>
                </button>

                {themeMenuOpen && (
                  <div className="tp-mcp-theme-popover" role="menu" aria-label="Visual theme">
                    {VISUAL_THEMES.map((t) => {
                      const isActive = visualTheme === t.id
                      const isLocked = tier === 'free' && t.id !== 'code'
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          className={`tp-mcp-theme-option ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                          onClick={() => {
                            void handleVisualThemeChange(t.id)
                            setThemeMenuOpen(false)
                          }}
                        >
                          <span className="tp-mcp-theme-dots" aria-hidden="true">
                            <span className="tp-mcp-theme-dot" style={{ backgroundColor: t.swatches[0] }} />
                            <span className="tp-mcp-theme-dot" style={{ backgroundColor: t.swatches[1] }} />
                          </span>
                          <span className="tp-mcp-theme-opt-text">
                            <span className="tp-mcp-theme-opt-label">
                              {t.label}
                              {isLocked && <span className="tp-mcp-pro-badge">PRO</span>}
                            </span>
                            <span className="tp-mcp-theme-opt-desc">{t.description}</span>
                          </span>
                        </button>
                      )
                    })}
                    <div className="tp-mcp-theme-sep" />
                    <button
                      type="button"
                      role="menuitem"
                      className="tp-mcp-theme-option"
                      onClick={() => {
                        handleToggleColorMode()
                        setThemeMenuOpen(false)
                      }}
                    >
                      <span className="tp-mcp-theme-mode-icon" aria-hidden="true">
                        {gridTheme === 'dark' ? '☀' : '☾'}
                      </span>
                      <span className="tp-mcp-theme-opt-label">
                        {gridTheme === 'dark' ? 'Switch to Light surface' : 'Switch to Dark surface'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {totalRows > 0 && viewMode === 'chart' && (
            <div className="tp-mcp-theme-wrap">
              <button
                type="button"
                className={`tp-mcp-theme-trigger ${sortMenuOpen ? 'active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                title={`Chart sort: ${activeSortMeta.label} — click to choose sort order`}
                onClick={() => { setSortMenuOpen(prev => !prev); setThemeMenuOpen(false); setSavingsOpen(false) }}
              >
                <span className="tp-mcp-theme-name">{activeSortMeta.short}</span>
                <span className="tp-mcp-theme-caret" aria-hidden="true">▾</span>
              </button>

              {sortMenuOpen && (
                <div className="tp-mcp-theme-popover tp-mcp-sort-popover" role="menu" aria-label="Sort chart bars">
                  {CHART_SORT_OPTIONS.map((opt) => {
                    const isActive = activeChartSort === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={`tp-mcp-theme-option ${isActive ? 'active' : ''}`}
                        onClick={() => handleSelectChartSort(opt.value)}
                      >
                        <span className="tp-mcp-theme-opt-text">
                          <span className="tp-mcp-theme-opt-label">{opt.label}</span>
                          <span className="tp-mcp-theme-opt-desc">{opt.desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {totalRows > 0 && viewMode !== 'chart' && (
            <button
              type="button"
              className="tp-mcp-btn"
              title="Copy a formatted Markdown table for Slack, GitHub, or Notion"
              onClick={() => void handleCopyMarkdown()}
            >
              MD
            </button>
          )}

          {viewMode !== 'grid' && (
            <button
              type="button"
              className={`tp-mcp-btn ${customizeOpen ? 'active' : ''}`}
              title="Toggle drag-and-drop fields, aggregations, chart types, and export toolbar"
              onClick={() => setCustomizeOpen(prev => !prev)}
            >
              {customizeOpen ? 'Done' : 'Customize'}
            </button>
          )}

          {selectedContext && transportMode === 'mcp' && (canMessageHost || canUpdateContext) && askComment === null && (
            <button
              type="button"
              className="tp-mcp-btn tp-mcp-btn-primary"
              onClick={() => setAskComment('')}
            >
              Send to chat:
              {' '}
              {selectedContext.label}
            </button>
          )}
        </div>
      </header>

      {selectedContext && askComment !== null && (
        <form
          className="tp-mcp-ask"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSendToChat()
          }}
        >
          <span className="tp-mcp-ask-label">{selectedContext.label}</span>
          <input
            className="tp-mcp-ask-input"
            placeholder="Add a comment for the agent (optional)"
            value={askComment}
            aria-label="Comment for the agent"
            onChange={e => setAskComment(e.target.value)}
          />
          <button type="submit" className="tp-mcp-btn tp-mcp-btn-primary">Send</button>
          <button type="button" className="tp-mcp-btn" onClick={() => setAskComment(null)}>Cancel</button>
        </form>
      )}

      {truncatedForFreeTier && sourceTotalRows > totalRows && (
        <div className="tp-mcp-truncation-banner" role="alert">
          <span className="tp-mcp-truncation-text">
            <strong>Free tier row limit</strong>
            {' · '}
            Showing first
            {' '}
            <strong>{totalRows.toLocaleString()}</strong>
            {' '}
            of
            {' '}
            <strong>{sourceTotalRows.toLocaleString()}</strong>
            {' '}
            rows — charts &amp; totals reflect this subset only.
          </span>
          <button
            type="button"
            className="tp-mcp-truncation-cta"
            onClick={handleOpenUpgrade}
          >
            Unlock unlimited rows →
          </button>
        </div>
      )}

      {!loading && !statusNote && rows.length > 0 && rows.length < totalRows && (
        <div className="tp-mcp-truncation-banner" role="alert">
          <span className="tp-mcp-truncation-text">
            <strong>Large dataset</strong>
            {' · '}
            This view holds the first
            {' '}
            <strong>{rows.length.toLocaleString()}</strong>
            {' '}
            of
            {' '}
            <strong>{totalRows.toLocaleString()}</strong>
            {' '}
            rows, so charts and totals here cover that part only. The summary your agent received was computed on every row.
          </span>
        </div>
      )}

      {statusNote && <div className="tp-mcp-status">{statusNote}</div>}

      <div className={studio && studioOpen ? 'tp-studio-layout' : 'tp-studio-layout is-closed'}>
        {studio && studioOpen && (
          <StudioPanel
            snapshot={studio}
            tables={datasets.map(ds => ({ id: ds.id, name: ds.name }))}
            activeDatasetId={datasetId}
            attachment={selectedContext}
            onAttachView={rows.length > 0 ? handleAttachView : undefined}
            onClearAttachment={() => setSelectedContext(null)}
            notify={message => showToast(message)}
          />
        )}
        <main ref={mainRef} className="tp-mcp-grid-wrap">
          {licenseReady && rows.length > 0
            ? (
                <DataGrid
                  data={rows}
                  loading={loading}
                  theme={isUnifiedTheme(visualTheme) ? visualTheme : gridTheme}
                  chartTheme={visualTheme}
                  fontSize="sm"
                  rowHeight={28}
                  headerHeight={32}
                  viewMode={viewMode}
                  pivotConfig={pivotConfig}
                  chartConfig={chartConfig}
                  showPivot={true}
                  enableExport={true}
                  enableSearch={true}
                  enablePagination={true}
                  pageSize={100}
                  enableColumnResize={true}
                  enableClipboard={true}
                  enableDrillDown={true}
                  enableDrillThrough={true}
                  enableVerticalResize={false}
                  initialHeight={440}
                  exportFilename={`${datasetId || 'tinypivot'}.csv`}
                  onViewModeChange={setViewMode}
                  onPivotConfigChange={(config) => { livePivotConfig.current = config }}
                  onChartConfigChange={(config) => { liveChartConfig.current = config }}
                  onChartThemeChange={preset => void handleVisualThemeChange(preset)}
                  onCellClick={handleCellClick}
                  onDrillThrough={handleDrillThrough}
                />
              )
            : loading
              ? (
                  <div className="tp-mcp-empty">
                    <strong>Loading TinyPivot…</strong>
                  </div>
                )
              : (
                  <div className="tp-mcp-empty">
                    <strong>No dataset loaded yet</strong>
                    <span>Ask your AI agent to load a CSV/JSON file, query Postgres, or pipe rows from another MCP tool.</span>
                  </div>
                )}
        </main>
      </div>

      {actionToast && (
        <div className="tp-mcp-toast" role="status" aria-live="polite">
          <span className="tp-mcp-toast-msg">{actionToast.message}</span>
          {actionToast.upgradeCta && (
            <button
              type="button"
              className="tp-mcp-toast-cta"
              onClick={handleOpenUpgrade}
            >
              Upgrade to Pro →
            </button>
          )}
          <button
            type="button"
            className="tp-mcp-toast-close"
            aria-label="Dismiss notification"
            onClick={() => setActionToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
