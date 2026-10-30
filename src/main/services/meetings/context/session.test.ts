import { expect, it, vi } from 'vitest'
import { applyContext } from './session'
import type { MeetingContext, ContextUpdate } from '@shared/live-controls/types'
import type { PresentationState } from '@shared/presentation/types'
const current: MeetingContext = {
  meetingId: 1,
  revision: 0,
  deckVersion: 0,
  text: '',
  slides: [],
  initialSlides: [],
}
const presentation: PresentationState = {
  meetingId: 1,
  revision: 0,
  count: 0,
  ordinal: 0,
  current: null,
  next: null,
}
const update: ContextUpdate = { meetingId: 1, expectedRevision: 0, text: 'Correction' }
it('commits before publication and leaves state untouched on failure', () => {
  const publish = vi.fn(),
    persist = vi.fn(() => {
      throw new Error('disk full')
    })
  expect(() => applyContext(current, update, presentation, 0, persist, publish)).toThrow(
    'disk full',
  )
  expect(publish).not.toHaveBeenCalled()
  expect(current.text).toBe('')
  const order: string[] = []
  expect(
    applyContext(
      current,
      update,
      presentation,
      0,
      () => {
        order.push('commit')
      },
      () => {
        order.push('publish')
      },
    ).revision,
  ).toBe(1)
  expect(order).toEqual(['commit', 'publish'])
})
it('rejects stale context/navigation or another meeting and skips identical Apply', () => {
  const persist = vi.fn(),
    publish = vi.fn()
  expect(applyContext(current, { ...update, text: '' }, presentation, 0, persist, publish)).toBe(
    current,
  )
  expect(persist).not.toHaveBeenCalled()
  for (const patch of [
    { meetingId: 2 },
    { expectedRevision: 2 },
    { deck: { slides: [], ordinal: 0, expectedPresentationRevision: 2 } },
  ])
    expect(() =>
      applyContext(current, { ...update, ...patch }, presentation, 0, persist, publish),
    ).toThrow()
})
it('versions replacement, clear, and restoration independently of context/navigation', () => {
  const slide = { title: 'Original', talkingPoint: 'Point', script: '', keyFacts: '' }
  const persist = vi.fn(),
    publish = vi.fn()
  const added = applyContext(
    current,
    { ...update, deck: { slides: [slide], ordinal: 0, expectedPresentationRevision: 0 } },
    presentation,
    42,
    persist,
    publish,
  )
  expect(added).toMatchObject({ revision: 1, deckVersion: 1 })
  expect(persist.mock.calls[0][2]).toMatchObject({
    ordinal: 0,
    revision: 1,
    deckVersion: 1,
    tMs: 42,
  })
  const cleared = applyContext(
    added,
    {
      ...update,
      expectedRevision: 1,
      deck: { slides: [], ordinal: 0, expectedPresentationRevision: 5 },
    },
    { ...presentation, revision: 5 },
    42,
    persist,
    publish,
  )
  expect(persist.mock.calls[1][2]).toMatchObject({ ordinal: null, revision: 6, deckVersion: 2 })
  const restored = applyContext(
    cleared,
    {
      ...update,
      expectedRevision: 2,
      deck: { slides: [slide], ordinal: 0, expectedPresentationRevision: 6 },
    },
    { ...presentation, revision: 6 },
    42,
    persist,
    publish,
  )
  expect(restored).toMatchObject({ revision: 3, deckVersion: 3, slides: [slide] })
})
