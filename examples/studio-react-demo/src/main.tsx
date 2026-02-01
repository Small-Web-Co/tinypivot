import { enableDemoMode } from '@smallwebco/tinypivot-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

async function initApp() {
  // Enable demo mode to unlock all Pro features (charts, AI analyst, etc.)
  // Secret is configured via VITE_DEMO_SECRET environment variable
  const demoSecret = import.meta.env.VITE_DEMO_SECRET as string
  if (demoSecret) {
    await enableDemoMode(demoSecret)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initApp()
