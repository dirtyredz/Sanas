import { expect, it } from 'vitest'
import type { MeetingContext } from '@shared/live-controls/types'
import {
  contextDraftReducer,
  contextUpdate,
  hasConflict,
  initialContextDraft,
  isUnsaved,
  selectedOrdinal,
} from './meeting-context-draft'

const slide = (title: string) => ({ title, talkingPoint: '', script: '', keyFacts: '' })
const saved: MeetingContext = {
  meetingId: 3,
  revision: 4,
  deckVersion: 1,
  text: 'Client: Beaverton clinic',
  slides: [slide('Intro'), slide('Rollout')],
  initialSlides: [slide('Intro'), slide('Rollout'), slide('Q&A')],
}
const opts = { presentationRevision: 9, currentOrdinal: 1 }

it('text-only Apply never carries a deck, even when slides were edited', () => {
  let draft = initialContextDraft(saved)
  draft = contextDraftReducer(draft, { type: 'text', text: 'New background' })
  draft = contextDraftReducer(draft, { type: 'slides', slides: [], presentationRevision: 9 })
  expect(contextUpdate(draft, { textOnly: true, ...opts })).toEqual({
    meetingId: 3,
    expectedRevision: 4,
    text: 'New background',
  })
  expect(isUnsaved(draft, false)).toBe(true)
})

it('text-only unsaved state ignores the deck', () => {
  const draft = contextDraftReducer(initialContextDraft(saved), {
    type: 'slides',
    slides: [],
    presentationRevision: 9,
  })
  expect(isUnsaved(draft, false)).toBe(false)
  expect(isUnsaved(draft, true)).toBe(true)
})

it('the full editor sends the deck with the revision recorded at the first edit', () => {
  let draft = initialContextDraft(saved)
  draft = contextDraftReducer(draft, {
    type: 'slides',
    slides: [slide('A')],
    presentationRevision: 9,
  })
  draft = contextDraftReducer(draft, {
    type: 'slides',
    slides: [slide('A'), slide('B')],
    presentationRevision: 11,
  })
  expect(contextUpdate(draft, { textOnly: false, ...opts }).deck).toEqual({
    slides: [slide('A'), slide('B')],
    ordinal: 1,
    expectedPresentationRevision: 9,
  })
  // with an unchanged deck nothing about slides is sent
  expect(
    contextUpdate(initialContextDraft(saved), { textOnly: false, ...opts }).deck,
  ).toBeUndefined()
})

it('restore, clear and continue-from pin the current presentation revision', () => {
  let draft = contextDraftReducer(initialContextDraft(saved), {
    type: 'slides',
    slides: [slide('A')],
    presentationRevision: 9,
  })
  draft = contextDraftReducer(draft, {
    type: 'slides',
    slides: saved.initialSlides,
    presentationRevision: 12,
    pin: true,
  })
  expect(draft.deckRevision).toBe(12)
  draft = contextDraftReducer(draft, { type: 'ordinal', ordinal: 2, presentationRevision: 13 })
  expect(draft).toMatchObject({ ordinal: 2, deckRevision: 13 })
  expect(selectedOrdinal(draft, 0)).toBe(2)
  const cleared = contextDraftReducer(draft, {
    type: 'slides',
    slides: [],
    presentationRevision: 14,
    pin: true,
  })
  expect(selectedOrdinal(cleared, 5)).toBe(0)
})

it('a refused Apply keeps the draft; explicit Reload replaces it', () => {
  let draft = contextDraftReducer(initialContextDraft(saved), { type: 'text', text: 'Mine' })
  draft = contextDraftReducer(draft, { type: 'begin' })
  draft = contextDraftReducer(draft, { type: 'failed', message: 'Context changed. Reload.' })
  expect(draft).toMatchObject({ text: 'Mine', busy: false, notice: 'Context changed. Reload.' })
  const newer = { ...saved, revision: 5, text: 'Theirs' }
  expect(hasConflict(draft, newer)).toBe(true)
  expect(hasConflict(draft, saved)).toBe(false)
  const reloaded = contextDraftReducer(draft, { type: 'reload', context: newer })
  expect(reloaded).toMatchObject({ text: 'Theirs', base: newer, notice: '' })
})

it('Apply resets to the saved result', () => {
  const draft = contextDraftReducer(initialContextDraft(saved), { type: 'text', text: 'Mine' })
  const result = { ...saved, revision: 5, text: 'Mine' }
  const applied = contextDraftReducer(draft, { type: 'applied', context: result })
  expect(applied).toMatchObject({ base: result, busy: false, notice: 'Applied to this meeting.' })
  expect(isUnsaved(applied, true)).toBe(false)
})
