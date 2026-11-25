<script setup lang="ts">
import type { UnitCells } from '../../site/charts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * A unit chart on a canvas: `cols × rows` squares filled in reading order.
 * Ink, dithered and accent fills keep it readable without relying on colour.
 * Drawn client-side only, so the prerendered HTML stays small.
 */
const props = defineProps<{
  cols: number
  rows: number
  segments: readonly UnitCells[]
  label: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const FILL_MS = 900
let revealed = 0 // cells drawn so far (animates up to the total)
let frame = 0
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined

const totalFilled = () => props.segments.reduce((sum, s) => sum + s.cells, 0)

function fillAt(index: number) {
  let end = 0
  for (const segment of props.segments) {
    end += segment.cells
    if (index < end)
      return segment.fill
  }
  return null
}

function draw() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx)
    return

  const style = getComputedStyle(el)
  const colour = (name: string) => style.getPropertyValue(name).trim()
  const ink = colour('--ink')
  const accent = colour('--accent')
  const empty = colour('--paper-sunk')

  // Whole device pixels per cell keep every square crisp.
  const dpr = window.devicePixelRatio || 1
  const cell = Math.max(2, Math.floor((el.clientWidth * dpr) / props.cols))
  const gap = Math.max(1, Math.round(cell * 0.14))
  const size = cell - gap
  const half = Math.ceil(size / 2)
  el.width = cell * props.cols
  el.height = cell * props.rows
  ctx.clearRect(0, 0, el.width, el.height)

  for (let i = 0; i < props.cols * props.rows; i++) {
    const x = (i % props.cols) * cell
    const y = Math.floor(i / props.cols) * cell
    const fill = i < revealed ? fillAt(i) : null
    if (fill === 'dither') {
      ctx.fillStyle = ink
      ctx.fillRect(x, y, half, half)
      ctx.fillRect(x + half, y + half, size - half, size - half)
    }
    else {
      ctx.fillStyle = fill === 'ink' ? ink : fill === 'accent' ? accent : empty
      ctx.fillRect(x, y, size, size)
    }
  }
}

function reveal() {
  const total = totalFilled()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealed = total
    return draw()
  }
  const started = performance.now()
  const step = (now: number) => {
    revealed = Math.round(total * Math.min(1, (now - started) / FILL_MS))
    draw()
    if (revealed < total)
      frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

onMounted(() => {
  const el = canvas.value
  if (!el)
    return
  draw()
  resizeObserver = new ResizeObserver(draw)
  resizeObserver.observe(el)
  intersectionObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      intersectionObserver?.disconnect()
      reveal()
    }
  }, { threshold: 0.3 })
  intersectionObserver.observe(el)
})

watch(() => props.segments, () => {
  revealed = totalFilled()
  draw()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
})
</script>

<template>
  <canvas
    ref="canvas"
    class="unit-grid"
    role="img"
    :aria-label="label"
    :style="{ aspectRatio: `${cols} / ${rows}` }"
  />
</template>

<style scoped>
.unit-grid {
  display: block;
  width: 100%;
  image-rendering: pixelated;
}
</style>
