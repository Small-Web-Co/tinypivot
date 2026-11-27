<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { countUpStart, formatCount, loadNpmDownloads, NPM_DOWNLOADS_SNAPSHOT } from '../../site/npmDownloads'

/** All-time npm downloads: renders the snapshot, then ticks up to npm's live total on each visit. */
const shown = ref(NPM_DOWNLOADS_SNAPSHOT)
let frame = 0

function tickTo(from: number, to: number, ms = 1400) {
  cancelAnimationFrame(frame)
  // Set the first value now, before the next paint, so the full number never flashes first.
  shown.value = from
  const start = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / ms)
    shown.value = Math.round(from + (to - from) * (1 - (1 - progress) ** 3))
    if (progress < 1)
      frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

onMounted(async () => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!still)
    tickTo(countUpStart(NPM_DOWNLOADS_SNAPSHOT), NPM_DOWNLOADS_SNAPSHOT)
  const live = await loadNpmDownloads()
  if (live === undefined || live === shown.value)
    return
  if (still)
    shown.value = live
  else
    tickTo(shown.value, live)
})

onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="count">{{ formatCount(shown) }}</span>
</template>

<style scoped>
.count {
  font-variant-numeric: tabular-nums;
}
</style>
