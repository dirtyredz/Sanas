import { describe, expect, it } from 'vitest'
import { requireSlideMove, requireSlides } from './presentation-validation'
const slide = { title: 'Title', talkingPoint: 'Point', script: '', keyFacts: '' }
describe('presentation ingress', () => {
  it('normalizes optional strings and permits clearing a deck', () => {
    expect(requireSlides([])).toEqual([])
    expect(requireSlides([{ title: 'Title', talkingPoint: 'Point' }])).toEqual([slide])
  })
  it('rejects malformed content and field/count/aggregate limits', () => {
    for (const bad of [
      null,
      {},
      [null],
      [{ title: 'x' }],
      [{ ...slide, script: 9 }],
      [{ ...slide, title: '' }],
      Array(101).fill(slide),
    ])
      expect(() => requireSlides(bad)).toThrow()
    for (const [field, max] of Object.entries({
      title: 200,
      talkingPoint: 2000,
      script: 12000,
      keyFacts: 4000,
    }))
      expect(() => requireSlides([{ ...slide, [field]: 'x'.repeat(max + 1) }])).toThrow()
    expect(() => requireSlides(Array(100).fill({ ...slide, script: 'x'.repeat(12000) }))).toThrow(
      /1,000,000/,
    )
  })
  it('requires a positive meeting id and an exact direction', () => {
    expect(requireSlideMove({ meetingId: 1, direction: 'prev' })).toEqual({
      meetingId: 1,
      direction: 'prev',
    })
    for (const bad of [
      null,
      { meetingId: 0, direction: 'next' },
      { meetingId: 1, direction: 'forward' },
    ])
      expect(() => requireSlideMove(bad)).toThrow()
  })
})
