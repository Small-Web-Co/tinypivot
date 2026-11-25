import type { StoredDataset } from '../../packages/mcp/src/store'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DuckDbRunner, quoteLiteral, toPlainValue, withinBudget } from '../../packages/mcp/src/duckdb'
import { formatHistoryList, HistoryStore, SESSIONS_DIR } from '../../packages/mcp/src/history'
import { createTinyPivotMcpServer, DatasetStore } from '../../packages/mcp/src/index'
import { formatProfile } from '../../packages/mcp/src/profile'
import { describeView, fileStepSql, Studio } from '../../packages/mcp/src/studio'

const CSV = [
  'period,region,channel,orders,mrr',
  '2026-02,EMEA,Partner,10,1000',
  '2026-02,APAC,Partner,8,800',
  '2026-03,EMEA,Partner,2,150',
  '2026-03,APAC,Sales,12,2400',
  '2026-03,EMEA,Sales,9,1800',
].join('\n')

let dir: string
let csvPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-analysis-'))
  csvPath = path.join(dir, 'orders.csv')
  fs.writeFileSync(csvPath, `${CSV}\n`)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function dataset(store = new DatasetStore()): StoredDataset {
  return store.register({
    name: 'Orders',
    source: 'test',
    rows: [
      { region: 'EMEA', mrr: 1000, day: '2026-02-01' },
      { region: 'APAC', mrr: 800, day: '2026-02-03' },
      { region: 'EMEA', mrr: null, day: '2026-03-01' },
      { region: 'EMEA', mrr: 1800, day: '2026-03-04' },
    ],
  })
}

describe('history', () => {
  it('saves ephemeral pulls with their rows, and files by path and filter only', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history') })
    const ds = dataset()

    const pulled = history.record(ds, { kind: 'data', source: 'stripe-mcp' }, new Date('2026-11-25T10:00:00Z'))
    const file = history.record(ds, { kind: 'file', source: csvPath, where: [{ field: 'region', equals: ['EMEA'] }] }, new Date('2026-11-25T11:00:00Z'))

    expect(pulled?.rowsFile).toBeDefined()
    expect(history.readRows(pulled!)).toEqual(ds.rows)
    expect(file?.rowsFile).toBeUndefined()
    expect(file?.where).toEqual([{ field: 'region', equals: ['EMEA'] }])
    expect(history.list().map(entry => entry.kind)).toEqual(['file', 'data'])
    expect(history.get(pulled!.id)?.name).toBe('Orders')
  })

  it('refuses ids that could reach outside the history folder', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history') })
    expect(history.get('../../etc/passwd')).toBeUndefined()
  })

  it('deletes pulls older than the retention window, rows included', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history'), retentionDays: 30 })
    const old = history.record(dataset(), { kind: 'data', source: 'api' }, new Date('2026-09-01T00:00:00Z'))!
    history.record(dataset(), { kind: 'data', source: 'api' }, new Date('2026-11-20T00:00:00Z'))

    expect(history.prune(new Date('2026-11-25T00:00:00Z'))).toBe(1)
    expect(history.list()).toHaveLength(1)
    expect(fs.existsSync(history.rowsPath(old)!)).toBe(false)
  })

  it('deletes conversation traces older than the retention window, and the old shared trace', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history'), retentionDays: 30 })
    const sessions = path.join(history.dir, SESSIONS_DIR)
    fs.mkdirSync(sessions, { recursive: true })
    const oldTrace = path.join(sessions, 'old.jsonl')
    const recentTrace = path.join(sessions, 'recent.jsonl')
    fs.writeFileSync(oldTrace, '{}\n')
    fs.writeFileSync(recentTrace, '{}\n')
    fs.writeFileSync(path.join(history.dir, 'trace.jsonl'), '{}\n')
    fs.utimesSync(oldTrace, new Date('2026-09-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))
    fs.utimesSync(recentTrace, new Date('2026-11-20T00:00:00Z'), new Date('2026-11-20T00:00:00Z'))

    history.prune(new Date('2026-11-25T00:00:00Z'))
    expect(fs.readdirSync(sessions)).toEqual(['recent.jsonl'])
    expect(fs.existsSync(path.join(history.dir, 'trace.jsonl'))).toBe(false)
  })

  it('records nothing when switched off', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history'), enabled: false })
    expect(history.record(dataset(), { kind: 'data', source: 'api' })).toBeNull()
    expect(history.list()).toEqual([])
  })

  it('lists one short line per pull', () => {
    const history = new HistoryStore({ dir: path.join(dir, 'history') })
    history.record(dataset(), { kind: 'data', source: 'api' }, new Date('2026-11-25T10:14:00Z'))
    expect(formatHistoryList(history.list())).toMatch(/`\d{8}-\d{6}-\d{3}-orders` 2026-11-25 10:14 · Orders · 4 rows · data/)
    expect(formatHistoryList([])).toBe('No saved pulls yet.')
  })
})

describe('profile', () => {
  it('describes ranges, empty shares and commonest values compactly', () => {
    const text = formatProfile(dataset())
    expect(text).toContain('4 rows')
    expect(text).toContain('`mrr` number · 25% empty · 800 to 1,800, mean 1,200')
    expect(text).toContain('`region` string · EMEA 75%, APAC 25%')
  })
})

describe('studio helpers', () => {
  it('describes what a dataset shows in one line', () => {
    const store = new DatasetStore()
    const ds = dataset(store)
    expect(describeView(ds)).toBe('stackedBar chart: sum(mrr) by day, split by region')
    store.updateView(ds.id, { viewMode: 'grid' })
    expect(describeView(store.get(ds.id)!)).toBe('table')
    store.updateView(ds.id, { viewMode: 'pivot', pivotConfig: { rowFields: ['region'], columnFields: [], valueFields: [{ field: 'mrr', aggregation: 'sum' }] } })
    expect(describeView(store.get(ds.id)!)).toBe('pivot: sum(mrr) · rows region')
  })

  it('writes a file load as the SQL that reproduces it', () => {
    expect(fileStepSql('/data/o.csv', [{ field: 'region', equals: ['EMEA', 'APAC'] }]))
      .toBe('SELECT *\nFROM \'/data/o.csv\'\nWHERE CAST("region" AS VARCHAR) IN (\'EMEA\', \'APAC\')')
  })
})

describe('duckdb helpers', () => {
  it('turns DuckDB values into plain ones TinyPivot can store', () => {
    expect(toPlainValue(42n)).toBe(42)
    expect(toPlainValue(2n ** 70n)).toBe('1180591620717411303424')
    expect(toPlainValue(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01')
    expect(toPlainValue({ a: 1n })).toBe('{"a":"1"}')
    expect(quoteLiteral('O\'Brien')).toBe('\'O\'\'Brien\'')
  })

  it('reports "pending" when work outlasts its budget, and the value otherwise', async () => {
    expect(await withinBudget(new Promise(() => {}), 5)).toBe('pending')
    expect(await withinBudget(Promise.resolve(7), 50)).toBe(7)
  })
})

describe('query, profile and history tools', () => {
  async function connect() {
    const history = new HistoryStore({ dir: path.join(dir, 'history') })
    const store = new DatasetStore()
    const studio = new Studio(store, { history, duck: new DuckDbRunner() })
    const { server } = createTinyPivotMcpServer({ licenseKey: 'TP-MCPP-TESTKEY1-20991231', store, studio })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'test-host', version: '1.0.0' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args })
      return { isError: Boolean(result.isError), text: (result.content as Array<{ text: string }>)[0].text }
    }
    return { call, history, studio, store }
  }

  it('records each step with its reason and SQL, and hands the user\'s notes to the agent once', async () => {
    const { call, studio } = await connect()
    const sql = `SELECT region, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} GROUP BY 1`
    await call('query', { sql, name: 'MRR by region', why: 'Compare regions before splitting by channel' })

    const step = studio.recentSteps().at(-1)!
    expect(step).toMatchObject({ actor: 'agent', tool: 'query', why: 'Compare regions before splitting by channel', sql, rows: 2 })
    expect(step.historyId).toBeDefined()

    studio.addNote('Exclude the Partner channel', { stepId: step.id })
    const reply = await call('profile', {})
    expect(reply.text).toContain('Notes from the user in TinyPivot Studio')
    expect(reply.text).toContain('- Exclude the Partner channel\n  About the step "Compare regions before splitting by channel" on dataset `mrr_by_region`, SQL: SELECT region')
    expect((await call('profile', {})).text).not.toContain('Notes from the user')
  }, 30_000)

  it('records the user\'s own queries as theirs and reloads the trace after a restart', async () => {
    const { studio, store, history } = await connect()
    const { dataset } = await studio.runQuery({ sql: `SELECT count(*) AS n FROM ${quoteLiteral(csvPath)}`, actor: 'user' })
    expect(dataset.name).toBe('Your query')
    expect(store.get()?.id).toBe(dataset.id)

    const restarted = new Studio(new DatasetStore(), { history, sessionId: studio.sessionId })
    expect(restarted.recentSteps().map(s => [s.actor, s.tool])).toEqual([['user', 'query']])

    // Another conversation on the same machine starts with its own, empty trace.
    expect(new Studio(new DatasetStore(), { history }).recentSteps()).toEqual([])
  }, 30_000)

  it('keeps a step\'s chart when the user edits its SQL, if the result still has its fields', async () => {
    const { call, studio } = await connect()
    const source = quoteLiteral(csvPath)
    await call('query', {
      sql: `SELECT period, sum(mrr) AS mrr FROM ${source} GROUP BY 1 ORDER BY 1`,
      chartConfig: { type: 'line', xAxisField: 'period', yAxisField: 'mrr', aggregation: 'sum' },
    })
    const step = studio.recentSteps().at(-1)!

    const edited = await studio.runQuery({ sql: `SELECT period, sum(mrr) AS mrr FROM ${source} WHERE channel <> 'Partner' GROUP BY 1`, actor: 'user', viewFromStepId: step.id })
    expect(describeView(edited.dataset)).toBe('line chart: sum(mrr) by period')

    const reshaped = await studio.runQuery({ sql: `SELECT region, count(*) AS n FROM ${source} GROUP BY 1`, actor: 'user', viewFromStepId: step.id })
    expect(describeView(reshaped.dataset)).not.toContain('line chart')
  }, 30_000)

  it('shows a step\'s dataset as it was after that step, even after later steps changed it', async () => {
    const { call, studio, store } = await connect()
    await call('query', {
      sql: `SELECT region, channel, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} GROUP BY 1, 2`,
      pivotConfig: { rowFields: ['region'], columnFields: ['channel'], valueFields: [{ field: 'mrr', aggregation: 'sum' }] },
    })
    const pivotStep = studio.recentSteps().at(-1)!
    await call('configure_chart', { type: 'bar', xAxisField: 'region', yAxisField: 'mrr', aggregation: 'sum' })
    expect(store.get()?.viewMode).toBe('chart')

    const shown = await studio.showStep(pivotStep.id)
    expect(describeView(shown)).toBe('pivot: sum(mrr) · rows region · columns channel')
    // Looking at a step is not a step.
    expect(studio.recentSteps().at(-1)?.tool).toBe('configure_chart')
    await expect(studio.showStep('nope')).rejects.toThrow('no data')
  }, 30_000)

  it('reopens a saved pull from the Studio with its view', async () => {
    const { call, studio } = await connect()
    await call('load_data', { name: 'Signups', rows: [{ month: 'Jan', n: 3 }, { month: 'Feb', n: 5 }], chartConfig: { type: 'line', xAxisField: 'month', yAxisField: 'n' } })
    const saved = studio.history.list(1)[0]

    const reopened = await studio.reopen(saved.id, { actor: 'user' })
    expect(reopened.rows).toHaveLength(2)
    expect(studio.recentSteps().at(-1)).toMatchObject({ actor: 'user', tool: 'history', view: 'line chart: sum(n) by month' })
    await expect(studio.reopen('missing', { actor: 'user' })).rejects.toThrow('No saved pull')
  })

  it('charts the result of SQL over a file, without its rows entering the reply', async () => {
    const { call } = await connect()
    const reply = await call('query', {
      sql: `SELECT channel, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} WHERE period = '2026-03' GROUP BY 1 ORDER BY 2 DESC;`,
      name: 'March MRR by channel',
      chartConfig: { type: 'bar', xAxisField: 'channel', yAxisField: 'mrr', aggregation: 'sum' },
    })
    expect(reply.isError).toBe(false)
    expect(reply.text).toContain('March MRR by channel')
    expect(reply.text).toContain('4,200')
    expect(reply.text).toContain('Partner')
  }, 30_000)

  it('rejects anything but a single SELECT', async () => {
    const { call } = await connect()
    for (const sql of [`COPY (SELECT 1) TO ${quoteLiteral(path.join(dir, 'out.csv'))}`, 'INSTALL httpfs', 'SELECT 1; SELECT 2']) {
      const reply = await call('query', { sql })
      expect(reply.isError, sql).toBe(true)
    }
    expect(fs.existsSync(path.join(dir, 'out.csv'))).toBe(false)
  }, 30_000)

  it('lets SQL use loaded datasets by id, including filtered files', async () => {
    const { call } = await connect()
    const loaded = await call('load_file', { filePath: csvPath, name: 'partner', where: [{ field: 'channel', equals: ['Partner'] }] })
    const id = /\(`([^`]+)`\)/.exec(loaded.text)![1]

    const reply = await call('query', { sql: `SELECT count(*) AS n, sum(mrr) AS mrr FROM ${id}`, viewMode: 'grid' })
    expect(reply.isError).toBe(false)
    // A small grid comes back as its rows, so the model can read the values directly.
    expect(reply.text).toContain('| n | mrr |')
    expect(reply.text).toContain('| 3 | 1,950 |')
    const profile = await call('profile', {})
    // The query result is the active dataset: one row holding 3 orders worth 1,950.
    expect(profile.text).toContain('`n` number · 3 to 3')
    expect(profile.text).toContain('`mrr` number · 1,950 to 1,950')
  }, 30_000)

  it('lists every pull and reopens one without re-reading its source', async () => {
    const { call } = await connect()
    await call('load_data', { name: 'Stripe charges', rows: [{ month: 'Jan', amount: 10 }, { month: 'Feb', amount: 20 }] })
    await call('query', { sql: `SELECT region, sum(mrr) AS mrr FROM ${quoteLiteral(csvPath)} GROUP BY 1`, name: 'MRR by region' })

    const list = await call('history', {})
    expect(list.text).toContain('Stripe charges')
    expect(list.text).toContain('MRR by region')

    const id = /`([^`]+stripe-charges)`/.exec(list.text)![1]
    const reopened = await call('history', { open: id })
    expect(reopened.isError).toBe(false)
    expect(reopened.text).toContain('Stripe charges')
    expect(reopened.text).toContain('2 rows')

    expect((await call('history', { open: 'nope' })).isError).toBe(true)
  }, 30_000)
})
