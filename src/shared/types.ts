// Domain types shared between main and renderer.

export interface Job {
  id: number
  name: string
  companyInfo: string
  projectScope: string
  notes: string
  talkingPoints: string
  persona: string
  /** Where this job's meeting summaries are emailed. Empty = no email for this job. */
  summaryEmail: string
  createdAt: string
  archived: boolean
}

export interface GlossaryTerm {
  id: number
  jobId: number
  term: string
  note: string
}

export interface Meeting {
  id: number
  jobId: number
  title: string
  startedAt: string
  endedAt: string | null
  audioPath: string | null
  summary: string | null
  actionItems: string | null
}

export interface Segment {
  id: number
  meetingId: number
  tStartMs: number
  tEndMs: number
  speaker: number
  isUser: boolean
  text: string
}

export interface Suggestion {
  id: number
  meetingId: number
  tMs: number
  trigger: 'ambient' | 'hotkey'
  text: string
}

/** Capture topology: 1 = mic only, 2 = mic + system loopback. */
export type ChannelCount = 1 | 2

/** Where the other voices come from. 'this-pc': the call plays through this PC, its output
 *  is tapped digitally and the mic is only the user (stereo, channel = identity).
 *  'elsewhere': another device or the room — everyone arrives through the mic, so voices
 *  are diarized and the user marks their own (mono + "that's me" pinning). */
export type MeetingSource = 'this-pc' | 'elsewhere'

/** Live transcript event pushed from main to windows. */
export interface TranscriptEvent {
  meetingId: number
  /** Interims replace the previous interim; finals append. */
  isFinal: boolean
  speaker: number
  isUser: boolean
  tStartMs: number
  tEndMs: number
  text: string
}

/** Streaming suggestion event pushed from main to windows. */
export interface SuggestionEvent {
  suggestionId: number
  meetingId: number
  trigger: 'ambient' | 'hotkey'
  /** 'delta' appends text; 'done' closes the suggestion; 'error' carries a message. */
  kind: 'delta' | 'done' | 'error'
  text: string
}

export interface MeetingState {
  meetingId: number | null
  status: 'idle' | 'live' | 'error'
  error?: string
}

export interface Settings {
  deepgramApiKey: string
  anthropicApiKey: string
  /** Only needed for org-level (non-workspace) Anthropic keys; sent as anthropic-workspace-id. */
  anthropicWorkspaceId: string
  overlayHotkey: string
  assistHotkey: string
  audioDeviceId: string
  /** Save raw meeting audio to a local WAV file. */
  recordAudio: boolean
  /** Last-used meeting source; the Live page remembers the choice per meeting. */
  meetingSource: MeetingSource
  /** Overlay window opacity, 0.4–1. */
  overlayOpacity: number
  /** Remembered overlay window bounds; null until first moved/resized. */
  overlayBounds: { x: number; y: number; width: number; height: number } | null
  /** Email the summary automatically when a meeting stops (to the job's address). */
  summaryEmailAuto: boolean
  /** Outgoing SMTP server (e.g. smtp.gmail.com). */
  smtpHost: string
  smtpPort: number
  /** Login for the SMTP server; also the From address. */
  smtpUser: string
  /** SMTP password / app password. Main-process only, like the API keys. */
  smtpPass: string
  /** Delete a meeting's recording this many days after it ends; 0 = keep forever. */
  audioRetentionDays: number
  /** Delete whole meetings (transcript, summary, suggestions, recording) this many days
   *  after they end; 0 = keep forever. */
  meetingRetentionDays: number
}

/** What a retention run would remove (or did remove). */
export interface RetentionPreview {
  meetings: number
  audioFiles: number
  audioBytes: number
}

/** Settings with secrets masked for display (renderer never needs raw keys). */
export interface SettingsView extends Omit<
  Settings,
  'deepgramApiKey' | 'anthropicApiKey' | 'smtpPass'
> {
  deepgramKeySet: boolean
  anthropicKeySet: boolean
  smtpPassSet: boolean
}
