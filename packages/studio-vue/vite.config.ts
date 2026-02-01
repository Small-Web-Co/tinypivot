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
      name: 'TinyPivotStudioVue',
      fileName: 'tinypivot-studio-vue',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['vue', 'vuedraggable', '@smallwebco/tinypivot-studio', '@smallwebco/tinypivot-vue'],
      output: {
        globals: {
          'vue': 'Vue',
          'vuedraggable': 'vuedraggable',
          '@smallwebco/tinypivot-studio': 'TinyPivotStudio',
          '@smallwebco/tinypivot-vue': 'TinyPivotVue',
        },
      },
    },
    sourcemap: true,
  },
})
