import { createRouter, createWebHistory } from 'vue-router'
import { legacyAnchors, routeDefinitions } from './routes'

/** Pages are lazy-loaded, so a #hash target may not exist yet when scrolling runs. */
function waitForElement(selector: string, timeoutMs = 1500): Promise<Element | null> {
  const started = performance.now()
  return new Promise((resolve) => {
    const check = () => {
      const el = document.querySelector(selector)
      if (el || performance.now() - started > timeoutMs)
        return resolve(el)
      requestAnimationFrame(check)
    }
    check()
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes: routeDefinitions,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      // Jump straight there on first load: a smooth scroll gets cut off while the page is still rendering.
      const behavior: ScrollBehavior = from.matched.length ? 'smooth' : 'instant'
      return waitForElement(to.hash).then((el) => {
        if (!el)
          return { top: 0 }
        // Honour each target's scroll-margin-top so headings clear the sticky nav.
        const top = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
        return { el, top, behavior }
      })
    }
    return { top: 0 }
  },
})

// Update document title and meta on route change
router.beforeEach((to, _from, next) => {
  const legacyTarget = legacyAnchors[to.path + to.hash]
  if (legacyTarget)
    return next(legacyTarget)

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
