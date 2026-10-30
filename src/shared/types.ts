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

/** Which lane started a suggestion: automatic ('ambient') or requested ('hotkey'). */
export type SuggestionTrigger = 'ambient' | 'hotkey'

/** What a suggestion is for: an answer to the room, or the next point while the user talks. */
export type SuggestionPurpose = 'answer' | 'next-point'

export interface Suggestion {
  id: number
  meetingId: number
  tMs: number
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
  text: string
}

/** One full-text hit. `snippet` wraps matched terms in \u0001…\u0002 for the renderer to mark. */
export interface SearchMatch {
  meeting: Meeting
  jobName: string
  segmentId: number
  tStartMs: number
  snippet: string
}

/** A meeting an Ask answer drew on, with where the best hit was. */
export interface HistoryHit {
  meetingId: number
  title: string
  jobName: string
  startedAt: string
  tStartMs: number
  snippet: string
}

/** Streaming answer to an Ask question (main → windows). */
export interface HistoryEvent {
  askId: number
  /** 'delta' appends text; 'done' carries the full answer; 'error' a message. */
  kind: 'delta' | 'done' | 'error'
  text: string
}

/** Capture topology: 1 = mic only, 2 = mic + system loopback. */
export type ChannelCount = 1 | 2

/** Where the other voices come from. 'this-pc': the call plays through this PC, its output
 *  is tapped digitally and the mic is only the user (stereo, channel = identity).
 *  'elsewhere': another device or the room — everyone arrives through the mic, so voices
 *  are diarized and the user marks their own (mono + "that's me" pinning). */
export type MeetingSource = 'this-pc' | 'elsewhere'

/** How ambient suggestions balance coaching against concrete answers. */
export type WhisperMode = 'smart' | 'full' | 'points'

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
  presentationRevision?: number
  suggestionId: number
  meetingId: number
  trigger: SuggestionTrigger
  purpose: SuggestionPurpose
  /** 'start' opens an empty streaming item; 'delta' appends text; 'done' closes it;
   *  'error' carries a message. */
  kind: 'start' | 'delta' | 'done' | 'error'
  text: string
}

export interface MeetingState {
  meetingId: number | null
  /** 'paused' keeps the meeting open with nothing being captured. */
  status: 'idle' | 'live' | 'paused' | 'error'
  /** Why, when the status is 'error', or when a lost connection forced the pause. */
  error?: string
  /** Mic + system audio meetings only: the system-audio channel has stayed silent while the
   *  mic heard sound, so remote voices are probably being labelled as the user. Advisory:
   *  nothing is relabelled or dropped because of it. */
  captureWarning?: string
}

/** Desired overlay dimensions from one or both custom resize axes. */
export interface OverlayResizeRequest {
  width?: number
  height?: number
}

export interface Settings {
  deepgramApiKey: string
  anthropicApiKey: string
  /** Only needed for org-level (non-workspace) Anthropic keys; sent as anthropic-workspace-id. */
  anthropicWorkspaceId: string
  /** Claude model used for short ambient suggestions. */
  nudgeModel: string
  /** Claude model used for on-demand answers, summaries and Ask-your-history. */
  answerModel: string
  /** Claude model that decides whether a finished turn needs a response from the user. */
  classifierModel: string
  /** Minimum time between automatic answers to completed turns; 0 disables the cooldown. */
  nudgeCooldownSec: number
  /** Suggest the next point while the user is explaining something (off by default). */
  coachWhileTalking: boolean
  /** Shape of ambient suggestions. The assist hotkey is always a full answer. */
  whisperMode: WhisperMode
  overlayHotkey: string
  assistHotkey: string
  presentationPrevHotkey: string
  presentationNextHotkey: string
  audioDeviceId: string
  /** Save raw meeting audio to a local WAV file. */
  recordAudio: boolean
  /** Last-used meeting source; the Live page remembers the choice per meeting. */
  meetingSource: MeetingSource
  /** Overlay window opacity, 0.4–1. */
  overlayOpacity: number
  /** Remembered overlay window bounds; null until first moved/resized. */
  overlayBounds: { x: number; y: number; width: number; height: number } | null
  /** Share of the overlay content area assigned to the whisper panel. */
  overlayWhisperRatio: number
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

/** What a retention run would remove right now. */
export interface RetentionPreview {
  meetings: number
  audioFiles: number
  /** Recordings on disk that no meeting points at — left behind by a merge that could
   *  not delete a locked file. They have no age, so they are always due. */
  orphanFiles: number
  audioBytes: number
}

/** What a retention run actually removed, plus how many items it could not
 *  (recording locked by another process, or a meeting still being written — both kept
 *  for the next run). */
export interface RetentionResult extends RetentionPreview {
  failed: number
}

/** The outcome of folding meetings together: the survivor, plus how many of the parts'
 *  recordings could not be deleted because another program had them open. Those are
 *  swept by the next retention run — but the merge says so rather than claiming they
 *  are gone. */
export interface MergeResult {
  meeting: Meeting
  recordingsLeftBehind: number
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
