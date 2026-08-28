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
  SegmentsList: 'segments:list',
  SuggestionsList: 'suggestions:list',
  // overlay ghost mode (clicks pass through; overlay hotkey restores)
  OverlayClickThrough: 'overlay:click-through',
  OverlayGhostState: 'overlay:ghost-state',
  // db smoke-test (Phase 0 only; replaced by real repos in later phases)
  DbPing: 'db:ping'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
