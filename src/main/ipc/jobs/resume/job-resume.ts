import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getJobResume, setJobResume } from '../../../db/repos/job/job-resume'
import { validateResume } from '../../../services/jobs/resume/resume'
import { requireId } from '../../validate'
import { registerResumeImportIpc } from './resume-import'

/** A job's saved resume: read, replace or (null) remove, plus the draft-only file import.
 *  Start snapshots the saved resume onto new meetings; the full text never rides on
 *  jobs.list() or meeting/status broadcasts. */
export function registerJobResumeIpc(): void {
  registerResumeImportIpc()
  ipcMain.handle(IPC.JobsGetResume, (_e, jobId: unknown) =>
    getJobResume(requireId(jobId, 'job id')),
  )
  ipcMain.handle(IPC.JobsSetResume, (_e, jobId: unknown, resume: unknown) =>
    setJobResume(requireId(jobId, 'job id'), validateResume(resume)),
  )
}
