import {
  getApprovedMemory,
  ordinaryJob,
  saveMemory,
  validateMemory,
} from '../../../db/repos/job/memory/approved'
import {
  dismissProposal,
  markApprovedIf,
  openProposals,
} from '../../../db/repos/job/memory/proposals'
import { generateMemory, generatingMemory } from './generate'
import { memorySource, proposalIsCurrent } from './source'
import type { JobMemoryView, MemoryReview } from '@shared/jobs/memory'

/** The memory-review workflow: IPC validates shapes, repos persist, this owns the rules
 *  (view status, approval currency, retry eligibility). */

/** Proposals whose source or approved base moved read as stale; a persisted generating row
 *  with no live generation (after restart) reads as failed and retryable, never an eternal spinner. */
export function reviewMemory(jobId: number): JobMemoryView {
  return {
    approved: getApprovedMemory(jobId),
    eligible: ordinaryJob(jobId),
    proposals: openProposals(jobId).map((p) => {
      if (!proposalIsCurrent(p)) return { ...p, status: 'stale' }
      return p.status === 'generating' && !generatingMemory(p.meetingId)
        ? { ...p, status: 'failed' }
        : p
    }),
  }
}
export function saveApprovedMemory(jobId: number, revision: number, text: string): JobMemoryView {
  validateMemory(text)
  saveMemory(jobId, revision, text)
  return reviewMemory(jobId)
}
export function approveMemoryProposal(jobId: number, review: MemoryReview): JobMemoryView {
  validateMemory(review.text)
  markApprovedIf(jobId, review, () => {
    const source = memorySource(review.meetingId)
    return source?.jobId === jobId ? source.fingerprint : null
  })
  return reviewMemory(jobId)
}
export function dismissMemoryProposal(
  jobId: number,
  meetingId: number,
  generation: string,
): JobMemoryView {
  dismissProposal(jobId, meetingId, generation)
  return reviewMemory(jobId)
}
export function retryMemoryProposal(jobId: number, meetingId: number): JobMemoryView {
  if (memorySource(meetingId)?.jobId !== jobId)
    throw new Error('Source is no longer available for this job.')
  void generateMemory(meetingId, true).catch(() => {})
  return reviewMemory(jobId)
}
