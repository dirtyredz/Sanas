import { reviewMemory } from '../../services/jobs/memory/review'
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { saveMemory, validateMemory } from '../../db/repos/job/memory/approved'
import { approveProposal, dismissProposal, memorySource } from '../../db/repos/job/memory/proposals'
import { generateMemory } from '../../services/jobs/memory/generate'
import { requireId, requireText } from '../validate'

function revision(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 0) throw new Error('Invalid memory revision.')
  return raw as number
}
export function registerMemoryIpc(): void {
  ipcMain.handle(IPC.MemoryGet, (_e, id: unknown) => reviewMemory(requireId(id, 'job id')))
  ipcMain.handle(IPC.MemorySave, (_e, id: unknown, rev: unknown, text: unknown) => {
    const jobId = requireId(id, 'job id')
    validateMemory(text)
    saveMemory(jobId, revision(rev), text)
    return reviewMemory(jobId)
  })
  ipcMain.handle(IPC.MemoryApprove, (_e, id: unknown, raw: unknown) => {
    const jobId = requireId(id, 'job id')
    if (!raw || typeof raw !== 'object') throw new Error('Invalid review.')
    const r = raw as Record<string, unknown>
    validateMemory(r.text)
    approveProposal(jobId, {
      meetingId: requireId(r.meetingId, 'meeting id'),
      generation: requireText(r.generation, 'generation', 100),
      revision: revision(r.revision),
      text: r.text,
    })
    return reviewMemory(jobId)
  })
  ipcMain.handle(IPC.MemoryDismiss, (_e, id: unknown, meeting: unknown, gen: unknown) => {
    const jobId = requireId(id, 'job id')
    dismissProposal(jobId, requireId(meeting, 'meeting id'), requireText(gen, 'generation', 100))
    return reviewMemory(jobId)
  })
  ipcMain.handle(IPC.MemoryRetry, (_e, id: unknown, meeting: unknown) => {
    const jobId = requireId(id, 'job id'),
      meetingId = requireId(meeting, 'meeting id')
    if (memorySource(meetingId)?.jobId !== jobId)
      throw new Error('Source is no longer available for this job.')
    void generateMemory(meetingId, true).catch(() => {})
    return reviewMemory(jobId)
  })
}
