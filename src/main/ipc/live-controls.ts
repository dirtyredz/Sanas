import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getMeetingContext } from '../db/repos/meeting-context'
import {
  updateMeetingContext,
  requestAssist,
  answerEveryQuestionState,
  setAnswerEveryQuestion,
} from '../services/meetings'
import { requireId } from './validate'
import { requireContextUpdate, requireManualRequest } from './live-controls-validation'

export function registerLiveControlsIpc(): void {
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
