import { renderToString } from '@vue/server-renderer'
/**
 * SSR entry point for prerendering marketing routes at build time.
 * Creates a Vue SSR app with memory history — never shipped to the browser.
 *
 * Stubs for browser-only modules (duckdb-wasm, @vercel/analytics) are
 * configured in the Vite SSR server used by scripts/prerender.mjs.
 */
import { createSSRApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'
import { routeDefinitions } from './router/routes'

export async function render(url: string): Promise<string> {
  const app = createSSRApp(App)

  const memRouter = createRouter({
    history: createMemoryHistory(),
    routes: routeDefinitions,
    scrollBehavior: () => ({ top: 0 }),
  })

  app.use(memRouter)
  await memRouter.push(url)
  await memRouter.isReady()

  return renderToString(app)
}
