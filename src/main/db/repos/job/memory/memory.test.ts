import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../../migrations'
import { getApprovedMemory, saveMemory } from './approved'
import {
  approveProposal,
  beginProposal,
  dismissProposal,
  finishProposal,
  memorySource,
  memoryView,
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
function proposal(id = 1) {
  const p = beginProposal(memorySource(id)!)!
  finishProposal(p, 'Replacement')
  return p
}
it('enforces exact limits, revisions, replacement and clearing', () => {
  saveMemory(2, 0, 'a'.repeat(3000))
  expect(() => saveMemory(2, 1, 'a'.repeat(3001))).toThrow()
  expect(() => saveMemory(2, 0, 'stale')).toThrow('Memory changed')
  saveMemory(2, 1, '')
  expect(getApprovedMemory(2)).toMatchObject({ text: '', revision: 2 })
  expect(() => saveMemory(1, 0, 'unsorted')).toThrow()
  expect(() => mock.db.prepare('UPDATE job_memory SET text=?').run('x'.repeat(3001))).toThrow()
})
it('keeps proposals separate and approval invalidates older bases', () => {
  const a = proposal(),
    b = proposal(2)
  expect(memoryView(2).proposals).toHaveLength(2)
  approveProposal(2, {
    meetingId: 1,
    generation: a.generation,
    revision: 0,
    text: 'Owner edited replacement',
  })
  expect(getApprovedMemory(2).text).toBe('Owner edited replacement')
  expect(() =>
    approveProposal(2, { meetingId: 2, generation: b.generation, revision: 0, text: 'stale' }),
  ).toThrow()
  expect(memoryView(2).proposals[0].status).toBe('stale')
  expect(countJobDependencies(2)).toMatchObject({ memories: 1, memoryProposals: 2 })
})
it('rejects changed, moved and deleted sources without erasing approved memory', () => {
  const p = proposal()
  saveMemory(2, 0, 'Keep me')
  mock.db.exec("UPDATE meetings SET summary='changed' WHERE id=1")
  expect(() =>
    approveProposal(2, { meetingId: 1, generation: p.generation, revision: 1, text: 'bad' }),
  ).toThrow()
  const q = proposal(2)
  mock.db.exec('UPDATE meetings SET job_id=3 WHERE id=2')
  finishProposal(q, 'late')
  expect(memoryView(2).proposals.every((p) => p.status === 'stale')).toBe(true)
  mock.db.exec('DELETE FROM meetings WHERE id=1')
  expect(getApprovedMemory(2).text).toBe('Keep me')
})
it('dismissal suppresses duplicate fingerprints and generation identities reject late completion', () => {
  const p = proposal()
  dismissProposal(2, 1, p.generation)
  expect(beginProposal(memorySource(1)!)).toBeNull()
  const a = beginProposal(memorySource(1)!, true)!,
    b = beginProposal(memorySource(1)!, true)!
  finishProposal(a, 'obsolete')
  finishProposal(b, 'latest')
  expect(memoryView(2).proposals[0].text).toBe('latest')
})
it('excludes practice, unended and Unsorted sources', () => {
  mock.db.exec(
    "INSERT INTO meetings(job_id,practice,summary,ended_at) VALUES(2,1,'practice','now'),(1,0,'unsorted','now'),(2,0,'live',NULL)",
  )
  for (const id of [3, 4, 5]) expect(memorySource(id)).toBeNull()
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
  expect(memoryView(2).proposals).toEqual([])
})
