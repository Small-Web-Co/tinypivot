import type { ChartConfig, ChartSortOrder, ChartThemePreset, DataGridViewMode, DrillThroughResult, PivotConfig, Theme } from '@smallwebco/tinypivot-core'
import type { StepRevision, TraceStep } from '../src/studio-protocol'
import type { SessionOutput } from './runs'
import type { WorkbenchTable } from './SqlPane'
import type { DropEdge, WorkspaceLayout, WorkspacePaneId } from './workspaceLayout'
import { isUnifiedTheme } from '@smallwebco/tinypivot-core'
import { DataGrid } from '@smallwebco/tinypivot-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { SqlPane } from './SqlPane'
import { isRowCollapsed, rowHeightWeight } from './workspaceLayout'

/**
 * Flexible 2D Studio workspace:
 * - Session output stepper / scrollable filmstrip (`◀ 2/4 ▶` + clickable chips)
 * - Three rearrangeable, collapsible panes (SQL, Chart/Pivot, Data Frame) that can be stacked
 *   vertically OR docked side-by-side via 4-edge drag-and-drop or header controls
 * - Independent horizontal (height) and vertical (width) drag splitters, all persisted
 * - Reuses TinyPivot's `<DataGrid>` for both the Visual pane and the Data Frame pane.
 */

interface SortOption {
  value: ChartSortOrder
  short: string
  label: string
  desc: string
}

interface StudioWorkspaceProps {
  layout: WorkspaceLayout
  onToggleCollapse: (id: WorkspacePaneId) => void
  onSetOpen: (id: WorkspacePaneId, open: boolean) => void
  onDockPane: (fromId: WorkspacePaneId, targetId: WorkspacePaneId, edge: DropEdge) => void
  onStepRow: (id: WorkspacePaneId, delta: -1 | 1) => void
  onToggleSplit: (id: WorkspacePaneId) => void
  onResizeRows: (upperRowIdx: number, lowerRowIdx: number, deltaPx: number, totalOpenPx: number) => void
  onResizeCols: (leftId: WorkspacePaneId, rightId: WorkspacePaneId, deltaPx: number, rowWidthPx: number) => void
  onResizeTablesWidth: (width: number) => void
  onResetHeightWeights: () => void
  onResetWidthWeights: () => void

  outputs: SessionOutput[]
  activeOutputIndex: number
  onSelectOutput: (output: SessionOutput) => void

  sessionId?: string
  sqlText: string
  sqlSyncKey: string
  sqlFromStepId?: string
  stepEditedAt?: string
  stepRevisions?: StepRevision[]
  activeStep?: TraceStep
  allSteps?: TraceStep[]
  onOpenStepById?: (stepId: string) => void
  onRestoreRevision: (revisionIndex: number) => Promise<void>
  tables: WorkbenchTable[]
  onNewSql: () => void
  notify: (message: string) => void

  datasetId: string
  datasetName: string
  rows: Record<string, unknown>[]
  totalRows: number
  loading: boolean
  licenseReady: boolean
  visualTheme: ChartThemePreset
  gridTheme: Theme

  visualMode: 'chart' | 'pivot'
  onVisualModeChange: (mode: 'chart' | 'pivot') => void
  customizeOpen: boolean
  onToggleCustomize: () => void
  activeChartSort: ChartSortOrder
  sortOptions: SortOption[]
  onSelectChartSort: (order: ChartSortOrder) => void

  pivotConfig?: Partial<PivotConfig>
  chartConfig?: Partial<ChartConfig>
  filterFields: string[]
  onPivotConfigChange: (config: Partial<PivotConfig>) => void
  onChartConfigChange: (config: Partial<ChartConfig>) => void
  onChartThemeChange: (preset: ChartThemePreset) => void
  onCellClick: (payload: { row: number, col: number, value: unknown, rowData: Record<string, unknown> }) => void
  onDrillThrough: (result: DrillThroughResult) => void
  onCopyMarkdown: (container: HTMLElement | null) => void
}

interface HorizontalResizerProps {
  upperLabel: string
  lowerLabel: string
  onResize: (deltaPx: number) => void
  onReset: () => void
}

function PaneHorizontalResizer({ upperLabel, lowerLabel, onResize, onReset }: HorizontalResizerProps) {
  const [dragging, setDragging] = useState(false)
  const lastYRef = useRef(0)

  useEffect(() => {
    if (!dragging)
      return
    const move = (event: PointerEvent) => {
      const delta = event.clientY - lastYRef.current
      if (delta !== 0) {
        lastYRef.current = event.clientY
        onResize(delta)
      }
    }
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    document.body.classList.add('tp-resizing-row')
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('tp-resizing-row')
    }
  }, [dragging, onResize])

  return (
    <div
      className={`tp-ws-hresizer ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize ${upperLabel} and ${lowerLabel} row heights`}
      tabIndex={0}
      title="Drag to resize row height. Double-click to reset."
      onPointerDown={(event) => {
        event.preventDefault()
        lastYRef.current = event.clientY
        setDragging(true)
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          onResize(-24)
        }
        else if (event.key === 'ArrowDown') {
          event.preventDefault()
          onResize(24)
        }
      }}
    />
  )
}

interface VerticalResizerProps {
  leftId: WorkspacePaneId
  rightId: WorkspacePaneId
  onResize: (deltaPx: number) => void
  onReset: () => void
}

function PaneVerticalResizer({ leftId, rightId, onResize, onReset }: VerticalResizerProps) {
  const [dragging, setDragging] = useState(false)
  const lastXRef = useRef(0)

  useEffect(() => {
    if (!dragging)
      return
    const move = (event: PointerEvent) => {
      const delta = event.clientX - lastXRef.current
      if (delta !== 0) {
        lastXRef.current = event.clientX
        onResize(delta)
      }
    }
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    document.body.classList.add('tp-resizing')
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('tp-resizing')
    }
  }, [dragging, onResize])

  return (
    <div
      className={`tp-ws-vresizer ${dragging ? 'is-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${leftId} and ${rightId} pane widths`}
      tabIndex={0}
      title="Drag to resize pane width. Double-click to reset."
      onPointerDown={(event) => {
        event.preventDefault()
        lastXRef.current = event.clientX
        setDragging(true)
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onResize(-24)
        }
        else if (event.key === 'ArrowRight') {
          event.preventDefault()
          onResize(24)
        }
      }}
    />
  )
}

function detectDropEdge(event: React.DragEvent<HTMLDivElement>): DropEdge {
  const rect = event.currentTarget.getBoundingClientRect()
  const rx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
  const ry = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  // Thin collapsed bars: favor left/right near corners, top/bottom across the middle.
  if (rect.height < 64) {
    if (rx < 0.25)
      return 'left'
    if (rx > 0.75)
      return 'right'
    return ry < 0.5 ? 'top' : 'bottom'
  }
  if (ry < 0.28)
    return 'top'
  if (ry > 0.72)
    return 'bottom'
  return rx < 0.5 ? 'left' : 'right'
}

export function StudioWorkspace(props: StudioWorkspaceProps) {
  const {
    layout,
    onToggleCollapse,
    onSetOpen,
    onDockPane,
    onStepRow,
    onToggleSplit,
    onResizeRows,
    onResizeCols,
    onResizeTablesWidth,
    onResetHeightWeights,
    onResetWidthWeights,
    outputs,
    activeOutputIndex,
    onSelectOutput,
    sessionId,
    sqlText,
    sqlSyncKey,
    sqlFromStepId,
    stepEditedAt,
    stepRevisions,
    activeStep,
    allSteps,
    onOpenStepById,
    onRestoreRevision,
    tables,
    onNewSql,
    notify,
    datasetId,
    datasetName,
    rows,
    totalRows,
    loading,
    licenseReady,
    visualTheme,
    gridTheme,
    visualMode,
    onVisualModeChange,
    customizeOpen,
    onToggleCustomize,
    activeChartSort,
    sortOptions,
    onSelectChartSort,
    pivotConfig,
    chartConfig,
    filterFields,
    onPivotConfigChange,
    onChartConfigChange,
    onChartThemeChange,
    onCellClick,
    onDrillThrough,
    onCopyMarkdown,
  } = props

  const stackRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const dataPaneRef = useRef<HTMLDivElement | null>(null)
  const visualPaneRef = useRef<HTMLDivElement | null>(null)
  const activeChipRef = useRef<HTMLButtonElement | null>(null)

  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [dragPane, setDragPane] = useState<WorkspacePaneId | null>(null)
  const [dropTarget, setDropTarget] = useState<{ pane: WorkspacePaneId, edge: DropEdge } | null>(null)

  // Keep active session chip scrolled into view as new charts arrive or the user steps through them.
  useEffect(() => {
    activeChipRef.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [activeOutputIndex, outputs.length])

  const openRowCount = layout.rows.filter(row => !isRowCollapsed(row, layout.collapsed)).length
  const totalOpenRowWeight = layout.rows.reduce((sum, row) => sum + rowHeightWeight(row, layout), 0) || 1
  const resolvedTheme = isUnifiedTheme(visualTheme) ? visualTheme : gridTheme
  const activeSortMeta = sortOptions.find(s => s.value === activeChartSort) ?? sortOptions[0]
  const columnCount = rows.length > 0 ? Object.keys(rows[0]).length : 0

  const measureOpenHeight = useCallback(() => {
    const stack = stackRef.current
    if (!stack)
      return 600
    const collapsedRowCount = layout.rows.length - openRowCount
    return Math.max(240, stack.getBoundingClientRect().height - collapsedRowCount * 34)
  }, [layout.rows.length, openRowCount])

  const measureRowWidth = useCallback((rowIdx: number) => {
    const rowEl = rowRefs.current[rowIdx]
    const row = layout.rows[rowIdx] ?? []
    const collapsedCols = row.filter(id => layout.collapsed[id]).length
    const rawWidth = rowEl?.getBoundingClientRect().width ?? stackRef.current?.getBoundingClientRect().width ?? 900
    return Math.max(320, rawWidth - collapsedCols * 170)
  }, [layout.collapsed, layout.rows])

  const makeHeaderDragProps = (id: WorkspacePaneId): React.HTMLAttributes<HTMLElement> => ({
    draggable: true,
    onDragStart: (e) => {
      setDragPane(id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
    },
    onDragEnd: () => {
      setDragPane(null)
      setDropTarget(null)
    },
  })

  const makePaneDropProps = (id: WorkspacePaneId): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => {
      if (!dragPane || dragPane === id)
        return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const edge = detectDropEdge(e)
      if (!dropTarget || dropTarget.pane !== id || dropTarget.edge !== edge)
        setDropTarget({ pane: id, edge })
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropTarget?.pane === id)
        setDropTarget(null)
    },
    onDrop: (e) => {
      e.preventDefault()
      if (dragPane && dragPane !== id) {
        const edge = dropTarget?.pane === id ? dropTarget.edge : detectDropEdge(e)
        onDockPane(dragPane, id, edge)
      }
      setDragPane(null)
      setDropTarget(null)
    },
  })

  const renderVisualPane = (canMoveUp: boolean, canMoveDown: boolean, isSplit: boolean) => {
    const collapsed = layout.collapsed.visual
    return (
      <section className={`tp-ws-pane tp-ws-pane-visual ${collapsed ? 'is-collapsed' : ''}`} aria-label="Chart and Pivot">
        <header className="tp-ws-pane-head" {...makeHeaderDragProps('visual')}>
          <div className="tp-ws-pane-head-left">
            <span className="tp-ws-grip" title="Drag onto any pane edge (top, bottom, left, right)" aria-hidden="true">⋮⋮</span>
            <button
              type="button"
              className="tp-ws-collapse-btn"
              aria-expanded={!collapsed}
              onClick={() => onToggleCollapse('visual')}
            >
              <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
              <span>{visualMode === 'pivot' ? 'Pivot' : 'Chart'}</span>
            </button>
            {!collapsed && (
              <div className="tp-mcp-segmented" role="tablist" aria-label="Visual mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={visualMode === 'chart'}
                  className={`tp-mcp-seg-btn ${visualMode === 'chart' ? 'active' : ''}`}
                  onClick={() => {
                    onVisualModeChange('chart')
                    if (collapsed)
                      onSetOpen('visual', true)
                  }}
                >
                  Chart
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={visualMode === 'pivot'}
                  className={`tp-mcp-seg-btn ${visualMode === 'pivot' ? 'active' : ''}`}
                  onClick={() => {
                    onVisualModeChange('pivot')
                    if (collapsed)
                      onSetOpen('visual', true)
                  }}
                >
                  Pivot
                </button>
              </div>
            )}
          </div>

          <div className="tp-ws-pane-head-right">
            {!collapsed && rows.length > 0 && visualMode === 'chart' && (
              <div className="tp-mcp-theme-wrap">
                <button
                  type="button"
                  className={`tp-mcp-theme-trigger ${sortMenuOpen ? 'active' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen}
                  title={`Chart sort: ${activeSortMeta.label}`}
                  onClick={() => setSortMenuOpen(prev => !prev)}
                >
                  <span className="tp-mcp-theme-name">{activeSortMeta.short}</span>
                  <span className="tp-mcp-theme-caret" aria-hidden="true">▾</span>
                </button>
                {sortMenuOpen && (
                  <div className="tp-mcp-theme-popover tp-mcp-sort-popover" role="menu" aria-label="Sort chart bars">
                    {sortOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={activeChartSort === opt.value}
                        className={`tp-mcp-theme-option ${activeChartSort === opt.value ? 'active' : ''}`}
                        onClick={() => {
                          onSelectChartSort(opt.value)
                          setSortMenuOpen(false)
                        }}
                      >
                        <span className="tp-mcp-theme-opt-text">
                          <span className="tp-mcp-theme-opt-label">{opt.label}</span>
                          <span className="tp-mcp-theme-opt-desc">{opt.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!collapsed && rows.length > 0 && visualMode === 'pivot' && (
              <button
                type="button"
                className="tp-mcp-btn"
                title="Copy pivot as Markdown"
                onClick={() => onCopyMarkdown(visualPaneRef.current)}
              >
                MD
              </button>
            )}
            {!collapsed && rows.length > 0 && (
              <button
                type="button"
                className={`tp-mcp-btn ${customizeOpen ? 'active' : ''}`}
                title="Toggle drag-and-drop fields, aggregations, chart types, and export toolbar"
                onClick={onToggleCustomize}
              >
                {customizeOpen ? 'Done' : 'Customize'}
              </button>
            )}
            <div className="tp-ws-reorder" role="group" aria-label="Arrange Chart pane">
              <button
                type="button"
                className="tp-ws-move-btn"
                title={isSplit ? 'Stack Chart pane into its own row' : 'Dock Chart pane side-by-side'}
                aria-label={isSplit ? 'Stack Chart pane into its own row' : 'Dock Chart pane side-by-side'}
                onClick={() => onToggleSplit('visual')}
              >
                {isSplit ? '▭' : '◫'}
              </button>
              <button type="button" className="tp-ws-move-btn" disabled={!canMoveUp} title="Move pane up" aria-label="Move Chart pane up" onClick={() => onStepRow('visual', -1)}>↑</button>
              <button type="button" className="tp-ws-move-btn" disabled={!canMoveDown} title="Move pane down" aria-label="Move Chart pane down" onClick={() => onStepRow('visual', 1)}>↓</button>
            </div>
          </div>
        </header>

        {!collapsed && (
          <div
            ref={visualPaneRef}
            className={`tp-ws-pane-body tp-mcp-view-${visualMode} ${!customizeOpen ? 'tp-mcp-focus' : ''}`}
          >
            {licenseReady && rows.length > 0
              ? (
                  <DataGrid
                    data={rows}
                    loading={loading}
                    theme={resolvedTheme}
                    chartTheme={visualTheme}
                    fontSize="sm"
                    rowHeight={28}
                    headerHeight={32}
                    viewMode={visualMode}
                    pivotConfig={pivotConfig}
                    chartConfig={chartConfig}
                    filterFields={filterFields}
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
                    initialHeight={320}
                    exportFilename={`${datasetId || 'tinypivot'}.csv`}
                    onViewModeChange={(next: DataGridViewMode) => {
                      if (next === 'chart' || next === 'pivot')
                        onVisualModeChange(next)
                    }}
                    onPivotConfigChange={onPivotConfigChange}
                    onChartConfigChange={onChartConfigChange}
                    onChartThemeChange={onChartThemeChange}
                    onCellClick={onCellClick}
                    onDrillThrough={onDrillThrough}
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
                      <span>Ask your AI agent to load a CSV/JSON file, query DuckDB/Postgres, or run SQL above.</span>
                    </div>
                  )}
          </div>
        )}
      </section>
    )
  }

  const renderDataPane = (canMoveUp: boolean, canMoveDown: boolean, isSplit: boolean) => {
    const collapsed = layout.collapsed.data
    return (
      <section className={`tp-ws-pane tp-ws-pane-data ${collapsed ? 'is-collapsed' : ''}`} aria-label="Data frame">
        <header className="tp-ws-pane-head" {...makeHeaderDragProps('data')}>
          <div className="tp-ws-pane-head-left">
            <span className="tp-ws-grip" title="Drag onto any pane edge (top, bottom, left, right)" aria-hidden="true">⋮⋮</span>
            <button
              type="button"
              className="tp-ws-collapse-btn"
              aria-expanded={!collapsed}
              onClick={() => onToggleCollapse('data')}
            >
              <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
              <span>Data Frame</span>
            </button>
            <span className="tp-ws-pane-meta">
              {totalRows > 0
                ? `${totalRows.toLocaleString()} row${totalRows === 1 ? '' : 's'}${columnCount ? ` × ${columnCount} cols` : ''}`
                : 'No rows'}
            </span>
          </div>

          <div className="tp-ws-pane-head-right">
            {!collapsed && rows.length > 0 && (
              <button
                type="button"
                className="tp-mcp-btn"
                title="Copy visible rows as Markdown table"
                onClick={() => onCopyMarkdown(dataPaneRef.current)}
              >
                MD
              </button>
            )}
            <div className="tp-ws-reorder" role="group" aria-label="Arrange Data Frame pane">
              <button
                type="button"
                className="tp-ws-move-btn"
                title={isSplit ? 'Stack Data Frame pane into its own row' : 'Dock Data Frame pane side-by-side'}
                aria-label={isSplit ? 'Stack Data Frame pane into its own row' : 'Dock Data Frame pane side-by-side'}
                onClick={() => onToggleSplit('data')}
              >
                {isSplit ? '▭' : '◫'}
              </button>
              <button type="button" className="tp-ws-move-btn" disabled={!canMoveUp} title="Move pane up" aria-label="Move Data Frame pane up" onClick={() => onStepRow('data', -1)}>↑</button>
              <button type="button" className="tp-ws-move-btn" disabled={!canMoveDown} title="Move pane down" aria-label="Move Data Frame pane down" onClick={() => onStepRow('data', 1)}>↓</button>
            </div>
          </div>
        </header>

        {!collapsed && (
          <div ref={dataPaneRef} className="tp-ws-pane-body tp-mcp-view-grid">
            {licenseReady && rows.length > 0
              ? (
                  <DataGrid
                    data={rows}
                    loading={loading}
                    theme={resolvedTheme}
                    chartTheme={visualTheme}
                    fontSize="sm"
                    rowHeight={26}
                    headerHeight={30}
                    viewMode="grid"
                    filterFields={[]}
                    showPivot={false}
                    enableExport={true}
                    enableSearch={true}
                    enablePagination={true}
                    pageSize={100}
                    enableColumnResize={true}
                    enableClipboard={true}
                    enableDrillDown={false}
                    enableDrillThrough={false}
                    enableVerticalResize={false}
                    initialHeight={220}
                    exportFilename={`${datasetId || 'tinypivot'}.csv`}
                    onCellClick={onCellClick}
                  />
                )
              : (
                  <div className="tp-mcp-empty tp-ws-empty-compact">
                    <span>{loading ? 'Loading rows…' : 'Rows appear here as soon as a dataset is loaded.'}</span>
                  </div>
                )}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="tp-workspace">
      {outputs.length > 0 && (
        <nav className="tp-ws-stepper" aria-label="Session outputs">
          <div className="tp-ws-stepper-arrows">
            <button
              type="button"
              className="tp-ws-nav-btn"
              disabled={loading || activeOutputIndex <= 0}
              aria-label="Previous output"
              title="Previous chart / data frame"
              onClick={() => activeOutputIndex > 0 && onSelectOutput(outputs[activeOutputIndex - 1])}
            >
              ◀
            </button>
            <span className="tp-ws-stepper-pos">
              {`${Math.max(1, activeOutputIndex + 1)} / ${outputs.length}`}
            </span>
            <button
              type="button"
              className="tp-ws-nav-btn"
              disabled={loading || activeOutputIndex < 0 || activeOutputIndex >= outputs.length - 1}
              aria-label="Next output"
              title="Next chart / data frame"
              onClick={() => activeOutputIndex >= 0 && activeOutputIndex < outputs.length - 1 && onSelectOutput(outputs[activeOutputIndex + 1])}
            >
              ▶
            </button>
          </div>
          <div className="tp-ws-chips" role="tablist" aria-label="Charts and tables in this session">
            {outputs.map((output, idx) => {
              const isActive = idx === activeOutputIndex
              return (
                <button
                  key={output.step.id}
                  ref={isActive ? activeChipRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  disabled={loading}
                  className={`tp-ws-chip ${isActive ? 'is-active' : ''}`}
                  title={`${output.label} (${output.kind})${output.step.rows ? ` · ${output.step.rows.toLocaleString()} rows` : ''}`}
                  onClick={() => onSelectOutput(output)}
                >
                  <span className="tp-ws-chip-num">{output.index}</span>
                  <span className="tp-ws-chip-label">{output.label}</span>
                  <span className="tp-ws-chip-kind">{output.kind}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      <div ref={stackRef} className="tp-ws-stack">
        {layout.rows.map((row, rowIdx) => {
          const rowCollapsed = isRowCollapsed(row, layout.collapsed)
          const nextOpenRowIdx = !rowCollapsed
            ? layout.rows.findIndex((r, idx) => idx > rowIdx && !isRowCollapsed(r, layout.collapsed))
            : -1
          const rowStyle: React.CSSProperties = rowCollapsed
            ? { flex: '0 0 auto' }
            : { flex: `${rowHeightWeight(row, layout) / totalOpenRowWeight} 1 0px` }

          const openInRow = row.filter(id => !layout.collapsed[id])
          const totalRowWidthWeight = openInRow.reduce((sum, id) => sum + layout.widthWeights[id], 0) || 1
          const isSplitRow = row.length > 1

          return (
            <React.Fragment key={row.join('-')}>
              <div
                ref={(el) => { rowRefs.current[rowIdx] = el }}
                className={`tp-ws-row ${rowCollapsed ? 'is-collapsed' : 'is-open'} ${isSplitRow ? 'is-split' : ''}`}
                style={rowStyle}
              >
                {row.map((paneId, colIdx) => {
                  const isCollapsed = layout.collapsed[paneId]
                  const canMoveUp = isSplitRow || rowIdx > 0
                  const canMoveDown = isSplitRow || rowIdx < layout.rows.length - 1
                  const nextOpenCol = !isCollapsed
                    ? row.slice(colIdx + 1).find(nextId => !layout.collapsed[nextId])
                    : undefined

                  let slotStyle: React.CSSProperties
                  if (!isSplitRow) {
                    slotStyle = { flex: '1 1 auto' }
                  }
                  else if (rowCollapsed) {
                    slotStyle = { flex: '1 1 0px' }
                  }
                  else if (isCollapsed) {
                    slotStyle = { flex: '0 0 auto' }
                  }
                  else {
                    slotStyle = { flex: `${layout.widthWeights[paneId] / totalRowWidthWeight} 1 0px` }
                  }

                  const dropClass = dropTarget?.pane === paneId ? `is-drop-target is-drop-${dropTarget.edge}` : ''

                  return (
                    <React.Fragment key={paneId}>
                      <div
                        className={`tp-ws-slot ${isCollapsed ? 'is-collapsed' : 'is-open'} ${isSplitRow ? 'is-split' : ''} ${dragPane === paneId ? 'is-dragging' : ''} ${dropClass}`}
                        style={slotStyle}
                        {...makePaneDropProps(paneId)}
                      >
                        {paneId === 'sql' && (
                          <SqlPane
                            sessionId={sessionId}
                            sql={sqlText}
                            syncKey={sqlSyncKey}
                            fromStepId={sqlFromStepId}
                            stepEditedAt={stepEditedAt}
                            stepRevisions={stepRevisions}
                            activeStep={activeStep}
                            allSteps={allSteps}
                            onOpenStepById={onOpenStepById}
                            rowCount={totalRows}
                            columnCount={columnCount}
                            datasetName={datasetName}
                            visualMode={visualMode}
                            chartConfig={chartConfig}
                            pivotConfig={pivotConfig}
                            filterFields={filterFields}
                            onRestoreRevision={onRestoreRevision}
                            tables={tables}
                            tablesWidth={layout.tablesWidth}
                            onResizeTablesWidth={onResizeTablesWidth}
                            collapsed={isCollapsed}
                            onToggleCollapse={() => onToggleCollapse('sql')}
                            onExpand={() => onSetOpen('sql', true)}
                            onNewSql={onNewSql}
                            notify={notify}
                            canMoveUp={canMoveUp}
                            canMoveDown={canMoveDown}
                            isSplit={isSplitRow}
                            onMoveUp={() => onStepRow('sql', -1)}
                            onMoveDown={() => onStepRow('sql', 1)}
                            onToggleSplit={() => onToggleSplit('sql')}
                            draggableHeaderProps={makeHeaderDragProps('sql')}
                          />
                        )}
                        {paneId === 'visual' && renderVisualPane(canMoveUp, canMoveDown, isSplitRow)}
                        {paneId === 'data' && renderDataPane(canMoveUp, canMoveDown, isSplitRow)}
                      </div>
                      {nextOpenCol && (
                        <PaneVerticalResizer
                          leftId={paneId}
                          rightId={nextOpenCol}
                          onResize={delta => onResizeCols(paneId, nextOpenCol, delta, measureRowWidth(rowIdx))}
                          onReset={onResetWidthWeights}
                        />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
              {nextOpenRowIdx >= 0 && (
                <PaneHorizontalResizer
                  upperLabel={row.join(' + ')}
                  lowerLabel={layout.rows[nextOpenRowIdx].join(' + ')}
                  onResize={delta => onResizeRows(rowIdx, nextOpenRowIdx, delta, measureOpenHeight())}
                  onReset={onResetHeightWeights}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
