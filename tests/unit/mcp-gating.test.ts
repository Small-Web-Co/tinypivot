import { afterEach, describe, expect, it } from 'vitest'
import { isMcpLicenseKey } from '../../packages/mcp/src/server'
import { DatasetStore, FREE_TIER_ROW_LIMIT } from '../../packages/mcp/src/store'
import { formatDatasetSummary, formatPivotSummary } from '../../packages/mcp/src/summary'
import { bucketRowCount, isTelemetryEnabled } from '../../packages/mcp/src/telemetry'

describe('mCP Free-Tier Row Gating & High-Trust Truncation', () => {
  it('truncates datasets above FREE_TIER_ROW_LIMIT and flags sourceTotalRows accurately', () => {
    const store = new DatasetStore({ maxRowsPerDataset: FREE_TIER_ROW_LIMIT })
    const rows = Array.from({ length: 3200 }, (_, i) => ({
      region: i % 2 === 0 ? 'North' : 'South',
      revenue: 10,
    }))

    const ds = store.register({
      name: 'Big Sales',
      source: 'sales.csv',
      ingestionMode: 'direct',
      rows,
    })

    expect(ds.rows.length).toBe(FREE_TIER_ROW_LIMIT)
    expect(ds.sourceTotalRows).toBe(3200)
    expect(ds.truncatedForFreeTier).toBe(true)

    const summary = formatDatasetSummary(ds)
    expect(summary).toContain('Free tier row limit')
    expect(summary).toContain('2,500')
    expect(summary).toContain('3,200')

    const pivotSummary = formatPivotSummary(ds, {
      rowFields: ['region'],
      columnFields: [],
      valueFields: [{ field: 'revenue', aggregation: 'sum' }],
      showRowTotals: true,
      showColumnTotals: true,
    })
    expect(pivotSummary).toContain('first 2,500 of 3,200 rows — Free tier subset')
  })

  it('does not truncate datasets within limit or on Pro tier', () => {
    const proStore = new DatasetStore({ maxRowsPerDataset: Number.POSITIVE_INFINITY })
    const rows = Array.from({ length: 3200 }, (_, i) => ({
      region: i % 2 === 0 ? 'North' : 'South',
      revenue: 10,
    }))

    const ds = proStore.register({
      name: 'Big Sales Pro',
      source: 'sales.csv',
      ingestionMode: 'direct',
      rows,
    })

    expect(ds.rows.length).toBe(3200)
    expect(ds.sourceTotalRows).toBe(3200)
    expect(ds.truncatedForFreeTier).toBe(false)
    expect(formatDatasetSummary(ds)).not.toContain('Free tier row limit')
  })
})

describe('mCP Privacy-First Telemetry Helpers', () => {
  const originalTelemetry = process.env.TINYPIVOT_TELEMETRY
  const originalDnt = process.env.DO_NOT_TRACK

  afterEach(() => {
    if (originalTelemetry === undefined)
      delete process.env.TINYPIVOT_TELEMETRY
    else
      process.env.TINYPIVOT_TELEMETRY = originalTelemetry

    if (originalDnt === undefined)
      delete process.env.DO_NOT_TRACK
    else
      process.env.DO_NOT_TRACK = originalDnt
  })

  it('buckets row counts without exposing exact counts', () => {
    expect(bucketRowCount(42)).toBe('<100')
    expect(bucketRowCount(500)).toBe('100-1k')
    expect(bucketRowCount(2500)).toBe('1k-2.5k')
    expect(bucketRowCount(5000)).toBe('2.5k-10k')
    expect(bucketRowCount(50000)).toBe('10k+')
  })

  it('honors TINYPIVOT_TELEMETRY=0 and DO_NOT_TRACK=1 opt-out flags', () => {
    delete process.env.TINYPIVOT_TELEMETRY
    delete process.env.DO_NOT_TRACK
    expect(isTelemetryEnabled()).toBe(true)

    process.env.TINYPIVOT_TELEMETRY = '0'
    expect(isTelemetryEnabled()).toBe(false)

    delete process.env.TINYPIVOT_TELEMETRY
    process.env.DO_NOT_TRACK = '1'
    expect(isTelemetryEnabled()).toBe(false)
  })
})

describe('mcp license scoping (prevents UI Library key arbitrage)', () => {
  it('accepts TP-MCPP and TP-MCPT keys for MCP Pro and rejects UI Library TP-PRO* keys', () => {
    expect(isMcpLicenseKey('TP-MCPP-abc123-20991231')).toBe(true)
    expect(isMcpLicenseKey('TP-MCPT-abc123-20991231')).toBe(true)
    expect(isMcpLicenseKey('TP-PRO1-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('TP-PROU-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('TP-PROT-abc123-20991231')).toBe(false)
    expect(isMcpLicenseKey('')).toBe(false)
    expect(isMcpLicenseKey(null)).toBe(false)
  })
})
