import { expect, it } from 'vitest'
import {
  requireContextUpdate,
  requireManualRequest,
  requireSuggestionVisibility,
} from './live-controls-validation'
it('accepts only correlated typed visibility states and strips extra payload', () => {
  for (const state of ['frame-after-commit', 'hidden', 'unselected']) {
    expect(requireSuggestionVisibility({ meetingId: 7, runId: 9, state, text: 'private' })).toEqual(
      { meetingId: 7, runId: 9, state },
    )
  }
  for (const raw of [
    null,
    [],
    { meetingId: 0, runId: 9, state: 'hidden' },
    { meetingId: 7, runId: 9, state: 'painted' },
  ])
    expect(() => requireSuggestionVisibility(raw)).toThrow()
})
it('validates text bounds, identities and revisions without truncation; refuses a deck', () => {
  expect(requireContextUpdate({ meetingId: 1, expectedRevision: 0, text: '' }).text).toBe('')
  expect(
    requireContextUpdate({ meetingId: 1, expectedRevision: 2, text: 'x'.repeat(20000) }),
  ).toEqual({ meetingId: 1, expectedRevision: 2, text: 'x'.repeat(20000) })
  for (const patch of [
    { text: 'x'.repeat(20001) },
    { expectedRevision: -1 },
    { meetingId: 0 },
    { deck: { slides: [], ordinal: 0, expectedPresentationRevision: 0 } },
    { text: 42 },
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
it('accepts only a main-issued token for an attached screen, never a capture kind or image', () => {
  const token = '123e4567-e89b-42d3-a456-426614174000'
  expect(
    requireManualRequest({ meetingId: 1, kind: 'typed', text: 'why?', captureToken: token }),
  ).toEqual({ meetingId: 1, kind: 'typed', text: 'why?', captureToken: token })
  for (const captureToken of ['C:\\Users\\x.png', 'data:image/png;base64,AAAA', 42, ''])
    expect(() =>
      requireManualRequest({ meetingId: 1, kind: 'typed', text: 'why?', captureToken }),
    ).toThrow('Invalid screen attachment')
  // a renderer cannot ask for an image request directly
  expect(() =>
    requireManualRequest({ meetingId: 1, kind: 'capture', image: { base64: 'AAAA' } }),
  ).toThrow('Invalid manual request kind')
})
