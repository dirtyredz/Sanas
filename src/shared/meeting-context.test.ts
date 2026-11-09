import { expect, it } from 'vitest'
import { MEETING_CONTEXT_MAX_CHARS, requireMeetingContextText } from './meeting-context'

it('returns text up to the limit unchanged and refuses anything else with one message', () => {
  const max = 'x'.repeat(MEETING_CONTEXT_MAX_CHARS)
  expect(requireMeetingContextText(max)).toBe(max)
  expect(requireMeetingContextText('')).toBe('')
  for (const bad of [max + 'x', 42, null, undefined, ['a']])
    expect(() => requireMeetingContextText(bad)).toThrow(
      'Meeting context must be text of at most 20,000 characters.',
    )
})
