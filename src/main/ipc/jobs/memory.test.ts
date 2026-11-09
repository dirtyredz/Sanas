import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  save: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
  generate: vi.fn(async () => {}),
  source: { jobId: 2 },
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => f.handlers.set(name, fn),
  },
}))
vi.mock('../../db/repos/job/memory/approved', async (original) => ({
  ...(await original<typeof import('../../db/repos/job/memory/approved')>()),
  saveMemory: f.save,
}))
vi.mock('../../db/repos/job/memory/proposals', () => ({
  approveProposal: f.approve,
  dismissProposal: f.dismiss,
  memorySource: () => f.source,
}))
vi.mock('../../services/jobs/memory/review', () => ({
  reviewMemory: () => ({ approved: { text: '', revision: 0 }, proposals: [] }),
}))
vi.mock('../../services/jobs/memory/generate', () => ({ generateMemory: f.generate }))
import { IPC } from '@shared/ipc'
import { registerMemoryIpc } from './memory'
beforeEach(() => {
  f.handlers.clear()
  f.save.mockClear()
  registerMemoryIpc()
})
const call = (name: string, ...args: unknown[]) => f.handlers.get(name)!(null, ...args)
it('validates IDs, revisions and cap at the IPC boundary, including clearing', () => {
  expect(() => call(IPC.MemorySave, 2, -1, 'x')).toThrow()
  expect(() => call(IPC.MemorySave, 2, 0, 'x'.repeat(3001))).toThrow()
  expect(() => call(IPC.MemorySave, '2', 0, 'x')).toThrow()
  call(IPC.MemorySave, 2, 0, '')
  expect(f.save).toHaveBeenCalledWith(2, 0, '')
})
it('validates edited approval and rejects retry for a different job', () => {
  expect(() => call(IPC.MemoryApprove, 2, null)).toThrow()
  call(IPC.MemoryApprove, 2, { meetingId: 4, generation: 'g', revision: 0, text: 'owner edit' })
  expect(f.approve).toHaveBeenCalledWith(2, {
    meetingId: 4,
    generation: 'g',
    revision: 0,
    text: 'owner edit',
  })
  expect(() => call(IPC.MemoryRetry, 3, 4)).toThrow('Source is no longer available')
})
