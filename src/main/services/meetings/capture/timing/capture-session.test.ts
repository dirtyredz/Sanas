import { expect, it } from 'vitest'
import { CaptureTimingSession } from './capture-session'
import type { CaptureFrame } from '@shared/meeting/audio-capture'

const frame = (
  sequence: number,
  startFrame = sequence * 1600,
  channels: 1 | 2 = 1,
): CaptureFrame => ({
  generation: 'g',
  sequence,
  startFrame,
  endFrame: startFrame + 1600,
  sourceEndFrame: (startFrame + 1600) * 3,
  sourceRate: 48000,
  channels,
  pcm: new ArrayBuffer(1600 * channels * 2),
})

it.each([1, 2] as const)(
  'rebases accepted %i-channel samples after pre-start drops and resume offsets',
  (channels) => {
    const s = new CaptureTimingSession()
    expect(s.accept(frame(0, 0, channels), 0)).toBe('stale')
    s.bind('g', channels, 1000)
    s.accept(frame(5, 8000, channels), 100)
    const first = s.probe(110)!
    s.reply(
      { ...first, outputFrame: 9600, sourceFrame: 28800, sourceRate: 48000, quantumFrames: 128 },
      160,
    )
    s.accept(frame(6, 9600, channels), 200)
    const next = s.probe(210)!
    s.reply(
      { ...next, outputFrame: 11200, sourceFrame: 33600, sourceRate: 48000, quantumFrames: 128 },
      250,
    )
    expect(s.endpoint(1150, 260)).toEqual({ status: 'valid', lowerMs: 107, upperMs: 250 })
    s.invalidate('reset')
    expect(s.endpoint(1150, 270)).toEqual({ status: 'unavailable', reason: 'reset' })
    // A later STT receipt cannot refresh old capture anchors.
    expect(s.endpoint(1150, 5000).status).toBe('unavailable')
    s.stop()
    s.bind('resumed', channels, 1200)
    expect(s.accept(frame(7, 11200, channels), 5001)).toBe('stale')
  },
)

it('rejects duplicate, skipped and reordered capture; allows only one outstanding nonce', () => {
  const s = new CaptureTimingSession()
  s.bind('g', 1, 0)
  expect(s.bind('late', 1, 0)).toBe(false)
  s.accept(frame(0), 0)
  const old = s.probe(10)!
  expect(s.probe(2009)).toBeUndefined()
  const fresh = s.probe(2010)!
  expect(fresh.nonce).not.toBe(old.nonce)
  s.reply(
    { ...old, outputFrame: 1600, sourceFrame: 4800, sourceRate: 48000, quantumFrames: 128 },
    2020,
  )
  expect(s.endpoint(100, 2020)).toEqual({ status: 'unavailable', reason: 'probe-timeout' })
  expect(s.accept(frame(0), 2030)).toBe('discontinuity')
  expect(s.accept(frame(2), 2040)).toBe('discontinuity')
})

it('ignores retired replies and does not establish zero from a probe', () => {
  const s = new CaptureTimingSession()
  s.bind('g', 1, 0)
  expect(s.probe(0)).toBeUndefined()
  expect(s.endpoint(0, 0)).toEqual({ status: 'unavailable', reason: 'missing-metadata' })
  s.accept(frame(0), 10)
  const p = s.probe(20)!
  s.invalidate('reset')
  s.reply({ ...p, outputFrame: 1600, sourceFrame: 4800, sourceRate: 48000, quantumFrames: 128 }, 30)
  expect(s.endpoint(100, 30)).toEqual({ status: 'unavailable', reason: 'reset' })
})
