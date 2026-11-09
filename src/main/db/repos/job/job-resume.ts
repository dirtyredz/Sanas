import type { MeetingResume } from '@shared/meeting/meeting-resume'
import { isUnsortedJob, UNSORTED_RESUME_MESSAGE } from '@shared/jobs/unsorted'
import { getDb } from '../../index'

/** The job's saved resume, or null when it has none. */
export function getJobResume(jobId: number): MeetingResume | null {
  const row = getDb().prepare('SELECT name, text FROM job_resumes WHERE job_id = ?').get(jobId) as
    MeetingResume | undefined
  return row ? { name: row.name, text: row.text } : null
}

/** Replaces (or, with null, removes) a job's saved resume. Callers validate first. Meetings
 *  already started keep their own snapshot. The Unsorted bucket takes no resume (it holds
 *  unrelated calls); removing one a legacy bucket still carries is allowed. */
export function setJobResume(jobId: number, resume: MeetingResume | null): MeetingResume | null {
  const db = getDb()
  db.transaction(() => {
    const job = db.prepare('SELECT name FROM jobs WHERE id = ?').get(jobId) as
      { name: string } | undefined
    if (!job) throw new Error('Job not found.')
    if (resume && isUnsortedJob(job)) throw new Error(UNSORTED_RESUME_MESSAGE)
    if (resume)
      db.prepare(
        `INSERT INTO job_resumes (job_id, name, text) VALUES (?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET name = excluded.name, text = excluded.text`,
      ).run(jobId, resume.name, resume.text)
    else db.prepare('DELETE FROM job_resumes WHERE job_id = ?').run(jobId)
  })()
  return getJobResume(jobId)
}
