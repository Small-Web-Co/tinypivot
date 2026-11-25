<script setup lang="ts">
/**
 * Replays a recorded terminal session on a canvas at a given moment in time.
 * The parent owns the clock; this component only draws the screen as it was at `time`.
 */
import type { Camera } from '../../site/reel/director'
import type { Recording, RecordingStyle, Run } from '../../site/reel/player'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cameraFor, findCard, lastContentRow, wideShot } from '../../site/reel/director'
import { glyphRects, sparklineCells, sparklineRect } from '../../site/reel/glyphs'
import { applyFrames, createScreen, frameIndexAt } from '../../site/reel/player'

const props = defineProps<{
  recording: Recording
  /** Milliseconds into the recording. */
  time: number
  label: string
  /** Rows the stage shows at once; the recording itself may be taller. */
  viewRows: number
}>()

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, monospace'
/** Cell height over cell width. */
const CELL_ASPECT = 2.1
/** JetBrains Mono advances 0.6em per character. */
const CELL_WIDTH_EM = 0.6
const DIM_ALPHA = 0.6
/** How far the camera may push in on a chart card, and how long it stays there. */
const MAX_ZOOM = 1.8
const CARD_DWELL_MS = 3400
/** Extra canvas resolution so a zoomed-in card is still drawn at full sharpness. */
const ZOOM_HEADROOM = 1.4

const stage = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const grid = computed(() => ({
  cols: props.recording.cols,
  rows: props.recording.rows,
  viewRows: Math.min(props.viewRows, props.recording.rows),
}))
const aspectRatio = computed(() => `${grid.value.cols} / ${grid.value.viewRows * CELL_ASPECT}`)
const camera = ref<Camera>({ scale: 1, x: 0, y: 0 })
const cameraTransform = computed(() => `translate(${camera.value.x}%, ${camera.value.y}%) scale(${camera.value.scale})`)

let context: CanvasRenderingContext2D | null = null
let cellWidth = 0
let cellHeight = 0
let screen: Run[][] = []
let shownFrame = -1
let resizeObserver: ResizeObserver | undefined
let card: ReturnType<typeof findCard> = null
let cardSince = 0
let contentRow = 0

function fontFor(style: RecordingStyle): string {
  const size = cellWidth / CELL_WIDTH_EM
  return `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${size}px ${FONT_FAMILY}`
}

function colorsFor(style: RecordingStyle) {
  const fg = style.fg ?? props.recording.theme.fg
  const bg = style.bg
  return style.inverse ? { fg: bg ?? props.recording.theme.bg, bg: fg } : { fg, bg }
}

function drawChar(ctx: CanvasRenderingContext2D, char: string, x: number, y: number, alpha: number, inSparkline: boolean) {
  const rects = inSparkline ? [sparklineRect(char, cellWidth, cellHeight)] : glyphRects(char, cellWidth, cellHeight)
  if (!rects) {
    ctx.fillText(char, x, y + cellHeight / 2)
    return
  }
  for (const rect of rects) {
    ctx.globalAlpha = alpha * (rect.alpha ?? 1)
    ctx.fillRect(x + rect.x, y + rect.y, rect.w, rect.h)
  }
  ctx.globalAlpha = alpha
}

function drawRun(ctx: CanvasRenderingContext2D, run: Run, column: number, y: number): number {
  const style = props.recording.styles[run[1]] ?? {}
  const chars = [...run[0]]
  const { fg, bg } = colorsFor(style)
  const x = column * cellWidth

  if (bg) {
    ctx.fillStyle = bg
    ctx.fillRect(x, y, chars.length * cellWidth, cellHeight)
  }
  const alpha = style.dim ? DIM_ALPHA : 1
  ctx.globalAlpha = alpha
  ctx.fillStyle = fg
  ctx.font = fontFor(style)
  const sparkline = sparklineCells(chars)
  chars.forEach((char, offset) => {
    if (char !== ' ')
      drawChar(ctx, char, x + offset * cellWidth, y, alpha, sparkline.has(offset))
  })
  if (style.underline)
    ctx.fillRect(x, y + cellHeight - 2, chars.length * cellWidth, 1)
  ctx.globalAlpha = 1
  return column + chars.length
}

function drawRow(ctx: CanvasRenderingContext2D, row: number) {
  const y = row * cellHeight
  ctx.fillStyle = props.recording.theme.bg
  ctx.fillRect(0, y, ctx.canvas.width, cellHeight)
  let column = 0
  for (const run of screen[row] ?? [])
    column = drawRun(ctx, run, column, y)
}

function drawRows(rows: Iterable<number>) {
  if (!context)
    return
  context.textBaseline = 'middle'
  for (const row of rows)
    drawRow(context, row)
}

/** Notes when a new chart card lands, so the camera can push in on it for a few seconds. */
function trackCard(time: number, restarted: boolean) {
  const found = findCard(screen)
  if (restarted || found?.title !== card?.title)
    cardSince = found ? time : 0
  card = found
  contentRow = lastContentRow(screen)
}

function aimCamera(time: number) {
  const fresh = card && time >= cardSince && time - cardSince < CARD_DWELL_MS
  camera.value = fresh && card ? cameraFor(card, grid.value, MAX_ZOOM) : wideShot(grid.value, contentRow)
}

/** Brings the screen to `time`. Going backwards replays from the start, which is cheap. */
function showTime(time: number, redrawAll = false) {
  const { frames, rows } = props.recording
  const target = frameIndexAt(frames, time)
  const rewound = target < shownFrame
  if (rewound || redrawAll) {
    screen = createScreen(rows)
    shownFrame = -1
  }
  const changed = applyFrames(screen, frames, shownFrame, target)
  shownFrame = target
  drawRows(rewound || redrawAll ? screen.keys() : changed)
  if (changed.size > 0)
    trackCard(time, rewound)
  aimCamera(time)
}

/** Sizes the canvas to whole device pixels per cell so lines and blocks stay sharp. */
function fitCanvas() {
  const el = canvas.value
  if (!el || !stage.value)
    return
  const ratio = (window.devicePixelRatio || 1) * ZOOM_HEADROOM
  cellWidth = Math.max(1, Math.floor((stage.value.clientWidth * ratio) / props.recording.cols))
  cellHeight = Math.round(cellWidth * CELL_ASPECT)
  el.width = cellWidth * props.recording.cols
  el.height = cellHeight * props.recording.rows
  el.style.width = `${el.width / ratio}px`
  el.style.height = `${el.height / ratio}px`
  if (stage.value)
    stage.value.style.height = `${(cellHeight * grid.value.viewRows) / ratio}px`
  showTime(props.time, true)
}

onMounted(() => {
  context = canvas.value?.getContext('2d') ?? null
  fitCanvas()
  resizeObserver = new ResizeObserver(fitCanvas)
  if (stage.value)
    resizeObserver.observe(stage.value)
  // Text drawn before the web font arrives uses the fallback; draw again once it is in.
  document.fonts?.load(`16px ${FONT_FAMILY}`).then(() => showTime(props.time, true))
})

onBeforeUnmount(() => resizeObserver?.disconnect())

watch(() => props.time, time => showTime(time))
watch(() => props.recording, fitCanvas)
</script>

<template>
  <div ref="stage" class="replay" :style="{ aspectRatio, background: recording.theme.bg }">
    <canvas ref="canvas" role="img" :aria-label="label" :style="{ transform: cameraTransform }" />
  </div>
</template>

<style scoped>
.replay {
  display: grid;
  place-items: start;
  width: 100%;
  overflow: hidden;
}

canvas {
  display: block;
  max-width: 100%;
  transform-origin: 0 0;
  transition: transform 800ms cubic-bezier(0.2, 0.7, 0.15, 1);
}

@media (prefers-reduced-motion: reduce) {
  canvas {
    transition: none;
  }
}
</style>
