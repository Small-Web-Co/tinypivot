/** The sessions shown in the homepage reel. Terminal scenes replay a recording from /reel/<id>.json. */

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

export const reelScenes: ReelScene[] = [
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
