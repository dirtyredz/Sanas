import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuggestionEvent } from '@shared/types'
import type { AssistRequest } from '../../assistant/types'
import type { ClassifierOutcome, ClassifyRequest } from '../../assistant/classifier'
import type { TurnFinal } from '../../turns/types'
import { CONTINUATION_GRACE_MS } from '../../turns/turn-assembler'
import { CLASSIFIER_SUSPEND_MS, LiveAssistance } from './live-assistance'
import { SuggestionRunner } from './suggestion-runner'
import type { AssistSettings } from './suggestion-requests'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function setup(over: Partial<AssistSettings> = {}) {
  const settings: AssistSettings = {
    anthropicApiKey: 'sk',
    anthropicWorkspaceId: '',
    nudgeModel: 'claude-sonnet-5-5',
    answerModel: 'claude-opus-5-5',
    classifierModel: 'claude-haiku-5-5',
    whisperMode: 'smart',
    nudgeCooldownSec: 5,
    coachWhileTalking: false,
    ...over,
  }
  const classifications: { req: ClassifyRequest; d: Deferred<ClassifierOutcome> }[] = []
  const generations: { req: AssistRequest; d: Deferred<string> }[] = []
  const events: SuggestionEvent[] = []
  const runner = new SuggestionRunner({
    provider: {
      complete: (req) => {
        const d = deferred<string>()
        generations.push({ req, d })
        req.signal?.addEventListener('abort', () => d.resolve('(aborted)'))
        return d.promise
      },
    },
    emit: (e) => events.push(e),
    persist: () => undefined,
    hold: () => undefined,
    release: () => undefined,
    log: () => undefined,
  })
  const window: { speaker: number; isUser: boolean; text: string }[] = []
  const recent: string[] = []
  const assist = new LiveAssistance({
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    settings: () => settings,
    classify: (req) => {
      const d = deferred<ClassifierOutcome>()
      classifications.push({ req, d })
      return d.promise
    },
    runner,
    snapshot: () => ({
      meetingId: 7,
      atMs: 1_000,
      system: 'sys',
      window,
      names: undefined,
      recent,
    }),
    log: () => undefined,
  })
  assist.start()
  const classify = async (i: number, outcome: ClassifierOutcome): Promise<void> => {
    classifications[i].d.resolve(outcome)
    await vi.advanceTimersByTimeAsync(0)
  }
  const question: ClassifierOutcome = { status: 'classified', kind: 'question', addressee: 'me' }
  const none: ClassifierOutcome = { status: 'classified', kind: 'none' }
  return {
    assist,
    settings,
    classifications,
    generations,
    events,
    window,
    recent,
    classify,
    question,
    none,
  }
}

const them = (text: string, tStartMs: number, tEndMs: number, speaker = 1): TurnFinal => ({
  channel: 0,
  speaker,
  role: 'other',
  tStartMs,
  tEndMs,
  text,
})

const me = (text: string, tStartMs: number, tEndMs: number): TurnFinal => ({
  channel: 0,
  speaker: 0,
  role: 'user',
  tStartMs,
  tEndMs,
  text,
})

/** A complete other-speaker turn: final + endpoint + grace. */
async function otherTurn(
  assist: LiveAssistance,
  text: string,
  startMs: number,
  endMs: number,
  speaker = 1,
): Promise<void> {
  assist.final(them(text, startMs, endMs, speaker))
  assist.boundary(0, endMs, 'endpoint')
  await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
}

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

describe('live assistance: answers to completed turns', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it('slide moves preserve a classifier and its answer, including an answer already streaming', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'What is the result?' })
    await otherTurn(t.assist, 'What is the result?', 0, 1000)
    expect(t.classifications).toHaveLength(1)
    t.assist.presentationChanged(1000)
    expect(t.classifications[0].req.signal?.aborted).toBe(false)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    t.assist.presentationChanged(2000)
    expect(t.generations[0].req.signal?.aborted).toBe(false)
    t.generations[0].d.resolve('Answer from another slide')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events.at(-1)?.kind).toBe('done')
    t.assist.halt()
  })

  it('slide moves cancel coaching and require fresh speech thresholds', async () => {
    const t = setup({ coachWhileTalking: true })
    t.assist.final(me(words(45), 0, 21000))
    expect(t.generations).toHaveLength(1)
    t.assist.presentationChanged(22000)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    t.assist.final(me(words(5), 22000, 23000))
    expect(t.generations).toHaveLength(1)
    expect(t.events).toHaveLength(0)
    t.assist.halt()
  })

  it('classifies the fragmented linked-list question once, then answers that turn', async () => {
    const t = setup()
    t.assist.final(them('How do you make', 0, 900))
    await vi.advanceTimersByTimeAsync(200)
    expect(t.classifications).toHaveLength(0) // nothing on the first fragment alone
    t.assist.final(them('a linked list?', 1_200, 2_000))
    t.assist.boundary(0, 2_000, 'endpoint')
    await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
    expect(t.classifications).toHaveLength(1)
    expect(t.classifications[0].req).toMatchObject({
      model: 'claude-haiku-5-5',
      current: { speaker: 'S2', text: 'How do you make a linked list?' },
    })
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.userContent).toContain(
      'Respond to this completed turn (a question):\nS2: How do you make a linked list?',
    )
    expect(t.events).toEqual([]) // held until the text cannot be the no-op
    t.generations[0].req.onDelta?.('**Use nodes')
    expect(t.events[0]).toMatchObject({ kind: 'start', trigger: 'ambient', purpose: 'answer' })
  })

  it('does not answer when the classifier says none, and does not consume the cooldown', async () => {
    const t = setup()
    await otherTurn(t.assist, 'What a day?', 0, 800)
    await t.classify(0, t.none)
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, 'Can you share the deck?', 2_000, 3_000)
    await t.classify(1, t.question)
    expect(t.generations).toHaveLength(1)
  })

  it('ignores ordinary statements without calling the classifier', async () => {
    const t = setup()
    await otherTurn(t.assist, 'We shipped it yesterday.', 0, 800)
    expect(t.classifications).toHaveLength(0)
  })

  it('fails closed and suspends the classifier for 30 s after a provider failure', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Any thoughts?', 0, 800)
    await t.classify(0, { status: 'failed', reason: 'provider' })
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2_000)
    await otherTurn(t.assist, 'Any other thoughts?', 3_000, 3_800)
    expect(t.classifications).toHaveLength(1) // suspended
    await vi.advanceTimersByTimeAsync(CLASSIFIER_SUSPEND_MS)
    await otherTurn(t.assist, 'Thoughts now?', 40_000, 40_800)
    expect(t.classifications).toHaveLength(2)
  })

  it('runs one classifier at a time and keeps only the newest waiting candidate', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Question one?', 0, 800, 1)
    await otherTurn(t.assist, 'Question two?', 1_000, 1_800, 2)
    await otherTurn(t.assist, 'Question three?', 2_000, 2_800, 3)
    expect(t.classifications).toHaveLength(1)
    // newer speech overtook the first candidate, so its result no longer matters
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.classifications).toHaveLength(2)
    expect(t.classifications[1].req.current.text).toBe('Question three?')
    expect(t.classifications[1].req.previous.map((p) => p.text)).toEqual([
      'Question one?',
      'Question two?',
    ])
  })

  it('spaces classifier starts at least one second apart', async () => {
    const t = setup()
    await otherTurn(t.assist, 'First?', 0, 800, 1)
    await t.classify(0, t.none)
    await otherTurn(t.assist, 'Second?', 1_000, 1_500, 2)
    expect(t.classifications).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.classifications).toHaveLength(2)
  })

  it('drops a candidate that expired before generation', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    await vi.advanceTimersByTimeAsync(6_100)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(0)
  })

  it('drops the candidate when the user starts answering, but not for a filler', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.final(me('Yeah sure', 1_200, 1_500)) // two words: not answering yet
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)

    const u = setup({ nudgeCooldownSec: 0 })
    await otherTurn(u.assist, 'Can you explain it?', 0, 800)
    u.assist.final(me('So the way it works is', 1_200, 2_500))
    await u.classify(0, u.question)
    expect(u.generations).toHaveLength(0)
  })

  it('consumes the cooldown only when an answer starts', async () => {
    const t = setup({ nudgeCooldownSec: 10 })
    await otherTurn(t.assist, 'First question?', 0, 800)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    t.generations[0].d.resolve('**Answer.**')
    await vi.advanceTimersByTimeAsync(2_000)
    await otherTurn(t.assist, 'Second question?', 3_000, 3_800, 2)
    expect(t.classifications).toHaveLength(1) // cooldown read before classification
    t.settings.nudgeCooldownSec = 0 // read live
    await otherTurn(t.assist, 'Third question?', 4_000, 4_800, 3)
    expect(t.classifications).toHaveLength(2)
  })

  it('keeps the newest classified candidate while the ambient lane is busy', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'First?', 0, 800, 1)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, 'Second?', 2_000, 2_800, 2)
    await t.classify(1, t.question)
    expect(t.generations).toHaveLength(1) // lane busy: waits, no queue
    t.generations[0].d.resolve('**First answer.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.generations).toHaveLength(2)
    expect(t.generations[1].req.userContent).toContain('S3: Second?')
  })

  it('discards pending work on halt, reset and pin change', async () => {
    for (const invalidate of ['halt', 'connectionReset', 'identityChanged'] as const) {
      const t = setup()
      await otherTurn(t.assist, 'Can you explain it?', 0, 800)
      t.assist[invalidate]()
      await t.classify(0, t.question)
      expect(t.generations).toHaveLength(0)
      // a half-assembled turn is discarded, never completed later
      if (invalidate !== 'halt') {
        t.assist.final(them('How about', 2_000, 2_500))
        t.assist[invalidate]()
        await vi.advanceTimersByTimeAsync(5_000)
        expect(t.classifications).toHaveLength(1)
      }
    }
  })

  it('does not answer a turn put to another participant', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1_000)
    await t.classify(0, { status: 'classified', kind: 'request', addressee: 'other' })
    expect(t.generations).toHaveLength(0)
  })

  it('tells the answer an open-floor question was put to the room', async () => {
    const t = setup()
    await otherTurn(t.assist, 'So any questions about the use of these models?', 0, 1_500)
    await t.classify(0, { status: 'classified', kind: 'question', addressee: 'room' })
    expect(t.generations[0].req.userContent).toContain('It was put to the room')
  })

  it('shows the model what was already shown, and lets it decline', async () => {
    const t = setup()
    t.recent.push('I’ll verify AS9 writeback in sandbox after the catalog change.')
    await otherTurn(t.assist, 'What context window does it have?', 0, 1_000)
    await t.classify(0, t.question)
    expect(t.generations[0].req.userContent).toContain(
      '- I’ll verify AS9 writeback in sandbox after the catalog change.',
    )
    t.generations[0].d.resolve('<none>')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events).toEqual([]) // declined: nothing displayed
  })

  it('counts a declined answer against the cooldown', async () => {
    const t = setup({ nudgeCooldownSec: 10 })
    await otherTurn(t.assist, 'Any questions?', 0, 800)
    await t.classify(0, t.question)
    t.generations[0].d.resolve('<none>')
    await vi.advanceTimersByTimeAsync(2_000)
    await otherTurn(t.assist, 'Anything else?', 3_000, 3_800, 2)
    expect(t.classifications).toHaveLength(1) // still cooling down
    await vi.advanceTimersByTimeAsync(10_000)
    await otherTurn(t.assist, 'Last call, questions?', 20_000, 20_800, 3)
    expect(t.classifications).toHaveLength(2)
  })

  it('answers now regardless of classification, taking the hotkey lane', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'hello' })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    t.assist.answerNow()
    expect(t.generations).toHaveLength(1)
    expect(t.events[0]).toMatchObject({ trigger: 'hotkey', purpose: 'answer' })
  })
})

describe('live assistance: next point while the user talks', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  const explain = (t: ReturnType<typeof setup>): void => {
    t.assist.final(me(words(25), 0, 10_000))
    t.assist.final(me(words(25), 10_000, 21_000))
  }

  it('is off by default', () => {
    const t = setup()
    explain(t)
    expect(t.generations).toHaveLength(0)
  })

  it('suggests a buffered next point on a long explanation', async () => {
    const t = setup({ coachWhileTalking: true })
    explain(t)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req).toMatchObject({
      model: 'claude-sonnet-5-5',
      maxTokens: 220,
      maxRetries: 0,
      timeoutMs: 8_000,
    })
    expect(t.events).toEqual([]) // nothing shown until complete
    t.generations[0].d.resolve('**Mention the status endpoint.**')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events.map((e) => [e.kind, e.purpose])).toEqual([
      ['start', 'next-point'],
      ['done', 'next-point'],
    ])
  })

  it('publishes nothing for <none>', async () => {
    const t = setup({ coachWhileTalking: true })
    explain(t)
    t.generations[0].d.resolve('<none>')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events).toEqual([])
  })

  it('suggests on a pause after a medium explanation', async () => {
    const t = setup({ coachWhileTalking: true })
    t.assist.final(me(words(22), 0, 9_000))
    t.assist.boundary(0, 9_000, 'endpoint')
    expect(t.generations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1_800)
    expect(t.generations).toHaveLength(1)
  })

  it('is cancelled by disabling it, another speaker, a candidate or a hotkey', async () => {
    const cases: ((t: ReturnType<typeof setup>) => Promise<void>)[] = [
      async (t) => {
        t.settings.coachWhileTalking = false
        t.assist.settingsChanged()
      },
      async (t) => t.assist.final(them('Mm, okay.', 21_500, 22_000)),
      async (t) => t.assist.activity(1, 21_500, 'other'),
      async (t) => {
        t.window.push({ speaker: 1, isUser: false, text: 'x' })
        t.assist.answerNow()
      },
    ]
    for (const act of cases) {
      const t = setup({ coachWhileTalking: true })
      explain(t)
      await act(t)
      t.generations[0].d.resolve('**Late next point.**')
      await vi.advanceTimersByTimeAsync(0)
      expect(t.events.filter((e) => e.purpose === 'next-point')).toEqual([])
    }
  })

  it('never coaches an unknown voice', () => {
    const t = setup({ coachWhileTalking: true })
    t.assist.final({ ...me(words(50), 0, 21_000), role: 'unknown', speaker: -1 })
    expect(t.generations).toHaveLength(0)
  })

  it('waits 30 s and new content before the next attempt', async () => {
    const t = setup({ coachWhileTalking: true })
    explain(t)
    t.generations[0].d.resolve('**One.**')
    // the user keeps explaining; a final every 5 s keeps the episode alive
    let audio = 21_000
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5_000)
      t.assist.final(me(words(6), audio, audio + 4_500))
      audio += 5_000
      expect(t.generations).toHaveLength(1) // inside the 30 s cooldown
    }
    await vi.advanceTimersByTimeAsync(5_000)
    t.assist.final(me(words(6), audio, audio + 4_500))
    expect(t.generations).toHaveLength(2) // 30 s passed and 36 new words were said
  })

  it('does not coach while a requested answer runs', () => {
    const t = setup({ coachWhileTalking: true })
    t.window.push({ speaker: 1, isUser: false, text: 'x' })
    t.assist.answerNow()
    explain(t)
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.maxTokens).toBe(1200)
  })
})
