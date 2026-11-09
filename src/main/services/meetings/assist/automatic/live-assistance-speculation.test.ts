import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassifierOutcome } from '../../../assistant/classifier/classifier'
import { CONTINUATION_GRACE_MS } from '../../../turns/turn-assembler'
import { me, otherTurn, setup, them } from './live-assistance-harness'
import { freezeEvidence } from '../../../history/live/session'

const diagnostics = vi.hoisted(() => vi.fn())
vi.mock('../../observation/diagnostics', () => ({ observeAssistance: diagnostics }))

const T0 = 1_000_000

type Harness = ReturnType<typeof setup>

const speculating = (over: Parameters<typeof setup>[0] = {}): Harness =>
  setup(over, { speculate: true })

const events = (name: string): unknown[] =>
  diagnostics.mock.calls.map((c) => c[0]).filter((e) => e.event === name)

/** Nothing reached the screen or the database, and the lane and meeting hold are free. */
async function nothingLeaked(t: Harness): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  expect(t.events).toEqual([])
  expect(t.stored).toEqual([])
  expect(t.runner.canStart('ambient')).toBe(true)
  expect(t.holds()).toBe(0)
}

/** Fake-clock time (since `origin`) of the first broadcast carrying answer text. */
const firstText = (t: Harness, origin: number): number | undefined => {
  const i = t.events.findIndex((e) => (e.kind === 'delta' || e.kind === 'done') && !!e.text)
  return i < 0 ? undefined : t.eventAt[i] - origin
}

beforeEach(() => {
  diagnostics.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

describe('frozen historical evidence', () => {
  it('promotes with identical evidence and does not wait for late retrieval', async () => {
    const t = setup(
      {},
      {
        speculate: true,
        retrieve: () =>
          freezeEvidence(
            () =>
              new Promise((resolve) =>
                setTimeout(
                  () =>
                    resolve({ id: 1, text: 'Historical Atlas budget 42', snippets: 1, queryMs: 2 }),
                  2,
                ),
              ),
            10,
          ),
      },
    )
    await otherTurn(t.assist, 'What is the Atlas budget?', 0, 1000)
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(t.generations[0].req.userContent).toContain('Historical Atlas budget 42')
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    expect(events('speculation-promoted')).toHaveLength(1)
    t.assist.halt()
  })
  it('fast rejection cancels retrieval before any answer starts', async () => {
    const t = setup(
      {},
      { speculate: true, retrieve: () => freezeEvidence(() => new Promise(() => {}), 10) },
    )
    await otherTurn(t.assist, 'What is the Atlas budget?', 0, 1000)
    await t.classify(0, t.none)
    await vi.advanceTimersByTimeAsync(25)
    expect(t.generations).toHaveLength(0)
    t.assist.halt()
  })
  it('acceptance waits only the remainder and late hits never force fallback', async () => {
    const t = setup(
      {},
      {
        speculate: true,
        retrieve: () =>
          freezeEvidence(
            () =>
              new Promise((resolve) =>
                setTimeout(
                  () => resolve({ id: 1, text: 'TOO_LATE', snippets: 1, queryMs: 30 }),
                  30,
                ),
              ),
            10,
          ),
      },
    )
    await otherTurn(t.assist, 'What is the Atlas budget?', 0, 1000)
    await vi.advanceTimersByTimeAsync(3)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(7)
    expect(t.generations).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(30)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.userContent).not.toContain('TOO_LATE')
    t.assist.halt()
  })
  it('coalesces pending Answer now and invalidates it on pause', async () => {
    const retrieve = vi.fn(() => freezeEvidence(() => new Promise(() => {}), 25))
    const t = setup({}, { retrieve })
    t.window.push({ speaker: 1, isUser: false, text: 'Atlas budget?' })
    t.assist.answerNow()
    t.assist.answerNow()
    expect(retrieve).toHaveBeenCalledTimes(1)
    t.assist.halt()
    await vi.advanceTimersByTimeAsync(30)
    expect(t.generations).toHaveLength(0)
  })
})

describe('speculative answer: timing (injected provider times, not live)', () => {
  /** Speech ends at 0 and its final arrives at once; the endpoint arrives at 600; the
   *  classifier takes `classifierMs` and the answer's first text `ttftMs`. */
  async function run(speculate: boolean, classifierMs: number, ttftMs: number): Promise<number> {
    const t = setup({}, { speculate })
    const origin = Date.now()
    t.assist.final(them('How would you design an idempotent order service?', -3_000, 0))
    await vi.advanceTimersByTimeAsync(600)
    t.assist.boundary(0, 0, 'endpoint')
    await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
    expect(t.classifications).toHaveLength(1)
    const completedAt = Date.now() - origin
    const answer = (): void => t.generations.at(-1)!.req.onDelta?.('**Use an idempotency key.**')
    const verdict = (): Promise<void> => t.classify(0, t.question)
    const at = async (ms: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(completedAt + ms - (Date.now() - origin))
    }
    if (speculate && ttftMs < classifierMs) {
      await at(ttftMs)
      answer()
      await at(classifierMs)
      await verdict()
    } else if (speculate) {
      await at(classifierMs)
      await verdict()
      await at(ttftMs)
      answer()
    } else {
      await at(classifierMs)
      await verdict()
      await at(classifierMs + ttftMs)
      answer()
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(completedAt).toBe(600 + CONTINUATION_GRACE_MS)
    return firstText(t, origin)!
  }

  it('first broadcast at 2250 for endpoint 600, classifier 1500, TTFT 800', async () => {
    expect(CONTINUATION_GRACE_MS).toBe(150)
    // was 600 + 350 + 1500 + 800 = 3250; speculation alone (350 grace) gives 2450
    expect(await run(true, 1_500, 800)).toBe(2_250)
    // the ordinary path for comparison, at the same 150 ms grace
    expect(await run(false, 1_500, 800)).toBe(3_050)
  })

  it('waits for the slower stage when the answer is the slow one', async () => {
    expect(await run(true, 500, 800)).toBe(600 + CONTINUATION_GRACE_MS + 800)
  })
})

describe('speculative answer: promotion', () => {
  it('starts with the classifier, unpublished, using the neutral automatic prompt', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'How do you make a linked list?', 0, 1_000)
    expect(t.classifications).toHaveLength(1)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.userContent).toContain(
      'Respond to this completed turn:\nS2: How do you make a linked list?',
    )
    t.generations[0].req.onDelta?.('**Use nodes** with a next pointer.')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events).toEqual([]) // buffered until the verdict
    expect(events('speculation-started')).toHaveLength(1)
    await t.classify(0, t.question)
    expect(t.events.map((e) => e.kind)).toEqual(['start', 'delta'])
    expect(t.events[1].text).toBe('**Use nodes** with a next pointer.')
    expect(t.generations).toHaveLength(1) // no second call
    t.generations[0].req.onDelta?.(' Then link them.')
    t.generations[0].d.resolve('**Use nodes** with a next pointer. Then link them.')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events.map((e) => e.kind)).toEqual(['start', 'delta', 'delta', 'done'])
    expect(t.stored).toHaveLength(1)
    expect(t.holds()).toBe(0)
    expect(events('speculation-promoted')).toHaveLength(1)
    expect(events('answer-started')).toEqual([
      expect.objectContaining({ reason: 'speculative', suggestionId: t.events[0].suggestionId }),
    ])
  })

  it('holds a result that completed before the verdict, unstored, then publishes it', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'What is your notice period?', 0, 1_000)
    t.generations[0].d.resolve('**Two weeks.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events).toEqual([])
    expect(t.stored).toEqual([]) // never persisted before promotion
    expect(t.runner.canStart('ambient')).toBe(false) // still owns the lane, unpublished
    await t.classify(0, t.question)
    expect(t.events.map((e) => [e.kind, e.text])).toEqual([
      ['start', ''],
      ['done', '**Two weeks.**'],
    ])
    expect(t.stored).toHaveLength(1)
    expect(t.holds()).toBe(0)
  })

  it('consumes the cooldown and covers the ledger only on promotion', async () => {
    const t = speculating({ nudgeCooldownSec: 10 })
    await otherTurn(t.assist, 'First question?', 0, 800)
    await t.classify(0, t.question)
    t.generations[0].d.resolve('**Answer.**')
    await vi.advanceTimersByTimeAsync(2_000)
    await otherTurn(t.assist, 'Second question?', 3_000, 3_800, 2)
    expect(t.classifications).toHaveLength(1) // cooling down: no classifier, no speculation
    expect(t.generations).toHaveLength(1)
  })

  it('treats a held <none> as the ordinary decline once promoted', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'Any questions?', 0, 800)
    t.generations[0].req.onDelta?.('<none>')
    t.generations[0].d.resolve('<none>')
    await t.classify(0, t.question)
    await nothingLeaked(t)
    expect(events('speculation-promoted')).toHaveLength(1)
  })
})

describe('speculative answer: rejection is silent', () => {
  const rejections: [string, ClassifierOutcome][] = [
    ['none', { status: 'classified', kind: 'none' }],
    ['other addressee', { status: 'classified', kind: 'question', addressee: 'other' }],
    ['provider failure', { status: 'failed', reason: 'provider' }],
    ['timeout', { status: 'failed', reason: 'timeout' }],
    ['malformed', { status: 'failed', reason: 'malformed' }],
  ]

  it.each(rejections)('%s: no flash, nothing stored, no cooldown, lane free', async (_, v) => {
    const t = speculating({ nudgeCooldownSec: 10 })
    await otherTurn(t.assist, 'Can you share the deck?', 0, 1_000)
    t.generations[0].req.onDelta?.('**Sure, sharing now.**')
    await t.classify(0, v)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    await nothingLeaked(t)
    t.generations[0].req.onDelta?.(' late text') // a late callback cannot publish
    await nothingLeaked(t)
    expect(events('speculation-discarded')).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('verdict') }),
    ])
    if (v.status === 'classified') {
      // the cooldown was not consumed: the next question is classified at once
      await vi.advanceTimersByTimeAsync(1_000)
      await otherTurn(t.assist, 'And the budget?', 2_000, 2_800, 2)
      expect(t.classifications).toHaveLength(2)
    }
  })

  it('a completed-but-rejected answer is never stored', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'What a day?', 0, 800)
    t.generations[0].d.resolve('**It was.**')
    await vi.advanceTimersByTimeAsync(0)
    await t.classify(0, t.none)
    await nothingLeaked(t)
  })

  it('question other under Answer every question: discards it for the reference answer', async () => {
    const t = speculating()
    t.assist.setAnswerEveryQuestion(true)
    await otherTurn(t.assist, 'Sam, what do you think?', 0, 1_500)
    t.generations[0].req.onDelta?.('**Speculated text.**')
    await t.classify(0, { status: 'classified', kind: 'question', addressee: 'other' })
    expect(t.generations).toHaveLength(2)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    expect(t.generations[1].req.userContent).toContain('It was put to another participant.')
    expect(t.events).toEqual([]) // the speculated text never showed
    t.generations[1].req.onDelta?.('**Ordinary answer.**')
    expect(t.events.map((e) => e.text)).toEqual(['', '**Ordinary answer.**'])
    expect(events('speculation-discarded')).toEqual([
      expect.objectContaining({ reason: 'prompt-changed' }),
    ])
  })

  it('a prompt input that changed during classification falls back to the ordinary path', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'What context window does it have?', 0, 1_000)
    t.told.push({ headline: 'A headline shown meanwhile.', detail: '' }) // e.g. a hotkey answer finished
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(2)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    expect(t.generations[1].req.userContent).toContain('A headline shown meanwhile.')
  })

  it('a provider failure before the verdict stays silent; an accepted verdict retries', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'How does it scale?', 0, 1_000)
    t.generations[0].d.reject(new Error('overloaded'))
    await nothingLeaked(t)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(2) // the ordinary request
    expect(events('speculation-discarded')).toEqual([
      expect.objectContaining({ reason: 'ended-before-verdict' }),
    ])
    expect(t.events).toEqual([])
  })

  it('a provider failure after promotion is an ordinary answer error', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'How does it scale?', 0, 1_000)
    await t.classify(0, t.question)
    t.generations[0].d.reject(new Error('overloaded'))
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events.map((e) => e.kind)).toEqual(['error']) // as an ordinary answer failing
    expect(t.holds()).toBe(0)
  })

  it('an unpromoted answer never outlives its request deadline', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'How does it scale?', 0, 1_000)
    t.generations[0].d.resolve('**Held.**')
    await vi.advanceTimersByTimeAsync(25_000)
    await nothingLeaked(t)
    await t.classify(0, t.question) // far too late: expired, nothing shown
    await nothingLeaked(t)
  })
})

describe('speculative answer: invalidation and lanes', () => {
  it.each(['halt', 'connectionReset', 'identityChanged'] as const)(
    '%s discards it silently',
    async (invalidate) => {
      const t = speculating()
      await otherTurn(t.assist, 'Can you explain it?', 0, 800)
      t.generations[0].req.onDelta?.('**Partial')
      t.assist[invalidate]()
      expect(t.generations[0].req.signal?.aborted).toBe(true)
      await t.classify(0, t.question)
      await nothingLeaked(t)
      expect(t.generations).toHaveLength(1)
      if (invalidate === 'halt')
        expect(t.logs).toContain('speculative answers: started=1 promoted=0 discarded=1')
    },
  )

  it('the user starting to answer discards it', async () => {
    const t = speculating()
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.final(me('So the way it works is', 1_200, 2_500))
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    await t.classify(0, t.question)
    await nothingLeaked(t)
  })

  it('a newer question supersedes it; only the newest is answered, carrying the first', async () => {
    const t = speculating({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'What is the delivery date?', 0, 800)
    await otherTurn(t.assist, 'Who owns the rollout?', 1_000, 1_800)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    await t.classify(0, t.question) // the overtaken verdict is ignored
    await vi.advanceTimersByTimeAsync(1_000) // classifier spacing
    expect(t.generations).toHaveLength(2) // speculated with the classifier for the newest
    expect(t.generations[1].req.userContent).toContain('1. S2: What is the delivery date?')
    await t.classify(1, t.question)
    t.generations[1].req.onDelta?.('**Both.**')
    expect(t.events.map((e) => e.text)).toEqual(['', '**Both.**'])
    expect(t.generations).toHaveLength(2)
  })

  it('does not speculate while an ambient answer holds the lane', async () => {
    const t = speculating({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'First?', 0, 800, 1)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, 'Second?', 2_000, 2_800, 2)
    expect(t.classifications).toHaveLength(2)
    expect(t.generations).toHaveLength(1) // lane busy: no speculation
    await t.classify(1, t.question)
    t.generations[0].d.resolve('**First answer.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.generations).toHaveLength(2) // the ordinary path once the lane frees
    expect(t.generations[1].req.userContent).toContain('S3: Second?')
  })

  it('supersedes matching unpublished speculation with the Full hotkey answer', async () => {
    const t = speculating()
    t.window.push({ speaker: 1, isUser: false, text: 'Can you explain it?' })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.answerNow()
    expect(t.generations).toHaveLength(2)
    expect(t.generations[1].req.maxTokens).toBe(1200) // the requested answer
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    expect(t.events[0]).toMatchObject({ trigger: 'hotkey' })
    // A stale verdict cannot resurrect the superseded answer.
    await t.classify(0, t.question)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    expect(t.events.filter((e) => e.trigger === 'ambient')).toEqual([])
  })
})
