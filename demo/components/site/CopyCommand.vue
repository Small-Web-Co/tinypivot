<script setup lang="ts">
import { track } from '@vercel/analytics'
import { INIT_COMMAND } from '../../site/install'
import { useCopy } from '../../site/useCopy'

/** One copy-paste terminal line: the shortest path to installing. */
const props = withDefaults(defineProps<{ source: string, command?: string, option?: string }>(), {
  command: INIT_COMMAND,
  option: 'init',
})

const { copiedKey, copy } = useCopy()

async function copyCommand() {
  await copy(props.option, props.command)
  track('install_copied', { option: props.option, source: props.source })
}
</script>

<template>
  <div class="cmd">
    <code class="cmd-line" tabindex="0" title="Click to copy" @click="copyCommand" @keydown.enter="copyCommand">
      <span class="cmd-prompt" aria-hidden="true">$</span>{{ command }}
    </code>
    <button type="button" class="cmd-copy" @click="copyCommand">
      {{ copiedKey === option ? '✓ Copied' : 'Copy' }}
    </button>
  </div>
</template>

<style scoped>
.cmd {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  border: var(--line);
  background: var(--win);
  box-shadow: 5px 5px 0 var(--accent);
}

.cmd-line {
  display: block;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--win-ink);
  overflow-wrap: anywhere;
  cursor: pointer;
}

.cmd-prompt {
  margin-right: 1ch;
  color: var(--win-accent);
  font-weight: 700;
  user-select: none;
}

.cmd-copy {
  min-width: 5.5rem;
  min-height: var(--tap);
  padding: 0 16px;
  border: 0;
  border-left: 2px solid var(--win-rule);
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.cmd-copy:hover {
  background: var(--win-accent);
  color: var(--win);
}
</style>
