import { afterEach, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import type { Database } from 'better-sqlite3'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations } from '../../migrations'
import { createJob, ensureDefaultJob } from '../job/jobs'
import { createMeeting } from './meeting-create'
import { getMeetingGrounding } from './meeting-grounding'
import { getMeeting, moveMeetingToJob } from './meetings'

const resume = { name: 'cv.pdf', text: 'At ExampleCo I ran Camunda.' }
let sqlite: DatabaseSync
function setup(): { from: number; to: number; id: number } {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  const from = ensureDefaultJob()
  const to = createJob('Other').id
  const id = createMeeting(from, 'Interview', { resume, interviewProfile: 'My story' })
  return { from, to, id }
}
afterEach(() => sqlite?.close())

it('drops the resume and profile snapshots when the job changes, keeping the rest', () => {
  const { to, id } = setup()
  expect(getMeetingGrounding(id).hasBiography).toBe(true)
  moveMeetingToJob(id, to)
  expect(getMeetingGrounding(id)).toEqual({
    resume: null,
    interviewProfile: '',
    hasBiography: false,
  })
  expect(getMeeting(id)).toMatchObject({
    jobId: to,
    title: 'Interview',
    interviewProfileUsed: false,
  })
})

it('keeps the snapshots when moved to the job it is already in', () => {
  const { from, id } = setup()
  moveMeetingToJob(id, from)
  expect(getMeetingGrounding(id).resume).toEqual(resume)
  expect(getMeetingGrounding(id).interviewProfile).toBe('My story')
})

it('keeps the immutability triggers closed to direct edits, before and after a move', () => {
  const { to, id } = setup()
  const clear = () => sqlite.prepare("UPDATE meetings SET resume_text = '' WHERE id = ?").run(id)
  expect(clear).toThrow('immutable')
  moveMeetingToJob(id, to)
  expect(sqlite.prepare('SELECT count(*) AS n FROM meeting_snapshot_clear').get()).toEqual({ n: 0 })
  const rewrite = () => sqlite.prepare("UPDATE meetings SET resume_text = 'x' WHERE id = ?").run(id)
  expect(rewrite).toThrow('immutable')
})

it('with a guard row present, only a clear of the whole snapshot is allowed', () => {
  const { id } = setup()
  sqlite.prepare('INSERT INTO meeting_snapshot_clear (meeting_id) VALUES (?)').run(id)
  const run = (sql: string) => () => sqlite.prepare(sql).run(id)
  expect(run("UPDATE meetings SET resume_text = 'x' WHERE id = ?")).toThrow('immutable')
  expect(run("UPDATE meetings SET resume_name = '' WHERE id = ?")).toThrow('immutable')
  expect(run("UPDATE meetings SET resume_text = '' WHERE id = ?")).toThrow('immutable')
  expect(run("UPDATE meetings SET interview_profile = 'x' WHERE id = ?")).toThrow('immutable')
  run(
    "UPDATE meetings SET resume_name = '', resume_text = '', interview_profile = '' WHERE id = ?",
  )()
  expect(getMeetingGrounding(id).hasBiography).toBe(false)
})
