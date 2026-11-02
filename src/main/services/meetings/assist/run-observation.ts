import type { SuggestionEvent } from '@shared/types'
import type { SuggestionOutcome, SuggestionRequest } from './suggestion-runner'

export type RunObservation =
  | {
      kind: 'begin'
      id: number
      meetingId: number
      purpose: string
      spans: NonNullable<SuggestionRequest['diagnosticTurns']>
    }
  | { kind: 'visible'; event: SuggestionEvent }
  | { kind: 'settled'; id: number; meetingId: number; outcome: SuggestionOutcome }
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
