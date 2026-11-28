import type { StoredDataset } from '../../packages/mcp/src/store'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeGainReport, formatGainReport, parseScannedBytes } from '../../packages/mcp/src/gain'
import { HistoryStore, SESSIONS_DIR } from '../../packages/mcp/src/history'
import { DataMemoryStore } from '../../packages/mcp/src/memory'

function makeDataset(overrides: Partial<StoredDataset> = {}): StoredDataset {
  return {
    id: 'ds1',
    name: 'Acme Orders',
    source: 'BigQuery',
    ingestionMode: 'direct',
    rawBytes: 400_000,
    estimatedDatasetTokens: 100_000,
    sourceTotalRows: 25_000,
    truncatedForFreeTier: false,
    rows: [{ region: 'NA', revenue: 1200 }, { region: 'EMEA', revenue: 900 }],
    columns: [
      { name: 'region', type: 'string', sampleValues: ['NA', 'EMEA'], distinctCount: 2 },
      { name: 'revenue', type: 'number', sampleValues: ['1200', '900'], distinctCount: 2 },
    ],
    loadedAt: new Date().toISOString(),
    viewMode: 'grid',
    ...overrides,
  }
}

describe('tinypivot gain report', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-gain-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('parses scanned bytes from warehouse notes accurately', () => {
    expect(parseScannedBytes('BigQuery scanned 2.5 MB (limit 50 GB).')).toBe(2_500_000)
    expect(parseScannedBytes('BigQuery scanned 1.2 GB (limit 50 GB).')).toBe(1_200_000_000)
    expect(parseScannedBytes('BigQuery scanned 450 KB (limit 50 GB).')).toBe(450_000)
    expect(parseScannedBytes('no scan info')).toBe(0)
  })

  it('aggregates counted pulls, tokens saved, scanned bytes, traps caught, sessions and memory lessons', () => {
    const historyDir = path.join(tmpDir, 'history')
    const memPath = path.join(tmpDir, 'memory.json')
    const history = new HistoryStore({ dir: historyDir, enabled: true })

    const now = new Date('2026-11-27T18:00:00Z')
    const old = new Date('2026-09-01T18:00:00Z')

    history.record(makeDataset(), { kind: 'bigquery', source: 'SELECT region, SUM(amount) FROM orders GROUP BY 1', trapsCaught: 2, scannedBytes: 5_000_000 }, now)
    history.record(makeDataset({ name: 'Old Pull', estimatedDatasetTokens: 50_000, sourceTotalRows: 10_000 }), { kind: 'query', source: 'SELECT 1', trapsCaught: 1 }, old)

    // Session (.jsonl format used by Studio) with analyze + verified claims
    const sessDir = path.join(historyDir, SESSIONS_DIR)
    fs.mkdirSync(sessDir, { recursive: true })
    fs.writeFileSync(path.join(sessDir, 'sess-1.jsonl'), [
      JSON.stringify({ id: 's1', at: now.toISOString(), actor: 'agent', tool: 'profile' }),
      JSON.stringify({ id: 's2', at: now.toISOString(), actor: 'agent', tool: 'analyze', claims: [{ text: '42%', status: 'found' }, { text: '99%', status: 'not-found' }] }),
    ].join('\n'))

    // Memory lesson
    const mem = new DataMemoryStore({ filePath: memPath, enabled: true })
    mem.recordLesson({ tableHint: 'orders', key: 'audit:join_fanout:orders', kind: 'audit', summary: 'shipments fans out 1.5x on order_id' })

    // All-time report
    const all = computeGainReport({ historyDir, memoryPath: memPath, now })
    expect(all.pullsTotal).toBe(2)
    expect(all.pullsByKind).toEqual({ bigquery: 1, query: 1 })
    expect(all.countedTokensSaved).toBe(150_000)
    expect(all.scannedBytes).toBe(5_000_000)
    expect(all.trapsCaught).toBe(3)
    expect(all.learnedLessons).toBe(1)
    expect(all.sessions).toBe(1)
    expect(all.analyzeCalls).toBe(1)
    expect(all.profileCalls).toBe(1)
    expect(all.claimsBacked).toBe(1)
    expect(all.claimsVerified).toBe(2)

    const formatted = formatGainReport(all)
    expect(formatted).toContain('TinyPivot Gain — all local history')
    expect(formatted).toContain('150,000 (counted)')
    expect(formatted).toContain('3 audit traps caught · 1 lesson in memory')
    expect(formatted).toContain('5.0 MB')

    // 7-day window filters out the September pull
    const week = computeGainReport({ historyDir, memoryPath: memPath, days: 7, now })
    expect(week.pullsTotal).toBe(1)
    expect(week.countedTokensSaved).toBe(100_000)
    expect(week.trapsCaught).toBe(2)
  })
})
