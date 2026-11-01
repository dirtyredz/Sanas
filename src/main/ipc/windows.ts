import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { showMainWindow } from '../windows/main-window'
import {
  activateComposer,
  composerReady,
  releaseOverlayFocus,
  resizeOverlay,
  setClickThrough,
  toggleOverlay,
} from '../windows/overlay-window'
import { requireBool, requireOverlayResize } from './validate'

/** Window handlers: overlay show/resize/ghost, the composer focus handshake, and the
 *  overlay's Open Sanas. Validate and delegate only. */
export function registerWindowsIpc(): void {
  ipcMain.handle(IPC.OverlayToggle, () => toggleOverlay())
  ipcMain.handle(IPC.OverlayResize, (_e, request: unknown) =>
    resizeOverlay(requireOverlayResize(request)),
  )
  ipcMain.handle(IPC.OverlayClickThrough, (_e, on: unknown) =>
    setClickThrough(requireBool(on, 'flag')),
  )
  ipcMain.handle(IPC.ComposeActivate, () => activateComposer())
  ipcMain.handle(IPC.ComposeReady, () => composerReady())
  ipcMain.handle(IPC.ComposeRelease, () => releaseOverlayFocus())
  // parameterless: the renderer cannot choose a page or pass anything through
  ipcMain.handle(IPC.MainWindowShow, () => showMainWindow())
}
