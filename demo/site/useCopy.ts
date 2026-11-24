import { ref } from 'vue'

/** Clipboard helper that remembers which item was copied last, for ~1.8s. */
export function useCopy(resetMs = 1800) {
  const copiedKey = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(key: string, text: string): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard)
      return
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    clearTimeout(timer)
    timer = setTimeout(() => {
      copiedKey.value = null
    }, resetMs)
  }

  return { copiedKey, copy }
}
