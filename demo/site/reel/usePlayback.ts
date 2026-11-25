import type { Ref } from 'vue'
import { onBeforeUnmount, ref } from 'vue'

/** A play/pause clock in milliseconds that stops at `duration` and reports when it gets there. */
export function usePlayback(duration: Ref<number>, onEnded: () => void) {
  const time = ref(0)
  const playing = ref(false)
  let frameRequest = 0
  let lastTick = 0

  function tick(now: number) {
    time.value = Math.min(duration.value, time.value + (now - lastTick))
    lastTick = now
    if (time.value >= duration.value) {
      playing.value = false
      onEnded()
      return
    }
    frameRequest = requestAnimationFrame(tick)
  }

  function play() {
    if (playing.value)
      return
    if (time.value >= duration.value)
      time.value = 0
    playing.value = true
    lastTick = performance.now()
    frameRequest = requestAnimationFrame(tick)
  }

  function pause() {
    playing.value = false
    cancelAnimationFrame(frameRequest)
  }

  function seek(to: number) {
    time.value = Math.max(0, Math.min(duration.value, to))
  }

  onBeforeUnmount(pause)

  return { time, playing, play, pause, seek }
}
