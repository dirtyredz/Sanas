import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  mockSetup,
  mockState,
  startMock,
  endMock,
  skipMock,
  dismissMockShare,
  mockSpeechDone,
} from '../services/mock-interview'
import { listPracticeSessions } from '../db/repos/practice'
import { isInterviewerSender } from '../windows/interviewer-window'
import { requireBool, requireId } from './validate'
import { mockStartInput } from './mock-interview-validation'

export function registerMockInterviewIpc(): void {
  ipcMain.handle(IPC.MockSetup, () => mockSetup())
  ipcMain.handle(IPC.MockState, () => mockState())
  ipcMain.handle(IPC.MockHistory, () => listPracticeSessions())
  ipcMain.handle(IPC.MockStart, (_e, plan: unknown, job: unknown, channels: unknown) => {
    const input = mockStartInput(plan, job, channels)
    return startMock(input.plan, input.job, input.channels, _e.sender)
  })
  ipcMain.handle(IPC.MockEnd, () => endMock())
  ipcMain.handle(IPC.MockSkip, () => skipMock())
  ipcMain.handle(IPC.MockDismiss, () => dismissMockShare())
  ipcMain.handle(IPC.MockSpeechDone, (e, id: unknown, ok: unknown) => {
    if (!isInterviewerSender(e.sender.id))
      throw new Error('Only the interviewer can acknowledge speech')
    mockSpeechDone(requireId(id, 'speech id'), requireBool(ok, 'speech result'))
  })
}
