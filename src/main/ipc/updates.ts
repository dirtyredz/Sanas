import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { getUpdateState, checkForUpdates, restartToUpdate } from '../services/updates/service'

export function registerUpdatesIpc(): void {
  ipcMain.handle(IPC.UpdatesGet, () => getUpdateState())
  ipcMain.handle(IPC.UpdatesCheck, () => checkForUpdates())
  ipcMain.handle(IPC.UpdatesRestart, () => restartToUpdate())
}
