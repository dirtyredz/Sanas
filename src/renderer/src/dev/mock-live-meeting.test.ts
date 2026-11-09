import { afterEach, expect, it, vi } from 'vitest'
import {
  getMeetingState,
  pauseScript,
  pinSpeaker,
  resumeScript,
  startScript,
  stopScript,
} from './mock-live-meeting'

afterEach(() => {
  stopScript()
  vi.clearAllTimers()
  vi.useRealTimers()
})
it('previews main-owned pins and fresh IDs/reconfirmation on resume', async () => {
  vi.useFakeTimers()
  startScript(7, 1)
  await vi.advanceTimersByTimeAsync(800)
  expect(getMeetingState().speakerIdentity?.currentSpeakerIds).toEqual([0])
  pinSpeaker(0, true)
  pauseScript()
  resumeScript()
  expect(getMeetingState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
  await vi.advanceTimersByTimeAsync(600)
  expect(getMeetingState().speakerIdentity?.currentSpeakerIds).toEqual([3])
  pinSpeaker(0, true)
  expect(getMeetingState().speakerIdentity?.identityNeedsConfirmation).toBe(true)
  pinSpeaker(3, true)
  expect(getMeetingState().speakerIdentity?.identityNeedsConfirmation).toBe(false)
  expect(getMeetingState().speakerIdentity?.selectedSpeakerIds).toEqual([0, 3])
})
