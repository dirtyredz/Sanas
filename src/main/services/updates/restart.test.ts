import { afterEach, expect, it, vi } from 'vitest'
import { createRestart, restartBlockReason } from './restart'
import { setLiveMeeting } from '../meetings/status/live-meeting'
import {
  markPostProcessing,
  clearPostProcessing,
  postProcessingCount,
} from '../meetings/status/post-processing'
afterEach(() => {
  setLiveMeeting(null)
  clearPostProcessing(10)
  clearPostProcessing(10)
  clearPostProcessing(11)
})
it('blocks missing downloads, live and paused meetings, and all outstanding writes', () => {
  expect(restartBlockReason(false)).toMatch('downloading')
  setLiveMeeting(10)
  expect(restartBlockReason(true)).toMatch('paused')
  setLiveMeeting(null)
  markPostProcessing(10)
  markPostProcessing(10)
  markPostProcessing(11)
  expect(postProcessingCount()).toBe(3)
  clearPostProcessing(10)
  clearPostProcessing(11)
  expect(restartBlockReason(true)).toMatch('processing')
  clearPostProcessing(10)
  expect(restartBlockReason(true)).toBeNull()
})
it('checks at click time, deduplicates restarts, and recovers from install failure', () => {
  const install = vi.fn().mockImplementationOnce(() => {
    throw new Error('install failed')
  })
  const restart = createRestart(install)
  setLiveMeeting(10)
  expect(() => restart.restart(true)).toThrow()
  expect(install).not.toHaveBeenCalled()
  setLiveMeeting(null)
  expect(() => restart.restart(true)).toThrow('install failed')
  restart.restart(true)
  restart.restart(true)
  expect(install).toHaveBeenCalledTimes(2)
})
