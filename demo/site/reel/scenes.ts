/**
 * The scenes shown in the homepage reel. Each replays a real session recorded from
 * /reel/<id>.json, some with the TinyPivot Studio beside the terminal.
 */
export interface ReelScene {
  id: string
  /** Tab label: the harness the session was recorded in. */
  harness: string
  headline: string
  detail: string
  /** Two measured numbers from the session, shown beside the caption. */
  stats: ReelStat[]
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
    id: 'charts',
    harness: 'Charts',
    headline: 'A map, a slope and a bullet chart, each from one sentence.',
    detail: 'Three questions to pi, two of them asked in the Studio. Each answer comes with its chart, and the Studio checks every number in it against the data.',
    stats: [
      { value: 3, label: 'chart types from three questions' },
      { value: 13, label: 'numbers in the last answer, all found in the data' },
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
]

export function recordingUrl(sceneId: string): string {
  return `/reel/${sceneId}.json`
}

/** `83400` → `1:23` */
export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
