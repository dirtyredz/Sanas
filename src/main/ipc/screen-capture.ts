import { ipcMain, type WebContents } from 'electron'
import { IPC } from '@shared/ipc'
import {
  attachScreen,
  captureScreen,
  captureStatus,
  discardScreen,
  screenRendererGone,
} from '../services/meetings'
import { requireId } from './validate'
import { requireCaptureToken } from './screen-capture-validation'

// Capture screen / Attach screen. Handlers validate and delegate; desktop capture, image bytes
// and the provider call stay in main.

/** Renderers that hold (or held) a composer draft: their destruction drops every draft. */
const draftHolders = new WeakSet<WebContents>()

export function registerScreenCaptureIpc(): void {
  ipcMain.handle(IPC.ScreenCapture, (_e, meetingId: unknown) =>
    captureScreen(requireId(meetingId, 'meetingId')),
  )
  ipcMain.handle(IPC.ScreenCaptureAttach, (e, meetingId: unknown) => {
    const id = requireId(meetingId, 'meetingId')
    if (!draftHolders.has(e.sender)) {
      draftHolders.add(e.sender)
      e.sender.once('destroyed', screenRendererGone)
    }
    return attachScreen(id)
  })
  ipcMain.handle(IPC.ScreenCaptureDiscard, (_e, meetingId: unknown, token: unknown) =>
    discardScreen(requireId(meetingId, 'meetingId'), requireCaptureToken(token)),
  )
  ipcMain.handle(IPC.ScreenCaptureStatusGet, () => captureStatus())
}
