<script setup lang="ts" generic="T extends string">
defineProps<{
  options: readonly { value: T, label: string }[]
  label: string
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="seg-btn"
      :aria-checked="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  padding: 3px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--paper-sunk);
}

.seg-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.seg-btn:hover {
  color: var(--ink);
}

.seg-btn[aria-checked='true'] {
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 1px 2px rgb(27 26 23 / 0.15);
}
</style>
