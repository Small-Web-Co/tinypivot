<script setup lang="ts">
import type { Page, WidgetConfig } from '@smallwebco/tinypivot-studio-vue'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-vue'

const storage = createIndexedDBStorage()

function handlePageSave(page: Page) {
  console.log('Page saved:', page)
}

function handleWidgetSave(widget: WidgetConfig) {
  console.log('Widget saved:', widget)
}
</script>

<template>
  <div style="height: 100vh">
    <TinyPivotStudio
      user-id="demo-user"
      :storage="storage"
      sample-data
      @page-save="handlePageSave"
      @widget-save="handleWidgetSave"
    />
  </div>
</template>
