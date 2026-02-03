import { enableDemoMode } from '@smallwebco/tinypivot-vue'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

async function initApp() {
  // Enable demo mode to unlock all Pro features (charts, AI analyst, etc.)
  // Secret is configured via VITE_DEMO_SECRET environment variable
  const demoSecret = import.meta.env.VITE_DEMO_SECRET as string
  if (demoSecret) {
    await enableDemoMode(demoSecret)
  }

  createApp(App).use(router).mount('#app')
}

initApp()
