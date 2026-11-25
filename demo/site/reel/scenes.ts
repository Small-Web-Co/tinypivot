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
  {
    id: 'data-ide',
    harness: 'Data IDE',
    headline: 'The interactive view, in the browser or inline.',
    detail: 'Every session also opens this view on localhost. Desktop hosts such as Claude Desktop, Cursor and the Antigravity IDE show the same thing inline.',
    stats: [
      { value: ROWS_ON_DISK, label: 'rows loaded in the view' },
      { value: 10, label: 'themes, this one is Amber CRT' },
    ],
    shots: [
      {
        src: '/reel/ide/area.jpg',
        alt: 'TinyPivot Data IDE showing an area chart of monthly revenue in the Amber CRT theme.',
        title: 'The same question, as a full chart',
        body: 'Each tool call the agent makes updates this view live. Here, 22 months of revenue across all 44,714 orders.',
        hold: 4200,
      },
      {
        src: '/reel/ide/stacked.jpg',
        alt: 'Stacked bar chart of revenue by region, split by plan.',
        title: 'Flat, square, readable',
        body: 'Revenue by region, stacked by plan. Switch between ten chart types without asking the model again.',
        hold: 4200,
      },
      {
        src: '/reel/ide/pivot.jpg',
        alt: 'Pivot table of revenue by plan and channel with row and column totals.',
        title: 'A real pivot table',
        body: 'Drag fields between rows, columns and values. Totals are computed in the browser, not by the model.',
        hold: 4200,
      },
      {
        src: '/reel/ide/grid.jpg',
        alt: 'Data grid listing individual orders with sortable, filterable columns.',
        title: 'Down to the rows',
        body: 'Sort, filter, search and export the underlying records. None of them ever entered the conversation.',
        hold: 4200,
      },
      {
        src: '/reel/ide/partner.jpg',
        alt: 'Bar chart of Partner orders per month in 2026, with March far below the other months.',
        title: 'And the bad month, in full',
        body: 'The filtered Partner chart from the Claude Code session, as the Data IDE draws it.',
        hold: 4600,
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
