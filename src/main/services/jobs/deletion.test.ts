import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import type { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sqliteTestDatabase } from '../../db/testing/sqlite-test-database'
const mock = vi.hoisted(() => ({
  db: null as unknown as Database,
  backup: vi.fn<() => Promise<string>>(),
}))
vi.mock('electron', () => ({ app: { getPath: () => '/user-data' } }))
vi.mock('../../db/index', () => ({ getDb: () => mock.db }))
vi.mock('../../db/backup', () => ({ backupDatabase: () => mock.backup() }))
import { runMigrations } from '../../db/migrations'
import { createJob, ensureDefaultJob } from '../../db/repos/jobs'
import { createMeeting } from '../../db/repos/meeting/meeting-create'
import { addGlossaryTerm } from '../../db/repos/job/glossary'
import { setLiveMeeting } from '../meetings/status/live-meeting'
import { clearPostProcessing, markPostProcessing } from '../meetings/status/post-processing'
import { deleteJob, previewJobDeletion } from './deletion'

let sqlite: DatabaseSync
let folder: string
beforeEach(() => {
  const opened = sqliteTestDatabase()
  sqlite = opened.sqlite
  mock.db = opened.db
  runMigrations(mock.db)
  createJob('Default') // ID 1
  folder = mkdtempSync(join(tmpdir(), 'sanas-delete-'))
  mock.backup.mockReset().mockResolvedValue('/user-data/backups/before-job-delete.db')
})
afterEach(() => {
  sqlite.close()
  setLiveMeeting(null)
  rmSync(folder, { recursive: true, force: true })
})

const rows = (sql: string, ...args: number[]): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get(...args) as { n: number }).n

function jobWithHistory(): { job: number; normal: number; practice: number; wav: string } {
  const job = createJob('Acme').id
  addGlossaryTerm(job, 'Camunda', '')
  const normal = createMeeting(job, 'Call', {})
  const practice = createMeeting(job, 'Mock', { practice: true })
  const wav = join(folder, 'call.wav')
  writeFileSync(wav, 'RIFF')
  sqlite
    .prepare('UPDATE meetings SET audio_path = ?, summary = ? WHERE id = ?')
    .run(wav, 'S', normal)
  sqlite
    .prepare(
      `INSERT INTO segments (meeting_id, t_start_ms, t_end_ms, speaker, text) VALUES (?, 0, 1, 0, 'x')`,
    )
    .run(practice)
  sqlite.prepare('INSERT INTO mock_results (meeting_id, result) VALUES (?, ?)').run(practice, '{}')
  return { job, normal, practice, wav }
}

it('previews exact counts, then backs up and deletes the job, its meetings and recordings', async () => {
  const { job, wav } = jobWithHistory()
  const preview = previewJobDeletion(7, job)
  expect(preview.blocked).toBeNull()
  expect(preview.counts).toMatchObject({
    meetings: 1,
    practiceSessions: 1,
    transcriptSegments: 1,
    summaries: 1,
    recordings: 1,
    glossaryTerms: 1,
  })
  mock.backup.mockImplementation(async () => {
    expect(rows('meetings WHERE job_id = ?', job)).toBe(2) // backup happens before deletion
    return '/user-data/backups/b.db'
  })
  const result = await deleteJob(7, preview.token!)
  expect(result).toEqual({
    status: 'deleted',
    backupPath: '/user-data/backups/b.db',
    removed: preview.counts,
  })
  expect(existsSync(wav)).toBe(false)
  expect(rows('jobs WHERE id = ?', job)).toBe(0)
  expect(rows('meetings')).toBe(0)
  expect(rows('segments')).toBe(0)
  expect(rows('mock_results')).toBe(0)
  expect(rows('glossary')).toBe(0)
})

it('refuses while a child meeting is live, paused or busy, and protects Unsorted', () => {
  const { job, normal, practice } = jobWithHistory()
  setLiveMeeting(practice)
  expect(previewJobDeletion(1, job)).toMatchObject({
    blocked: { reason: 'live-meeting' },
    token: null,
  })
  setLiveMeeting(null)
  markPostProcessing(normal)
  expect(previewJobDeletion(1, job).blocked?.reason).toBe('busy-meeting')
  clearPostProcessing(normal)
  expect(previewJobDeletion(1, 1).blocked?.reason).toBe('protected')
  expect(previewJobDeletion(1, ensureDefaultJob()).blocked?.reason).toBe('protected')
  expect(previewJobDeletion(1, 999).blocked?.reason).toBe('missing')
})

it('aborts without deleting anything when the backup fails', async () => {
  const { job, wav } = jobWithHistory()
  mock.backup.mockRejectedValue(new Error('disk full'))
  const result = await deleteJob(1, previewJobDeletion(1, job).token!)
  expect(result.status).toBe('backup-failed')
  expect(result.status === 'backup-failed' && result.message).toContain('disk full')
  expect(rows('meetings WHERE job_id = ?', job)).toBe(2)
  expect(existsSync(wav)).toBe(true)
})

it('rejects a preview that changed, including a meeting created during the backup', async () => {
  const { job } = jobWithHistory()
  const first = previewJobDeletion(1, job)
  createMeeting(job, 'Later', {})
  expect((await deleteJob(1, first.token!)).status).toBe('stale')

  const second = previewJobDeletion(1, job)
  mock.backup.mockImplementation(async () => {
    createMeeting(job, 'During backup', {})
    return '/b.db'
  })
  expect((await deleteJob(1, second.token!)).status).toBe('stale')
  expect(rows('meetings WHERE job_id = ?', job)).toBe(4)

  const third = previewJobDeletion(1, job)
  expect((await deleteJob(2, third.token!)).status).toBe('stale') // another window
  expect((await deleteJob(1, third.token!)).status).toBe('stale') // token consumed by the attempt
})

it('keeps the job and reports what was already removed when a recording cannot be deleted', async () => {
  const { job, normal, practice, wav } = jobWithHistory()
  const locked = join(folder, 'locked.wav')
  mkdirSync(locked) // unlink fails on a directory, like a file held open by another program
  sqlite.prepare('UPDATE meetings SET audio_path = ? WHERE id = ?').run(locked, practice)
  const result = await deleteJob(1, previewJobDeletion(1, job).token!)
  expect(result).toMatchObject({
    status: 'partial',
    removed: { meetings: 1, practiceSessions: 0, recordings: 1 },
  })
  expect(result.status === 'partial' && result.message).toContain('The job was kept')
  expect(existsSync(wav)).toBe(false)
  expect(rows('meetings WHERE id = ?', normal)).toBe(0)
  expect(rows('meetings WHERE id = ?', practice)).toBe(1)
  expect(rows('jobs WHERE id = ?', job)).toBe(1)
})

it('deletes a job with no history and leaves other jobs untouched', async () => {
  const other = jobWithHistory()
  const empty = createJob('Empty').id
  const preview = previewJobDeletion(1, empty)
  expect(preview.counts.meetings + preview.counts.recordings).toBe(0)
  expect((await deleteJob(1, preview.token!)).status).toBe('deleted')
  expect(rows('meetings WHERE job_id = ?', other.job)).toBe(2)
  expect(existsSync(other.wav)).toBe(true)
})
