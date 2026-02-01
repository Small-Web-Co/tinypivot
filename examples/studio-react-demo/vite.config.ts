import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Load .env from the monorepo root to get VITE_DEMO_SECRET
  envDir: resolve(__dirname, '../..'),
})
