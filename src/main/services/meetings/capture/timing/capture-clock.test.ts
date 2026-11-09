import { expect, it } from 'vitest'
import { CaptureClock } from './capture-clock'

it('brackets a known 16 kHz WAV endpoint with asymmetric transport, without extrapolation', () => {
  const clock = new CaptureClock()
  clock.add(1600, 100, 130, 3)
  clock.add(5600, 350, 440, 3)
  expect(clock.endpoint(3200, 450)).toEqual({ status: 'valid', lowerMs: 97, upperMs: 440 })
  expect(clock.endpoint(6000, 450)).toEqual({ status: 'unavailable', reason: 'outside-history' })
  expect(clock.endpoint(3200, 31000).status).toBe('unavailable')
})

it('rejects wide brackets, duplicates and resets; never assumes symmetric delays', () => {
  const clock = new CaptureClock()
  clock.add(0, 10, 100, 3)
  clock.add(16000, 1010, 1200, 3)
  expect(clock.endpoint(8000, 1200)).toEqual({ status: 'unavailable', reason: 'wide-interval' })
  clock.invalidate('reset')
  expect(clock.endpoint(8000, 1200)).toEqual({ status: 'unavailable', reason: 'reset' })
})

it('enforces the one-second width and thirty-second retention boundaries', () => {
  const clock = new CaptureClock()
  clock.add(0, 1, 1, 0)
  clock.add(16000, 1001, 1001, 0)
  expect(clock.endpoint(8000, 30001)).toEqual({ status: 'valid', lowerMs: 1, upperMs: 1001 })
  expect(clock.endpoint(8000, 30002)).toEqual({ status: 'unavailable', reason: 'outside-history' })
  const stalled = new CaptureClock()
  stalled.add(0, 1, 1, 0)
  stalled.add(16000, 1001, 1002, 0)
  expect(stalled.endpoint(8000, 1002)).toEqual({ status: 'unavailable', reason: 'wide-interval' })
})
