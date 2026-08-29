import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { Settings } from '@shared/types'
import { loadSettings, saveSettings, toView } from '../config/settings'
import { applyOverlayOpacity, setClickThrough, toggleOverlay } from '../windows/overlay-window'
import {
  startMeeting,
  stopMeeting,
  sendAudioChunk,
  pinSpeaker,
  runSuggestion,
} from '../services/meetings'
import type { Job } from '@shared/types'
import {
  listJobs,
  createJob,
  updateJob,
  setJobArchived,
  listGlossary,
  addGlossaryTerm,
  removeGlossaryTerm,
} from '../db/repos/jobs'
import { listMeetings, deleteMeeting, renameMeeting } from '../db/repos/meetings'
import { listSegments, searchSegments } from '../db/repos/segments'
import { exportMeetingMarkdown } from '../services/meetings/export'
import { listSuggestions } from '../db/repos/suggestions'
import { listSpeakerNames, setSpeakerName, mergeSpeakers } from '../db/repos/speakers'

// Thin handlers only — validate and delegate (see STRUCTURE.md).

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.SettingsGet, () => toView(loadSettings()))

  ipcMain.handle(IPC.SettingsSet, (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    if (patch.overlayOpacity !== undefined) applyOverlayOpacity(next.overlayOpacity)
    return toView(next)
  })

  ipcMain.handle(IPC.OverlayToggle, () => toggleOverlay())

  ipcMain.handle(IPC.MeetingStart, (_e, jobId?: number, channels?: number) =>
    // validate at ingress: only 1 or 2 are meaningful capture topologies
    startMeeting(jobId, channels === 2 ? 2 : 1),
  )
  ipcMain.handle(IPC.MeetingStop, () => stopMeeting())
  ipcMain.handle(IPC.MeetingPinSpeaker, (_e, speaker: number, isUser: boolean) =>
    pinSpeaker(speaker, isUser),
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
    setJobArchived(id, archived),
  )
  ipcMain.handle(IPC.GlossaryList, (_e, jobId: number) => listGlossary(jobId))
  ipcMain.handle(IPC.GlossaryAdd, (_e, jobId: number, term: string, note: string) =>
    addGlossaryTerm(jobId, term, note),
  )
  ipcMain.handle(IPC.GlossaryRemove, (_e, id: number) => removeGlossaryTerm(id))

  // meeting history
  ipcMain.handle(IPC.MeetingsList, (_e, jobId: number) => listMeetings(jobId))
  ipcMain.handle(IPC.MeetingsDelete, (_e, id: number) => deleteMeeting(id))
  ipcMain.handle(IPC.MeetingsRename, (_e, id: number, title: string) => renameMeeting(id, title))
  ipcMain.handle(IPC.MeetingsExport, (_e, id: number) => exportMeetingMarkdown(id))
  ipcMain.handle(IPC.SegmentsList, (_e, meetingId: number) => listSegments(meetingId))
  ipcMain.handle(IPC.SuggestionsList, (_e, meetingId: number) => listSuggestions(meetingId))
  ipcMain.handle(IPC.SpeakersList, (_e, meetingId: number) => listSpeakerNames(meetingId))
  ipcMain.handle(IPC.SpeakersRename, (_e, meetingId: number, speaker: number, name: string) =>
    setSpeakerName(meetingId, speaker, name),
  )
  ipcMain.handle(IPC.SpeakersMerge, (_e, meetingId: number, from: number, to: number) =>
    mergeSpeakers(meetingId, from, to),
  )
  ipcMain.handle(IPC.SegmentsSearch, (_e, query: string) =>
    query.trim().length >= 2 ? searchSegments(query.trim()) : [],
  )
  ipcMain.handle(IPC.OverlayClickThrough, (_e, on: boolean) => setClickThrough(on))
}
