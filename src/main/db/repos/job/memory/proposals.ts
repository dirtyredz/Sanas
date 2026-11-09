import type { MemoryProposal, MemoryReview } from '@shared/jobs/memory'
import { getDb } from '../../../index'
import { ELIGIBLE_MEETING_SQL } from '../eligible-meeting'
import { replaceMemory } from './approved'

/** Persistence only. The review rules (staleness, skip, retry, view status) live in
 *  services/jobs/memory; the one decision made here is the atomic compare-and-set of approval. */
export interface MemorySourceRow {
  meetingId: number
  jobId: number
  title: string
  startedAt: string
  summary: string
  actions: string
}
/** An eligible meeting that has a summary or action items, or null. */
export function readMemorySource(meetingId: number): MemorySourceRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT m.id AS meetingId,m.job_id AS jobId,m.title,m.started_at AS startedAt,
    coalesce(m.summary,'') AS summary,coalesce(m.action_items,'') AS actions
    FROM meetings m JOIN jobs j ON j.id=m.job_id
    WHERE m.id=? AND ${ELIGIBLE_MEETING_SQL}
    AND (coalesce(m.summary,'')<>'' OR coalesce(m.action_items,'')<>'')`,
      )
      .get(meetingId) as MemorySourceRow | undefined) ?? null
  )
}
const columns = `p.meeting_id AS meetingId,p.job_id AS jobId,m.title,m.started_at AS startedAt,
  p.fingerprint,p.base_revision AS baseRevision,p.generation,p.text,p.status`
export function getProposal(meetingId: number): MemoryProposal | undefined {
  return getDb()
    .prepare(
      `SELECT ${columns} FROM job_memory_proposals p JOIN meetings m ON m.id=p.meeting_id WHERE p.meeting_id=?`,
    )
    .get(meetingId) as MemoryProposal | undefined
}
/** Stored (not yet staleness-checked) proposals still awaiting a decision, oldest meeting first. */
export function openProposals(jobId: number): MemoryProposal[] {
  return getDb()
    .prepare(
      `SELECT ${columns} FROM job_memory_proposals p JOIN meetings m ON m.id=p.meeting_id WHERE p.job_id=? AND p.status NOT IN ('approved','dismissed') ORDER BY m.started_at,m.id`,
    )
    .all(jobId) as MemoryProposal[]
}
/** Upserts the meeting's proposal as a fresh `generating` row under a new generation id. */
export function startProposal(
  source: { meetingId: number; jobId: number; fingerprint: string },
  baseRevision: number,
  generation: string,
): MemoryProposal {
  getDb()
    .prepare(
      `INSERT INTO job_memory_proposals(meeting_id,job_id,fingerprint,base_revision,generation,status)
    VALUES (?,?,?,?,?,'generating') ON CONFLICT(meeting_id) DO UPDATE SET job_id=excluded.job_id,
    fingerprint=excluded.fingerprint,base_revision=excluded.base_revision,generation=excluded.generation,text='',status='generating'`,
    )
    .run(source.meetingId, source.jobId, source.fingerprint, baseRevision, generation)
  return getProposal(source.meetingId)!
}
/** Settles a generating row; a later generation's row is left untouched. */
export function settleProposal(
  meetingId: number,
  generation: string,
  text: string,
  status: 'pending' | 'failed' | 'stale',
): void {
  getDb()
    .prepare(
      "UPDATE job_memory_proposals SET text=?,status=? WHERE meeting_id=? AND generation=? AND status='generating'",
    )
    .run(text, status, meetingId, generation)
}
/** Approval as one transaction: the stored proposal must still be the reviewed pending one for
 *  this job, built on the reviewed revision, from a source whose current `sourceFingerprint`
 *  equals the stored one (null = source gone or moved); then the approved text is replaced
 *  (which re-checks the revision) and the proposal marked approved. */
export function markApprovedIf(
  jobId: number,
  review: MemoryReview,
  sourceFingerprint: string | null,
): void {
  getDb().transaction(() => {
    const p = getProposal(review.meetingId)
    if (
      !p ||
      p.jobId !== jobId ||
      p.generation !== review.generation ||
      p.status !== 'pending' ||
      p.baseRevision !== review.revision ||
      sourceFingerprint === null ||
      p.fingerprint !== sourceFingerprint
    )
      throw new Error('Proposal changed. Reload and regenerate before approval.')
    replaceMemory(jobId, review.revision, review.text)
    getDb()
      .prepare("UPDATE job_memory_proposals SET status='approved' WHERE meeting_id=?")
      .run(p.meetingId)
  })()
}
export function dismissProposal(jobId: number, meetingId: number, generation: string): void {
  const result = getDb()
    .prepare(
      "UPDATE job_memory_proposals SET status='dismissed' WHERE job_id=? AND meeting_id=? AND generation=? AND status NOT IN ('approved','dismissed')",
    )
    .run(jobId, meetingId, generation)
  if (!result.changes) throw new Error('Proposal changed. Reload before dismissing.')
}
