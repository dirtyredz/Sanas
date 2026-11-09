/** What the overlay renderer reports about a suggestion run: the one definition of the states. */
export const SUGGESTION_VISIBILITY_STATES = ['frame-after-commit', 'hidden', 'unselected'] as const
export type SuggestionVisibilityState = (typeof SUGGESTION_VISIBILITY_STATES)[number]

/** Renderer commit/frame proxy, never a claim about physical display paint. */
export interface SuggestionVisibility {
  meetingId: number
  runId: number
  state: SuggestionVisibilityState
}
