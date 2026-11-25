import { describe, expect, it } from 'vitest'
import { formatSql, sqlOneLine } from '../../packages/mcp/app/sqlFormat'

describe('sQL as the Studio shows it', () => {
  it('puts each clause on its own line with keywords in capitals', () => {
    const formatted = formatSql('select region, sum(mrr) as mrr from \'/data/acme.csv\' where year = 2026 group by 1')
    expect(formatted.split('\n')[0]).toBe('SELECT')
    expect(formatted).toContain('\nFROM\n  \'/data/acme.csv\'\nWHERE\n  year = 2026\nGROUP BY\n  1')
    expect(formatted).toContain('sum(mrr) AS mrr')
  })

  it('shows a query it cannot read exactly as written', () => {
    expect(formatSql('  SELECT ((( FROM  ')).toBe('SELECT ((( FROM')
  })

  it('folds a query onto one line for the step summary', () => {
    expect(sqlOneLine('SELECT\n  region\nFROM\n  t')).toBe('SELECT region FROM t')
  })
})
