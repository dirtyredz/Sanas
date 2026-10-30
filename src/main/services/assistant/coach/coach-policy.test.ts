import { describe, expect, it } from 'vitest'
import { COACH_COOLDOWN_MS, CoachPolicy, EPISODE_SILENCE_MS, PAUSE_MS } from './coach-policy'

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

/** One user final of `n` words covering [startMs, endMs) of audio. */
function say(p: CoachPolicy, startMs: number, endMs: number, n: number, now: number): void {
  p.userFinal({ tStartMs: startMs, tEndMs: endMs, text: words(n) }, now)
}

describe('coach policy', () => {
  it('is off unless enabled', () => {
    const p = new CoachPolicy()
    say(p, 0, 25_000, 60, 0)
    expect(p.decide(0, false)).toBeNull()
    expect(p.decide(0, true)).toBe('long')
  })

  it('fires on a long explanation inside one unfinished turn', () => {
    const p = new CoachPolicy()
    say(p, 0, 10_000, 25, 0)
    expect(p.decide(0, true)).toBeNull()
    say(p, 10_000, 20_000, 20, 1_000)
    expect(p.decide(1_000, true)).toBe('long')
  })

  it('accumulates consecutive own turns into one episode', () => {
    const p = new CoachPolicy()
    say(p, 0, 9_000, 20, 0)
    p.userTurnCompleted(500)
    say(p, 10_000, 21_000, 25, 2_000)
    expect(p.decide(2_000, true)).toBe('long')
  })

  it('fires on a pause after a medium explanation once the turn completed', () => {
    const p = new CoachPolicy()
    say(p, 0, 9_000, 22, 0)
    expect(p.decide(PAUSE_MS, true)).toBeNull() // turn not completed yet
    p.userTurnCompleted(400)
    expect(p.decide(PAUSE_MS - 1, true)).toBeNull()
    expect(p.decide(PAUSE_MS, true)).toBe('pause')
  })

  it('ignores short acknowledgements', () => {
    const p = new CoachPolicy()
    say(p, 0, 600, 1, 0)
    p.userTurnCompleted(100)
    expect(p.decide(5_000, true)).toBeNull()
  })

  it('measures speaking time as the union of intervals', () => {
    const p = new CoachPolicy()
    // the same 6 s of audio delivered twice and an overlap: union is 7 s, not 18 s
    say(p, 0, 6_000, 10, 0)
    say(p, 0, 6_000, 10, 10)
    say(p, 5_000, 7_000, 5, 20)
    p.userTurnCompleted(30)
    expect(p.decide(30 + PAUSE_MS, true)).toBeNull() // 7 s < 8 s pause threshold
    say(p, 7_500, 8_600, 2, 40) // gap 7.0–7.5 s does not count: union is now 8.1 s
    p.userTurnCompleted(50)
    expect(p.decide(50 + PAUSE_MS, true)).toBe('pause')
  })

  it('needs new content and the cooldown before another attempt', () => {
    const p = new CoachPolicy()
    say(p, 0, 21_000, 45, 0)
    expect(p.decide(0, true)).toBe('long')
    p.attempted(0)
    say(p, 21_000, 30_000, 25, 5_000)
    expect(p.decide(5_000, true)).toBeNull() // cooldown
    expect(p.decide(COACH_COOLDOWN_MS, true)).toBeNull() // episode went silent past 8 s
    say(p, 30_000, 40_000, 25, COACH_COOLDOWN_MS + 1)
    expect(p.decide(COACH_COOLDOWN_MS + 1, true)).toBeNull() // new episode too short
  })

  it('does not repeat during silence after an attempt', () => {
    const p = new CoachPolicy()
    say(p, 0, 21_000, 45, 0)
    p.attempted(0)
    p.userTurnCompleted(100)
    // still inside the episode window, cooldown over, but nothing new was said
    for (const t of [PAUSE_MS, 4_000, 7_000]) expect(p.decide(t, true)).toBeNull()
  })

  it('ends the episode after 8 s of silence', () => {
    const p = new CoachPolicy()
    say(p, 0, 21_000, 45, 0)
    expect(p.decide(EPISODE_SILENCE_MS + 1, true)).toBeNull()
  })

  it('ends the episode when another speaker takes the floor or identity is unknown', () => {
    const p = new CoachPolicy()
    say(p, 0, 15_000, 30, 0)
    p.endEpisode()
    say(p, 16_000, 22_000, 15, 100)
    expect(p.decide(100, true)).toBeNull() // only the new 6 s / 15 words count
  })

  it('blocks the pause path on ambiguous activity until transcript evidence returns', () => {
    const p = new CoachPolicy()
    say(p, 0, 9_000, 22, 0)
    p.userTurnCompleted(100)
    p.ambiguousActivity(200)
    expect(p.decide(5_000, true)).toBeNull()
    say(p, 9_500, 10_000, 1, 5_100)
    p.userTurnCompleted(5_200)
    expect(p.decide(5_100 + PAUSE_MS, true)).toBe('pause')
  })

  it('schedules its next check at the pause threshold', () => {
    const p = new CoachPolicy()
    expect(p.nextCheckAt(0)).toBeNull()
    say(p, 0, 9_000, 22, 1_000)
    expect(p.nextCheckAt(1_000)).toBe(1_000 + PAUSE_MS)
  })
})
