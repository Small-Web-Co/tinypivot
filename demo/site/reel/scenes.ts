/**
 * The scenes shown in the homepage reel. Each replays a real session recorded from
 * /reel/<id>.json, some with the TinyPivot Studio beside the terminal.
 */
/** Where the agent runs: a terminal (TUI), or a desktop app (an editor's agent panel, the Claude app). */
export type ReelSurface = 'terminal' | 'desktop'

export interface ReelScene {
  id: string
  /** Tab label: the harness the session was recorded in. */
  harness: string
  surface: ReelSurface
  /** The TinyPivot theme the recording is shown in, as in scripts/reel/manifest.json. */
  theme: string
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

/** "Paper" for a theme id; empty when it names none the site knows. */
export function themeName(id: string | undefined): string {
  return (id && THEME_NAMES[id]) || ''
}

/** "Paper theme" for a recording's theme id; empty when the recording names none. */
export function themeLabel(id: string | undefined): string {
  const name = themeName(id)
  return name ? `${name} theme` : ''
}

export const reelScenes: ReelScene[] = [
  {
    id: 'charts',
    harness: 'pi + Studio',
    surface: 'terminal',
    theme: 'paper',
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
    surface: 'terminal',
    theme: 'crt-amber',
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
    surface: 'terminal',
    theme: 'crt-green',
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
    surface: 'terminal',
    theme: 'onebit',
    headline: 'One install, every harness.',
    detail: 'The same MCP server answers in OpenCode, with bar charts and pivot tables in the conversation.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows read on your machine' },
      { value: 2, label: 'questions, each one tool call' },
    ],
  },
  {
    id: 'antigravity',
    harness: 'Antigravity CLI',
    surface: 'terminal',
    theme: 'greenbar',
    headline: 'Works in Antigravity too.',
    detail: 'The agent asks permission, calls TinyPivot once, and the chart is in the reply.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows read on your machine' },
      { value: 2, label: 'tool calls you approved' },
    ],
  },
  {
    id: 'antigravity-ide',
    harness: 'Antigravity',
    surface: 'desktop',
    theme: 'onebit',
    headline: 'In an editor, the chart opens in the agent panel.',
    detail: 'Antigravity\'s agent calls TinyPivot and the live map, with its pivot and rows, appears right in the chat.',
    stats: [
      { value: 22730, label: '2026 orders summed on your machine' },
      { value: 0, label: 'raw rows sent to the model' },
    ],
  },
  {
    id: 'claude-desktop',
    harness: 'Claude app',
    surface: 'desktop',
    theme: 'onebit',
    headline: 'In the Claude app, the chart opens in the conversation.',
    detail: 'Claude Code in the Claude desktop app calls TinyPivot, and the live chart, with its pivot and rows, appears in the chat.',
    stats: [
      { value: 4, label: 'regions, each checked against 2025' },
      { value: 0, label: 'raw rows sent to the model' },
    ],
  },
]

const SURFACE_LABELS: Record<ReelSurface, string> = { terminal: 'Terminal', desktop: 'Desktop apps' }

export interface ReelGroup {
  label: string
  /** The group's scenes with their place in the reel, which plays them in order. */
  scenes: Array<{ scene: ReelScene, index: number }>
}

/** The tabs grouped by where the agent runs, in reel order. */
export function reelGroups(scenes: ReelScene[] = reelScenes): ReelGroup[] {
  const groups: ReelGroup[] = []
  scenes.forEach((scene, index) => {
    const label = SURFACE_LABELS[scene.surface]
    let group = groups.at(-1)
    if (group?.label !== label) {
      group = { label, scenes: [] }
      groups.push(group)
    }
    group.scenes.push({ scene, index })
  })
  return groups
}

export function recordingUrl(sceneId: string): string {
  return `/reel/${sceneId}.json`
}

/** `83400` → `1:23` */
export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
