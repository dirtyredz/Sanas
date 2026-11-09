import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Addressee, ResponseKind } from '../../../assistant/classifier/classifier'
import { CONTINUATION_GRACE_MS } from '../../../turns/turn-assembler'
import type { AssistDiagnostic } from '../../observation/diagnostics'
import { LatencyTracker, type LatencyRecord } from '../latency/latency'
import { subscribeRuns } from '../../observation/run-observation'
import { otherTurn, setup, them } from './testing/live-assistance-harness'

// The six accepted automatic verdicts share one neutral speculative prompt: each promotes the
// speculation with exactly one answer request, and each gets the overlapped timing. Stage
// evidence is read through the real LatencyTracker, fed by both observation streams.

const sink = vi.hoisted(() => ({ fn: (_e: AssistDiagnostic): void => undefined }))
vi.mock('../../observation/diagnostics', () => ({
  observeAssistance: (e: AssistDiagnostic) => sink.fn(e),
}))

const VERDICTS: [ResponseKind, Addressee][] = [
  ['question', 'me'],
  ['question', 'room'],
  ['request', 'me'],
  ['request', 'room'],
  ['objection', 'me'],
  ['objection', 'room'],
]

let tracker: LatencyTracker
let unsubscribe: () => void
let seen: AssistDiagnostic[]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  tracker = new LatencyTracker()
  seen = []
  sink.fn = (e) => {
    seen.push(e)
    tracker.assist(e)
  }
  unsubscribe = subscribeRuns((e) => tracker.run(e))
})
afterEach(() => {
  unsubscribe()
  vi.useRealTimers()
})

const runs = (): LatencyRecord[] => tracker.records().filter((r) => r.kind === 'run')

describe.each(VERDICTS)('%s %s', (kind, addressee) => {
  const verdict = { status: 'classified', kind, addressee } as const

  it.each(['classifier first', 'answer first'])(
    'promotes the speculation with one answer request (%s)',
    async (order) => {
      const t = setup({}, { speculate: true })
      await otherTurn(t.assist, 'Walk me through the rollout plan.', 0, 1_200)
      expect(t.generations).toHaveLength(1)
      if (order === 'answer first') t.generations[0].req.onDelta?.('**Phase it by region.**')
      await vi.advanceTimersByTimeAsync(0)
      expect(t.events).toEqual([]) // nothing published before acceptance
      await t.classify(0, verdict)
      if (order === 'classifier first') t.generations[0].req.onDelta?.('**Phase it by region.**')
      expect(t.generations).toHaveLength(1) // the speculation IS the answer
      expect(t.events.map((e) => [e.kind, e.text])).toEqual([
        ['start', ''],
        ['delta', '**Phase it by region.**'],
      ])
      t.generations[0].d.resolve('**Phase it by region.**')
      await vi.advanceTimersByTimeAsync(0)
      expect(t.stored).toHaveLength(1)
      expect(runs()).toEqual([
        expect.objectContaining({
          path: 'speculative',
          outcome: 'done',
          verdict: `${kind} ${addressee}`,
          classification: 'applies',
        }),
      ])
    },
  )

  /** Speech ends at 0 with its final; the endpoint arrives at 600; the classifier answers at
   *  `classifierMs` after close and the first text at `ttftMs` after its request. */
  async function firstReadable(classifierMs: number, ttftMs: number): Promise<LatencyRecord> {
    const t = setup({}, { speculate: true })
    const origin = Date.now()
    t.assist.final(them('How would you stage the migration?', -3_000, 0))
    await vi.advanceTimersByTimeAsync(600)
    t.assist.boundary(0, 0, 'endpoint')
    await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
    const closed = Date.now() - origin
    const steps: [number, () => Promise<void> | void][] = [
      [classifierMs, () => t.classify(0, verdict)],
      [ttftMs, () => t.generations[0].req.onDelta?.('**Stage it behind a flag.**')],
    ]
    for (const [at, step] of steps.sort((a, b) => a[0] - b[0])) {
      await vi.advanceTimersByTimeAsync(closed + at - (Date.now() - origin))
      await step()
    }
    t.generations[0].d.resolve('**Stage it behind a flag.**')
    await vi.advanceTimersByTimeAsync(0)
    const visible = t.eventAt[t.events.findIndex((e) => e.kind === 'delta' && !!e.text)] - origin
    expect(visible).toBe(600 + CONTINUATION_GRACE_MS + Math.max(classifierMs, ttftMs))
    return runs().at(-1)!
  }

  it('first readable text = assembly + max(classifier, first text), slow classifier', async () => {
    const r = await firstReadable(1_500, 800)
    expect(r).toMatchObject({
      classifierMs: 1_500,
      closeToFirstTextMs: 800,
      closeToFirstReadableMs: 1_500,
      lastFinalToFirstReadableMs: 600 + CONTINUATION_GRACE_MS + 1_500,
      completion: 'endpoint',
    })
    expect(r.assembly).toMatchObject({ boundaryToCloseMs: CONTINUATION_GRACE_MS })
  })

  it('first readable text = assembly + max(classifier, first text), slow answer', async () => {
    const r = await firstReadable(500, 800)
    expect(r).toMatchObject({ classifierMs: 500, closeToFirstReadableMs: 800 })
  })
})

describe('stage evidence beyond promotion', () => {
  it('records a discarded speculation and the fallback that replaced it', async () => {
    const t = setup({}, { speculate: true })
    await otherTurn(t.assist, 'What context window does it have?', 0, 1_000)
    t.told.push({ headline: 'Shown meanwhile.', detail: '' }) // the prompt input moved
    await t.classify(0, t.question)
    t.generations[1].req.onDelta?.('**Two hundred thousand.**')
    t.generations[1].d.resolve('**Two hundred thousand.**')
    await vi.advanceTimersByTimeAsync(0)
    const [discarded, fallback] = runs()
    expect(discarded).toMatchObject({
      path: 'speculative',
      outcome: 'discarded',
      discard: 'prompt-changed',
    })
    expect(fallback).toMatchObject({
      path: 'fallback',
      fallbackOf: discarded.runId,
      outcome: 'done',
      verdict: 'question me',
    })
  })

  it('a rejected candidate stays linked to its discarded run; manual answers are not classified', async () => {
    const t = setup({}, { speculate: true })
    await otherTurn(t.assist, 'What a day?', 0, 800)
    await t.classify(0, t.none)
    await vi.advanceTimersByTimeAsync(0)
    expect(tracker.records()).toEqual([
      expect.objectContaining({
        kind: 'run',
        verdict: 'none',
        candidateId: 1,
        outcome: 'discarded',
        discard: 'rejected',
      }),
    ])
    t.window.push({ speaker: 1, isUser: false, text: 'Anything else?' })
    t.assist.answerNow()
    t.generations.at(-1)!.d.resolve('**Nothing more.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(runs().at(-1)).toMatchObject({ path: 'manual', classification: 'n/a' })
  })
})

// Every candidate ends in exactly one latency record, including the ones the coordinator
// turns down after the classifier named something to answer (none may be left open to be
// evicted into `overflow`).
const other = { status: 'classified', kind: 'question', addressee: 'other' } as const

describe('coordinator decision', () => {
  it('reports a question put to someone else as not accepted, and records it once', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1_000)
    await t.classify(0, other)
    expect(t.generations).toHaveLength(0)
    expect(seen.find((e) => e.event === 'classified')).toMatchObject({
      accepted: false,
      turnedDown: 'policy',
    })
    expect(tracker.records()).toEqual([
      expect.objectContaining({
        kind: 'candidate',
        verdict: 'question other',
        turnedDown: 'policy',
      }),
    ])
    expect(tracker.overflow).toBe(0)
  })

  it('reports the same verdict as accepted when Answer every question is on', async () => {
    const t = setup()
    t.assist.setAnswerEveryQuestion(true)
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1_000)
    await t.classify(0, other)
    expect(seen.find((e) => e.event === 'classified')).toMatchObject({ accepted: true })
    expect(tracker.records()).toEqual([]) // still open: its run will end it
    t.assist.setAnswerEveryQuestion(false)
  })

  it('an expired accepted candidate (not-generated) is one record, speculating or not', async () => {
    for (const speculate of [false, true]) {
      tracker = new LatencyTracker()
      const t = setup({}, { speculate })
      await otherTurn(t.assist, 'Can you explain it?', 0, 800)
      await vi.advanceTimersByTimeAsync(6_100)
      await t.classify(0, t.question)
      await vi.advanceTimersByTimeAsync(0)
      expect(t.generations.length).toBe(speculate ? 1 : 0)
      expect(tracker.records().filter((r) => r.candidateId !== undefined)).toEqual([
        expect.objectContaining({
          verdict: 'question me',
          turnedDown: 'expired',
        }),
      ])
      expect(tracker.overflow).toBe(0)
    }
  })

  it('Stop with a candidate in flight is one record', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.halt()
    await t.classify(0, t.question) // arrives after the invalidation: stale
    expect(seen.find((e) => e.event === 'classified')).toMatchObject({ accepted: false })
    expect(tracker.records()).toEqual([
      expect.objectContaining({ kind: 'candidate', turnedDown: 'invalidated' }),
    ])
    expect(tracker.overflow).toBe(0)
  })

  it('a newer final overtaking a candidate is one record', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    await otherTurn(t.assist, 'And what about the cost of it all?', 2_000, 3_000)
    await t.classify(0, t.question)
    const first = tracker.records().filter((r) => r.candidateId === 1)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ kind: 'candidate', turnedDown: 'invalidated' })
    expect(tracker.overflow).toBe(0)
  })

  it('a speculation in flight when the candidate is turned down yields one run record', async () => {
    const t = setup({}, { speculate: true })
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1_000)
    expect(t.generations).toHaveLength(1)
    await t.classify(0, other)
    await vi.advanceTimersByTimeAsync(0)
    expect(tracker.records().filter((r) => r.candidateId !== undefined)).toHaveLength(1)
    expect(tracker.overflow).toBe(0)
  })
})
