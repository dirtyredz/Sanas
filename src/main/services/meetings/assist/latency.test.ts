import { describe, expect, it } from 'vitest'
import type { CompletedTurn } from '../../turns/types'
import {
  LatencyTracker,
  discardCategory,
  hasReadableText,
  summarizeLatency,
  type LatencyRecord,
} from './latency'

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
  t.assist({ event: 'classified', turn: c, reason: verdict, attempt: id, at: at + 1_200 })
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

  it('an observer failure never escapes', () => {
    const t = new LatencyTracker(() => {
      throw new Error('log failed')
    })
    expect(() => answer(t, 1, 0)).not.toThrow()
  })
})

describe('latency helpers', () => {
  it.each([
    ['prompt-changed', 'prompt-changed'],
    ['verdict none', 'rejected'],
    ['verdict question other', 'rejected'],
    ['verdict timeout', 'classifier-failed'],
    ['verdict malformed', 'classifier-failed'],
    ['new-final', 'overtaken'],
    ['stop-or-pause', 'invalidated'],
    ['ended-before-verdict', 'ended-before-verdict'],
    ['something new', 'other'],
  ])('discard reason %j is category %j', (reason, category) => {
    expect(discardCategory(reason)).toBe(category)
  })

  it.each([
    ['', false],
    ['<none>', false],
    ['**', false],
    ['  __ ** ` ', false],
    ['⟨⟩', false],
    ['**Use', true],
    ['42', true],
  ])('readable %j → %s', (text, readable) => {
    expect(hasReadableText(text)).toBe(readable)
  })

  it('summarizes by verdict and path, keeping failures and missing usage apart', () => {
    const records: LatencyRecord[] = [
      { kind: 'candidate', classification: 'applies', verdict: 'none' },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'request room',
        outcome: 'done',
        closeToFirstReadableMs: 1_000,
        usage: { partial: false, outputCount: 3 },
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'request room',
        outcome: 'done',
        closeToFirstReadableMs: 2_000,
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'speculative',
        verdict: 'question me',
        outcome: 'discarded',
        discard: 'prompt-changed',
      },
      {
        kind: 'run',
        classification: 'applies',
        path: 'fallback',
        verdict: 'question me',
        outcome: 'timeout',
      },
    ]
    const s = summarizeLatency(records, 2)
    expect(s.byVerdictAndPath).toEqual({
      'request room · speculative': expect.objectContaining({
        count: 2,
        closeToFirstReadableMs: 1_500,
      }),
    })
    expect(s.classifier).toEqual({ none: 1, 'request room': 2, 'question me': 1 })
    expect(s.speculation).toEqual({
      started: 3,
      promoted: 2,
      discarded: 1,
      discardReasons: { 'prompt-changed': 1 },
    })
    expect(s).toMatchObject({ fallbacks: 1, missingUsage: 3, overflow: 2 })
  })
})
