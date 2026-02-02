import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Load .env from the monorepo root to get VITE_DEMO_SECRET
  envDir: resolve(__dirname, '../..'),
  server: {
    // Proxy API requests to the datasource-demo server
    proxy: {
      '/api/tinypivot': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
    },
  },
})
