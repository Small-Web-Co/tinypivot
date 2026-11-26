import type { ChartConfig, ChartThemePreset, DataGridViewMode, DrillThroughResult, PivotConfig, Theme } from '@smallwebco/tinypivot-core'
import type { NoteAttachment, StudioSnapshot, TraceStep } from '../src/studio-protocol'
import type { StudioStep } from './runs'
import { isUnifiedTheme } from '@smallwebco/tinypivot-core'
import { DataGrid } from '@smallwebco/tinypivot-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildStepLineage } from '../src/lineage'
import { groupRuns } from '../src/runs'
import { exportNotebookMarkdown } from './chartTransform'
import { postToStudio } from './companionApi'
import { checkReport, claimSummary, lastStep, runTitle } from './runs'
import { shownSql, sqlOneLine } from './sqlFormat'
import { LineageProofPanel } from './SqlPane'
import { AnswerText, buildPrompt, CheckReport, clockTime, NoteComposer, OfflineAgent, renderInline, useChecks } from './StudioPanel'

/**
 * Traditional Notebook View for TinyPivot Studio:
 * - Displays the entire continuous train of thought chronologically: Question -> SQL + minimal Chart JS FYI
 *   -> Live Interactive Chart/Pivot -> Collapsible Data Frame -> Verified Narrative Answer.
 * - Every historical cell hydrates its own rows independently (`GET /api/studio/step-data`) so chatting
 *   appends new cells while preserving every earlier chart, SQL edit, and revision.
 */

interface StepDataPayload {
  stepId: string
  datasetId: string
  name: string
  totalRows: number
  rows: Record<string, unknown>[]
  viewMode: DataGridViewMode
  chartConfig: Partial<ChartConfig> | null
  pivotConfig: Partial<PivotConfig> | null
  filterFields: string[]
}

interface StudioNotebookProps {
  snapshot: StudioSnapshot
  visualTheme: ChartThemePreset
  gridTheme: Theme
  licenseReady: boolean
  attachment: NoteAttachment | null
  onAttachView?: () => void
  onClearAttachment: () => void
  onCellClick: (payload: { row: number, col: number, value: unknown, rowData: Record<string, unknown> }) => void
  onDrillThrough: (result: DrillThroughResult) => void
  onOpenInIde: (step: StudioStep) => void
  onTogglePinSession: (sessionId: string, pinned: boolean) => void
  onExportHtml: (sessionId: string) => void
  notify: (message: string) => void
}

interface NotebookOutputCellProps {
  sessionId: string
  step: StudioStep
  allSteps: TraceStep[]
  stepIndex: number
  defaultCodeOpen: boolean
  resolvedTheme: Theme
  visualTheme: ChartThemePreset
  licenseReady: boolean
  onCellClick: (payload: { row: number, col: number, value: unknown, rowData: Record<string, unknown> }) => void
  onDrillThrough: (result: DrillThroughResult) => void
  onOpenInIde: (step: StudioStep) => void
  notify: (message: string) => void
}

function toCellViewMode(mode?: DataGridViewMode): 'chart' | 'pivot' | 'grid' {
  return mode === 'pivot' || mode === 'grid' ? mode : 'chart'
}

function NotebookOutputCell({
  sessionId,
  step,
  allSteps,
  stepIndex,
  defaultCodeOpen,
  resolvedTheme,
  visualTheme,
  licenseReady,
  onCellClick,
  onDrillThrough,
  onOpenInIde,
  notify,
}: NotebookOutputCellProps) {
  const [data, setData] = useState<StepDataPayload | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'chart' | 'pivot' | 'grid'>(() => toCellViewMode(step.viewMode))
  const [codeOpen, setCodeOpen] = useState(defaultCodeOpen)
  const [codeTab, setCodeTab] = useState<'sql' | 'fyi'>('sql')
  const [dataOpen, setDataOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceRows, setSourceRows] = useState<Record<string, unknown>[] | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [revisionsOpen, setRevisionsOpen] = useState(false)
  const [sqlDraft, setSqlDraft] = useState(() => shownSql(step))
  const [saving, setSaving] = useState(false)
  const [cellError, setCellError] = useState<string | null>(null)

  useEffect(() => {
    setCodeOpen(defaultCodeOpen)
  }, [defaultCodeOpen])

  const stepVersionKey = `${step.id}:${step.datasetId ?? ''}:${step.editedAt ?? ''}`
  useEffect(() => {
    setSqlDraft(shownSql(step))
  }, [stepVersionKey])

  // Hydrate this cell's own rows & view config independently from THIS isolated session only.
  useEffect(() => {
    let active = true
    setLoading(true)
    setFetchError(null)
    void fetch(`/api/studio/step-data?sessionId=${encodeURIComponent(sessionId)}&stepId=${encodeURIComponent(step.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<StepDataPayload>
      })
      .then((payload) => {
        if (!active)
          return
        setData(payload)
        setViewMode(toCellViewMode(payload.viewMode ?? step.viewMode))
        setLoading(false)
      })
      .catch((err) => {
        if (!active)
          return
        setFetchError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [sessionId, step.id, step.datasetId, step.editedAt])

  const rawRows = data?.rows ?? []
  const columnCount = rawRows.length > 0 ? Object.keys(rawRows[0]).length : (step.columns?.length ?? 0)
  const baseChart = data?.chartConfig ?? step.chartConfig ?? undefined
  const basePivot = data?.pivotConfig ?? step.pivotConfig ?? undefined

  const lineage = useMemo(
    () => buildStepLineage(step, allSteps, {
      datasetName: step.datasetName ?? data?.name,
      rowCount: data?.totalRows ?? rawRows.length,
      columnCount,
      viewMode,
      chartConfig: baseChart,
      pivotConfig: basePivot,
      filterFields: data?.filterFields,
    }),
    [allSteps, baseChart, basePivot, columnCount, data?.filterFields, data?.name, data?.totalRows, rawRows.length, step, viewMode],
  )
  const primaryUpstream = lineage.upstreamSteps[0]

  const toggleUnderlyingSource = async () => {
    const next = !sourceOpen
    setSourceOpen(next)
    if (next && primaryUpstream && sourceRows === null && !sourceLoading) {
      setSourceLoading(true)
      try {
        const res = await fetch(`/api/studio/step-data?sessionId=${encodeURIComponent(sessionId)}&stepId=${encodeURIComponent(primaryUpstream.id)}`)
        if (res.ok) {
          const payload = await res.json() as StepDataPayload
          setSourceRows(payload.rows)
        }
      }
      catch {}
      finally {
        setSourceLoading(false)
      }
    }
  }

  const saveStepSql = async (mode: 'update' | 'new') => {
    const query = sqlDraft.trim()
    if (!query || saving)
      return
    setSaving(true)
    setCellError(null)
    try {
      const out = await postToStudio<{ rows: number, updated?: boolean }>('/api/studio/query', {
        sessionId,
        sql: query,
        ...(mode === 'update' ? { updateStepId: step.id } : { fromStepId: step.id }),
      })
      notify(`${out.updated ? 'Cell SQL updated · ' : 'New cell added · '}${out.rows.toLocaleString()} rows`)
    }
    catch (err) {
      setCellError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setSaving(false)
    }
  }

  const restoreRevision = async (revisionIndex: number) => {
    setRevisionsOpen(false)
    setSaving(true)
    setCellError(null)
    try {
      await postToStudio('/api/studio/restore', { sessionId, stepId: step.id, revisionIndex })
      notify(`Restored cell to v${revisionIndex + 1}`)
    }
    catch (err) {
      setCellError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setSaving(false)
    }
  }

  const revisions = step.revisions ?? []
  const hasSql = Boolean(shownSql(step).trim())
  const effectiveVisualMode: 'chart' | 'pivot' = viewMode === 'pivot' ? 'pivot' : 'chart'

  return (
    <article className="tp-nb-cell" aria-label={`Output ${stepIndex}: ${step.datasetName ?? 'View'}`}>
      <header className="tp-nb-cell-head">
        <div className="tp-nb-cell-head-left">
          <span className="tp-nb-cell-index">{`Out [${stepIndex}]`}</span>
          <strong className="tp-nb-cell-title">{step.datasetName ?? step.why ?? 'View'}</strong>
          <span className="tp-ws-pane-meta">
            {`${(data?.totalRows ?? step.rows ?? 0).toLocaleString()} rows`}
          </span>
          {revisions.length > 0 && (
            <div className="tp-mcp-theme-wrap">
              <button
                type="button"
                className={`tp-ws-rev-pill ${revisionsOpen ? 'active' : ''}`}
                onClick={() => setRevisionsOpen(open => !open)}
              >
                {`Edited v${revisions.length + 1} ▾`}
              </button>
              {revisionsOpen && (
                <div className="tp-mcp-theme-popover tp-ws-rev-popover" role="menu" aria-label="Cell revisions">
                  <div className="tp-ws-rev-head">Restore earlier SQL</div>
                  {[...revisions].reverse().map((rev, offset) => {
                    const idx = revisions.length - 1 - offset
                    return (
                      <button
                        key={`${rev.at}-${idx}`}
                        type="button"
                        role="menuitem"
                        className="tp-mcp-theme-option"
                        onClick={() => void restoreRevision(idx)}
                      >
                        <span className="tp-mcp-theme-opt-text">
                          <span className="tp-mcp-theme-opt-label">
                            {`v${idx + 1} · ${clockTime(rev.at)}`}
                            {typeof rev.rows === 'number' ? ` (${rev.rows.toLocaleString()} rows)` : ''}
                          </span>
                          <span className="tp-mcp-theme-opt-desc">
                            {rev.note ?? (rev.sql ? sqlOneLine(rev.sql) : 'Restore')}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="tp-nb-cell-head-right">
          <div className="tp-mcp-segmented" role="tablist" aria-label="Cell output mode">
            <button type="button" role="tab" aria-selected={viewMode === 'chart'} className={`tp-mcp-seg-btn ${viewMode === 'chart' ? 'active' : ''}`} onClick={() => setViewMode('chart')}>Chart</button>
            <button type="button" role="tab" aria-selected={viewMode === 'pivot'} className={`tp-mcp-seg-btn ${viewMode === 'pivot' ? 'active' : ''}`} onClick={() => setViewMode('pivot')}>Pivot</button>
            <button type="button" role="tab" aria-selected={viewMode === 'grid'} className={`tp-mcp-seg-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>Data</button>
          </div>
          <button
            type="button"
            className={`tp-mcp-btn ${codeOpen && codeTab === 'sql' ? 'active' : ''}`}
            onClick={() => {
              if (codeOpen && codeTab === 'sql') {
                setCodeOpen(false)
              }
              else {
                setCodeTab('sql')
                setCodeOpen(true)
              }
            }}
          >
            SQL
          </button>
          <button
            type="button"
            className={`tp-mcp-btn ${codeOpen && codeTab === 'fyi' ? 'active' : ''}`}
            title="Proof of work: underlying rows, SQL aggregations, fingerprint hash, and chart spec"
            onClick={() => {
              if (codeOpen && codeTab === 'fyi') {
                setCodeOpen(false)
              }
              else {
                setCodeTab('fyi')
                setCodeOpen(true)
              }
            }}
          >
            Lineage
          </button>
          <button
            type="button"
            className="tp-mcp-btn"
            title="Jump this step into the 4-pane IDE view"
            onClick={() => onOpenInIde(step)}
          >
            IDE ↗
          </button>
        </div>
      </header>

      <div className="tp-lineage-strip" title="Proof of work lineage — click Lineage for full breakdown">
        <span className="tp-lineage-strip-tag">Lineage</span>
        <span className="tp-lineage-strip-text">{lineage.oneLine}</span>
      </div>

      {codeOpen && codeTab === 'sql' && (
        <div className="tp-nb-code-box">
          <div className="tp-nb-code-bar">
            <div className="tp-nb-code-bar-left">
              <span className="tp-ws-pane-meta">DuckDB SQL · saving updates this cell &amp; preserves history</span>
            </div>
            <div className="tp-nb-code-bar-right">
              <button type="button" className="tp-mcp-btn" disabled={saving || !sqlDraft.trim()} onClick={() => void saveStepSql('new')}>
                Fork new
              </button>
              <button type="button" className="tp-mcp-btn tp-mcp-btn-primary" disabled={saving || !sqlDraft.trim()} onClick={() => void saveStepSql('update')}>
                {saving ? 'Running…' : 'Save & Run'}
              </button>
            </div>
          </div>

          <textarea
            className="tp-nb-code-area"
            value={sqlDraft}
            rows={Math.max(4, Math.min(14, sqlDraft.split('\n').length + 1))}
            placeholder={hasSql ? undefined : 'SELECT * FROM ...'}
            aria-label="Step SQL"
            spellCheck={false}
            onChange={e => setSqlDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void saveStepSql('update')
              }
            }}
          />
          {cellError && <div className="tp-studio-error" role="alert">{cellError}</div>}
        </div>
      )}

      {codeOpen && codeTab === 'fyi' && (
        <div className="tp-nb-code-box">
          <LineageProofPanel
            step={step}
            allSteps={allSteps}
            datasetName={step.datasetName ?? data?.name ?? 'Dataset'}
            rowCount={data?.totalRows ?? rawRows.length}
            columnCount={columnCount}
            viewMode={viewMode}
            chartConfig={baseChart}
            pivotConfig={basePivot}
            filterFields={data?.filterFields}
            onJumpToStep={(targetStepId) => {
              const found = allSteps.find(s => s.id === targetStepId)
              if (found)
                onOpenInIde(found)
            }}
            notify={notify}
          />
        </div>
      )}

      <div className={`tp-nb-visual tp-mcp-view-${viewMode} ${viewMode !== 'grid' ? 'tp-mcp-focus' : ''}`}>
        {loading
          ? <div className="tp-mcp-empty tp-ws-empty-compact"><span>Loading cell output…</span></div>
          : fetchError
            ? <div className="tp-mcp-empty tp-ws-empty-compact"><span>{fetchError}</span></div>
            : licenseReady && rawRows.length > 0
              ? (
                  <DataGrid
                    data={rawRows}
                    loading={false}
                    theme={resolvedTheme}
                    chartTheme={visualTheme}
                    fontSize="sm"
                    rowHeight={26}
                    headerHeight={30}
                    viewMode={viewMode === 'grid' ? 'grid' : effectiveVisualMode}
                    pivotConfig={viewMode === 'grid' ? undefined : basePivot}
                    chartConfig={viewMode === 'grid' ? undefined : baseChart}
                    filterFields={viewMode === 'grid' ? [] : (data?.filterFields ?? [])}
                    showPivot={viewMode !== 'grid'}
                    enableExport={true}
                    enableSearch={viewMode === 'grid'}
                    enablePagination={true}
                    pageSize={50}
                    enableColumnResize={true}
                    enableClipboard={true}
                    enableDrillDown={viewMode !== 'grid'}
                    enableDrillThrough={viewMode !== 'grid'}
                    enableVerticalResize={false}
                    initialHeight={viewMode === 'grid' ? 240 : 320}
                    exportFilename={`${step.datasetId || 'tinypivot'}.csv`}
                    onCellClick={onCellClick}
                    onDrillThrough={onDrillThrough}
                  />
                )
              : <div className="tp-mcp-empty tp-ws-empty-compact"><span>No rows in this output.</span></div>}
      </div>

      {viewMode !== 'grid' && rawRows.length > 0 && (
        <div className="tp-nb-data-disclosure">
          <div className="tp-nb-data-tabs">
            <button
              type="button"
              className="tp-nb-data-toggle"
              aria-expanded={dataOpen}
              onClick={() => setDataOpen(open => !open)}
            >
              <span>{dataOpen ? '▾' : '▸'}</span>
              <span>{`Output Data Frame · ${rawRows.length.toLocaleString()} row${rawRows.length === 1 ? '' : 's'}`}</span>
            </button>
            {primaryUpstream && (
              <button
                type="button"
                className="tp-nb-data-toggle tp-nb-source-toggle"
                aria-expanded={sourceOpen}
                onClick={() => void toggleUnderlyingSource()}
              >
                <span>{sourceOpen ? '▾' : '▸'}</span>
                <span>{`Underlying Source Rows · ${primaryUpstream.datasetName ?? primaryUpstream.datasetId} (${(primaryUpstream.rows ?? 0).toLocaleString()} rows)`}</span>
              </button>
            )}
          </div>
          {dataOpen && licenseReady && (
            <div className="tp-nb-data-grid tp-mcp-view-grid">
              <DataGrid
                data={rawRows}
                loading={false}
                theme={resolvedTheme}
                chartTheme={visualTheme}
                fontSize="sm"
                rowHeight={24}
                headerHeight={28}
                viewMode="grid"
                filterFields={[]}
                showPivot={false}
                enableExport={true}
                enableSearch={true}
                enablePagination={true}
                pageSize={50}
                enableColumnResize={true}
                enableClipboard={true}
                enableDrillDown={false}
                enableDrillThrough={false}
                enableVerticalResize={false}
                initialHeight={210}
                exportFilename={`${step.datasetId || 'tinypivot'}.csv`}
                onCellClick={onCellClick}
              />
            </div>
          )}
          {sourceOpen && primaryUpstream && licenseReady && (
            <div className="tp-nb-data-grid tp-mcp-view-grid">
              {sourceLoading
                ? <div className="tp-mcp-empty tp-ws-empty-compact"><span>Loading underlying source rows…</span></div>
                : sourceRows && sourceRows.length > 0
                  ? (
                      <DataGrid
                        data={sourceRows}
                        loading={false}
                        theme={resolvedTheme}
                        chartTheme={visualTheme}
                        fontSize="sm"
                        rowHeight={24}
                        headerHeight={28}
                        viewMode="grid"
                        filterFields={[]}
                        showPivot={false}
                        enableExport={true}
                        enableSearch={true}
                        enablePagination={true}
                        pageSize={50}
                        enableColumnResize={true}
                        enableClipboard={true}
                        enableDrillDown={false}
                        enableDrillThrough={false}
                        enableVerticalResize={false}
                        initialHeight={210}
                        exportFilename={`${primaryUpstream.datasetId || 'source'}.csv`}
                        onCellClick={onCellClick}
                      />
                    )
                  : <div className="tp-mcp-empty tp-ws-empty-compact"><span>Underlying source rows are no longer cached on disk.</span></div>}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export function StudioNotebook({
  snapshot,
  visualTheme,
  gridTheme,
  licenseReady,
  attachment,
  onAttachView,
  onClearAttachment,
  onCellClick,
  onDrillThrough,
  onOpenInIde,
  onTogglePinSession,
  onExportHtml,
  notify,
}: StudioNotebookProps) {
  const runs = useMemo(() => groupRuns(snapshot.steps), [snapshot.steps])
  const loaded = useMemo(() => new Set(snapshot.loadedIds), [snapshot.loadedIds])
  const resolvedTheme: Theme = isUnifiedTheme(visualTheme) ? visualTheme : gridTheme
  const { checks, checkTimes, checking, check } = useChecks(notify, snapshot.sessionId)

  const [outlineOpen, setOutlineOpen] = useState(true)
  const [showAllCode, setShowAllCode] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const turnRefs = useRef<Record<string, HTMLElement | null>>({})

  const totalOutputs = useMemo(
    () => runs.reduce((sum, r) => sum + r.steps.filter(s => s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile' && Boolean(s.datasetId && (loaded.has(s.datasetId) || s.historyId))).length, 0),
    [loaded, runs],
  )

  const verifiedSummary = useMemo(() => {
    const allChecks = Object.values(checks).flat()
    if (allChecks.length === 0)
      return null
    const ok = allChecks.filter(c => c.ok).length
    return { ok, total: allChecks.length }
  }, [checks])

  const checkAll = useCallback(async () => {
    if (checkingAll)
      return
    setCheckingAll(true)
    try {
      for (const run of runs) {
        if (run.steps.some(s => s.fingerprint || s.source))
          await check(run)
      }
      notify('Re-checked all steps in notebook')
    }
    finally {
      setCheckingAll(false)
    }
  }, [check, checkingAll, notify, runs])

  const handleExportMarkdown = useCallback(async () => {
    const md = exportNotebookMarkdown(runs)
    try {
      await navigator.clipboard.writeText(md)
    }
    catch {}
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tinypivot-notebook-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    notify('Notebook exported & copied as Markdown')
  }, [notify, runs])

  const scrollToRun = (runId: string) => {
    turnRefs.current[runId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isLiveSession = Boolean(snapshot.liveSessionId && snapshot.sessionId === snapshot.liveSessionId)
  const live = isLiveSession && snapshot.agent.live.length > 0
  const aboutRun = runs.find(r => r.id === aboutId)

  let outputCounter = 0

  return (
    <div className="tp-nb-shell">
      <div className="tp-nb-toolbar">
        <div className="tp-nb-toolbar-left">
          <button
            type="button"
            className={`tp-mcp-btn ${outlineOpen ? 'active' : ''}`}
            onClick={() => setOutlineOpen(open => !open)}
          >
            Outline
          </button>
          <span className="tp-ws-pane-meta">
            {`${runs.length} turn${runs.length === 1 ? '' : 's'} · ${totalOutputs} output${totalOutputs === 1 ? '' : 's'}`}
          </span>
          {verifiedSummary && (
            <span className={`tp-run-badge ${verifiedSummary.ok === verifiedSummary.total ? 'is-ok' : 'is-warn'}`}>
              {`${verifiedSummary.ok}/${verifiedSummary.total} checks passed`}
            </span>
          )}
        </div>
        <div className="tp-nb-toolbar-right">
          <button
            type="button"
            className={`tp-mcp-btn ${showAllCode ? 'active' : ''}`}
            onClick={() => setShowAllCode(open => !open)}
          >
            {showAllCode ? 'Hide SQL' : 'Show SQL'}
          </button>
          <button
            type="button"
            className="tp-mcp-btn"
            disabled={checkingAll || runs.length === 0}
            title="Re-verify source files and SQL fingerprints across every turn"
            onClick={() => void checkAll()}
          >
            {checkingAll ? 'Checking…' : 'Re-check all'}
          </button>
          <button
            type="button"
            className={`tp-mcp-btn ${snapshot.pinned ? 'active' : ''}`}
            title={snapshot.pinned ? 'Pinned (kept forever) — click to unpin' : 'Pin this session so it is never pruned after 30 days'}
            onClick={() => onTogglePinSession(snapshot.sessionId, !snapshot.pinned)}
          >
            {snapshot.pinned ? '★ Pinned' : '☆ Pin'}
          </button>
          <button
            type="button"
            className="tp-mcp-btn"
            disabled={runs.length === 0}
            title="Download a self-contained offline interactive HTML report for this session"
            onClick={() => onExportHtml(snapshot.sessionId)}
          >
            Export .html
          </button>
          <button
            type="button"
            className="tp-mcp-btn"
            disabled={runs.length === 0}
            title="Download & copy the entire train of thought as Markdown"
            onClick={() => void handleExportMarkdown()}
          >
            Export .md
          </button>
        </div>
      </div>

      <div className="tp-nb-layout">
        {outlineOpen && (
          <aside className="tp-nb-outline" aria-label="Train of thought outline">
            <div className="tp-nb-outline-title">Train of thought</div>
            {runs.length === 0
              ? <p className="tp-studio-empty">Questions and findings appear here as your session unfolds.</p>
              : (
                  <ol className="tp-nb-outline-list">
                    {runs.map((run, idx) => {
                      const runOutputs = run.steps.filter(s => s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile' && Boolean(s.datasetId && (loaded.has(s.datasetId) || s.historyId)))
                      const hasEdits = runOutputs.some(s => Boolean(s.editedAt))
                      const results = run.steps.flatMap(s => checks[s.id] ?? [])
                      const checkStatus = results.length === 0 ? null : results.every(c => c.ok) ? 'ok' : 'warn'
                      return (
                        <li key={run.id}>
                          <button type="button" className="tp-nb-outline-item" onClick={() => scrollToRun(run.id)}>
                            <span className="tp-nb-outline-num">{`#${idx + 1}`}</span>
                            <span className="tp-nb-outline-body">
                              <span className="tp-nb-outline-label">{runTitle(run)}</span>
                              <span className="tp-nb-outline-meta">
                                {`${runOutputs.length} view${runOutputs.length === 1 ? '' : 's'}`}
                                {hasEdits ? ' · edited' : ''}
                                {checkStatus === 'ok' ? ' · ✓' : checkStatus === 'warn' ? ' · !' : ''}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                )}
          </aside>
        )}

        <div className="tp-nb-main">
          <div className="tp-nb-stream">
            {runs.length === 0
              ? (
                  <div className="tp-mcp-empty">
                    <strong>Your analysis notebook is ready</strong>
                    <span>Ask your agent a question below or in your terminal. Every query, chart, data frame, and verified answer stays preserved here in order.</span>
                  </div>
                )
              : runs.map((run, idx) => {
                  const answer = lastStep(run, step => step.tool === 'reply')
                  const claims = answer?.claims ?? []
                  const summary = claims.length ? claimSummary(claims) : undefined
                  const outputSteps = run.steps.filter(step =>
                    step.tool !== 'reply'
                    && step.tool !== 'note'
                    && step.tool !== 'profile'
                    && Boolean(step.datasetId && (loaded.has(step.datasetId) || step.historyId)),
                  )
                  const fallbackNote = !answer ? lastStep(run, step => step.tool !== 'note' && Boolean(step.why))?.why : undefined
                  const verifiable = run.steps.some(step => step.fingerprint || step.source)
                  const checkedAt = checkTimes[run.id]

                  return (
                    <section
                      key={run.id}
                      ref={(el) => { turnRefs.current[run.id] = el }}
                      className="tp-nb-turn"
                      aria-label={`Turn ${idx + 1}: ${runTitle(run)}`}
                    >
                      <div className="tp-nb-rail" aria-hidden="true">
                        <span className="tp-nb-turn-badge">{idx + 1}</span>
                        <span className="tp-nb-rail-line" />
                      </div>

                      <div className="tp-nb-turn-content">
                        <header className="tp-nb-prompt-card">
                          <div className="tp-nb-prompt-main">
                            <h2 className="tp-nb-prompt-title">{renderInline(runTitle(run))}</h2>
                            <div className="tp-studio-step-meta">
                              <span>{clockTime(run.at)}</span>
                              <span>{run.askedIn === 'studio' ? 'asked in Studio' : run.askedIn === 'terminal' ? 'asked in terminal' : 'session step'}</span>
                              {summary && summary.checked > 0 && (
                                <span className={summary.found === summary.checked ? 'tp-run-ok' : 'tp-run-warn'}>
                                  {`${summary.found}/${summary.checked} numbers verified`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="tp-nb-prompt-actions">
                            {verifiable && (
                              <button
                                type="button"
                                className="tp-mcp-btn"
                                disabled={checking === run.id}
                                onClick={() => void check(run)}
                              >
                                {checking === run.id ? 'Checking…' : checkedAt ? 'Re-check' : 'Check'}
                              </button>
                            )}
                            {live && (
                              <button
                                type="button"
                                className="tp-mcp-btn"
                                onClick={() => {
                                  setAboutId(run.id)
                                  setFocusKey(k => k + 1)
                                }}
                              >
                                Follow up
                              </button>
                            )}
                            <button
                              type="button"
                              className="tp-mcp-btn"
                              onClick={() => {
                                void navigator.clipboard.writeText(buildPrompt('', run, attachment))
                                  .then(() => notify('Copied prompt & SQL'))
                                  .catch(() => notify('Copy blocked'))
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        </header>

                        {outputSteps.map((step) => {
                          outputCounter += 1
                          return (
                            <NotebookOutputCell
                              key={step.id}
                              sessionId={snapshot.sessionId}
                              step={step}
                              allSteps={snapshot.steps}
                              stepIndex={outputCounter}
                              defaultCodeOpen={showAllCode}
                              resolvedTheme={resolvedTheme}
                              visualTheme={visualTheme}
                              licenseReady={licenseReady}
                              onCellClick={onCellClick}
                              onDrillThrough={onDrillThrough}
                              onOpenInIde={onOpenInIde}
                              notify={notify}
                            />
                          )
                        })}

                        {(answer || fallbackNote || checkedAt) && (
                          <div className="tp-nb-narrative">
                            {answer
                              ? <AnswerText step={answer} />
                              : fallbackNote && <p className="tp-run-why">{renderInline(fallbackNote)}</p>}
                            {checkedAt && <CheckReport lines={checkReport(run, checks)} at={checkedAt} />}
                          </div>
                        )}
                      </div>
                    </section>
                  )
                })}

            <div className="tp-nb-composer-wrap">
              {live
                ? (
                    <NoteComposer
                      agent={snapshot.agent}
                      aboutRun={aboutRun}
                      attachment={attachment}
                      onAttachView={onAttachView}
                      onClearAttachment={onClearAttachment}
                      onDetach={() => setAboutId(null)}
                      notify={notify}
                      focusKey={focusKey}
                    />
                  )
                : <OfflineAgent agent={snapshot.agent} notify={notify} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
