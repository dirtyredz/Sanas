import { expect, it } from 'vitest'
import { presentationTimeline } from './timeline'
it('orders ties before speech without splitting spanning segments and keeps trailing silence markers', () => {
  const slides = ['one', 'two'].map((title) => ({
    title,
    talkingPoint: title,
    script: '',
    keyFacts: '',
  }))
  const events = [
    { ordinal: 0, revision: 1, tMs: 0 },
    { ordinal: 1, revision: 2, tMs: 5 },
    { ordinal: 0, revision: 3, tMs: 5 },
    { ordinal: 1, revision: 4, tMs: 100 },
  ]
  const rows = presentationTimeline([{ tStartMs: 0, tEndMs: 10, text: 'whole' }], {
    slides,
    events,
  })
  expect(rows.map((r) => r.kind)).toEqual(['slide', 'segment', 'slide', 'slide', 'slide'])
  expect(rows.filter((r) => r.kind === 'slide').map((r) => r.event.revision)).toEqual([1, 2, 3, 4])
  expect(presentationTimeline([], { slides: [], events: [] })).toEqual([])
})

it('resolves old titles by deck version and keeps equal-time clear events ordered', () => {
  const slide = (title: string) => ({ title, talkingPoint: title, script: '', keyFacts: '' })
  const rows = presentationTimeline([{ tStartMs: 5 }], {
    slides: [],
    versions: { 0: [slide('old')], 1: [slide('edited')], 2: [] },
    events: [
      { deckVersion: 0, ordinal: 0, revision: 1, tMs: 0 },
      { deckVersion: 1, ordinal: 0, revision: 2, tMs: 5 },
      { deckVersion: 2, ordinal: null, revision: 3, tMs: 5 },
    ],
  })
  expect(rows.filter((r) => r.kind === 'slide').map((r) => r.title)).toEqual([
    'old',
    'edited',
    'Slides cleared',
  ])
  expect(rows.at(-1)?.kind).toBe('segment')
})
