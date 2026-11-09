import type { SuggestionEvent, SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import type { ProviderUsage, ProviderTiming } from '../../assistant/types'
import type { SuggestionOutcome, SuggestionRequest } from './suggestion-runner'

/** The model policy a run actually used (product profile, not provider vocabulary). */
export interface EffectiveProfile {
  model: string
  profile: 'full' | 'smart' | 'points' | 'other'
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
}

// `at` is the runner's monotonic clock where the event happened (latency evidence). The
// 'visible' event carries broadcast text: consumers must not serialize it wholesale.
export type RunObservation =
  | {
      kind: 'begin'
      id: number
      meetingId: number
      purpose: SuggestionPurpose
      trigger: SuggestionTrigger
      spans: NonNullable<SuggestionRequest['diagnosticTurns']>
      /** Started unpublished alongside the classifier; it shows nothing until 'promoted'. */
      speculative?: boolean
      at: number
      effective?: EffectiveProfile
    }
  | { kind: 'visible'; event: SuggestionEvent }
  /** The provider's first non-empty text, shown or not (held no-op prefix, speculation). */
  | { kind: 'first-text'; id: number; meetingId: number; at: number }
  /** The first broadcast whose visible text is readable (not empty, the no-op or Markdown
   *  delimiters alone). Main broadcast is a proxy for visibility, not renderer paint. */
  | { kind: 'first-readable'; id: number; meetingId: number; at: number }
  | { kind: 'promoted'; id: number; meetingId: number; at: number }
  /** Provider usage for the run, partial when it did not complete. */
  | { kind: 'usage'; id: number; meetingId: number; usage: ProviderUsage }
  | { kind: 'provider'; id: number; meetingId: number; timing: ProviderTiming }
  | {
      kind: 'renderer'
      id: number
      meetingId: number
      state: 'frame-after-commit' | 'hidden' | 'unselected'
      at: number
    }
  | {
      kind: 'settled'
      id: number
      meetingId: number
      outcome: SuggestionOutcome
      storedSuggestionId?: number
      at: number
    }
const listeners = new Set<(event: RunObservation) => void>()
export function subscribeRuns(listener: (event: RunObservation) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function observeRun(event: RunObservation): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      /* evidence is never admission policy */
    }
  }
}
