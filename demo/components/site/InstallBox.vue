<script setup lang="ts">
import { track } from '@vercel/analytics'
import { computed, ref } from 'vue'
import { installOptions } from '../../site/install'
import { useCopy } from '../../site/useCopy'

const props = defineProps<{
  source: string
  prominent?: boolean
  actionLabel?: string
  actionMeta?: string
}>()

const activeId = ref(installOptions[0].id)
const active = computed(() => installOptions.find(o => o.id === activeId.value) ?? installOptions[0])
const { copiedKey, copy } = useCopy()

async function copyActive() {
  await copy(active.value.id, active.value.lines.join('\n'))
  track('install_copied', { option: active.value.id, source: props.source })
}
</script>

<template>
  <div class="install" :class="{ 'install-prominent': prominent }">
    <div v-if="actionLabel" class="install-head">
      <span class="install-action">{{ actionLabel }}</span>
      <span v-if="actionMeta" class="install-meta">{{ actionMeta }}</span>
    </div>

    <div class="install-tabs" role="tablist" aria-label="Install for">
      <button
        v-for="option in installOptions"
        :key="option.id"
        type="button"
        role="tab"
        class="install-tab"
        :aria-selected="option.id === activeId"
        @click="activeId = option.id"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="install-body">
      <pre
        class="install-cmd"
        tabindex="0"
        title="Click to copy install command"
        :aria-label="`${active.label} install command`"
        @click="copyActive"
      ><code><span
        v-for="line in active.lines"
        :key="line"
        class="install-line"
      ><span class="install-prompt" aria-hidden="true">$</span>{{ line }}</span></code></pre>
      <button
        type="button"
        class="btn install-copy"
        :class="prominent ? 'btn-accent' : 'btn-solid'"
        @click="copyActive"
      >
        {{ copiedKey === active.id ? '✓ Copied' : 'Copy' }}
      </button>
    </div>

    <p class="install-note">
      {{ active.note }}
    </p>
  </div>
</template>

<style scoped>
.install {
  container: install / inline-size;
  min-width: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  text-align: left;
}

.install-prominent {
  background: var(--paper-raised);
  box-shadow: 5px 5px 0 var(--ink);
}

.install-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: var(--line);
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.install-action::before {
  content: '▸ ';
}

.install-meta {
  opacity: 0.9;
  font-weight: 500;
}

.install-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: var(--line);
  background: var(--paper);
  -webkit-mask-image: linear-gradient(to right, #000 85%, transparent);
  mask-image: linear-gradient(to right, #000 85%, transparent);
}

.install-tabs::-webkit-scrollbar {
  display: none;
}

.install-tab {
  flex: none;
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-right: var(--line);
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.install-tab:hover {
  color: var(--ink);
}

.install-tab[aria-selected='true'] {
  color: var(--paper);
  background: var(--ink);
}

.install-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
}

.install-cmd {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: pointer;
}

/* Long commands wrap instead of scrolling, with continuation lines indented past the prompt. */
.install-line {
  display: block;
  padding-left: 2ch;
  text-indent: -2ch;
}

.install-prompt {
  display: inline-block;
  width: 2ch;
  text-indent: 0;
  color: var(--accent);
  font-weight: 700;
  user-select: none;
}

.install-copy {
  width: 100%;
  white-space: nowrap;
}

.btn-accent {
  background: var(--accent);
  color: var(--paper);
  box-shadow: 3px 3px 0 var(--ink);
}

.btn-accent:hover {
  background: var(--ink);
  color: var(--paper);
  box-shadow: 3px 3px 0 var(--accent);
}

.install-note {
  padding: 0 16px 12px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-muted);
}

/* Layout follows the box's own width, not the screen's: it sits in narrow columns on desktop too. */
@container install (min-width: 380px) {
  .install-tabs {
    -webkit-mask-image: none;
    mask-image: none;
  }

  .install-tab {
    flex: 1 1 auto;
    padding: 0 10px;
    letter-spacing: 0.06em;
  }

  .install-tab:last-child {
    border-right: 0;
  }

  .install-cmd {
    font-size: 0.8rem;
  }
}

@container install (min-width: 440px) {
  .install-body {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 14px 16px;
  }

  .install-copy {
    width: auto;
    padding: 0 16px;
  }

  .install-note {
    padding: 0 16px 12px;
  }
}

@container install (min-width: 540px) {
  .install-cmd {
    font-size: 0.86rem;
  }

  .install-body {
    padding: 16px 18px;
  }

  .install-note {
    padding: 0 18px 14px;
  }
}
</style>
