import { describe, expect, it } from 'vitest'
import type { CompletedTurn } from '../../turns/types'
import { observeAssistance, type AssistDiagnostic } from '../observation/diagnostics'
import { LatencyTracker, observeLatency } from './latency'
import { observeRun } from '../observation/run-observation'

const SECRET = 'Sarah: our secret project Falcon costs $4M'

const turn = (id: number, completedAt: number): CompletedTurn => ({
  id,
  channel: 1,
  speaker: 2,
  role: 'other',
  text: SECRET,
  startMs: 0,
  endMs: 1_000,
  words: 8,
  fragments: 1,
  completedAt,
  reason: 'endpoint',
  assembly: {
    lastFinalToCloseMs: 750,
    boundaryToCloseMs: 150,
    timerLatenessMs: 0,
    boundarySource: 'endpoint',
    boundariesAccepted: 1,
    boundariesRejected: 0,
    completionsCancelled: 0,
    ingressToAssemblyMs: 2,
    audioCursorGapMs: 640,
  },
})

/** One speculative answer for candidate `id`, promoted, with a hostile visible event. */
function answer(t: LatencyTracker, id: number, at: number, verdict = 'question room'): void {
  const c = turn(id, at)
  t.assist({ event: 'turn-completed', turn: c, at })
  t.assist({ event: 'classifier-started', turn: c, attempt: id, at })
  t.run({
    kind: 'begin',
    id,
    meetingId: 1,
    purpose: 'answer',
    trigger: 'ambient',
    spans: [c],
    speculative: true,
    at,
  })
  t.assist({ event: 'speculation-started', turn: c, suggestionId: id, at })
  t.run({ kind: 'first-text', id, meetingId: 1, at: at + 700 })
  t.assist({
    event: 'classified',
    turn: c,
    reason: verdict,
    accepted: verdict !== 'none',
    attempt: id,
    at: at + 1_200,
  })
  t.run({ kind: 'promoted', id, meetingId: 1, at: at + 1_200 })
  t.run({
    kind: 'visible',
    event: {
      meetingId: 1,
      suggestionId: id,
      trigger: 'ambient',
      purpose: 'answer',
      kind: 'delta',
      text: SECRET,
    },
  })
  t.run({ kind: 'first-readable', id, meetingId: 1, at: at + 1_200 })
  t.run({
    kind: 'usage',
    id,
    meetingId: 1,
    usage: { inputCount: 100, cacheReadCount: 3_000, outputCount: 40, partial: false },
  })
  t.run({ kind: 'settled', id, meetingId: 1, outcome: 'done', at: at + 2_000 })
}

describe('latency tracker', () => {
  it('correlates candidate, classifier and run into one redacted record', () => {
    const logged: string[] = []
    const t = new LatencyTracker((r) => logged.push(JSON.stringify(r)))
    answer(t, 1, 10_000)
    expect(t.records()).toEqual([
      expect.objectContaining({
        kind: 'run',
        candidateId: 1,
        attemptId: 1,
        runId: 1,
        path: 'speculative',
        verdict: 'question room',
        classifierMs: 1_200,
        closeToFirstTextMs: 700,
        closeToPromotionMs: 1_200,
        closeToFirstReadableMs: 1_200,
        lastFinalToFirstReadableMs: 1_950,
        usage: { inputCount: 100, cacheReadCount: 3_000, outputCount: 40, partial: false },
      }),
    ])
    expect(logged).toHaveLength(1)
    // nothing text-bearing survives: not the turn, not the broadcast
    expect(logged[0]).not.toMatch(/Sarah|secret|Falcon|\$4M/)
  })

  it('replaces usage rather than adding a later report to an earlier one', () => {
    const t = new LatencyTracker()
    t.run({
      kind: 'begin',
      id: 9,
      meetingId: 1,
      purpose: 'answer',
      trigger: 'hotkey',
      spans: [],
      at: 0,
    })
    t.run({ kind: 'usage', id: 9, meetingId: 1, usage: { outputCount: 5, partial: true } })
    t.run({ kind: 'usage', id: 9, meetingId: 1, usage: { outputCount: 40, partial: false } })
    t.run({ kind: 'settled', id: 9, meetingId: 1, outcome: 'done', at: 10 })
    expect(t.records()[0]).toMatchObject({
      path: 'manual',
      classification: 'n/a',
      usage: { outputCount: 40, partial: false },
    })
  })

  it('stays bounded and counts what it dropped', () => {
    const t = new LatencyTracker()
    for (let i = 1; i <= 230; i++) answer(t, i, i * 10_000)
    expect(t.records()).toHaveLength(200)
    expect(t.overflow).toBe(30)
    // open entries are capped too
    for (let i = 1_000; i < 1_100; i++)
      t.assist({ event: 'turn-completed', turn: turn(i, 0), at: 0 })
    expect(t.overflow).toBe(30 + 36)
  })

  it('finishes a candidate as soon as the typed accepted flag is false', () => {
    const t = new LatencyTracker()
    const c = turn(1, 0)
    t.assist({ event: 'turn-completed', turn: c, at: 0 })
    t.assist({ event: 'classified', turn: c, reason: 'timeout', accepted: false, at: 5 })
    expect(t.records()).toEqual([
      expect.objectContaining({ kind: 'candidate', verdict: 'timeout' }),
    ])
  })

  it('takes the discard category from the event, not from the reason text', () => {
    const t = new LatencyTracker()
    answer(t, 1, 0)
    const discard = (e: Partial<AssistDiagnostic>): void =>
      t.assist({ event: 'speculation-discarded', suggestionId: 2, ...e })
    t.run({
      kind: 'begin',
      id: 2,
      meetingId: 1,
      purpose: 'answer',
      trigger: 'ambient',
      spans: [],
      speculative: true,
      at: 0,
    })
    discard({ reason: 'whatever', discard: 'overtaken' })
    t.run({ kind: 'settled', id: 2, meetingId: 1, outcome: 'discarded', at: 1 })
    expect(t.records()[1]).toMatchObject({ discard: 'overtaken' })
  })

  it('observeLatency owns both subscriptions and summarizes', () => {
    const logged: string[] = []
    const latency = observeLatency((r) => logged.push(r.kind))
    const t = latency.tracker
    expect(t.records()).toEqual([])
    const c = turn(1, 0)
    observeAssistance({ event: 'turn-completed', turn: c, at: 0 })
    observeAssistance({ event: 'classified', turn: c, reason: 'none', accepted: false, at: 5 })
    observeRun({
      kind: 'begin',
      id: 3,
      meetingId: 1,
      purpose: 'answer',
      trigger: 'hotkey',
      spans: [],
      at: 0,
    })
    observeRun({ kind: 'settled', id: 3, meetingId: 1, outcome: 'done', at: 9 })
    expect(logged).toEqual(['candidate', 'run'])
    expect(latency.summary()).toMatchObject({ records: 2, overflow: 0 })
    latency.stop()
    observeAssistance({ event: 'turn-completed', turn: turn(2, 0), at: 0 })
    observeAssistance({
      event: 'classified',
      turn: turn(2, 0),
      reason: 'none',
      accepted: false,
      at: 5,
    })
    expect(t.records()).toHaveLength(2)
  })

  it('an observer failure never escapes', () => {
    const t = new LatencyTracker(() => {
      throw new Error('log failed')
    })
    expect(() => answer(t, 1, 0)).not.toThrow()
  })
})

describe('turned-down candidates', () => {
  it('records the terminal verdict even if provider failure settled before classification', () => {
    const t = new LatencyTracker()
    const c = turn(1)
    t.assist({ event: 'turn-completed', turn: c, at: 0 })
    t.run({
      kind: 'begin',
      id: 9,
      meetingId: 1,
      purpose: 'answer',
      trigger: 'ambient',
      spans: [],
      speculative: true,
      at: 1,
    })
    t.assist({ event: 'speculation-started', turn: c, suggestionId: 9 })
    t.run({ kind: 'settled', id: 9, meetingId: 1, outcome: 'discarded', at: 3 })
    t.assist({ event: 'classified', turn: c, reason: 'none', accepted: false, at: 5 })
    expect(t.records().filter((r) => r.candidateTerminal)).toEqual([
      expect.objectContaining({ candidateId: 1, verdict: 'none' }),
    ])
    expect(t.records()).toHaveLength(2)
  })

  it('keeps both runs linked when fallback finishes before the cancelled speculation settles', () => {
    const t = new LatencyTracker()
    const c = turn(1)
    t.assist({ event: 'turn-completed', turn: c, at: 0 })
    for (const id of [9, 10]) {
      t.run({
        kind: 'begin',
        id,
        meetingId: 1,
        purpose: 'answer',
        trigger: 'ambient',
        spans: [],
        at: 1,
      })
      t.assist({
        event: id === 9 ? 'speculation-started' : 'answer-started',
        turn: c,
        suggestionId: id,
        reason: 'ordinary',
      })
    }
    t.run({ kind: 'settled', id: 10, meetingId: 1, outcome: 'done', at: 4 })
    t.run({ kind: 'settled', id: 9, meetingId: 1, outcome: 'discarded', at: 5 })
    expect(t.records().map((r) => r.candidateId)).toEqual([1, 1])
    expect(t.records().filter((r) => r.candidateTerminal)).toHaveLength(1)
  })
  it('retains rejection identity until the speculative run settles, without duplicate terminal records', () => {
    const t = new LatencyTracker()
    const c = turn(1)
    t.assist({ event: 'turn-completed', turn: c, at: 0 })
    t.run({
      kind: 'begin',
      id: 9,
      meetingId: 1,
      purpose: 'answer',
      trigger: 'ambient',
      spans: [],
      speculative: true,
      at: 1,
    })
    t.assist({ event: 'speculation-started', turn: c, suggestionId: 9 })
    t.assist({ event: 'classified', turn: c, reason: 'none', accepted: false, at: 5 })
    expect(t.records()).toHaveLength(0)
    t.run({ kind: 'settled', id: 9, meetingId: 1, outcome: 'discarded', at: 6 })
    t.assist({ event: 'invalidated', turn: c, turnedDown: 'invalidated' })
    expect(t.records()).toEqual([
      expect.objectContaining({ candidateId: 1, runId: 9, verdict: 'none', turnedDown: 'unknown' }),
    ])
    expect(t.overflow).toBe(0)
  })

  it('does not label an omitted terminal category as policy', () => {
    const t = new LatencyTracker()
    const c = turn(1)
    t.assist({ event: 'turn-completed', turn: c })
    t.assist({ event: 'not-generated', turn: c })
    expect(t.records()[0]).toMatchObject({ turnedDown: 'unknown' })
  })
  const turn = (id: number): CompletedTurn =>
    ({
      id,
      channel: 1,
      speaker: 2,
      role: 'other',
      text: 'x',
      startMs: 0,
      endMs: 1,
      words: 1,
      fragments: 1,
      completedAt: 0,
      reason: 'endpoint',
    }) as CompletedTurn

  const accepted = (t: LatencyTracker, id: number): void => {
    const c = turn(id)
    t.assist({ event: 'turn-completed', turn: c, at: 0 })
    t.assist({ event: 'classified', turn: c, reason: 'question me', accepted: true, at: 5 })
  }

  it('a cooldown not-generated finishes the candidate with the policy category', () => {
    const t = new LatencyTracker()
    accepted(t, 1)
    expect(t.records()).toEqual([])
    t.assist({ event: 'not-generated', turn: turn(1), turnedDown: 'policy', at: 9 })
    expect(t.records()).toEqual([
      expect.objectContaining({ kind: 'candidate', turnedDown: 'policy' }),
    ])
  })

  it('later events for a finished candidate never make a second record', () => {
    const t = new LatencyTracker()
    accepted(t, 1)
    t.assist({ event: 'not-generated', turn: turn(1), turnedDown: 'expired', at: 9 })
    t.assist({ event: 'invalidated', turn: turn(1), turnedDown: 'invalidated', at: 10 })
    t.assist({ event: 'superseded', turn: turn(1), turnedDown: 'superseded', at: 11 })
    expect(t.records()).toHaveLength(1)
    expect(t.records()[0]).toMatchObject({ turnedDown: 'expired' })
  })

  it('a prefiltered turn and a queued candidate that never classified are each one record', () => {
    const t = new LatencyTracker()
    t.assist({ event: 'turn-completed', turn: turn(1), at: 0 })
    t.assist({ event: 'not-classified', turn: turn(1), turnedDown: 'prefilter', at: 1 })
    t.assist({ event: 'turn-completed', turn: turn(2), at: 0 })
    t.assist({ event: 'superseded', turn: turn(2), turnedDown: 'superseded', at: 1 })
    expect(t.records().map((r) => r.turnedDown)).toEqual(['prefilter', 'superseded'])
    expect(t.overflow).toBe(0)
  })
})
