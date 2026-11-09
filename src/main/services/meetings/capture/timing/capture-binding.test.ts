import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CAPTURE_PROBE_MS, type CaptureProbe } from '@shared/meeting/audio-capture'
import { CaptureBinding } from './capture-binding'

const frame = (sequence: number, generation = 'g', startFrame = sequence * 1600) => ({
  generation,
  sequence,
  startFrame,
  endFrame: startFrame + 1600,
  sourceEndFrame: (startFrame + 1600) * 3,
  sourceRate: 48000,
  channels: 1 as const,
  pcm: new ArrayBuffer(3200),
})

const onLoss = vi.fn()
const onDiscontinuity = vi.fn()
const make = () => new CaptureBinding({ onLoss, onDiscontinuity })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  onLoss.mockClear()
  onDiscontinuity.mockClear()
})
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

it('binds one generation at a time and probes on the interval once accepted audio exists', () => {
  const b = make()
  const probes: CaptureProbe[] = []
  expect(b.bind('g', 1, 0, (p) => probes.push(p))).toBe(true)
  expect(b.bind('other', 1, 0, () => {})).toBe(false)
  vi.advanceTimersByTime(CAPTURE_PROBE_MS)
  expect(probes).toEqual([]) // no accepted frame yet: nothing to bracket
  expect(b.accept(frame(0), 0)).toBe(true)
  vi.advanceTimersByTime(CAPTURE_PROBE_MS)
  expect(probes).toEqual([{ generation: 'g', nonce: 1 }])
  b.retire()
})

it('rejects stale-generation frames and reports a discontinuity once', () => {
  const b = make()
  expect(b.accept(frame(0), 0)).toBe(false) // unbound
  b.bind('g', 1, 0, () => {})
  expect(b.accept(frame(0, 'old'), 0)).toBe(false)
  expect(b.accept(frame(0), 0)).toBe(true)
  expect(b.accept(frame(5), 0)).toBe(false) // sequence gap
  expect(onDiscontinuity).toHaveBeenCalledOnce()
  b.retire()
})

it('a probe callback that throws invalidates calibration instead of escaping', () => {
  const b = make()
  b.bind('g', 1, 0, () => {
    throw new Error('renderer gone')
  })
  b.accept(frame(0), 0)
  expect(() => vi.advanceTimersByTime(CAPTURE_PROBE_MS)).not.toThrow()
  expect(b.endpoint(0, 0)).toMatchObject({ status: 'unavailable' })
  b.retire()
})

it('stop and invalid metadata act only for the bound generation and notify loss', () => {
  const b = make()
  b.bind('g', 1, 0, () => {})
  b.stop('old')
  b.invalidMetadata('old')
  expect(onLoss).not.toHaveBeenCalled()
  b.invalidMetadata('g')
  expect(onLoss).toHaveBeenCalledTimes(1)
  expect(b.endpoint(0, 0)).toEqual({ status: 'unavailable', reason: 'missing-metadata' })
  b.stop('g')
  expect(onLoss).toHaveBeenCalledTimes(2)
  expect(b.accept(frame(1), 0)).toBe(false) // retired: later frames are stale
  expect(b.bind('next', 1, 0, () => {})).toBe(true) // and a successor can bind
  b.retire()
})

it('retire silently clears the interval and the binding', () => {
  const b = make()
  b.bind('g', 1, 0, () => {})
  b.retire()
  expect(vi.getTimerCount()).toBe(0)
  expect(onLoss).not.toHaveBeenCalled()
})
