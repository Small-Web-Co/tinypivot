<script setup lang="ts">
import { ref } from 'vue'

const theme = ref<'light' | 'dark'>('light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}
</script>

<template>
  <div :class="{ 'dark-theme': theme === 'dark' }">
    <router-view :theme="theme" />
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
      {{ theme === 'light' ? 'Dark' : 'Light' }}
    </button>
  </div>
</template>
