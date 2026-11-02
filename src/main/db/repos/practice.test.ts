import { afterEach, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
import { runMigrations, schemaVersion } from '../migrations'
import { createJob } from './jobs'
import { createPresentationMeeting } from './meeting-presentation'
import { getMeeting, listMeetings, deleteMeeting } from './meetings'
import { insertSegment, searchSegments } from './segments'
import { ftsAllOf, ftsAnyOf } from '../fts-query'
import { listPracticeSessions, saveMockResult } from './practice'

let sqlite: DatabaseSync
function database(): void {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  // Exercise actual SQLite SQL/transactions with Node's local binding; no Electron launch.
  mock.db = {
    prepare: (sql: string) => sqlite.prepare(sql),
    exec: (sql: string) => sqlite.exec(sql),
    pragma: (sql: string, opts?: { simple: boolean }) => {
      if (opts?.simple) return Object.values(sqlite.prepare(`PRAGMA ${sql}`).get()!)[0]
      sqlite.exec(`PRAGMA ${sql}`)
    },
    transaction: (fn: () => unknown) => () => {
      sqlite.exec('BEGIN')
      try {
        const result = fn()
        sqlite.exec('COMMIT')
        return result
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
  } as unknown as Database
}
afterEach(() => sqlite?.close())

it('migrates legacy meetings as normal, excludes practice from both history retrieval paths, and cascades results', () => {
  database()
  runMigrations(mock.db)
  expect(schemaVersion).toBe(8)
  const job = createJob('Role')
  const normal = createPresentationMeeting(job.id, 'Real meeting')
  const practice = createPresentationMeeting(job.id, 'Mock interview', true)
  expect(getMeeting(normal)?.practice).toBe(false)
  expect(getMeeting(practice)?.practice).toBe(true)
  for (const meetingId of [normal, practice])
    insertSegment({
      meetingId,
      tStartMs: 0,
      tEndMs: 100,
      speaker: 0,
      isUser: false,
      text: 'Unique milestone evidence',
    })
  expect(listMeetings(job.id).map((m) => m.id)).toEqual([normal])
  expect(searchSegments(ftsAllOf('milestone')).map((s) => s.meeting.id)).toEqual([normal])
  expect(
    searchSegments(ftsAnyOf('What milestone?'), { jobId: job.id }).map((s) => s.meeting.id),
  ).toEqual([normal])
  const result = { meetingId: practice, plan: 'Job interview', reason: 'owner', questions: [] }
  saveMockResult(result)
  expect(listPracticeSessions()).toEqual([{ meeting: getMeeting(practice), result }])
  deleteMeeting(practice)
  expect(listPracticeSessions()).toEqual([])
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM mock_results').get()?.n).toBe(0)
})

it('upgrades a v7 database without changing existing transcript or meeting data', () => {
  database()
  runMigrations(mock.db)
  // Recreate the pre-v8 shape using SQLite's supported DROP COLUMN on a disposable DB.
  sqlite.exec(
    'DROP TABLE mock_results; DROP INDEX idx_meetings_practice; ALTER TABLE meetings DROP COLUMN practice; PRAGMA user_version = 7',
  )
  const job = createJob('Legacy')
  sqlite.prepare('INSERT INTO meetings (job_id, title) VALUES (?, ?)').run(job.id, 'Keep me')
  runMigrations(mock.db)
  expect(listMeetings(job.id)[0]).toMatchObject({ title: 'Keep me', practice: false })
  runMigrations(mock.db) // idempotent
  expect(listMeetings(job.id)).toHaveLength(1)
})
