import { describe, expect, it } from 'vitest'
import { parseSqliteDateTime, toSqliteDateTime } from './sqlite-time'

const AT = Date.UTC(2026, 9, 29, 14, 15, 16, 456)

describe('toSqliteDateTime', () => {
  it("truncates to seconds by default, like datetime('now')", () => {
    expect(toSqliteDateTime(AT)).toBe('2026-10-29 14:15:16')
  })

  it('keeps a non-zero millisecond fraction when asked', () => {
    expect(toSqliteDateTime(AT, 'milliseconds')).toBe('2026-10-29 14:15:16.456')
  })

  it('drops a zero millisecond fraction', () => {
    expect(toSqliteDateTime(Date.UTC(2026, 9, 29, 14, 15, 16), 'milliseconds')).toBe(
      '2026-10-29 14:15:16',
    )
  })
})

describe('parseSqliteDateTime', () => {
  it('reads the text as UTC', () => {
    expect(parseSqliteDateTime('2026-10-29 14:15:16.456')).toBe(AT)
  })

  it('round-trips with toSqliteDateTime', () => {
    expect(toSqliteDateTime(parseSqliteDateTime('2026-10-30 00:00:01.456'), 'milliseconds')).toBe(
      '2026-10-30 00:00:01.456',
    )
  })
})
