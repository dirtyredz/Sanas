import { expect, it } from 'vitest'
import { SpeakerSession } from './speaker-session'

it('isolates reused raw indices and retains historical pins across reconnect and resume', () => {
  const speakers = new SpeakerSession()
  const old = speakers.map(0)
  speakers.pin(old, true)
  speakers.resetConnection()
  const next = speakers.map(0)
  expect(next).not.toBe(old)
  expect(speakers.status().selectedSpeakerIds.includes(next)).toBe(false)
  expect(speakers.status().identityNeedsConfirmation).toBe(true)
  speakers.pin(old, false)
  speakers.pin(old, true)
  expect(speakers.status().identityNeedsConfirmation).toBe(true)
  speakers.pin(next, true)
  expect(speakers.status()).toEqual({
    identityNeedsConfirmation: false,
    currentSpeakerIds: [next],
    selectedSpeakerIds: [old, next],
  })
  speakers.resetConnection()
  expect(speakers.map(0)).not.toBe(next)
  expect(speakers.map(-1)).toBe(-1)
  expect(() => speakers.pin(999, true)).toThrow()
  expect(() => speakers.pin(-1, true)).toThrow()
  speakers.clear()
  expect(speakers.map(0)).toBe(0)
  expect(speakers.status().identityNeedsConfirmation).toBe(false)
})
