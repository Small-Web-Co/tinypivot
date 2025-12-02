import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'packages/vue/src'),
      'tinypivot/style.css': resolve(__dirname, 'packages/vue/src/style.css'),
      'tinypivot': resolve(__dirname, 'packages/vue/src/index.ts'),
      '@smallwebco/tinypivot-core': resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
  root: 'demo',
  base: '/',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
  optimizeDeps: {
    include: ['@tanstack/vue-table'],
  },
})
