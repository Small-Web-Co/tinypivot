import { createRouter, createWebHistory } from 'vue-router'

const marketingGuides = [
  {
    slug: 'best-react-pivot-table-libraries',
    title: 'Best React Pivot Table Libraries: How to Choose | TinyPivot',
    description: 'Compare the main approaches to adding pivot tables in React, from headless table libraries to batteries-included data grids.',
  },
  {
    slug: 'best-vue-pivot-table-components',
    title: 'Best Vue 3 Pivot Table Components: How to Choose | TinyPivot',
    description: 'Choose a Vue 3 pivot table component based on setup time, analytics features, customization needs, and licensing.',
  },
  {
    slug: 'ag-grid-alternatives',
    title: 'AG Grid Alternatives for React and Vue | TinyPivot',
    description: 'Explore AG Grid alternatives for React and Vue when you want a focused data grid, pivot tables, and a simpler licensing model.',
  },
  {
    slug: 'react-data-grid-with-pivot-table',
    title: 'Add a Data Grid with Pivot Tables to React | TinyPivot',
    description: 'Add an Excel-like React data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
  },
  {
    slug: 'vue-data-grid-with-pivot-table',
    title: 'Add a Data Grid with Pivot Tables to Vue 3 | TinyPivot',
    description: 'Add an Excel-like Vue 3 data grid with free pivot tables using TinyPivot and a small DataGrid integration.',
  },
  {
    slug: 'embedded-ai-data-analyst-component',
    title: 'Embed an AI Data Analyst in a React or Vue App | TinyPivot',
    description: 'Add natural-language data exploration to a React or Vue application with a BYOK AI Data Analyst and queries that run in your environment.',
  },
  {
    slug: 'vs-tanstack-table',
    title: 'TinyPivot vs TanStack Table | TinyPivot',
    description: 'Compare TinyPivot and TanStack Table for React or Vue: a batteries-included analytics component versus a flexible headless table foundation.',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/Home.vue'),
      meta: {
        title: 'TinyPivot - Lightweight React & Vue Data Grid with Free Pivot Tables',
        description: 'Lightweight data grid for React and Vue with free pivot tables, Sum aggregation, totals, and calculated fields. Upgrade for charts, AI Analyst, advanced aggregations, and no watermark.',
      },
    },
    {
      path: '/vs-ag-grid',
      name: 'vs-ag-grid',
      component: () => import('../pages/VsAgGrid.vue'),
      meta: {
        title: 'TinyPivot vs AG Grid - Lightweight Pivot Table Comparison',
        description: 'Compare TinyPivot and AG Grid for React and Vue. TinyPivot is a focused data grid with free pivot tables and lifetime Pro licensing.',
      },
    },
    ...marketingGuides.map(guide => ({
      path: `/${guide.slug}`,
      name: guide.slug,
      component: () => import('../pages/MarketingGuide.vue'),
      props: { slug: guide.slug },
      meta: {
        title: guide.title,
        description: guide.description,
      },
    })),
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    }
    return { top: 0 }
  },
})

// Update document title and meta on route change
router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
  const metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription && to.meta.description) {
    metaDescription.setAttribute('content', to.meta.description as string)
  }

  const canonical = document.querySelector('link[rel="canonical"]')
  canonical?.setAttribute('href', `https://tiny-pivot.com${to.path === '/' ? '/' : to.path}`)
  next()
})

export default router
