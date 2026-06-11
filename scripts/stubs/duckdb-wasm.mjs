/**
 * SSR stub for @duckdb/duckdb-wasm.
 * DuckDB WASM is browser-only. In SSR context all imports resolve to no-ops.
 * Actual calls only happen inside onMounted / async event handlers so this
 * stub is never invoked during renderToString().
 */
export const AsyncDuckDB = class {}
export const ConsoleLogger = class {}
export function getJsDelivrBundles() { return {} }
export async function selectBundle() { return {} }
