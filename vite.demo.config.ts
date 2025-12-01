import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'vue-pivot-grid/style.css': resolve(__dirname, 'src/style.css'),
      'vue-pivot-grid': resolve(__dirname, 'src/index.ts'),
    },
  },
  root: 'demo',
  base: '/', // Root path for Vercel hosting
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
})

