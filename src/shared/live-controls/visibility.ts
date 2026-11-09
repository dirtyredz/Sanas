/** Renderer commit/frame proxy, never a claim about physical display paint. */
export interface SuggestionVisibility {
  meetingId: number
  runId: number
  state: 'frame-after-commit' | 'hidden' | 'unselected'
}
