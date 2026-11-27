<script setup lang="ts">
/** A row of measured results: a bold figure over a one-line label. */
defineProps<{ items: readonly { value: string, label: string }[] }>()
</script>

<template>
  <ul class="highlights">
    <li v-for="item in items" :key="item.value">
      <span class="hl-val mono">{{ item.value }}</span>
      <span class="hl-lbl">{{ item.label }}</span>
    </li>
  </ul>
</template>

<style scoped>
.highlights {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  list-style: none;
}

.highlights li {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-left: 4px solid #1d7a4f;
  background: var(--paper-raised);
}

.hl-val {
  font-size: 1.2rem;
  font-weight: 700;
  color: #145a39;
}

.hl-lbl {
  font-size: 0.86rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

@media (min-width: 680px) {
  .highlights {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
