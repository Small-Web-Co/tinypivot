import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.vue'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TinyPivotVue',
      fileName: 'tinypivot-vue',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['vue', '@tanstack/vue-table'],
      output: {
        globals: {
          'vue': 'Vue',
          '@tanstack/vue-table': 'VueTable',
        },
      },
    },
    sourcemap: true,
  },
})
