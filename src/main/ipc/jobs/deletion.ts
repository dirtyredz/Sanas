import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { deleteJob, previewJobDeletion } from '../../services/jobs/deletion'
import { requireId } from '../validate'
import { requireLibrarySender, requireToken } from './validate'

/** Counted job deletion: library window only; deletion needs the preview's token. */
export function registerJobDeletionIpc(): void {
  ipcMain.handle(IPC.JobsDeletePreview, (e, jobId: unknown) =>
    previewJobDeletion(requireId(jobId, 'job id'), requireLibrarySender(e)),
  )
  ipcMain.handle(IPC.JobsDelete, (e, token: unknown) =>
    deleteJob(requireToken(token), requireLibrarySender(e)),
  )
}
