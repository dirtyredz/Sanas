import { describe, expect, it } from 'vitest'
import { CONTINUATION_GRACE_MS, SILENCE_FALLBACK_MS, TurnAssembler } from './turn-assembler'
import type { TurnFinal } from './types'

// Turn-close timing evidence. It is measured only: these cases also pin that the turn's
// contents and completion policy are what they were without it.

const them = (text: string, tStartMs: number, tEndMs: number, extra: Partial<TurnFinal> = {}) => ({
  channel: 0,
  speaker: 1,
  role: 'other' as const,
  tStartMs,
  tEndMs,
  text,
  ...extra,
})

describe('turn assembly timing evidence', () => {
  it('endpoint: ingress → assembly, boundary → close and the audio-cursor proxy', () => {
    const a = new TurnAssembler()
    a.final(
      them('How do you deploy it?', 0, 1_000, { ingressAt: 9_990, audioCursorMs: 1_640 }),
      10_000,
    )
    a.boundary(0, 1_000, 'endpoint', 10_600)
    const [turn] = a.tick(10_600 + CONTINUATION_GRACE_MS)
    expect(turn).toMatchObject({ text: 'How do you deploy it?', reason: 'endpoint' })
    expect(turn.assembly).toEqual({
      ingressToAssemblyMs: 10,
      lastFinalToCloseMs: 600 + CONTINUATION_GRACE_MS,
      boundaryToCloseMs: CONTINUATION_GRACE_MS,
      timerLatenessMs: 0,
      boundarySource: 'endpoint',
      boundariesAccepted: 1,
      boundariesRejected: 0,
      completionsCancelled: 0,
      audioCursorGapMs: 640,
    })
  })

  it('utterance end and a delayed timer: lateness is measured, completion unchanged', () => {
    const a = new TurnAssembler()
    a.final(them('Any blockers?', 0, 800), 1_000)
    a.boundary(0, 800, 'utterance-end', 2_000)
    expect(a.nextDeadline()).toBe(2_000 + CONTINUATION_GRACE_MS)
    const [turn] = a.tick(2_000 + CONTINUATION_GRACE_MS + 90) // the timer fired 90 ms late
    expect(turn.reason).toBe('utterance-end')
    expect(turn.assembly).toMatchObject({
      boundarySource: 'utterance-end',
      boundaryToCloseMs: CONTINUATION_GRACE_MS + 90,
      timerLatenessMs: 90,
    })
    expect(turn.assembly?.ingressToAssemblyMs).toBeUndefined() // no ingress stamp given
  })

  it('silence fallback: measured from the last advancing receipt, not speech end', () => {
    const a = new TurnAssembler()
    a.final(them('So, the budget', 0, 900), 1_000)
    a.activity(0, 1_200, 1_400) // advancing interim
    const [turn] = a.tick(1_400 + SILENCE_FALLBACK_MS + 20)
    expect(turn.reason).toBe('silence')
    expect(turn.assembly).toMatchObject({
      lastFinalToCloseMs: 400 + SILENCE_FALLBACK_MS + 20,
      timerLatenessMs: 20,
    })
    expect(turn.assembly?.boundaryToCloseMs).toBeUndefined()
  })

  it('counts stale and duplicate boundaries and cancelled completions', () => {
    const a = new TurnAssembler()
    a.final(them('First part', 0, 1_000), 1_000)
    a.boundary(0, 1_000, 'endpoint', 1_600)
    a.boundary(0, 1_000, 'utterance-end', 1_650) // already scheduled
    a.activity(0, 1_800, 1_700) // speech beyond the boundary cancels it
    a.boundary(0, 500, 'endpoint', 1_710) // older than speech seen
    a.final(them('and the rest?', 1_400, 2_400), 2_500)
    a.boundary(0, 2_400, 'endpoint', 3_100)
    a.boundary(0, 2_400, 'endpoint', 3_120)
    const [turn] = a.tick(3_100 + CONTINUATION_GRACE_MS)
    expect(turn.text).toBe('First part and the rest?')
    expect(turn.assembly).toMatchObject({
      boundariesAccepted: 2,
      boundariesRejected: 3,
      completionsCancelled: 1,
      boundaryToCloseMs: CONTINUATION_GRACE_MS,
    })
  })

  it('a speaker change closes without boundary or lateness evidence', () => {
    const a = new TurnAssembler()
    a.final(them('Over to you', 0, 700), 1_000)
    const { completed } = a.final(them('Thanks', 900, 1_300, { speaker: 2 }), 1_300)
    expect(completed[0].reason).toBe('speaker-change')
    expect(completed[0].assembly).toEqual({
      lastFinalToCloseMs: 300,
      boundariesAccepted: 0,
      boundariesRejected: 0,
      completionsCancelled: 0,
    })
  })
})
