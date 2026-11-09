import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../../db/testing/sqlite-test-database'
const m = vi.hoisted(() => ({ db: null as unknown as Database, complete: vi.fn() }))
vi.mock('../../../db/index', () => ({ getDb: () => m.db }))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: 'key', answerModel: 'answer' }),
}))
vi.mock('../../assistant/provider', () => ({ assistantProvider: { complete: m.complete } }))
vi.mock('../../meetings/status/post-processing', () => ({
  whilePostProcessing: (_id: number, f: () => Promise<void>) => f(),
}))
import { runMigrations } from '../../../db/migrations'
import { saveMemory } from '../../../db/repos/job/memory/approved'
import { generateMemory } from './generate'
import {
  approveMemoryProposal,
  dismissMemoryProposal,
  reviewMemory,
  saveApprovedMemory,
} from './review'
import { memorySource } from './source'

/** The review rules, end to end over a real database with only the provider faked. */
let close: () => void
beforeEach(() => {
  const o = sqliteTestDatabase()
  m.db = o.db
  close = () => o.sqlite.close()
  runMigrations(m.db)
  m.db.exec(
    "INSERT INTO jobs(id,name) VALUES(1,'Unsorted'),(2,'Acme'),(3,'Other'); INSERT INTO meetings(id,job_id,title,ended_at,summary) VALUES(1,2,'First','2026-11-01','Atlas budget 42'),(2,2,'Second','2026-11-02','Owner Jo')",
  )
  m.complete.mockReset().mockResolvedValue('Replacement')
})
afterEach(() => close())
const review = (id: number, generation: string, revision = 0) => ({
  meetingId: id,
  generation,
  revision,
  text: 'Owner edit',
})
async function pending(id = 1) {
  await generateMemory(id)
  return reviewMemory(2).proposals.find((p) => p.meetingId === id)!
}

it('keeps proposals separate and approval makes older bases stale', async () => {
  const a = await pending(1)
  const b = await pending(2)
  expect(reviewMemory(2).proposals.map((p) => p.status)).toEqual(['pending', 'pending'])
  expect(approveMemoryProposal(2, review(1, a.generation)).approved.text).toBe('Owner edit')
  expect(() => approveMemoryProposal(2, review(2, b.generation))).toThrow('Proposal changed')
  expect(reviewMemory(2).proposals.map((p) => p.status)).toEqual(['stale'])
})
it('reads a changed, moved or deleted source as stale and refuses its approval', async () => {
  const p = await pending(1)
  m.db.exec("UPDATE meetings SET summary='changed' WHERE id=1")
  expect(reviewMemory(2).proposals[0].status).toBe('stale')
  expect(() => approveMemoryProposal(2, review(1, p.generation))).toThrow('Proposal changed')
  const q = await pending(2)
  m.db.exec('UPDATE meetings SET job_id=3 WHERE id=2')
  expect(reviewMemory(2).proposals.find((x) => x.meetingId === 2)?.status).toBe('stale')
  expect(() => approveMemoryProposal(2, review(2, q.generation))).toThrow('Proposal changed')
})
it('reads proposals as stale once the approved revision moves', async () => {
  await pending(1)
  saveApprovedMemory(2, 0, 'Keep me')
  expect(reviewMemory(2).proposals[0].status).toBe('stale')
})
it('a source that changes during generation finishes stale, not pending', async () => {
  m.complete.mockImplementationOnce(async () => {
    m.db.exec("UPDATE meetings SET summary='changed' WHERE id=1")
    return 'late'
  })
  await generateMemory(1)
  expect(reviewMemory(2).proposals[0].status).toBe('stale')
})
it('skips an unchanged source, but regenerates when retried, changed or stale', async () => {
  await generateMemory(1)
  await generateMemory(1)
  expect(m.complete).toHaveBeenCalledTimes(1)
  await generateMemory(1, true)
  expect(m.complete).toHaveBeenCalledTimes(2)
  m.db.exec("UPDATE meetings SET summary='changed' WHERE id=1")
  await generateMemory(1)
  expect(m.complete).toHaveBeenCalledTimes(3)
})
it('dismissal suppresses regeneration of the same fingerprint', async () => {
  const p = await pending(1)
  expect(dismissMemoryProposal(2, 1, p.generation).proposals).toEqual([])
  await generateMemory(1)
  expect(m.complete).toHaveBeenCalledTimes(1)
})
it('shows a persisted generating row with no live generation as failed, stale winning over it', () => {
  const insert = m.db.prepare(
    "INSERT INTO job_memory_proposals(meeting_id,job_id,fingerprint,base_revision,generation,status) VALUES(1,2,?,0,'g','generating')",
  )
  insert.run('x')
  expect(reviewMemory(2).proposals[0].status).toBe('stale')
  m.db.exec('DELETE FROM job_memory_proposals')
  insert.run(memorySource(1)!.fingerprint)
  expect(reviewMemory(2).proposals[0].status).toBe('failed')
})
it('keeps approved memory when a source is deleted', () => {
  saveMemory(2, 0, 'Keep me')
  m.db.exec('DELETE FROM meetings WHERE id=1')
  expect(reviewMemory(2).approved.text).toBe('Keep me')
})
