import type { RecordingFrame, Run } from '../../demo/site/reel/player'
import { describe, expect, it } from 'vitest'
import { cameraFor, findCard, lastContentRow, wideShot } from '../../demo/site/reel/director'
import { barCells, glyphRects, insetBar, sparklineCells, sparklineRect } from '../../demo/site/reel/glyphs'
import { applyFrames, captionAt, createScreen, frameIndexAt } from '../../demo/site/reel/player'
import { shotCaptions, shotIndexAt, shotsDuration, themeLabel } from '../../demo/site/reel/scenes'
import { createPalette, parseScreen, rowText, TERMINAL_THEMES } from '../../scripts/reel/ansi.mjs'

const ESC = '\u001B'

describe('reel: reading captured terminal colours', () => {
  it('splits a line into styled runs and strips hyperlinks', () => {
    const [row] = parseScreen(`plain ${ESC}[1;38;5;196mbold red${ESC}[0m ${ESC}]8;id=1;https://x.test${ESC}\\link${ESC}]8;;${ESC}\\`)

    expect(rowText(row)).toBe('plain bold red link')
    expect(row[1]).toEqual(['bold red', { bold: true, fg: '#ff0000' }])
    expect(row[0][1]).toEqual({})
  })

  it('carries a style across line breaks until it is reset', () => {
    const rows = parseScreen(`${ESC}[38;2;10;200;30mfirst\nsecond${ESC}[39m third`)

    expect(rows[1][0]).toEqual(['second', { fg: '#0ac81e' }])
    expect(rows[1][1]).toEqual([' third', {}])
  })

  it('expands tabs to the next stop, counting from the start of the line', () => {
    const [row] = parseScreen(`ab\t${ESC}[1mc\t\td`)
    expect(rowText(row)).toBe(`ab      c${' '.repeat(15)}d`)
  })

  it('understands resets for single attributes', () => {
    const style = createPalette().applySgr({ bold: true, dim: true, fg: '#fff', bg: '#000', inverse: true }, '22;39;27')
    expect(style).toEqual({ bg: '#000' })
  })

  it('shows greys as amber phosphor and keeps real colours', () => {
    const amber = createPalette('crt-amber')
    expect(amber.indexedColor(16)).toBe(TERMINAL_THEMES['crt-amber'].bg)
    expect(amber.indexedColor(231)).toBe(TERMINAL_THEMES['crt-amber'].bright)
    expect(amber.indexedColor(244)).toBe(amber.ink(128 / 255))
    expect(amber.color(128, 128, 128)).not.toBe('#808080')
    expect(amber.indexedColor(196)).toBe('#ff0000')
    expect(amber.color(151, 118, 229)).toBe('#9776e5')
  })

  it('moves amber card colours to a dark theme\'s own accent and keeps other hues', () => {
    const green = createPalette('crt-green')
    const [, row] = parseScreen(`x\n${ESC}[38;2;255;176;0mamber${ESC}[38;2;151;118;229mpurple`, green)
    const [[, amberStyle], [, purpleStyle]] = row
    const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(amberStyle.fg.slice(at, at + 2), 16))
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
    expect(purpleStyle.fg).toBe('#9776e5')
  })

  it('turns lightness around on light themes, so pale text reads on paper and dark fills turn pale', () => {
    const paper = createPalette('paper')
    const lightness = (hex: string) => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)).reduce((sum, value) => sum + value, 0) / 3 / 255
    expect(paper.indexedColor(16)).toBe(TERMINAL_THEMES.paper.bg)
    expect(paper.indexedColor(231)).toBe(TERMINAL_THEMES.paper.bright)
    expect(lightness(paper.color(255, 208, 117))).toBeLessThan(0.45)
    expect(lightness(paper.color(84, 63, 28, true))).toBeGreaterThan(0.75)
  })

  it('keeps 1-bit to ink, muted ink, paper and one highlight', () => {
    const onebit = createPalette('onebit')
    const { bg, fg, muted, highlight } = TERMINAL_THEMES.onebit
    const shades = new Set([bg, fg, muted, highlight, TERMINAL_THEMES.onebit.bright])
    for (let index = 0; index < 256; index++) {
      expect(shades).toContain(onebit.indexedColor(index))
      expect(shades).toContain(onebit.indexedColor(index, true))
    }
    expect(onebit.color(105, 173, 208)).toBe(fg)
    expect(onebit.color(84, 63, 28, true)).toBe(highlight)
  })

  it('refuses a theme it does not know', () => {
    expect(() => createPalette('neon')).toThrow(/Unknown terminal theme "neon"/)
  })

  it('names every terminal theme on the site', () => {
    for (const id of Object.keys(TERMINAL_THEMES))
      expect(themeLabel(id)).toMatch(/ theme$/)
    expect(themeLabel(undefined)).toBe('')
  })
})

describe('reel: stepping through a recording', () => {
  const frames: RecordingFrame[] = [
    { t: 0, rows: [[0, [['$ ', 0]]]] },
    { t: 100, rows: [[0, [['$ ls', 0]]]] },
    { t: 400, rows: [[1, [['a.csv', 1]]]] },
  ]

  it('finds the frame showing at a given time', () => {
    expect(frameIndexAt(frames, -1)).toBe(-1)
    expect(frameIndexAt(frames, 0)).toBe(0)
    expect(frameIndexAt(frames, 399)).toBe(1)
    expect(frameIndexAt(frames, 9000)).toBe(2)
  })

  it('applies only the rows that changed and reports them', () => {
    const screen = createScreen(2)
    expect([...applyFrames(screen, frames, -1, 1)]).toEqual([0])
    expect(screen).toEqual([[['$ ls', 0]], []])

    expect([...applyFrames(screen, frames, 1, 2)]).toEqual([1])
    expect(screen[1]).toEqual([['a.csv', 1]])
  })

  it('shows the latest caption that has started', () => {
    const captions = [{ t: 0, title: 'Ask', body: '' }, { t: 500, title: 'Chart', body: '' }]
    expect(captionAt(captions, 499)?.title).toBe('Ask')
    expect(captionAt(captions, 500)?.title).toBe('Chart')
    expect(captionAt([], 10)).toBeNull()
  })
})

describe('reel: drawing chart characters on the cell grid', () => {
  const CW = 8
  const CH = 16
  const area = (char: string) => (glyphRects(char, CW, CH) ?? []).reduce((sum, rect) => sum + rect.w * rect.h, 0)

  it('leaves ordinary text to the font', () => {
    expect(glyphRects('a', CW, CH)).toBeNull()
    expect(glyphRects(' ', CW, CH)).toBeNull()
  })

  it('fills block elements by eighths', () => {
    expect(area('█')).toBe(CW * CH)
    expect(area('▄')).toBe(CW * CH / 2)
    expect(area('▌')).toBe(CW * CH / 2)
    expect(area('▏')).toBe(CW * CH / 8)
    expect(area('▇')).toBe(CW * CH * 7 / 8)
    expect(glyphRects('▒', CW, CH)?.[0].alpha).toBe(0.5)
  })

  it('draws one dot per braille bit, and none for the blank pattern', () => {
    expect(glyphRects('⠀', CW, CH)).toEqual([])
    expect(glyphRects('⣿', CW, CH)).toHaveLength(8)
    const [dot] = glyphRects('⠁', CW, CH) ?? []
    expect(dot.x).toBeLessThan(CW / 2)
    expect(dot.y).toBeLessThan(CH / 4)
  })

  it('spots sparklines but not solid bars', () => {
    expect([...sparklineCells([...'│ ▁▃█▂ │'])]).toEqual([2, 3, 4, 5])
    expect(sparklineCells([...'│ ████▌ 64.9M'])).toEqual(new Set())
    expect(sparklineCells([...'▁ alone'])).toEqual(new Set())
  })

  it('draws sparkline bars apart from their neighbours and from the row below', () => {
    const tall = sparklineRect('█', CW, CH)
    const short = sparklineRect('▁', CW, CH)

    expect(tall.h).toBeGreaterThan(short.h)
    for (const bar of [tall, short]) {
      expect(bar.x).toBeGreaterThan(0)
      expect(bar.x + bar.w).toBeLessThan(CW)
      expect(bar.y).toBeGreaterThan(0)
      expect(bar.y + bar.h).toBeLessThan(CH)
    }
  })

  it('treats block runs as chart bars unless they are part of block art', () => {
    expect([...barCells([...'│ ████▌   64.9M'])]).toEqual([2, 3, 4, 5, 6])
    expect([...barCells([...'│ ███▓▓▒░  20M'])]).toEqual([2, 3, 4, 5, 6, 7, 8])
    // A harness logo: full blocks flanked by quadrant and half blocks.
    expect(barCells([...' ▐▛███▜▌'])).toEqual(new Set())
    // A single legend swatch is not a bar.
    expect(barCells([...'█ Enterprise'])).toEqual(new Set())
  })

  it('leaves a gap above and below a bar', () => {
    const [bar] = insetBar(glyphRects('█', CW, CH) ?? [], CH)
    expect(bar.y).toBeGreaterThan(0)
    expect(bar.y + bar.h).toBeLessThan(CH)
    expect(bar.w).toBe(CW)
  })

  it('joins box-drawing lines at the cell edges', () => {
    const horizontal = glyphRects('─', CW, CH) ?? []
    const left = Math.min(...horizontal.map(rect => rect.x))
    const right = Math.max(...horizontal.map(rect => rect.x + rect.w))
    expect([left, right]).toEqual([0, CW])

    const corner = glyphRects('╭', CW, CH) ?? []
    expect(Math.max(...corner.map(rect => rect.y + rect.h))).toBe(CH)
    expect(Math.max(...corner.map(rect => rect.x + rect.w))).toBe(CW)
    expect(Math.min(...corner.map(rect => rect.y))).toBeGreaterThan(0)
  })
})

describe('reel: camera', () => {
  const screen = (lines: string[]): Run[][] => lines.map(line => [[line, 0]])
  const CARD = ['  ╭─ MRR by month ─╮', '  │ ⣀⠤⠒⠉           │', '  ╰──── 44,714 rows ╯']

  it('finds the newest complete card and ignores one cut off at the top', () => {
    const card = findCard(screen(['❯ chart it', ...CARD, 'done']))
    expect(card).toMatchObject({ col: 2, row: 1, rows: 3, cols: 18, title: '╭─ MRR by month ─╮' })

    expect(findCard(screen(CARD.slice(1)))).toBeNull()
    expect(findCard(screen(['just text']))).toBeNull()
  })

  const grid = { cols: 96, rows: 44, viewRows: 28 }

  it('follows the newest output: top of the screen first, scrolling once it fills the stage', () => {
    expect(wideShot(grid, 5)).toEqual({ scale: 1, x: 0, y: 0, firstRow: 0 })
    // Output near the bottom edge moves the view a third of the stage at once.
    const moved = wideShot(grid, 26)
    expect(moved.firstRow).toBe(10)
    // It then holds still while output stays clear of the edge.
    expect(wideShot(grid, 30, moved.firstRow).firstRow).toBe(10)
    // Never scrolls past the last row.
    expect(wideShot(grid, 43, moved.firstRow).y).toBeCloseTo((-16 / 44) * 100)
    // A cleared screen brings it back up.
    expect(wideShot(grid, 3, 16).firstRow).toBe(1)
    expect(lastContentRow(screen(['a', '', 'b', '  ', '']))).toBe(2)
  })

  it('pushes in on a card and keeps it inside the stage', () => {
    const card = { col: 2, row: 12, cols: 70, rows: 17 }
    const camera = cameraFor(card, grid, 2)

    expect(camera.scale).toBeCloseTo(96 / 76)
    // A card near the left edge pins the view to that edge instead of showing empty space.
    expect(camera.x).toBe(0)

    // The stage shows `viewRows` rows of an unscaled canvas; work out which rows are visible.
    const firstVisibleRow = (-camera.y / 100) * grid.rows / camera.scale
    const visibleRows = grid.viewRows / camera.scale
    expect(firstVisibleRow).toBeLessThanOrEqual(card.row)
    expect(firstVisibleRow + visibleRows).toBeGreaterThanOrEqual(card.row + card.rows)
  })

  it('respects the zoom cap and never zooms out below full width', () => {
    expect(cameraFor({ col: 40, row: 10, cols: 10, rows: 4 }, grid, 1.5).scale).toBe(1.5)
    expect(cameraFor({ col: 0, row: 0, cols: 96, rows: 40 }, grid, 2).scale).toBe(1)
  })
})

describe('reel: screenshot scenes', () => {
  const shot = (title: string, hold: number) => ({ src: `/${title}.jpg`, alt: title, title, body: '', hold })
  const shots = [shot('chart', 4000), shot('pivot', 3000), shot('grid', 5000)]

  it('adds up the running time and places each caption where its screenshot starts', () => {
    expect(shotsDuration(shots)).toBe(12000)
    expect(shotCaptions(shots).map(caption => [caption.t, caption.title])).toEqual([[0, 'chart'], [4000, 'pivot'], [7000, 'grid']])
  })

  it('shows the screenshot whose slot contains the time, and rests on the last one', () => {
    expect(shotIndexAt(shots, 0)).toBe(0)
    expect(shotIndexAt(shots, 3999)).toBe(0)
    expect(shotIndexAt(shots, 4000)).toBe(1)
    expect(shotIndexAt(shots, 11999)).toBe(2)
    expect(shotIndexAt(shots, 99999)).toBe(2)
  })
})
