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
/** Rows kept free below the newest output before the view moves on. */
const FOLLOW_MARGIN = 2
/** How far the view moves once it does, as a share of the stage: few large moves read calmer than many small ones. */
const FOLLOW_STEP = 1 / 3

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
 * The plain view: full width, following the newest output. It holds still while output stays
 * clear of the bottom edge, then moves a third of the stage at once, so streaming text does not
 * nudge the camera on every line. Pass the first row from the previous shot to keep it steady.
 */
export function wideShot(grid: Grid, contentRow: number, previousFirstRow = 0): Camera & { firstRow: number } {
  const lastFirstRow = Math.max(0, grid.rows - grid.viewRows)
  let firstRow = Math.min(previousFirstRow, lastFirstRow)
  if (contentRow < firstRow)
    firstRow = contentRow - FOLLOW_MARGIN
  else if (contentRow + FOLLOW_MARGIN >= firstRow + grid.viewRows)
    firstRow = contentRow + FOLLOW_MARGIN + 1 - grid.viewRows + Math.round(grid.viewRows * FOLLOW_STEP)
  firstRow = Math.max(0, Math.min(firstRow, lastFirstRow))
  // A translate of 0 would be -0 here, which reads oddly in the style attribute.
  return { scale: 1, x: 0, y: firstRow === 0 ? 0 : (-firstRow / grid.rows) * 100, firstRow }
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
