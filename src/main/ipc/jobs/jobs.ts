import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  GLOSSARY_NOTE_MAX_CHARS,
  GLOSSARY_TERM_MAX_CHARS,
  JOB_NAME_MAX_CHARS,
} from '@shared/jobs/limits'
import { createJob, listJobs, setJobArchived, updateJob } from '../../db/repos/job/jobs'
import { addGlossaryTerm, listGlossary, removeGlossaryTerm } from '../../db/repos/job/glossary'
import { optionalText, requireBool, requireId, requireJob, requireText } from '../validate'
import { requireListOptions } from './validate'

/** Jobs (context packs) and their glossaries: validate and delegate. */
export function registerJobsIpc(): void {
  ipcMain.handle(IPC.JobsList, (_e, options: unknown) =>
    listJobs(requireListOptions(options).includeArchived),
  )
  ipcMain.handle(IPC.JobsCreate, (_e, name: unknown) =>
    createJob(requireText(name, 'job name', JOB_NAME_MAX_CHARS)),
  )
  ipcMain.handle(IPC.JobsUpdate, (_e, job: unknown) => updateJob(requireJob(job)))
  ipcMain.handle(IPC.JobsArchive, (_e, id: unknown, archived: unknown) =>
    setJobArchived(requireId(id, 'job id'), requireBool(archived, 'archived')),
  )
  ipcMain.handle(IPC.GlossaryList, (_e, jobId: unknown) => listGlossary(requireId(jobId, 'job id')))
  ipcMain.handle(IPC.GlossaryAdd, (_e, jobId: unknown, term: unknown, note: unknown) =>
    addGlossaryTerm(
      requireId(jobId, 'job id'),
      requireText(term, 'term', GLOSSARY_TERM_MAX_CHARS),
      optionalText(note, GLOSSARY_NOTE_MAX_CHARS),
    ),
  )
  ipcMain.handle(IPC.GlossaryRemove, (_e, id: unknown) =>
    removeGlossaryTerm(requireId(id, 'glossary id')),
  )
}
