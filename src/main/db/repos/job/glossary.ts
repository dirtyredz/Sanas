import { getDb } from '../../index'
import type { GlossaryTerm } from '@shared/types'

// A job's glossary: terminology for prompts and STT hints. Rows cascade with the job.

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
