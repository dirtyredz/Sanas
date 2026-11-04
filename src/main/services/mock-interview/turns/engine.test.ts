import { describe, expect, it, vi } from 'vitest'
import { LiveEngine } from './engine'
import { IDLE_PROMPT_TEXT } from './answer-wait'
import { cannedInterviewer, createInterviewer, type Interviewer } from './interviewer'
import type { LivePlan } from '../plan'
import type { AssistRequest } from '../../assistant/types'

const plan: LivePlan = {
  version: 1,
  mode: 'live',
  name: 'Test',
  persona: 'Client',
  durationMs: 20000,
  silenceMs: 4000,
  topics: [
    { id: 'a', question: 'When can we ship?', maxFollowUps: 1 },
    { id: 'b', question: 'What does this screen show?', maxFollowUps: 0, screen: 'architecture' },
  ],
}
const longPlan: LivePlan = { ...plan, durationMs: 300000 }
function setup(provider: Interviewer = cannedInterviewer, p: LivePlan = plan) {
  let now = 0
  const speak = vi.fn(async () => {}),
    share = vi.fn(async () => {})
  const engine = new LiveEngine(p, provider, { now: () => now, speak, share })
  return {
    engine,
    speak,
    share,
    time: (n: number) => {
      now = n
      engine.tick()
    },
  }
}
describe('live turn-taking', () => {
  it('retains late loopback finals for their audio window even after End', async () => {
    let audio = 0
    const engine = new LiveEngine(plan, cannedInterviewer, {
      now: () => audio,
      audioNow: () => audio,
      speak: async () => {},
      share: async () => {},
    })
    engine.start()
    await engine.settled()
    audio = 5000
    engine.skip()
    await engine.settled()
    engine.end()
    engine.final('interviewer', 'When can we ship?', 100, 1000)
    expect(engine.turns[0].spans).toEqual([{ startMs: 100, endMs: 1000 }])
    expect(engine.turns[1].spans).toEqual([])
  })
  it('bounds a hung interviewer, aborts its call and uses the next planned question', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    try {
      const { engine } = setup({
        next: (_r, s) => {
          signal = s
          return new Promise(() => {})
        },
      })
      engine.start()
      await vi.advanceTimersByTimeAsync(12500)
      await engine.settled()
      expect(signal?.aborted).toBe(true)
      expect(engine.turns[0]).toMatchObject({ fallback: true, text: plan.topics[0].question })
      engine.end()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('requires an owner final and silence; activity postpones the next question', async () => {
    const { engine, time, speak, share } = setup()
    engine.start()
    await engine.settled()
    time(3000)
    expect(speak).toHaveBeenCalledTimes(1)
    engine.final('owner', 'We can ship Friday.', 10, 20)
    time(5000)
    engine.activity()
    time(8000)
    expect(speak).toHaveBeenCalledTimes(1)
    time(9000)
    await engine.settled()
    expect(speak).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenCalledWith('architecture')
    expect(share.mock.invocationCallOrder[0]).toBeLessThan(speak.mock.invocationCallOrder[1])
  })
  it('never advances while the candidate has not spoken, even after 10 s', async () => {
    const { engine, time, speak } = setup()
    engine.start()
    await engine.settled()
    engine.activity() // raw mic activity alone does not start an answer
    time(10000)
    expect(speak).toHaveBeenCalledTimes(1)
    engine.final('interviewer', 'Anyone there?', 10, 20) // interviewer speech never counts
    time(19000)
    expect(speak).toHaveBeenCalledTimes(1)
  })
  it('advances 4 s after the candidate stops; interim speech starts and a resumed answer resets', async () => {
    const { engine, time, speak } = setup()
    engine.start()
    await engine.settled()
    time(1000)
    engine.candidateSpeech()
    time(4999)
    expect(speak).toHaveBeenCalledTimes(1)
    engine.candidateSpeech() // resumes at 4999: timer restarts from here
    time(8998)
    expect(speak).toHaveBeenCalledTimes(1)
    time(8999)
    await engine.settled()
    expect(speak).toHaveBeenCalledTimes(2)
  })
  it('prompts once after 30 s of candidate silence, then keeps waiting; skip still works', async () => {
    const { engine, time, speak } = setup(cannedInterviewer, longPlan)
    engine.start()
    await engine.settled()
    time(29999)
    expect(speak).toHaveBeenCalledTimes(1)
    time(30000)
    await engine.settled()
    expect(speak).toHaveBeenCalledTimes(2)
    expect((speak.mock.calls[1] as unknown[])[0]).toBe(IDLE_PROMPT_TEXT)
    expect(engine.turns).toHaveLength(1)
    time(60000)
    time(90000)
    expect(speak).toHaveBeenCalledTimes(2)
    expect(engine.state).toBe('waiting')
    engine.skip()
    await engine.settled()
    expect(engine.turns).toHaveLength(2)
  })
  it('skip during the idle prompt aborts it and moves on', async () => {
    let release!: () => void
    const speak = vi
      .fn<(t: string, s: AbortSignal) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined)
    let now = 0
    const engine = new LiveEngine(longPlan, cannedInterviewer, {
      now: () => now,
      speak,
      share: async () => {},
    })
    engine.start()
    await engine.settled()
    now = 30000
    engine.tick()
    expect(engine.state).toBe('speaking')
    engine.skip()
    release()
    await engine.settled()
    await engine.settled()
    expect(engine.turns.map((t) => t.topicId)).toEqual(['a', 'b'])
  })
  it('caps follow-ups, preserves plan order and shares only when entering a topic', async () => {
    const next = vi.fn(async (r) =>
      r.allowFollowUp
        ? { action: 'follow-up' as const, text: 'Why Friday?' }
        : { action: 'next' as const, text: r.next?.question ?? 'Done' },
    )
    const { engine, time, share } = setup({ next })
    engine.start()
    await engine.settled()
    engine.final('owner', 'Friday.', 10, 20)
    time(4000)
    await engine.settled()
    engine.final('owner', 'Testing finishes then.', 30, 40)
    time(9000)
    await engine.settled()
    expect(engine.turns.map((t) => [t.topicId, t.followUp])).toEqual([
      ['a', false],
      ['a', true],
      ['b', false],
    ])
    expect(share).toHaveBeenCalledTimes(1)
    engine.final('owner', 'The dashboard.', 50, 60)
    time(13000)
    await engine.settled()
    expect(engine.endReason).toBe('plan-complete')
  })
  it('falls back to the next verbatim planned question on provider failure', async () => {
    const { engine } = setup({
      next: async () => {
        throw new Error('offline')
      },
    })
    engine.start()
    await engine.settled()
    expect(engine.turns[0]).toMatchObject({ text: plan.topics[0].question, fallback: true })
    engine.skip()
    await engine.settled()
    expect(engine.turns[1]).toMatchObject({
      topicId: 'b',
      text: plan.topics[1].question,
      fallback: true,
    })
  })
  it('skip bypasses silence and follow-ups; end and the duration limit stop further speech', async () => {
    const { engine, time, speak } = setup()
    engine.start()
    await engine.settled()
    engine.skip()
    await engine.settled()
    expect(speak).toHaveBeenCalledTimes(2)
    time(20000)
    expect(engine.endReason).toBe('duration')
    engine.skip()
    time(25000)
    expect(speak).toHaveBeenCalledTimes(2)
  })
  it('end cancels a pending provider even when it ignores cancellation', async () => {
    const { engine, speak } = setup({ next: () => new Promise(() => {}) })
    engine.start()
    engine.end()
    await engine.settled()
    expect(speak).not.toHaveBeenCalled()
    expect(engine.endReason).toBe('owner')
  })
  it('skip cancels an in-flight call without letting its late answer speak', async () => {
    let calls = 0
    const { engine, speak } = setup({
      next: (r) =>
        ++calls === 1
          ? new Promise(() => {})
          : Promise.resolve({ action: 'next', text: r.next!.question }),
    })
    engine.start()
    engine.skip()
    await engine.settled()
    await engine.settled()
    expect(speak).toHaveBeenCalledTimes(1)
    engine.end()
  })
  it('reset discards owner-final eligibility and interviewer finals never advance the plan', async () => {
    const { engine, time, speak } = setup()
    engine.start()
    await engine.settled()
    engine.final('owner', 'Yes.', 1, 2)
    engine.reset()
    engine.final('interviewer', 'When?', 3, 4)
    time(9000)
    expect(speak).toHaveBeenCalledTimes(1)
    expect(engine.turns[0].spans).toEqual([{ startMs: 3, endMs: 4 }])
  })
})

it('interviewer projects only plan and conversation; no suggestions or hidden request fields', async () => {
  const complete = vi.fn(
    async (_req: AssistRequest) => '{"action":"next","text":"When can we ship?"}',
  )
  const interviewer = createInterviewer({ complete }, { apiKey: 'stub', model: 'stub' })
  await interviewer.next(
    {
      persona: 'Client',
      next: plan.topics[0],
      allowFollowUp: false,
      finals: [{ role: 'owner', text: 'Friday.', suggestion: 'SECRET' }],
      suggestions: 'SECRET',
    } as never,
    new AbortController().signal,
  )
  const req = complete.mock.calls[0][0]
  expect(JSON.stringify(req)).not.toContain('SECRET')
  expect(req.userContent).toContain('Friday.')
  expect(req.maxRetries).toBe(0)
})
