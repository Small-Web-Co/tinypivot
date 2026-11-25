<script setup lang="ts">
/** A number that counts up to its value when it appears. Renders the final value without JS. */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  value: number
  /** Text placed before the number, such as "~". */
  prefix?: string
}>()

const DURATION_MS = 900
const shown = ref(props.value)
let frameRequest = 0

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  const startedAt = performance.now()
  const tick = (now: number) => {
    const elapsed = Math.min(1, (now - startedAt) / DURATION_MS)
    // Ease out: fast at first, settling on the final digits.
    shown.value = Math.round(props.value * (1 - (1 - elapsed) ** 3))
    if (elapsed < 1)
      frameRequest = requestAnimationFrame(tick)
  }
  shown.value = 0
  frameRequest = requestAnimationFrame(tick)
})

onBeforeUnmount(() => cancelAnimationFrame(frameRequest))
</script>

<template>
  <span>{{ prefix }}{{ shown.toLocaleString('en-US') }}</span>
</template>
