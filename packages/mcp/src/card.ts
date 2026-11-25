import type { ChartThemePreset, TerminalPalette } from '@smallwebco/tinypivot-core'
import { TERMINAL_PALETTES } from '@smallwebco/tinypivot-core'

/**
 * The parts every terminal card is built from: the rounded frame, column widths that count wide
 * characters, compact numbers, sub-cell bars, and 24-bit colour for terminals that draw it.
 */
export const SUB_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
export const SERIES_GLYPHS = ['█', '▓', '▒', '░']
export const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
export const CARD_DIVIDER = '__TINYPIVOT_CARD_DIVIDER__'

// Braille dot bitmasks for a 2x4 cell (col 0..1, row 0..3)
export const BRAILLE_BITS: readonly (readonly number[])[] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1B\[[0-9;]*m/g

const ANSI_RESET = '\x1B[0m'
const ANSI_BOLD = '\x1B[1m'

export function ansiFg(rgb: [number, number, number], text: string): string {
  return `\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${ANSI_RESET}`
}

export function ansiFgBold(rgb: [number, number, number], text: string): string {
  return `${ANSI_BOLD}\x1B[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${ANSI_RESET}`
}

export interface TerminalFormatOptions {
  /** Show subtle tiny-pivot.com card signature (true on Free tier, false on Pro) */
  showBranding?: boolean
  /** Live local Studio URL to embed inside the card footer */
  companionUrl?: string
  /** Optional 24-bit ANSI truecolor palette for direct TTY CLI output (omit for LLM Markdown) */
  colorTheme?: ChartThemePreset
  /** Omit Markdown ```text fences (for direct TTY CLI output) */
  raw?: boolean
  /** Remind the model, in a terminal, to show the card to the user. Off when cards are not reprinted. */
  reprintNote?: boolean
  /** The host shows TinyPivot's own view in the chat, so the model is told not to repeat the card. */
  shownInWidget?: boolean
}

function codePointDisplayWidth(cp: number): number {
  if (cp < 0x20 || (cp >= 0x7F && cp < 0xA0))
    return 0
  // Combining marks, zero-width spaces/joiners, variation selectors
  if (
    (cp >= 0x0300 && cp <= 0x036F)
    || (cp >= 0x1AB0 && cp <= 0x1AFF)
    || (cp >= 0x1DC0 && cp <= 0x1DFF)
    || (cp >= 0x200B && cp <= 0x200F)
    || (cp >= 0x2028 && cp <= 0x202F)
    || (cp >= 0x20D0 && cp <= 0x20FF)
    || (cp >= 0xFE00 && cp <= 0xFE0F)
    || (cp >= 0xFE20 && cp <= 0xFE2F)
    || (cp >= 0xE0100 && cp <= 0xE01EF)
  ) {
    return 0
  }
  // East Asian Wide / Fullwidth and common wide emoji blocks
  if (
    (cp >= 0x1100 && cp <= 0x115F)
    || cp === 0x2329
    || cp === 0x232A
    || (cp >= 0x2E80 && cp <= 0x303E)
    || (cp >= 0x3040 && cp <= 0xA4CF)
    || (cp >= 0xAC00 && cp <= 0xD7A3)
    || (cp >= 0xF900 && cp <= 0xFAFF)
    || (cp >= 0xFE10 && cp <= 0xFE19)
    || (cp >= 0xFE30 && cp <= 0xFE6F)
    || (cp >= 0xFF00 && cp <= 0xFF60)
    || (cp >= 0xFFE0 && cp <= 0xFFE6)
    || (cp >= 0x1F300 && cp <= 0x1FAFF)
    || (cp >= 0x20000 && cp <= 0x3FFFD)
  ) {
    return 2
  }
  return 1
}

export function visualWidth(text: string): number {
  const clean = text.replace(ANSI_ESCAPE_RE, '')
  let width = 0
  for (const ch of clean) {
    const cp = ch.codePointAt(0)
    if (cp !== undefined)
      width += codePointDisplayWidth(cp)
  }
  return width
}

export function truncateVisual(text: string, maxWidth: number): string {
  if (maxWidth <= 0)
    return ''
  if (visualWidth(text) <= maxWidth)
    return text
  if (maxWidth === 1)
    return '…'

  const target = maxWidth - 1
  let out = ''
  let used = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    const w = cp !== undefined ? codePointDisplayWidth(cp) : 0
    if (used + w > target)
      break
    out += ch
    used += w
  }
  return `${out}…`
}

export function padEndVisual(text: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visualWidth(text))
  return pad > 0 ? `${text}${' '.repeat(pad)}` : text
}

export function padStartVisual(text: string, targetWidth: number): string {
  const pad = Math.max(0, targetWidth - visualWidth(text))
  return pad > 0 ? `${' '.repeat(pad)}${text}` : text
}

export function formatCompactNumber(val: number): string {
  if (!Number.isFinite(val))
    return '0'
  const abs = Math.abs(val)
  const sign = val < 0 ? '-' : ''
  if (abs >= 1_000_000_000)
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000)
    return `${sign}${(abs / 1000).toFixed(1)}k`
  if (abs >= 1000)
    return `${sign}${Math.round(abs).toLocaleString('en-US')}`
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}

export function renderPreciseBar(ratio: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  if (clamped <= 0)
    return ''
  const totalEighths = Math.round(clamped * width * 8)
  if (totalEighths === 0)
    return '▏'
  const full = Math.floor(totalEighths / 8)
  const rem = totalEighths % 8
  return `${'█'.repeat(full)}${SUB_BLOCKS[rem]}`
}

/** The bar glyph for a single series: ¾ of the row high, so neighbouring bars have a gap between them in a terminal. */
export const SPACED_BAR = '▆'

/** A bar in whole cells of {@link SPACED_BAR}; any non-zero value gets at least one cell. */
export function renderSpacedBar(ratio: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  return clamped > 0 ? SPACED_BAR.repeat(Math.max(1, Math.round(clamped * width))) : ''
}

export function renderSparkline(values: number[]): string {
  if (values.length === 0)
    return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  return values.map((v) => {
    if (!Number.isFinite(v))
      return ' '
    if (span <= 0)
      return SPARK_CHARS[3]
    const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(((v - min) / span) * (SPARK_CHARS.length - 1))))
    return SPARK_CHARS[idx]
  }).join('')
}

export function buildTopBorder(title: string, rightBadge: string, innerWidth: number): string {
  // Exact card width is innerWidth + 4
  if (rightBadge) {
    const safeRight = truncateVisual(rightBadge, Math.max(8, Math.floor(innerWidth * 0.44)))
    const rightW = visualWidth(safeRight)
    const maxTitleW = Math.max(1, innerWidth - 5 - rightW)
    const safeTitle = truncateVisual(title, maxTitleW)
    const dashCount = Math.max(1, innerWidth - 4 - visualWidth(safeTitle) - rightW)
    return `╭─ ${safeTitle} ${'─'.repeat(dashCount)} ${safeRight} ─╮`
  }
  const safeTitle = truncateVisual(title, Math.max(1, innerWidth - 3))
  const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeTitle))
  return `╭─ ${safeTitle} ${'─'.repeat(dashCount)}─╮`
}

export function buildBottomBorder(footerLeft: string, footerRight: string, innerWidth: number): string {
  // Exact card width is innerWidth + 4
  if (footerLeft && footerRight) {
    const safeLeft = truncateVisual(footerLeft, Math.max(8, Math.floor(innerWidth * 0.45)))
    const leftW = visualWidth(safeLeft)
    const maxRightW = innerWidth - 5 - leftW
    if (maxRightW >= 4) {
      const safeRight = truncateVisual(footerRight, maxRightW)
      const rightW = visualWidth(safeRight)
      const dashCount = Math.max(1, innerWidth - 4 - leftW - rightW)
      return `╰─ ${safeLeft} ${'─'.repeat(dashCount)} ${safeRight} ─╯`
    }
    const dashCount = Math.max(1, innerWidth - 2 - leftW)
    return `╰─ ${safeLeft} ${'─'.repeat(dashCount)}─╯`
  }
  if (footerLeft) {
    const safeLeft = truncateVisual(footerLeft, Math.max(1, innerWidth - 3))
    const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeLeft))
    return `╰─ ${safeLeft} ${'─'.repeat(dashCount)}─╯`
  }
  if (footerRight) {
    const safeRight = truncateVisual(footerRight, Math.max(1, innerWidth - 3))
    const dashCount = Math.max(1, innerWidth - 2 - visualWidth(safeRight))
    return `╰─${'─'.repeat(dashCount)} ${safeRight} ─╯`
  }
  return `╰${'─'.repeat(innerWidth + 2)}╯`
}

export function resolveTerminalPalette(theme?: ChartThemePreset): TerminalPalette | undefined {
  if (!theme)
    return undefined
  return TERMINAL_PALETTES[theme] ?? TERMINAL_PALETTES.code
}

export function wrapInCard(
  title: string,
  rightBadge: string,
  bodyLines: string[],
  footerLeft: string,
  footerRight: string,
  minWidth = 66,
  options: { palette?: TerminalPalette, raw?: boolean } = {},
): string {
  const pal = options.palette
  const contentLines = bodyLines.filter(l => l !== CARD_DIVIDER)
  const longestBody = Math.max(...contentLines.map(l => visualWidth(l)), 0)
  const desiredHeader = visualWidth(title) + visualWidth(rightBadge) + (rightBadge ? 6 : 4)
  const desiredFooter = visualWidth(footerLeft) + visualWidth(footerRight) + (footerLeft && footerRight ? 6 : 4)
  const innerWidth = Math.min(82, Math.max(minWidth, longestBody, Math.min(desiredHeader, 82), Math.min(desiredFooter, 82)))

  const topPlain = buildTopBorder(title, rightBadge, innerWidth)
  const topBorder = pal
    ? topPlain.replace(/^(╭─ )(.+?)( ─+ )(.+?)( ─╮)$/, (_, a, b, c, d, e) =>
        `${ansiFg(pal.border, a)}${ansiFgBold(pal.text, b)}${ansiFg(pal.border, c)}${ansiFg(pal.accent, d)}${ansiFg(pal.border, e)}`)
    : topPlain
  const dividerPlain = `├${'─'.repeat(innerWidth + 2)}┤`
  const dividerLine = pal ? ansiFg(pal.border, dividerPlain) : dividerPlain
  const edge = pal ? ansiFg(pal.border, '│') : '│'

  const paddedBody = bodyLines.map((line) => {
    if (line === CARD_DIVIDER)
      return dividerLine
    const clipped = visualWidth(line) > innerWidth ? truncateVisual(line, innerWidth) : line
    return `${edge} ${padEndVisual(clipped, innerWidth)} ${edge}`
  })

  const botPlain = buildBottomBorder(footerLeft, footerRight, innerWidth)
  const bottomBorder = pal ? ansiFg(pal.border, botPlain) : botPlain
  if (options.raw)
    return [topBorder, ...paddedBody, bottomBorder].join('\n')
  return ['```text', topBorder, ...paddedBody, bottomBorder, '```'].join('\n')
}
