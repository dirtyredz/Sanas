import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/types'
import { loadSettings, saveSettings, toView } from '../config/settings'
import { applyOverlayOpacity, setClickThrough, toggleOverlay } from '../windows/overlay-window'
import { getDb } from '../db'
import {
  startMeeting,
  stopMeeting,
  sendAudioChunk,
  pinSpeaker,
  runSuggestion
} from '../services/meetings'
import type { Job } from '@shared/types'
import {
  listJobs,
  createJob,
  updateJob,
  setJobArchived,
  listGlossary,
  addGlossaryTerm,
  removeGlossaryTerm
} from '../db/repos/jobs'
import {
  listMeetings,
  listSegments,
  deleteMeeting,
  renameMeeting,
  searchSegments
} from '../db/repos/meetings'
import { exportMeetingMarkdown } from '../services/meetings/export'
import { listSuggestions } from '../db/repos/suggestions'

// Thin handlers only — validate and delegate (see STRUCTURE.md).

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SettingsGet, () => toView(loadSettings()))

  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    if (patch.overlayOpacity !== undefined) applyOverlayOpacity(next.overlayOpacity)
    return toView(next)
  })

  ipcMain.handle(IPC.OverlayToggle, () => toggleOverlay())

  ipcMain.handle(IPC.MeetingStart, (_e, jobId?: number) => startMeeting(jobId))
  ipcMain.handle(IPC.MeetingStop, () => stopMeeting())
  ipcMain.handle(IPC.MeetingPinSpeaker, (_e, speaker: number, isUser: boolean) =>
    pinSpeaker(speaker, isUser)
  )
  ipcMain.handle(IPC.AssistNow, () => runSuggestion('hotkey'))

  // fire-and-forget audio stream — .on, not .handle (no reply per chunk)
  ipcMain.on(IPC.AudioChunk, (_e, chunk: ArrayBuffer) => {
    sendAudioChunk(Buffer.from(chunk))
  })

  // jobs + context packs
  ipcMain.handle(IPC.JobsList, () => listJobs())
  ipcMain.handle(IPC.JobsCreate, (_e, name: string) => createJob(name))
  ipcMain.handle(IPC.JobsUpdate, (_e, job: Omit<Job, 'createdAt' | 'archived'>) => updateJob(job))
  ipcMain.handle(IPC.JobsArchive, (_e, id: number, archived: boolean) =>
    setJobArchived(id, archived)
  )
  ipcMain.handle(IPC.GlossaryList, (_e, jobId: number) => listGlossary(jobId))
  ipcMain.handle(IPC.GlossaryAdd, (_e, jobId: number, term: string, note: string) =>
    addGlossaryTerm(jobId, term, note)
  )
  ipcMain.handle(IPC.GlossaryRemove, (_e, id: number) => removeGlossaryTerm(id))

  // meeting history
  ipcMain.handle(IPC.MeetingsList, (_e, jobId: number) => listMeetings(jobId))
  ipcMain.handle(IPC.MeetingsDelete, (_e, id: number) => deleteMeeting(id))
  ipcMain.handle(IPC.MeetingsRename, (_e, id: number, title: string) => renameMeeting(id, title))
  ipcMain.handle(IPC.MeetingsExport, (_e, id: number) => exportMeetingMarkdown(id))
  ipcMain.handle(IPC.SegmentsList, (_e, meetingId: number) => listSegments(meetingId))
  ipcMain.handle(IPC.SuggestionsList, (_e, meetingId: number) => listSuggestions(meetingId))
  ipcMain.handle(IPC.SegmentsSearch, (_e, query: string) =>
    query.trim().length >= 2 ? searchSegments(query.trim()) : []
  )
  ipcMain.handle(IPC.OverlayClickThrough, (_e, on: boolean) => setClickThrough(on))

  // Phase 0 smoke-test: proves SQLite is open and migrated.
  ipcMain.handle(IPC.DbPing, () => {
    const row = getDb().prepare('SELECT COUNT(*) AS jobs FROM jobs').get() as { jobs: number }
    return { ok: true, jobs: row.jobs }
  })
}
