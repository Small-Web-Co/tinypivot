/**
 * SSR stub for @vercel/analytics.
 * inject() and track() touch browser APIs. Both are only called after mount
 * or in event handlers, so stubs are safe for SSR renderToString().
 */
export function inject() {}
export function track() {}
