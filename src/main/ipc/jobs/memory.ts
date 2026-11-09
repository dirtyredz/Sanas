import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  approveMemoryProposal,
  dismissMemoryProposal,
  retryMemoryProposal,
  reviewMemory,
  saveApprovedMemory,
} from '../../services/jobs/memory/review'
import { requireId, requireText } from '../validate'

function revision(raw: unknown): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 0) throw new Error('Invalid memory revision.')
  return raw as number
}
function memoryText(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Memory must be text.')
  return raw
}
export function registerMemoryIpc(): void {
  ipcMain.handle(IPC.MemoryGet, (_e, id: unknown) => reviewMemory(requireId(id, 'job id')))
  ipcMain.handle(IPC.MemorySave, (_e, id: unknown, rev: unknown, text: unknown) =>
    saveApprovedMemory(requireId(id, 'job id'), revision(rev), memoryText(text)),
  )
  ipcMain.handle(IPC.MemoryApprove, (_e, id: unknown, raw: unknown) => {
    const jobId = requireId(id, 'job id')
    if (!raw || typeof raw !== 'object') throw new Error('Invalid review.')
    const r = raw as Record<string, unknown>
    return approveMemoryProposal(jobId, {
      meetingId: requireId(r.meetingId, 'meeting id'),
      generation: requireText(r.generation, 'generation', 100),
      revision: revision(r.revision),
      text: memoryText(r.text),
    })
  })
  ipcMain.handle(IPC.MemoryDismiss, (_e, id: unknown, meeting: unknown, gen: unknown) =>
    dismissMemoryProposal(
      requireId(id, 'job id'),
      requireId(meeting, 'meeting id'),
      requireText(gen, 'generation', 100),
    ),
  )
  ipcMain.handle(IPC.MemoryRetry, (_e, id: unknown, meeting: unknown) =>
    retryMemoryProposal(requireId(id, 'job id'), requireId(meeting, 'meeting id')),
  )
}
