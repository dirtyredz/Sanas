export type SuggestionTrigger = 'ambient' | 'hotkey'

export interface SuggestionInFlight {
  ambient: boolean
  hotkey: boolean
}

export function emptySuggestionInFlight(): SuggestionInFlight {
  return { ambient: false, hotkey: false }
}

/** Ambient and requested answers have separate lanes, capped at one request each. */
export function canStartSuggestion(
  inFlight: SuggestionInFlight,
  trigger: SuggestionTrigger,
): boolean {
  return !inFlight[trigger]
}

/** Full answers get more time than terse ambient coaching. */
export function suggestionTimeoutMs(trigger: SuggestionTrigger, full: boolean): number {
  return trigger === 'hotkey' || full ? 60_000 : 25_000
}
