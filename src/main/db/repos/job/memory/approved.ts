import { JOB_MEMORY_MAX_CHARS, type ApprovedMemory } from '@shared/jobs/memory'
import { getDb } from '../../../index'

export function validateMemory(text: unknown): asserts text is string {
  if (typeof text !== 'string' || text.length > JOB_MEMORY_MAX_CHARS || text.includes('\0'))
    throw new Error('Memory must be text of at most 3,000 characters.')
}
export function ordinaryJob(jobId: number): boolean {
  const job = getDb().prepare('SELECT name FROM jobs WHERE id = ?').get(jobId) as
    { name: string } | undefined
  return !!job && job.name !== 'Unsorted'
}
export function getApprovedMemory(jobId: number): ApprovedMemory {
  return (
    (getDb()
      .prepare('SELECT text, revision, updated_at AS updatedAt FROM job_memory WHERE job_id = ?')
      .get(jobId) as ApprovedMemory | undefined) ?? { text: '', revision: 0, updatedAt: null }
  )
}
/** Called inside the caller's transaction when approving a proposal. */
export function replaceMemory(jobId: number, revision: number, text: string): void {
  validateMemory(text)
  if (!ordinaryJob(jobId)) throw new Error('Memory requires an ordinary job.')
  if (getApprovedMemory(jobId).revision !== revision)
    throw new Error('Memory changed. Reload before saving.')
  getDb()
    .prepare(
      `INSERT INTO job_memory(job_id,text,revision) VALUES (?,?,?)
    ON CONFLICT(job_id) DO UPDATE SET text=excluded.text, revision=excluded.revision, updated_at=datetime('now')`,
    )
    .run(jobId, text, revision + 1)
  getDb()
    .prepare(
      "UPDATE job_memory_proposals SET status='stale' WHERE job_id=? AND status IN ('pending','generating','failed')",
    )
    .run(jobId)
}
export function saveMemory(jobId: number, revision: number, text: string): void {
  getDb().transaction(() => replaceMemory(jobId, revision, text))()
}
