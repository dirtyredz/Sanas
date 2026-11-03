import { expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ transaction: vi.fn(), remove: vi.fn() }))
vi.mock('../../../db', () => ({ getDb: () => ({ transaction: f.transaction }) }))
vi.mock('../../../db/repos/meetings', () => ({
  getMeeting: () => ({ id: 1, title: 'Interview', resume: { name: 'Paste', text: 'Camunda' } }),
  applyMerge: vi.fn(),
  deleteMeeting: vi.fn(),
}))
vi.mock('../../../db/repos/segments', () => ({ maxSpeaker: vi.fn(), reassignSegments: vi.fn() }))
vi.mock('../../../db/repos/suggestions', () => ({ reassignSuggestions: vi.fn() }))
vi.mock('../../../db/repos/speakers', () => ({ reassignSpeakerNames: vi.fn() }))
vi.mock('../../../db/repos/meeting-context', () => ({ hasAppliedContext: vi.fn() }))
vi.mock('../../../db/repos/meeting-presentation', () => ({ hasPresentation: vi.fn() }))
vi.mock('../status/post-processing', () => ({ isPostProcessing: () => false }))
vi.mock('../remove', () => ({ removeAudioFile: f.remove }))
import { mergeMeetings } from './merge'

it('refuses resume-bearing merges before touching rows or recordings', () => {
  expect(() => mergeMeetings([1, 2])).toThrow('Meetings with resumes cannot be merged.')
  expect(f.transaction).not.toHaveBeenCalled()
  expect(f.remove).not.toHaveBeenCalled()
})
