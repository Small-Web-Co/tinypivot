<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SiteMark from './SiteMark.vue'

const links = [
  { to: '/whitepaper', label: 'White Paper' },
  { to: '/docs', label: 'Docs' },
  { to: '/ui', label: 'UI library' },
  { to: '/pricing', label: 'Pricing' },
] as const

const GITHUB_URL = 'https://github.com/Small-Web-Co/tinypivot'

const menuOpen = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => {
  menuOpen.value = false
})
</script>

<template>
  <header class="nav">
    <div class="wrap nav-bar">
      <router-link to="/" class="nav-brand" aria-label="TinyPivot home">
        <SiteMark />
        <span>tinypivot</span>
      </router-link>

      <nav class="nav-links" aria-label="Primary">
        <router-link v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
          {{ link.label }}
        </router-link>
        <a :href="GITHUB_URL" class="nav-link" rel="noopener">GitHub</a>
      </nav>

      <div class="nav-actions">
        <router-link to="/#install" class="btn btn-solid nav-install">
          Install
        </router-link>
        <button
          type="button"
          class="nav-toggle"
          :aria-expanded="menuOpen"
          aria-controls="nav-menu"
          @click="menuOpen = !menuOpen"
        >
          <span class="sr-only">Menu</span>
          <span class="nav-toggle-bar" />
          <span class="nav-toggle-bar" />
        </button>
      </div>
    </div>

    <nav v-show="menuOpen" id="nav-menu" class="nav-menu" aria-label="Primary">
      <router-link v-for="link in links" :key="link.to" :to="link.to" class="nav-menu-link">
        {{ link.label }}
      </router-link>
      <a :href="GITHUB_URL" class="nav-menu-link" rel="noopener">GitHub ↗</a>
    </nav>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--paper);
  border-bottom: var(--line);
}

.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 60px;
}

.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
}

.nav-links {
  display: none;
}

.nav-link,
.nav-menu-link {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink-muted);
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--ink);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-install {
  min-height: 36px;
  padding: 0 14px;
  font-size: 0.72rem;
  box-shadow: none;
}

.nav-toggle {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  width: var(--tap);
  height: var(--tap);
  padding: 0 12px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.nav-toggle-bar {
  display: block;
  height: 1.5px;
  background: var(--ink);
  transition: transform 0.2s;
}

.nav-toggle[aria-expanded='true'] .nav-toggle-bar:first-of-type {
  transform: translateY(3.75px) rotate(45deg);
}

.nav-toggle[aria-expanded='true'] .nav-toggle-bar:last-of-type {
  transform: translateY(-3.75px) rotate(-45deg);
}

.nav-menu {
  display: grid;
  padding: 4px var(--gutter) 12px;
  border-top: var(--line);
}

.nav-menu-link {
  display: flex;
  align-items: center;
  min-height: 52px;
  border-bottom: 1px solid var(--rule);
  font-size: 0.82rem;
  color: var(--ink);
}

.nav-menu-link:last-child {
  border-bottom: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (min-width: 768px) {
  .nav-links {
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .nav-toggle,
  .nav-menu {
    display: none !important;
  }
}
</style>
