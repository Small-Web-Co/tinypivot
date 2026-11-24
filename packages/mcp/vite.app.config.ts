import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: path.resolve(__dirname, 'app'),
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      // Keep the single-file MCP App widget HTML lightweight (~1.3 MB vs 2.5+ MB)
      // so strict MCP hosts like Claude Desktop never hit resource payload size caps.
      exceljs: path.resolve(__dirname, 'app/exceljs-stub.ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/app'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
