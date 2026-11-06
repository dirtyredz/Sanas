import { afterEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { sqliteTestDatabase } from '../../testing/sqlite-test-database'
const mock = vi.hoisted(() => ({ db: null as unknown as Database }))
vi.mock('../../index', () => ({ getDb: () => mock.db }))
import { runMigrations, schemaVersion } from '../../migrations'
import { createJob, ensureDefaultJob } from '../jobs'
import { createMeeting } from '../meeting/meeting-create'

let sqlite: DatabaseSync
function database(): void {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
}
afterEach(() => sqlite?.close())

function link(jobId: number, applicationId: string): void {
  sqlite
    .prepare(
      `INSERT INTO job_applications (job_id, application_id, source_root, fingerprint, source_stage, baseline)
         VALUES (?, ?, 'C:\\resumes', 'fp', 'interview', '{}')`,
    )
    .run(jobId, applicationId)
}

it('creates v13 on a fresh database', () => {
  database()
  expect(schemaVersion).toBe(13)
  expect(mock.db.pragma('user_version', { simple: true })).toBe(13)
  const job = createJob('Acme').id
  link(job, 'acme-1')
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM job_applications').get()).toEqual({ n: 1 })
})

it('upgrades v12 without touching jobs or meetings', () => {
  database()
  sqlite.exec(
    'DROP TRIGGER jobs_delete_guard; DROP TABLE job_applications; PRAGMA user_version = 12',
  )
  const job = createJob('Acme').id
  createMeeting(job, 'Old', {})
  runMigrations(mock.db)
  expect(mock.db.pragma('user_version', { simple: true })).toBe(13)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM meetings').get()).toEqual({ n: 1 })
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM job_applications').get()).toEqual({ n: 0 })
})

it('links an application to one job only and cascades the link with its job', () => {
  database()
  createJob('Default') // ID 1 is protected
  const a = createJob('Acme').id
  const b = createJob('Globex').id
  link(a, 'acme-1')
  expect(() => link(b, 'acme-1')).toThrow(/UNIQUE/)
  expect(() => link(a, 'acme-2')).toThrow(/UNIQUE|PRIMARY/)
  sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(a)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM job_applications').get()).toEqual({ n: 0 })
})

it('refuses to delete ID 1, a name-resolved Unsorted row, or a job with any meeting', () => {
  database()
  const first = createJob('First job').id
  expect(first).toBe(1)
  expect(() => sqlite.prepare('DELETE FROM jobs WHERE id = 1').run()).toThrow(/Unsorted/)
  const unsorted = ensureDefaultJob()
  expect(unsorted).not.toBe(1)
  expect(() => sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(unsorted)).toThrow(/Unsorted/)
  const normal = createJob('Acme').id
  createMeeting(normal, 'Call', {})
  expect(() => sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(normal)).toThrow(/meetings/)
  const practice = createJob('Practice').id
  createMeeting(practice, 'Mock', { practice: true })
  expect(() => sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(practice)).toThrow(/meetings/)
  const empty = createJob('Empty').id
  sqlite.prepare('DELETE FROM jobs WHERE id = ?').run(empty)
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs WHERE id = ?').get(empty)).toEqual({ n: 0 })
})
