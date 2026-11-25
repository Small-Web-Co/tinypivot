import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.vue'],
      exclude: ['**/*.d.ts', '**/types.ts', '**/index.ts'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    // Resolve workspace packages from source so tests run without a prior build (as in CI).
    alias: {
      '@smallwebco/tinypivot-core': resolve(__dirname, './packages/core/src'),
      '@smallwebco/tinypivot-server': resolve(__dirname, './packages/server/src'),
    },
  },
})
