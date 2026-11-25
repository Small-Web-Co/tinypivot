/**
 * Turns a terminal screen captured with colour escapes into rows of styled text runs.
 * Shared by the reel converter and its tests; no I/O here.
 */

/**
 * Each recording is shown through one of TinyPivot's own themes, the way a terminal colour scheme
 * repaints the same output. Neutral greys take the theme's ink at their brightness. Real colours
 * keep their hue, except the amber family (TinyPivot's crt-amber cards, which most takes were
 * recorded with) that moves to the theme's own accent. Light themes turn lightness around so dark
 * backgrounds become pale tints and pale text becomes dark ink; 1-bit keeps only ink and paper.
 *
 * `hue` is the theme's accent hue in degrees; `mono` themes have no colour at all.
 */
export const TERMINAL_THEMES = {
  'crt-amber': { bg: '#140e06', fg: '#ffc457', bright: '#ffe2a6', hue: 40 },
  'crt-green': { bg: '#07110b', fg: '#b7f5cf', bright: '#e6fff0', hue: 148 },
  'paper': { bg: '#f4f0e6', fg: '#111111', bright: '#000000', hue: 12, light: true },
  'greenbar': { bg: '#f6f3ea', fg: '#17201a', bright: '#000000', hue: 155, light: true },
  'onebit': { bg: '#ece7dc', fg: '#111111', bright: '#000000', muted: '#4a463f', highlight: '#d9d3c5', light: true, mono: true },
}

export const DEFAULT_TERMINAL_THEME = 'crt-amber'

/** A colour counts as grey when its channels are within this distance of each other. */
const GREY_TOLERANCE = 24
/** Brightness at which a grey reaches the theme's normal text colour. */
const FG_LEVEL = 0.8
/** Hues TinyPivot's amber cards use; these follow the theme's accent. */
const AMBER_HUES = [25, 60]
const AMBER_HUE = TERMINAL_THEMES['crt-amber'].hue
/** On light themes, text stays dark enough to read and backgrounds stay pale. */
const LIGHT_TEXT_RANGE = [0.16, 0.4]
const LIGHT_FILL_RANGE = [0.82, 0.93]
/** Below this lightness a colour was dim text on a dark terminal; 1-bit shows it as muted ink. */
const MONO_DIM_LIGHTNESS = 0.32
/** 1-bit has no greys: a grey is paper below the first level, muted ink below the second, else ink. */
const MONO_LEVELS = [0.15, 0.55]

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value))

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

function toHsl(r, g, b) {
  const [red, green, blue] = [r, g, b].map(value => value / 255)
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0)
    return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const sector = max === red ? ((green - blue) / d + 6) % 6 : max === green ? (blue - red) / d + 2 : (red - green) / d + 4
  return { h: sector * 60, s, l }
}

function fromHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(((h % 360) + 360) % 360 / 60)]
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Moves the amber family to the theme's accent hue, keeping each colour's offset within it. */
function shiftHue(hue, theme) {
  const isAmber = hue >= AMBER_HUES[0] && hue <= AMBER_HUES[1]
  return isAmber ? (hue + theme.hue - AMBER_HUE + 360) % 360 : hue
}

/** A real (non-grey) colour, repainted for the theme. `fill` is true for a cell background. */
function recolor(theme, r, g, b, fill) {
  const hsl = toHsl(r, g, b)
  if (theme.mono)
    return fill ? theme.highlight : hsl.l < MONO_DIM_LIGHTNESS ? theme.muted : theme.fg
  const h = shiftHue(hsl.h, theme)
  if (h === hsl.h && !theme.light)
    return toHex(r, g, b)
  const l = theme.light ? clamp(1 - hsl.l, fill ? LIGHT_FILL_RANGE : LIGHT_TEXT_RANGE) : hsl.l
  return fromHsl({ h, s: hsl.s, l })
}

/** The 16 named colours' hues (red, green, yellow, blue, magenta, cyan), normal then bright. */
const NAMED_HUES = [
  ['#ff7a1a', '#9fd08a', '#ffb000', '#7fb2d9', '#c79be0', '#7fcfc4'],
  ['#ff9a4d', '#bfe3ad', '#ffd166', '#a6cdea', '#dcbdf0', '#a8e3da'],
]

const CUBE_STEPS = [0, 95, 135, 175, 215, 255]
const FLAGS = { 1: ['bold', true], 2: ['dim', true], 3: ['italic', true], 4: ['underline', true], 7: ['inverse', true], 22: ['bold', false], 23: ['italic', false], 24: ['underline', false], 27: ['inverse', false] }

/**
 * The colour rules for one theme: how greys, real colours and the 256-colour table look in it,
 * and how an SGR sequence changes a style.
 */
export function createPalette(themeId = DEFAULT_TERMINAL_THEME) {
  const theme = TERMINAL_THEMES[themeId]
  if (!theme)
    throw new Error(`Unknown terminal theme "${themeId}". Use one of: ${Object.keys(TERMINAL_THEMES).join(', ')}.`)

  /** The theme's ink at a brightness from 0 (screen background) to 1 (brightest highlight). */
  const ink = (level) => {
    const clamped = Math.min(1, Math.max(0, level))
    return clamped <= FG_LEVEL
      ? mix(theme.bg, theme.fg, clamped / FG_LEVEL)
      : mix(theme.fg, theme.bright, (clamped - FG_LEVEL) / (1 - FG_LEVEL))
  }

  /** 1-bit's only shades: paper, the highlight for filled cells, muted ink and ink. */
  const monoInk = (level, fill) => {
    if (level < MONO_LEVELS[0])
      return theme.bg
    if (fill)
      return theme.highlight
    return level < MONO_LEVELS[1] ? theme.muted : theme.fg
  }

  const grey = (level, fill) => (theme.mono ? monoInk(level, fill) : ink(level))

  /** Greys take the ink at their brightness; real colours are repainted for the theme. */
  const color = (r, g, b, fill = false) => {
    const isGrey = Math.max(r, g, b) - Math.min(r, g, b) <= GREY_TOLERANCE
    return isGrey ? grey((r + g + b) / 3 / 255, fill) : recolor(theme, r, g, b, fill)
  }

  const named = (fill) => {
    const [normal, bright] = NAMED_HUES.map(row => row.map(hex => color(...channels(hex), fill)))
    return [grey(0.08, fill), ...normal, grey(0.8, fill), grey(0.45, fill), ...bright, grey(1, fill)]
  }
  const baseColors = { text: named(false), fill: named(true) }

  /** xterm's 256-colour table: 16 named, a 6×6×6 cube, then 24 greys. */
  const indexedColor = (index, fill = false) => {
    if (index < 16)
      return baseColors[fill ? 'fill' : 'text'][index]
    if (index < 232) {
      const cube = index - 16
      return color(CUBE_STEPS[Math.floor(cube / 36)], CUBE_STEPS[Math.floor(cube / 6) % 6], CUBE_STEPS[cube % 6], fill)
    }
    const grey = 8 + (index - 232) * 10
    return color(grey, grey, grey, fill)
  }

  /** Reads an extended colour (`38;5;n` or `38;2;r;g;b`) and reports how many parameters it used. */
  const readExtendedColor = (params, at, fill) => {
    if (params[at + 1] === 5)
      return { value: indexedColor(params[at + 2], fill), used: 2 }
    if (params[at + 1] === 2)
      return { value: color(params[at + 2], params[at + 3], params[at + 4], fill), used: 4 }
    return { value: undefined, used: 0 }
  }

  const applyColorCode = (style, code) => {
    const ranges = [[30, 'fg', 0], [90, 'fg', 8], [40, 'bg', 0], [100, 'bg', 8]]
    const range = ranges.find(([start]) => code >= start && code <= start + 7)
    if (range) {
      const [start, key, offset] = range
      style[key] = baseColors[key === 'bg' ? 'fill' : 'text'][code - start + offset]
    }
    else if (code === 39) {
      delete style.fg
    }
    else if (code === 49) {
      delete style.bg
    }
  }

  const applyFlag = (style, code) => {
    const [flag, on] = FLAGS[code]
    if (on)
      style[flag] = true
    else
      delete style[flag]
    if (code === 22)
      delete style.dim
  }

  /** Applies one SGR sequence (the numbers between `ESC[` and `m`) to a style. */
  const applySgr = (style, sequence) => {
    const params = sequence === '' ? [0] : sequence.split(/[;:]/).map(Number)
    let next = { ...style }
    for (let i = 0; i < params.length; i++) {
      const code = params[i]
      if (code === 0) {
        next = {}
      }
      else if (code === 38 || code === 48) {
        const { value, used } = readExtendedColor(params, i, code === 48)
        next[code === 38 ? 'fg' : 'bg'] = value
        i += used
      }
      else if (FLAGS[code]) {
        applyFlag(next, code)
      }
      else {
        applyColorCode(next, code)
      }
    }
    return next
  }

  return { id: themeId, theme, ink, color, indexedColor, applySgr }
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
export function parseScreen(screen, palette = createPalette()) {
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
        style = palette.applySgr(style, match[1])
    }
    pushText(line.slice(cursor))
    return runs
  })
}

/** The row's characters with no styling, for searching and transcripts. */
export function rowText(runs) {
  return runs.map(([text]) => text).join('')
}
