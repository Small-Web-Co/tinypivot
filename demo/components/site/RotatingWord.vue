<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Cycles through words in place. Screen readers and reduced-motion visitors get the first word only. */
const props = withDefaults(defineProps<{
  words: readonly string[]
  intervalMs?: number
}>(), { intervalMs: 2400 })

const index = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  timer = setInterval(() => {
    index.value = (index.value + 1) % props.words.length
  }, props.intervalMs)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <span class="rotor">
    <span class="sr-only">{{ words[0] }}</span>
    <span class="rotor-stack" aria-hidden="true">
      <span
        v-for="(word, i) in words"
        :key="word"
        class="rotor-word"
        :class="{ 'rotor-on': i === index }"
      >{{ word }}</span>
    </span>
  </span>
</template>

<style scoped>
.rotor {
  display: inline-block;
}

/* Every word occupies the same grid cell, so the line never reflows as words change. */
.rotor-stack {
  display: inline-grid;
  vertical-align: bottom;
}

.rotor-word {
  grid-area: 1 / 1;
  opacity: 0;
  transform: translateY(0.35em);
  transition: opacity 0.35s ease, transform 0.35s ease;
  white-space: nowrap;
}

.rotor-on {
  opacity: 1;
  transform: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .rotor-word {
    transition: none;
  }
}
</style>
