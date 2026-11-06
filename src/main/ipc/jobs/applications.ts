import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  applyApplication,
  listApplications,
  previewApplication,
} from '../../services/jobs/applications/application-import'
import { requireApplicationId, requireApplyRequest, requireLibrarySender } from './validate'

/** New job from application / refresh review: library window only; the renderer never sends
 *  a pack, a path or command arguments. */
export function registerJobApplicationsIpc(): void {
  ipcMain.handle(IPC.JobApplicationsList, (e) => {
    requireLibrarySender(e)
    return listApplications()
  })
  ipcMain.handle(IPC.JobApplicationsPreview, (e, applicationId: unknown) =>
    previewApplication(requireLibrarySender(e), requireApplicationId(applicationId)),
  )
  ipcMain.handle(IPC.JobApplicationsApply, (e, request: unknown) =>
    applyApplication(requireLibrarySender(e), requireApplyRequest(request)),
  )
}
