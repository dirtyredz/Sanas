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
vi.mock('../../../db/repos/job/memory/approved', () => ({
  getApprovedMemory: () => ({ text: 'Approved only', revision: m.revision }),
}))
vi.mock('../../../db/repos/job/memory/proposals', () => ({
  memorySource: () => m.source,
  beginProposal: () => ({ generation: 'id' }),
  finishProposal: m.finish,
}))
vi.mock('../../assistant/provider', () => ({ assistantProvider: { complete: m.complete } }))
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
  expect(m.finish).toHaveBeenCalledWith({ generation: 'id' }, 'New replacement')
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
  expect(m.finish).toHaveBeenLastCalledWith({ generation: 'id' }, null)
})
it('exposes missing keys as failed and preserves both bounded source sections', async () => {
  m.key = ''
  await generateMemory(1)
  expect(m.complete).not.toHaveBeenCalled()
  expect(m.finish).toHaveBeenCalledWith({ generation: 'id' }, null)
  const input = JSON.parse(
    memoryRewriteInput('', { ...m.source, summary: 's'.repeat(25000), actions: 'a'.repeat(25000) }),
  )
  expect(input.summary.length + input.actionItems.length).toBeLessThanOrEqual(24002)
  expect(input.summary).toContain('Truncated')
  expect(input.actionItems).toContain('Truncated')
})
