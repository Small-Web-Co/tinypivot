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
})
