<script setup lang="ts">
import type { Page, WidgetConfig } from '@smallwebco/tinypivot-studio-vue'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { TinyPivotStudio } from '@smallwebco/tinypivot-studio-vue'
import { ref } from 'vue'
import '@smallwebco/tinypivot-studio-vue/style.css'

const storage = createIndexedDBStorage()
const theme = ref<'light' | 'dark'>('light')

// AI Analyst configuration with demo bypass
const aiAnalystConfig = {
  endpoint: '/api/tinypivot',
}

function handlePageSave(page: Page) {
  console.log('Page saved:', page)
}

function handleWidgetSave(widget: WidgetConfig) {
  console.log('Widget saved:', widget)
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}
</script>

<template>
  <div style="height: 100vh; position: relative">
    <TinyPivotStudio
      user-id="demo-user"
      :storage="storage"
      :theme="theme"
      :ai-analyst="aiAnalystConfig"
      @page-save="handlePageSave"
      @widget-save="handleWidgetSave"
    />
    <!-- Theme toggle button -->
    <button
      :style="{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        padding: '8px 16px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        background: theme === 'light' ? '#ffffff' : '#1e293b',
        color: theme === 'light' ? '#334155' : '#e2e8f0',
        cursor: 'pointer',
        fontSize: '14px',
        zIndex: 1000,
      }"
      @click="toggleTheme"
    >
      {{ theme === 'light' ? '🌙 Dark' : '☀️ Light' }}
    </button>
  </div>
</template>
