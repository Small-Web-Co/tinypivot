/**
 * The scenes shown in the homepage reel. Terminal scenes replay a recording from
 * /reel/<id>.json; a scene with `shots` plays product screenshots instead.
 */
import type { RecordingCaption } from './player'

export interface ReelScene {
  id: string
  /** Tab label: the harness the session was recorded in. */
  harness: string
  headline: string
  detail: string
  /** Two measured numbers from the session, shown beside the caption. */
  stats: ReelStat[]
  /** Screenshots to play in place of a terminal recording. */
  shots?: ReelShot[]
}

/** One screenshot in a scene, with the caption shown while it is up. */
export interface ReelShot {
  src: string
  alt: string
  title: string
  body: string
  /** How long it stays on screen, in milliseconds. */
  hold: number
}

export interface ReelStat {
  value: number
  label: string
  prefix?: string
}

const ROWS_ON_DISK = 44714

/** Display names of the TinyPivot themes a recording can be shown in (scripts/reel/ansi.mjs). */
const THEME_NAMES: Record<string, string> = {
  'crt-amber': 'Amber CRT',
  'crt-green': 'Green CRT',
  'paper': 'Paper',
  'greenbar': 'Greenbar',
  'onebit': '1-Bit',
}

/** "Paper theme" for a recording's theme id; empty when the recording names none. */
export function themeLabel(id: string | undefined): string {
  return id && THEME_NAMES[id] ? `${THEME_NAMES[id]} theme` : ''
}

export const reelScenes: ReelScene[] = [
  {
    id: 'studio-pi',
    harness: 'pi + Studio',
    headline: 'The terminal and the Studio, talking to each other.',
    detail: 'pi works the data in the terminal. Every step shows up in the Studio, where you send the data back with a comment, and pi answers in the trace.',
    stats: [
      { value: 2, label: 'questions sent from the Studio, both answered by pi' },
      { value: ROWS_ON_DISK, label: 'rows queried on your machine' },
    ],
  },
  {
    id: 'claude-code',
    harness: 'Claude Code',
    headline: 'Ask in the terminal. The chart prints in the reply.',
    detail: '44,714 orders stay on disk. Claude reads a summary of about 540 tokens and still finds the bad month.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows read on your machine' },
      { value: 540, prefix: '~', label: 'tokens sent to the model' },
    ],
  },
  {
    id: 'pi',
    harness: 'pi',
    headline: 'A local model gets the same charts.',
    detail: 'The arithmetic happens in TinyPivot, so a small model on your own hardware reports exact totals.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows aggregated locally' },
      { value: 0, label: 'rows in the model context' },
    ],
  },
  {
    id: 'opencode',
    harness: 'OpenCode',
    headline: 'One install, every harness.',
    detail: 'The same MCP server answers in OpenCode, with bar charts and pivot tables in the conversation.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows read on your machine' },
      { value: 2, label: 'questions, each one tool call' },
    ],
  },
  {
    id: 'antigravity',
    harness: 'Antigravity',
    headline: 'Works in Antigravity too.',
    detail: 'The agent asks permission, calls TinyPivot once, and the chart is in the reply.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows read on your machine' },
      { value: 2, label: 'tool calls you approved' },
    ],
  },
  {
    id: 'studio',
    harness: 'Studio',
    headline: 'Every step the agent took, with the SQL behind it.',
    detail: 'The first TinyPivot step opens the Studio in your browser. It follows the session live: the agent\'s reasons, its SQL, your edits and your notes back.',
    stats: [
      { value: 7, label: 'steps in the trace, 2 of them yours' },
      { value: ROWS_ON_DISK, label: 'rows queried on your machine' },
    ],
    shots: [
      {
        src: '/reel/studio/trace.jpg',
        alt: 'TinyPivot Studio: a trace of the agent\'s steps beside a line chart of monthly revenue, with the SQL behind the selected step.',
        title: 'Why, what and how, for each step',
        body: 'Each step carries the agent\'s reason, what it shows and the exact SQL. Open one to see the data as it was then.',
        hold: 4600,
      },
      {
        src: '/reel/studio/edit.jpg',
        alt: 'The Studio SQL editor with the step\'s query, edited to leave out the Partner channel.',
        title: 'Disagree? Edit the SQL',
        body: 'Change the agent\'s query and run it yourself with DuckDB, read-only, on your machine.',
        hold: 4200,
      },
      {
        src: '/reel/studio/rerun.jpg',
        alt: 'The rerun query in the trace as the user\'s step, keeping the line chart.',
        title: 'Your step joins the trace',
        body: 'The result keeps the step\'s chart and is marked as yours, so the agent and you share one record.',
        hold: 4200,
      },
      {
        src: '/reel/studio/pivot.jpg',
        alt: 'A pivot table of 2026 revenue by region and channel, opened from an earlier step.',
        title: 'Go back to any step',
        body: 'A later step turned this pivot into a chart. Opening the step shows the pivot again, exactly as the agent made it.',
        hold: 4200,
      },
      {
        src: '/reel/studio/note.jpg',
        alt: 'A note to the agent about a step, waiting to be sent.',
        title: 'Notes back to the agent',
        body: 'Point at a step and say what to change. The agent gets the note with its next TinyPivot reply, or copy it as a prompt.',
        hold: 4400,
      },
      {
        src: '/reel/studio/history.jpg',
        alt: 'The Studio history list of every pull in the session, beside the rows of one result.',
        title: 'Nothing gets lost',
        body: 'Every table the agent pulled is kept for 30 days on your machine and reopens without running the query again.',
        hold: 4200,
      },
    ],
  },
]

/** Total running time of a screenshot scene. */
export function shotsDuration(shots: ReelShot[]): number {
  return shots.reduce((total, shot) => total + shot.hold, 0)
}

/** Which screenshot is showing at `time`; stays on the last one once the scene is over. */
export function shotIndexAt(shots: ReelShot[], time: number): number {
  let elapsed = 0
  for (let index = 0; index < shots.length; index++) {
    elapsed += shots[index].hold
    if (time < elapsed)
      return index
  }
  return shots.length - 1
}

/** The screenshots' captions on the scene's timeline, in the shape terminal recordings use. */
export function shotCaptions(shots: ReelShot[]): RecordingCaption[] {
  let start = 0
  return shots.map((shot) => {
    const caption = { t: start, title: shot.title, body: shot.body }
    start += shot.hold
    return caption
  })
}

export function recordingUrl(sceneId: string): string {
  return `/reel/${sceneId}.json`
}

/** `83400` → `1:23` */
export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
