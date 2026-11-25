import type { StudioFile } from '../src/studio-protocol'
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

/** Sends a dropped or pasted file to the Studio server, which saves it where the agent can read it. */
export async function uploadToStudio(file: File): Promise<StudioFile> {
  const res = await fetch('/api/studio/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', [STUDIO_HEADER]: '1', 'x-file-name': encodeURIComponent(file.name || 'pasted-file') },
    body: file,
  })
  const json = await res.json().catch(() => ({})) as { file?: StudioFile, error?: string }
  if (!res.ok || !json.file)
    throw new Error(json.error ?? `Upload failed (${res.status})`)
  return json.file
}
