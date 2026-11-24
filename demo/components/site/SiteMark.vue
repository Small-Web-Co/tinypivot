<script setup lang="ts">
/** Pixel pivot mark: header row + row labels in ink, one highlighted cell in accent. */
const cells = [
  { x: 0, y: 0, tone: 'faint' },
  { x: 6, y: 0, tone: 'ink' },
  { x: 12, y: 0, tone: 'ink' },
  { x: 0, y: 6, tone: 'ink' },
  { x: 6, y: 6, tone: 'faint' },
  { x: 12, y: 6, tone: 'accent' },
  { x: 0, y: 12, tone: 'ink' },
  { x: 6, y: 12, tone: 'faint' },
  { x: 12, y: 12, tone: 'faint' },
] as const
</script>

<template>
  <svg class="mark" viewBox="0 0 16 16" aria-hidden="true">
    <rect
      v-for="cell in cells"
      :key="`${cell.x}-${cell.y}`"
      :x="cell.x"
      :y="cell.y"
      width="4"
      height="4"
      :class="cell.tone"
    />
  </svg>
</template>

<style scoped>
.mark {
  width: 18px;
  height: 18px;
  flex: none;
}

.ink {
  fill: currentColor;
}

.faint {
  fill: currentColor;
  opacity: 0.22;
}

.accent {
  fill: var(--accent);
}
</style>
