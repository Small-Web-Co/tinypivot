import type { StudioStep } from '../../packages/mcp/app/runs'
import { describe, expect, it } from 'vitest'
import { checkReport, claimSummary, groupRuns, lastStep, markClaims, runTitle, stageOf } from '../../packages/mcp/app/runs'
import { checkClaims, extractNumbers } from '../../packages/mcp/src/claims'

let clock = 0
function step(fields: Partial<StudioStep> & Pick<StudioStep, 'tool'>): StudioStep {
  clock += 1
  return { id: `s${clock}`, at: new Date(Date.UTC(2026, 10, 25, 10, clock)).toISOString(), actor: 'agent', ...fields }
}

describe('reading the numbers in an answer', () => {
  it('reads compact, grouped, signed and percent numbers, and skips years, dates, quarters and small counts', () => {
    const numbers = extractNumbers('In 2025 Q4 revenue hit $1.56M (+30%), 48,189,470 in all; 2026-03 fell by -3.5K across 4 regions.')
    expect(numbers.map(n => [n.text, n.value, n.percent])).toEqual([
      ['$1.56M', 1_560_000, false],
      ['30%', 30, true],
      ['48,189,470', 48_189_470, false],
      ['-3.5K', -3_500, false],
    ])
  })

  it('allows for the rounding the agent wrote', () => {
    const [compact] = extractNumbers('1.20M')
    expect(compact.tolerance).toBe(5_000)
    const sources = [{ name: 'Q', rows: [{ quarter: 'Q1', revenue: 1_204_000 }, { quarter: 'Q2', revenue: 2_000_000 }] }]
    expect(checkClaims('Q1 was 1.20M', sources)).toEqual([{ text: '1.20M', status: 'found', where: 'revenue · Q1' }])
    expect(checkClaims('Q1 was 1.21M', sources)).toEqual([{ text: '1.21M', status: 'not-found' }])
  })

  it('finds the totals a pivot shows, but does not count a stray raw cell or a plain cell as a percentage', () => {
    const long = [
      { region: 'EMEA', channel: 'Sales', mrr: 700, seats: 25 },
      { region: 'EMEA', channel: 'Partner', mrr: 300, seats: 12 },
      { region: 'APAC', channel: 'Sales', mrr: 500, seats: 40 },
    ]
    expect(checkClaims('Sales brings 1,200 and EMEA 1,000; Sales is 80.0% of MRR. Growth was 25%.', [{ name: 'By region', rows: long }])).toEqual([
      { text: '1,200', status: 'found', where: 'mrr · Sales (all channel)' },
      { text: '1,000', status: 'found', where: 'mrr · EMEA (all region)' },
      { text: '80.0%', status: 'found', where: 'share of mrr · Sales' },
      { text: '25%', status: 'unchecked' },
    ])

    const raw = Array.from({ length: 2_000 }, (_, i) => ({ id: `o${i}`, plan: i % 4 ? 'Team' : 'Starter', amount: i }))
    expect(checkClaims('One order was 1,234; all came to 1,999,000; Starter is 25%.', [{ name: 'Orders', rows: raw }])).toEqual([
      { text: '1,234', status: 'not-found' },
      { text: '1,999,000', status: 'found', where: 'amount · total of Orders' },
      { text: '25%', status: 'unchecked' },
    ])
    // Grouped the way its chart is, the raw table backs that chart's totals.
    expect(checkClaims('Starter is 25%.', [{ name: 'Orders', rows: raw, dimensions: ['plan'] }])[0]).toMatchObject({ status: 'found', where: 'share of amount · Starter' })
  })

  it('reads the whole table, the view\'s measure first, and leaves links, code and arithmetic alone', () => {
    const regions = ['EMEA', 'APAC', 'LATAM', 'North America']
    // More rows than a first slice would cover, and seats that match mrr everywhere: the total,
    // the row count and the share must come from all the rows and from the measure the view shows.
    const rows = Array.from({ length: 30_000 }, (_, i) => ({ region: regions[i % 4], seats: i % 4 === 2 ? 1 : 3, mrr: i % 4 === 2 ? 1 : 3 }))
    const answer = 'MRR totals 75,000 across 30,000 rows; LATAM is 10.0% of it, so about 10 months × 12. Studio: http://127.0.0.1:47391/s/20261125-x, see `~/.config/tinypivot/v1.2`.'
    expect(checkClaims(answer, [{ name: 'Orders', rows, dimensions: ['region'], measures: ['mrr'] }])).toEqual([
      { text: '75,000', status: 'found', where: 'mrr · total of Orders' },
      { text: '30,000', status: 'found', where: 'rows in Orders' },
      { text: '10.0%', status: 'found', where: 'share of mrr · LATAM' },
      { text: '10', status: 'unchecked' },
      { text: '12', status: 'unchecked' },
    ])
  })

  it('backs the gaps and period changes an answer works out from a small summary', () => {
    const wide = [
      { region: 'North America', mrr_2025: 14_750_000, mrr_2026: 17_120_000, seats: 900 },
      { region: 'EMEA', mrr_2025: 11_110_000, mrr_2026: 14_960_000, seats: 700 },
    ]
    const answer = 'EMEA grew +$3.85M (+34.7%) and is now within $2.2M of North America, a gap that was $3.6M. Seats moved 30%. Revenue fell -$9.9M.'
    expect(checkClaims(answer, [{ name: 'By region', rows: wide }])).toEqual([
      { text: '$3.85M', status: 'found', where: 'change in mrr_2025 → mrr_2026 · EMEA' },
      { text: '34.7%', status: 'found', where: 'change in mrr_2025 → mrr_2026 · EMEA' },
      { text: '$2.2M', status: 'found', where: 'mrr_2026 · North America − EMEA' },
      { text: '$3.6M', status: 'found', where: 'mrr_2025 · North America − EMEA' },
      { text: '30%', status: 'unchecked' },
      { text: '-$9.9M', status: 'not-found' },
    ])
    // Long periods: rows that share a label are one item in two periods.
    const long = [{ plan: 'Team', year: '2025', mrr: 2_080_000 }, { plan: 'Team', year: '2026', mrr: 2_699_000 }]
    expect(checkClaims('Team rose 29.8%, +$619K.', [{ name: 'Slope', rows: long }]).map(claim => claim.status)).toEqual(['found', 'found'])
  })

  it('checks nothing when there is no data to check against', () => {
    expect(checkClaims('Revenue was 1.2M', [])).toEqual([])
  })
})

describe('the trace as questions', () => {
  const steps = [
    step({ tool: 'load_file', ask: 'Chart MRR by month', why: 'Load the orders', file: '/data/acme-orders.csv', datasetId: 'a', rows: 44714 }),
    step({ tool: 'configure_chart', why: 'Line by month', datasetId: 'a' }),
    step({ tool: 'note', actor: 'user', why: 'Split Partner by month' }),
    step({ tool: 'query', why: 'Partner by month', sql: 'SELECT …', datasetId: 'b' }),
    step({ tool: 'reply', why: 'March is the problem: 163K.', claims: [{ text: '163K', status: 'found', where: 'mrr · 2026-03' }] }),
    step({ tool: 'query', why: 'Plan growth', ask: 'Which plan grew fastest?', datasetId: 'c' }),
  ]

  it('starts a question at each new request or Studio message, and keeps the steps that answered it together', () => {
    const runs = groupRuns(steps)
    expect(runs.map(run => [run.prompt, run.askedIn, run.steps.map(s => s.tool)])).toEqual([
      ['Chart MRR by month', 'terminal', ['load_file', 'configure_chart']],
      ['Split Partner by month', 'studio', ['note', 'query', 'reply']],
      ['Which plan grew fastest?', 'terminal', ['query']],
    ])
    expect(lastStep(runs[1], s => s.tool === 'reply')?.why).toBe('March is the problem: 163K.')
  })

  it('names a question by the agent\'s first reason when nobody recorded it', () => {
    const [run] = groupRuns([step({ tool: 'load_data', why: 'Rows from the API' })])
    expect([run.askedIn, runTitle(run)]).toEqual(['unknown', 'Rows from the API'])
  })

  it('places each step on the path from source to answer', () => {
    expect(steps.map(stageOf)).toEqual(['source', 'view', 'message', 'transform', 'answer', 'transform'])
  })

  it('marks the quoted numbers in the answer, in order', () => {
    const claims = [{ text: '1.20M', status: 'found' as const, where: 'q1' }, { text: '9%', status: 'unchecked' as const }]
    expect(markClaims('Q1 was 1.20M, up 9%.', claims)).toEqual(['Q1 was ', claims[0], ', up ', claims[1], '.'])
    expect(claimSummary(claims).text).toBe('1 of 1 number found in the data')
  })
})

describe('the report after checking a question', () => {
  const run = groupRuns([
    step({ tool: 'load_file', ask: 'MRR by region', file: '/data/acme.csv', datasetId: 'a', fingerprint: { rows: 5, hash: 'x' }, source: { file: '/data/acme.csv', bytes: 10, modifiedAt: 'then' } }),
    step({ tool: 'query', sql: 'SELECT …', datasetId: 'b', fingerprint: { rows: 4, hash: 'y' } }),
    step({ tool: 'reply', why: 'EMEA leads at 1.4M; LATAM 5.4M.', claims: [{ text: '1.4M', status: 'found' }, { text: '5.4M', status: 'not-found' }] }),
  ])[0]

  it('rolls up what held and names what did not', () => {
    const [load, query] = run.steps
    const report = checkReport(run, {
      [load.id]: [{ kind: 'source', ok: true, detail: 'The file is unchanged since this step.' }, { kind: 'rerun', ok: true, detail: '…' }],
      [query.id]: [{ kind: 'rerun', ok: false, detail: 'Different result: 3 rows now, 4 then.' }],
    })
    expect(report).toEqual([
      { ok: true, text: 'Source file unchanged' },
      { ok: false, text: 'Different result: 3 rows now, 4 then.' },
      { ok: false, text: '1 of 2 numbers in the answer found in the data; not found: 5.4M' },
    ])
  })

  it('says so when every step and number held', () => {
    const [load, query] = run.steps
    const allFound = { ...run, steps: run.steps.map(s => (s.tool === 'reply' ? { ...s, claims: [{ text: '1.4M', status: 'found' as const }] } : s)) }
    expect(checkReport(allFound, {
      [load.id]: [{ kind: 'rerun', ok: true, detail: '' }],
      [query.id]: [{ kind: 'rerun', ok: true, detail: '' }],
    })).toEqual([
      { ok: true, text: '2 steps gave the same rows again' },
      { ok: true, text: 'The number in the answer was found in the data' },
    ])
  })
})
