import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({
  source: {
    meetingId: 1,
    jobId: 2,
    title: 'Meeting',
    startedAt: '2026-11-01',
    summary: 'Summary',
    actions: 'Action',
    fingerprint: 'fp',
  },
  complete: vi.fn(),
  finish: vi.fn(),
  holds: 0,
  revision: 0,
  key: 'key',
}))
vi.mock('../../../config/settings', () => ({
  loadSettings: () => ({ anthropicApiKey: m.key, answerModel: 'answer' }),
}))
vi.mock('../../../db/repos/job/memory/approved', async (original) => ({
  ...(await original<typeof import('../../../db/repos/job/memory/approved')>()),
  getApprovedMemory: () => ({ text: 'Approved only', revision: m.revision }),
}))
vi.mock('../../../db/repos/job/memory/proposals', () => ({
  getProposal: () => undefined,
  startProposal: () => ({ meetingId: 1, generation: 'id' }),
  settleProposal: m.finish,
}))
vi.mock('./source', () => ({ memorySource: () => m.source, proposalIsCurrent: () => true }))
vi.mock('../../assistant/provider/provider', () => ({
  assistantProvider: { complete: m.complete },
}))
vi.mock('../../meetings/status/post-processing', () => ({
  whilePostProcessing: async (_id: number, f: () => Promise<void>) => {
    m.holds++
    try {
      await f()
    } finally {
      m.holds--
    }
  },
}))
import { generateMemory } from './generate'
import { memoryRewriteInput } from './prompts'
beforeEach(() => {
  m.complete.mockReset()
  m.finish.mockReset()
  m.key = 'key'
})
it('rewrites with approved-only evidence, answer model and bounded timeout', async () => {
  m.complete.mockResolvedValue('New replacement')
  await generateMemory(1)
  const r = m.complete.mock.calls[0][0]
  expect(r).toMatchObject({ model: 'answer', timeoutMs: 30000 })
  expect(r.system).toContain('COMPLETE REPLACEMENT')
  expect(r.userContent).toContain('Approved only')
  expect(m.finish).toHaveBeenCalledWith(1, 'id', 'New replacement', 'pending')
  expect(m.holds).toBe(0)
})
it('serializes per job and releases counted holds after provider failure', async () => {
  let finish!: () => void
  m.complete
    .mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          finish = () => r('first')
        }),
    )
    .mockRejectedValueOnce(new Error('provider'))
  const a = generateMemory(1),
    b = generateMemory(2)
  await Promise.resolve()
  await Promise.resolve()
  expect(m.complete).toHaveBeenCalledTimes(1)
  finish()
  await Promise.all([a, b])
  expect(m.complete).toHaveBeenCalledTimes(2)
  expect(m.holds).toBe(0)
  expect(m.finish).toHaveBeenLastCalledWith(1, 'id', '', 'failed')
})
it('exposes missing keys as failed and preserves both bounded source sections', async () => {
  m.key = ''
  await generateMemory(1)
  expect(m.complete).not.toHaveBeenCalled()
  expect(m.finish).toHaveBeenCalledWith(1, 'id', '', 'failed')
  const input = JSON.parse(
    memoryRewriteInput('', { ...m.source, summary: 's'.repeat(25000), actions: 'a'.repeat(25000) }),
  )
  expect(input.summary.length + input.actionItems.length).toBeLessThanOrEqual(24002)
  expect(input.summary).toContain('Truncated')
  expect(input.actionItems).toContain('Truncated')
})
