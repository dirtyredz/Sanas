import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getPresentationHistory } from '../../db/repos/meeting/meeting-presentation'
import { requireId } from '../validate'

/** Read-only slide markers of meetings recorded before presentation mode was retired. */
export function registerPresentationHistoryIpc(): void {
  ipcMain.handle(IPC.PresentationHistory, (_e, id: unknown) =>
    getPresentationHistory(requireId(id, 'id')),
  )
}
