import { expect, it } from 'vitest'
import { acceptPresentation, EMPTY_PRESENTATION } from './presentation-state'
it('rejects stale revisions and other meetings', () => {
  const state = { ...EMPTY_PRESENTATION, meetingId: 1, revision: 3 }
  expect(acceptPresentation(state, { ...state, revision: 2 }, 1)).toBe(state)
  expect(acceptPresentation(state, { ...state, meetingId: 2 }, 1)).toBe(state)
  expect(acceptPresentation(state, { ...state, revision: 4 }, 1).revision).toBe(4)
})
