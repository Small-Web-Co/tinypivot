<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteFooter from './components/site/SiteFooter.vue'
import SiteNav from './components/site/SiteNav.vue'

const route = useRoute()
// Pages not yet moved to the new design still render their own nav and footer.
const useShell = computed(() => route.meta.legacy !== true)
</script>

<template>
  <SiteNav v-if="useShell" />
  <router-view />
  <SiteFooter v-if="useShell" />
</template>
