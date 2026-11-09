import { afterEach, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../testing/sqlite-test-database'
import type { Database } from 'better-sqlite3'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../index', () => ({ getDb: () => mock.db }))
import { runMigrations, schemaVersion } from '../migrations'
import { createJob } from './jobs'
import { createMeeting } from './meeting/meeting-create'
import { getMeeting, listMeetings, deleteMeeting } from './meeting/meetings'
import { searchSegments } from './history/transcripts'
import { insertSegment } from './segments'
import { ftsAllOf, ftsAnyOf } from '../fts-query'
import { listPracticeSessions, saveMockResult } from './practice'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
}
afterEach(() => sqlite?.close())

it('migrates legacy meetings as normal, excludes practice from both history retrieval paths, and cascades results', () => {
  database()
  runMigrations(mock.db)
  expect(mock.db.pragma('user_version', { simple: true })).toBe(schemaVersion)
  const job = createJob('Role')
  const normal = createMeeting(job.id, 'Real meeting')
  const practice = createMeeting(job.id, 'Mock interview', { practice: true })
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
    'DROP TRIGGER summaries_fts_ai; DROP TRIGGER summaries_fts_ad; DROP TRIGGER summaries_fts_au; DROP TABLE summaries_fts; DROP TABLE job_memory_proposals; DROP TABLE job_memory; DROP TRIGGER jobs_delete_guard; DROP TABLE job_applications; DROP TABLE job_resumes; DROP TRIGGER meetings_interview_profile_immutable; ALTER TABLE meetings DROP COLUMN interview_profile; DROP TRIGGER meetings_resume_immutable; ALTER TABLE meetings DROP COLUMN resume_name; ALTER TABLE meetings DROP COLUMN resume_text; DROP TABLE mock_results; DROP INDEX idx_meetings_practice; ALTER TABLE meetings DROP COLUMN practice; PRAGMA user_version = 7',
  )
  const job = createJob('Legacy')
  sqlite.prepare('INSERT INTO meetings (job_id, title) VALUES (?, ?)').run(job.id, 'Keep me')
  runMigrations(mock.db)
  expect(listMeetings(job.id)[0]).toMatchObject({ title: 'Keep me', practice: false })
  runMigrations(mock.db) // idempotent
  expect(listMeetings(job.id)).toHaveLength(1)
})
