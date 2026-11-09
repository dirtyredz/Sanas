// Typed IPC channel names. Renderer invokes; main handles.
// Keep this the single source of truth for channel strings.

export const IPC = {
  MockSetup: 'mock:setup',
  MockStart: 'mock:start',
  MockEnd: 'mock:end',
  MockSkip: 'mock:skip',
  MockDismiss: 'mock:dismiss',
  MockState: 'mock:state',
  MockChanged: 'mock:changed',
  MockSpeechDone: 'mock:speech-done',
  MockHistory: 'mock:history',
  UpdatesGet: 'updates:get',
  UpdatesCheck: 'updates:check',
  UpdatesRestart: 'updates:restart',
  UpdatesChanged: 'updates:changed',
  MeetingContextGet: 'live-controls:MeetingContextGet',
  MeetingContextUpdate: 'live-controls:MeetingContextUpdate',
  MeetingContextChanged: 'live-controls:MeetingContextChanged',
  AssistRequest: 'live-controls:AssistRequest',
  AnswerEveryQuestionGet: 'live-controls:AnswerEveryQuestionGet',
  AnswerEveryQuestionSet: 'live-controls:AnswerEveryQuestionSet',
  AnswerEveryQuestionChanged: 'live-controls:AnswerEveryQuestionChanged',
  ComposeActivate: 'live-controls:ComposeActivate',
  ComposeReady: 'live-controls:ComposeReady',
  ComposeRelease: 'live-controls:ComposeRelease',
  ComposeFocus: 'live-controls:ComposeFocus',
  // screen capture (renderer → main; images stay in main, renderer gets bounded previews)
  ScreenCapture: 'screen-capture:capture',
  ScreenCaptureAttach: 'screen-capture:attach',
  ScreenCaptureDiscard: 'screen-capture:discard',
  ScreenCaptureStatusGet: 'screen-capture:status-get',
  ScreenCaptureStatus: 'screen-capture:status',
  /** Read-only slide markers of meetings recorded before presentation mode was retired. */
  PresentationHistory: 'presentation:history',
  HotkeysStatus: 'hotkeys:status',
  // settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  SettingsChanged: 'settings:changed',
  // overlay
  OverlayToggle: 'overlay:toggle',
  OverlayResize: 'overlay:resize',
  MainWindowShow: 'window:main-show',
  // meetings (renderer → main)
  MeetingStart: 'meeting:start',
  MeetingGetState: 'meeting:get-state',
  MeetingPause: 'meeting:pause',
  MeetingResume: 'meeting:resume',
  MeetingStop: 'meeting:stop',
  MeetingPinSpeaker: 'meeting:pin-speaker',
  // audio stream (renderer → main, fire-and-forget)
  AudioChunk: 'audio:chunk',
  // live events (main → all windows)
  TranscriptEvent: 'transcript:event',
  MeetingState: 'meeting:state',
  SuggestionEvent: 'suggestion:event',
  SuggestionVisibility: 'suggestion:visibility',
  /** A meeting's stored record changed post-hoc (re-diarization) — reload views. */
  MeetingUpdated: 'meeting:updated',
  // assist (renderer → main; also fired by global hotkey in main)
  AssistNow: 'assist:now',
  // jobs + context packs
  JobsList: 'jobs:list',
  JobsCreate: 'jobs:create',
  JobsUpdate: 'jobs:update',
  JobsArchive: 'jobs:archive',
  JobsGetResume: 'jobs:get-resume',
  JobsSetResume: 'jobs:set-resume',
  JobsImportResume: 'jobs:import-resume',
  /** Authoritative counts of everything deleting a job removes, plus a confirmation token. */
  JobsDeletePreview: 'jobs:delete-preview',
  /** Consume the confirmation token: back up the database, then delete the job and its history. */
  JobsDelete: 'jobs:delete',
  /** Refresh the resumes interview packs, then list them with their link state. */
  JobApplicationsList: 'job-applications:list',
  /** Create or refresh preview for one listed application. */
  JobApplicationsPreview: 'job-applications:preview',
  /** Apply a preview token with conflict/archive choices and draft edits. */
  JobApplicationsApply: 'job-applications:apply',
  GlossaryList: 'glossary:list',
  GlossaryAdd: 'glossary:add',
  GlossaryRemove: 'glossary:remove',
  // meeting history
  MeetingsList: 'meetings:list',
  MeetingsDelete: 'meetings:delete',
  MeetingsRename: 'meetings:rename',
  MeetingsMove: 'meetings:move',
  MeetingsExport: 'meetings:export',
  /** Fold several meetings into their earliest one; resolves with the merged meeting. */
  MeetingsMerge: 'meetings:merge',
  MeetingsGet: 'meetings:get',
  MeetingsGetResume: 'meetings:get-resume',
  /** Re-run the summary from the stored transcript; resolves with the updated meeting. */
  MeetingsSummarize: 'meetings:summarize',
  /** Email the stored summary to the configured address. */
  MeetingsEmailSummary: 'meetings:email-summary',
  SegmentsList: 'segments:list',
  SuggestionsList: 'suggestions:list',
  SegmentsSearch: 'segments:search',
  // speaker naming/merging (per meeting)
  SpeakersList: 'speakers:list',
  SpeakersRename: 'speakers:rename',
  SpeakersMerge: 'speakers:merge',
  // ask your history (question → sources at once, answer streamed as HistoryEvent)
  HistoryAsk: 'history:ask',
  HistoryEvent: 'history:event',
  // retention (age-based clean-up of recordings / meetings)
  RetentionPreview: 'retention:preview',
  RetentionRun: 'retention:run',
  // overlay ghost mode (clicks pass through; overlay hotkey restores)
  OverlayClickThrough: 'overlay:click-through',
  OverlayGhostState: 'overlay:ghost-state',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
