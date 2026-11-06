import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations, schemaVersion } from '../../migrations'
import { createJob } from '../jobs'
import { createMeeting } from '../meeting/meeting-create'
import { getMeetingGrounding } from '../meeting/meeting-grounding'
import { getJobResume, setJobResume } from './job-resume'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
}
afterEach(() => sqlite?.close())
const resume = { name: 'Platform CV', text: 'At ExampleCo I led a Camunda migration.' }

it('has no resume by default; saves, replaces and removes per job', () => {
  database()
  const a = createJob('Acme').id
  const b = createJob('Globex').id
  expect(getJobResume(a)).toBeNull()
  expect(setJobResume(a, resume)).toEqual(resume)
  expect(getJobResume(b)).toBeNull() // isolated per job
  expect(setJobResume(a, { name: 'v2', text: 'Kotlin' })).toEqual({ name: 'v2', text: 'Kotlin' })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM job_resumes').get()).toEqual({ n: 1 })
  expect(setJobResume(a, null)).toBeNull()
  expect(getJobResume(a)).toBeNull()
  expect(setJobResume(b, null)).toBeNull() // removing nothing is fine
})

it('rejects a job that does not exist and enforces the stored limits', () => {
  database()
  expect(() => setJobResume(999, resume)).toThrow('Job not found.')
  const job = createJob('Acme').id
  const insert = sqlite.prepare('INSERT INTO job_resumes (job_id, name, text) VALUES (?, ?, ?)')
  expect(() => insert.run(job, '', 'text')).toThrow()
  expect(() => insert.run(job, 'Name', '')).toThrow()
  expect(() => insert.run(job, 'Name', 'x'.repeat(40_001))).toThrow()
})

it('meeting snapshots outlive later job edits and removal', () => {
  database()
  const job = createJob('Acme').id
  setJobResume(job, resume)
  const id = createMeeting(job, 'Interview', { resume: getJobResume(job) })
  setJobResume(job, { name: 'v2', text: 'Rewritten' })
  expect(getMeetingGrounding(id).resume).toEqual(resume)
  setJobResume(job, null)
  expect(getMeetingGrounding(id).resume).toEqual(resume)
  const next = createMeeting(job, 'Next', { resume: getJobResume(job) })
  expect(getMeetingGrounding(next).resume).toBeNull()
})

it('upgrades v10 without inventing job resumes or touching historical snapshots', () => {
  database()
  sqlite.exec(
    'DROP TRIGGER jobs_delete_guard; DROP TABLE job_applications; DROP TABLE job_resumes; PRAGMA user_version = 10',
  )
  const job = createJob('Acme').id
  sqlite
    .prepare(
      'INSERT INTO meetings (job_id, title, resume_name, resume_text, interview_profile) VALUES (?, ?, ?, ?, ?)',
    )
    .run(job, 'Old interview', resume.name, resume.text, 'Old profile')
  runMigrations(mock.db)
  expect(mock.db.pragma('user_version', { simple: true })).toBe(schemaVersion)
  expect(schemaVersion).toBe(13)
  expect(getJobResume(job)).toBeNull() // no backfill from past meetings
  expect(getMeetingGrounding(1)).toMatchObject({ resume, interviewProfile: 'Old profile' })
})
