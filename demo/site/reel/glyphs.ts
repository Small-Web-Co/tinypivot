/**
 * Geometry for the characters terminal charts are built from: block elements, box-drawing lines
 * and braille dots. Fonts rarely agree on how wide these are, so the replay draws them itself as
 * rectangles on the cell grid, the way terminal emulators do. Everything else is left to the font.
 */

/** A filled rectangle inside one character cell, in pixels from the cell's top-left corner. */
export interface GlyphRect {
  x: number
  y: number
  w: number
  h: number
  /** Opacity for the shade characters ░▒▓; solid when absent. */
  alpha?: number
}

const QUADRANTS: Record<string, string> = {
  '▖': 'ld',
  '▗': 'rd',
  '▘': 'lu',
  '▙': 'lu ld rd',
  '▚': 'lu rd',
  '▛': 'lu ru ld',
  '▜': 'lu ru rd',
  '▝': 'ru',
  '▞': 'ru ld',
  '▟': 'ru ld rd',
}

const SHADES: Record<string, number> = { '░': 0.25, '▒': 0.5, '▓': 0.75 }

/** Which arms of the cell's centre cross a box-drawing character has: up, right, down, left. */
const BOX_ARMS: Record<string, string> = {
  '─': 'rl',
  '━': 'rl',
  '┄': 'rl',
  '┈': 'rl',
  '╌': 'rl',
  '│': 'ud',
  '┃': 'ud',
  '┌': 'rd',
  '╭': 'rd',
  '┐': 'dl',
  '╮': 'dl',
  '└': 'ur',
  '╰': 'ur',
  '┘': 'ul',
  '╯': 'ul',
  '├': 'urd',
  '┤': 'udl',
  '┬': 'rdl',
  '┴': 'url',
  '┼': 'urdl',
}

const HEAVY_BOX = new Set(['━', '┃'])
const DASHED_BOX = new Set(['┄', '┈', '╌'])

const BRAILLE_START = 0x2800
const BRAILLE_END = 0x28FF
/** Bit for each dot, laid out as [row][column]. */
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]

function blockRects(char: string, cw: number, ch: number): GlyphRect[] | null {
  const code = char.codePointAt(0) ?? 0
  if (char === '█')
    return [{ x: 0, y: 0, w: cw, h: ch }]
  if (char === '▀')
    return [{ x: 0, y: 0, w: cw, h: ch / 2 }]
  if (char === '▐')
    return [{ x: cw / 2, y: 0, w: cw / 2, h: ch }]
  // ▁▂▃▄▅▆▇: filled from the bottom in eighths.
  if (code >= 0x2581 && code <= 0x2587) {
    const height = ((code - 0x2580) / 8) * ch
    return [{ x: 0, y: ch - height, w: cw, h: height }]
  }
  // ▉▊▋▌▍▎▏: filled from the left, seven eighths down to one.
  if (code >= 0x2589 && code <= 0x258F)
    return [{ x: 0, y: 0, w: ((0x2590 - code) / 8) * cw, h: ch }]
  if (SHADES[char])
    return [{ x: 0, y: 0, w: cw, h: ch, alpha: SHADES[char] }]
  return null
}

function quadrantRects(char: string, cw: number, ch: number): GlyphRect[] | null {
  const parts = QUADRANTS[char]
  if (!parts)
    return null
  return parts.split(' ').map(part => ({
    x: part[0] === 'l' ? 0 : cw / 2,
    y: part[1] === 'u' ? 0 : ch / 2,
    w: cw / 2,
    h: ch / 2,
  }))
}

function boxRects(char: string, cw: number, ch: number): GlyphRect[] | null {
  const arms = BOX_ARMS[char]
  if (!arms)
    return null
  const stroke = Math.max(1, Math.round(cw * (HEAVY_BOX.has(char) ? 0.28 : 0.13)))
  const midX = Math.round((cw - stroke) / 2)
  const midY = Math.round((ch - stroke) / 2)

  if (DASHED_BOX.has(char)) {
    const dash = cw / 5
    return [0, 2, 4].map(slot => ({ x: slot * dash, y: midY, w: dash, h: stroke }))
  }

  const rects: GlyphRect[] = []
  if (arms.includes('u'))
    rects.push({ x: midX, y: 0, w: stroke, h: midY + stroke })
  if (arms.includes('d'))
    rects.push({ x: midX, y: midY, w: stroke, h: ch - midY })
  if (arms.includes('l'))
    rects.push({ x: 0, y: midY, w: midX + stroke, h: stroke })
  if (arms.includes('r'))
    rects.push({ x: midX, y: midY, w: cw - midX, h: stroke })
  return rects
}

function brailleRects(char: string, cw: number, ch: number): GlyphRect[] | null {
  const code = char.codePointAt(0) ?? 0
  if (code < BRAILLE_START || code > BRAILLE_END)
    return null
  const bits = code - BRAILLE_START
  const dot = Math.max(1, Math.round(Math.min(cw * 0.3, ch * 0.16)))
  const rects: GlyphRect[] = []
  BRAILLE_BITS.forEach((row, rowIndex) => {
    row.forEach((bit, colIndex) => {
      if (bits & bit) {
        rects.push({
          x: Math.round(cw * (0.25 + colIndex * 0.5) - dot / 2),
          y: Math.round(ch * (0.125 + rowIndex * 0.25) - dot / 2),
          w: dot,
          h: dot,
        })
      }
    })
  })
  return rects
}

const SPARK_FIRST = 0x2581
const SPARK_LAST = 0x2588
/** A run of two or more lower-block characters that are not all full blocks. */
const SPARKLINE_RE = /[\u2581-\u2588]{2,}/g

/**
 * Finds sparklines in a line of text and returns the index of every character in one.
 * Terminals draw these blocks edge to edge, so the bars of neighbouring table rows fuse.
 * Knowing which characters form a sparkline lets the replay draw them as separate bars.
 */
export function sparklineCells(chars: string[]): Set<number> {
  const cells = new Set<number>()
  // One UTF-16 unit per character here: every block character is in the basic plane.
  const text = chars.map(char => (char.length === 1 ? char : ' ')).join('')
  for (const match of text.matchAll(SPARKLINE_RE)) {
    if (/[\u2581-\u2587]/.test(match[0])) {
      for (let offset = 0; offset < match[0].length; offset++)
        cells.add(match.index + offset)
    }
  }
  return cells
}

/** Full and partial blocks that horizontal bars are made of, including the stacked-bar shades. */
const BAR_RE = /[\u2588-\u258F\u2591-\u2593]{2,}/g
/** Half and quadrant blocks. A block run touching one of these is a logo, not a bar. */
const SHAPE_RE = /[\u2580\u2584\u2590\u2596-\u259F]/

/**
 * Finds horizontal chart bars in a line and returns the index of every character in one.
 * Bars on neighbouring rows touch in a terminal and read as one slab, so the replay draws
 * them slightly shorter than the row. Block art such as a harness logo is left solid.
 */
export function barCells(chars: string[]): Set<number> {
  const cells = new Set<number>()
  const text = chars.map(char => (char.length === 1 ? char : ' ')).join('')
  for (const match of text.matchAll(BAR_RE)) {
    const neighbours = text.charAt(match.index - 1) + text.charAt(match.index + match[0].length)
    if (SHAPE_RE.test(neighbours))
      continue
    for (let offset = 0; offset < match[0].length; offset++)
      cells.add(match.index + offset)
  }
  return cells
}

/** Shortens a bar's rectangles so a gap shows between it and the bars above and below. */
export function insetBar(rects: GlyphRect[], ch: number): GlyphRect[] {
  const gap = Math.max(1, Math.round(ch * 0.13))
  return rects.map(rect => ({ ...rect, y: rect.y + gap, h: Math.max(1, rect.h - gap * 2) }))
}

/** One sparkline bar: narrower than the cell and shorter than the row, so bars stand apart. */
export function sparklineRect(char: string, cw: number, ch: number): GlyphRect {
  const code = Math.min(SPARK_LAST, Math.max(SPARK_FIRST, char.codePointAt(0) ?? SPARK_FIRST))
  const level = (code - SPARK_FIRST + 1) / 8
  const gap = Math.max(1, Math.round(cw * 0.14))
  const height = Math.max(1, Math.round(level * ch * 0.74))
  return { x: gap, y: Math.round(ch * 0.88) - height, w: cw - gap * 2, h: height }
}

/**
 * Rectangles that draw `char` in a cell of `cw` by `ch` pixels, or `null` when the character is
 * ordinary text the font should render. An empty list means "drawn, but blank" (blank braille).
 */
export function glyphRects(char: string, cw: number, ch: number): GlyphRect[] | null {
  return blockRects(char, cw, ch)
    ?? quadrantRects(char, cw, ch)
    ?? boxRects(char, cw, ch)
    ?? brailleRects(char, cw, ch)
}
