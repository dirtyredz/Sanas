import { expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  grounding: { resume: null as null | { name: string; text: string }, interviewProfile: '' },
  transaction: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('../../../db', () => ({ getDb: () => ({ transaction: f.transaction }) }))
vi.mock('../../../db/repos/meeting/meetings', () => ({
  getMeeting: () => ({ id: 1, title: 'Interview' }),
  applyMerge: vi.fn(),
  deleteMeeting: vi.fn(),
}))
vi.mock('../../../db/repos/meeting/meeting-grounding', () => ({
  getMeetingGrounding: () => ({
    ...f.grounding,
    hasBiography: !!f.grounding.resume || !!f.grounding.interviewProfile,
  }),
}))
vi.mock('../../../db/repos/segments', () => ({ maxSpeaker: vi.fn(), reassignSegments: vi.fn() }))
vi.mock('../../../db/repos/suggestions', () => ({
  reassignSuggestions: vi.fn(),
  shiftSuggestionContextRevisions: vi.fn(),
}))
vi.mock('../../../db/repos/speakers', () => ({ reassignSpeakerNames: vi.fn() }))
vi.mock('../../../db/repos/meeting/meeting-context', () => ({
  hasMeetingContext: vi.fn(),
  moveContextHistory: vi.fn(),
}))
vi.mock('../../../db/repos/meeting/meeting-presentation', () => ({ hasLegacySlides: vi.fn() }))
vi.mock('../status/post-processing', () => ({ isPostProcessing: () => false }))
vi.mock('../remove', () => ({ removeAudioFile: f.remove }))
import { mergeMeetings } from './merge'

it.each([
  ['resume', { resume: { name: 'Paste', text: 'Camunda' }, interviewProfile: '' }],
  ['interview profile', { resume: null, interviewProfile: 'My story' }],
])('refuses %s-bearing merges before touching rows or recordings', (_what, grounding) => {
  f.grounding = grounding
  try {
    expect(() => mergeMeetings([1, 2])).toThrow(
      'Meetings with resumes or interview profiles cannot be merged.',
    )
    expect(f.transaction).not.toHaveBeenCalled()
    expect(f.remove).not.toHaveBeenCalled()
  } finally {
    f.grounding = { resume: null, interviewProfile: '' }
  }
})
