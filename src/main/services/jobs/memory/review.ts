import { memoryView } from '../../../db/repos/job/memory/proposals'
import { generatingMemory } from './generate'
import type { JobMemoryView } from '@shared/jobs/memory'

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
