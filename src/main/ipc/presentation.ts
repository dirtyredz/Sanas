import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getJobSlides, replaceJobSlides } from '../db/repos/job-slides'
import { getPresentationHistory } from '../db/repos/meeting-presentation'
import { moveSlide, presentationState } from '../services/meetings'
import { requireId } from './validate'
import { requireSlideMove, requireSlides } from './presentation-validation'
import { hotkeyStatus } from '../services/hotkeys/registration'

export function registerPresentationIpc(): void {
  ipcMain.handle(IPC.HotkeysStatus, () => hotkeyStatus())
  ipcMain.handle(IPC.PresentationJobGet, (_e, id: unknown) => getJobSlides(requireId(id, 'id')))
  ipcMain.handle(IPC.PresentationJobReplace, (_e, id: unknown, slides: unknown) =>
    replaceJobSlides(requireId(id, 'id'), requireSlides(slides)),
  )
  ipcMain.handle(IPC.PresentationHistory, (_e, id: unknown) =>
    getPresentationHistory(requireId(id, 'id')),
  )
  ipcMain.handle(IPC.PresentationState, () => presentationState())
  ipcMain.handle(IPC.PresentationMove, (_e, raw: unknown) => {
    const { meetingId, direction } = requireSlideMove(raw)
    return moveSlide(meetingId, direction)
  })
}
