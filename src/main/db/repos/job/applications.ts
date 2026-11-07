import type { MeetingResume } from '@shared/meeting-resume'
import {
  JOB_TEXT_FIELDS,
  type ApplicationStage,
  type JobTextField,
  type JudgementField,
} from '@shared/jobs/applications'
import type { ImportBaseline } from '@shared/jobs/import-baseline'
import { getDb } from '../../index'

// The job ↔ resumes-application link (v13 job_applications) and the one-transaction writes
// that create or refresh a linked job. Callers validate and resolve choices first.

export interface LinkWrite {
  applicationId: string
  sourceRoot: string
  contentHash: string | null
  fingerprint: string
  stage: ApplicationStage
  sourceUpdatedAt: string | null
  baseline: ImportBaseline
}

export interface ApplicationLink extends LinkWrite {
  jobId: number
  jobName: string
  archived: boolean
  importedAt: string
}

/** What is saved for a job now: the "local" side of a refresh. */
export interface LocalJobState {
  id: number
  name: string
  archived: boolean
  fields: Record<JobTextField, string>
  glossary: { term: string; note: string }[]
  resume: MeetingResume | null
  link: ApplicationLink | null
}

const COLUMN: Record<JobTextField, string> = {
  companyInfo: 'company_info',
  projectScope: 'project_scope',
  notes: 'notes',
  talkingPoints: 'talking_points',
  persona: 'persona',
}

export function emptyBaseline(): ImportBaseline {
  return {
    version: 1,
    fields: Object.fromEntries(JOB_TEXT_FIELDS.map((k) => [k, ''])) as Record<JobTextField, string>,
    glossary: [],
    resume: null,
    sources: {},
  }
}

/** Tolerant read of a stored baseline: anything malformed reads as empty (every source
 *  value then looks new, so a refresh reviews rather than silently overwrites). */
export function parseBaseline(json: string): ImportBaseline {
  const base = emptyBaseline()
  try {
    const raw = JSON.parse(json) as Partial<ImportBaseline>
    if (raw?.version !== 1) return base
    for (const key of JOB_TEXT_FIELDS)
      if (typeof raw.fields?.[key] === 'string') base.fields[key] = raw.fields[key]
    if (Array.isArray(raw.glossary))
      base.glossary = raw.glossary.filter((t): t is string => typeof t === 'string')
    const r = raw.resume
    if (r && typeof r.name === 'string' && typeof r.text === 'string')
      base.resume = { name: r.name, text: r.text }
    if (raw.sources && typeof raw.sources === 'object')
      for (const [k, v] of Object.entries(raw.sources))
        if (v === 'resumes' || v === 'drafted') base.sources[k as JudgementField] = v
  } catch {
    return base
  }
  return base
}

interface LinkRow {
  job_id: number
  application_id: string
  source_root: string
  content_hash: string | null
  fingerprint: string
  source_stage: ApplicationStage
  source_updated_at: string | null
  imported_at: string
  baseline: string
  job_name: string
  archived: number
}

const LINK_SELECT = `SELECT a.*, j.name AS job_name, j.archived AS archived
  FROM job_applications a JOIN jobs j ON j.id = a.job_id`

function toLink(r: LinkRow): ApplicationLink {
  return {
    jobId: r.job_id,
    jobName: r.job_name,
    archived: r.archived === 1,
    applicationId: r.application_id,
    sourceRoot: r.source_root,
    contentHash: r.content_hash,
    fingerprint: r.fingerprint,
    stage: r.source_stage,
    sourceUpdatedAt: r.source_updated_at,
    importedAt: r.imported_at,
    baseline: parseBaseline(r.baseline),
  }
}

/** Every link, archived jobs included. */
export function listApplicationLinks(): ApplicationLink[] {
  return (getDb().prepare(LINK_SELECT).all() as LinkRow[]).map(toLink)
}

export function getApplicationLink(applicationId: string): ApplicationLink | null {
  const row = getDb().prepare(`${LINK_SELECT} WHERE a.application_id = ?`).get(applicationId) as
    LinkRow | undefined
  return row ? toLink(row) : null
}

export function getLocalJobState(jobId: number): LocalJobState | null {
  const db = getDb()
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as
    (Record<string, unknown> & { id: number; name: string; archived: number }) | undefined
  if (!job) return null
  const fields = Object.fromEntries(
    JOB_TEXT_FIELDS.map((k) => [k, String(job[COLUMN[k]] ?? '')]),
  ) as Record<JobTextField, string>
  const glossary = db
    .prepare('SELECT term, note FROM glossary WHERE job_id = ? ORDER BY id')
    .all(jobId) as { term: string; note: string }[]
  const resume = db.prepare('SELECT name, text FROM job_resumes WHERE job_id = ?').get(jobId) as
    MeetingResume | undefined
  const link = db.prepare(`${LINK_SELECT} WHERE a.job_id = ?`).get(jobId) as LinkRow | undefined
  return {
    id: job.id,
    name: job.name,
    archived: job.archived === 1,
    fields,
    glossary: glossary.map((g) => ({ term: g.term, note: g.note })),
    resume: resume ? { name: resume.name, text: resume.text } : null,
    link: link ? toLink(link) : null,
  }
}

function insertGlossary(jobId: number, terms: readonly string[]): void {
  const insert = getDb().prepare('INSERT INTO glossary (job_id, term, note) VALUES (?, ?, ?)')
  for (const term of terms) insert.run(jobId, term, '')
}

function writeResume(jobId: number, resume: MeetingResume | null): void {
  const db = getDb()
  if (resume)
    db.prepare(
      `INSERT INTO job_resumes (job_id, name, text) VALUES (?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET name = excluded.name, text = excluded.text`,
    ).run(jobId, resume.name, resume.text)
  else db.prepare('DELETE FROM job_resumes WHERE job_id = ?').run(jobId)
}

function duplicateLink(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message) && /application_id/i.test(e.message)
}

export interface CreateFromApplication {
  name: string
  fields: Record<JobTextField, string>
  glossary: readonly string[]
  resume: MeetingResume | null
  link: LinkWrite
}

/** Creates the job with its glossary, saved resume, link and baseline in one transaction:
 *  any failure leaves nothing behind. A second import of the same application fails on the
 *  unique link (also when two requests race). */
export function createJobFromApplication(input: CreateFromApplication): number {
  const db = getDb()
  try {
    return db.transaction(() => {
      const res = db
        .prepare(
          `INSERT INTO jobs (name, company_info, project_scope, notes, talking_points, persona)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name,
          input.fields.companyInfo,
          input.fields.projectScope,
          input.fields.notes,
          input.fields.talkingPoints,
          input.fields.persona,
        )
      const jobId = Number(res.lastInsertRowid)
      insertGlossary(jobId, input.glossary)
      if (input.resume) writeResume(jobId, input.resume)
      writeLink(jobId, input.link, true)
      return jobId
    })() as number
  } catch (e) {
    if (duplicateLink(e)) throw new Error('This application has already been imported.')
    throw e
  }
}

function writeLink(jobId: number, link: LinkWrite, insert: boolean): void {
  const values = [
    link.applicationId,
    link.sourceRoot,
    link.contentHash,
    link.fingerprint,
    link.stage,
    link.sourceUpdatedAt,
    JSON.stringify(link.baseline),
  ]
  const db = getDb()
  if (insert) {
    db.prepare(
      `INSERT INTO job_applications (application_id, source_root, content_hash, fingerprint,
         source_stage, source_updated_at, baseline, job_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(...values, jobId)
    return
  }
  const res = db
    .prepare(
      `UPDATE job_applications SET application_id = ?, source_root = ?, content_hash = ?,
         fingerprint = ?, source_stage = ?, source_updated_at = ?, baseline = ?,
         imported_at = datetime('now') WHERE job_id = ?`,
    )
    .run(...values, jobId)
  if (Number(res.changes) !== 1) throw new Error('This job is not linked to that application.')
}

export interface RefreshFromApplication {
  jobId: number
  /** Only the fields to change. */
  fields: Partial<Record<JobTextField, string>>
  /** Replaces the whole glossary (term notes included) when set. */
  glossary?: readonly string[]
  /** undefined leaves the saved resume; null removes it. */
  resume?: MeetingResume | null
  archive: boolean
  /** The new baseline: advances to the incoming values even where Sanas values were kept. */
  link: LinkWrite
}

/** Applies a reviewed refresh in one transaction. Never unarchives. */
export function applyApplicationRefresh(input: RefreshFromApplication): void {
  const db = getDb()
  db.transaction(() => {
    if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(input.jobId))
      throw new Error('Job not found.')
    for (const key of JOB_TEXT_FIELDS) {
      const value = input.fields[key]
      if (value === undefined) continue
      db.prepare(`UPDATE jobs SET ${COLUMN[key]} = ? WHERE id = ?`).run(value, input.jobId)
    }
    if (input.glossary) {
      db.prepare('DELETE FROM glossary WHERE job_id = ?').run(input.jobId)
      insertGlossary(input.jobId, input.glossary)
    }
    if (input.resume !== undefined) writeResume(input.jobId, input.resume)
    if (input.archive) db.prepare('UPDATE jobs SET archived = 1 WHERE id = ?').run(input.jobId)
    writeLink(input.jobId, input.link, false)
  })()
}
