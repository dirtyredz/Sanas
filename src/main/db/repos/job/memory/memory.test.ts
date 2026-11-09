import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../../migrations'
import { getApprovedMemory, ordinaryJob, saveMemory } from './approved'
import {
  dismissProposal,
  getProposal,
  markApprovedIf,
  openProposals,
  readMemorySource,
  settleProposal,
  startProposal,
} from './proposals'
import { countJobDependencies } from '../job-deletion'

let close: () => void
beforeEach(() => {
  const o = sqliteTestDatabase()
  mock.db = o.db
  close = () => o.sqlite.close()
  runMigrations(mock.db)
  mock.db.exec(
    "INSERT INTO jobs(id,name) VALUES(1,'Unsorted'),(2,'Acme'),(3,'Other'); INSERT INTO meetings(id,job_id,title,ended_at,summary) VALUES(1,2,'First','2026-11-01','Atlas budget 42'),(2,2,'Second','2026-11-02','Owner Jo')",
  )
})
afterEach(() => close())
const fp = (id: number) => `fp${id}`
function proposal(id = 1, status: 'pending' | 'failed' = 'pending') {
  const p = startProposal({ meetingId: id, jobId: 2, fingerprint: fp(id) }, 0, `gen${id}`)
  settleProposal(id, p.generation, 'Replacement', status)
  return p
}
const review = (id: number, revision = 0, text = 'edited') => ({
  meetingId: id,
  generation: `gen${id}`,
  revision,
  text,
})
it('enforces exact limits, revisions, replacement and clearing', () => {
  saveMemory(2, 0, 'a'.repeat(3000))
  expect(() => saveMemory(2, 1, 'a'.repeat(3001))).toThrow()
  expect(() => saveMemory(2, 0, 'stale')).toThrow('Memory changed')
  saveMemory(2, 1, '')
  expect(getApprovedMemory(2)).toMatchObject({ text: '', revision: 2 })
  expect(() => saveMemory(1, 0, 'unsorted')).toThrow()
  expect(() => mock.db.prepare('UPDATE job_memory SET text=?').run('x'.repeat(3001))).toThrow()
  expect(ordinaryJob(2)).toBe(true)
  expect(ordinaryJob(1)).toBe(false)
  expect(ordinaryJob(99)).toBe(false)
})
it('approves atomically and the new revision invalidates other open proposals', () => {
  proposal()
  proposal(2)
  markApprovedIf(2, review(1, 0, 'Owner edited replacement'), fp(1))
  expect(getApprovedMemory(2)).toMatchObject({ text: 'Owner edited replacement', revision: 1 })
  expect(getProposal(1)?.status).toBe('approved')
  expect(getProposal(2)?.status).toBe('stale')
  expect(() => markApprovedIf(2, review(2), fp(2))).toThrow('Proposal changed')
  expect(openProposals(2).map((p) => p.meetingId)).toEqual([2])
  expect(countJobDependencies(2)).toMatchObject({ memories: 1, memoryProposals: 2 })
})
it('compare-and-set rejects anything but the exact reviewed pending proposal', () => {
  proposal()
  const attempts: [number, ReturnType<typeof review>, string | null][] = [
    [3, review(1), fp(1)], // other job
    [2, { ...review(1), generation: 'old' }, fp(1)],
    [2, review(1, 5), fp(1)], // wrong base revision
    [2, review(1), 'changed'], // source changed
    [2, review(1), null], // source gone or moved
  ]
  for (const [job, r, f] of attempts) expect(() => markApprovedIf(job, r, f)).toThrow()
  proposal(2, 'failed')
  expect(() => markApprovedIf(2, review(2), fp(2))).toThrow()
  expect(getApprovedMemory(2).revision).toBe(0)
  expect(getProposal(1)?.status).toBe('pending')
})
it('rolls back approval when the approved revision moved underneath', () => {
  proposal()
  saveMemory(2, 0, 'Keep me')
  expect(() => markApprovedIf(2, review(1, 0), fp(1))).toThrow()
  expect(getApprovedMemory(2).text).toBe('Keep me')
})
it('settles only its own generation and dismissal is generation-checked', () => {
  const a = startProposal({ meetingId: 1, jobId: 2, fingerprint: fp(1) }, 0, 'a')
  const b = startProposal({ meetingId: 1, jobId: 2, fingerprint: fp(1) }, 0, 'b')
  settleProposal(1, a.generation, 'obsolete', 'pending')
  settleProposal(1, b.generation, 'latest', 'pending')
  expect(getProposal(1)).toMatchObject({ text: 'latest', status: 'pending' })
  expect(() => dismissProposal(2, 1, 'a')).toThrow('Proposal changed')
  dismissProposal(2, 1, 'b')
  expect(getProposal(1)?.status).toBe('dismissed')
  expect(openProposals(2)).toEqual([])
})
it('reads only eligible sources: excludes practice, unended, Unsorted and empty', () => {
  mock.db.exec(
    "INSERT INTO meetings(job_id,practice,summary,ended_at) VALUES(2,1,'practice','now'),(1,0,'unsorted','now'),(2,0,'live',NULL),(2,0,'','now')",
  )
  for (const id of [3, 4, 5, 6]) expect(readMemorySource(id)).toBeNull()
  expect(readMemorySource(1)).toMatchObject({ jobId: 2, summary: 'Atlas budget 42' })
})
it('upgrades a v13 database and cascades job-owned memory', () => {
  mock.db.exec(
    'DROP TRIGGER summaries_fts_ai; DROP TRIGGER summaries_fts_ad; DROP TRIGGER summaries_fts_au; DROP TABLE summaries_fts; DROP TABLE job_memory_proposals; DROP TABLE job_memory; PRAGMA user_version=13',
  )
  runMigrations(mock.db)
  saveMemory(2, 0, 'saved')
  proposal()
  mock.db.exec('DELETE FROM meetings WHERE job_id=2; DELETE FROM jobs WHERE id=2')
  expect(getApprovedMemory(2).revision).toBe(0)
  expect(openProposals(2)).toEqual([])
})
