import { expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ windows: [] as any[] }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => mock.windows } }))
import { broadcast, restrictWindowBroadcast } from './broadcast'
import { IPC } from '@shared/ipc'
it('does not send Sanas suggestions or transcripts to the output-only interviewer', () => {
  const make = (id: number): any => ({
    webContents: { id, send: vi.fn() },
    isDestroyed: () => false,
    on: vi.fn(),
  })
  const main = make(1),
    interviewer = make(2)
  mock.windows = [main, interviewer]
  restrictWindowBroadcast(interviewer, [IPC.MockChanged])
  broadcast(IPC.SuggestionEvent, { text: 'private answer' })
  broadcast(IPC.TranscriptEvent, { text: 'private final' })
  expect(main.webContents.send).toHaveBeenCalledTimes(2)
  expect(interviewer.webContents.send).not.toHaveBeenCalled()
  broadcast(IPC.MockChanged, { caption: 'Question' })
  expect(interviewer.webContents.send).toHaveBeenCalledOnce()
  interviewer.on.mock.calls[0][1]()
  mock.windows = []
})
