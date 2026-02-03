<script setup lang="ts">
import type { Page, PageShare } from '@smallwebco/tinypivot-studio'
import { createIndexedDBStorage } from '@smallwebco/tinypivot-storage-indexeddb'
import { PageViewer } from '@smallwebco/tinypivot-studio-vue'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import '@smallwebco/tinypivot-studio-vue/style.css'

const route = useRoute()
const storage = createIndexedDBStorage()

const page = ref<Page | null>(null)
const share = ref<PageShare | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  const token = route.params.token as string

  try {
    const shareData = await storage.getShareByToken(token)
    if (!shareData) {
      error.value = 'This page is no longer available'
      return
    }
    if (!shareData.active) {
      error.value = 'This share link has been revoked'
      return
    }
    share.value = shareData

    const pageData = await storage.getPage(shareData.pageId)
    if (!pageData) {
      error.value = 'Page not found'
      return
    }
    page.value = pageData

    await storage.recordShareView(token)
  }
  catch (err) {
    error.value = 'Failed to load page'
    console.error(err)
  }
  finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="shared-page-container">
    <div v-if="isLoading" class="loading">
      Loading...
    </div>
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    <PageViewer v-else-if="page && share" :page="page" :share="share" :storage="storage" />
  </div>
</template>

<style scoped>
.shared-page-container {
  min-height: 100vh;
  background: #f8fafc;
}
.loading,
.error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #64748b;
}
.error {
  color: #dc2626;
}
</style>
