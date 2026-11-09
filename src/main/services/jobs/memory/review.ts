import { saveMemory, validateMemory } from '../../../db/repos/job/memory/approved'
import {
  approveProposal,
  dismissProposal,
  memorySource,
  memoryView,
} from '../../../db/repos/job/memory/proposals'
import { generateMemory, generatingMemory } from './generate'
import type { JobMemoryView, MemoryReview } from '@shared/jobs/memory'

/** The memory-review workflow: IPC validates shapes, repos persist, this owns the rules. */

/** A persisted generating row after restart is retryable, never an eternal spinner. */
export function reviewMemory(jobId: number): JobMemoryView {
  const view = memoryView(jobId)
  return {
    ...view,
    proposals: view.proposals.map((p) =>
      p.status === 'generating' && !generatingMemory(p.meetingId) ? { ...p, status: 'failed' } : p,
    ),
  }
}
export function saveApprovedMemory(jobId: number, revision: number, text: string): JobMemoryView {
  validateMemory(text)
  saveMemory(jobId, revision, text)
  return reviewMemory(jobId)
}
export function approveMemoryProposal(jobId: number, review: MemoryReview): JobMemoryView {
  validateMemory(review.text)
  approveProposal(jobId, review)
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
