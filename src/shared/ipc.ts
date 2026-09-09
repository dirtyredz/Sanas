// Typed IPC channel names. Renderer invokes; main handles.
// Keep this the single source of truth for channel strings.

export const IPC = {
  // settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  // overlay
  OverlayToggle: 'overlay:toggle',
  // meetings (renderer → main)
  MeetingStart: 'meeting:start',
  MeetingStop: 'meeting:stop',
  MeetingPinSpeaker: 'meeting:pin-speaker',
  // audio stream (renderer → main, fire-and-forget)
  AudioChunk: 'audio:chunk',
  // live events (main → all windows)
  TranscriptEvent: 'transcript:event',
  MeetingState: 'meeting:state',
  SuggestionEvent: 'suggestion:event',
  /** A meeting's stored record changed post-hoc (re-diarization) — reload views. */
  MeetingUpdated: 'meeting:updated',
  // assist (renderer → main; also fired by global hotkey in main)
  AssistNow: 'assist:now',
  // jobs + context packs
  JobsList: 'jobs:list',
  JobsCreate: 'jobs:create',
  JobsUpdate: 'jobs:update',
  JobsArchive: 'jobs:archive',
  GlossaryList: 'glossary:list',
  GlossaryAdd: 'glossary:add',
  GlossaryRemove: 'glossary:remove',
  // meeting history
  MeetingsList: 'meetings:list',
  MeetingsDelete: 'meetings:delete',
  MeetingsRename: 'meetings:rename',
  MeetingsMove: 'meetings:move',
  MeetingsExport: 'meetings:export',
  MeetingsGet: 'meetings:get',
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
  // overlay ghost mode (clicks pass through; overlay hotkey restores)
  OverlayClickThrough: 'overlay:click-through',
  OverlayGhostState: 'overlay:ghost-state',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
