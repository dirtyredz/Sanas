import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  save: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
  generate: vi.fn(async () => {}),
  source: { jobId: 2 },
}))
vi.mock('../../../db/repos/job/memory/approved', async (original) => ({
  ...(await original<typeof import('../../../db/repos/job/memory/approved')>()),
  saveMemory: f.save,
}))
vi.mock('../../../db/repos/job/memory/proposals', () => ({
  approveProposal: f.approve,
  dismissProposal: f.dismiss,
  memorySource: () => f.source,
  memoryView: () => ({ approved: { text: '', revision: 0 }, proposals: [] }),
}))
vi.mock('./generate', () => ({ generateMemory: f.generate, generatingMemory: () => false }))
import { approveMemoryProposal, retryMemoryProposal, saveApprovedMemory } from './review'
beforeEach(() => {
  f.save.mockClear()
  f.approve.mockClear()
})
it('enforces the memory cap on save, allowing clearing', () => {
  expect(() => saveApprovedMemory(2, 0, 'x'.repeat(3001))).toThrow()
  expect(f.save).not.toHaveBeenCalled()
  saveApprovedMemory(2, 0, '')
  expect(f.save).toHaveBeenCalledWith(2, 0, '')
})
it('validates edited approval text before approving', () => {
  const review = { meetingId: 4, generation: 'g', revision: 0, text: 'owner edit' }
  expect(() => approveMemoryProposal(2, { ...review, text: 'x'.repeat(3001) })).toThrow()
  approveMemoryProposal(2, review)
  expect(f.approve).toHaveBeenCalledWith(2, review)
})
it('rejects retry for a source belonging to a different job', () => {
  expect(() => retryMemoryProposal(3, 4)).toThrow('Source is no longer available')
  retryMemoryProposal(2, 4)
  expect(f.generate).toHaveBeenCalledWith(4, true)
})
