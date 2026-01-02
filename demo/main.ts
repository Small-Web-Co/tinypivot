import { inject } from '@vercel/analytics'
import { enableDemoMode } from 'tinypivot'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '../src/style.css'

async function initApp() {
  // Enable demo mode to unlock all Pro features for evaluation
  // Secret is configured via VITE_DEMO_SECRET environment variable
  const demoSecret = import.meta.env.VITE_DEMO_SECRET as string
  if (demoSecret) {
    await enableDemoMode(demoSecret)
  }

  // Initialize Vercel Analytics
  inject()

  createApp(App).use(router).mount('#app')
}

initApp()
