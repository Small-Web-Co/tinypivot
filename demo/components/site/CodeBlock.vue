<script setup lang="ts">
import { useCopy } from '../../site/useCopy'

defineProps<{
  code: string
  filename?: string
}>()

const { copiedKey, copy } = useCopy()
</script>

<template>
  <figure class="code">
    <figcaption class="code-bar">
      <span class="code-file">{{ filename ?? '' }}</span>
      <button type="button" class="code-copy" @click="copy('code', code)">
        {{ copiedKey ? 'Copied' : 'Copy' }}
      </button>
    </figcaption>
    <pre tabindex="0"><code>{{ code }}</code></pre>
  </figure>
</template>

<style scoped>
.code {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--win-rule);
  border-radius: var(--radius);
  background: var(--win);
  color: var(--win-ink);
}

.code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-left: 14px;
  border-bottom: 1px solid var(--win-rule);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--win-muted);
}

.code-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-copy {
  flex: none;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-left: 1px solid var(--win-rule);
  background: transparent;
  color: var(--win-ink);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.code-copy:hover {
  color: var(--win-accent);
}

pre {
  margin: 0;
  padding: 14px;
  overflow-x: auto;
  font-size: 0.78rem;
  line-height: 1.65;
}

@media (min-width: 640px) {
  pre {
    font-size: 0.84rem;
  }
}
</style>
