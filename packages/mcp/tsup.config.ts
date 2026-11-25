import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  // DuckDB is native and large: loaded at runtime, downloaded on first use (see src/duckdb.ts).
  external: ['pg', '@duckdb/node-api'],
  noExternal: [
    '@smallwebco/tinypivot-core',
    '@smallwebco/tinypivot-server',
  ],
  // The pi package's extension (package.json "pi"), next to cli.js, which it starts. Generated from
  // the bundle just built, since this config can't load the workspace packages' sources.
  async onSuccess() {
    const { buildPiExtensionSource } = await import(pathToFileURL(resolve('dist/index.js')).href)
    mkdirSync('dist/pi', { recursive: true })
    writeFileSync('dist/pi/tinypivot.ts', buildPiExtensionSource({ packaged: true }))
  },
})
