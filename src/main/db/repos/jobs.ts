import { getDb } from '../index'
import type { GlossaryTerm, Job } from '@shared/types'

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
}

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
  }
}

export function listJobs(includeArchived = false): Job[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY name COLLATE NOCASE`,
    )
    .all() as JobRow[]
  return rows.map(toJob)
}

export function getJob(id: number): Job | null {
  const row = getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as JobRow | undefined
  return row ? toJob(row) : null
}

export function createJob(name: string): Job {
  const res = getDb().prepare(`INSERT INTO jobs (name) VALUES (?)`).run(name)
  return getJob(Number(res.lastInsertRowid))!
}

export function updateJob(job: Omit<Job, 'createdAt' | 'archived'>): Job {
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
  const existing = db.prepare(`SELECT id FROM jobs WHERE name = 'Unsorted'`).get() as
    { id: number } | undefined
  if (existing) return existing.id
  const res = db.prepare(`INSERT INTO jobs (name) VALUES ('Unsorted')`).run()
  return Number(res.lastInsertRowid)
}

// --- glossary ---

export function listGlossary(jobId: number): GlossaryTerm[] {
  return getDb()
    .prepare(
      `SELECT id, job_id AS jobId, term, note FROM glossary WHERE job_id = ? ORDER BY term COLLATE NOCASE`,
    )
    .all(jobId) as GlossaryTerm[]
}

export function getGlossaryTerms(jobId: number): string[] {
  const rows = getDb().prepare(`SELECT term FROM glossary WHERE job_id = ?`).all(jobId) as {
    term: string
  }[]
  return rows.map((r) => r.term)
}

export function addGlossaryTerm(jobId: number, term: string, note: string): GlossaryTerm {
  const res = getDb()
    .prepare(`INSERT INTO glossary (job_id, term, note) VALUES (?, ?, ?)`)
    .run(jobId, term, note)
  return { id: Number(res.lastInsertRowid), jobId, term, note }
}

export function removeGlossaryTerm(id: number): void {
  getDb().prepare(`DELETE FROM glossary WHERE id = ?`).run(id)
}
