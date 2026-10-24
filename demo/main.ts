import { inject } from '@vercel/analytics'
import { enableDemoMode } from 'tinypivot'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '../src/style.css'

/**
 * Ask the API for a short-lived demo token.
 *
 * The token is signed with the license key, bound to this origin, and expires,
 * so no permanent unlock secret ships inside the bundle.
 */
async function fetchDemoToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/demo-token', {
      method: 'POST',
      signal: typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(3000)
        : undefined,
    })
    if (!response.ok) {
      return null
    }
    const data = await response.json() as { token?: unknown }
    return typeof data.token === 'string' ? data.token : null
  }
  catch {
    return null
  }
}

async function initApp() {
  // Enable demo mode to unlock all Pro features for evaluation
  const demoToken = await fetchDemoToken()
  if (demoToken) {
    await enableDemoMode(demoToken)
  }
  else {
    console.info('[TinyPivot] Demo token unavailable - running in free mode')
  }

  // Initialize Vercel Analytics
  inject()

  createApp(App).use(router).mount('#app')
}

initApp()
