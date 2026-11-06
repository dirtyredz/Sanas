import type { MeetingResume } from '../shared/meeting-resume'
import type {
  MockPlanId,
  MockSetup,
  MockState,
  PracticeSession,
} from '../shared/mock-interview/types'
import type { UpdateState } from '../shared/updates/types'
import type {
  Admission,
  ContextUpdate,
  ManualRequest,
  MeetingContext,
} from '../shared/live-controls/types'
import type { CaptureAttachResult, CaptureStatus } from '../shared/live-controls/capture'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { PresentationHistory } from '../shared/presentation/types'
import type { MeetingStartOptions } from '../shared/meeting-start'
import type { HotkeyStatus } from '../shared/hotkeys/types'
import type {
  ApplicationListing,
  ApplicationPreview,
  ApplyRequest,
  ApplyResult,
} from '../shared/jobs/applications'
import type { JobDeletionPreview, JobDeletionResult } from '../shared/jobs/deletion'
import type {
  GlossaryTerm,
  HistoryEvent,
  HistoryHit,
  Job,
  Meeting,
  MeetingState,
  MergeResult,
  OverlayResizeRequest,
  RetentionPreview,
  RetentionResult,
  SearchMatch,
  Segment,
  Settings,
  SettingsView,
  Suggestion,
  SuggestionEvent,
  TranscriptEvent,
} from '../shared/types'

// The whole renderer-facing API surface. Keep it explicit — no generic invoke passthrough.
function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: unknown, value: T): void => cb(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const api = {
  mockInterview: {
    setup: (): Promise<MockSetup> => ipcRenderer.invoke(IPC.MockSetup),
    /** The meeting snapshots the job's saved resume; there is no per-session attachment. */
    start: (plan: MockPlanId, jobId: number, channels: number): Promise<MockState> =>
      ipcRenderer.invoke(IPC.MockStart, plan, jobId, channels),
    getState: (): Promise<MockState> => ipcRenderer.invoke(IPC.MockState),
    end: (): Promise<void> => ipcRenderer.invoke(IPC.MockEnd),
    skip: (): Promise<void> => ipcRenderer.invoke(IPC.MockSkip),
    dismiss: (): Promise<void> => ipcRenderer.invoke(IPC.MockDismiss),
    speechDone: (id: number, ok: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.MockSpeechDone, id, ok),
    history: (): Promise<PracticeSession[]> => ipcRenderer.invoke(IPC.MockHistory),
    onChanged: (cb: (state: MockState) => void): (() => void) => subscribe(IPC.MockChanged, cb),
  },
  updates: {
    get: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UpdatesGet),
    check: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UpdatesCheck),
    restart: (): Promise<UpdateState> => ipcRenderer.invoke(IPC.UpdatesRestart),
    onChanged: (cb: (state: UpdateState) => void): (() => void) =>
      subscribe(IPC.UpdatesChanged, cb),
  },
  meetingContext: {
    get: (id: number): Promise<MeetingContext> => ipcRenderer.invoke(IPC.MeetingContextGet, id),
    update: (request: ContextUpdate): Promise<MeetingContext> =>
      ipcRenderer.invoke(IPC.MeetingContextUpdate, request),
    onChanged: (cb: (context: MeetingContext) => void): (() => void) =>
      subscribe(IPC.MeetingContextChanged, cb),
  },
  screenCapture: {
    /** Capture screen: captures the display under the overlay and asks for an answer. */
    capture: (meetingId: number): Promise<Admission> =>
      ipcRenderer.invoke(IPC.ScreenCapture, meetingId),
    /** Attach screen: a main-owned draft for the composer; resolves with its thumbnail. */
    attach: (meetingId: number): Promise<CaptureAttachResult> =>
      ipcRenderer.invoke(IPC.ScreenCaptureAttach, meetingId),
    discard: (meetingId: number, token: string): Promise<void> =>
      ipcRenderer.invoke(IPC.ScreenCaptureDiscard, meetingId, token),
    getStatus: (): Promise<CaptureStatus> => ipcRenderer.invoke(IPC.ScreenCaptureStatusGet),
    onStatus: (cb: (status: CaptureStatus) => void): (() => void) =>
      subscribe(IPC.ScreenCaptureStatus, cb),
  },
  hotkeys: { getStatus: (): Promise<HotkeyStatus[]> => ipcRenderer.invoke(IPC.HotkeysStatus) },
  /** Read-only slide markers of meetings recorded before presentation mode was retired. */
  presentation: {
    getHistory: (id: number): Promise<PresentationHistory> =>
      ipcRenderer.invoke(IPC.PresentationHistory, id),
  },
  settings: {
    get: (): Promise<SettingsView> => ipcRenderer.invoke(IPC.SettingsGet),
    set: (patch: Partial<Settings>): Promise<SettingsView> =>
      ipcRenderer.invoke(IPC.SettingsSet, patch),
    onChanged: (cb: (settings: SettingsView) => void): (() => void) => {
      const listener = (_e: unknown, settings: SettingsView): void => cb(settings)
      ipcRenderer.on(IPC.SettingsChanged, listener)
      return () => ipcRenderer.removeListener(IPC.SettingsChanged, listener)
    },
  },
  app: {
    /** Open Sanas: reveal the main window on its current page (restores, never reloads). */
    showMain: (): Promise<void> => ipcRenderer.invoke(IPC.MainWindowShow),
  },
  overlay: {
    activateComposer: (): Promise<void> => ipcRenderer.invoke(IPC.ComposeActivate),
    composerReady: (): Promise<void> => ipcRenderer.invoke(IPC.ComposeReady),
    releaseFocus: (): Promise<void> => ipcRenderer.invoke(IPC.ComposeRelease),
    onCompose: (cb: () => void): (() => void) => subscribe(IPC.ComposeFocus, cb),
    toggle: (): Promise<void> => ipcRenderer.invoke(IPC.OverlayToggle),
    resize: (request: OverlayResizeRequest): Promise<void> =>
      ipcRenderer.invoke(IPC.OverlayResize, request),
    setClickThrough: (on: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.OverlayClickThrough, on),
    onGhostState: (cb: (on: boolean) => void): (() => void) => {
      const listener = (_e: unknown, on: boolean): void => cb(on)
      ipcRenderer.on(IPC.OverlayGhostState, listener)
      return () => ipcRenderer.removeListener(IPC.OverlayGhostState, listener)
    },
  },
  meeting: {
    getState: (): Promise<MeetingState> => ipcRenderer.invoke(IPC.MeetingGetState),
    /** Main snapshots the job's saved resume. `options.interview` undefined = default (on
     *  when the job has a saved resume); `options.meetingContext` is saved with the meeting. */
    start: (
      jobId?: number,
      channels?: number,
      options?: MeetingStartOptions,
    ): Promise<MeetingState> => ipcRenderer.invoke(IPC.MeetingStart, jobId, channels, options),
    /** Stop listening but keep the meeting open; resume continues its clock. */
    pause: (): Promise<MeetingState> => ipcRenderer.invoke(IPC.MeetingPause),
    /** Resume with the capture topology now in hand; main refuses if it changed. */
    resume: (channels: number): Promise<MeetingState> =>
      ipcRenderer.invoke(IPC.MeetingResume, channels),
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
    request: (request: ManualRequest): Promise<Admission> =>
      ipcRenderer.invoke(IPC.AssistRequest, request),
    getAnswerEveryQuestion: (): Promise<{ meetingId: number | null; enabled: boolean }> =>
      ipcRenderer.invoke(IPC.AnswerEveryQuestionGet),
    setAnswerEveryQuestion: (id: number, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.AnswerEveryQuestionSet, id, enabled),
    onAnswerEveryQuestion: (
      cb: (state: { meetingId: number | null; enabled: boolean }) => void,
    ): (() => void) => subscribe(IPC.AnswerEveryQuestionChanged, cb),
    now: (): Promise<void> => ipcRenderer.invoke(IPC.AssistNow),
    onSuggestion: (cb: (ev: SuggestionEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: SuggestionEvent): void => cb(ev)
      ipcRenderer.on(IPC.SuggestionEvent, listener)
      return () => ipcRenderer.removeListener(IPC.SuggestionEvent, listener)
    },
  },
  history: {
    /** Resolves with the sources at once; the answer then streams via onEvent. Rejects
     *  with a readable message when it cannot run (no API key). */
    ask: (question: string, jobId?: number): Promise<{ askId: number; sources: HistoryHit[] }> =>
      ipcRenderer.invoke(IPC.HistoryAsk, question, jobId),
    onEvent: (cb: (ev: HistoryEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: HistoryEvent): void => cb(ev)
      ipcRenderer.on(IPC.HistoryEvent, listener)
      return () => ipcRenderer.removeListener(IPC.HistoryEvent, listener)
    },
  },
  retention: {
    /** What a clean-up would remove right now, under the saved limits. */
    preview: (): Promise<RetentionPreview> => ipcRenderer.invoke(IPC.RetentionPreview),
    /** Runs the clean-up now; resolves with what was removed and what was still in use. */
    run: (): Promise<RetentionResult> => ipcRenderer.invoke(IPC.RetentionRun),
  },
  jobs: {
    /** Active jobs; `includeArchived` adds archived ones (each carries `archived`). */
    list: (options?: { includeArchived?: boolean }): Promise<Job[]> =>
      ipcRenderer.invoke(IPC.JobsList, options),
    create: (name: string): Promise<Job> => ipcRenderer.invoke(IPC.JobsCreate, name),
    update: (job: Omit<Job, 'createdAt' | 'archived'>): Promise<Job> =>
      ipcRenderer.invoke(IPC.JobsUpdate, job),
    archive: (id: number, archived: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.JobsArchive, id, archived),
    /** The job's saved resume; new meetings for the job snapshot it at Start. */
    getResume: (jobId: number): Promise<MeetingResume | null> =>
      ipcRenderer.invoke(IPC.JobsGetResume, jobId),
    /** Replaces the saved resume, or removes it with null; resolves with what was stored. */
    setResume: (jobId: number, resume: MeetingResume | null): Promise<MeetingResume | null> =>
      ipcRenderer.invoke(IPC.JobsSetResume, jobId, resume),
    /** Native PDF/DOCX picker; resolves with an unsaved draft, or null when cancelled. */
    importResume: (): Promise<MeetingResume | null> => ipcRenderer.invoke(IPC.JobsImportResume),
    /** Counts everything deleting the job removes; a token when deletion is allowed. */
    deletePreview: (jobId: number): Promise<JobDeletionPreview> =>
      ipcRenderer.invoke(IPC.JobsDeletePreview, jobId),
    /** Backs up the database, then deletes the job and everything counted. */
    delete: (token: string): Promise<JobDeletionResult> =>
      ipcRenderer.invoke(IPC.JobsDelete, token),
  },
  /** Jobs from resumes interview packs: main reads packs; the renderer only names them. */
  jobApplications: {
    /** Runs the resumes pack command, then lists the packs on disk with their link state. */
    list: (): Promise<ApplicationListing> => ipcRenderer.invoke(IPC.JobApplicationsList),
    preview: (applicationId: string): Promise<ApplicationPreview> =>
      ipcRenderer.invoke(IPC.JobApplicationsPreview, applicationId),
    apply: (request: ApplyRequest): Promise<ApplyResult> =>
      ipcRenderer.invoke(IPC.JobApplicationsApply, request),
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
    /** The saved resume, kept off Meeting rows because it can be tens of thousands of characters. */
    getResume: (meetingId: number): Promise<MeetingResume | null> =>
      ipcRenderer.invoke(IPC.MeetingsGetResume, meetingId),
    /** Folds the given meetings into their earliest one. Irreversible; rejects with a
     *  readable message when they cannot be merged (different jobs, one still running). */
    merge: (meetingIds: number[]): Promise<MergeResult> =>
      ipcRenderer.invoke(IPC.MeetingsMerge, meetingIds),
    /** Rejects with a readable message when the summary can't run. */
    summarize: (meetingId: number): Promise<Meeting> =>
      ipcRenderer.invoke(IPC.MeetingsSummarize, meetingId),
    /** Resolves with the recipient; rejects with a readable message on failure. */
    emailSummary: (meetingId: number): Promise<string> =>
      ipcRenderer.invoke(IPC.MeetingsEmailSummary, meetingId),
    search: (query: string): Promise<SearchMatch[]> =>
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
