<script setup lang="ts">
import { track } from '@vercel/analytics'
import { computed, ref } from 'vue'
import { installOptions } from '../../site/install'
import { useCopy } from '../../site/useCopy'

const props = defineProps<{ source: string }>()

const activeId = ref(installOptions[0].id)
const active = computed(() => installOptions.find(o => o.id === activeId.value) ?? installOptions[0])
const { copiedKey, copy } = useCopy()

async function copyActive() {
  await copy(active.value.id, active.value.lines.join('\n'))
  track('install_copied', { option: active.value.id, source: props.source })
}
</script>

<template>
  <div class="install">
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
      <pre class="install-cmd" tabindex="0" :aria-label="`${active.label} install command`"><code><span
        v-for="line in active.lines"
        :key="line"
        class="install-line"
      ><span class="install-prompt" aria-hidden="true">$</span>{{ line }}</span></code></pre>
      <button type="button" class="btn btn-solid install-copy" @click="copyActive">
        {{ copiedKey === active.id ? 'Copied' : 'Copy' }}
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

.install-tabs {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: var(--line);
  -webkit-mask-image: linear-gradient(to right, #000 85%, transparent);
  mask-image: linear-gradient(to right, #000 85%, transparent);
}

.install-tabs::-webkit-scrollbar {
  display: none;
}

.install-tab {
  flex: none;
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
  padding: 16px;
}

.install-cmd {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
  user-select: none;
}

.install-copy {
  width: 100%;
}

.install-note {
  padding: 0 16px 14px;
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
    font-size: 0.88rem;
  }
}

@container install (min-width: 540px) {
  .install-body {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 20px;
  }

  .install-copy {
    width: auto;
  }

  .install-note {
    padding: 0 20px 16px;
  }
}
</style>
