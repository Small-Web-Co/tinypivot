<script setup lang="ts">
import type { Page, WidgetConfig } from '@smallwebco/tinypivot-studio-vue'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-vue'
import '@smallwebco/tinypivot-studio-vue/style.css'

defineProps<{
  theme: 'light' | 'dark'
}>()

const storage = createIndexedDBStorage()

// User ID for datasource operations
// NOTE: These must match what was used when creating datasources
const userId = 'demo-user'
// User key for credential encryption (in production, derive from user's auth)
const userKey = 'demo-user-key-for-encryption'

// API endpoint for all server operations (datasources, queries, AI)
const apiEndpoint = '/api/tinypivot'

// AI Analyst configuration
const aiAnalystConfig = {
  endpoint: apiEndpoint,
}

function handlePageSave(page: Page) {
  console.log('Page saved:', page)
}

function handleWidgetSave(widget: WidgetConfig) {
  console.log('Widget saved:', widget)
}
</script>

<template>
  <div style="height: 100vh; position: relative">
    <TinyPivotStudio
      :user-id="userId"
      :storage="storage"
      :theme="theme"
      :api-endpoint="apiEndpoint"
      :user-key="userKey"
      :ai-analyst="aiAnalystConfig"
      @page-save="handlePageSave"
      @widget-save="handleWidgetSave"
    />
  </div>
</template>
