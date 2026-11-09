import { createHash } from 'node:crypto'
import type { MemoryProposal } from '@shared/jobs/memory'
import { getApprovedMemory } from '../../../db/repos/job/memory/approved'
import { readMemorySource, type MemorySourceRow } from '../../../db/repos/job/memory/proposals'

/** A meeting's summary/actions as memory evidence, fingerprinted so edits make proposals stale. */
export interface MemorySource extends MemorySourceRow {
  fingerprint: string
}
export function memorySource(meetingId: number): MemorySource | null {
  const row = readMemorySource(meetingId)
  return row
    ? { ...row, fingerprint: createHash('sha256').update(JSON.stringify(row)).digest('hex') }
    : null
}
/** A proposal is current while its source is unchanged, still on its job, and the approved
 *  memory is still at the revision it was written against. */
export function proposalIsCurrent(p: MemoryProposal): boolean {
  const source = memorySource(p.meetingId)
  return (
    !!source &&
    source.jobId === p.jobId &&
    source.fingerprint === p.fingerprint &&
    getApprovedMemory(p.jobId).revision === p.baseRevision
  )
}
