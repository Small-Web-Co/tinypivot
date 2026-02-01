import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Load .env from the monorepo root to get VITE_DEMO_SECRET
  envDir: resolve(__dirname, '../..'),
})
