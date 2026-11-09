import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTINUATION_GRACE_MS } from '../../../turns/turn-assembler'
import { ENDPOINTING_MS } from '../../../stt/endpointing'
import { CLASSIFIER_SUSPEND_MS } from './breaker/classifier-breaker'
import { ANSWER_NOW_QUESTION_MS } from '../../../turns/latest-question'
import { me, otherTurn, setup, them, words } from './live-assistance-harness'

const diagnostics = vi.hoisted(() => vi.fn())
vi.mock('../../observation/diagnostics', () => ({ observeAssistance: diagnostics }))
beforeEach(() => diagnostics.mockClear())

describe('live assistance: answers to completed turns', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  it.each([200, 300, 450, 600, 800])(
    'preserves multipart text and expected answer count at a %i ms pause',
    async (pause) => {
      const t = setup({ nudgeCooldownSec: 0 })
      const answerPending = async (): Promise<void> => {
        while (t.generations.length < t.classifications.length) {
          await t.classify(t.generations.length, t.question)
          t.generations.at(-1)!.d.resolve('The grounded answer.')
          await vi.advanceTimersByTimeAsync(0)
        }
      }
      t.assist.final(them('How would you implement this', 0, 1000))
      if (pause >= ENDPOINTING_MS) {
        await vi.advanceTimersByTimeAsync(ENDPOINTING_MS)
        t.assist.boundary(0, 1000, 'endpoint')
        await vi.advanceTimersByTimeAsync(pause - ENDPOINTING_MS)
      } else await vi.advanceTimersByTimeAsync(pause)
      await answerPending()
      t.assist.activity(0, 1000 + pause, 'other')
      await vi.advanceTimersByTimeAsync(1000)
      t.assist.final(them('and what is its complexity?', 1000 + pause, 2000 + pause))
      await vi.advanceTimersByTimeAsync(ENDPOINTING_MS)
      t.assist.boundary(0, 2000 + pause, 'endpoint')
      await vi.advanceTimersByTimeAsync(CONTINUATION_GRACE_MS)
      await answerPending()
      expect(t.classifications.map((c) => c.req.current.text).join(' ')).toBe(
        'How would you implement this and what is its complexity?',
      )
      expect(t.events.filter((e) => e.kind === 'done')).toHaveLength(pause === 800 ? 2 : 1)
      t.assist.halt()
    },
  )

  it.each(['classify', 'generate'])(
    'ends a candidate when the snapshot vanishes before %s',
    async (stage) => {
      const t = setup()
      if (stage === 'classify') t.setSnapshotAvailable(false)
      await otherTurn(t.assist, 'What is the result?', 0, 1000)
      if (stage === 'generate') {
        t.setSnapshotAvailable(false)
        await t.classify(0, t.question)
      }
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          event: stage === 'classify' ? 'not-classified' : 'not-generated',
          reason: 'no-meeting',
          turnedDown: 'invalidated',
        }),
      )
      expect(t.generations).toHaveLength(0)
      t.assist.halt()
    },
  )

  it('context changes preserve a classifier and its answer, including an answer already streaming', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'What is the result?' })
    await otherTurn(t.assist, 'What is the result?', 0, 1000)
    expect(t.classifications).toHaveLength(1)
    t.assist.contextChanged(1000)
    expect(t.classifications[0].req.signal?.aborted).toBe(false)
    await t.classify(0, t.question)
    expect(t.generations).toHaveLength(1)
    t.assist.contextChanged(2000)
    expect(t.generations[0].req.signal?.aborted).toBe(false)
    t.generations[0].d.resolve('Answer built on the earlier context')
    await vi.advanceTimersByTimeAsync(0)
    expect(t.events.at(-1)?.kind).toBe('done')
    t.assist.halt()
  })

  it('context changes cancel coaching and require fresh speech thresholds', async () => {
    const t = setup({ coachWhileTalking: true })
    t.assist.final(me(words(45), 0, 21000))
    expect(t.generations).toHaveLength(1)
    t.assist.contextChanged(22000)
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
      'Respond to this completed turn:\nS2: How do you make a linked list?',
    )
    expect(t.events).toEqual([]) // held until the text cannot be the no-op
    t.generations[0].req.onDelta?.('**Use nodes')
    expect(t.events[0]).toMatchObject({ kind: 'start', trigger: 'ambient', purpose: 'answer' })
  })

  it('does not answer when the classifier says none, and does not consume the cooldown', async () => {
    const t = setup()
    await otherTurn(t.assist, 'What a day?', 0, 800)
    await t.classify(0, t.none)
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'classified', reason: 'none' }),
    )
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

  const fail = (reason: 'provider' | 'timeout') => ({ status: 'failed', reason }) as const
  const ask = async (t: ReturnType<typeof setup>, i: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, `Any thoughts ${i}?`, i * 10_000, i * 10_000 + 800, i + 1)
  }

  it.each(['provider', 'timeout'] as const)(
    'one %s failure fails that turn closed only: no suspension, next question is answered',
    async (reason) => {
      const t = setup({}, { speculate: true })
      const base = t.availabilityChanges()
      await otherTurn(t.assist, 'Any thoughts?', 0, 800)
      expect(t.generations).toHaveLength(1) // speculative answer started
      await t.classify(0, fail(reason))
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'classified', reason }),
      )
      expect(t.events).toEqual([]) // speculation discarded silently
      expect(t.generations[0].req.signal?.aborted).toBe(true)
      expect(t.assist.automaticUnavailable()).toBe(false)
      expect(t.availabilityChanges()).toBe(base)
      await ask(t, 1)
      expect(t.classifications).toHaveLength(2)
      expect(diagnostics).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'not-classified', reason: 'suspended' }),
      )
      await t.classify(1, t.question)
      expect(t.generations.length).toBeGreaterThan(1)
    },
  )

  it('three consecutive failures suspend for CLASSIFIER_SUSPEND_MS and publish availability', async () => {
    const t = setup()
    const base = t.availabilityChanges()
    await otherTurn(t.assist, 'Any thoughts?', 0, 800)
    await t.classify(0, fail('timeout'))
    await ask(t, 1)
    await t.classify(1, fail('provider'))
    expect(t.assist.automaticUnavailable()).toBe(false)
    expect(t.availabilityChanges()).toBe(base)
    await ask(t, 2)
    await t.classify(2, fail('timeout'))
    expect(t.assist.automaticUnavailable()).toBe(true)
    expect(t.availabilityChanges()).toBe(base + 1)
    expect(t.logs.some((l) => l.includes('3 consecutive failures'))).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, 'Another one?', 40_000, 40_800, 9)
    expect(t.classifications).toHaveLength(3)
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'not-classified', reason: 'suspended' }),
    )
    await vi.advanceTimersByTimeAsync(CLASSIFIER_SUSPEND_MS)
    expect(t.assist.automaticUnavailable()).toBe(false)
    await otherTurn(t.assist, 'Thoughts now?', 80_000, 80_800, 10)
    expect(t.classifications).toHaveLength(4)
  })

  it('a successful classification resets the failure count', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Any thoughts?', 0, 800)
    await t.classify(0, fail('timeout'))
    await ask(t, 1)
    await t.classify(1, fail('timeout'))
    await ask(t, 2)
    await t.classify(2, t.none)
    await ask(t, 3)
    await t.classify(3, fail('timeout'))
    await ask(t, 4)
    await t.classify(4, fail('timeout'))
    expect(t.assist.automaticUnavailable()).toBe(false)
  })

  it('halt and start clear the failure count', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Any thoughts?', 0, 800)
    await t.classify(0, fail('timeout'))
    await ask(t, 1)
    await t.classify(1, fail('timeout'))
    t.assist.halt()
    t.assist.start()
    await ask(t, 2)
    await t.classify(2, fail('timeout'))
    expect(t.assist.automaticUnavailable()).toBe(false)
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
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'not-generated', reason: 'expired' }),
    )
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
      expect(diagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'invalidated',
          reason:
            invalidate === 'halt'
              ? 'stop-or-pause'
              : invalidate === 'connectionReset'
                ? 'connection-reset'
                : 'identity-change',
        }),
      )
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

  it('answers other addressees only when enabled, retaining cooldown', async () => {
    const t = setup()
    t.assist.setAnswerEveryQuestion(true)
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1000)
    await t.classify(0, { status: 'classified', kind: 'request', addressee: 'other' })
    expect(t.generations).toHaveLength(1)
    expect(t.generations[0].req.userContent).toContain('another participant')
    t.generations[0].d.resolve('Answer')
    await vi.advanceTimersByTimeAsync(0)
    await otherTurn(t.assist, 'What about the cost?', 1200, 2000)
    expect(t.classifications).toHaveLength(1)
    t.assist.setAnswerEveryQuestion(false)
  })

  it('does not answer a turn put to another participant', async () => {
    const t = setup()
    await otherTurn(t.assist, 'Sarah, can you share the numbers?', 0, 1_000)
    await t.classify(0, { status: 'classified', kind: 'request', addressee: 'other' })
    expect(t.generations).toHaveLength(0)
  })

  it('gives an open-floor question the conditional room guidance', async () => {
    const t = setup()
    await otherTurn(t.assist, 'So any questions about the use of these models?', 0, 1_500)
    await t.classify(0, { status: 'classified', kind: 'question', addressee: 'room' })
    expect(t.generations[0].req.userContent).toContain(
      'If it was put to the group as an open floor',
    )
  })

  it('shows the model what was already shown, and lets it decline', async () => {
    const t = setup()
    t.told.push({
      headline: 'I’ll verify AS9 writeback in sandbox after the catalog change.',
      detail: '',
    })
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

  it('Answer now carries the latest question, the told stories and a split window', async () => {
    const t = setup()
    t.window.push({ speaker: -1, isUser: true, text: 'Earlier federation story', tStartMs: 0 })
    t.window.push({
      speaker: 1,
      isUser: false,
      text: 'What services have you used?',
      tStartMs: 5_000,
    })
    t.window.push({ speaker: -1, isUser: true, text: 'Mostly S3 and', tStartMs: 7_000 })
    t.told.push({ headline: 'At Acme I ran the federation.', detail: 'Invoicing was mine.' })
    await otherTurn(t.assist, 'What services have you used?', 5_000, 6_500)
    t.assist.final(me('Mostly S3 and', 7_000, 7_800))
    await vi.advanceTimersByTimeAsync(30_000)
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content).toContain(
      'The most recent question (Me asked for an answer to it now):\nS2: What services have you used?',
    )
    expect(content).not.toContain('cut off')
    expect(content).toContain('- At Acme I ran the federation. / Invoicing was mine.')
    expect(content).not.toContain('<none>')
    const current = content.slice(content.indexOf('Current exchange'))
    expect(current).toContain('S2: What services have you used?\nMe: Mostly S3 and')
    expect(current).not.toContain('federation story')
  })

  it('Answer now pressed mid-question anchors on the open turn and says it may be cut off', () => {
    const t = setup()
    t.window.push({
      speaker: 1,
      isUser: false,
      text: 'Talk to me about some of the Node',
      tStartMs: 0,
    })
    t.assist.final(them('Talk to me about some of the Node', 0, 1_500))
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content).toContain('S2: Talk to me about some of the Node\nAnswer THAT question.')
    expect(content).toContain('It may still be cut off')
  })

  it('Answer now without a recent question answers from the rolling window as before', async () => {
    const t = setup()
    t.window.push({ speaker: 1, isUser: false, text: 'Can you explain it?' })
    await otherTurn(t.assist, 'Can you explain it?', 0, 800)
    await vi.advanceTimersByTimeAsync(ANSWER_NOW_QUESTION_MS + 1_000)
    t.assist.answerNow()
    const content = t.generations.at(-1)!.req.userContent
    expect(content.startsWith('Rolling transcript (most recent last):')).toBe(true)
    expect(content).not.toContain('The most recent question')
  })

  it('automatic answers split the window at the question they answer', async () => {
    const t = setup()
    t.window.push({ speaker: -1, isUser: true, text: 'Earlier federation story', tStartMs: 0 })
    t.window.push({ speaker: 1, isUser: false, text: 'How about AWS?', tStartMs: 5_000 })
    await otherTurn(t.assist, 'How about AWS?', 5_000, 6_000)
    await t.classify(0, t.question)
    const content = t.generations[0].req.userContent
    const background = content.slice(0, content.indexOf('Current exchange'))
    expect(background).toContain('Me: Earlier federation story')
    expect(background).not.toContain('How about AWS?')
    expect(content).toContain('Current exchange')
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

  it('names the question Me is answering in the next-point prompt', async () => {
    const t = setup({ coachWhileTalking: true })
    await otherTurn(t.assist, 'How did you deploy the service?', 0, 1_000)
    await t.classify(0, t.none)
    t.assist.final(me(words(25), 2_000, 12_000))
    t.assist.final(me(words(25), 12_000, 23_000))
    const content = t.generations.at(-1)!.req.userContent
    expect(content).toContain('Question Me is answering:\nS2: How did you deploy the service?')
    expect(content).toContain('Earlier conversation (background only')
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

describe('live assistance: stacked questions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => vi.useRealTimers())

  /** Q1 and Q2 arrive back to back, so Q1's pending classification is overtaken. */
  async function stackTwo(t: ReturnType<typeof setup>): Promise<void> {
    await otherTurn(t.assist, 'What is the delivery date?', 0, 800)
    await otherTurn(t.assist, 'Who owns the rollout?', 1_000, 1_800)
    await t.classify(0, t.question) // the overtaken classification is ignored
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(1, t.question)
  }

  it('carries overtaken questions into the one suggestion for the newest', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await stackTwo(t)
    expect(t.generations).toHaveLength(1)
    const content = t.generations[0].req.userContent
    expect(content).toContain('1. S2: What is the delivery date?')
    expect(content).toContain('2. S2: Who owns the rollout?')
    expect(content).toContain('Address EACH one')
  })

  it('caps the carried set at three questions', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    for (let i = 0; i < 5; i++)
      await otherTurn(t.assist, `Question number ${i}?`, i * 900, i * 900 + 700)
    await t.classify(0, t.question)
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(1, t.question)
    const content = t.generations[0].req.userContent
    expect(content).not.toContain('Question number 1?')
    for (const i of [2, 3, 4]) expect(content).toContain(`Question number ${i}?`)
  })

  it('does not re-ask questions an earlier suggestion covered', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await stackTwo(t)
    t.generations[0].d.resolve('**Both answered.**')
    await vi.advanceTimersByTimeAsync(0)
    await otherTurn(t.assist, 'Is the budget approved?', 5_000, 5_800)
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(2, t.question)
    const content = t.generations[1].req.userContent
    expect(content).toContain('Is the budget approved?')
    expect(content).not.toContain('delivery date')
    expect(content).not.toContain('Respond to these')
    expect(content).toContain('Respond to this completed turn')
  })

  it('carries questions that arrived while a suggestion was in flight', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'First one?', 0, 800)
    await t.classify(0, t.question) // generation 0 covers only the first
    await vi.advanceTimersByTimeAsync(1_000)
    await otherTurn(t.assist, 'Second one?', 2_000, 2_800)
    await otherTurn(t.assist, 'Third one?', 3_000, 3_800)
    await t.classify(1, t.question)
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(2, t.question)
    expect(t.generations).toHaveLength(1) // lane busy
    t.generations[0].d.resolve('**First.**')
    await vi.advanceTimersByTimeAsync(0)
    const content = t.generations[1].req.userContent
    expect(content).toContain('Questions to answer')
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'waiting', reason: 'busy-lane' }),
    )
    expect(t.generations[1].req.diagnostic?.turns).toHaveLength(2)
    expect(content).toContain('Second one?')
    expect(content).toContain('Third one?')
    expect(content).not.toContain('First one?')
  })

  it('forgets stacked questions once the user starts answering', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    await otherTurn(t.assist, 'What is the delivery date?', 0, 800)
    t.assist.final(me('Let me take those one at a time.', 1_000, 2_500))
    await vi.advanceTimersByTimeAsync(5_000)
    await t.classify(0, t.question) // the overtaken classification settles, ignored
    await otherTurn(t.assist, 'Who owns the rollout?', 9_000, 9_800)
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(1, t.question)
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'invalidated', reason: 'user-final' }),
    )
    expect(t.generations[0].req.userContent).not.toContain('delivery date')
  })

  it('leaves Answer now unchanged and clears what it answered', async () => {
    const t = setup({ nudgeCooldownSec: 0 })
    t.window.push({ speaker: 1, isUser: false, text: 'x' })
    await otherTurn(t.assist, 'What is the delivery date?', 0, 800)
    t.assist.answerNow()
    expect(t.generations[0].req.userContent).not.toContain('Questions to answer')
    expect(t.generations[0].req.maxTokens).toBe(1200)
    await otherTurn(t.assist, 'Who owns the rollout?', 3_000, 3_800)
    await t.classify(0, t.question) // the overtaken classification settles, ignored
    await vi.advanceTimersByTimeAsync(1_000)
    await t.classify(1, t.question)
    const ambient = t.generations.find((g) => g.req.maxTokens !== 1200)
    expect(ambient?.req.userContent).not.toContain('delivery date')
  })
})
