import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { hotkeyStatus } from '../services/platform/hotkeys/registration'

/** Global-shortcut registration status for Settings → Hotkeys. */
export function registerHotkeysIpc(): void {
  ipcMain.handle(IPC.HotkeysStatus, () => hotkeyStatus())
}
