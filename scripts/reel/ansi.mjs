/**
 * Turns a terminal screen captured with colour escapes into rows of styled text runs.
 * Shared by the reel converter and its tests; no I/O here.
 */

/**
 * The recordings are shown through an amber CRT terminal theme, matching the site and
 * TinyPivot's own `crt-amber` theme: neutral greys become shades of amber phosphor, while real
 * colours (a harness logo, a coloured chart series) are kept as recorded.
 */
export const TERMINAL_THEME = { bg: '#140e06', fg: '#ffc457', bright: '#ffe2a6' }

/** A colour counts as grey when its channels are within this distance of each other. */
const GREY_TOLERANCE = 24
/** Brightness at which phosphor reaches the theme's normal text colour. */
const FG_LEVEL = 0.8

function toHex(r, g, b) {
  return `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

function channels(hex) {
  return [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))
}

function mix(from, to, amount) {
  const [a, b] = [channels(from), channels(to)]
  return toHex(...a.map((value, index) => value + (b[index] - value) * amount))
}

/** Amber at a brightness from 0 (screen background) to 1 (brightest highlight). */
export function phosphor(level) {
  const clamped = Math.min(1, Math.max(0, level))
  return clamped <= FG_LEVEL
    ? mix(TERMINAL_THEME.bg, TERMINAL_THEME.fg, clamped / FG_LEVEL)
    : mix(TERMINAL_THEME.fg, TERMINAL_THEME.bright, (clamped - FG_LEVEL) / (1 - FG_LEVEL))
}

/** Greys take the phosphor colour at their brightness; anything with real colour passes through. */
export function themed(r, g, b) {
  const isGrey = Math.max(r, g, b) - Math.min(r, g, b) <= GREY_TOLERANCE
  return isGrey ? phosphor((r + g + b) / 3 / 255) : toHex(r, g, b)
}

/** The 16 named colours: black, red, green, yellow, blue, magenta, cyan, white, then bright. */
export const BASE_COLORS = [
  phosphor(0.08),
  '#ff7a1a',
  '#9fd08a',
  '#ffb000',
  '#7fb2d9',
  '#c79be0',
  '#7fcfc4',
  phosphor(0.8),
  phosphor(0.45),
  '#ff9a4d',
  '#bfe3ad',
  '#ffd166',
  '#a6cdea',
  '#dcbdf0',
  '#a8e3da',
  phosphor(1),
]

const CUBE_STEPS = [0, 95, 135, 175, 215, 255]

/** xterm's 256-colour table: 16 named, a 6×6×6 cube, then 24 greys. */
export function indexedColor(index) {
  if (index < 16)
    return BASE_COLORS[index]
  if (index < 232) {
    const cube = index - 16
    return themed(CUBE_STEPS[Math.floor(cube / 36)], CUBE_STEPS[Math.floor(cube / 6) % 6], CUBE_STEPS[cube % 6])
  }
  const grey = 8 + (index - 232) * 10
  return themed(grey, grey, grey)
}

/** Reads an extended colour (`38;5;n` or `38;2;r;g;b`) and reports how many parameters it used. */
function readExtendedColor(params, at) {
  if (params[at + 1] === 5)
    return { color: indexedColor(params[at + 2]), used: 2 }
  if (params[at + 1] === 2)
    return { color: themed(params[at + 2], params[at + 3], params[at + 4]), used: 4 }
  return { color: undefined, used: 0 }
}

const FLAGS = { 1: ['bold', true], 2: ['dim', true], 3: ['italic', true], 4: ['underline', true], 7: ['inverse', true], 22: ['bold', false], 23: ['italic', false], 24: ['underline', false], 27: ['inverse', false] }

function applyColorCode(style, code) {
  if (code >= 30 && code <= 37)
    style.fg = BASE_COLORS[code - 30]
  else if (code >= 90 && code <= 97)
    style.fg = BASE_COLORS[code - 90 + 8]
  else if (code >= 40 && code <= 47)
    style.bg = BASE_COLORS[code - 40]
  else if (code >= 100 && code <= 107)
    style.bg = BASE_COLORS[code - 100 + 8]
  else if (code === 39)
    delete style.fg
  else if (code === 49)
    delete style.bg
}

/** Applies one SGR sequence (the numbers between `ESC[` and `m`) to a style. */
export function applySgr(style, sequence) {
  const params = sequence === '' ? [0] : sequence.split(/[;:]/).map(Number)
  let next = { ...style }
  for (let i = 0; i < params.length; i++) {
    const code = params[i]
    if (code === 0) {
      next = {}
    }
    else if (code === 38 || code === 48) {
      const { color, used } = readExtendedColor(params, i)
      next[code === 38 ? 'fg' : 'bg'] = color
      i += used
    }
    else if (FLAGS[code]) {
      const [flag, on] = FLAGS[code]
      if (on)
        next[flag] = true
      else
        delete next[flag]
      if (code === 22)
        delete next.dim
    }
    else {
      applyColorCode(next, code)
    }
  }
  return next
}

const TAB_WIDTH = 8

// eslint-disable-next-line no-control-regex
const ESCAPE_RE = /\x1B\[([0-9;:]*)m|\x1B\][^\x1B\x07]*(?:\x1B\\|\x07)/g

/** Replaces tabs with spaces up to the next tab stop, as a terminal shows them. */
function expandTabs(text, startColumn) {
  let column = startColumn
  let out = ''
  for (const char of text) {
    const width = char === '\t' ? TAB_WIDTH - (column % TAB_WIDTH) : 1
    out += char === '\t' ? ' '.repeat(width) : char
    column += width
  }
  return out
}

/**
 * Splits a captured screen into rows; each row is a list of `[text, style]` runs.
 * Styles carry across line breaks, the way a terminal applies them.
 */
export function parseScreen(screen) {
  let style = {}
  return screen.split('\n').map((line) => {
    const runs = []
    let cursor = 0
    let column = 0
    const pushText = (text) => {
      const expanded = expandTabs(text, column)
      column += [...expanded].length
      if (expanded)
        runs.push([expanded, style])
    }
    for (const match of line.matchAll(ESCAPE_RE)) {
      pushText(line.slice(cursor, match.index))
      cursor = match.index + match[0].length
      if (match[1] !== undefined)
        style = applySgr(style, match[1])
    }
    pushText(line.slice(cursor))
    return runs
  })
}

/** The row's characters with no styling, for searching and transcripts. */
export function rowText(runs) {
  return runs.map(([text]) => text).join('')
}
