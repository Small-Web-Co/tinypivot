import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/style.css'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@tanstack/react-table'],
  esbuildOptions(options) {
    options.jsx = 'automatic'
  },
  loader: {
    '.css': 'copy',
  },
})
