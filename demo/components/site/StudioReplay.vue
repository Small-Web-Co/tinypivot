<script setup lang="ts">
/**
 * Plays screenshots taken during a recorded session: the TinyPivot Studio beside the terminal,
 * or a whole app window (an editor's agent panel) on its own. The parent owns the clock; each
 * frame fades in over the last.
 */
import type { StudioFrame } from '../../site/reel/player'
import { computed, ref } from 'vue'
import { frameIndexAt } from '../../site/reel/player'

const props = withDefaults(defineProps<{
  frames: StudioFrame[]
  /** Milliseconds into the recording. */
  time: number
  /** What the screenshots show, over the pane. */
  label?: string
  /** Describes the frame on screen for screen readers. */
  alt?: string
}>(), {
  label: 'TinyPivot Studio · live in the browser',
  alt: 'TinyPivot Studio during the session: the trace of steps, the chart and the messages to the agent.',
})

/** -1 until the Studio's first screenshot: it opens once the agent's first data step runs. */
const active = computed(() => frameIndexAt(props.frames, props.time))
/** Frames that failed to load (a deploy swapping files, a dropped connection): never shown broken. */
const failed = ref(new Set<string>())
/** The frame to show: the current one, or the last one before it that loaded. */
const onScreen = computed(() => {
  for (let index = active.value; index >= 0; index--) {
    if (!failed.value.has(props.frames[index].src))
      return index
  }
  return -1
})
/**
 * The frame on screen, the one under it while it fades in, and the next one, loaded early. A frame
 * that fails drops out, and the last one that loaded stays up instead of a broken image.
 */
const shown = computed(() => props.frames
  .map((frame, index) => ({ ...frame, index }))
  .filter(frame => !failed.value.has(frame.src)
    && (frame.index === onScreen.value || (frame.index >= active.value - 1 && frame.index <= active.value + 1))))

function dropFrame(src: string) {
  failed.value = new Set(failed.value).add(src)
}
</script>

<template>
  <div class="studio-pane">
    <span class="studio-replay-label">{{ label }}</span>
    <div class="studio-replay">
      <p v-if="active < 0" class="studio-replay-waiting">
        The Studio opens with the agent's first data step<span class="studio-replay-cursor" aria-hidden="true">▍</span>
      </p>
      <img
        v-for="frame in shown"
        :key="frame.src"
        class="studio-frame"
        :class="{ current: frame.index === onScreen, upcoming: frame.index > onScreen }"
        :src="frame.src"
        :alt="frame.index === onScreen ? alt : ''"
        width="1280"
        height="800"
        decoding="async"
        @error="dropFrame(frame.src)"
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
  /* The recording's own colours, so the Studio pane matches the terminal beside it. */
  background: var(--reel-bg, #140e06);
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
  color: var(--reel-fg, #ffb000);
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
  color: color-mix(in srgb, var(--reel-fg, #ffb000) 65%, transparent);
  font: 13px/1.5 var(--font-mono, ui-monospace, monospace);
  text-align: center;
}

.studio-replay-cursor {
  margin-left: 2px;
  color: var(--reel-fg, #ffb000);
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
