import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'studio',
      component: () => import('./views/StudioView.vue'),
    },
    {
      path: '/view/:token',
      name: 'view',
      component: () => import('./views/SharedPageView.vue'),
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('./views/ExploreView.vue'),
    },
  ],
})

export default router
