import { expect, it } from 'vitest'
import { newerContext } from './meeting-context-state'
it('rejects stale hydration and another meeting', () => {
  const current = {
    meetingId: 1,
    revision: 2,
    deckVersion: 1,
    text: 'new',
    slides: [],
    initialSlides: [],
  }
  expect(newerContext(current, { ...current, revision: 0 }, 1)).toBe(current)
  expect(newerContext(current, { ...current, meetingId: 2 }, 1)).toBe(current)
  expect(newerContext(current, { ...current, revision: 3 }, 1)?.revision).toBe(3)
})
