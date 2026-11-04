import type { Meeting } from '../types'

export type MockPlanId = 'interview' | 'client-qa'
export interface MockQuestionResult {
  id: string
  text: string
  followUp: boolean
  fallback: boolean
  producedSuggestion: boolean
  /** STT final receipt to first broadcast text. */
  firstVisibleLatencyMs: number | null
  /** Interviewer speech finished (playback acknowledged) to first broadcast text. Absent in
   *  results saved before it existed. */
  spokenVisibleLatencyMs?: number | null
  completionLatencyMs: number | null
  words: number
  reason: string
}
export interface MockResult {
  meetingId: number
  plan: string
  reason: string
  questions: MockQuestionResult[]
}
export interface MockState {
  meetingId: number | null
  status: 'idle' | 'starting' | 'thinking' | 'speaking' | 'waiting' | 'ending' | 'ended'
  persona: string
  caption: string
  share: string | null
  speech: { id: number; text: string } | null
  result: MockResult | null
  error?: string
}
export interface MockSetup {
  plans: { id: MockPlanId; name: string; persona: string }[]
  missingKeys: string[]
}
export interface PracticeSession {
  meeting: Meeting
  result: MockResult | null
}
