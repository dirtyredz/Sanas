import { describe, expect, it } from 'vitest'
import { carrySpeakerNames, carryUserIdentity, type TimedSpeech } from './speaker-carryover'

const seg = (speaker: number, tStartMs: number, tEndMs: number): TimedSpeech => ({
  speaker,
  tStartMs,
  tEndMs,
})

// Live pass: S0 = me (pinned) 0-10s and 20-30s; S1 = Sarah 10-20s; S2 = Bob 30-40s.
const prevUser = [seg(0, 0, 10_000), seg(0, 20_000, 30_000)]
const prevOthers = [seg(1, 10_000, 20_000), seg(2, 30_000, 40_000)]
const names = new Map([
  [1, 'Sarah'],
  [2, 'Bob'],
])
// Batch pass re-numbered everyone, with slight boundary drift.
const next = [
  seg(2, 500, 9_800),
  seg(0, 10_200, 19_900),
  seg(2, 20_100, 29_700),
  seg(1, 30_300, 40_000),
]

describe('carryUserIdentity', () => {
  it('finds the new index the pinned voice moved to', () => {
    expect([...carryUserIdentity(prevUser, next)]).toEqual([2])
  })

  it('carries nothing when nothing was pinned', () => {
    expect(carryUserIdentity([], next).size).toBe(0)
  })

  it('requires a strict majority of the new voice to overlap the user', () => {
    // exactly half of the new voice's time was the user's → not the user
    const half = [seg(7, 0, 10_000), seg(7, 40_000, 50_000)]
    expect(carryUserIdentity(prevUser, half).size).toBe(0)
    const most = [seg(7, 0, 10_000), seg(7, 40_000, 44_000)]
    expect([...carryUserIdentity(prevUser, most)]).toEqual([7])
  })

  it('keeps every new index that batch split the user into', () => {
    const split = [seg(3, 0, 10_000), seg(4, 20_000, 30_000)]
    expect([...carryUserIdentity(prevUser, split)].sort()).toEqual([3, 4])
  })
})

describe('carrySpeakerNames', () => {
  it('re-keys names onto the indices the voices moved to', () => {
    expect([...carrySpeakerNames(prevOthers, next, names)].sort()).toEqual([
      [0, 'Sarah'],
      [1, 'Bob'],
    ])
  })

  it('follows a split voice to the side that kept most of its time', () => {
    const split = [seg(5, 10_000, 14_000), seg(6, 14_000, 20_000)]
    expect([...carrySpeakerNames(prevOthers, split, names)]).toEqual([[6, 'Sarah']])
  })

  it('gives a merged voice at most one name — the stronger claim', () => {
    // batch folded Sarah (10s) and Bob (10s) into one index; Bob overlaps it slightly more
    const merged = [seg(9, 12_000, 20_000), seg(9, 30_000, 40_000)]
    expect([...carrySpeakerNames(prevOthers, merged, names)]).toEqual([[9, 'Bob']])
  })

  it('never names a negative (user) index, even under crosstalk', () => {
    // stereo: mic speech resolves to -1; Sarah's old interval overlaps it heavily
    const crosstalk = [seg(-1, 10_000, 19_000), seg(0, 18_000, 20_000)]
    const out = carrySpeakerNames(prevOthers, crosstalk, names)
    expect(out.has(-1)).toBe(false)
    expect(out.get(0)).toBeUndefined() // only 20% of Sarah's time landed on index 0
  })

  it('ignores a name keyed to a voice that no longer exists', () => {
    expect(carrySpeakerNames(prevOthers, next, new Map([[42, 'Ghost']])).size).toBe(0)
  })
})
