import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  save: vi.fn(() => ({})),
  approve: vi.fn(() => ({})),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => f.handlers.set(name, fn),
  },
}))
vi.mock('../../services/jobs/memory/review', () => ({
  reviewMemory: () => ({}),
  saveApprovedMemory: f.save,
  approveMemoryProposal: f.approve,
  dismissMemoryProposal: () => ({}),
  retryMemoryProposal: () => ({}),
}))
import { IPC } from '@shared/ipc'
import { registerMemoryIpc } from './memory'
beforeEach(() => {
  f.handlers.clear()
  f.save.mockClear()
  registerMemoryIpc()
})
const call = (name: string, ...args: unknown[]) => f.handlers.get(name)!(null, ...args)
it('validates IDs, revisions and types at the IPC boundary, including clearing', () => {
  expect(() => call(IPC.MemorySave, 2, -1, 'x')).toThrow()
  expect(() => call(IPC.MemorySave, 2, 0, 5)).toThrow()
  expect(() => call(IPC.MemorySave, '2', 0, 'x')).toThrow()
  call(IPC.MemorySave, 2, 0, '')
  expect(f.save).toHaveBeenCalledWith(2, 0, '')
})
it('validates the edited approval shape and forwards it', () => {
  expect(() => call(IPC.MemoryApprove, 2, null)).toThrow()
  call(IPC.MemoryApprove, 2, { meetingId: 4, generation: 'g', revision: 0, text: 'owner edit' })
  expect(f.approve).toHaveBeenCalledWith(2, {
    meetingId: 4,
    generation: 'g',
    revision: 0,
    text: 'owner edit',
  })
})
