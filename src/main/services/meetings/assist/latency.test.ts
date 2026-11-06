import { describe, expect, it } from 'vitest'
import type { CompletedTurn } from '../../turns/types'
import { observeAssistance, type AssistDiagnostic } from './diagnostics'
import { LatencyTracker, observeLatency } from './latency'
import { observeRun } from './run-observation'

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
