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
import { listMeetings, getMeeting, renameMeeting, moveMeetingToJob } from '../db/repos/meetings'
import { removeMeeting } from '../services/meetings/remove'
import { previewRetention, runRetention } from '../services/retention'
import { listSegments, searchSegments } from '../db/repos/segments'
import { ftsAllOf } from '../db/fts-query'
import { askHistory } from '../services/history'
import { exportMeetingMarkdown } from '../services/meetings/export'
import { summarizeStoredMeeting } from '../services/meetings/summarize'
import { emailMeetingSummary } from '../services/meetings/summary-email'
import { listSuggestions } from '../db/repos/suggestions'
import { listSpeakerNames, setSpeakerName, mergeSpeakers } from '../db/repos/speakers'

// Thin handlers only — validate and delegate (see STRUCTURE.md).

/** Ingress check for free text: a non-empty string, capped so a stray payload cannot be huge. */
function requireText(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) {
    throw new Error(`Invalid ${what}`)
  }
  return v.trim()
}

/** Ingress check for row ids: preload's TypeScript types do not survive the IPC hop. */
function requireId(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) {
    throw new Error(`Invalid ${what}: ${String(v)}`)
  }
  return v
}

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
  ipcMain.handle(IPC.JobsArchive, (_e, id: unknown, archived: boolean) =>
    setJobArchived(requireId(id, 'job id'), archived),
  )
  ipcMain.handle(IPC.GlossaryList, (_e, jobId: unknown) => listGlossary(requireId(jobId, 'job id')))
  ipcMain.handle(IPC.GlossaryAdd, (_e, jobId: unknown, term: string, note: string) =>
    addGlossaryTerm(requireId(jobId, 'job id'), term, note),
  )
  ipcMain.handle(IPC.GlossaryRemove, (_e, id: unknown) =>
    removeGlossaryTerm(requireId(id, 'glossary id')),
  )

  // meeting history
  ipcMain.handle(IPC.MeetingsList, (_e, jobId: unknown) => listMeetings(requireId(jobId, 'job id')))
  ipcMain.handle(IPC.MeetingsDelete, (_e, id: unknown) => {
    if (removeMeeting(requireId(id, 'meeting id')) === 'audio-locked') {
      throw new Error('The recording is still in use by another program — try again in a moment.')
    }
  })
  ipcMain.handle(IPC.MeetingsRename, (_e, id: unknown, title: string) =>
    renameMeeting(requireId(id, 'meeting id'), title),
  )
  ipcMain.handle(IPC.MeetingsMove, (_e, id: unknown, jobId: unknown) =>
    moveMeetingToJob(requireId(id, 'meeting id'), requireId(jobId, 'job id')),
  )
  ipcMain.handle(IPC.MeetingsExport, (_e, id: unknown) =>
    exportMeetingMarkdown(requireId(id, 'meeting id')),
  )
  ipcMain.handle(IPC.MeetingsGet, (_e, id: unknown) => getMeeting(requireId(id, 'meeting id')))
  ipcMain.handle(IPC.MeetingsSummarize, (_e, id: unknown) =>
    summarizeStoredMeeting(requireId(id, 'meeting id')),
  )
  ipcMain.handle(IPC.MeetingsEmailSummary, (_e, id: unknown) =>
    emailMeetingSummary(requireId(id, 'meeting id')),
  )
  ipcMain.handle(IPC.SegmentsList, (_e, meetingId: unknown) =>
    listSegments(requireId(meetingId, 'meeting id')),
  )
  ipcMain.handle(IPC.SuggestionsList, (_e, meetingId: unknown) =>
    listSuggestions(requireId(meetingId, 'meeting id')),
  )
  ipcMain.handle(IPC.SpeakersList, (_e, meetingId: unknown) =>
    listSpeakerNames(requireId(meetingId, 'meeting id')),
  )
  ipcMain.handle(IPC.SpeakersRename, (_e, meetingId: unknown, speaker: number, name: string) =>
    setSpeakerName(requireId(meetingId, 'meeting id'), speaker, name),
  )
  ipcMain.handle(IPC.SpeakersMerge, (_e, meetingId: unknown, from: number, to: number) =>
    mergeSpeakers(requireId(meetingId, 'meeting id'), from, to),
  )
  ipcMain.handle(IPC.SegmentsSearch, (_e, query: unknown) =>
    typeof query === 'string' && query.trim().length >= 2
      ? searchSegments(ftsAllOf(query), { limit: 50 })
      : [],
  )
  ipcMain.handle(IPC.HistoryAsk, (_e, question: unknown, jobId: unknown) =>
    askHistory(
      requireText(question, 'question', 500),
      jobId === undefined || jobId === null ? undefined : requireId(jobId, 'job id'),
    ),
  )
  ipcMain.handle(IPC.RetentionPreview, () => previewRetention())
  ipcMain.handle(IPC.RetentionRun, () => runRetention())
  ipcMain.handle(IPC.OverlayClickThrough, (_e, on: boolean) => setClickThrough(on))
}
