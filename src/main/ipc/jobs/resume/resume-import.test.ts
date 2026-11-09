import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn(),
  showOpenDialog: vi.fn(),
  importResumeFile: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: { showOpenDialog: mocks.showOpenDialog },
}))
vi.mock('../../../services/meetings/context/resume/import-file', () => ({
  importResumeFile: mocks.importResumeFile,
}))
import { registerResumeImportIpc } from './resume-import'

beforeEach(() => vi.resetAllMocks())

it('uses the native picker path, never a renderer-supplied path', async () => {
  const parent = {}
  const sender = {}
  const resume = { name: 'Synthetic.pdf', text: 'Camunda' }
  mocks.fromWebContents.mockReturnValue(parent)
  mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['native/Synthetic.pdf'] })
  mocks.importResumeFile.mockResolvedValue(resume)
  registerResumeImportIpc()
  expect(mocks.handle.mock.calls[0][0]).toBe(IPC.JobsImportResume)
  const result = await mocks.handle.mock.calls[0][1]({ sender }, 'renderer-path.pdf')
  expect(mocks.fromWebContents).toHaveBeenCalledWith(sender)
  expect(mocks.showOpenDialog).toHaveBeenCalledWith(parent, {
    title: 'Choose a resume',
    properties: ['openFile'],
    filters: [{ name: 'Resume (PDF or DOCX)', extensions: ['pdf', 'docx'] }],
  })
  expect(mocks.importResumeFile).toHaveBeenCalledWith('native/Synthetic.pdf')
  expect(result).toEqual(resume)
})

it('returns null on cancellation without parsing or replacing the draft', async () => {
  mocks.fromWebContents.mockReturnValue({})
  mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
  registerResumeImportIpc()
  expect(await mocks.handle.mock.calls[0][1]({ sender: {} })).toBeNull()
  expect(mocks.importResumeFile).not.toHaveBeenCalled()
})
