/** Per-meeting context text limit: Start's initial context and every later Apply. */
export const MEETING_CONTEXT_MAX_CHARS = 20_000

/** The one validator for meeting-context text (Start's initial text, Apply, rehearsal scenarios):
 *  returns the text unchanged, or throws a readable reason. Never truncates. */
export function requireMeetingContextText(value: unknown): string {
  if (typeof value !== 'string' || value.length > MEETING_CONTEXT_MAX_CHARS)
    throw new Error(
      `Meeting context must be text of at most ${MEETING_CONTEXT_MAX_CHARS.toLocaleString('en-US')} characters.`,
    )
  return value
}
