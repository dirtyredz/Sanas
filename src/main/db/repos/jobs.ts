import { getDb } from '../index'
import { reservedNameError, UNSORTED_JOB_NAME } from '@shared/jobs/unsorted'
import type { Job } from '@shared/types'

interface JobRow {
  id: number
  name: string
  company_info: string
  project_scope: string
  notes: string
  talking_points: string
  persona: string
  summary_email: string
  created_at: string
  archived: number
  application_id?: string | null
}

/** The list view carries the v13 application link; single-row reads stay on jobs alone. */
const JOB_SELECT = `SELECT j.*, a.application_id FROM jobs j
  LEFT JOIN job_applications a ON a.job_id = j.id`

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    name: r.name,
    companyInfo: r.company_info,
    projectScope: r.project_scope,
    notes: r.notes,
    talkingPoints: r.talking_points,
    persona: r.persona,
    summaryEmail: r.summary_email,
    createdAt: r.created_at,
    archived: r.archived === 1,
    ...(r.application_id !== undefined && { applicationId: r.application_id }),
  }
}

export function listJobs(includeArchived = false): Job[] {
  const rows = getDb()
    .prepare(
      `${JOB_SELECT} ${includeArchived ? '' : 'WHERE j.archived = 0'} ORDER BY j.name COLLATE NOCASE`,
    )
    .all() as JobRow[]
  return rows.map(toJob)
}

export function getJob(id: number): Job | null {
  const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined
  return row ? toJob(row) : null
}

export function createJob(name: string): Job {
  const reserved = reservedNameError(name, null)
  if (reserved) throw new Error(reserved)
  const res = getDb().prepare(`INSERT INTO jobs (name) VALUES (?)`).run(name)
  return getJob(Number(res.lastInsertRowid))!
}

export function updateJob(job: Omit<Job, 'createdAt' | 'archived'>): Job {
  const reserved = reservedNameError(job.name, getJob(job.id))
  if (reserved) throw new Error(reserved)
  getDb()
    .prepare(
      `UPDATE jobs SET name = ?, company_info = ?, project_scope = ?, notes = ?,
       talking_points = ?, persona = ?, summary_email = ? WHERE id = ?`,
    )
    .run(
      job.name,
      job.companyInfo,
      job.projectScope,
      job.notes,
      job.talkingPoints,
      job.persona,
      job.summaryEmail.trim(),
      job.id,
    )
  return getJob(job.id)!
}

export function setJobArchived(id: number, archived: boolean): void {
  getDb()
    .prepare(`UPDATE jobs SET archived = ? WHERE id = ?`)
    .run(archived ? 1 : 0, id)
}

/** Meetings need a job; used when starting a meeting with none selected. */
export function ensureDefaultJob(): number {
  const db = getDb()
  const existing = db.prepare(`SELECT id FROM jobs WHERE name = ?`).get(UNSORTED_JOB_NAME) as
    { id: number } | undefined
  if (existing) return existing.id
  const res = db.prepare(`INSERT INTO jobs (name) VALUES (?)`).run(UNSORTED_JOB_NAME)
  return Number(res.lastInsertRowid)
}
