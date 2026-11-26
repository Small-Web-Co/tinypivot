import type { ChartConfig, PivotConfig } from '@smallwebco/tinypivot-core'
import type { StepRevision, TraceStep } from '../src/studio-protocol'
import { SQLDialect, sql as sqlLanguage } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildStepLineage } from '../src/lineage'
import { buildReactSnippet } from './chartTransform'
import { postToStudio } from './companionApi'
import { formatSql, sqlName, sqlOneLine } from './sqlFormat'

/**
 * Inline, collapsible Code pane:
 * - `SQL`: DuckDB read-only SQL editor. When attached to a step, "Save & Run" updates that step
 *   in place while preserving prior SQL versions in `step.revisions` across later chat turns.
 * - `Chart JS`: Minimal, easy-to-read FYI showing how TinyPivot's JS/TS layer aggregates, sorts,
 *   and renders the SQL rows into the active Chart or Pivot table, with 1-click Copy TS.
 */

export interface WorkbenchTable {
  /** What SQL calls the table: the dataset id. */
  id: string
  name: string
  columns: string[]
  /** The SQL that made the table, formatted, for the user to start from. */
  sql?: string
  /** Made by the user's own SQL, so they may delete it. */
  mine?: boolean
}

export interface PaneReorderProps {
  canMoveUp: boolean
  canMoveDown: boolean
  isSplit: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleSplit: () => void
  draggableHeaderProps: React.HTMLAttributes<HTMLElement>
}

interface SqlPaneProps extends PaneReorderProps {
  /** Which isolated session SQL edits and removals target. */
  sessionId?: string
  /** Active step's SQL, synced into the editor when `syncKey` changes. */
  sql: string
  /** Changes when the user switches steps or clicks New SQL. */
  syncKey: string
  /** The step being edited: Save & Run updates this step in place (preserving revisions); New forks a new step. */
  fromStepId?: string
  /** Timestamp if the active step has been edited in place. */
  stepEditedAt?: string
  /** Prior revisions saved on the active step. */
  stepRevisions?: StepRevision[]
  /** Active step and all session steps for computing proof-of-work lineage & upstream raw-row links. */
  activeStep?: TraceStep
  allSteps?: TraceStep[]
  onOpenStepById?: (stepId: string) => void
  /** Active dataset & chart/pivot metadata for the read-only Lineage / Proof-of-Work tab. */
  rowCount: number
  columnCount: number
  datasetName: string
  visualMode: 'chart' | 'pivot'
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  filterFields?: string[]
  onRestoreRevision: (revisionIndex: number) => Promise<void>

  tables: WorkbenchTable[]
  tablesWidth: number
  onResizeTablesWidth: (width: number) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onExpand: () => void
  onNewSql: () => void
  notify: (message: string) => void
}

/** DuckDB functions offered as the user types, beside SQL keywords and the loaded tables. */
const DUCKDB_FUNCTIONS = [
  'sum',
  'avg',
  'count',
  'min',
  'max',
  'median',
  'mode',
  'quantile_cont',
  'stddev',
  'approx_count_distinct',
  'arg_max',
  'arg_min',
  'first',
  'last',
  'list',
  'string_agg',
  'coalesce',
  'nullif',
  'greatest',
  'least',
  'round',
  'abs',
  'try_cast',
  'date_trunc',
  'date_part',
  'date_diff',
  'strftime',
  'strptime',
  'year',
  'month',
  'quarter',
  'current_date',
  'now',
  'lower',
  'upper',
  'trim',
  'length',
  'concat',
  'replace',
  'split_part',
  'regexp_matches',
  'regexp_replace',
  'unnest',
  'row_number',
  'rank',
  'dense_rank',
  'ntile',
  'lag',
  'lead',
  'read_csv',
  'read_parquet',
  'read_json_auto',
]

/** SQL as DuckDB speaks it, for highlighting and completion. */
const DuckDB = SQLDialect.define({ builtin: [...DUCKDB_FUNCTIONS, 'qualify', 'exclude', 'pivot', 'unpivot', 'ilike'].join(' ') })

/** Where a new query starts: the newest table, so nobody faces an empty editor. */
export function starterSql(tables: WorkbenchTable[]): string {
  const table = tables.at(-1)
  return table ? `SELECT *\nFROM ${sqlName(table.id)}\nLIMIT 100` : ''
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-background-primary, #0b101b)', color: 'var(--color-text-primary, #e2e8f0)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { fontFamily: 'var(--tp-mono)', fontSize: '12.5px', caretColor: 'var(--tp-accent)' },
  '.cm-gutters': { backgroundColor: 'var(--color-background-secondary, #111827)', color: 'var(--color-text-tertiary, #64748b)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--tp-accent-soft)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--color-background-secondary, #111827)', color: 'var(--color-text-primary, #e2e8f0)', border: '1px solid var(--color-border-primary, rgba(148, 163, 184, 0.3))' },
  '.cm-tooltip-autocomplete': { fontFamily: 'var(--tp-mono)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--tp-accent-soft)', color: 'var(--color-text-primary, #e2e8f0)' },
  '.cm-completionDetail': { color: 'var(--color-text-tertiary, #64748b)', fontStyle: 'normal', marginLeft: '1em' },
  '.cm-completionMatchedText': { color: 'var(--tp-accent)', textDecoration: 'none', fontWeight: '600' },
})

const sqlHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--tp-accent)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--tp-accent-2)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--tp-accent-2)' },
  { tag: tags.comment, color: 'var(--color-text-tertiary, #64748b)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--color-text-secondary, #94a3b8)' },
]))

function buildSqlExtension(tables: WorkbenchTable[]) {
  const schema = Object.fromEntries(tables.map(table => [table.id, {
    self: { label: table.id, apply: sqlName(table.id), type: 'type', detail: table.name },
    children: table.columns.map(column => ({ label: column, apply: sqlName(column), type: 'property', detail: table.name })),
  }]))
  return sqlLanguage({ dialect: DuckDB, schema, defaultTable: tables.at(-1)?.id, upperCaseKeywords: true })
}

async function formatted(sql: string): Promise<{ sql: string, byFluff: boolean }> {
  const out = await postToStudio<{ sql: string | null }>('/api/studio/format', { sql }).catch(() => ({ sql: null }))
  return out.sql ? { sql: out.sql, byFluff: true } : { sql: formatSql(sql), byFluff: false }
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface TableDrawerProps {
  tables: WorkbenchTable[]
  onInsert: (text: string) => void
  onStartFrom: (sql: string) => void
  onRemove: (table: WorkbenchTable) => void
}

function TableDrawer({ tables, onInsert, onStartFrom, onRemove }: TableDrawerProps) {
  const [open, setOpen] = useState<string | null>(tables.at(-1)?.id ?? null)
  if (tables.length === 0)
    return <p className="tp-wb-empty">No tables loaded yet. Query a file directly: FROM &apos;/path/to/file.csv&apos;.</p>
  return (
    <ul className="tp-wb-tables">
      {tables.map(table => (
        <li key={table.id}>
          <div className="tp-wb-table">
            <button type="button" className="tp-wb-toggle" aria-expanded={open === table.id} onClick={() => setOpen(prev => (prev === table.id ? null : table.id))}>
              {open === table.id ? '▾' : '▸'}
            </button>
            <button type="button" className="tp-wb-name" title={`Insert ${sqlName(table.id)}`} onClick={() => onInsert(sqlName(table.id))}>{table.name}</button>
            {table.mine && (
              <button type="button" className="tp-wb-remove" aria-label={`Delete ${table.name}`} title="Delete this table and its step" onClick={() => onRemove(table)}>×</button>
            )}
          </div>
          {open === table.id && (
            <>
              <ul className="tp-wb-columns">
                {table.columns.map(column => (
                  <li key={column}>
                    <button type="button" onClick={() => onInsert(sqlName(column))}>{column}</button>
                  </li>
                ))}
              </ul>
              {table.sql && (
                <div className="tp-wb-table-sql">
                  <button type="button" className="tp-run-link" onClick={() => onStartFrom(table.sql!)}>Load this SQL</button>
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Proof-of-work Lineage panel: shows underlying source/rows -> SQL filters & aggregations ->
 * output Data Frame & fingerprint hash -> client-side Chart/Pivot aggregation + copyable TS spec.
 */
export function LineageProofPanel({
  step,
  allSteps,
  datasetName,
  rowCount,
  columnCount,
  viewMode,
  chartConfig,
  pivotConfig,
  filterFields,
  onJumpToStep,
  notify,
}: {
  step?: TraceStep
  allSteps: TraceStep[]
  datasetName: string
  rowCount: number
  columnCount: number
  viewMode: 'chart' | 'pivot' | 'grid'
  chartConfig?: Partial<ChartConfig>
  pivotConfig?: Partial<PivotConfig>
  filterFields?: string[]
  onJumpToStep?: (stepId: string) => void
  notify: (message: string) => void
}) {
  const [tsOpen, setTsOpen] = useState(false)
  const lineage = useMemo(
    () => buildStepLineage(step, allSteps, { datasetName, rowCount, columnCount, viewMode, chartConfig, pivotConfig, filterFields }),
    [allSteps, chartConfig, columnCount, datasetName, filterFields, pivotConfig, rowCount, step, viewMode],
  )
  const tsCode = useMemo(
    () => buildReactSnippet({ datasetName, viewMode, chartConfig, pivotConfig, filterFields }),
    [chartConfig, datasetName, filterFields, pivotConfig, viewMode],
  )

  const copyTs = async () => {
    try {
      await navigator.clipboard.writeText(tsCode)
      notify('Copied TypeScript chart spec')
    }
    catch {
      notify('Copy blocked')
    }
  }

  const detailItems = lineage.nodes.flatMap(n => n.details.map(d => ({ stage: n.label, text: d })))

  return (
    <div className="tp-ws-fyi">
      <div className="tp-ws-fyi-steps" aria-label="Proof of work lineage">
        {lineage.nodes.map((node, i) => (
          <React.Fragment key={`${node.stage}-${node.label}`}>
            {i > 0 && <span className="tp-ws-fyi-arrow" aria-hidden="true">→</span>}
            {node.stepId && onJumpToStep
              ? (
                  <button
                    type="button"
                    className={`tp-ws-fyi-pill is-clickable is-${node.stage}`}
                    title={`Click to inspect underlying rows (${node.details.join(' · ') || node.summary})`}
                    onClick={() => onJumpToStep(node.stepId!)}
                  >
                    <span className="tp-ws-fyi-label">{node.label}</span>
                    <span className="tp-ws-fyi-val">{`${node.summary} ↗`}</span>
                  </button>
                )
              : (
                  <div className={`tp-ws-fyi-pill is-${node.stage}`} title={node.details.join(' · ') || undefined}>
                    <span className="tp-ws-fyi-label">{node.label}</span>
                    <span className="tp-ws-fyi-val">{node.summary}</span>
                  </div>
                )}
          </React.Fragment>
        ))}
        <div className="tp-ws-fyi-actions">
          <button type="button" className={`tp-mcp-btn ${tsOpen ? 'active' : ''}`} onClick={() => setTsOpen(o => !o)}>
            {tsOpen ? 'Hide TS' : 'TS Spec'}
          </button>
          <button type="button" className="tp-mcp-btn" onClick={() => void copyTs()}>
            Copy TS
          </button>
        </div>
      </div>

      {detailItems.length > 0 && (
        <ul className="tp-lineage-details">
          {detailItems.map((item, idx) => (
            <li key={`${item.stage}-${idx}`}>
              <span className="tp-lineage-detail-k">{item.stage}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      )}

      {tsOpen && (
        <pre className="tp-ws-fyi-code"><code>{tsCode}</code></pre>
      )}
    </div>
  )
}

export function SqlPane({
  sessionId,
  sql,
  syncKey,
  fromStepId,
  stepEditedAt,
  stepRevisions,
  activeStep,
  allSteps = [],
  onOpenStepById,
  rowCount,
  columnCount,
  datasetName,
  visualMode,
  chartConfig,
  pivotConfig,
  filterFields,
  onRestoreRevision,
  tables,
  tablesWidth,
  onResizeTablesWidth,
  collapsed,
  onToggleCollapse,
  onExpand,
  onNewSql,
  notify,
  canMoveUp,
  canMoveDown,
  isSplit,
  onMoveUp,
  onMoveDown,
  onToggleSplit,
  draggableHeaderProps,
}: SqlPaneProps) {
  const [codeTab, setCodeTab] = useState<'sql' | 'fyi'>('sql')
  const [name, setName] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tablesOpen, setTablesOpen] = useState(false)
  const [revisionsOpen, setRevisionsOpen] = useState(false)
  const [resizingTables, setResizingTables] = useState(false)
  const [draftSql, setDraftSql] = useState(() => sql || starterSql(tables))

  const sqlHostRef = useRef<HTMLDivElement | null>(null)
  const tablesRef = useRef<HTMLElement | null>(null)
  const sqlViewRef = useRef<EditorView | null>(null)
  const sqlCompartment = useRef(new Compartment())
  const runSqlRef = useRef<() => void>(() => {})
  const lastSyncKeyRef = useRef(syncKey)

  useEffect(() => {
    if (!resizingTables)
      return
    const move = (event: PointerEvent) => {
      const left = tablesRef.current?.getBoundingClientRect().left ?? 0
      onResizeTablesWidth(event.clientX - left)
    }
    const stop = () => setResizingTables(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    document.body.classList.add('tp-resizing')
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('tp-resizing')
    }
  }, [onResizeTablesWidth, resizingTables])

  // Sync SQL draft when the user switches steps, restores a revision, or clicks New SQL.
  useEffect(() => {
    if (lastSyncKeyRef.current === syncKey)
      return
    lastSyncKeyRef.current = syncKey
    const nextSql = sql || starterSql(tables)
    setDraftSql(nextSql)
    setError(null)
    setRevisionsOpen(false)
    const sv = sqlViewRef.current
    if (sv && sv.state.doc.toString() !== nextSql) {
      sv.dispatch({ changes: { from: 0, to: sv.state.doc.length, insert: nextSql } })
    }
  }, [sql, syncKey, tables])

  // Mount SQL CodeMirror when expanded on the SQL tab.
  useEffect(() => {
    if (collapsed || codeTab !== 'sql' || !sqlHostRef.current)
      return
    const view = new EditorView({
      doc: draftSql,
      parent: sqlHostRef.current,
      extensions: [
        basicSetup,
        sqlCompartment.current.of(buildSqlExtension(tables)),
        Prec.high(sqlHighlight),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged)
            setDraftSql(update.state.doc.toString())
        }),
        Prec.highest(keymap.of([{
          key: 'Mod-Enter',
          run: () => {
            runSqlRef.current()
            return true
          },
        }])),
      ],
    })
    sqlViewRef.current = view
    return () => {
      view.destroy()
      sqlViewRef.current = null
    }
  }, [collapsed, codeTab])

  // Reconfigure SQL schema completion dynamically when tables change.
  useEffect(() => {
    const view = sqlViewRef.current
    if (!view)
      return
    view.dispatch({ effects: sqlCompartment.current.reconfigure(buildSqlExtension(tables)) })
  }, [tables])

  const getSql = () => sqlViewRef.current?.state.doc.toString() ?? draftSql

  const setSqlDoc = useCallback((text: string) => {
    setDraftSql(text)
    const view = sqlViewRef.current
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      view.focus()
    }
  }, [])

  const insertSqlText = useCallback((text: string) => {
    const view = sqlViewRef.current
    if (!view)
      return
    view.dispatch(view.state.replaceSelection(text))
    view.focus()
  }, [])

  const runSql = useCallback(async (mode: 'update' | 'new') => {
    const query = getSql().trim()
    if (!query || running)
      return
    setRunning(true)
    setError(null)
    try {
      const updateStepId = mode === 'update' && fromStepId ? fromStepId : undefined
      const out = await postToStudio<{ datasetId: string, rows: number, truncated: boolean, updated?: boolean }>('/api/studio/query', {
        sessionId,
        sql: query,
        name: name.trim() || undefined,
        ...(updateStepId ? { updateStepId } : { fromStepId }),
      })
      setName('')
      notify(`${out.updated ? 'Step updated · ' : ''}${out.rows.toLocaleString()} rows${out.truncated ? ' (capped)' : ''}`)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setRunning(false)
    }
  }, [draftSql, fromStepId, name, notify, running, sessionId])
  runSqlRef.current = () => void runSql(fromStepId ? 'update' : 'new')

  const format = useCallback(async () => {
    const out = await formatted(getSql())
    setSqlDoc(out.sql)
    notify(out.byFluff ? 'Formatted with SQLFluff' : 'Formatted SQL')
  }, [notify, setSqlDoc])

  const remove = useCallback(async (table: WorkbenchTable) => {
    if (!window.confirm(`Delete "${table.name}" and its step from the trace? This cannot be undone.`))
      return
    try {
      await postToStudio('/api/studio/remove', { sessionId, datasetId: table.id })
      notify(`Deleted ${table.name}`)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [notify, sessionId])

  const previewLine = useMemo(() => {
    const text = (draftSql || sql || '').trim()
    return text ? sqlOneLine(text) : 'Write or edit DuckDB SQL over loaded tables…'
  }, [draftSql, sql])

  const revisionCount = stepRevisions?.length ?? 0

  return (
    <section className={`tp-ws-pane tp-ws-pane-sql ${collapsed ? 'is-collapsed' : ''}`} aria-label="SQL and Chart JS inspector">
      <header className="tp-ws-pane-head" {...draggableHeaderProps}>
        <div className="tp-ws-pane-head-left">
          <span className="tp-ws-grip" title="Drag onto any pane edge (top, bottom, left, right)" aria-hidden="true">⋮⋮</span>
          <button
            type="button"
            className="tp-ws-collapse-btn"
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
            <span>SQL</span>
          </button>

          <div className="tp-mcp-segmented" role="tablist" aria-label="Code pane mode">
            <button
              type="button"
              role="tab"
              aria-selected={codeTab === 'sql'}
              className={`tp-mcp-seg-btn ${codeTab === 'sql' ? 'active' : ''}`}
              onClick={() => {
                setCodeTab('sql')
                if (collapsed)
                  onExpand()
              }}
            >
              SQL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={codeTab === 'fyi'}
              className={`tp-mcp-seg-btn ${codeTab === 'fyi' ? 'active' : ''}`}
              title="Proof of work: underlying rows, SQL aggregations, fingerprint hash, and JS/TS chart spec"
              onClick={() => {
                setCodeTab('fyi')
                if (collapsed)
                  onExpand()
              }}
            >
              Lineage
            </button>
          </div>

          {collapsed
            ? (
                <button
                  type="button"
                  className="tp-ws-sql-preview"
                  title="Click to expand and edit SQL"
                  onClick={() => { setCodeTab('sql'); onExpand() }}
                >
                  {previewLine}
                </button>
              )
            : codeTab === 'sql'
              ? (
                  <span className="tp-ws-pane-meta">
                    {fromStepId ? 'DuckDB · edits preserve step history' : 'DuckDB · read-only · local'}
                  </span>
                )
              : (
                  <span className="tp-ws-pane-meta">Proof of work · underlying rows, SQL &amp; chart aggregations</span>
                )}

          {revisionCount > 0 && (
            <div className="tp-mcp-theme-wrap">
              <button
                type="button"
                className={`tp-ws-rev-pill ${revisionsOpen ? 'active' : ''}`}
                title={`Step edited ${stepEditedAt ? shortTime(stepEditedAt) : ''} · ${revisionCount} prior SQL revision${revisionCount === 1 ? '' : 's'} saved`}
                onClick={() => setRevisionsOpen(open => !open)}
              >
                {`v${revisionCount + 1} ▾`}
              </button>
              {revisionsOpen && stepRevisions && (
                <div className="tp-mcp-theme-popover tp-ws-rev-popover" role="menu" aria-label="Step revision history">
                  <div className="tp-ws-rev-head">Saved SQL revisions</div>
                  {[...stepRevisions].reverse().map((rev, revOffset) => {
                    const originalIdx = stepRevisions.length - 1 - revOffset
                    return (
                      <button
                        key={`${rev.at}-${originalIdx}`}
                        type="button"
                        role="menuitem"
                        className="tp-mcp-theme-option"
                        onClick={() => {
                          setRevisionsOpen(false)
                          void onRestoreRevision(originalIdx)
                        }}
                      >
                        <span className="tp-mcp-theme-opt-text">
                          <span className="tp-mcp-theme-opt-label">
                            {`v${originalIdx + 1} · ${shortTime(rev.at)}`}
                            {typeof rev.rows === 'number' ? ` (${rev.rows.toLocaleString()} rows)` : ''}
                          </span>
                          <span className="tp-mcp-theme-opt-desc">
                            {rev.note ?? (rev.sql ? sqlOneLine(rev.sql) : 'Restore version')}
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

        <div className="tp-ws-pane-head-right">
          {collapsed
            ? (
                <>
                  <button
                    type="button"
                    className="tp-mcp-btn"
                    onClick={() => { setCodeTab('sql'); onExpand() }}
                  >
                    Edit SQL
                  </button>
                  <button type="button" className="tp-mcp-btn" onClick={() => { setCodeTab('sql'); onNewSql() }}>New</button>
                </>
              )
            : codeTab === 'sql'
              ? (
                  <>
                    <button
                      type="button"
                      className={`tp-mcp-btn ${tablesOpen ? 'active' : ''}`}
                      onClick={() => setTablesOpen(open => !open)}
                    >
                      {`Tables (${tables.length})`}
                    </button>
                    <button type="button" className="tp-mcp-btn" onClick={() => void format()}>Format</button>
                    <input
                      className="tp-ws-sql-name"
                      placeholder="Result name…"
                      value={name}
                      aria-label="Result table name"
                      onChange={e => setName(e.target.value)}
                    />
                    {fromStepId && (
                      <button
                        type="button"
                        className="tp-mcp-btn"
                        disabled={running}
                        title="Run as a brand-new step without altering this step"
                        onClick={() => void runSql('new')}
                      >
                        New step
                      </button>
                    )}
                    <button
                      type="button"
                      className="tp-mcp-btn tp-mcp-btn-primary"
                      disabled={running}
                      title={fromStepId ? 'Update this step in place (previous SQL kept in revision history)' : 'Run SQL as a new step'}
                      onClick={() => void runSql(fromStepId ? 'update' : 'new')}
                    >
                      {running ? 'Running…' : fromStepId ? 'Save & Run ⌘↵' : 'Run ⌘↵'}
                    </button>
                  </>
                )
              : null}
          <div className="tp-ws-reorder" role="group" aria-label="Rearrange SQL pane">
            <button type="button" className="tp-ws-move-btn" title={isSplit ? 'Stack SQL pane on its own row' : 'Dock SQL pane side-by-side'} aria-label={isSplit ? 'Stack SQL pane' : 'Dock SQL pane side-by-side'} onClick={onToggleSplit}>{isSplit ? '▭' : '◫'}</button>
            <button type="button" className="tp-ws-move-btn" disabled={!canMoveUp} title="Move pane up" aria-label="Move SQL pane up" onClick={onMoveUp}>↑</button>
            <button type="button" className="tp-ws-move-btn" disabled={!canMoveDown} title="Move pane down" aria-label="Move SQL pane down" onClick={onMoveDown}>↓</button>
          </div>
        </div>
      </header>

      {!collapsed && codeTab === 'sql' && (
        <div className="tp-ws-sql-body">
          {tablesOpen && (
            <>
              <aside ref={tablesRef} className="tp-ws-sql-tables" style={{ width: `${tablesWidth}px`, flexBasis: `${tablesWidth}px` }} aria-label="Loaded tables">
                <TableDrawer
                  tables={tables}
                  onInsert={insertSqlText}
                  onStartFrom={next => setSqlDoc(next)}
                  onRemove={table => void remove(table)}
                />
              </aside>
              <div
                className={`tp-ws-vresizer ${resizingTables ? 'is-dragging' : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize tables drawer"
                tabIndex={0}
                title="Drag to resize tables list. Double-click to reset."
                onPointerDown={(e) => {
                  e.preventDefault()
                  setResizingTables(true)
                }}
                onDoubleClick={() => onResizeTablesWidth(220)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    onResizeTablesWidth(tablesWidth - 20)
                  }
                  else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    onResizeTablesWidth(tablesWidth + 20)
                  }
                }}
              />
            </>
          )}
          <div className="tp-ws-sql-editor-col">
            <div className="tp-ws-sql-editor" ref={sqlHostRef} />
            {error && <div className="tp-studio-error" role="alert">{error}</div>}
          </div>
        </div>
      )}

      {!collapsed && codeTab === 'fyi' && (
        <LineageProofPanel
          step={activeStep}
          allSteps={allSteps}
          datasetName={datasetName}
          rowCount={rowCount}
          columnCount={columnCount}
          viewMode={visualMode}
          chartConfig={chartConfig}
          pivotConfig={pivotConfig}
          filterFields={filterFields}
          onJumpToStep={onOpenStepById}
          notify={notify}
        />
      )}
    </section>
  )
}
