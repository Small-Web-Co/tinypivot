import { describe, expect, it } from 'vitest'
import { pgNumber, pgTypeParser } from '../../packages/mcp/src/postgres'

describe('postgres values TinyPivot can total and chart', () => {
  it('reads COUNT and SUM results as numbers, keeping integers too large to hold exactly as text', () => {
    expect(pgNumber('16553')).toBe(16553)
    expect(pgNumber('34930148.50')).toBe(34930148.5)
    expect(pgNumber('-12')).toBe(-12)
    expect(pgNumber('9223372036854775807')).toBe('9223372036854775807')
    expect(pgNumber('NaN')).toBe('NaN')
  })

  it('keeps dates and timestamps as written, and defers other types to pg', () => {
    const fallback = (oid: number) => (text: string) => `pg:${oid}:${text}`
    const parse = pgTypeParser(fallback)
    expect(parse(20)('42')).toBe(42)
    expect(parse(1700)('1.5')).toBe(1.5)
    expect(parse(1082)('2025-01-24')).toBe('2025-01-24')
    expect(parse(1114)('2025-01-24 10:30:00')).toBe('2025-01-24 10:30:00')
    expect(parse(25)('text')).toBe('pg:25:text')
  })
})
