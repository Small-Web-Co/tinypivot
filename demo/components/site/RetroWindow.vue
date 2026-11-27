<script setup lang="ts">
/** Classic 1-bit window: striped title bar, close box, hard shadow. */
defineProps<{
  title: string
  flush?: boolean
}>()
</script>

<template>
  <div class="window">
    <div class="window-bar">
      <span class="window-box" aria-hidden="true" />
      <span class="window-stripes" aria-hidden="true" />
      <span class="window-title" aria-hidden="true">{{ title }}</span>
      <span class="window-stripes" aria-hidden="true" />
      <span v-if="$slots.corner" class="window-corner"><slot name="corner" /></span>
    </div>
    <div class="window-body" :class="{ flush }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.window {
  min-width: 0;
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
}

.window-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border-bottom: var(--line);
}

.window-box {
  flex: none;
  width: 12px;
  height: 12px;
  border: var(--line);
  background: var(--paper);
}

.window-stripes {
  flex: 1;
  height: 12px;
  background: repeating-linear-gradient(var(--ink) 0 2px, transparent 2px 4px);
}

.window-title {
  flex: none;
  max-width: 70%;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-corner {
  flex: none;
  display: flex;
  align-items: center;
  align-self: stretch;
  margin-right: -8px;
  padding: 0 10px;
  border-left: var(--line);
  background: var(--ink);
  color: var(--paper);
}

.window-body {
  padding: 20px 16px;
}

.window-body.flush {
  padding: 0;
}

@media (min-width: 768px) {
  .window-body {
    padding: 36px 32px;
  }

  .window-body.flush {
    padding: 0;
  }
}
</style>
