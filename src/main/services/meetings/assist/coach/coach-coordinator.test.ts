import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { me, otherTurn, setup, them, words } from '../automatic/live-assistance-harness'

const diagnostics = vi.hoisted(() => vi.fn())
vi.mock('../../observation/diagnostics', () => ({ observeAssistance: diagnostics }))
beforeEach(() => diagnostics.mockClear())

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

  it('cancels pending coaching and excludes uncertain speech until confirmation', async () => {
    const t = setup({ coachWhileTalking: true })
    explain(t)
    expect(t.generations).toHaveLength(1)
    t.assist.setIdentityNeedsConfirmation(true)
    expect(t.generations[0].req.signal?.aborted).toBe(true)
    t.generations[0].d.resolve('Obsolete next point')
    await vi.advanceTimersByTimeAsync(0)
    t.assist.final(me(words(50), 22000, 45000))
    await vi.advanceTimersByTimeAsync(30000)
    expect(t.generations).toHaveLength(1)
    expect(t.events).toEqual([])
    t.assist.setIdentityNeedsConfirmation(false)
    t.assist.final(me(words(50), 46000, 70000))
    expect(t.generations).toHaveLength(2)
    t.assist.halt()
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
