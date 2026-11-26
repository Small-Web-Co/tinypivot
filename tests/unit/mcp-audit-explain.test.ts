// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditNonAdditiveSql, auditQueryResult, formatAuditWarnings, formatSqlRepairHint } from '../../packages/mcp/src/audit'
import { DuckDbRunner } from '../../packages/mcp/src/duckdb'
import { explainMetricChange } from '../../packages/mcp/src/explain'
import { HistoryStore } from '../../packages/mcp/src/history'
import { DataMemoryStore } from '../../packages/mcp/src/memory'
import { formatProfile, formatProLoadTraps } from '../../packages/mcp/src/profile'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'

describe('pro SQL Audit Oracle & Repair Hints', () => {
  it('flags non-additive SUM and unweighted AVG of rate/percentage columns, and stays silent on weighted ratios', () => {
    const sumWarn = auditNonAdditiveSql('SELECT region, SUM(gross_margin_pct) AS total_margin FROM sales GROUP BY region')
    expect(sumWarn.some(w => w.kind === 'non_additive_sql' && w.title === 'NON-ADDITIVE SUM')).toBe(true)

    const avgWarn = auditNonAdditiveSql('SELECT region, AVG(conversion_rate) AS conv FROM funnel GROUP BY region')
    expect(avgWarn.some(w => w.kind === 'non_additive_sql' && w.title === 'UNWEIGHTED AVERAGE OF RATES')).toBe(true)

    const clean = auditNonAdditiveSql('SELECT region, SUM(converted) / NULLIF(SUM(visits), 0) AS conv_rate FROM funnel GROUP BY region')
    expect(clean).toEqual([])
  })

  it('detects join fan-out, partial trailing month, zero-row case mismatch, and silent NULL exclusions in DuckDB, and stays silent once fixed', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-audit-'))
    try {
      const ordersPath = path.join(tmpDir, 'orders.csv')
      const repsPath = path.join(tmpDir, 'reps.csv')

      // Orders spanning Jan-Mar full months + partial April (only 6 days) + NULL discount codes
      const orderLines = ['order_id,order_date,account_id,region,discount_code,revenue']
      let id = 1
      for (const [ym, days] of [['2026-01', 28], ['2026-02', 26], ['2026-03', 29], ['2026-04', 6]] as const) {
        for (let d = 1; d <= days; d++) {
          const day = String(d).padStart(2, '0')
          const acct = `A${(id % 3) + 1}`
          const region = id % 2 === 0 ? 'West' : 'East'
          const code = id % 3 === 0 ? '' : 'PROMO20'
          orderLines.push(`${id},${ym}-${day},${acct},${region},${code},${1000 + id * 10}`)
          id += 1
        }
      }
      fs.writeFileSync(ordersPath, `${orderLines.join('\n')}\n`, 'utf8')
      // Account A1 and A2 each have TWO reps -> M:N join fan-out!
      fs.writeFileSync(repsPath, [
        'account_id,rep_name',
        'A1,Alice',
        'A1,Bob',
        'A2,Carol',
        'A2,Dan',
        'A3,Eve',
      ].join('\n'), 'utf8')

      const store = new DatasetStore()
      const history = new HistoryStore({ dir: path.join(tmpDir, 'hist'), enabled: true })
      const duck = new DuckDbRunner()
      const studio = new Studio(store, { history, duck })

      const ordersDs = await store.loadFromFile(ordersPath, 'orders')
      const repsDs = await store.loadFromFile(repsPath, 'reps')
      studio.remember(ordersDs, { kind: 'file', source: ordersPath })
      studio.remember(repsDs, { kind: 'file', source: repsPath })
      const views = studio.queryViews()

      // 1) M:N join fan-out caught on naive join, and clears when deduplicated in a CTE
      const badJoinSql = 'SELECT o.region, SUM(o.revenue) AS revenue FROM orders o JOIN reps r ON o.account_id = r.account_id GROUP BY 1'
      const badJoinRes = await studio.runQuery({ sql: badJoinSql, actor: 'agent' })
      const joinWarnings = await auditQueryResult({ sql: badJoinSql, dataset: badJoinRes.dataset, duck, views })
      expect(joinWarnings.some(w => w.kind === 'join_fanout')).toBe(true)
      expect(formatAuditWarnings(joinWarnings)).toContain('JOIN FAN-OUT')

      const fixedJoinSql = 'WITH dedup AS (SELECT DISTINCT account_id FROM reps) SELECT o.region, SUM(o.revenue) AS revenue FROM orders o JOIN dedup d ON o.account_id = d.account_id GROUP BY 1'
      const fixedJoinRes = await studio.runQuery({ sql: fixedJoinSql, actor: 'agent' })
      const fixedJoinWarnings = await auditQueryResult({ sql: fixedJoinSql, dataset: fixedJoinRes.dataset, duck, views })
      expect(fixedJoinWarnings).toEqual([])

      // 2) Partial trailing month caught when April (6 days) is included, and clears when filtered out
      const partialSql = 'SELECT STRFTIME(CAST(order_date AS DATE), \'%Y-%m\') AS month, SUM(revenue) AS rev FROM orders GROUP BY 1 ORDER BY 1'
      const partialRes = await studio.runQuery({ sql: partialSql, actor: 'agent' })
      const partialWarnings = await auditQueryResult({ sql: partialSql, dataset: partialRes.dataset, duck, views })
      expect(partialWarnings.some(w => w.kind === 'partial_period')).toBe(true)

      const fullMonthsSql = 'SELECT STRFTIME(CAST(order_date AS DATE), \'%Y-%m\') AS month, SUM(revenue) AS rev FROM orders WHERE order_date < \'2026-04-01\' GROUP BY 1 ORDER BY 1'
      const fullRes = await studio.runQuery({ sql: fullMonthsSql, actor: 'agent' })
      const fullWarnings = await auditQueryResult({ sql: fullMonthsSql, dataset: fullRes.dataset, duck, views })
      expect(fullWarnings).toEqual([])

      // 3) Case-mismatched 0-row filter suggests exact value 'West'
      const emptySql = 'SELECT region, SUM(revenue) AS rev FROM orders WHERE region = \'west\' GROUP BY 1'
      const emptyRes = await studio.runQuery({ sql: emptySql, actor: 'agent' })
      const emptyWarnings = await auditQueryResult({ sql: emptySql, dataset: emptyRes.dataset, duck, views })
      expect(emptyWarnings.some(w => w.kind === 'empty_filter' && w.suggestion.includes('\'West\''))).toBe(true)

      // 4) Silent NULL exclusion on != caught when discount_code has NULLs, clears with IS DISTINCT FROM
      const neqSql = 'SELECT region, SUM(revenue) AS rev FROM orders WHERE discount_code != \'PROMO20\' GROUP BY 1'
      const neqRes = await studio.runQuery({ sql: neqSql, actor: 'agent' })
      const neqWarnings = await auditQueryResult({ sql: neqSql, dataset: neqRes.dataset, duck, views })
      expect(neqWarnings.some(w => w.kind === 'null_exclusion')).toBe(true)

      const nullSafeSql = 'SELECT region, SUM(revenue) AS rev FROM orders WHERE discount_code IS DISTINCT FROM \'PROMO20\' GROUP BY 1'
      const nullSafeRes = await studio.runQuery({ sql: nullSafeSql, actor: 'agent' })
      const nullSafeWarnings = await auditQueryResult({ sql: nullSafeSql, dataset: nullSafeRes.dataset, duck, views })
      expect(nullSafeWarnings).toEqual([])

      // 5) SQL repair hints catch dialect mistakes & misspelled columns
      const repair = formatSqlRepairHint(
        'Binder Error: Referenced column "revnue" not found in FROM clause!',
        'SELECT TOP 5 revnue FROM orders',
        store,
        'default',
      )
      expect(repair).toContain('LIMIT N')
      expect(repair).toContain('`revenue`')
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('pro Relational Profile & Deterministic explain_change', () => {
  it('gates relational grain, join fan-out, and partial-period notes behind Pro in formatProfile', () => {
    const store = new DatasetStore()
    const orders = store.register({
      id: 'orders',
      name: 'Orders',
      source: 'orders.csv',
      rows: [
        { order_id: '1', account_id: 'A1', margin_pct: 42.1 },
        { order_id: '2', account_id: 'A1', margin_pct: 38.4 },
        { order_id: '3', account_id: 'A2', margin_pct: 51.0 },
      ],
    })
    const reps = store.register({
      id: 'reps',
      name: 'Reps',
      source: 'reps.csv',
      rows: [
        { account_id: 'A1', rep: 'Alice' },
        { account_id: 'A1', rep: 'Bob' },
        { account_id: 'A2', rep: 'Carol' },
      ],
    })

    const freeText = formatProfile(orders, { isPro: false, peerDatasets: [reps] })
    expect(freeText).not.toContain('Relational & Guardrail Summary')

    const proText = formatProfile(orders, { isPro: true, peerDatasets: [reps] })
    expect(proText).toContain('Relational & Guardrail Summary (Pro)')
    expect(proText).toContain('unique on `order_id`')
    expect(proText).toContain('M:N ⚠️ fan-out risk')
    expect(proText).toContain('`margin_pct`')
  })

  it('detects Simpson\'s paradox via exact Kitagawa Mix-vs-Rate decomposition', () => {
    const store = new DatasetStore()
    // Q3 -> Q4: BOTH Enterprise (+1pp: 10%->11%) and Self-Serve (+0.5pp: 2%->2.5%) improved!
    // Yet blended conversion rate DROPPED from 6.0% to 4.2% purely due to Self-Serve volume surging!
    const funnel = store.register({
      id: 'funnel',
      name: 'Funnel',
      source: 'funnel.csv',
      rows: [
        { period: '2026-Q3', segment: 'Enterprise', visits: 1000, converted: 100 },
        { period: '2026-Q3', segment: 'Self-Serve', visits: 1000, converted: 20 },
        { period: '2026-Q4', segment: 'Enterprise', visits: 1000, converted: 110 },
        { period: '2026-Q4', segment: 'Self-Serve', visits: 4000, converted: 100 },
      ],
    })

    const res = explainMetricChange(funnel, {
      numerator: 'converted',
      denominator: 'visits',
      periodField: 'period',
      fromPeriod: '2026-Q3',
      toPeriod: '2026-Q4',
    })

    expect(res.mode).toBe('ratio')
    expect(res.fromTotal).toBeCloseTo(6.0, 2)
    expect(res.toTotal).toBeCloseTo(4.2, 2)
    expect(res.delta).toBeCloseTo(-1.8, 2)
    expect(res.simpsonsParadox).toBe(true)
    const segDim = res.mixRateByDimension?.find(d => d.dimension === 'segment')
    expect(segDim).toBeDefined()
    // Rate effect is POSITIVE, mix effect is strongly NEGATIVE, and rate + mix === exact delta
    expect(segDim!.rateEffect).toBeGreaterThan(0)
    expect(segDim!.mixEffect).toBeLessThan(0)
    expect(segDim!.rateEffect + segDim!.mixEffect).toBeCloseTo(res.delta, 6)
    expect(res.summaryText).toContain('SIMPSON\'S PARADOX')
  })

  it('detects whale outlier distortion in additive period-over-period decomposition', () => {
    const store = new DatasetStore()
    const rows: Record<string, unknown>[] = []
    for (let i = 1; i <= 25; i++) {
      rows.push({ order_id: `Q3-${i}`, period: 'Q3', region: i % 2 === 0 ? 'West' : 'East', revenue: 1000 })
      // Q4 is slightly UP (+50/order) on 24 orders, except 1 massive -$5,000 refund in East!
      rows.push({ order_id: `Q4-${i}`, period: 'Q4', region: i % 2 === 0 ? 'West' : 'East', revenue: i === 1 ? -5000 : 1050 })
    }
    const ds = store.register({ id: 'orders', name: 'Orders', source: 'orders.csv', rows })

    const res = explainMetricChange(ds, {
      metric: 'revenue',
      periodField: 'period',
      fromPeriod: 'Q3',
      toPeriod: 'Q4',
    })

    expect(res.mode).toBe('additive')
    expect(res.delta).toBeLessThan(0) // Headline looks negative (-4,800)
    expect(res.outlierCheck?.triggered).toBe(true)
    expect(res.outlierCheck!.trimmedDelta).toBeGreaterThan(0) // Excluding the 1 outlier, Q4 actually grew!
    expect(res.summaryText).toContain('OUTLIER DISTORTION DETECTED')
  })

  it('persists and recalls recursive schema lessons across sessions and emits Turn-1 Pro load traps', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-mem-'))
    try {
      const memPath = path.join(tmpDir, 'memory.json')
      const mem1 = new DataMemoryStore({ filePath: memPath, enabled: true })
      mem1.recordLesson({
        tableHint: '/data/orders_promo.csv',
        columns: ['order_id', 'discount_code', 'revenue'],
        key: 'audit:null_exclusion:orders_promo',
        kind: 'audit',
        summary: 'SILENT NULL EXCLUSION: discount_code is 40% NULL — use IS DISTINCT FROM.',
      })
      mem1.recordLesson({
        tableHint: '/data/orders_promo.csv',
        key: 'edit:orders_promo',
        kind: 'user_edit',
        summary: 'User-edited SQL for orders_promo: always exclude is_test = true',
      })

      // Brand-new session reading the same disk memory file recalls user edits first, then audit lessons
      const mem2 = new DataMemoryStore({ filePath: memPath, enabled: true })
      const block = mem2.formatRecall(['orders_promo.csv'], ['order_id', 'discount_code', 'revenue'])
      expect(block).toContain('LEARNED MEMORY')
      expect(block).toContain('Verified rule')
      expect(block).toContain('IS DISTINCT FROM')

      // Turn-1 Pro load traps stay silent on clean data and flag NULLs + non-additive columns on messy data
      const store = new DatasetStore()
      const clean = store.register({ id: 'clean', name: 'Clean', source: 'clean.csv', rows: [{ id: '1', revenue: 100 }] })
      expect(formatProLoadTraps(clean)).toBe('')

      const messy = store.register({
        id: 'messy',
        name: 'Messy',
        source: 'messy.csv',
        rows: [
          { order_id: '1', discount_code: '', margin_pct: 40 },
          { order_id: '2', discount_code: 'PROMO', margin_pct: 35 },
        ],
      })
      const trapBlock = formatProLoadTraps(messy)
      expect(trapBlock).toContain('PRO DATA GUARD')
      expect(trapBlock).toContain('discount_code')
      expect(trapBlock).toContain('margin_pct')

      // Duplicate event IDs, mixed currency, and Turn-1 smart routing shortcut
      const dupCurr = store.register({
        id: 'dup_curr',
        name: 'DupCurr',
        source: 'tx.csv',
        rows: [
          ...Array.from({ length: 12 }, (_, idx) => ({
            event_id: `E${idx % 8}`,
            currency: idx % 2 === 0 ? 'USD' : 'JPY',
            amount: idx % 2 === 0 ? 50 : 7500,
          })),
        ],
      })
      const dupCurrBrief = formatProLoadTraps(dupCurr)
      expect(dupCurrBrief).toContain('Duplicate `event_id`')
      expect(dupCurrBrief).toContain('Mixed currencies')

      const abDs = store.register({
        id: 'ab',
        name: 'AB',
        source: 'exp.csv',
        rows: [
          { variant: 'control', converted: 10, trials: 100 },
          { variant: 'treatment', converted: 12, trials: 100 },
        ],
      })
      expect(formatProLoadTraps(abDs)).toContain('analyze(method="ab_test")')
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('routes raw SQL queries on cohort files to Pro analyze(cohort_retention) via audit warnings', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-audit-route-'))
    try {
      const cohortCsv = path.join(tmpDir, 'cohorts.csv')
      fs.writeFileSync(cohortCsv, 'user_id,signup_month,activity_month\nu1,2026-01,2026-01\nu1,2026-01,2026-02\nu2,2026-02,2026-02\n')
      const duck = new DuckDbRunner()
      const sql = `SELECT signup_month, COUNT(DISTINCT user_id) AS users FROM '${cohortCsv}' GROUP BY 1`
      const ds = new DatasetStore().register({ id: 'q', name: 'Q', source: sql, rows: [{ signup_month: '2026-01', users: 1 }] })
      const warnings = await auditQueryResult({ sql, dataset: ds, duck, views: [], deep: true })
      expect(warnings.some(w => w.kind === 'analyze_hint' && w.suggestion.includes('cohort_retention'))).toBe(true)
      const rankWarnings = auditNonAdditiveSql('SELECT AVG(position) AS avg_pos FROM gsc_queries')
      expect(rankWarnings.some(w => w.kind === 'non_additive_sql' && w.detail.includes('AVG(position)'))).toBe(true)
    }
    finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 30_000)
})
