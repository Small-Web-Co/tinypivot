import type { HistoryEntry } from '../src/history'
import type { StudioNote, StudioSnapshot, TraceStep } from '../src/studio-protocol'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postToStudio } from './companionApi'

/**
 * The Studio side panel: every data step the agent and the user took, with the reason and the
 * SQL behind it; an editor to change and rerun that SQL; and notes the agent gets with its next
 * TinyPivot reply.
 */

type StudioStep = StudioSnapshot['steps'][number]

interface StudioPanelProps {
  snapshot: StudioSnapshot
  /** Loaded datasets, which SQL can read by id. */
  tables: Array<{ id: string, name: string }>
  activeDatasetId: string
  notify: (message: string) => void
}

const TOOL_LABELS: Record<string, string> = {
  load_file: 'file',
  load_data: 'rows',
  query: 'sql',
  query_postgres: 'postgres',
  configure_pivot: 'pivot',
  configure_chart: 'chart',
  profile: 'profile',
  history: 'reopen',
  note: 'note',
}

const SQL_TOKEN = /('(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\b\d+(?:\.\d+)?\b|\b[a-z_]+\b)/gi
const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'group',
  'by',
  'order',
  'having',
  'limit',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'on',
  'as',
  'and',
  'or',
  'not',
  'in',
  'is',
  'null',
  'case',
  'when',
  'then',
  'else',
  'end',
  'with',
  'union',
  'all',
  'distinct',
  'desc',
  'asc',
  'cast',
  'over',
  'partition',
  'like',
  'between',
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'date_trunc',
  'strftime',
  'coalesce',
  'filter',
  'qualify',
  'using',
  'varchar',
  'interval',
])

function sqlTokenClass(token: string): string | undefined {
  if (token.startsWith('\''))
    return 'tp-sql-str'
  if (token.startsWith('"'))
    return 'tp-sql-ident'
  if (token.startsWith('--'))
    return 'tp-sql-comment'
  if (/^\d/.test(token))
    return 'tp-sql-num'
  return SQL_KEYWORDS.has(token.toLowerCase()) ? 'tp-sql-kw' : undefined
}

/** Light SQL colouring: keywords, strings, quoted names, numbers and comments. */
export function highlightSql(sql: string): React.ReactNode[] {
  return sql.split(SQL_TOKEN).map((part, index) => {
    const cls = index % 2 === 1 ? sqlTokenClass(part) : undefined
    return cls ? <span key={index} className={cls}>{part}</span> : part
  })
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function stepTitle(step: TraceStep): string {
  return step.why || step.datasetName || step.view || TOOL_LABELS[step.tool] || step.tool
}

/** A prompt the user can paste into any agent: the step, its SQL, and what they want changed. */
export function buildPrompt(note: string, step?: StudioStep): string {
  if (!step)
    return note
  const lines = [`About this TinyPivot step: "${stepTitle(step)}"${step.datasetName ? ` (${step.datasetName}, ${step.view ?? 'table'})` : ''}.`]
  if (step.editableSql)
    lines.push('', '```sql', step.editableSql, '```')
  lines.push('', note)
  return lines.join('\n')
}

interface StepRowProps {
  step: StudioStep
  selected: boolean
  active: boolean
  onSelect: () => void
  children?: React.ReactNode
}

function StepRow({ step, selected, active, onSelect, children }: StepRowProps) {
  const classes = ['tp-studio-step', `tp-studio-step-${step.actor}`, selected ? 'is-selected' : '', active ? 'is-active' : ''].filter(Boolean).join(' ')
  return (
    <li className={classes}>
      <button type="button" className="tp-studio-step-btn" onClick={onSelect} aria-expanded={selected}>
        <span className="tp-studio-dot" aria-hidden="true" />
        <span className="tp-studio-step-meta">
          <span className="tp-studio-tag">{TOOL_LABELS[step.tool] ?? step.tool}</span>
          <span>{step.actor === 'user' ? 'you' : 'agent'}</span>
          <span>{clockTime(step.at)}</span>
          {typeof step.rows === 'number' && <span>{`${step.rows.toLocaleString()} rows`}</span>}
        </span>
        <span className="tp-studio-step-why">{stepTitle(step)}</span>
        {step.view && step.tool !== 'note' && <span className="tp-studio-step-view">{step.view}</span>}
      </button>
      {selected && children}
    </li>
  )
}

interface StepDetailProps {
  step: StudioStep
  canOpen: boolean
  onOpen: () => void
  onEdit: () => void
  onAsk: () => void
}

function StepDetail({ step, canOpen, onOpen, onEdit, onAsk }: StepDetailProps) {
  return (
    <div className="tp-studio-detail">
      {step.file && (
        <div className="tp-studio-file" title={step.file}>
          <span className="tp-studio-label">file</span>
          {step.file}
        </div>
      )}
      {step.editableSql && (
        <pre className="tp-studio-sql"><code>{highlightSql(step.editableSql)}</code></pre>
      )}
      <div className="tp-studio-actions">
        {canOpen && <button type="button" className="tp-studio-btn" onClick={onOpen}>Open</button>}
        {step.editableSql && <button type="button" className="tp-studio-btn" onClick={onEdit}>Edit &amp; run SQL</button>}
        {step.tool !== 'note' && <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={onAsk}>Ask agent about this</button>}
      </div>
    </div>
  )
}

interface SqlEditorProps {
  initialSql: string
  /** The step being edited: its chart or pivot carries over to the result when it fits. */
  fromStepId?: string
  tables: Array<{ id: string, name: string }>
  onClose: () => void
  notify: (message: string) => void
}

function SqlEditor({ initialSql, fromStepId, tables, onClose, notify }: SqlEditorProps) {
  const [sql, setSql] = useState(initialSql)
  const [name, setName] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = useCallback(async () => {
    if (!sql.trim() || running)
      return
    setRunning(true)
    setError(null)
    try {
      const result = await postToStudio<{ rows: number, truncated: boolean }>('/api/studio/query', { sql, name: name || undefined, fromStepId })
      notify(`${result.rows.toLocaleString()} rows${result.truncated ? ' (cut at the row limit)' : ''}`)
      onClose()
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setRunning(false)
    }
  }, [fromStepId, name, notify, onClose, running, sql])

  const insertTable = (id: string) => setSql(prev => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${id}`)

  return (
    <div className="tp-studio-editor">
      <div className="tp-studio-editor-head">
        <span className="tp-studio-label">SQL · DuckDB · read-only</span>
        <button type="button" className="tp-studio-icon-btn" aria-label="Close editor" onClick={onClose}>×</button>
      </div>
      <textarea
        ref={inputRef}
        className="tp-studio-sql-input"
        value={sql}
        spellCheck={false}
        rows={8}
        aria-label="SQL"
        onChange={e => setSql(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void run()
          }
        }}
      />
      {tables.length > 0 && (
        <div className="tp-studio-tables">
          <span className="tp-studio-label">tables</span>
          {tables.map(table => (
            <button key={table.id} type="button" className="tp-studio-chip" title={`Insert ${table.id}`} onClick={() => insertTable(table.id)}>
              {table.name}
            </button>
          ))}
        </div>
      )}
      {error && <div className="tp-studio-error" role="alert">{error}</div>}
      <div className="tp-studio-actions">
        <input className="tp-studio-name" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} aria-label="Result name" />
        <button type="button" className="tp-studio-btn tp-studio-btn-primary" disabled={running || !sql.trim()} onClick={() => void run()}>
          {running ? 'Running…' : 'Run ⌘↵'}
        </button>
      </div>
    </div>
  )
}

interface NoteComposerProps {
  notes: StudioNote[]
  aboutStep?: StudioStep
  onDetach: () => void
  notify: (message: string) => void
  focusKey: number
}

function NoteComposer({ notes, aboutStep, onDetach, notify, focusKey }: NoteComposerProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (focusKey > 0)
      inputRef.current?.focus()
  }, [focusKey])

  const send = async () => {
    if (!text.trim())
      return
    try {
      await postToStudio('/api/studio/note', { text, stepId: aboutStep?.id })
      setText('')
      onDetach()
    }
    catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt(text.trim(), aboutStep))
      notify('Copied. Paste it into your agent.')
    }
    catch {
      notify('Could not copy to the clipboard.')
    }
  }

  return (
    <div className="tp-studio-composer">
      {notes.length > 0 && (
        <ul className="tp-studio-queue" aria-label="Notes waiting for the agent">
          {notes.map(note => (
            <li key={note.id}>
              <span>{note.text}</span>
              <button
                type="button"
                className="tp-studio-icon-btn"
                aria-label="Remove note"
                onClick={() => void postToStudio('/api/studio/note/delete', { id: note.id }).catch(() => {})}
              >
                ×
              </button>
            </li>
          ))}
          <li className="tp-studio-queue-hint">Sent with the agent&apos;s next TinyPivot reply. To send now, copy it as a prompt.</li>
        </ul>
      )}
      {aboutStep && (
        <div className="tp-studio-about">
          <span className="tp-studio-label">about</span>
          <span className="tp-studio-about-text">{stepTitle(aboutStep)}</span>
          <button type="button" className="tp-studio-icon-btn" aria-label="Detach from step" onClick={onDetach}>×</button>
        </div>
      )}
      <textarea
        ref={inputRef}
        className="tp-studio-note-input"
        placeholder="Tell the agent what to check, fix or try next…"
        value={text}
        rows={2}
        aria-label="Note for the agent"
        onChange={e => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void send()
          }
        }}
      />
      <div className="tp-studio-actions">
        <button type="button" className="tp-studio-btn tp-studio-btn-ghost" disabled={!text.trim()} onClick={() => void copy()}>Copy as prompt</button>
        <button type="button" className="tp-studio-btn tp-studio-btn-primary" disabled={!text.trim()} onClick={() => void send()}>Send to agent</button>
      </div>
    </div>
  )
}

function HistoryList({ entries, enabled, onOpen }: { entries: HistoryEntry[], enabled: boolean, onOpen: (id: string) => void }) {
  if (!enabled)
    return <p className="tp-studio-empty">History is off (TINYPIVOT_HISTORY=0).</p>
  if (entries.length === 0)
    return <p className="tp-studio-empty">Every table the agent pulls is saved here for 30 days.</p>
  return (
    <ul className="tp-studio-history">
      {entries.map(entry => (
        <li key={entry.id}>
          <button type="button" className="tp-studio-history-btn" onClick={() => onOpen(entry.id)} title={entry.source}>
            <span className="tp-studio-step-why">{entry.name}</span>
            <span className="tp-studio-step-meta">
              <span className="tp-studio-tag">{entry.kind}</span>
              <span>{`${entry.rows.toLocaleString()} rows`}</span>
              <span>{shortDate(entry.createdAt)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function useFollowLatest(count: number) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && pinned.current)
      el.scrollTop = el.scrollHeight
  }, [count])
  const onScroll = () => {
    const el = listRef.current
    if (el)
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }
  return { listRef, onScroll }
}

export function StudioPanel({ snapshot, tables, activeDatasetId, notify }: StudioPanelProps) {
  const [tab, setTab] = useState<'trace' | 'history'>('trace')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ sql: string, fromStepId?: string } | null>(null)
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const { listRef, onScroll } = useFollowLatest(snapshot.steps.length)

  const loaded = useMemo(() => new Set(snapshot.loadedIds), [snapshot.loadedIds])
  const aboutStep = snapshot.steps.find(step => step.id === aboutId)

  const post = useCallback(async (route: string, body: unknown) => {
    try {
      await postToStudio(route, body)
    }
    catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }, [notify])

  const canOpen = (step: StudioStep) => Boolean(step.datasetId && (loaded.has(step.datasetId) || step.historyId))

  return (
    <aside className="tp-studio" aria-label="TinyPivot Studio">
      <div className="tp-studio-head">
        <div className="tp-studio-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'trace'} className={tab === 'trace' ? 'active' : ''} onClick={() => setTab('trace')}>
            Trace
            <span className="tp-studio-count">{snapshot.steps.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            History
            <span className="tp-studio-count">{snapshot.history.length}</span>
          </button>
        </div>
        <button type="button" className="tp-studio-btn" onClick={() => setEditor({ sql: '' })}>New SQL</button>
      </div>

      {editor && (
        <SqlEditor
          key={editor.fromStepId ?? 'new'}
          initialSql={editor.sql}
          fromStepId={editor.fromStepId}
          tables={tables}
          onClose={() => setEditor(null)}
          notify={notify}
        />
      )}

      <div className="tp-studio-body" ref={listRef} onScroll={onScroll}>
        {tab === 'history'
          ? <HistoryList entries={snapshot.history} enabled={snapshot.historyEnabled} onOpen={id => void post('/api/studio/open', { id })} />
          : snapshot.steps.length === 0
            ? <p className="tp-studio-empty">Each step the agent takes shows up here, with why it took it and the SQL behind it.</p>
            : (
                <ol className="tp-studio-trace">
                  {snapshot.steps.map(step => (
                    <StepRow
                      key={step.id}
                      step={step}
                      selected={selectedId === step.id}
                      active={Boolean(step.datasetId) && step.datasetId === activeDatasetId}
                      onSelect={() => setSelectedId(prev => (prev === step.id ? null : step.id))}
                    >
                      <StepDetail
                        step={step}
                        canOpen={canOpen(step)}
                        onOpen={() => void post('/api/studio/show', { stepId: step.id })}
                        onEdit={() => setEditor({ sql: step.editableSql ?? '', fromStepId: step.id })}
                        onAsk={() => {
                          setAboutId(step.id)
                          setFocusKey(k => k + 1)
                        }}
                      />
                    </StepRow>
                  ))}
                </ol>
              )}
      </div>

      <NoteComposer notes={snapshot.notes} aboutStep={aboutStep} onDetach={() => setAboutId(null)} notify={notify} focusKey={focusKey} />
    </aside>
  )
}
