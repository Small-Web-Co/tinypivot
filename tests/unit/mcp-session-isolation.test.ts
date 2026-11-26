import type { DuckDbRunner } from '../../packages/mcp/src/duckdb'
// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startCompanionServer } from '../../packages/mcp/src/companion'
import { HistoryStore } from '../../packages/mcp/src/history'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'
import { STUDIO_HEADER } from '../../packages/mcp/src/studio-protocol'

const SESSION_A_ROWS = [
  { alpha_region: 'Alpha-West', alpha_rev: 900 },
  { alpha_region: 'Alpha-East', alpha_rev: 400 },
]

const SESSION_B_ROWS = [
  { beta_sku: 'Beta-Widget', beta_qty: 42 },
  { beta_sku: 'Beta-Gadget', beta_qty: 19 },
]

describe('strict session isolation, pinning, resuming, and HTML export', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-session-iso-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('keeps archived Session B completely isolated from live Session A (zero dataset, SQL, chat, or export bleed)', async () => {
    const history = new HistoryStore({ dir: tmpDir, enabled: true })
    const fakeDuck = {
      run: async (sql: string) => ({
        rows: sql.includes('LIMIT 1') ? SESSION_B_ROWS.slice(0, 1) : SESSION_B_ROWS,
        truncated: false,
      }),
    } as unknown as DuckDbRunner

    // 1) Create & persist Session B on disk (simulating yesterday's finished conversation)
    const storeB = new DatasetStore()
    const studioB = new Studio(storeB, { history, duck: fakeDuck, sessionId: 'session-beta' })
    const dsB = storeB.register({
      id: 'beta_table',
      name: 'Beta Inventory',
      source: 'SELECT * FROM beta_src',
      rows: SESSION_B_ROWS,
      viewMode: 'chart',
    })
    studioB.remember(dsB, { kind: 'query', source: 'SELECT * FROM beta_src' })
    const stepB = studioB.recordDatasetStep(dsB, {
      actor: 'agent',
      tool: 'query',
      ask: 'Analyze Beta SKU quantities',
      sql: 'SELECT * FROM beta_src',
    })
    studioB.reply('Beta-Widget leads with 42 units.')

    // 2) Start live Session A in its own DatasetStore + Studio + Companion server
    const storeA = new DatasetStore()
    const studioA = new Studio(storeA, { history, duck: fakeDuck, sessionId: 'session-alpha' })
    const dsA = storeA.register({
      id: 'alpha_table',
      name: 'Alpha Revenue',
      source: 'SELECT * FROM alpha_src',
      rows: SESSION_A_ROWS,
      viewMode: 'chart',
    })
    studioA.remember(dsA, { kind: 'query', source: 'SELECT * FROM alpha_src' })
    studioA.recordDatasetStep(dsA, {
      actor: 'agent',
      tool: 'query',
      ask: 'Analyze Alpha regional revenue',
      sql: 'SELECT * FROM alpha_src',
    })
    studioA.reply('Alpha-West leads with $900.')

    const server = await startCompanionServer({
      store: storeA,
      studio: studioA,
      loadHtml: async () => '<html><head></head><body>ok</body></html>',
      port: 0,
      idleStopMs: 0,
    })

    try {
      const headers = { 'Content-Type': 'application/json', [STUDIO_HEADER]: '1' }

      // Fetch Session B snapshot & state via explicit sessionId
      const snapBRes = await fetch(`${server.url}/api/studio?sessionId=session-beta`)
      expect(snapBRes.status).toBe(200)
      const snapB = await snapBRes.json() as { sessionId: string, liveSessionId: string, loadedIds: string[], steps: Array<{ datasetName?: string }> }
      expect(snapB.sessionId).toBe('session-beta')
      expect(snapB.liveSessionId).toBe('session-alpha')
      // Session B sees ONLY beta_table — ZERO alpha_table bleed!
      expect(snapB.loadedIds).toEqual(['beta_table'])
      expect(snapB.steps.some(s => s.datasetName === 'Alpha Revenue')).toBe(false)

      const stateBRes = await fetch(`${server.url}/api/state?sessionId=session-beta`)
      expect(stateBRes.status).toBe(200)
      const stateB = await stateBRes.json() as { datasetId: string, datasets: Array<{ id: string }> }
      expect(stateB.datasetId).toBe('beta_table')
      expect(stateB.datasets.map(d => d.id)).toEqual(['beta_table'])

      // Editing SQL inside Session B writes ONLY to session-beta and NEVER touches live session-alpha
      const editBRes = await fetch(`${server.url}/api/studio/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: 'session-beta', updateStepId: stepB.id, sql: 'SELECT * FROM beta_src LIMIT 1' }),
      })
      expect(editBRes.status).toBe(200)

      const snapARes = await fetch(`${server.url}/api/studio?sessionId=session-alpha`)
      const snapA = await snapARes.json() as { loadedIds: string[], steps: Array<{ sql?: string, datasetName?: string }> }
      expect(snapA.loadedIds).toEqual(['alpha_table'])
      expect(snapA.steps.some(s => s.datasetName === 'Beta Inventory')).toBe(false)
      expect(snapA.steps.some(s => s.sql?.includes('LIMIT 1'))).toBe(false)

      // Sending a chat note while viewing archived Session B MUST be blocked (409) so it cannot bleed into live Session A
      const noteBlocked = await fetch(`${server.url}/api/studio/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: 'session-beta', text: 'Should not fire into Alpha!' }),
      })
      expect(noteBlocked.status).toBe(409)

      // Standalone HTML export of Session B contains ONLY Session B data — zero Alpha strings!
      const htmlBRes = await fetch(`${server.url}/api/studio/export-html?sessionId=session-beta`)
      expect(htmlBRes.status).toBe(200)
      const htmlB = await htmlBRes.text()
      expect(htmlB).toContain('Analyze Beta SKU quantities')
      expect(htmlB).toContain('Beta-Widget')
      expect(htmlB).not.toContain('Alpha-West')
      expect(htmlB).not.toContain('Alpha Revenue')

      // Direct /s/session-beta URL serves Studio HTML (not 410) because the saved session exists on disk
      const pageRes = await fetch(`${server.url}/s/session-beta`)
      expect(pageRes.status).toBe(200)
    }
    finally {
      await server.close()
    }
  })

  it('protects pinned sessions and their referenced datasets from 30-day automatic pruning', () => {
    const history = new HistoryStore({ dir: tmpDir, enabled: true, retentionDays: 30 })
    const oldDate = new Date('2025-01-01T12:00:00Z')

    const makeSession = (sessionId: string, name: string, rows: Record<string, unknown>[]) => {
      const store = new DatasetStore()
      const studio = new Studio(store, { history, sessionId })
      const ds = store.register({ id: `${sessionId}_ds`, name, source: 'SELECT 1', rows })
      const entry = history.record(ds, { kind: 'query', source: 'SELECT 1' }, oldDate)!
      studio.record({
        actor: 'agent',
        tool: 'query',
        ask: `Question for ${name}`,
        datasetId: ds.id,
        datasetName: name,
        rows: rows.length,
        historyId: entry.id,
      })
      const tracePath = history.sessionTracePath(sessionId)!
      fs.utimesSync(tracePath, oldDate, oldDate)
      return entry.id
    }

    const pinnedEntryId = makeSession('sess-pinned', 'Pinned Report', SESSION_A_ROWS)
    const oldEntryId = makeSession('sess-ephemeral', 'Ephemeral Scratch', SESSION_B_ROWS)

    expect(history.setSessionPinned('sess-pinned', true)).toBe(true)
    expect(history.isSessionPinned('sess-pinned')).toBe(true)

    const removed = history.prune(new Date('2026-11-26T12:00:00Z'))
    expect(removed).toBe(1)

    // Pinned session & its backing rows survive pruning intact
    expect(history.hasSession('sess-pinned')).toBe(true)
    expect(history.get(pinnedEntryId)).toBeDefined()
    expect(history.readRows(history.get(pinnedEntryId)!)).toEqual(SESSION_A_ROWS)

    // Unpinned old session & its backing rows are cleanly pruned
    expect(history.hasSession('sess-ephemeral')).toBe(false)
    expect(history.get(oldEntryId)).toBeUndefined()
  })
})
