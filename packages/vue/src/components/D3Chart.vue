<script setup lang="ts">
/**
 * TinyPivot Vue - D3 chart host.
 * Loads the D3 renderer on first use and keeps it in sync with the chart spec.
 */
import type { D3ChartHandle, D3ChartSpec } from '@smallwebco/tinypivot-core/d3'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  spec: D3ChartSpec
}>()

const host = ref<HTMLDivElement | null>(null)
const loadError = ref<string | null>(null)
let handle: D3ChartHandle | null = null
let unmounted = false

onMounted(() => {
  import('@smallwebco/tinypivot-core/d3')
    .then(({ mountD3Chart }) => {
      if (!unmounted && host.value)
        handle = mountD3Chart(host.value, props.spec)
    })
    .catch((error: unknown) => {
      if (!unmounted)
        loadError.value = error instanceof Error ? error.message : String(error)
    })
})

watch(() => props.spec, (next) => {
  handle?.update(next)
})

onBeforeUnmount(() => {
  unmounted = true
  handle?.destroy()
  handle = null
})
</script>

<template>
  <div v-if="loadError" class="vpg-chart-loading">
    <span>Could not load the chart renderer: {{ loadError }}</span>
  </div>
  <div v-else ref="host" class="vpg-d3-host" :data-chart-type="spec.config.type" />
</template>
