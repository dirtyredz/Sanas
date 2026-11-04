import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { importResumeFile } from '../../services/meetings/context/resume/import-file'

export function registerResumeImportIpc(): void {
  ipcMain.handle(IPC.JobsImportResume, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent) throw new Error('Resume picker window is unavailable.')
    const result = await dialog.showOpenDialog(parent, {
      title: 'Choose a resume',
      properties: ['openFile'],
      filters: [{ name: 'Resume (PDF or DOCX)', extensions: ['pdf', 'docx'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return importResumeFile(result.filePaths[0])
  })
}
