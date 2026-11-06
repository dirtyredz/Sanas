import { describe, expect, it } from 'vitest'
import { CHECK_MS, FLOW_WINDOW_MS, ResultWatchdog, STALL_MS } from './deepgram-watchdog'

// A manual clock: tick() advances time and runs the interval like a timer would.
function rig() {
  let t = 1_000
  let fn: (() => void) | null = null
  let stalls = 0
  const wd = new ResultWatchdog({
    now: () => t,
    setInterval: (f) => {
      fn = f
      return 1
    },
    clearInterval: () => {
      fn = null
    },
    onStall: () => stalls++,
  })
  const advance = (ms: number, each?: () => void): void => {
    for (let spent = 0; spent < ms; spent += CHECK_MS) {
      t += CHECK_MS
      each?.()
      fn?.()
    }
  }
  return { wd, advance, stalls: () => stalls, armed: () => fn !== null }
}

describe('ResultWatchdog', () => {
  it('does nothing before any audio is sent', () => {
    const r = rig()
    expect(r.armed()).toBe(false)
    r.advance(30_000)
    expect(r.stalls()).toBe(0)
  })

  it('fires once when audio flows for STALL_MS without results', () => {
    const r = rig()
    r.wd.audioSent()
    r.advance(STALL_MS + 5_000, () => r.wd.audioSent())
    expect(r.stalls()).toBe(1)
    expect(r.armed()).toBe(false)
  })

  it('stays quiet while results keep arriving', () => {
    const r = rig()
    r.wd.audioSent()
    r.advance(40_000, () => {
      r.wd.audioSent()
      r.wd.results()
    })
    expect(r.stalls()).toBe(0)
  })

  it('does not fire when audio stopped flowing', () => {
    const r = rig()
    r.wd.audioSent()
    r.advance(60_000)
    expect(r.stalls()).toBe(0)
  })

  it('gives resumed audio a fresh STALL_MS after a capture gap', () => {
    const r = rig()
    r.wd.audioSent()
    r.advance(20_000) // capture inactive
    r.wd.audioSent() // resumes
    r.advance(STALL_MS - CHECK_MS, () => r.wd.audioSent())
    expect(r.stalls()).toBe(0)
    r.advance(2 * CHECK_MS, () => r.wd.audioSent())
    expect(r.stalls()).toBe(1)
  })

  it('treats a gap just inside the flow window as continuous', () => {
    const r = rig()
    r.wd.audioSent()
    r.advance(FLOW_WINDOW_MS)
    r.wd.audioSent()
    r.advance(STALL_MS - FLOW_WINDOW_MS, () => r.wd.audioSent())
    expect(r.stalls()).toBe(1)
  })

  it('stop is idempotent and silences everything', () => {
    const r = rig()
    r.wd.audioSent()
    r.wd.stop()
    r.wd.stop()
    r.wd.audioSent() // ignored after stop
    r.advance(30_000, () => r.wd.audioSent())
    expect(r.stalls()).toBe(0)
  })
})
