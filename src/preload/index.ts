import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  GlossaryTerm,
  Job,
  Meeting,
  MeetingState,
  RetentionPreview,
  Segment,
  Settings,
  SettingsView,
  Suggestion,
  SuggestionEvent,
  TranscriptEvent,
} from '../shared/types'

// The whole renderer-facing API surface. Keep it explicit — no generic invoke passthrough.
const api = {
  settings: {
    get: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch: Partial<Settings>): Promise<SettingsView> =>
      ipcRenderer.invoke(IPC.SettingsSet, patch),
  },
  overlay: {
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC.OverlayToggle),
    setClickThrough: (on: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.OverlayClickThrough, on),
    onGhostState: (cb: (on: boolean) => void): (() => void) => {
      const listener = (_e: unknown, on: boolean): void => cb(on)
      ipcRenderer.on(IPC.OverlayGhostState, listener)
      return () => ipcRenderer.removeListener(IPC.OverlayGhostState, listener)
    },
  },
  meeting: {
    start: (jobId?: number, channels?: number): Promise<MeetingState> =>
      ipcRenderer.invoke(IPC.MeetingStart, jobId, channels),
    stop: (): Promise<MeetingState> => ipcRenderer.invoke(IPC.MeetingStop),
    pinSpeaker: (speaker: number, isUser: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.MeetingPinSpeaker, speaker, isUser),
    sendAudio: (chunk: ArrayBuffer): void => ipcRenderer.send(IPC.AudioChunk, chunk),
    onTranscript: (cb: (ev: TranscriptEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: TranscriptEvent): void => cb(ev)
      ipcRenderer.on(IPC.TranscriptEvent, listener)
      return () => ipcRenderer.removeListener(IPC.TranscriptEvent, listener)
    },
    onState: (cb: (s: MeetingState) => void): (() => void) => {
      const listener = (_e: unknown, s: MeetingState): void => cb(s)
      ipcRenderer.on(IPC.MeetingState, listener)
      return () => ipcRenderer.removeListener(IPC.MeetingState, listener)
    },
  },
  assist: {
    now: (): Promise<void> => ipcRenderer.invoke(IPC.AssistNow),
    onSuggestion: (cb: (ev: SuggestionEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: SuggestionEvent): void => cb(ev)
      ipcRenderer.on(IPC.SuggestionEvent, listener)
      return () => ipcRenderer.removeListener(IPC.SuggestionEvent, listener)
    },
  },
  retention: {
    /** What a clean-up would remove right now, under the saved limits. */
    preview: (): Promise<RetentionPreview> => ipcRenderer.invoke(IPC.RetentionPreview),
    /** Runs the clean-up now; resolves with what was removed. */
    run: (): Promise<RetentionPreview> => ipcRenderer.invoke(IPC.RetentionRun),
  },
  jobs: {
    list: (): Promise<Job[]> => ipcRenderer.invoke(IPC.JobsList),
    create: (name: string): Promise<Job> => ipcRenderer.invoke(IPC.JobsCreate, name),
    update: (job: Omit<Job, 'createdAt' | 'archived'>): Promise<Job> =>
      ipcRenderer.invoke(IPC.JobsUpdate, job),
    archive: (id: number, archived: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.JobsArchive, id, archived),
  },
  glossary: {
    list: (jobId: number): Promise<GlossaryTerm[]> => ipcRenderer.invoke(IPC.GlossaryList, jobId),
    add: (jobId: number, term: string, note: string): Promise<GlossaryTerm> =>
      ipcRenderer.invoke(IPC.GlossaryAdd, jobId, term, note),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.GlossaryRemove, id),
  },
  meetings: {
    list: (jobId: number): Promise<Meeting[]> => ipcRenderer.invoke(IPC.MeetingsList, jobId),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.MeetingsDelete, id),
    segments: (meetingId: number): Promise<Segment[]> =>
      ipcRenderer.invoke(IPC.SegmentsList, meetingId),
    suggestions: (meetingId: number): Promise<Suggestion[]> =>
      ipcRenderer.invoke(IPC.SuggestionsList, meetingId),
    rename: (meetingId: number, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MeetingsRename, meetingId, title),
    move: (meetingId: number, jobId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.MeetingsMove, meetingId, jobId),
    export: (meetingId: number): Promise<string | null> =>
      ipcRenderer.invoke(IPC.MeetingsExport, meetingId),
    get: (meetingId: number): Promise<Meeting | null> =>
      ipcRenderer.invoke(IPC.MeetingsGet, meetingId),
    /** Rejects with a readable message when the summary can't run. */
    summarize: (meetingId: number): Promise<Meeting> =>
      ipcRenderer.invoke(IPC.MeetingsSummarize, meetingId),
    /** Resolves with the recipient; rejects with a readable message on failure. */
    emailSummary: (meetingId: number): Promise<string> =>
      ipcRenderer.invoke(IPC.MeetingsEmailSummary, meetingId),
    search: (
      query: string,
    ): Promise<{ meeting: Meeting; jobName: string; tStartMs: number; snippet: string }[]> =>
      ipcRenderer.invoke(IPC.SegmentsSearch, query),
    speakerNames: (meetingId: number): Promise<{ speaker: number; name: string }[]> =>
      ipcRenderer.invoke(IPC.SpeakersList, meetingId),
    renameSpeaker: (meetingId: number, speaker: number, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SpeakersRename, meetingId, speaker, name),
    mergeSpeakers: (meetingId: number, from: number, to: number): Promise<void> =>
      ipcRenderer.invoke(IPC.SpeakersMerge, meetingId, from, to),
    onUpdated: (cb: (meetingId: number) => void): (() => void) => {
      const listener = (_e: unknown, meetingId: number): void => cb(meetingId)
      ipcRenderer.on(IPC.MeetingUpdated, listener)
      return () => ipcRenderer.removeListener(IPC.MeetingUpdated, listener)
    },
  },
}

export type SanasApi = typeof api

contextBridge.exposeInMainWorld('sanas', api)
