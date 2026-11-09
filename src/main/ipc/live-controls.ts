import { BrowserWindow, ipcMain } from 'electron'
import { observeRun } from '../services/meetings/observation/run-observation'
import { IPC } from '@shared/ipc'
import { getMeetingContext } from '../db/repos/meeting/meeting-context'
import {
  updateMeetingContext,
  requestAssist,
  answerEveryQuestionState,
  setAnswerEveryQuestion,
} from '../services/meetings'
import { requireId } from './validate'
import {
  requireContextUpdate,
  requireManualRequest,
  requireSuggestionVisibility,
} from './live-controls-validation'

export function registerLiveControlsIpc(): void {
  ipcMain.handle(IPC.SuggestionVisibility, (event, raw: unknown) => {
    const value = requireSuggestionVisibility(raw)
    const window = BrowserWindow.fromWebContents(event.sender)
    const state = !window || !window.isVisible() || window.isMinimized() ? 'hidden' : value.state
    observeRun({
      kind: 'renderer',
      id: value.runId,
      meetingId: value.meetingId,
      state,
      at: performance.now(),
    })
  })
  ipcMain.handle(IPC.MeetingContextGet, (_e, id: unknown) =>
    getMeetingContext(requireId(id, 'meetingId')),
  )
  ipcMain.handle(IPC.MeetingContextUpdate, (_e, raw: unknown) =>
    updateMeetingContext(requireContextUpdate(raw)),
  )
  ipcMain.handle(IPC.AssistRequest, (_e, raw: unknown) => requestAssist(requireManualRequest(raw)))
  ipcMain.handle(IPC.AnswerEveryQuestionGet, () => answerEveryQuestionState())
  ipcMain.handle(IPC.AnswerEveryQuestionSet, (_e, id: unknown, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Expected a boolean.')
    return setAnswerEveryQuestion(requireId(id, 'meetingId'), enabled)
  })
}
