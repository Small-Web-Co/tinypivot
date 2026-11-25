<script setup lang="ts">
import type { LegalDocument } from '../site/legal'

defineProps<{ doc: LegalDocument }>()
</script>

<template>
  <main class="article legal-page">
    <section>
      <h1>{{ doc.title }}</h1>
      <p class="legal-updated">
        Last updated {{ doc.updated }}
      </p>
      <p>{{ doc.intro }}</p>
    </section>
    <section v-for="section in doc.sections" :key="section.heading">
      <h2>{{ section.heading }}</h2>
      <p v-for="paragraph in section.paragraphs" :key="paragraph">
        {{ paragraph }}
      </p>
      <ul v-if="section.items">
        <li v-for="item in section.items" :key="item">
          {{ item }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.legal-page h2 {
  font-size: clamp(1.4rem, 4vw, 1.8rem);
}

.legal-updated {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.legal-page p + ul {
  margin-top: 12px;
}
</style>
