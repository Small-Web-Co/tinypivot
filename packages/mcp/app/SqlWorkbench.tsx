import { SQLDialect, sql as sqlLanguage } from '@codemirror/lang-sql'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { postToStudio } from './companionApi'
import { formatSql, sqlName } from './sqlFormat'

/**
 * The SQL workbench: a full-size editor over the loaded tables. The user starts from a step's
 * query, or from the SQL behind any loaded table, changes it with completion for tables, columns
 * and DuckDB functions, and runs it with DuckDB on their machine; the result opens in the Studio
 * as their own step and is previewed here, so they can keep exploring without closing it.
 */

export interface WorkbenchTable {
  /** What SQL calls the table: the dataset id. */
  id: string
  name: string
  columns: string[]
  /** The SQL that made the table, formatted, for the user to start from. */
  sql?: string
}

interface SqlWorkbenchProps {
  initialSql: string
  /** The step being edited: its chart or pivot carries over to the result when it fits. */
  fromStepId?: string
  tables: WorkbenchTable[]
  onClose: () => void
  notify: (message: string) => void
}

type Row = Record<string, unknown>

const PREVIEW_ROWS = 50

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
function starterSql(tables: WorkbenchTable[]): string {
  const table = tables.at(-1)
  return table ? `SELECT *\nFROM ${sqlName(table.id)}\nLIMIT 100` : ''
}

/** Editor colours from the Studio's theme variables, so the workbench follows the chosen theme. */
const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-background-primary, #0b101b)', color: 'var(--color-text-primary, #e2e8f0)' },
  '.cm-content': { fontFamily: 'var(--tp-mono)', fontSize: '13px', caretColor: 'var(--tp-accent)' },
  '.cm-gutters': { backgroundColor: 'var(--color-background-secondary, #111827)', color: 'var(--color-text-tertiary, #64748b)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--tp-accent-soft)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--color-background-secondary, #111827)', color: 'var(--color-text-primary, #e2e8f0)', border: '1px solid var(--color-border-primary, rgba(148, 163, 184, 0.3))' },
  '.cm-tooltip-autocomplete': { fontFamily: 'var(--tp-mono)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--tp-accent-soft)', color: 'var(--color-text-primary, #e2e8f0)' },
  '.cm-completionDetail': { color: 'var(--color-text-tertiary, #64748b)', fontStyle: 'normal', marginLeft: '1em' },
  '.cm-completionMatchedText': { color: 'var(--tp-accent)', textDecoration: 'none', fontWeight: '600' },
})

/** SQL colours from the theme, matching how the Studio colours SQL in each step. */
const sqlHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--tp-accent)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--tp-accent-2)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--tp-accent-2)' },
  { tag: tags.comment, color: 'var(--color-text-tertiary, #64748b)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--color-text-secondary, #94a3b8)' },
]))

/** A CodeMirror editor that knows the loaded tables, for autocomplete; Mod-Enter runs the query. */
function useSqlEditor(initialSql: string, tables: WorkbenchTable[], onRun: () => void) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const run = useRef(onRun)
  run.current = onRun

  useEffect(() => {
    if (!host.current)
      return
    // Each table completes by the name SQL uses, with its title beside it, and offers its columns.
    const schema = Object.fromEntries(tables.map(table => [table.id, {
      self: { label: table.id, apply: sqlName(table.id), type: 'type', detail: table.name },
      children: table.columns.map(column => ({ label: column, apply: sqlName(column), type: 'property', detail: table.name })),
    }]))
    view.current = new EditorView({
      doc: initialSql || starterSql(tables),
      parent: host.current,
      extensions: [
        basicSetup,
        sqlLanguage({ dialect: DuckDB, schema, defaultTable: tables.at(-1)?.id, upperCaseKeywords: true }),
        Prec.high(sqlHighlight),
        editorTheme,
        // Above the default keymap, which would otherwise take Mod-Enter for a blank line.
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => {
          run.current()
          return true
        } }])),
      ],
    })
    view.current.focus()
    return () => view.current?.destroy()
  // The editor is created once per opening; later table changes do not reset what the user typed.
  }, [])

  const getSql = () => view.current?.state.doc.toString() ?? ''
  const setSql = (text: string) => view.current?.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: text } })
  const insert = (text: string) => {
    const current = view.current
    if (!current)
      return
    current.dispatch(current.state.replaceSelection(text))
    current.focus()
  }
  return { host, getSql, setSql, insert }
}

/** The result's first rows, fetched from the Studio once the query has run. */
async function previewOf(datasetId: string): Promise<Row[]> {
  const res = await fetch(`/api/state?datasetId=${encodeURIComponent(datasetId)}`)
  const payload = await res.json().catch(() => ({})) as { rows?: Row[] }
  return (payload.rows ?? []).slice(0, PREVIEW_ROWS)
}

/** SQL formatted by SQLFluff on the server, or here when this machine has no SQLFluff. */
async function formatted(sql: string): Promise<{ sql: string, byFluff: boolean }> {
  const out = await postToStudio<{ sql: string | null }>('/api/studio/format', { sql }).catch(() => ({ sql: null }))
  return out.sql ? { sql: out.sql, byFluff: true } : { sql: formatSql(sql), byFluff: false }
}

interface TableListProps {
  tables: WorkbenchTable[]
  onInsert: (text: string) => void
  onStartFrom: (sql: string) => void
}

function TableList({ tables, onInsert, onStartFrom }: TableListProps) {
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
                  <pre><code>{table.sql}</code></pre>
                  <button type="button" className="tp-run-link" onClick={() => onStartFrom(table.sql!)}>Start from this SQL</button>
                </div>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function Preview({ rows, summary }: { rows: Row[], summary: string }) {
  const columns = Object.keys(rows[0] ?? {})
  return (
    <div className="tp-wb-preview">
      <p className="tp-studio-label">{summary}</p>
      {rows.length > 0 && (
        <div className="tp-wb-preview-scroll">
          <table>
            <thead>
              <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                // Preview rows have no id; their order is fixed for the life of this table.
                <tr key={index}>{columns.map(column => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function SqlWorkbench({ initialSql, fromStepId, tables, onClose, notify }: SqlWorkbenchProps) {
  const [name, setName] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ rows: Row[], summary: string } | null>(null)
  const [formatNote, setFormatNote] = useState('')
  // The editor's Mod-Enter calls whatever run is current.
  const runRef = useRef<() => void>(() => {})
  const editor = useSqlEditor(initialSql, tables, () => runRef.current())

  const run = useCallback(async () => {
    const query = editor.getSql().trim()
    if (!query || running)
      return
    setRunning(true)
    setError(null)
    try {
      const out = await postToStudio<{ datasetId: string, rows: number, truncated: boolean }>('/api/studio/query', { sql: query, name: name || undefined, fromStepId })
      const summary = `${out.rows.toLocaleString()} rows${out.truncated ? ', cut at the row limit' : ''} · open in the Studio as your step`
      setResult({ rows: await previewOf(out.datasetId), summary })
      notify(`${out.rows.toLocaleString()} rows`)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setRunning(false)
    }
  // The editor reads its text at run time; `editor` is stable for the life of the modal.
  }, [fromStepId, name, notify, running])
  runRef.current = () => void run()

  const format = useCallback(async () => {
    const out = await formatted(editor.getSql())
    editor.setSql(out.sql)
    setFormatNote(out.byFluff ? 'Formatted with SQLFluff' : 'Formatted here. Install SQLFluff (uv tool install sqlfluff) for its layout.')
  // `editor` is stable for the life of the modal.
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="tp-wb-overlay" role="dialog" aria-modal="true" aria-label="SQL workbench" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="tp-wb">
        <header className="tp-wb-head">
          <span className="tp-studio-label">SQL · DuckDB · read-only · runs on this machine</span>
          <button type="button" className="tp-studio-icon-btn" aria-label="Close the SQL workbench" onClick={onClose}>×</button>
        </header>
        <aside className="tp-wb-side">
          <p className="tp-studio-label">Tables</p>
          <TableList tables={tables} onInsert={editor.insert} onStartFrom={editor.setSql} />
        </aside>
        <div className="tp-wb-main">
          <div className="tp-wb-editor" ref={editor.host} />
          <p className="tp-wb-hint">{formatNote || 'Suggestions appear as you type, or press Ctrl-Space: tables, their columns and DuckDB functions.'}</p>
          {error && <div className="tp-studio-error" role="alert">{error}</div>}
          <div className="tp-studio-actions">
            <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={() => void format()}>Format</button>
            <input className="tp-studio-name" placeholder="Name the result (optional)" value={name} onChange={e => setName(e.target.value)} aria-label="Result name" />
            <button type="button" className="tp-studio-btn tp-studio-btn-primary" disabled={running} onClick={() => void run()}>
              {running ? 'Running…' : 'Run ⌘↵'}
            </button>
          </div>
          {result && <Preview rows={result.rows} summary={result.summary} />}
        </div>
      </div>
    </div>
  )
}
