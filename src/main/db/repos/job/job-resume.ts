import type { MeetingResume } from '@shared/meeting-resume'
import { getDb } from '../../index'

/** The job's saved resume, or null when it has none. */
export function getJobResume(jobId: number): MeetingResume | null {
  const row = getDb().prepare('SELECT name, text FROM job_resumes WHERE job_id = ?').get(jobId) as
    MeetingResume | undefined
  return row ? { name: row.name, text: row.text } : null
}

/** Replaces (or, with null, removes) a job's saved resume. Callers validate first. Meetings
 *  already started keep their own snapshot. */
export function setJobResume(jobId: number, resume: MeetingResume | null): MeetingResume | null {
  const db = getDb()
  db.transaction(() => {
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId))
      throw new Error('Job not found.')
    if (resume)
      db.prepare(
        `INSERT INTO job_resumes (job_id, name, text) VALUES (?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET name = excluded.name, text = excluded.text`,
      ).run(jobId, resume.name, resume.text)
    else db.prepare('DELETE FROM job_resumes WHERE job_id = ?').run(jobId)
  })()
  return getJobResume(jobId)
}
