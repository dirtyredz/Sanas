import { describe, expect, it } from 'vitest'
import { CaptureHealth, MIC_ACTIVE_PEAK } from './capture-health'

const RATE = 16_000

/** `ms` of interleaved stereo PCM: ch0 = mic, ch1 = system audio. */
function stereo(ms: number, mic: (i: number) => number, system: (i: number) => number): Buffer {
  const frames = Math.round((ms / 1000) * RATE)
  const buf = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(mic(i), i * 4)
    buf.writeInt16LE(system(i), i * 4 + 2)
  }
  return buf
}

const speech = (i: number): number => Math.round(4_000 * Math.sin(i / 7))
const quietHiss = (i: number): number => (i % 2 === 0 ? 3 : -3)
const zero = (): number => 0

/** Feeds `totalMs` in 100 ms chunks; returns every reported change with its audio time. */
function feed(
  h: CaptureHealth,
  totalMs: number,
  mic: (i: number) => number,
  system: (i: number) => number,
  startMs = 0,
): [number, boolean][] {
  const changes: [number, boolean][] = []
  for (let t = 100; t <= totalMs; t += 100) {
    const c = h.push(stereo(100, mic, system), 2)
    if (c !== null) changes.push([startMs + t, c])
  }
  return changes
}

describe('capture health', () => {
  it('warns after ~5 s of exact-zero system audio while the mic hears speech', () => {
    const h = new CaptureHealth()
    expect(feed(h, 8_000, speech, zero)).toEqual([[5_000, true]])
    expect(h.warned).toBe(true)
  })

  it('does not warn while system audio carries any signal, however quiet', () => {
    const h = new CaptureHealth()
    expect(feed(h, 20_000, speech, quietHiss)).toEqual([])
  })

  it('does not warn when the mic is silent too (nobody is talking)', () => {
    const h = new CaptureHealth()
    expect(feed(h, 20_000, (i) => (i % 2 ? MIC_ACTIVE_PEAK - 1 : 0), zero)).toEqual([])
  })

  it('clears only after sustained system activity', () => {
    const h = new CaptureHealth()
    feed(h, 6_000, speech, zero)
    // a blip shorter than the recovery window does not clear it
    expect(feed(h, 500, speech, speech)).toEqual([])
    expect(feed(h, 100, speech, zero)).toEqual([])
    expect(feed(h, 1_000, speech, speech)).toEqual([[1_000, false]])
  })

  it('ignores mono capture', () => {
    const h = new CaptureHealth()
    const mono = Buffer.alloc(RATE * 2 * 10) // 10 s of silence-only mono
    expect(h.push(mono, 1)).toBeNull()
    expect(h.warned).toBe(false)
  })

  it('starts over on reset (start / resume)', () => {
    const h = new CaptureHealth()
    feed(h, 4_000, speech, zero)
    h.reset()
    expect(feed(h, 4_000, speech, zero)).toEqual([]) // only 4 s since the reset
    expect(feed(h, 1_000, speech, zero)).toEqual([[1_000, true]])
  })

  it('never modifies the audio it inspects', () => {
    const h = new CaptureHealth()
    const chunk = stereo(100, speech, zero)
    const copy = Buffer.from(chunk)
    h.push(chunk, 2)
    expect(chunk.equals(copy)).toBe(true)
  })
})
