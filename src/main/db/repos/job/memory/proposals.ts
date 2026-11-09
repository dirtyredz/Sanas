import { createHash, randomUUID } from 'node:crypto'
import type { JobMemoryView, MemoryProposal, MemoryReview } from '@shared/jobs/memory'
import { getDb } from '../../../index'
import { getApprovedMemory, ordinaryJob, replaceMemory, validateMemory } from './approved'

export interface MemorySource {
  meetingId: number
  jobId: number
  title: string
  startedAt: string
  summary: string
  actions: string
  fingerprint: string
}
export function memorySource(meetingId: number): MemorySource | null {
  const row = getDb()
    .prepare(
      `SELECT m.id AS meetingId,m.job_id AS jobId,m.title,m.started_at AS startedAt,
    coalesce(m.summary,'') AS summary,coalesce(m.action_items,'') AS actions
    FROM meetings m JOIN jobs j ON j.id=m.job_id
    WHERE m.id=? AND m.ended_at IS NOT NULL AND m.practice=0 AND j.name<>'Unsorted'
    AND (coalesce(m.summary,'')<>'' OR coalesce(m.action_items,'')<>'')`,
    )
    .get(meetingId) as Omit<MemorySource, 'fingerprint'> | undefined
  return row
    ? { ...row, fingerprint: createHash('sha256').update(JSON.stringify(row)).digest('hex') }
    : null
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
export function validProposal(p: MemoryProposal): boolean {
  const source = memorySource(p.meetingId)
  return (
    !!source &&
    source.jobId === p.jobId &&
    source.fingerprint === p.fingerprint &&
    getApprovedMemory(p.jobId).revision === p.baseRevision
  )
}
export function memoryView(jobId: number): JobMemoryView {
  const proposals = getDb()
    .prepare(
      `SELECT ${columns} FROM job_memory_proposals p JOIN meetings m ON m.id=p.meeting_id WHERE p.job_id=? AND p.status NOT IN ('approved','dismissed') ORDER BY m.started_at,m.id`,
    )
    .all(jobId) as MemoryProposal[]
  return {
    approved: getApprovedMemory(jobId),
    eligible: ordinaryJob(jobId),
    proposals: proposals.map((p) => ({ ...p, status: validProposal(p) ? p.status : 'stale' })),
  }
}
export function beginProposal(source: MemorySource, retry = false): MemoryProposal | null {
  const old = getProposal(source.meetingId)
  if (!retry && old?.fingerprint === source.fingerprint && old.status !== 'stale') return null
  const revision = getApprovedMemory(source.jobId).revision
  getDb()
    .prepare(
      `INSERT INTO job_memory_proposals(meeting_id,job_id,fingerprint,base_revision,generation,status)
    VALUES (?,?,?,?,?,'generating') ON CONFLICT(meeting_id) DO UPDATE SET job_id=excluded.job_id,
    fingerprint=excluded.fingerprint,base_revision=excluded.base_revision,generation=excluded.generation,text='',status='generating'`,
    )
    .run(source.meetingId, source.jobId, source.fingerprint, revision, randomUUID())
  return getProposal(source.meetingId)!
}
export function finishProposal(p: MemoryProposal, text: string | null): void {
  if (text !== null) validateMemory(text)
  const status = !validProposal(p) ? 'stale' : text === null ? 'failed' : 'pending'
  getDb()
    .prepare(
      "UPDATE job_memory_proposals SET text=?,status=? WHERE meeting_id=? AND generation=? AND status='generating'",
    )
    .run(text ?? '', status, p.meetingId, p.generation)
}
export function approveProposal(jobId: number, review: MemoryReview): void {
  getDb().transaction(() => {
    const p = getProposal(review.meetingId)
    if (
      !p ||
      p.jobId !== jobId ||
      p.generation !== review.generation ||
      p.status !== 'pending' ||
      p.baseRevision !== review.revision ||
      !validProposal(p)
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
