import { expect, it } from 'vitest'
import type { SuggestionView } from '../../lib/suggestions/whisper-history'
import {
  canRequestDetail,
  findStored,
  manualRequest,
  requestedAnswerInFlight,
  sendManualRequest,
} from './manual-requests'

const card = (over: Partial<SuggestionView> = {}): SuggestionView => ({
  suggestionId: 1,
  meetingId: 1,
  trigger: 'ambient',
  purpose: 'answer',
  text: 'Ship it',
  streaming: false,
  error: null,
  finishedAt: 1,
  storedSuggestionId: 41,
  groundingContextId: 7,
  ...over,
})

it('offers More detail only on a finished, stored, grounded answer', () => {
  expect(canRequestDetail(card())).toBe(true)
  expect(canRequestDetail(card({ manualKind: 'typed' }))).toBe(true)
  expect(canRequestDetail(card({ manualKind: 'capture' }))).toBe(true)
  expect(canRequestDetail(card({ manualKind: 'detail' }))).toBe(false)
  expect(canRequestDetail(card({ manualKind: 'audience' }))).toBe(false)
  expect(canRequestDetail(card({ streaming: true }))).toBe(false)
  expect(canRequestDetail(card({ error: 'failed' }))).toBe(false)
  expect(canRequestDetail(card({ storedSuggestionId: undefined }))).toBe(false)
  expect(canRequestDetail(card({ groundingContextId: undefined }))).toBe(false)
  expect(canRequestDetail(card({ purpose: 'next-point' }))).toBe(false)
  expect(canRequestDetail(null)).toBe(false)
})

it('sends detail with the stored source id, and audience without one', () => {
  expect(manualRequest('detail', 3, card())).toEqual({
    meetingId: 3,
    kind: 'detail',
    sourceSuggestionId: 41,
  })
  expect(manualRequest('detail', 3, card({ storedSuggestionId: undefined }))).toBeNull()
  expect(manualRequest('audience', 3, null)).toEqual({ meetingId: 3, kind: 'audience' })
})

it('finds an existing child by stored id', () => {
  const items = [card(), card({ suggestionId: 2, storedSuggestionId: 42 })]
  expect(findStored(items, 42)?.suggestionId).toBe(2)
  expect(findStored(items, 99)).toBeUndefined()
  expect(findStored(items, undefined)).toBeUndefined()
})

it('counts only requested answers as busy, never ambient generation', () => {
  expect(requestedAnswerInFlight([card({ streaming: true })])).toBe(false)
  expect(requestedAnswerInFlight([card({ trigger: 'hotkey', streaming: true })])).toBe(true)
  expect(requestedAnswerInFlight([card({ trigger: 'hotkey' })])).toBe(false)
})

it('turns refusals into feedback and drops replies for an earlier meeting', async () => {
  const request = { meetingId: 1, kind: 'audience' as const }
  expect(
    await sendManualRequest(request, {
      send: async () => ({ accepted: false, reason: 'no-evidence', message: 'Nothing heard yet' }),
      isCurrent: () => true,
    }),
  ).toEqual({ type: 'refused', message: 'Nothing heard yet' })
  expect(
    await sendManualRequest(request, {
      send: async () => ({ accepted: true, storedSuggestionId: 5 }),
      isCurrent: () => true,
    }),
  ).toEqual({ type: 'accepted', storedSuggestionId: 5 })
  expect(
    await sendManualRequest(request, {
      send: async () => ({ accepted: false, reason: 'busy', message: 'Busy' }),
      isCurrent: () => false,
    }),
  ).toEqual({ type: 'stale' })
  expect(
    await sendManualRequest(request, {
      send: () => Promise.reject(new Error('offline')),
      isCurrent: () => true,
    }),
  ).toEqual({ type: 'refused', message: 'Error: offline' })
})
