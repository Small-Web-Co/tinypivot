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

  it('sends notes only to an agent that can take them live', async () => {
    const refused = await post('/api/studio/note', { text: 'Use net revenue, not gross' })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toContain('cannot receive messages from the Studio')

    const pushed: string[] = []
    studio.agent.connect({ name: 'pi', push: (_note, text) => pushed.push(text) > 0 })
    expect((await post('/api/studio/note', { text: 'Use net revenue, not gross' })).status).toBe(200)
    expect(pushed).toEqual(['Message from the user in TinyPivot Studio: Use net revenue, not gross'])
    expect((await post('/api/studio/note', { text: '   ' })).status).toBe(400)
  })

  it('refuses writes without the Studio header', async () => {
    studio.agent.connect({ name: 'pi', push: () => true })
    expect((await post('/api/studio/note', { text: 'hi' }, {})).status).toBe(403)
    expect((await snapshot()).steps).toEqual([])
  })

  it('re-checks a step on request', async () => {
    await post('/api/studio/query', { sql: `SELECT region, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} GROUP BY 1` })
    const step = (await snapshot()).steps.at(-1)!
    const result = await post('/api/studio/verify', { stepId: step.id })
    expect(result).toMatchObject({ status: 200, body: { checks: [{ kind: 'rerun', ok: true }] } })
    expect((await post('/api/studio/verify', { stepId: 'nope' })).status).toBe(400)
  }, 30_000)

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

    studio.agent.connect({ name: 'pi', push: () => true })
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

describe('one theme everywhere', () => {
  it('follows the theme saved by any TinyPivot process, unless one is pinned for this process', async () => {
    const { DatasetStore: Store } = await import('../../packages/mcp/src/store')
    const here = new Store()
    const elsewhere = new Store()
    elsewhere.setVisualTheme('paper')
    expect(here.getVisualTheme()).toBe('paper')

    process.env.TINYPIVOT_THEME = 'crt-green'
    const pinned = new Store()
    delete process.env.TINYPIVOT_THEME
    expect(pinned.getVisualTheme()).toBe('crt-green')
    pinned.setVisualTheme('onebit')
    expect([pinned.getVisualTheme(), here.getVisualTheme()]).toEqual(['onebit', 'onebit'])
  })

  it('serves the page in the saved theme and repaints open tabs when it changes elsewhere', async () => {
    const store = new DatasetStore()
    store.setVisualTheme('paper')
    const handle = await startCompanionServer({ store, loadHtml: async () => '<html><head></head><body></body></html>', licenseKey: 'TP-MCPP-TESTKEY1-20991231', themeWatchMs: 50 })
    try {
      expect(await (await fetch(handle.url)).text()).toContain('<meta name="tinypivot-theme" content="paper">')

      const controller = new AbortController()
      const res = await fetch(`${handle.url}/api/events`, { signal: controller.signal })
      const reader = res.body!.getReader()
      new DatasetStore().setVisualTheme('greenbar')
      let text = ''
      while (!text.includes('"chartTheme":"greenbar"')) {
        const { value, done } = await reader.read()
        if (done)
          break
        text += new TextDecoder().decode(value)
      }
      expect(text).toContain('"chartTheme":"greenbar"')
      controller.abort()
    }
    finally {
      await handle.close()
    }
  }, 15_000)
})

describe('files dropped into the Studio', () => {
  it('saves them in the conversation\'s uploads folder and tells the agent where each one is', () => {
    const studio = new Studio(new DatasetStore())
    const csv = studio.saveFile('Q3 export (final).csv', Buffer.from('region,mrr\nEMEA,10\n'))
    const image = studio.saveFile('../../chart.png', Buffer.from([0x89, 0x50]))
    expect([csv.kind, image.kind]).toEqual(['data', 'image'])
    expect(image.name).toBe('chart.png')
    expect(fs.readFileSync(csv.path, 'utf8')).toContain('EMEA,10')
    expect(path.dirname(image.path)).toBe(path.dirname(csv.path))

    const pushed: string[] = []
    studio.agent.connect({ name: 'pi', push: (_note, text) => pushed.push(text) > 0 })
    studio.addNote('Does this match?', { fileIds: [csv.id, image.id, 'file-unknown'] })
    expect(pushed[0]).toBe([
      'Message from the user in TinyPivot Studio: Does this match?',
      `Attached data file: ${csv.path} (load it with load_file).`,
      `Attached image: ${image.path} (open it to see what the user means).`,
    ].join('\n'))
    expect(studio.recentSteps().at(-1)?.view).toBe('with Q3 export (final).csv, chart.png')
  })

  it('takes an upload over HTTP only with the Studio header, and refers to it by id', async () => {
    const studio = new Studio(new DatasetStore())
    const handle = await startCompanionServer({ store: studio.store, studio, loadHtml: async () => '' })
    try {
      const upload = (headers: Record<string, string>) => fetch(`${handle.url}/api/studio/upload`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent('orders.csv'), ...headers }, body: 'a,b\n1,2\n' })
      expect((await upload({})).status).toBe(403)
      const res = await upload({ [STUDIO_HEADER]: '1' })
      const { file } = await res.json() as { file: { id: string, path: string, kind: string } }
      expect(file.kind).toBe('data')
      expect(fs.readFileSync(file.path, 'utf8')).toBe('a,b\n1,2\n')
    }
    finally {
      await handle.close()
    }
  })
})

describe('links that belong to one conversation', () => {
  it('serves its own conversation, forwards another\'s to the server that has it, and says when one has stopped', async () => {
    const mine = new Studio(new DatasetStore())
    const theirs = new Studio(new DatasetStore())
    const a = await startCompanionServer({ store: mine.store, studio: mine, loadHtml: async () => '<html><head></head><body>studio</body></html>' })
    const b = await startCompanionServer({ store: theirs.store, studio: theirs, loadHtml: async () => '<html><head></head><body>studio</body></html>' })
    try {
      expect(a.link).toBe(`${a.url}/s/${mine.sessionId}`)
      expect((await fetch(a.link)).status).toBe(200)

      const forwarded = await fetch(`${a.url}/s/${theirs.sessionId}`, { redirect: 'manual' })
      expect(forwarded.status).toBe(302)
      expect(forwarded.headers.get('location')).toBe(b.link)

      await b.close()
      const stopped = await fetch(`${a.url}/s/${theirs.sessionId}`, { redirect: 'manual' })
      expect(stopped.status).toBe(410)
      expect(await stopped.text()).toContain('This TinyPivot Studio has stopped')
    }
    finally {
      await a.close()
      await b.close()
    }
  })
})
