<script setup lang="ts">
/**
 * Homepage reel: real sessions recorded in each harness, replayed as they happened
 * (thinking time fast-forwarded). One tab per harness; scenes play one after another,
 * with a title card wiping across between them.
 */
import type { Recording } from '../site/reel/player'
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive } from 'vue'
import { captionAt } from '../site/reel/player'
import { formatClock, recordingUrl, reelScenes, shotCaptions, shotsDuration } from '../site/reel/scenes'
import { usePlayback } from '../site/reel/usePlayback'
import ReelCounter from './site/ReelCounter.vue'
import ScreenReplay from './site/ScreenReplay.vue'
import TerminalReplay from './site/TerminalReplay.vue'

/** Stage proportions before a recording arrives, so the page does not jump when it does. */
const PLACEHOLDER_ASPECT = '96 / 58.8'
/** Terminal rows the stage shows; recordings are taller and the camera moves over them. */
const STAGE_ROWS = 28
const VISIBLE_ENOUGH = 0.35
/** Title card timing: wipe across, hold on the harness name, wipe away. */
const WIPE_MS = 420
const TITLE_HOLD_MS = 700

type Curtain = 'open' | 'closing' | 'closed' | 'opening'

const root = ref<HTMLElement>()
const activeIndex = ref(0)
const curtain = ref<Curtain>('open')
const recordings = shallowReactive(new Map<string, Recording>())
const scene = computed(() => reelScenes[activeIndex.value])
const recording = computed(() => recordings.get(scene.value.id))
const shots = computed(() => scene.value.shots)
const duration = computed(() => (shots.value ? shotsDuration(shots.value) : recording.value?.duration ?? 0))
const ready = computed(() => Boolean(shots.value || recording.value))

const { time, playing, play, pause, seek } = usePlayback(duration, playNextScene)
const progress = computed(() => (duration.value ? time.value / duration.value : 0))

/** The step being shown: a timed caption from the recording, or the scene's own summary. */
const steps = computed(() => (shots.value ? shotCaptions(shots.value) : recording.value?.captions ?? []))
const step = computed(() => captionAt(steps.value, time.value))
const stepNumber = computed(() => (step.value ? steps.value.indexOf(step.value) + 1 : 0))
const caption = computed(() => step.value ?? { title: scene.value.headline, body: scene.value.detail })

/** True once the visitor pauses; after that, scrolling the reel into view no longer starts it. */
let visitorPaused = false
let reducedMotion = false
let visibility: IntersectionObserver | undefined
let sceneChange = 0

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Fetches a terminal scene's recording. Screenshot scenes have nothing to fetch. */
async function loadRecording(id: string) {
  if (recordings.has(id) || reelScenes.find(item => item.id === id)?.shots)
    return
  const response = await fetch(recordingUrl(id))
  if (response.ok)
    recordings.set(id, await response.json())
}

function tabFill(index: number): number {
  if (index === activeIndex.value)
    return progress.value
  return index < activeIndex.value ? 1 : 0
}

/** Swaps scenes behind a title card. A newer request cancels the one in flight. */
async function showScene(index: number) {
  const change = ++sceneChange
  const superseded = () => change !== sceneChange
  pause()
  const loading = loadRecording(reelScenes[index].id)

  if (!reducedMotion) {
    curtain.value = 'closing'
    await wait(WIPE_MS)
    if (superseded())
      return
  }
  activeIndex.value = index
  seek(0)
  curtain.value = reducedMotion ? 'open' : 'closed'
  await Promise.all([loading, reducedMotion ? null : wait(TITLE_HOLD_MS)])
  if (superseded())
    return
  if (!reducedMotion) {
    curtain.value = 'opening'
    await wait(WIPE_MS)
    if (superseded())
      return
    curtain.value = 'open'
  }
  if (!visitorPaused)
    play()
}

function playNextScene() {
  showScene((activeIndex.value + 1) % reelScenes.length)
}

function chooseScene(index: number) {
  visitorPaused = false
  showScene(index)
}

function togglePlayback() {
  visitorPaused = playing.value
  if (playing.value)
    pause()
  else
    play()
}

function seekFromPointer(event: MouseEvent) {
  const bar = event.currentTarget as HTMLElement
  const { left, width } = bar.getBoundingClientRect()
  seek(((event.clientX - left) / width) * duration.value)
}

function onVisibility([entry]: IntersectionObserverEntry[]) {
  if (!entry.isIntersecting)
    pause()
  else if (!visitorPaused && ready.value && curtain.value === 'open')
    play()
}

onMounted(async () => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  visitorPaused = reducedMotion
  await loadRecording(scene.value.id)
  // With motion reduced the reel rests on the finished screen instead of playing.
  if (reducedMotion)
    seek(duration.value)
  visibility = new IntersectionObserver(onVisibility, { threshold: VISIBLE_ENOUGH })
  if (root.value)
    visibility.observe(root.value)
})

onBeforeUnmount(() => {
  sceneChange++
  visibility?.disconnect()
})
</script>

<template>
  <div ref="root" class="reel">
    <div class="reel-tabs" role="tablist" aria-label="Harness">
      <button
        v-for="(item, index) in reelScenes"
        :key="item.id"
        type="button"
        role="tab"
        class="reel-tab"
        :aria-selected="index === activeIndex"
        @click="chooseScene(index)"
      >
        <span class="reel-tab-fill" :style="{ transform: `scaleX(${tabFill(index)})` }" aria-hidden="true" />
        <span class="reel-tab-label">{{ item.harness }}</span>
      </button>
    </div>

    <div class="reel-stage">
      <ScreenReplay v-if="shots" :key="scene.id" :shots="shots" :time="time" />
      <TerminalReplay
        v-else-if="recording"
        :recording="recording"
        :time="time"
        :label="`Recorded ${scene.harness} session. ${scene.headline}`"
        :view-rows="STAGE_ROWS"
      />
      <div v-else class="reel-waiting" :style="{ aspectRatio: PLACEHOLDER_ASPECT }">
        Loading the recorded session…
      </div>

      <div class="reel-curtain" :data-state="curtain" aria-hidden="true">
        <span class="reel-curtain-dither" />
        <span class="reel-curtain-ink">
          <span class="reel-card">
            <span class="reel-card-count">{{ String(activeIndex + 1).padStart(2, '0') }} / {{ String(reelScenes.length).padStart(2, '0') }}</span>
            <span class="reel-card-name">{{ scene.harness }}</span>
            <span class="reel-card-note">recorded session</span>
          </span>
        </span>
      </div>
    </div>

    <div class="reel-bar">
      <button type="button" class="reel-play" :aria-label="playing ? 'Pause' : 'Play'" @click="togglePlayback">
        {{ playing ? 'Pause' : 'Play' }}
      </button>
      <div class="reel-track" aria-hidden="true" @click="seekFromPointer">
        <span class="reel-fill" :style="{ transform: `scaleX(${progress})` }" />
      </div>
      <span class="reel-clock">{{ formatClock(time) }} / {{ formatClock(duration) }}</span>
    </div>

    <div class="reel-info">
      <div class="reel-caption">
        <p class="label">
          {{ scene.harness }} · {{ shots ? 'real screenshots, driven by the same tool calls' : 'real session, thinking time fast-forwarded' }}
        </p>
        <Transition name="reel-step" mode="out-in">
          <div :key="caption.title" class="reel-step">
            <h3 class="reel-headline">
              <span v-if="stepNumber" class="reel-step-number">{{ stepNumber }}</span>{{ caption.title }}
            </h3>
            <p class="reel-detail">
              {{ caption.body }}
            </p>
          </div>
        </Transition>
      </div>

      <dl :key="scene.id" class="reel-stats">
        <div v-for="stat in scene.stats" :key="stat.label" class="reel-stat">
          <dd><ReelCounter :value="stat.value" :prefix="stat.prefix" /></dd>
          <dt>{{ stat.label }}</dt>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.reel {
  min-width: 0;
}

.reel-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: var(--line);
}

.reel-tabs::-webkit-scrollbar {
  display: none;
}

.reel-tab {
  position: relative;
  flex: 1 0 auto;
  min-height: var(--tap);
  padding: 0 16px;
  border: 0;
  border-right: var(--line);
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.reel-tab:last-child {
  border-right: 0;
}

.reel-tab:hover {
  color: var(--ink);
}

.reel-tab[aria-selected='true'] {
  background: var(--ink);
  color: var(--paper);
}

/* Each tab doubles as that scene's progress bar. */
.reel-tab-fill {
  position: absolute;
  inset: auto 0 0;
  height: 4px;
  background: var(--accent);
  transform-origin: 0 50%;
}

.reel-tab-label {
  position: relative;
}

.reel-stage {
  position: relative;
  overflow: hidden;
  /* Same surface as the amber terminal theme, so nothing flashes while a recording loads. */
  background: #140e06;
}

.reel-waiting {
  display: grid;
  place-items: center;
  color: var(--win-muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

/* Title card: a dithered edge leads a solid panel across the stage, in hard steps. */
.reel-curtain {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.reel-curtain-dither,
.reel-curtain-ink {
  position: absolute;
  inset: 0;
  clip-path: inset(0 100% 0 0);
}

.reel-curtain-dither {
  background: var(--dither-ink), var(--accent);
}

.reel-curtain-ink {
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--ink);
}

.reel-curtain[data-state='closing'] .reel-curtain-dither {
  animation: reel-wipe-in 320ms steps(12) forwards;
}

.reel-curtain[data-state='closing'] .reel-curtain-ink {
  animation: reel-wipe-in 320ms steps(12) 100ms forwards;
}

.reel-curtain[data-state='closed'] .reel-curtain-dither,
.reel-curtain[data-state='closed'] .reel-curtain-ink {
  clip-path: inset(0);
}

.reel-curtain[data-state='opening'] .reel-curtain-ink {
  animation: reel-wipe-out 320ms steps(12) forwards;
}

.reel-curtain[data-state='opening'] .reel-curtain-dither {
  animation: reel-wipe-out 320ms steps(12) 100ms both;
}

@keyframes reel-wipe-in {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0); }
}

@keyframes reel-wipe-out {
  from { clip-path: inset(0); }
  to { clip-path: inset(0 0 0 100%); }
}

.reel-card {
  display: grid;
  gap: 6px;
  justify-items: center;
  text-align: center;
}

.reel-card-count,
.reel-card-note {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.reel-card-name {
  font-family: var(--font-dot);
  font-size: clamp(2.2rem, 9vw, 5.2rem);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.reel-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: var(--line);
  border-bottom: var(--line);
  background: var(--paper-raised);
}

.reel-play {
  flex: none;
  min-width: 68px;
  min-height: 32px;
  border: var(--line);
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.reel-track {
  flex: 1 1 auto;
  height: 14px;
  border: var(--line);
  background: var(--dither);
  cursor: pointer;
}

.reel-fill {
  display: block;
  height: 100%;
  background: var(--ink);
  transform-origin: 0 50%;
}

.reel-clock {
  flex: none;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-muted);
}

.reel-info {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
}

.reel-caption {
  display: grid;
  gap: 6px;
  align-content: start;
  /* Room for the longest caption, so the page below does not shift between steps. */
  min-height: 9.5rem;
}

.reel-headline {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 3.2vw, 1.9rem);
  font-weight: 400;
  line-height: 1.15;
}

.reel-step-number {
  display: inline-grid;
  place-items: center;
  width: 1.5em;
  height: 1.5em;
  margin-right: 0.5em;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.55em;
  font-weight: 700;
  vertical-align: 0.2em;
}

.reel-detail {
  margin: 6px 0 0;
  max-width: 60ch;
  color: var(--ink-muted);
}

.reel-step-enter-active,
.reel-step-leave-active {
  transition: opacity 180ms steps(4), transform 180ms steps(4);
}

.reel-step-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.reel-step-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.reel-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  border: var(--line);
  background: var(--ledger);
}

.reel-stat {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
}

.reel-stat + .reel-stat {
  border-left: var(--line);
}

.reel-stat dd {
  margin: 0;
  font-family: var(--font-dot);
  font-size: clamp(1.7rem, 6vw, 2.6rem);
  font-weight: 900;
  line-height: 1;
}

.reel-stat dt {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

@media (min-width: 760px) {
  .reel-info {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.6fr);
    align-items: start;
    gap: 28px;
    padding: 20px;
  }

  .reel-caption {
    min-height: 7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reel-step-enter-active,
  .reel-step-leave-active {
    transition: none;
  }
}
</style>
