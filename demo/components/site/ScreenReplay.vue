<script setup lang="ts">
/**
 * Plays a sequence of product screenshots: each one wipes in over the last in hard steps,
 * then drifts slightly while it is on screen. The parent owns the clock.
 */
import type { ReelShot } from '../../site/reel/scenes'
import { computed } from 'vue'
import { shotIndexAt } from '../../site/reel/scenes'

const props = defineProps<{
  shots: ReelShot[]
  /** Milliseconds into the scene. */
  time: number
}>()

const active = computed(() => shotIndexAt(props.shots, props.time))
</script>

<template>
  <div class="screens">
    <template v-for="(shot, index) in shots" :key="shot.src">
      <img
        v-if="index <= active"
        class="screen"
        :class="{ current: index === active }"
        :src="shot.src"
        :alt="index === active ? shot.alt : ''"
        :style="{ '--hold': `${shot.hold}ms` }"
        width="1280"
        height="800"
        decoding="async"
      >
    </template>
  </div>
</template>

<style scoped>
.screens {
  position: relative;
  aspect-ratio: 1280 / 800;
  overflow: hidden;
  background: #140e06;
}

.screen {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The newest screenshot wipes in from the left, then slowly pushes in while it holds. */
.screen.current {
  transform-origin: 30% 40%;
  animation:
    screen-wipe 420ms steps(12) both,
    screen-drift var(--hold) linear both;
}

@keyframes screen-wipe {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0); }
}

@keyframes screen-drift {
  from { transform: scale(1); }
  to { transform: scale(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .screen.current {
    animation: none;
  }
}
</style>
