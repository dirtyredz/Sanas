import type { SuggestionPurpose, SuggestionTrigger } from '@shared/types'
import { COACH_PROFILE } from '../../assistant/coach/coach-prompts'

export type { SuggestionTrigger }

export interface SuggestionInFlight {
  ambient: boolean
  hotkey: boolean
}

export function emptySuggestionInFlight(): SuggestionInFlight {
  return { ambient: false, hotkey: false }
}

/** Ambient and requested answers have separate lanes, capped at one request each. Coaching
 *  ("next point") is automatic, so it rides the ambient lane: it can never block "Answer now". */
export function canStartSuggestion(
  inFlight: SuggestionInFlight,
  trigger: SuggestionTrigger,
): boolean {
  return !inFlight[trigger]
}

/** Full answers get more time than terse ambient coaching; a next point is stale within
 *  seconds, so it gets the tightest deadline of all. */
export function suggestionTimeoutMs(
  trigger: SuggestionTrigger,
  full: boolean,
  purpose: SuggestionPurpose = 'answer',
): number {
  if (purpose === 'next-point') return COACH_PROFILE.timeoutMs
  return trigger === 'hotkey' || full ? 60_000 : 25_000
}
