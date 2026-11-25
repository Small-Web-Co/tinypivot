<script setup lang="ts">
/**
 * Plays the TinyPivot Studio screenshots taken during a recorded session, in step with the
 * terminal beside it. The parent owns the clock; each frame fades in over the last.
 */
import type { StudioFrame } from '../../site/reel/player'
import { computed } from 'vue'
import { frameIndexAt } from '../../site/reel/player'

const props = defineProps<{
  frames: StudioFrame[]
  /** Milliseconds into the recording. */
  time: number
}>()

/** -1 until the Studio's first screenshot: it opens once the agent's first data step runs. */
const active = computed(() => frameIndexAt(props.frames, props.time))
/** The frame on screen, the one under it while it fades in, and the next one, loaded early. */
const shown = computed(() => props.frames
  .map((frame, index) => ({ ...frame, index }))
  .filter(frame => frame.index >= active.value - 1 && frame.index <= active.value + 1))
</script>

<template>
  <div class="studio-pane">
    <span class="studio-replay-label">TinyPivot Studio · live in the browser</span>
    <div class="studio-replay">
      <p v-if="active < 0" class="studio-replay-waiting">
        The Studio opens with the agent's first data step<span class="studio-replay-cursor" aria-hidden="true">▍</span>
      </p>
      <img
        v-for="frame in shown"
        :key="frame.src"
        class="studio-frame"
        :class="{ current: frame.index === active, upcoming: frame.index > active }"
        :src="frame.src"
        :alt="frame.index === active ? 'TinyPivot Studio during the session: the trace of steps, the chart and the messages to the agent.' : ''"
        width="1280"
        height="800"
        decoding="async"
      >
    </div>
  </div>
</template>

<style scoped>
.studio-pane {
  display: grid;
  gap: 6px;
  padding: 6px 8px 8px;
}

.studio-replay {
  position: relative;
  aspect-ratio: 1280 / 800;
  overflow: hidden;
  background: #140e06;
}

.studio-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.studio-frame.current {
  z-index: 1;
  animation: studio-in 260ms ease-out both;
}

.studio-frame.upcoming {
  visibility: hidden;
}

.studio-replay-label {
  color: #ffb000;
  font: 600 10px/1.4 var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.studio-replay-waiting {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 24px;
  color: #a8771a;
  font: 13px/1.5 var(--font-mono, ui-monospace, monospace);
  text-align: center;
}

.studio-replay-cursor {
  margin-left: 2px;
  color: #ffb000;
  animation: studio-blink 1s steps(1) infinite;
}

@keyframes studio-blink {
  50% {
    opacity: 0;
  }
}

@keyframes studio-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .studio-frame.current {
    animation: none;
  }
}
</style>
