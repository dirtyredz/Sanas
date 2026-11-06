import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  list: vi.fn(async () => ({ packs: [] })),
  preview: vi.fn(async () => ({ token: 't' })),
  apply: vi.fn(async () => ({ status: 'stale', message: 'm' })),
  deletePreview: vi.fn(() => ({ token: 't' })),
  deleteJob: vi.fn(async () => ({ status: 'deleted' })),
  listJobs: vi.fn(() => []),
}))
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../../windows/main-window', () => ({ isMainWindowSender: (id: number) => id === 1 }))
vi.mock('../../services/jobs/applications/application-import', () => ({
  listApplications: mocks.list,
  previewApplication: mocks.preview,
  applyApplication: mocks.apply,
}))
vi.mock('../../services/jobs/deletion', () => ({
  previewJobDeletion: mocks.deletePreview,
  deleteJob: mocks.deleteJob,
}))
vi.mock('../../db/repos/jobs', () => ({
  listJobs: mocks.listJobs,
  createJob: vi.fn(),
  updateJob: vi.fn(),
  setJobArchived: vi.fn(),
}))
vi.mock('../../db/repos/job/glossary', () => ({
  listGlossary: vi.fn(),
  addGlossaryTerm: vi.fn(),
  removeGlossaryTerm: vi.fn(),
}))
vi.mock('../../config/settings', () => ({ loadSettings: () => ({}) }))
import { registerJobApplicationsIpc } from './applications'
import { registerJobDeletionIpc } from './deletion'
import { registerJobsIpc } from './jobs'

const token = '123e4567-e89b-42d3-a456-426614174000'
function handler(channel: string, sender = 1): (...args: unknown[]) => unknown {
  const call = mocks.handle.mock.calls.find(([name]) => name === channel)
  if (!call) throw new Error(`${channel} not registered`)
  return (...args) => call[1]({ sender: { id: sender } }, ...args)
}
beforeEach(() => {
  mocks.handle.mockReset()
  vi.clearAllMocks()
  registerJobsIpc()
  registerJobDeletionIpc()
  registerJobApplicationsIpc()
})

it('refuses privileged job operations from any window but the library', () => {
  for (const [channel, args] of [
    [IPC.JobsDeletePreview, [3]],
    [IPC.JobsDelete, [token]],
    [IPC.JobApplicationsList, []],
    [IPC.JobApplicationsPreview, ['acme-1']],
    [IPC.JobApplicationsApply, [{ token }]],
  ] as const)
    expect(() => handler(channel, 2)(...args)).toThrow('Not allowed')
  expect(mocks.deleteJob).not.toHaveBeenCalled()
  expect(mocks.apply).not.toHaveBeenCalled()
})

it('validates before delegating and passes the sender for token binding', async () => {
  expect(() => handler(IPC.JobsDeletePreview)('3')).toThrow('Invalid job id')
  expect(() => handler(IPC.JobsDelete)('../x')).toThrow('Invalid confirmation')
  expect(() => handler(IPC.JobApplicationsPreview)('..\\evil')).toThrow('Invalid application ID')
  expect(() => handler(IPC.JobApplicationsApply)({ token, pack: {} })).toThrow('Unsupported')
  handler(IPC.JobsDeletePreview)(3)
  expect(mocks.deletePreview).toHaveBeenCalledWith(3, 1)
  await handler(IPC.JobsDelete)(token)
  expect(mocks.deleteJob).toHaveBeenCalledWith(token, 1)
  await handler(IPC.JobApplicationsPreview)('acme-1')
  expect(mocks.preview).toHaveBeenCalledWith(1, 'acme-1')
  await handler(IPC.JobApplicationsApply)({ token, choices: { notes: 'keep' } })
  expect(mocks.apply).toHaveBeenCalledWith(1, { token, choices: { notes: 'keep' } })
})

it('keeps jobs.list compatible and adds a validated archived filter', () => {
  handler(IPC.JobsList)()
  expect(mocks.listJobs).toHaveBeenLastCalledWith(false)
  handler(IPC.JobsList)({ includeArchived: true })
  expect(mocks.listJobs).toHaveBeenLastCalledWith(true)
  expect(() => handler(IPC.JobsList)({ includeArchived: 1 })).toThrow()
})
