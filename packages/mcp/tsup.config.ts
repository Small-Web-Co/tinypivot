import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2022',
  external: ['pg'],
  noExternal: [
    '@smallwebco/tinypivot-core',
    '@smallwebco/tinypivot-server',
  ],
})
