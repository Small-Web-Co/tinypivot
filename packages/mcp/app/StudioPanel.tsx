import type { HistoryEntry, SessionSummary } from '../src/history'
import type { Claim, NoteAttachment, StepCheck, StudioFile, StudioSnapshot } from '../src/studio-protocol'
import type { StudioRun, StudioStep } from './runs'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { groupRuns } from '../src/runs'
import { postToStudio, uploadToStudio } from './companionApi'
import { checkReport, claimSummary, lastStep, markClaims, runTitle } from './runs'

/**
 * The left-hand Agent History pane: clean Questions & Answers with verified numbers and clickable
 * output chips that jump the right-hand SQL, Chart/Pivot and Data Frame panes straight to any step.
 */

interface StudioPanelProps {
  snapshot: StudioSnapshot
  activeDatasetId: string
  activeStepId: string | null
  /** A row, pivot slice or view the user picked to send along. */
  attachment: NoteAttachment | null
  onAttachView?: () => void
  onClearAttachment: () => void
  notify: (message: string) => void
  /** A step's data is on its way: the buttons that open steps wait until it has arrived. */
  busy: boolean
  /** Jumps the workspace (SQL + Chart/Pivot + Data Frame) to a step. */
  onOpenStep: (step: StudioStep) => void
  /** Opens the inline SQL pane with a step's SQL loaded for editing. */
  onEditSql: (step: StudioStep) => void
  /** Expands the inline SQL pane with a fresh starter query. */
  onNewSql: () => void
  /** Reopens a saved pull from the History tab. */
  onOpenHistory: (id: string) => void
  /** Switches to another isolated saved session (zero bleed). */
  onSelectSession: (sessionId: string) => void
  /** Pins or unpins a session so it is exempt from 30-day automatic pruning. */
  onTogglePinSession: (sessionId: string, pinned: boolean) => void
  /** Which side of the Studio this panel is docked on. */
  agentSide: 'left' | 'right'
  /** Flip the Agent History panel between left and right sides. */
  onToggleAgentSide: () => void
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

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** A prompt the user can paste into any agent: the question, how it was answered so far, and what they want now. */
export function buildPrompt(note: string, run?: StudioRun, attachment?: NoteAttachment | null): string {
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

/**
 * Answer prose with bold and inline code, and each quoted number marked. The marks go inside the
 * Markdown, so a number in bold stays bold instead of breaking the bold markers apart.
 */
function answerProse(text: string, claims: Claim[]): React.ReactNode[] {
  const queue = [...claims]
  const mark = (part: string, key: number): React.ReactNode[] => {
    const here: Claim[] = []
    let rest = part
    while (queue.length > 0 && rest.includes(queue[0].text)) {
      rest = rest.slice(rest.indexOf(queue[0].text) + queue[0].text.length)
      here.push(queue.shift()!)
    }
    return markClaims(part, here).map((piece, index) => (typeof piece === 'string' ? piece : <ClaimMark key={`${key}-${index}`} claim={piece} />))
  }
  return text.split(INLINE_MARKDOWN).map((segment, index) => {
    if (index % 2 === 0)
      return <React.Fragment key={index}>{mark(segment, index)}</React.Fragment>
    return segment.startsWith('**')
      ? <strong key={index}>{mark(segment.slice(2, -2), index)}</strong>
      : <code key={index}>{segment.slice(1, -1)}</code>
  })
}

/** The agent's answer, each quoted number marked by whether the data backs it. */
export function AnswerText({ step }: { step: StudioStep }) {
  const claims = step.claims ?? []
  const summary = claims.length ? claimSummary(claims) : undefined
  return (
    <div className="tp-run-answer">
      <p>{answerProse(step.why ?? '', claims)}</p>
      {summary && summary.checked > 0 && (
        <span className={`tp-run-badge ${summary.found === summary.checked ? 'is-ok' : 'is-warn'}`}>{summary.text}</span>
      )}
    </div>
  )
}

interface RunCardProps {
  run: StudioRun
  open: boolean
  activeDatasetId: string
  activeStepId: string | null
  loaded: Set<string>
  checks: Record<string, StepCheck[]>
  checkTimes: Record<string, string>
  checking: boolean
  busy: boolean
  onSelect: () => void
  onOpenStep: (step: StudioStep) => void
  onEditSql: (step: StudioStep) => void
  onCheck: () => void
  onCopy: () => void
}

function runBadges(run: StudioRun, checks: Record<string, StepCheck[]>) {
  const answer = lastStep(run, step => step.tool === 'reply')
  const claims = answer?.claims ?? []
  const summary = claims.length ? claimSummary(claims) : undefined
  const results = run.steps.flatMap(step => checks[step.id] ?? [])
  return { answer, summary, checked: results.length > 0, allOk: results.every(check => check.ok) }
}

function outputKind(step: StudioStep): string {
  if (step.viewMode === 'pivot')
    return 'pivot'
  if (step.view && step.view !== 'table')
    return step.view.split(/\s+/)[0]
  return 'table'
}

/** The result of checking a question, at the top of what the user reads after pressing Check. */
export function CheckReport({ lines, at }: { lines: Array<{ ok: boolean, text: string }>, at: string }) {
  const allOk = lines.every(line => line.ok)
  const box = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [at])
  return (
    <div ref={box} className={`tp-run-report ${allOk ? 'is-ok' : 'is-warn'}`} role="status">
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

/** A clean Q&A card: question prompt, clickable output chips, verified answer, and check controls. */
function RunCard({ run, open, activeDatasetId, activeStepId, loaded, checks, checkTimes, checking, busy, onSelect, onOpenStep, onEditSql, onCheck, onCopy }: RunCardProps) {
  const { answer, summary, checked, allOk } = runBadges(run, checks)
  const outputSteps = run.steps.filter(step =>
    step.tool !== 'reply'
    && step.tool !== 'note'
    && step.tool !== 'profile'
    && Boolean(step.datasetId && (loaded.has(step.datasetId) || step.historyId)),
  )
  const sqlStep = lastStep(run, step => Boolean(step.editableSql))
  const fallbackNote = !answer ? lastStep(run, step => step.tool !== 'note' && Boolean(step.why))?.why : undefined
  const verifiable = run.steps.some(step => step.fingerprint || step.source)
  const checkedAt = checked ? checkTimes[run.id] : undefined

  return (
    <li className={`tp-run ${open ? 'is-open' : ''}`}>
      <button type="button" className="tp-run-head" aria-expanded={open} onClick={onSelect}>
        <span className={`tp-run-prompt ${run.prompt ? '' : 'is-missing'}`}>{renderInline(runTitle(run))}</span>
        <span className="tp-studio-step-meta">
          <span>{clockTime(run.at)}</span>
          <span>{run.askedIn === 'studio' ? 'asked here' : run.askedIn === 'terminal' ? 'asked in terminal' : 'session step'}</span>
          {outputSteps.length > 0 && <span>{`${outputSteps.length} view${outputSteps.length === 1 ? '' : 's'}`}</span>}
          {summary && summary.checked > 0 && <span className={summary.found === summary.checked ? 'tp-run-ok' : 'tp-run-warn'}>{`${summary.found}/${summary.checked} numbers`}</span>}
          {checked && <span className={allOk ? 'tp-run-ok' : 'tp-run-warn'}>{allOk ? 'reproduced' : 'check failed'}</span>}
        </span>
      </button>

      {open && (
        <div className="tp-run-body">
          {answer
            ? <AnswerText step={answer} />
            : fallbackNote && <p className="tp-run-why">{renderInline(fallbackNote)}</p>}

          {outputSteps.length > 0 && (
            <div className="tp-run-outputs" aria-label="Outputs for this question">
              {outputSteps.map((step) => {
                const isActive = activeStepId
                  ? step.id === activeStepId
                  : Boolean(step.datasetId && step.datasetId === activeDatasetId)
                return (
                  <button
                    key={step.id}
                    type="button"
                    disabled={busy}
                    className={`tp-run-output-chip ${isActive ? 'is-active' : ''}`}
                    title={`Show ${step.datasetName ?? 'output'} in SQL, Chart and Data Frame`}
                    onClick={() => onOpenStep(step)}
                  >
                    <span className="tp-studio-tag">{outputKind(step)}</span>
                    <span className="tp-run-output-name">{step.datasetName ?? step.why ?? 'View'}</span>
                    {typeof step.rows === 'number' && (
                      <span className="tp-run-output-rows">{step.rows.toLocaleString()}</span>
                    )}
                    {step.editedAt && <span className="tp-run-badge-mini is-edited">edited</span>}
                    {step.actor === 'user' && <span className="tp-run-by">you</span>}
                  </button>
                )
              })}
            </div>
          )}

          {checkedAt && <CheckReport lines={checkReport(run, checks)} at={checkedAt} />}

          <div className="tp-studio-actions">
            {sqlStep && (
              <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={() => onEditSql(sqlStep)}>
                Edit SQL
              </button>
            )}
            {verifiable && (
              <button type="button" className="tp-studio-btn" disabled={checking} onClick={onCheck} title="Check the sources are unchanged and the SQL gives the same rows again">
                {checking ? 'Checking…' : checkedAt ? 'Check again' : 'Check'}
              </button>
            )}
            <button type="button" className="tp-studio-btn tp-studio-btn-ghost" onClick={onCopy}>Copy</button>
          </div>
        </div>
      )}
    </li>
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
  aboutRun?: StudioRun
  attachment: NoteAttachment | null
  onAttachView?: () => void
  onClearAttachment: () => void
  onDetach: () => void
  notify: (message: string) => void
  focusKey: number
}

export function OfflineAgent({ agent, notify }: { agent: StudioSnapshot['agent'], notify: (message: string) => void }) {
  return (
    <div className="tp-studio-composer">
      <AgentStatus agent={agent} />
      <p className="tp-studio-offline">Ask follow-ups in your terminal. Copy on any question gives your agent its SQL and context.</p>
      {agent.hint && <AgentHintLine hint={agent.hint} notify={notify} />}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function useDroppedFiles(notify: (message: string) => void) {
  const [files, setFiles] = useState<StudioFile[]>([])
  const [dragging, setDragging] = useState(false)
  const add = useCallback(async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      try {
        const saved = await uploadToStudio(file)
        setFiles(prev => [...prev, saved])
      }
      catch (err) {
        notify(err instanceof Error ? err.message : String(err))
      }
    }
  }, [notify])
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files'))
        return
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length)
        return
      e.preventDefault()
      setDragging(false)
      void add(e.dataTransfer.files)
    },
  }
  const remove = (id: string) => setFiles(prev => prev.filter(file => file.id !== id))
  return { files, dragging, dropProps, add, remove, clear: () => setFiles([]) }
}

export function NoteComposer({ agent, aboutRun, attachment, onAttachView, onClearAttachment, onDetach, notify, focusKey }: NoteComposerProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const dropped = useDroppedFiles(notify)

  useEffect(() => {
    if (focusKey > 0)
      inputRef.current?.focus()
  }, [focusKey])

  const aboutStep = aboutRun && lastStep(aboutRun, step => Boolean(step.datasetId))
  const send = async () => {
    if (!text.trim())
      return
    try {
      await postToStudio('/api/studio/note', { text, stepId: aboutStep?.id, attachment: attachment ?? undefined, fileIds: dropped.files.map(file => file.id) })
      setText('')
      dropped.clear()
      onDetach()
      onClearAttachment()
      notify(`Sent to ${agent.name ?? 'your agent'}`)
    }
    catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={`tp-studio-composer ${dropped.dragging ? 'is-dropping' : ''}`} {...dropped.dropProps}>
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
      {dropped.files.length > 0 && (
        <ul className="tp-studio-files" aria-label="Files to send">
          {dropped.files.map(file => (
            <li key={file.id} title={file.path}>
              <span className="tp-studio-label">{file.kind}</span>
              <span className="tp-studio-about-text">{file.name}</span>
              <span className="tp-studio-file-size">{formatBytes(file.bytes)}</span>
              <button type="button" className="tp-studio-icon-btn" aria-label={`Remove ${file.name}`} onClick={() => dropped.remove(file.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={inputRef}
        className="tp-studio-note-input"
        placeholder="Ask the agent what to check, slice or try next. Drop files or paste images. Enter sends."
        value={text}
        rows={2}
        aria-label="Message for the agent"
        onChange={e => setText(e.target.value)}
        onPaste={(e) => {
          if (e.clipboardData.files.length === 0)
            return
          e.preventDefault()
          void dropped.add(e.clipboardData.files)
        }}
        onKeyDown={(e) => {
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

function SessionsList({
  sessions,
  activeSessionId,
  liveSessionId,
  onSelect,
  onTogglePin,
}: {
  sessions: SessionSummary[]
  activeSessionId: string
  liveSessionId: string | null
  onSelect: (sessionId: string) => void
  onTogglePin: (sessionId: string, pinned: boolean) => void
}) {
  if (sessions.length === 0)
    return <p className="tp-studio-empty">Each conversation is saved locally in isolation. Pin important sessions to keep them forever.</p>
  return (
    <ul className="tp-studio-history">
      {sessions.map((session) => {
        const isCurrent = session.id === activeSessionId
        const isLive = session.id === liveSessionId
        return (
          <li key={session.id} className={`tp-session-row ${isCurrent ? 'is-current' : ''}`}>
            <button
              type="button"
              className="tp-studio-history-btn tp-session-btn"
              onClick={() => onSelect(session.id)}
              title={`Open isolated session ${session.id}`}
            >
              <span className="tp-studio-step-why">{session.title}</span>
              <span className="tp-studio-step-meta">
                {isLive && <span className="tp-studio-tag">LIVE</span>}
                {isCurrent && !isLive && <span className="tp-studio-tag">VIEWING</span>}
                <span>{`${session.turns} turn${session.turns === 1 ? '' : 's'}`}</span>
                <span>{`${session.outputs} view${session.outputs === 1 ? '' : 's'}`}</span>
                <span>{shortDate(session.updatedAt)}</span>
              </span>
            </button>
            <button
              type="button"
              className={`tp-session-pin-btn ${session.pinned ? 'is-pinned' : ''}`}
              aria-label={session.pinned ? `Unpin ${session.title}` : `Pin ${session.title} to keep forever`}
              title={session.pinned ? 'Pinned (kept forever) — click to unpin' : 'Pin session to keep forever (exempt from 30-day cleanup)'}
              onClick={() => onTogglePin(session.id, !session.pinned)}
            >
              {session.pinned ? '★' : '☆'}
            </button>
          </li>
        )
      })}
    </ul>
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

export function useChecks(notify: (message: string) => void, sessionId?: string) {
  const [checks, setChecks] = useState<Record<string, StepCheck[]>>({})
  const [checkTimes, setCheckTimes] = useState<Record<string, string>>({})
  const [checking, setChecking] = useState<string | null>(null)
  const check = useCallback(async (run: StudioRun) => {
    setChecking(run.id)
    try {
      for (const step of run.steps.filter(s => s.fingerprint || s.source)) {
        const result = await postToStudio<{ checks: StepCheck[] }>('/api/studio/verify', { stepId: step.id, sessionId })
        setChecks(prev => ({ ...prev, [step.id]: result.checks }))
      }
      setCheckTimes(prev => ({ ...prev, [run.id]: new Date().toISOString() }))
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      notify(/not found/i.test(message) ? 'This Studio\'s server is from an older TinyPivot. Restart your agent to check answers.' : message)
    }
    finally {
      setChecking(null)
    }
  }, [notify, sessionId])
  return { checks, checkTimes, checking, check }
}

export function StudioPanel({
  snapshot,
  activeDatasetId,
  activeStepId,
  attachment,
  onAttachView,
  onClearAttachment,
  notify,
  busy,
  onOpenStep,
  onEditSql,
  onNewSql,
  onOpenHistory,
  onSelectSession,
  onTogglePinSession,
  agentSide,
  onToggleAgentSide,
}: StudioPanelProps) {
  const [tab, setTab] = useState<'questions' | 'sessions' | 'history'>('questions')
  const runs = useMemo(() => groupRuns(snapshot.steps), [snapshot.steps])
  const [openId, setOpenId] = useState<string | null>(null)
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  const { listRef, onScroll } = useFollowLatest(snapshot.steps.length)
  const { checks, checkTimes, checking, check } = useChecks(notify, snapshot.sessionId)

  const loaded = useMemo(() => new Set(snapshot.loadedIds), [snapshot.loadedIds])
  const isLiveSession = Boolean(snapshot.liveSessionId && snapshot.sessionId === snapshot.liveSessionId)
  const live = isLiveSession && snapshot.agent.live.length > 0
  // Follow the run containing the active step if user stepped through outputs; otherwise open newest.
  const runForActiveStep = activeStepId ? runs.find(r => r.steps.some(s => s.id === activeStepId))?.id : undefined
  const shownId = openId ?? runForActiveStep ?? runs.at(-1)?.id
  const aboutRun = runs.find(run => run.id === aboutId)

  return (
    <aside className="tp-studio" aria-label="Agent history">
      <div className="tp-studio-head">
        <div className="tp-studio-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'active' : ''} onClick={() => setTab('questions')}>
            Agent
            <span className="tp-studio-count">{runs.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>
            Sessions
            <span className="tp-studio-count">{snapshot.sessions.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            Pulls
            <span className="tp-studio-count">{snapshot.history.length}</span>
          </button>
        </div>
        <div className="tp-studio-head-actions">
          <button
            type="button"
            className="tp-ws-move-btn"
            title={agentSide === 'left' ? 'Dock Agent pane on the right' : 'Dock Agent pane on the left'}
            aria-label={agentSide === 'left' ? 'Dock Agent pane on the right' : 'Dock Agent pane on the left'}
            onClick={onToggleAgentSide}
          >
            ⇄
          </button>
          <button type="button" className="tp-studio-btn" onClick={onNewSql}>New SQL</button>
        </div>
      </div>

      <div className="tp-studio-body" ref={listRef} onScroll={onScroll}>
        {tab === 'sessions'
          ? (
              <SessionsList
                sessions={snapshot.sessions}
                activeSessionId={snapshot.sessionId}
                liveSessionId={snapshot.liveSessionId}
                onSelect={(sid) => {
                  onSelectSession(sid)
                  setTab('questions')
                }}
                onTogglePin={onTogglePinSession}
              />
            )
          : tab === 'history'
            ? (
                <HistoryList
                  entries={snapshot.history}
                  enabled={snapshot.historyEnabled}
                  onOpen={onOpenHistory}
                />
              )
            : runs.length === 0
              ? <p className="tp-studio-empty">Each question you ask your agent and its verified answer appear here. SQL, charts and data frames stay synced on the right.</p>
              : (
                  <ol className="tp-runs">
                    {runs.map(run => (
                      <RunCard
                        key={run.id}
                        run={run}
                        open={run.id === shownId}
                        activeDatasetId={activeDatasetId}
                        activeStepId={activeStepId}
                        loaded={loaded}
                        checks={checks}
                        checkTimes={checkTimes}
                        checking={checking === run.id}
                        busy={busy}
                        onSelect={() => {
                          const willOpen = run.id !== shownId
                          setOpenId(willOpen ? run.id : '')
                          if (willOpen) {
                            const latestView = lastStep(run, s => Boolean(s.datasetId && (loaded.has(s.datasetId) || s.historyId) && s.tool !== 'reply' && s.tool !== 'note' && s.tool !== 'profile'))
                            if (latestView)
                              onOpenStep(latestView)
                          }
                        }}
                        onOpenStep={onOpenStep}
                        onEditSql={onEditSql}
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

      {!isLiveSession
        ? (
            <div className="tp-studio-composer">
              <p className="tp-studio-offline">
                Viewing isolated saved session
                {' '}
                <code>{snapshot.sessionId}</code>
                . SQL edits stay inside this session and never bleed into other sessions.
              </p>
              {snapshot.liveSessionId && (
                <div className="tp-studio-actions">
                  <button type="button" className="tp-studio-btn tp-studio-btn-primary" onClick={() => onSelectSession(snapshot.liveSessionId!)}>
                    Return to live session
                  </button>
                </div>
              )}
            </div>
          )
        : live
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
