import { STUDIO_HEADER } from '../src/studio-protocol'

/** POSTs JSON to the local Studio server, which only accepts writes carrying the Studio header. */
export async function postToStudio<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [STUDIO_HEADER]: '1' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok)
    throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}
