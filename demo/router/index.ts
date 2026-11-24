import { createRouter, createWebHistory } from 'vue-router'
import { routeDefinitions } from './routes'

/** Pages are lazy-loaded, so a #hash target may not exist yet when scrolling runs. */
function waitForElement(selector: string, timeoutMs = 1500): Promise<boolean> {
  const started = performance.now()
  return new Promise((resolve) => {
    const check = () => {
      if (document.querySelector(selector))
        return resolve(true)
      if (performance.now() - started > timeoutMs)
        return resolve(false)
      requestAnimationFrame(check)
    }
    check()
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes: routeDefinitions,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return waitForElement(to.hash).then(found => (found ? { el: to.hash, behavior: 'smooth' as const } : { top: 0 }))
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
