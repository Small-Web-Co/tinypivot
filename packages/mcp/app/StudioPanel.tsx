import type { HistoryEntry } from '../src/history'
import type { Claim, NoteAttachment, StepCheck, StudioSnapshot } from '../src/studio-protocol'
import type { Run, StudioStep } from './runs'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postToStudio } from './companionApi'
import { checkReport, claimSummary, groupRuns, lastStep, markClaims, runTitle, stageOf } from './runs'

/**
 * The Studio side panel reads the trace as questions. Each one shows what was asked, then how the
 * answer was made, step by step: the source and its rows, the SQL, the chart or pivot, and the
 * agent's answer with each number it quotes marked by whether the data backs it. A question can be
 * re-checked: the source file unchanged, the SQL giving the same rows again. Messages go back to
 * the agent only where it can take them live; elsewhere the user asks in their terminal.
 */

interface StudioPanelProps {
  snapshot: StudioSnapshot
  /** Loaded datasets, which SQL can read by id. */
  tables: Array<{ id: string, name: string }>
  activeDatasetId: string
  /** A row, pivot slice or view the user picked to send along. */
  attachment: NoteAttachment | null
  onAttachView?: () => void
  onClearAttachment: () => void
  notify: (message: string) => void
}

const STAGE_LABELS: Record<ReturnType<typeof stageOf>, string> = {
  source: 'source',
  transform: 'sql',
  view: 'view',
  answer: 'answer',
  message: 'message',
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

const INLINE_MARKDOWN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

/** Bold and inline code, the Markdown agents use most in short replies; the rest stays as written. */
export function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE_MARKDOWN).map((part, index) => {
    if (index % 2 === 0)
      return part
    return part.startsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <code key={index}>{part.slice(1, -1)}</code>
  })
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fileName(file: string): string {
  return file.split(/[\\/]/).pop() || file
}

function sourceText(step: StudioStep): string {
  if (step.file)
    return fileName(step.file)
  if (step.tool === 'load_data')
    return 'Rows passed in by the agent'
  if (step.tool === 'query_postgres')
    return 'Postgres'
  if (step.tool === 'history')
    return 'A saved pull, reopened'
  return step.datasetName ?? 'Data'
}

function resultText(step: StudioStep): string | undefined {
  if (typeof step.rows !== 'number')
    return undefined
  const columns = step.columns?.length ? ` × ${step.columns.length} columns` : ''
  return `${step.rows.toLocaleString()} rows${columns}`
}

/** A prompt the user can paste into any agent: the question, how it was answered so far, and what they want now. */
export function buildPrompt(note: string, run?: Run, attachment?: NoteAttachment | null): string {
  const lines: string[] = []
  if (run) {
    lines.push(`About this TinyPivot question: "${runTitle(run)}".`)
    const sql = lastStep(run, step => Boolean(step.editableSql))?.editableSql
    if (sql)
      lines.push('', '```sql', sql, '```')
  }
  if (attachment)
    lines.push(...(lines.length ? [''] : []), `Attached from TinyPivot (${attachment.label}):`, attachment.text)
  if (note)
    lines.push(...(lines.length ? [''] : []), note)
  return lines.join('\n')
}

async function copyText(text: string, notify: (message: string) => void, done = 'Copied.') {
  try {
    await navigator.clipboard.writeText(text)
    notify(done)
  }
  catch {
    notify('Could not copy to the clipboard.')
  }
}

function ClaimMark({ claim }: { claim: Claim }) {
  const title = claim.status === 'found'
    ? `In the data: ${claim.where}`
    : claim.status === 'unchecked' ? 'A rate or change: not checked against the data' : 'Not found in the data this question used'
  return <mark className={`tp-claim tp-claim-${claim.status}`} title={title}>{claim.text}</mark>
}

/** The agent's answer, each quoted number marked by whether the data backs it. */
function AnswerText({ step }: { step: StudioStep }) {
  const claims = step.claims ?? []
  const summary = claims.length ? claimSummary(claims) : undefined
  return (
    <div className="tp-run-answer">
      <p>
        {markClaims(step.why ?? '', claims).map((part, index) =>
          typeof part === 'string' ? <React.Fragment key={index}>{renderInline(part)}</React.Fragment> : <ClaimMark key={index} claim={part} />,
        )}
      </p>
      {summary && summary.checked > 0 && (
        <span className={`tp-run-badge ${summary.found === summary.checked ? 'is-ok' : 'is-warn'}`}>{summary.text}</span>
      )}
    </div>
  )
}

function CheckList({ checks }: { checks?: StepCheck[] }) {
  if (!checks?.length)
    return null
  return (
    <ul className="tp-run-checks">
      {checks.map(check => (
        <li key={check.kind} className={check.ok ? 'is-ok' : 'is-warn'}>
          <span aria-hidden="true">{check.ok ? '✓' : '!'}</span>
          {check.detail}
        </li>
      ))}
    </ul>
  )
}

interface StageProps {
  step: StudioStep
  index: number
  active: boolean
  canOpen: boolean
  checks?: StepCheck[]
  onOpen: (viewMode?: 'grid') => void
  onEdit: () => void
}

/** One step on the way to the answer: what it read or did, why, and what came out. */
function Stage({ step, index, active, canOpen, checks, onOpen, onEdit }: StageProps) {
  const stage = stageOf(step)
  const [showSql, setShowSql] = useState(false)
  const result = resultText(step)
  const sql = step.editableSql
  return (
    <li className={`tp-run-stage tp-run-stage-${stage} ${active ? 'is-active' : ''}`}>
      <span className="tp-run-num" aria-hidden="true">{index}</span>
      <div className="tp-run-stage-body">
        <div className="tp-run-stage-head">
          <span className="tp-studio-tag">{STAGE_LABELS[stage]}</span>
          {stage === 'source' && <span className="tp-run-source" title={step.file ?? step.sql}>{sourceText(step)}</span>}
          {stage === 'view' && <span className="tp-run-source">{step.view}</span>}
          {step.actor === 'user' && <span className="tp-run-by">you</span>}
        </div>
        {stage === 'answer' ? <AnswerText step={step} /> : step.why && <p className="tp-run-why">{renderInline(step.why)}</p>}
        {sql && stage !== 'view' && (
          showSql
            ? <pre className="tp-studio-sql"><code>{highlightSql(sql)}</code></pre>
            : <button type="button" className="tp-run-sql-line" onClick={() => setShowSql(true)} title="Show the SQL">{sql.replace(/\s+/g, ' ')}</button>
        )}
        {(result || canOpen) && stage !== 'answer' && (
          <div className="tp-run-result">
            {result && <span>{result}</span>}
            {canOpen && <button type="button" className="tp-run-link" onClick={() => onOpen('grid')}>Rows</button>}
            {canOpen && step.view && step.view !== 'table' && <button type="button" className="tp-run-link" onClick={() => onOpen()}>{step.viewMode === 'pivot' ? 'Pivot' : 'Chart'}</button>}
            {sql && <button type="button" className="tp-run-link" onClick={onEdit}>Edit SQL</button>}
          </div>
        )}
        <CheckList checks={checks} />
      </div>
    </li>
  )
}

interface RunCardProps {
  run: Run
  open: boolean
  activeDatasetId: string
  loaded: Set<string>
  checks: Record<string, StepCheck[]>
  /** When each question was last checked, by run id. */
  checkTimes: Record<string, string>
  checking: boolean
  onToggle: () => void
  onOpenStep: (step: StudioStep, viewMode?: 'grid') => void
  onEdit: (step: StudioStep) => void
  onCheck: () => void
  onCopy: () => void
}

function runBadges(run: Run, checks: Record<string, StepCheck[]>) {
  const answer = lastStep(run, step => step.tool === 'reply')
  const claims = answer?.claims ?? []
  const summary = claims.length ? claimSummary(claims) : undefined
  const results = run.steps.flatMap(step => checks[step.id] ?? [])
  return { summary, checked: results.length > 0, allOk: results.every(check => check.ok) }
}

/** The result of checking a question, at the top of what the user reads after pressing Check. */
function CheckReport({ lines, at }: { lines: Array<{ ok: boolean, text: string }>, at: string }) {
  const allOk = lines.every(line => line.ok)
  return (
    <div className={`tp-run-report ${allOk ? 'is-ok' : 'is-warn'}`} role="status">
      <p className="tp-run-report-head">{`${allOk ? 'Checked' : 'Check found problems'} · ${clockTime(at)}`}</p>
      {lines.length === 0
        ? <p>Nothing in this question could be checked: it has no source file, SQL or numbers to compare.</p>
        : (
            <ul>
              {lines.map(line => (
                <li key={line.text} className={line.ok ? 'is-ok' : 'is-warn'}>
                  <span aria-hidden="true">{line.ok ? '✓' : '!'}</span>
                  {line.text}
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}

/** A question and, when open, every step that answered it. */
function RunCard({ run, open, activeDatasetId, loaded, checks, checkTimes, checking, onToggle, onOpenStep, onEdit, onCheck, onCopy }: RunCardProps) {
  const stages = run.steps.filter(step => step.tool !== 'note')
  const { summary, checked, allOk } = runBadges(run, checks)
  const verifiable = run.steps.some(step => step.fingerprint || step.source)
  const checkedAt = checked ? checkTimes[run.id] : undefined
  return (
    <li className={`tp-run ${open ? 'is-open' : ''}`}>
      <button type="button" className="tp-run-head" aria-expanded={open} onClick={onToggle}>
        <span className={`tp-run-prompt ${run.prompt ? '' : 'is-missing'}`}>{renderInline(runTitle(run))}</span>
        <span className="tp-studio-step-meta">
          <span>{clockTime(run.at)}</span>
          <span>{run.askedIn === 'studio' ? 'asked here' : run.askedIn === 'terminal' ? 'asked in the terminal' : 'question not recorded'}</span>
          <span>{`${stages.length} step${stages.length === 1 ? '' : 's'}`}</span>
          {summary && summary.checked > 0 && <span className={summary.found === summary.checked ? 'tp-run-ok' : 'tp-run-warn'}>{`${summary.found}/${summary.checked} numbers`}</span>}
          {checked && <span className={allOk ? 'tp-run-ok' : 'tp-run-warn'}>{allOk ? 'reproduced' : 'check failed'}</span>}
        </span>
      </button>
      {open && (
        <div className="tp-run-body">
          <ol className="tp-run-stages">
            {stages.map((step, index) => (
              <Stage
                key={step.id}
                step={step}
                index={index + 1}
                active={Boolean(step.datasetId) && step.datasetId === activeDatasetId}
                canOpen={Boolean(step.datasetId && (loaded.has(step.datasetId) || step.historyId))}
                checks={checks[step.id]}
                onOpen={viewMode => onOpenStep(step, viewMode)}
                onEdit={() => onEdit(step)}
              />
            ))}
          </ol>
          {checkedAt && <CheckReport lines={checkReport(run, checks)} at={checkedAt} />}
          <div className="tp-studio-actions">
            {verifiable && (
              <button type="button" className="tp-studio-btn" disabled={checking} onClick={onCheck} title="Check the sources are unchanged and the SQL gives the same rows again">
                {checking ? 'Checking…' : checkedAt ? 'Check again' : 'Check this answer'}
              </button>
            )}
            <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={onCopy}>Copy for terminal</button>
          </div>
        </div>
      )}
    </li>
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

/** How to make the agent take messages live, with the command to copy when there is one. */
function AgentHintLine({ hint, notify }: { hint: NonNullable<StudioSnapshot['agent']['hint']>, notify: (message: string) => void }) {
  return (
    <span className="tp-studio-agent-tip">
      {hint.text}
      {hint.command && (
        <span className="tp-studio-agent-command">
          <code>{hint.command}</code>
          <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={() => void copyText(hint.command!, notify, 'Copied. Run it in your terminal.')}>Copy</button>
        </span>
      )}
    </span>
  )
}

function AgentStatus({ agent }: { agent: StudioSnapshot['agent'] }) {
  const name = agent.name ?? 'Your agent'
  const live = agent.live.length > 0
  return (
    <div className={`tp-studio-agent ${live ? 'is-live' : ''} ${agent.busy ? 'is-busy' : ''}`} title={live ? `Connected through ${agent.live.join(', ')}` : undefined}>
      <span className="tp-studio-agent-dot" aria-hidden="true" />
      <span>
        <strong>{name}</strong>
        {agent.busy ? ' is working…' : live ? ' · live: messages start a turn now' : ' · cannot take messages from the Studio'}
      </span>
    </div>
  )
}

interface NoteComposerProps {
  agent: StudioSnapshot['agent']
  aboutRun?: Run
  attachment: NoteAttachment | null
  onAttachView?: () => void
  onClearAttachment: () => void
  onDetach: () => void
  notify: (message: string) => void
  focusKey: number
}

/** Shown when the agent cannot take messages: ask in the terminal, and how to make it live where possible. */
function OfflineAgent({ agent, notify }: { agent: StudioSnapshot['agent'], notify: (message: string) => void }) {
  return (
    <div className="tp-studio-composer">
      <AgentStatus agent={agent} />
      <p className="tp-studio-offline">Ask follow-ups in your terminal. Copy for terminal on any question gives your agent its steps and SQL.</p>
      {agent.hint && <AgentHintLine hint={agent.hint} notify={notify} />}
    </div>
  )
}

function NoteComposer({ agent, aboutRun, attachment, onAttachView, onClearAttachment, onDetach, notify, focusKey }: NoteComposerProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (focusKey > 0)
      inputRef.current?.focus()
  }, [focusKey])

  const aboutStep = aboutRun && lastStep(aboutRun, step => Boolean(step.datasetId))
  const send = async () => {
    if (!text.trim())
      return
    try {
      await postToStudio('/api/studio/note', { text, stepId: aboutStep?.id, attachment: attachment ?? undefined })
      setText('')
      onDetach()
      onClearAttachment()
      notify(`Sent to ${agent.name ?? 'your agent'}`)
    }
    catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="tp-studio-composer">
      <AgentStatus agent={agent} />
      {aboutRun && (
        <div className="tp-studio-about">
          <span className="tp-studio-label">about</span>
          <span className="tp-studio-about-text">{runTitle(aboutRun)}</span>
          <button type="button" className="tp-studio-icon-btn" aria-label="Detach from question" onClick={onDetach}>×</button>
        </div>
      )}
      {attachment
        ? (
            <div className="tp-studio-about tp-studio-attachment">
              <span className="tp-studio-label">data</span>
              <span className="tp-studio-about-text" title={attachment.text}>{attachment.label}</span>
              <button type="button" className="tp-studio-icon-btn" aria-label="Remove attached data" onClick={onClearAttachment}>×</button>
            </div>
          )
        : onAttachView && (
          <button type="button" className="tp-studio-attach-btn" onClick={onAttachView}>
            + Attach the current view (or click a row or pivot cell)
          </button>
        )}
      <textarea
        ref={inputRef}
        className="tp-studio-note-input"
        placeholder="Tell the agent what to check, fix or try next. Enter sends, Shift+Enter adds a line."
        value={text}
        rows={2}
        aria-label="Message for the agent"
        onChange={e => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter, and Enter while an IME is composing, stay in the text.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
      />
      <div className="tp-studio-actions">
        <button type="button" className="tp-studio-btn tp-studio-btn-primary" disabled={!text.trim()} onClick={() => void send()}>
          {`Send to ${agent.name ?? 'agent'}`}
        </button>
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

/** Verifies every step of a question that can be checked, one after another. */
function useChecks(notify: (message: string) => void) {
  const [checks, setChecks] = useState<Record<string, StepCheck[]>>({})
  const [checkTimes, setCheckTimes] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState<string | null>(null)
  const check = useCallback(async (run: Run) => {
    setChecking(run.id)
    try {
      for (const step of run.steps.filter(s => s.fingerprint || s.source)) {
        const result = await postToStudio<{ checks: StepCheck[] }>('/api/studio/verify', { stepId: step.id })
        setChecks(prev => ({ ...prev, [step.id]: result.checks }))
      }
      setCheckTimes(prev => ({ ...prev, [run.id]: new Date().toISOString() }))
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // An agent started before this version keeps its older server, which has no check to run.
      notify(/not found/i.test(message) ? 'This Studio\'s server is from an older TinyPivot. Restart your agent to check answers.' : message)
    }
    finally {
      setChecking(null)
    }
  }, [notify])
  return { checks, checkTimes, checking, check }
}

export function StudioPanel({ snapshot, tables, activeDatasetId, attachment, onAttachView, onClearAttachment, notify }: StudioPanelProps) {
  const [tab, setTab] = useState<'questions' | 'history'>('questions')
  const runs = useMemo(() => groupRuns(snapshot.steps), [snapshot.steps])
  const [openId, setOpenId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ sql: string, fromStepId?: string } | null>(null)
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const { listRef, onScroll } = useFollowLatest(snapshot.steps.length)
  const { checks, checkTimes, checking, check } = useChecks(notify)

  const loaded = useMemo(() => new Set(snapshot.loadedIds), [snapshot.loadedIds])
  const live = snapshot.agent.live.length > 0
  // The newest question stays open until the user picks another.
  const shownId = openId ?? runs.at(-1)?.id
  const aboutRun = runs.find(run => run.id === aboutId)

  const post = useCallback(async (route: string, body: unknown) => {
    try {
      await postToStudio(route, body)
    }
    catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }, [notify])

  return (
    <aside className="tp-studio" aria-label="TinyPivot Studio">
      <div className="tp-studio-head">
        <div className="tp-studio-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>
            Questions
            <span className="tp-studio-count">{runs.length}</span>
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
          : runs.length === 0
            ? <p className="tp-studio-empty">Each question you ask your agent shows up here: where the data came from, the SQL, the rows, the chart, and the answer, with its numbers checked against the data.</p>
            : (
                <ol className="tp-runs">
                  {runs.map(run => (
                    <RunCard
                      key={run.id}
                      run={run}
                      open={run.id === shownId}
                      activeDatasetId={activeDatasetId}
                      loaded={loaded}
                      checks={checks}
                      checkTimes={checkTimes}
                      checking={checking === run.id}
                      onToggle={() => setOpenId(run.id === shownId ? '' : run.id)}
                      onOpenStep={(step, viewMode) => void post('/api/studio/show', { stepId: step.id, viewMode })}
                      onEdit={step => setEditor({ sql: step.editableSql ?? '', fromStepId: step.id })}
                      onCheck={() => void check(run)}
                      onCopy={() => {
                        if (live) {
                          setAboutId(run.id)
                          setFocusKey(k => k + 1)
                        }
                        void copyText(buildPrompt('', run), notify, 'Copied. Paste it into your agent.')
                      }}
                    />
                  ))}
                </ol>
              )}
      </div>

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
    </aside>
  )
}
