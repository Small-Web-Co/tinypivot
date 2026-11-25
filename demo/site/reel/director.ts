/**
 * The reel's camera. When a chart card lands in a terminal recording the view pushes in on it,
 * holds, then pulls back out. This keeps the chart readable on a phone, where the whole
 * terminal is only a few pixels per character.
 */
import type { Run } from './player'

/** A rectangle on the terminal grid, in character cells. */
export interface Focus {
  col: number
  row: number
  cols: number
  rows: number
}

/** A CSS transform for the canvas: scale, then shift by a percentage of its own size. */
export interface Camera {
  scale: number
  /** Percent of the canvas width/height to translate by (zero or negative). */
  x: number
  y: number
}

/**
 * The terminal that was recorded and the part of it the stage shows. Sessions are recorded
 * taller than the stage so a whole reply fits; the camera chooses which rows are in view.
 */
export interface Grid {
  cols: number
  rows: number
  viewRows: number
}

const CARD_TOP = '╭'
const CARD_BOTTOM = '╰'
/** Breathing room kept around the card, in cells. */
const PADDING = { cols: 3, rows: 1 }

function rowText(runs: Run[]): string {
  return runs.map(([text]) => text).join('')
}

/**
 * The most recent complete card on screen: a `╭` row with a `╰` row below it in the same column.
 * A card that has partly scrolled off the top no longer counts.
 */
export function findCard(screen: Run[][]): (Focus & { title: string }) | null {
  const lines = screen.map(rowText)
  for (let bottom = lines.length - 1; bottom > 0; bottom--) {
    const col = [...lines[bottom]].indexOf(CARD_BOTTOM)
    if (col < 0)
      continue
    for (let top = bottom - 1; top >= 0; top--) {
      const chars = [...lines[top]]
      if (chars[col] === CARD_TOP)
        return { col, row: top, cols: chars.length - col, rows: bottom - top + 1, title: lines[top].trim() }
    }
  }
  return null
}

function rowOf(screen: Run[][], fromBottom: boolean): number {
  const order = fromBottom ? [...screen.keys()].reverse() : [...screen.keys()]
  return order.find(row => rowText(screen[row]).trim() !== '') ?? 0
}

/** The lowest row with anything on it: where the session currently "is". */
export function lastContentRow(screen: Run[][]): number {
  return rowOf(screen, true)
}

/** Keeps a shift inside the range that leaves no empty space at the stage edges. */
function clampShift(shift: number, least: number): number {
  return Math.min(0, Math.max(shift, least))
}

/**
 * The plain view: full width, following the newest output the way a terminal does.
 * Early in a session that is the top of the screen; once output passes the stage it scrolls.
 */
export function wideShot(grid: Grid, contentRow: number): Camera {
  const firstRow = Math.max(0, Math.min(contentRow + 2 - grid.viewRows, grid.rows - grid.viewRows))
  // A translate of 0 would be -0 here, which reads oddly in the style attribute.
  return { scale: 1, x: 0, y: firstRow === 0 ? 0 : (-firstRow / grid.rows) * 100 }
}

/** The tightest view that shows `focus` whole, never zooming past `maxScale` or off the grid. */
export function cameraFor(focus: Focus, grid: Grid, maxScale: number): Camera {
  const scale = Math.max(1, Math.min(
    maxScale,
    grid.cols / (focus.cols + PADDING.cols * 2),
    grid.viewRows / (focus.rows + PADDING.rows * 2),
  ))
  const centreCol = focus.col + focus.cols / 2
  const centreRow = focus.row + focus.rows / 2
  return {
    scale,
    x: clampShift(((grid.cols / 2 - centreCol * scale) / grid.cols) * 100, (1 - scale) * 100),
    y: clampShift(((grid.viewRows / 2 - centreRow * scale) / grid.rows) * 100, ((grid.viewRows - grid.rows * scale) / grid.rows) * 100),
  }
}
