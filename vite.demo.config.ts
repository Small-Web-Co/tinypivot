import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'tinypivot/style.css': resolve(__dirname, 'src/style.css'),
      'tinypivot': resolve(__dirname, 'src/index.ts'),
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
})

