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
export type ManualKind = 'typed' | 'detail' | 'audience'
export type ManualRequest = { meetingId: number } & (
  | { kind: 'typed'; text: string }
  | { kind: 'detail'; sourceSuggestionId: number }
  | { kind: 'audience' }
)
export type Admission =
  | { accepted: true; storedSuggestionId?: number }
  | { accepted: false; reason: 'busy' | 'unavailable' | 'no-evidence'; message: string }
export interface SuggestionMetadata {
  contextRevision?: number | null
  groundingContextId?: number | null
  sourceSuggestionId?: number | null
  requestText?: string | null
  manualKind?: ManualKind | null
  storedSuggestionId?: number
}
