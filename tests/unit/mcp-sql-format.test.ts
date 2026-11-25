// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatSql, shownSql, sqlName } from '../../packages/mcp/app/sqlFormat'
import { sqlfluffFormatter } from '../../packages/mcp/src/sql-format'
import { DatasetStore } from '../../packages/mcp/src/store'
import { Studio } from '../../packages/mcp/src/studio'

/** A stand-in for SQLFluff: answers --version, and "formats" by upper-casing and counting its runs. */
function fakeSqlfluff(): { command: string, runs: () => number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinypivot-fake-fluff-'))
  const counter = path.join(dir, 'runs')
  const command = path.join(dir, 'sqlfluff')
  fs.writeFileSync(command, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "sqlfluff, version 9.9.9"; exit 0; fi
echo run >> "${counter}"
tr 'a-z' 'A-Z'
exit 1
`, { mode: 0o755 })
  return { command, runs: () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0) }
}

describe('formatting SQL with SQLFluff', () => {
  it('formats with SQLFluff once per query, keeping what it printed even when some layout was left', async () => {
    const fluff = fakeSqlfluff()
    const format = sqlfluffFormatter(fluff.command)
    expect(await format('select 1')).toBe('SELECT 1')
    expect(await format('select 1')).toBe('SELECT 1')
    expect(fluff.runs()).toBe(1)
  })

  it('formats nothing when SQLFluff is missing or turned off', async () => {
    expect(await sqlfluffFormatter('off')('select 1')).toBeNull()
    expect(await sqlfluffFormatter(path.join(os.tmpdir(), 'no-such-sqlfluff'))('select 1')).toBeNull()
  })

  it('gives the Studio each step\'s SQL in SQLFluff\'s layout once it is ready', async () => {
    const studio = new Studio(new DatasetStore(), { formatSql: async sql => sql.toUpperCase() })
    await studio.runQuery({ sql: 'select 42 as answer', actor: 'user' })
    expect(studio.snapshot().steps[0].formattedSql).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(studio.snapshot().steps[0]).toMatchObject({ editableSql: 'select 42 as answer', formattedSql: 'SELECT 42 AS ANSWER' })
  })
})

describe('sQL in the browser', () => {
  it('shows SQLFluff\'s layout when the server sent one, and formats here otherwise', () => {
    expect(shownSql({ editableSql: 'select 1', formattedSql: 'SELECT\n    1' })).toBe('SELECT\n    1')
    expect(shownSql({ editableSql: 'select a from t' })).toBe(formatSql('select a from t'))
    expect(formatSql('select a from t')).toBe('SELECT\n  a\nFROM\n  t')
  })

  it('quotes a table or column name only when SQL needs it', () => {
    expect(sqlName('mrr_by_region')).toBe('mrr_by_region')
    expect(sqlName('2026_mrr_by_region')).toBe('"2026_mrr_by_region"')
    expect(sqlName('Order "ID"')).toBe('"Order ""ID"""')
  })
})
