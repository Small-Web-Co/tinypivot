/** Shapes of a recording written by scripts/reel/convert.mjs, and the logic to step through one. */

/** A stretch of text in one style; the number indexes `Recording.styles`. */
export type Run = [text: string, style: number]

export interface RecordingStyle {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
}

/** A moment in the session: only the rows that changed since the previous frame. */
export interface RecordingFrame {
  t: number
  rows: Array<[row: number, runs: Run[]]>
}

export interface RecordingCaption {
  t: number
  title: string
  body: string
}

export interface Recording {
  id: string
  cols: number
  rows: number
  /** Total running time in milliseconds. */
  duration: number
  /** Default text and background colours of the terminal the session is shown in. */
  theme: { fg: string, bg: string }
  styles: RecordingStyle[]
  frames: RecordingFrame[]
  captions: RecordingCaption[]
  /** Plain text of the final screen, for search engines and screen readers. */
  transcript: string
}

export function createScreen(rows: number): Run[][] {
  return Array.from({ length: rows }, () => [])
}

/** Index of the last frame that starts at or before `time`, or -1 before the first one. */
export function frameIndexAt(frames: RecordingFrame[], time: number): number {
  let low = 0
  let high = frames.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (frames[middle].t <= time) {
      found = middle
      low = middle + 1
    }
    else {
      high = middle - 1
    }
  }
  return found
}

/** Applies frames `after + 1` through `upTo` to the screen and returns the rows that changed. */
export function applyFrames(screen: Run[][], frames: RecordingFrame[], after: number, upTo: number): Set<number> {
  const changed = new Set<number>()
  for (let index = after + 1; index <= upTo; index++) {
    for (const [row, runs] of frames[index].rows) {
      screen[row] = runs
      changed.add(row)
    }
  }
  return changed
}

/** The caption showing at `time`: the latest one that has started. */
export function captionAt(captions: RecordingCaption[], time: number): RecordingCaption | null {
  let current: RecordingCaption | null = null
  for (const caption of captions) {
    if (caption.t <= time)
      current = caption
  }
  return current
}
