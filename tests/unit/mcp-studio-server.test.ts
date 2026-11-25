// @vitest-environment node
import type { CompanionServerHandle } from '../../packages/mcp/src/companion'
import type { StudioSnapshot } from '../../packages/mcp/src/studio-protocol'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAllowedRequest, startCompanionServer } from '../../packages/mcp/src/companion'
import { DuckDbRunner, quoteLiteral } from '../../packages/mcp/src/duckdb'
import { HistoryStore } from '../../packages/mcp/src/history'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'
import { STUDIO_HEADER } from '../../packages/mcp/src/studio-protocol'

describe('isAllowedRequest', () => {
  const port = 47317

  it('serves pages and reads to this machine on the server\'s own address only', () => {
    expect(isAllowedRequest({ method: 'GET', host: `127.0.0.1:${port}` }, port)).toBe(true)
    expect(isAllowedRequest({ method: 'GET', host: `localhost:${port}` }, port)).toBe(true)
    // A rebinding attack arrives with the attacker's host name.
    expect(isAllowedRequest({ method: 'GET', host: `evil.example:${port}` }, port)).toBe(false)
    expect(isAllowedRequest({ method: 'GET' }, port)).toBe(false)
  })

  it('takes browser writes only from the Studio\'s own page, and local tools\' writes only with the Studio header', () => {
    const host = `127.0.0.1:${port}`
    expect(isAllowedRequest({ method: 'POST', host, origin: `http://${host}` }, port)).toBe(true)
    expect(isAllowedRequest({ method: 'POST', host, origin: 'https://evil.example' }, port)).toBe(false)
    expect(isAllowedRequest({ method: 'POST', host, origin: 'https://evil.example', studioHeader: '1' }, port)).toBe(false)
    expect(isAllowedRequest({ method: 'POST', host, studioHeader: '1' }, port)).toBe(true)
    expect(isAllowedRequest({ method: 'POST', host }, port)).toBe(false)
  })
})

describe('studio routes', () => {
  let dir: string
  let csvPath: string
  let handle: CompanionServerHandle
  let studio: Studio

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-studio-'))
    csvPath = path.join(dir, 'orders.csv')
    fs.writeFileSync(csvPath, 'region,mrr\nEMEA,10\nAPAC,5\nEMEA,7\n')
    const store = new DatasetStore()
    studio = new Studio(store, { history: new HistoryStore({ dir: path.join(dir, 'history') }), duck: new DuckDbRunner() })
    handle = await startCompanionServer({ store, studio, loadHtml: async () => '<html></html>' })
  })

  afterEach(async () => {
    await handle.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const post = async (route: string, body: unknown, headers: Record<string, string> = { [STUDIO_HEADER]: '1' }) => {
    const res = await fetch(`${handle.url}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }
  const snapshot = async () => (await fetch(`${handle.url}/api/studio`)).json() as Promise<StudioSnapshot>

  it('runs the user\'s SQL as their own step and makes it the active dataset', async () => {
    const sql = `SELECT region, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} GROUP BY 1`
    const result = await post('/api/studio/query', { sql, name: 'By region' })
    expect(result).toMatchObject({ status: 200, body: { rows: 2 } })

    const state = await (await fetch(`${handle.url}/api/state`)).json() as { name: string }
    expect(state.name).toBe('By region')
    const { steps, history, loadedIds } = await snapshot()
    expect(steps.at(-1)).toMatchObject({ actor: 'user', tool: 'query', sql, editableSql: sql })
    expect(history[0].name).toBe('By region')
    expect(loadedIds).toContain(result.body.datasetId)

    expect((await post('/api/studio/query', { sql: 'DROP TABLE x' })).status).toBe(400)
  }, 30_000)

  it('queues notes for the agent and lets the user take one back', async () => {
    const { body } = await post('/api/studio/note', { text: 'Use net revenue, not gross' })
    expect((await snapshot()).notes.map(n => n.text)).toEqual(['Use net revenue, not gross'])

    await post('/api/studio/note/delete', { id: (body.note as { id: string }).id })
    expect((await snapshot()).notes).toEqual([])
    expect((await post('/api/studio/note', { text: '   ' })).status).toBe(400)
  })

  it('refuses writes without the Studio header', async () => {
    expect((await post('/api/studio/note', { text: 'hi' }, {})).status).toBe(403)
    expect((await snapshot()).notes).toEqual([])
  })

  it('refuses requests addressed to another host name', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`${handle.url}/api/studio`, { headers: { host: `evil.example:${handle.port}` } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      }).on('error', reject)
    })
    expect(status).toBe(403)
  })

  it('streams the trace to open Studio tabs as steps happen', async () => {
    const controller = new AbortController()
    const res = await fetch(`${handle.url}/api/events`, { signal: controller.signal })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const readUntil = async (marker: string) => {
      while (!text.includes(marker)) {
        const { value, done } = await reader.read()
        if (done)
          break
        text += decoder.decode(value)
      }
    }
    await readUntil('event: studio')
    expect(handle.clientCount()).toBe(1)

    studio.addNote('Check March')
    await readUntil('Check March')
    expect(text).toContain('"tool":"note"')
    controller.abort()
  })
})

describe('stopping the Studio server', () => {
  const start = (idleStopMs = 0) => new Promise<{ handle: CompanionServerHandle, stopped: Promise<string> }>((resolve) => {
    let onStopped: (reason: string) => void = () => {}
    const stopped = new Promise<string>((done) => {
      onStopped = done
    })
    void startCompanionServer({ store: new DatasetStore(), loadHtml: async () => '', idleStopMs, onStopped }).then(handle => resolve({ handle, stopped }))
  })

  it('closes when the user presses Stop, and stops taking requests', async () => {
    const { handle, stopped } = await start()
    const res = await fetch(`${handle.url}/api/studio/stop`, { method: 'POST', headers: { [STUDIO_HEADER]: '1' } })
    expect(res.status).toBe(200)
    expect(await stopped).toBe('stopped')
    await expect(fetch(`${handle.url}/api/state`)).rejects.toThrow()
  })

  it('ignores a Stop without the Studio header', async () => {
    const { handle } = await start()
    expect((await fetch(`${handle.url}/api/studio/stop`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${handle.url}/api/state`)).ok).toBe(true)
    await handle.close()
  })

  it('closes a while after the last tab closes, but not before any tab has opened', async () => {
    const { handle, stopped } = await start(60)
    await new Promise(resolve => setTimeout(resolve, 120))
    expect((await fetch(`${handle.url}/api/state`)).ok).toBe(true)

    const controller = new AbortController()
    const tab = await fetch(`${handle.url}/api/events`, { signal: controller.signal })
    await tab.body!.getReader().read()
    controller.abort()
    expect(await stopped).toBe('idle')
  })
})
