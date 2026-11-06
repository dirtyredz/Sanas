import type { JobDeletionCounts } from '@shared/jobs/deletion'
import { getDb } from '../../index'

// Counting and the final row delete for removing a job. Meetings are removed one by one by
// services/jobs/deletion.ts (through services/meetings/remove.ts, which also deletes the
// recording); the v13 jobs_delete_guard trigger refuses a job row that still has any.

/** The name ensureDefaultJob resolves the default bucket by. */
export const UNSORTED_JOB_NAME = 'Unsorted'

/** ID 1 and the name-resolved Unsorted bucket can never be deleted (Unsorted is found by
 *  name, not guaranteed to be ID 1; both stay protected and nothing is renumbered). */
export function isProtectedJob(id: number, name: string): boolean {
  return id === 1 || name === UNSORTED_JOB_NAME
}

export interface JobMeetingRef {
  id: number
  practice: boolean
  audioPath: string | null
}

export interface JobDeletionSnapshot {
  job: { id: number; name: string } | null
  counts: JobDeletionCounts
  meetings: JobMeetingRef[]
}

const count = (sql: string, jobId: number): number =>
  (getDb().prepare(sql).get(jobId) as { n: number }).n

/** Every dependent row, counted directly per table (listMeetings excludes practice). */
export function countJobDependencies(jobId: number): JobDeletionCounts {
  return {
    meetings: count('SELECT COUNT(*) AS n FROM meetings WHERE job_id = ? AND practice = 0', jobId),
    practiceSessions: count(
      'SELECT COUNT(*) AS n FROM meetings WHERE job_id = ? AND practice = 1',
      jobId,
    ),
    transcriptSegments: count(
      'SELECT COUNT(*) AS n FROM segments s JOIN meetings m ON m.id = s.meeting_id WHERE m.job_id = ?',
      jobId,
    ),
    summaries: count(
      "SELECT COUNT(*) AS n FROM meetings WHERE job_id = ? AND summary IS NOT NULL AND summary <> ''",
      jobId,
    ),
    suggestions: count(
      'SELECT COUNT(*) AS n FROM suggestions s JOIN meetings m ON m.id = s.meeting_id WHERE m.job_id = ?',
      jobId,
    ),
    recordings: count(
      "SELECT COUNT(*) AS n FROM meetings WHERE job_id = ? AND audio_path IS NOT NULL AND audio_path <> ''",
      jobId,
    ),
    glossaryTerms: count('SELECT COUNT(*) AS n FROM glossary WHERE job_id = ?', jobId),
    resumes: count('SELECT COUNT(*) AS n FROM job_resumes WHERE job_id = ?', jobId),
    applicationLinks: count('SELECT COUNT(*) AS n FROM job_applications WHERE job_id = ?', jobId),
    legacySlides: count('SELECT COUNT(*) AS n FROM job_slides WHERE job_id = ?', jobId),
  }
}

/** The job, its counts and its meetings (both kinds, oldest first), read together. */
export function jobDeletionSnapshot(jobId: number): JobDeletionSnapshot {
  const db = getDb()
  const job = db.prepare('SELECT id, name FROM jobs WHERE id = ?').get(jobId) as
    { id: number; name: string } | undefined
  const rows = db
    .prepare('SELECT id, practice, audio_path FROM meetings WHERE job_id = ? ORDER BY id')
    .all(jobId) as { id: number; practice: number; audio_path: string | null }[]
  return {
    job: job ? { id: job.id, name: job.name } : null,
    counts: countJobDependencies(jobId),
    meetings: rows.map((r) => ({
      id: r.id,
      practice: r.practice === 1,
      audioPath: r.audio_path || null,
    })),
  }
}

/** Deletes the job row once its meetings are gone; glossary, saved resume, application link
 *  and legacy job slides cascade. Throws (and deletes nothing) for a protected job or one that
 *  still has a meeting, including one created since the caller last looked. */
export function deleteJobRow(jobId: number): void {
  const db = getDb()
  db.transaction(() => {
    const job = db.prepare('SELECT id, name FROM jobs WHERE id = ?').get(jobId) as
      { id: number; name: string } | undefined
    if (!job) throw new Error('Job not found.')
    if (isProtectedJob(job.id, job.name)) throw new Error('The Unsorted job cannot be deleted.')
    if (db.prepare('SELECT 1 FROM meetings WHERE job_id = ? LIMIT 1').get(jobId))
      throw new Error('This job still has meetings.')
    db.prepare('DELETE FROM jobs WHERE id = ?').run(jobId)
  })()
}
