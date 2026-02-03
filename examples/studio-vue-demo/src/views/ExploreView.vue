<script setup lang="ts">
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { ReportGallery } from '@smallwebco/tinypivot-studio-vue'
import '@smallwebco/tinypivot-studio-vue/style.css'

const storage = createIndexedDBStorage()
</script>

<template>
  <ReportGallery :storage="storage" />
</template>
