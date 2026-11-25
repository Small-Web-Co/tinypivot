<script setup lang="ts">
import SiteMark from './SiteMark.vue'

const GITHUB = 'https://github.com/Small-Web-Co/tinypivot'

const columns = [
  {
    title: 'Product',
    links: [
      { to: '/docs', label: 'MCP docs' },
      { to: '/ui', label: 'React & Vue library' },
      { to: '/pricing', label: 'Pricing' },
      { href: `${GITHUB}/releases`, label: 'Changelog' },
    ],
  },
  {
    title: 'Compare',
    links: [
      { to: '/vs-ag-grid', label: 'vs AG Grid' },
      { to: '/vs-tanstack-table', label: 'vs TanStack Table' },
      { to: '/ag-grid-alternatives', label: 'AG Grid alternatives' },
      { to: '/best-react-pivot-table-libraries', label: 'React pivot guide' },
      { to: '/best-vue-pivot-table-components', label: 'Vue pivot guide' },
    ],
  },
  {
    title: 'Source',
    links: [
      { href: GITHUB, label: 'GitHub' },
      { href: 'https://www.npmjs.com/package/@smallwebco/tinypivot-mcp', label: 'npm' },
      { href: '/llms.txt', label: 'llms.txt' },
      { href: `${GITHUB}/blob/master/LICENSE.md`, label: 'License' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
    ],
  },
] as const
</script>

<template>
  <footer class="footer">
    <div class="wrap footer-grid">
      <div class="footer-brand">
        <span class="footer-mark"><SiteMark /> tinypivot</span>
        <p>Analytics inside your agent. Rows stay local; the model gets the summary.</p>
      </div>
      <div v-for="col in columns" :key="col.title" class="footer-col">
        <p class="label">
          {{ col.title }}
        </p>
        <template v-for="link in col.links" :key="link.label">
          <router-link v-if="'to' in link" :to="link.to">
            {{ link.label }}
          </router-link>
          <a v-else :href="link.href" rel="noopener">{{ link.label }}</a>
        </template>
      </div>
    </div>
    <div class="wrap footer-base">
      <span>© 2026 Small Web, LLC</span>
      <span>Made for people who read the data.</span>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background: var(--ink);
  color: var(--paper);
}

.footer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px 24px;
  padding-top: 48px;
  padding-bottom: 40px;
}

.footer-brand {
  grid-column: 1 / -1;
}

.footer-mark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-weight: 500;
}

.footer-brand p {
  max-width: 22em;
  margin-top: 10px;
  color: var(--win-muted);
  font-size: 1rem;
}

.footer-col {
  display: grid;
  align-content: start;
  gap: 2px;
}

.footer-col .label {
  margin-bottom: 6px;
  color: var(--win-accent);
}

.footer-col a {
  display: flex;
  align-items: center;
  min-height: 36px;
  font-size: 0.98rem;
  text-decoration: none;
  color: var(--win-ink);
}

.footer-col a:hover {
  color: var(--win-accent);
}

.footer-base {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  padding-top: 18px;
  padding-bottom: 28px;
  border-top: 1px solid var(--win-rule);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--win-muted);
}

@media (min-width: 768px) {
  .footer-grid {
    grid-template-columns: 2fr 1fr 1fr 1fr;
  }

  .footer-brand {
    grid-column: auto;
  }
}
</style>
