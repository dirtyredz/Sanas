import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  save: vi.fn(),
  approve: vi.fn(),
  dismiss: vi.fn(),
  generate: vi.fn(async () => {}),
  source: { jobId: 2, fingerprint: 'fp' },
}))
vi.mock('../../../db/repos/job/memory/approved', async (original) => ({
  ...(await original<typeof import('../../../db/repos/job/memory/approved')>()),
  saveMemory: f.save,
  getApprovedMemory: () => ({ text: '', revision: 0, updatedAt: null }),
  ordinaryJob: () => true,
}))
vi.mock('../../../db/repos/job/memory/proposals', () => ({
  markApprovedIf: f.approve,
  dismissProposal: f.dismiss,
  openProposals: () => [],
}))
vi.mock('./source', () => ({ memorySource: () => f.source, proposalIsCurrent: () => true }))
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
it('validates edited approval text, then approves against the source fingerprint', () => {
  const review = { meetingId: 4, generation: 'g', revision: 0, text: 'owner edit' }
  expect(() => approveMemoryProposal(2, { ...review, text: 'x'.repeat(3001) })).toThrow()
  approveMemoryProposal(2, review)
  expect(f.approve).toHaveBeenCalledWith(2, review, 'fp')
})
it('approves with no fingerprint when the source belongs to another job', () => {
  const review = { meetingId: 4, generation: 'g', revision: 0, text: 'owner edit' }
  approveMemoryProposal(3, review)
  expect(f.approve).toHaveBeenCalledWith(3, review, null)
})
it('rejects retry for a source belonging to a different job', () => {
  expect(() => retryMemoryProposal(3, 4)).toThrow('Source is no longer available')
  retryMemoryProposal(2, 4)
  expect(f.generate).toHaveBeenCalledWith(4, true)
})
