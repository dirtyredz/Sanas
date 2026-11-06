import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { createJob, ensureDefaultJob } from '../jobs'
import { createMeeting } from '../meeting/meeting-create'
import { addGlossaryTerm } from './glossary'
import { setJobResume } from './job-resume'
import {
  countJobDependencies,
  deleteJobRow,
  isProtectedJob,
  jobDeletionSnapshot,
} from './job-deletion'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  createJob('Default') // ID 1 is always protected; keep it out of the way
}
afterEach(() => sqlite?.close())

function populated(): number {
  const job = createJob('Acme').id
  addGlossaryTerm(job, 'Camunda', '')
  addGlossaryTerm(job, 'Kotlin', 'note')
  setJobResume(job, { name: 'CV', text: 'text' })
  sqlite
    .prepare(
      `INSERT INTO job_applications (job_id, application_id, source_root, fingerprint, source_stage, baseline)
       VALUES (?, 'acme-1', '/r', 'fp', 'interview', '{}')`,
    )
    .run(job)
  sqlite.prepare(`INSERT INTO job_slides VALUES (?, 0, 'T', 'P', 'S', 'K')`).run(job)
  return job
}

it('counts every dependent table, practice included, and deletes an empty job with cascades', () => {
  database()
  const job = populated()
  expect(countJobDependencies(job)).toEqual({
    meetings: 0,
    practiceSessions: 0,
    transcriptSegments: 0,
    summaries: 0,
    suggestions: 0,
    recordings: 0,
    glossaryTerms: 2,
    resumes: 1,
    applicationLinks: 1,
    legacySlides: 1,
  })
  deleteJobRow(job)
  for (const table of [
    'jobs WHERE id = ?',
    'glossary WHERE job_id = ?',
    'job_resumes WHERE job_id = ?',
    'job_applications WHERE job_id = ?',
    'job_slides WHERE job_id = ?',
  ])
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get(job)).toEqual({ n: 0 })
})

it('counts meetings, practice sessions, transcripts, summaries, suggestions and recordings', () => {
  database()
  const job = populated()
  const normal = createMeeting(job, 'Call', {})
  const practice = createMeeting(job, 'Mock', { practice: true })
  sqlite
    .prepare(`UPDATE meetings SET audio_path = '/a/1.wav', summary = 'S' WHERE id = ?`)
    .run(normal)
  const seg = sqlite.prepare(
    `INSERT INTO segments (meeting_id, t_start_ms, t_end_ms, speaker, text) VALUES (?, 0, 1, 0, 'hi')`,
  )
  seg.run(normal)
  seg.run(practice)
  seg.run(practice)
  sqlite
    .prepare(
      `INSERT INTO suggestions (meeting_id, t_ms, trigger, text) VALUES (?, 0, 'ambient', 'x')`,
    )
    .run(practice)
  const snapshot = jobDeletionSnapshot(job)
  expect(snapshot.counts).toMatchObject({
    meetings: 1,
    practiceSessions: 1,
    transcriptSegments: 3,
    summaries: 1,
    suggestions: 1,
    recordings: 1,
  })
  expect(snapshot.meetings).toEqual([
    { id: normal, practice: false, audioPath: '/a/1.wav' },
    { id: practice, practice: true, audioPath: null },
  ])
  expect(snapshot.job).toEqual({ id: job, name: 'Acme' })
})

it('refuses jobs with normal or practice meetings, ID 1 and the Unsorted bucket', () => {
  database()
  const normal = createJob('Normal').id
  createMeeting(normal, 'Call', {})
  expect(() => deleteJobRow(normal)).toThrow('still has meetings')
  const practice = createJob('Practice').id
  createMeeting(practice, 'Mock', { practice: true })
  expect(() => deleteJobRow(practice)).toThrow('still has meetings')
  expect(() => deleteJobRow(1)).toThrow('Unsorted')
  const unsorted = ensureDefaultJob()
  expect(unsorted).not.toBe(1)
  expect(isProtectedJob(unsorted, 'Unsorted')).toBe(true)
  expect(() => deleteJobRow(unsorted)).toThrow('Unsorted')
  expect(() => deleteJobRow(999)).toThrow('Job not found.')
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 4 })
})
