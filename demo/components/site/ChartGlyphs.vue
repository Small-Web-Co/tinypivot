<script setup lang="ts">
import { useId } from 'vue'

/** The six chart types in the free tier, drawn as 1-bit glyphs with dither as the second tone. */
const patternId = useId()
const dither = `url(#${patternId})`

const glyphs = ['Bar', 'Stacked bar', 'Line', 'Area', 'Pie', 'Donut'] as const
</script>

<template>
  <ul class="glyphs" aria-label="Chart types included free">
    <li v-for="(name, index) in glyphs" :key="name" class="glyph">
      <svg v-if="index === 0" width="0" height="0" aria-hidden="true" class="defs">
        <defs>
          <pattern :id="patternId" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" />
            <rect x="1" y="1" width="1" height="1" />
          </pattern>
        </defs>
      </svg>
      <svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
        <template v-if="name === 'Bar'">
          <rect x="3" y="18" width="6" height="11" />
          <rect x="13" y="10" width="6" height="19" />
          <rect x="23" y="4" width="6" height="25" />
        </template>
        <template v-else-if="name === 'Stacked bar'">
          <rect x="3" y="20" width="6" height="9" />
          <rect x="3" y="12" width="6" height="8" :fill="dither" />
          <rect x="13" y="16" width="6" height="13" />
          <rect x="13" y="6" width="6" height="10" :fill="dither" />
          <rect x="23" y="13" width="6" height="16" />
          <rect x="23" y="3" width="6" height="10" :fill="dither" />
        </template>
        <template v-else-if="name === 'Line'">
          <path d="M3 24h5v-6h5v4h6v-12h5v-5h5" fill="none" stroke="currentColor" stroke-width="2" />
        </template>
        <template v-else-if="name === 'Area'">
          <path d="M3 29v-6h5v-6h5v4h6v-12h5v-5h5v25z" :fill="dither" />
          <path d="M3 23h5v-6h5v4h6v-12h5v-5h5" fill="none" stroke="currentColor" stroke-width="2" />
        </template>
        <template v-else-if="name === 'Pie'">
          <circle cx="16" cy="16" r="13" :fill="dither" shape-rendering="auto" />
          <path d="M16 16V3A13 13 0 0 1 27.3 22.5z" shape-rendering="auto" />
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.5" shape-rendering="auto" />
        </template>
        <template v-else>
          <circle cx="16" cy="16" r="10" fill="none" :stroke="dither" stroke-width="6" shape-rendering="auto" />
          <path d="M16 6A10 10 0 0 1 24.7 21" fill="none" stroke="currentColor" stroke-width="6" shape-rendering="auto" />
        </template>
      </svg>
      <span>{{ name }}</span>
    </li>
  </ul>
</template>

<style scoped>
.glyphs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: var(--line);
  background: var(--paper);
  box-shadow: var(--shadow);
  list-style: none;
}

.defs {
  position: absolute;
}

.glyph {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 20px 8px 16px;
  border-right: var(--line);
  border-bottom: var(--line);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.glyph:nth-of-type(3n) {
  border-right: 0;
}

.glyph:nth-of-type(n + 4) {
  border-bottom: 0;
}

.glyph svg {
  width: 56px;
  height: 56px;
  fill: currentColor;
}

@media (min-width: 768px) {
  .glyphs {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .glyph,
  .glyph:nth-of-type(3n) {
    border-right: var(--line);
    border-bottom: 0;
  }

  .glyph:last-of-type {
    border-right: 0;
  }
}
</style>
