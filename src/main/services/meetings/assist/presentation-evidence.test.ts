import { expect, it } from 'vitest'
import { PresentationEvidence } from './presentation-evidence'
it('resets visits, excludes delayed/crossing finals and unknown speech, and bounds whole lines', () => {
  const evidence = new PresentationEvidence()
  const final = (start: number, text: string) =>
    evidence.final({
      channel: 0,
      speaker: 0,
      role: 'user',
      tStartMs: start,
      tEndMs: start + 100,
      text,
    })
  final(0, 'old visit')
  evidence.reset(100)
  final(99, 'crosses move')
  final(100, 'new visit')
  expect(evidence.snapshot()).toEqual({ text: 'Me: new visit', incomplete: false })
  final(200, 'x'.repeat(11990))
  expect(evidence.snapshot().incomplete).toBe(true)
  expect(evidence.snapshot().text).not.toContain('new visit')
  evidence.reset(300)
  expect(evidence.snapshot()).toEqual({ text: '', incomplete: false })
})
