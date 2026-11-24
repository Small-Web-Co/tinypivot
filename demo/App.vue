<script setup lang="ts">
import SiteFooter from './components/site/SiteFooter.vue'
import SiteNav from './components/site/SiteNav.vue'
</script>

<template>
  <SiteNav />
  <router-view />
  <SiteFooter />
</template>
