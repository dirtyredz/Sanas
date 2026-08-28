// Domain types shared between main and renderer.

export interface Job {
  id: number
  name: string
  companyInfo: string
  projectScope: string
  notes: string
  talkingPoints: string
  persona: string
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
  overlayHotkey: string
  assistHotkey: string
  audioDeviceId: string
  /** Save raw meeting audio to a local WAV file. */
  recordAudio: boolean
  /** Overlay window opacity, 0.4–1. */
  overlayOpacity: number
  /** Remembered overlay window bounds; null until first moved/resized. */
  overlayBounds: { x: number; y: number; width: number; height: number } | null
}

/** Settings with secrets masked for display (renderer never needs raw keys). */
export interface SettingsView extends Omit<Settings, 'deepgramApiKey' | 'anthropicApiKey'> {
  deepgramKeySet: boolean
  anthropicKeySet: boolean
}
