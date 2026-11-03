import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../../db/repos/meeting/meetings', () => ({ moveMeetingToJob: vi.fn() }))
import { moveMeetingToJob } from '../../../db/repos/meeting/meetings'
import { setLiveMeeting } from './live-meeting'
import { fileMeeting } from './filing'
afterEach(() => {
  setLiveMeeting(null)
  vi.clearAllMocks()
})
it.each(['live', 'paused'])('rejects filing a %s meeting without changing its job', () => {
  setLiveMeeting(7)
  expect(() => fileMeeting(7, 9)).toThrow('End this meeting')
  expect(moveMeetingToJob).not.toHaveBeenCalled()
})
it('files ended meetings', () => {
  fileMeeting(7, 9)
  expect(moveMeetingToJob).toHaveBeenCalledWith(7, 9)
})
