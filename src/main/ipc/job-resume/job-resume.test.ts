import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  getJobResume: vi.fn(),
  setJobResume: vi.fn((_id: number, resume: unknown) => resume),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}))
vi.mock('../../db/repos/job/job-resume', () => ({
  getJobResume: mocks.getJobResume,
  setJobResume: mocks.setJobResume,
}))
import { registerJobResumeIpc } from './job-resume'

function handler(channel: string): (...args: unknown[]) => unknown {
  const call = mocks.handle.mock.calls.find(([name]) => name === channel)
  if (!call) throw new Error(`${channel} not registered`)
  return (...args) => call[1]({}, ...args)
}
beforeEach(() => {
  mocks.handle.mockReset()
  mocks.setJobResume.mockClear()
  registerJobResumeIpc()
})

it('registers get, set and the draft-only import on the jobs channels', () => {
  expect(mocks.handle.mock.calls.map(([name]) => name).sort()).toEqual(
    [IPC.JobsGetResume, IPC.JobsImportResume, IPC.JobsSetResume].sort(),
  )
})

it('validates ids and payloads before touching storage', () => {
  const set = handler(IPC.JobsSetResume)
  for (const id of [0, -1, '4', 1.5, null]) {
    expect(() => handler(IPC.JobsGetResume)(id)).toThrow('Invalid job id')
    expect(() => set(id, null)).toThrow('Invalid job id')
  }
  expect(() => set(4, 'text')).toThrow('Invalid meeting resume')
  expect(() => set(4, { name: '', text: 'Java' })).toThrow('1–255')
  expect(() => set(4, { name: 'CV', text: ' \n ' })).toThrow('No text found')
  expect(() => set(4, { name: 'CV', text: 'x'.repeat(40_001) })).toThrow('40,000')
  expect(mocks.setJobResume).not.toHaveBeenCalled()
})

it('normalizes what it stores and treats null as removal', () => {
  const set = handler(IPC.JobsSetResume)
  expect(set(4, { name: ' CV ', text: ' Java\0 ' })).toEqual({ name: 'CV', text: 'Java' })
  expect(mocks.setJobResume).toHaveBeenLastCalledWith(4, { name: 'CV', text: 'Java' })
  expect(set(4, null)).toBeNull()
  expect(mocks.setJobResume).toHaveBeenLastCalledWith(4, null)
  handler(IPC.JobsGetResume)(4)
  expect(mocks.getJobResume).toHaveBeenCalledWith(4)
})
