import { expect, it } from 'vitest'
import { presentationTranscript } from './history'
it('keeps active excerpt marker and trailing moves, using only titles rather than scripts', () => {
  const slides = ['one', 'two'].map((title) => ({
    title,
    talkingPoint: 'prepared point',
    script: 'UNSPOKEN_SCRIPT',
    keyFacts: '',
  }))
  const history = {
    slides,
    events: [
      { ordinal: 0, revision: 1, tMs: 0 },
      { ordinal: 1, revision: 2, tMs: 100 },
    ],
  }
  const result = presentationTranscript(
    [{ speaker: 0, isUser: true, text: 'Actual words', tStartMs: 50 }],
    history,
    1000,
  )
  expect(result).toContain('Slide 1 — one')
  expect(result).toContain('Slide 2 — two')
  expect(result).toContain('Actual words')
  expect(result).not.toContain('UNSPOKEN_SCRIPT')
})
