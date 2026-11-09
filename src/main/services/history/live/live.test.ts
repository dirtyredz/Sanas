import { afterEach, expect, it, vi } from 'vitest'
import { sqliteTestDatabase } from '../../../db/testing/sqlite-test-database'
import { runMigrations } from '../../../db/migrations'
import { liveHits } from '../../../db/repos/history/live'
import { renderLiveHits } from './excerpts'
import { liveQuery } from './policy'
import { freezeEvidence } from './session'

afterEach(() => vi.useRealTimers())
it('searches summary-only facts, scopes current ownership and maintains triggers', () => {
  const { db, sqlite } = sqliteTestDatabase()
  try {
    runMigrations(db)
    db.exec(`INSERT INTO jobs(id,name) VALUES(1,'Unsorted'),(2,'Acme'),(3,'Other');
    INSERT INTO meetings(id,job_id,title,ended_at,summary,practice) VALUES
    (1,2,'Past','now','Atlas 42',0),(2,2,'Current','now','Atlas current',0),(3,3,'Other','now','Atlas wrong',0),
    (4,2,'Live',NULL,'Atlas live',0),(5,2,'Practice','now','Atlas practice',1),(6,1,'Bucket','now','Atlas bucket',0);`)
    expect(liveHits(db, 2, 2, 'Atlas').map((h) => h.meetingId)).toEqual([1])
    db.exec("UPDATE meetings SET summary='Borealis' WHERE id=1")
    expect(liveHits(db, 2, 2, 'Atlas')).toEqual([])
    expect(liveHits(db, 2, 2, 'Borealis')).toHaveLength(1)
    db.exec('UPDATE meetings SET job_id=3 WHERE id=1')
    expect(liveHits(db, 2, 2, 'Borealis')).toEqual([])
    expect(() => liveHits(db, 2, 2, '" OR * ( :')).not.toThrow()
    db.exec('DELETE FROM meetings WHERE id=1')
    expect(liveHits(db, 3, 2, 'Borealis')).toEqual([])
  } finally {
    sqlite.close()
  }
})
it('strictly caps labels and oversized evidence including framing', () => {
  const text = renderLiveHits(
    Array.from({ length: 3 }, (_, meetingId) => ({
      meetingId,
      title: 'T'.repeat(9000),
      date: '2026-11-01',
      text: 'x'.repeat(9000),
      time: null,
      kind: 'generated summary' as const,
    })),
  )
  expect(text.length).toBeLessThanOrEqual(2400)
  expect(text).toContain('generated summary')
})
it.each([
  'hello',
  'how are you doing today',
  'what do you think',
  'can you tell me more',
  'thanks',
])('skips generic automatic turns: %s', (text) => expect(liveQuery(text, true)).toBe(''))
it('allows specific subjects with bounded terms', () => {
  expect(liveQuery('What is the Atlas budget?', true)).toContain('Atlas')
  expect(liveQuery('SLA?', true)).toBe('SLA')
  expect(liveQuery('Atlas', true, ['Atlas'])).toBe('Atlas')
})
it.each([10, 25])('freezes at %i ms and ignores late results', async (budget) => {
  vi.useFakeTimers()
  let resolve!: (r: { id: number; text: string; snippets: number; queryMs: number }) => void
  const report = vi.fn()
  const h = freezeEvidence(
    () =>
      new Promise((r) => {
        resolve = r
      }),
    budget,
    undefined,
    report,
    Date.now,
  )
  await vi.advanceTimersByTimeAsync(budget)
  expect(await h.ready).toBe('')
  resolve({ id: 1, text: 'late', snippets: 1, queryMs: 30 })
  await Promise.resolve()
  expect(report).toHaveBeenCalledTimes(1)
  expect(report.mock.calls[0][0]).toMatchObject({ status: 'timeout', waitMs: budget })
})
it('handles success, cancellation and worker failure without leaking evidence to diagnostics', async () => {
  const report = vi.fn()
  const h = freezeEvidence(
    async () => ({ id: 1, text: 'private', snippets: 1, queryMs: 1 }),
    10,
    undefined,
    report,
  )
  expect(await h.ready).toBe('private')
  expect(JSON.stringify(report.mock.calls)).not.toContain('private')
  const c = freezeEvidence(() => new Promise(() => {}), 25)
  c.cancel()
  expect(await c.ready).toBe('')
  expect(
    await freezeEvidence(async () => {
      throw new Error('worker')
    }, 10).ready,
  ).toBe('')
})
