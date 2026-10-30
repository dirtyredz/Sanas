import { expect, it } from 'vitest'
import { requireContextUpdate, requireManualRequest } from './live-controls-validation'
it('validates text bounds, identities, revisions and selected slides without truncation', () => {
  expect(requireContextUpdate({ meetingId: 1, expectedRevision: 0, text: '' }).text).toBe('')
  for (const patch of [
    { text: 'x'.repeat(20001) },
    { expectedRevision: -1 },
    { meetingId: 0 },
    { deck: { slides: [], ordinal: 1, expectedPresentationRevision: 0 } },
  ]) {
    expect(() =>
      requireContextUpdate({ meetingId: 1, expectedRevision: 0, text: '', ...patch }),
    ).toThrow()
  }
  for (const raw of [
    null,
    [],
    { kind: 'typed', meetingId: 1, text: ' ' },
    { kind: 'typed', meetingId: 1, text: 'x'.repeat(4001) },
    { kind: 'detail', meetingId: 1, sourceSuggestionId: -1 },
  ])
    expect(() => requireManualRequest(raw)).toThrow()
  expect(requireManualRequest({ meetingId: 1, kind: 'typed', text: 'hello' })).toEqual({
    meetingId: 1,
    kind: 'typed',
    text: 'hello',
  })
})
