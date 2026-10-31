import type { Slide } from '../presentation/types'

export interface MeetingContext {
  meetingId: number
  revision: number
  deckVersion: number
  text: string
  slides: Slide[]
  initialSlides: Slide[]
}
export interface ContextUpdate {
  meetingId: number
  expectedRevision: number
  text: string
  deck?: { slides: Slide[]; ordinal: number; expectedPresentationRevision: number }
}
/** 'capture' is an answer that was sent a screenshot: a direct Capture screen, or a typed
 *  question with an attached screen. It is stored as 'typed' (see ./capture.ts). */
export type ManualKind = 'typed' | 'detail' | 'audience' | 'capture'
/** A typed request's `captureToken` names a main-owned composer draft (Attach screen); the
 *  renderer never sends image data. */
export type ManualRequest = { meetingId: number } & (
  | { kind: 'typed'; text: string; captureToken?: string }
  | { kind: 'detail'; sourceSuggestionId: number }
  | { kind: 'audience' }
)
export type Admission =
  | { accepted: true; storedSuggestionId?: number }
  | {
      accepted: false
      /** 'attachment-expired': the composer's capture token is stale; nothing was sent. */
      reason: 'busy' | 'unavailable' | 'no-evidence' | 'attachment-expired'
      message: string
    }
export interface SuggestionMetadata {
  contextRevision?: number | null
  groundingContextId?: number | null
  sourceSuggestionId?: number | null
  requestText?: string | null
  manualKind?: ManualKind | null
  storedSuggestionId?: number
}
