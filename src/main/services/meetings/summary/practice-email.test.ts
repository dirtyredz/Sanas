import { expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ send: vi.fn(), practice: true }))
vi.mock('../../../config/settings', () => ({ loadSettings: () => ({ summaryEmailAuto: true }) }))
vi.mock('../../../db/repos/meetings', () => ({
  getMeeting: () => ({
    practice: mock.practice,
    jobId: 7,
    title: 'Practice',
    summary: 'Summary',
    startedAt: '2026-11-02',
  }),
}))
vi.mock('../../../db/repos/jobs', () => ({
  getJob: () => ({ name: 'Client', summaryEmail: 'client@example.invalid' }),
}))
vi.mock('../../platform/email', () => ({ emailProvider: { send: mock.send } }))
import { autoEmailSummary } from './summary-email'
it('does not auto-email practice even when both account and job opt in', async () => {
  await autoEmailSummary(7)
  expect(mock.send).not.toHaveBeenCalled()
  mock.practice = false
  await autoEmailSummary(7)
  expect(mock.send).toHaveBeenCalledOnce()
})
