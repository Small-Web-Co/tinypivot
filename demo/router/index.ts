import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/Home.vue'),
    },
    {
      path: '/vs-ag-grid',
      name: 'vs-ag-grid',
      component: () => import('../pages/VsAgGrid.vue'),
      meta: {
        title: 'TinyPivot vs AG Grid - Lightweight Pivot Table Comparison',
        description: 'Compare TinyPivot and AG Grid. TinyPivot is 10x smaller, 10x cheaper, with pivot tables included.',
      },
    },
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
  next()
})

export default router
