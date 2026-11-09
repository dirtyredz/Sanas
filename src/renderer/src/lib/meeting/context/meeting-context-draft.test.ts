import { expect, it } from 'vitest'
import type { MeetingContext } from '@shared/live-controls/types'
import {
  contextDraftReducer,
  contextUpdate,
  hasConflict,
  initialContextDraft,
  isUnsaved,
} from './meeting-context-draft'

const saved: MeetingContext = { meetingId: 3, revision: 4, text: 'Client: Beaverton clinic' }

it('Apply sends only text against the revision the draft started from', () => {
  const draft = contextDraftReducer(initialContextDraft(saved), {
    type: 'text',
    text: 'New background',
  })
  expect(contextUpdate(draft)).toEqual({
    meetingId: 3,
    expectedRevision: 4,
    text: 'New background',
  })
  expect(isUnsaved(draft)).toBe(true)
  expect(isUnsaved(initialContextDraft(saved))).toBe(false)
})

it('starts from the saved revision-0 text entered before Start', () => {
  const initial: MeetingContext = { meetingId: 9, revision: 0, text: 'Agenda: pilot scope' }
  const draft = initialContextDraft(initial)
  expect(draft).toMatchObject({ text: 'Agenda: pilot scope', base: initial })
  expect(contextUpdate(draft).expectedRevision).toBe(0)
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
  expect(isUnsaved(applied)).toBe(false)
})
